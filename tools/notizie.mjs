#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════
   notizie.mjs — rassegna stampa filtrata sulla tua libreria

   Legge un pugno di feed RSS gratuiti e tiene solo gli
   articoli che nominano un film, un regista o un attore che
   hai in libreria. Scrive data/notizie.json.

   Nessuna chiave, nessun abbonamento: solo RSS pubblici.
   Uso: node tools/notizie.mjs
   ══════════════════════════════════════════════════════════ */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FONTI = [
  { nome: 'BadTaste',     url: 'https://www.badtaste.it/feed/',              lingua: 'it' },
  { nome: 'MoviePlayer',  url: 'https://www.movieplayer.it/rss/news.xml',    lingua: 'it' },
  { nome: 'Everyeye',     url: 'https://cinema.everyeye.it/rss/news.xml',    lingua: 'it' },
  { nome: 'Ciak',         url: 'https://www.ciakmagazine.it/feed/',          lingua: 'it' },
  { nome: 'Variety',      url: 'https://variety.com/v/film/feed/',           lingua: 'en' },
  { nome: 'Deadline',     url: 'https://deadline.com/v/film/feed/',          lingua: 'en' },
  { nome: 'IndieWire',    url: 'https://www.indiewire.com/feed/',            lingua: 'en' },
  { nome: 'THR',          url: 'https://www.hollywoodreporter.com/c/movies/feed/', lingua: 'en' }
];

const GIORNI = 21;   // oltre, non è più notizia

/* ── parsing RSS senza dipendenze ────────────────────── */
function ripulisci(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const campo = (blocco, tag) => {
  const m = blocco.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? ripulisci(m[1]) : '';
};

function leggiFeed(xml, fonte) {
  const blocchi = xml.split(/<item[\s>]/i).slice(1);
  return blocchi.map(b => {
    const data = campo(b, 'pubDate') || campo(b, 'dc:date');
    return {
      titolo: campo(b, 'title'),
      link: (b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '').trim(),
      sommario: campo(b, 'description').slice(0, 260),
      data: data ? new Date(data).toISOString() : null,
      fonte: fonte.nome,
      lingua: fonte.lingua
    };
  }).filter(x => x.titolo && x.link);
}

/* ── chi e cosa sorvegliare ──────────────────────────── */
function entita(movies) {
  const e = new Map();
  const aggiungi = (nome, tipo, film) => {
    if (!nome || nome.length < 5) return;          // nomi troppo corti danno falsi positivi
    const k = nome.toLowerCase();
    if (!e.has(k)) e.set(k, { nome, tipo, film: new Set(), compagni: new Set() });
    const v = e.get(k);
    v.film.add(film.title);
    // Chi gravita attorno a questo titolo: serve a disambiguare più sotto.
    if (tipo === 'film') {
      if (film.director) v.compagni.add(film.director.toLowerCase());
      for (const c of (film.castDetail || []).slice(0, 6)) v.compagni.add(c.name.toLowerCase());
    }
  };

  for (const m of movies) {
    aggiungi(m.title, 'film', m);
    if (m.originalTitle && m.originalTitle !== m.title) aggiungi(m.originalTitle, 'film', m);
    aggiungi(m.director, 'regista', m);
    for (const c of (m.castDetail || []).slice(0, 6)) aggiungi(c.name, 'attore', m);
  }
  return e;
}

/* Riconoscimento a parole intere: "Michael" non deve agganciarsi
   dentro "Michael B. Jordan". */
const paroleIntere = (testo, ago) => {
  const fuga = ago.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${fuga}([^\\p{L}\\p{N}]|$)`, 'iu').test(testo);
};

/* Un titolo di una sola parola è ambiguo per natura ("Michael",
   "Obsession"): lo accetto solo se l'articolo nomina anche
   qualcuno di quel film. */
function pertinente(testo, v) {
  if (!paroleIntere(testo, v.nome)) return false;
  const unaParola = !/\s/.test(v.nome.trim());
  if (v.tipo !== 'film' || !unaParola || v.nome.length > 12) return true;
  return [...v.compagni].some(c => paroleIntere(testo, c));
}

/* ── main ────────────────────────────────────────────── */
const catalogo = JSON.parse(await readFile(join(ROOT, 'data', 'movies.json'), 'utf8'));
const sorvegliati = entita(catalogo.movies);
console.log(`Sorveglio ${sorvegliati.size} fra titoli, registi e attori.`);

const articoli = [];
for (const f of FONTI) {
  try {
    const res = await fetch(f.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Cineteca/1.0)' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) { console.warn(`  ✗ ${f.nome}: HTTP ${res.status}`); continue; }
    const trovati = leggiFeed(await res.text(), f);
    articoli.push(...trovati);
    console.log(`  ✓ ${f.nome}: ${trovati.length} articoli`);
  } catch (err) {
    console.warn(`  ✗ ${f.nome}: ${err.message}`);
  }
}

const limite = Date.now() - GIORNI * 86400000;

const notizie = [];
for (const a of articoli) {
  if (a.data && new Date(a.data).getTime() < limite) continue;

  const testo = `${a.titolo} ${a.sommario}`;
  const citati = [];
  for (const v of sorvegliati.values()) {
    if (pertinente(testo, v)) citati.push(v);
  }
  if (!citati.length) continue;

  // Il titolo dell'articolo pesa più del sommario: è lì che sta la notizia.
  const inTitolo = citati.filter(c => paroleIntere(a.titolo, c.nome));

  notizie.push({
    ...a,
    citati: citati.map(c => ({ nome: c.nome, tipo: c.tipo, film: [...c.film] })),
    rilievo: inTitolo.length * 3 + citati.length
  });
}

// Stessa notizia su più testate: tengo la prima.
const viste = new Set();
const finali = notizie
  .sort((a, b) => b.rilievo - a.rilievo || String(b.data).localeCompare(String(a.data)))
  .filter(n => {
    const impronta = n.titolo.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 45);
    if (viste.has(impronta)) return false;
    viste.add(impronta);
    return true;
  })
  .slice(0, 40);

await writeFile(join(ROOT, 'data', 'notizie.json'),
  JSON.stringify({ aggiornato: new Date().toISOString(), fonti: FONTI.map(f => f.nome), notizie: finali }, null, 2) + '\n');

console.log(`\n✅ data/notizie.json — ${finali.length} notizie pertinenti su ${articoli.length} articoli letti.`);
finali.slice(0, 8).forEach(n =>
  console.log(`  · [${n.fonte}] ${n.titolo.slice(0, 78)}\n      → ${n.citati.map(c => c.nome).slice(0, 3).join(', ')}`));
