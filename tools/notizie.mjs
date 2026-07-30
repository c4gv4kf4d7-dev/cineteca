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

/* Solo testate italiane: le notizie in inglese non le vuole leggere.
   Poche e buone — la copertura la dà il numero di articoli, non di siti. */
const FONTI = [
  { nome: 'BadTaste',       url: 'https://www.badtaste.it/feed/' },
  { nome: 'MoviePlayer',    url: 'https://www.movieplayer.it/rss/news.xml' },
  { nome: 'ScreenWeek',     url: 'https://www.screenweek.it/feed' },
  { nome: 'Everyeye',       url: 'https://cinema.everyeye.it/rss/news.xml' },
  { nome: 'Cinefilos',      url: 'https://www.cinefilos.it/feed' },
  { nome: 'Fumettologica',  url: 'https://fumettologica.it/feed/' }
];

const MAX_SOGGETTI = 10;   // quanti temi mostrare, oltre ai 3 in evidenza
const MAX_PER_SOGGETTO = 3;

const GIORNI = 21;      // oltre, un articolo non è più notizia
const MEMORIA = 30;     // per quanto conservo l'archivio accumulato

/* Le prevendite non hanno un'API: le annunciano le testate.
   Questi sono i modi in cui lo scrivono. */
const SPIE_PREVENDITA = [
  'prevendit', 'prevendite aperte', 'biglietti disponibili', 'biglietti in vendita',
  'acquista il biglietto', 'porte aperte', 'on sale now', 'tickets on sale',
  'presale', 'pre-sale', 'in prevendita'
];

/* Parole che segnalano una notizia "di servizio": quelle che se ti
   sfuggono cambiano i tuoi piani, non solo il tuo umore. */
const PESANTI = [
  'rinviat', 'rimandat', 'slitta', 'posticipat', 'anticipat', 'nuova data', 'data d\'uscita',
  'prevendit', 'al cinema dal', 'in sala dal', 'uscita italiana',
  'trailer', 'teaser', 'prime immagini', 'annuncia', 'annunciato', 'confermato',
  'oscar', 'candidatur', 'nomination', 'vince', 'premio', 'festival',
  'cancellat', 'sequel', 'riedizione', 'box office', 'incasso', 'incassi',
  'delayed', 'release date', 'first look', 'announces'
];

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
/* Le testate non scrivono mai il titolo esatto del database:
   "The Batman: Part II" diventa "The Batman 2", "The Batman - Parte II".
   Genero le varianti plausibili, altrimenti la notizia sfugge. */
const ROMANI = { i:'1', ii:'2', iii:'3', iv:'4', v:'5', vi:'6', vii:'7', viii:'8', ix:'9', x:'10' };

function normalizza(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function alias(titolo) {
  const base = normalizza(titolo);
  const varianti = new Set([base]);

  // via il sottotitolo dopo i due punti o il trattino
  const tagliato = normalizza(titolo.split(/[:–—]| - /)[0]);
  if (tagliato.length >= 5) varianti.add(tagliato);

  for (const v of [...varianti]) {
    const parole = v.split(' ');

    // "part"/"parte" è rumore: "the batman part ii" ≡ "the batman ii"
    const senzaParte = parole.filter(p => p !== 'part' && p !== 'parte').join(' ');
    if (senzaParte.length >= 5) varianti.add(senzaParte);

    // numeri romani ⇄ arabi, in entrambe le forme
    for (const forma of [v, senzaParte]) {
      const p = forma.split(' ');
      const ultima = p.at(-1);
      if (ROMANI[ultima]) varianti.add([...p.slice(0, -1), ROMANI[ultima]].join(' '));
      const romano = Object.keys(ROMANI).find(k => ROMANI[k] === ultima);
      if (romano) varianti.add([...p.slice(0, -1), romano].join(' '));
      // "the batman part ii" → anche "the batman parte ii"
      if (forma.includes(' part ')) varianti.add(forma.replace(' part ', ' parte '));
      if (forma.includes(' parte ')) varianti.add(forma.replace(' parte ', ' part '));
    }
  }

  return [...varianti].filter(v => v.length >= 5);
}

/* Chi vale la pena sorvegliare, e con quanta larghezza.

   Il difetto della versione precedente era proprio qui: teneva
   d'occhio ogni attore di ogni film, quindi qualunque articolo che
   nominasse un attore qualsiasi entrava. Risultato: pettegolezzi,
   reality, film che non c'entrano nulla.

   Ora la soglia è netta:
   · i FILM in libreria: sempre
   · i REGISTI: solo se ne hai visti almeno due
   · gli ATTORI: solo i ricorrenti, almeno tre film                */
function entita(movies) {
  const visti = movies.filter(m => m.lista === 'visto');

  const conteggio = (lista, chiave) => {
    const c = new Map();
    for (const m of lista) for (const k of chiave(m)) if (k) c.set(k, (c.get(k) || 0) + 1);
    return c;
  };
  const registiVisti = conteggio(visti, m => [m.director]);
  const attoriVisti  = conteggio(visti, m => (m.castDetail || []).slice(0, 6).map(c => c.name));

  const e = new Map();
  const aggiungi = (nome, tipo, film, varianti = null) => {
    if (!nome || nome.length < 5) return;
    const k = normalizza(nome);
    if (k.length < 5) return;
    if (!e.has(k)) e.set(k, { nome, tipo, film: new Set(), compagni: new Set(), alias: new Set([k]) });
    const v = e.get(k);
    v.film.add(film.title);
    for (const a of varianti || []) v.alias.add(a);
    if (tipo === 'film') {
      if (film.director) v.compagni.add(normalizza(film.director));
      for (const c of (film.castDetail || []).slice(0, 8)) v.compagni.add(normalizza(c.name));
    }
  };

  for (const m of movies) {
    aggiungi(m.title, 'film', m, alias(m.title));
    if (m.originalTitle && m.originalTitle !== m.title)
      aggiungi(m.originalTitle, 'film', m, alias(m.originalTitle));
    if (m.director && (registiVisti.get(m.director) || 0) >= 2) aggiungi(m.director, 'regista', m);
    for (const c of (m.castDetail || []).slice(0, 6))
      if ((attoriVisti.get(c.name) || 0) >= 3) aggiungi(c.name, 'attore', m);
  }

  console.log(`  registi sorvegliati: ${[...e.values()].filter(v => v.tipo === 'regista').map(v => v.nome).join(', ') || '—'}`);
  console.log(`  attori sorvegliati:  ${[...e.values()].filter(v => v.tipo === 'attore').map(v => v.nome).join(', ') || '—'}`);
  return e;
}

/* Riconoscimento a parole intere: "Michael" non deve agganciarsi
   dentro "Michael B. Jordan". Il testo arriva già normalizzato. */
const paroleIntere = (testo, ago) => {
  const fuga = ago.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${fuga}([^\\p{L}\\p{N}]|$)`, 'u').test(testo);
};

/* Un titolo di una sola parola è ambiguo per natura ("Michael",
   "Obsession"): lo accetto solo se l'articolo nomina anche
   qualcuno di quel film. */
function pertinente(testo, v) {
  const colpito = [...v.alias].find(a => paroleIntere(testo, a));
  if (!colpito) return false;
  const unaParola = !/\s/.test(colpito.trim());
  if (v.tipo !== 'film' || !unaParola || colpito.length > 12) return true;
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

  const testo = normalizza(`${a.titolo} ${a.sommario}`);
  const soloTitolo = normalizza(a.titolo);

  const citati = [];
  for (const v of sorvegliati.values()) {
    if (pertinente(testo, v)) citati.push(v);
  }
  if (!citati.length) continue;

  // Il titolo dell'articolo pesa più del sommario: è lì che sta la notizia.
  const inTitolo = citati.filter(c => [...c.alias].some(a2 => paroleIntere(soloTitolo, a2)));

  const parolaPesante = PESANTI.some(p => soloTitolo.includes(p));
  const parlaDiPrevendite = SPIE_PREVENDITA.some(p => testo.includes(p));

  /* Un articolo entra solo se il soggetto è nel TITOLO: se il tuo film
     è nominato di sfuggita a metà sommario, non è una notizia su di lui. */
  if (!inTitolo.length) continue;

  // Il soggetto è il film citato nel titolo; se non c'è, la persona.
  const principale = inTitolo.find(c => c.tipo === 'film') || inTitolo[0];

  notizie.push({
    ...a,
    soggetto: principale.nome,
    soggettoTipo: principale.tipo,
    citati: inTitolo.map(c => ({ nome: c.nome, tipo: c.tipo })),
    rilievo: (principale.tipo === 'film' ? 6 : 2) + inTitolo.length
      + (parolaPesante ? 4 : 0) + (parlaDiPrevendite ? 6 : 0),
    prevendite: parlaDiPrevendite,
    vistoIl: new Date().toISOString()
  });
}

/* ── archivio: le notizie si accumulano, non si sostituiscono ──
   Un feed RSS tiene solo gli ultimi articoli: senza memoria, una
   notizia importante sparirebbe dopo pochi giorni. */
let archivio = [];
try {
  const vecchio = JSON.parse(await readFile(join(ROOT, 'data', 'notizie.json'), 'utf8'));
  archivio = vecchio.notizie || [];
} catch { /* prima esecuzione */ }

// Le testate rimosse dall'elenco non devono sopravvivere nell'archivio.
const attive = new Set(FONTI.map(f => f.nome));
archivio = archivio.filter(n => attive.has(n.fonte) && n.soggetto);

const perLink = new Map(archivio.map(n => [n.link, n]));
let inedite = 0;
for (const n of notizie) {
  if (perLink.has(n.link)) {
    // Già vista: aggiorno il punteggio ma conservo quando è comparsa.
    const prima = perLink.get(n.link);
    perLink.set(n.link, { ...n, vistoIl: prima.vistoIl });
  } else {
    perLink.set(n.link, n);
    inedite++;
  }
}

const scadenza = Date.now() - MEMORIA * 86400000;
const eta = n => new Date(n.data || n.vistoIl).getTime();

// Stessa notizia su più testate: tengo quella con il rilievo più alto.
const impronte = new Map();
for (const n of [...perLink.values()].sort((a, b) => b.rilievo - a.rilievo)) {
  if (eta(n) < scadenza) continue;
  const impronta = normalizza(n.titolo).replace(/\s/g, '').slice(0, 45);
  if (!impronte.has(impronta)) impronte.set(impronta, n);
}

const tutte = [...impronte.values()].sort((a, b) => eta(b) - eta(a));

/* Le tre più importanti della settimana restano ancorate: se non apri
   l'app per qualche giorno, le ritrovi comunque in cima. */
const settimana = Date.now() - 7 * 86400000;
const evidenza = tutte
  .filter(n => eta(n) >= settimana)
  .sort((a, b) => b.rilievo - a.rilievo || eta(b) - eta(a))
  .slice(0, 3);
const inEvidenza = new Set(evidenza.map(n => n.link));
for (const n of tutte) n.evidenza = inEvidenza.has(n.link);

/* Raggruppo per soggetto e taglio: dieci temi, poche notizie ciascuno.
   Otto pezzi su Spider-Man sono un tema solo, non otto notizie. */
const perSoggetto = new Map();
for (const n of tutte) {
  if (n.evidenza) continue;                       // le ancorate stanno per conto loro
  if (!perSoggetto.has(n.soggetto)) perSoggetto.set(n.soggetto, []);
  perSoggetto.get(n.soggetto).push(n);
}

const gruppi = [...perSoggetto.entries()]
  .map(([soggetto, voci]) => ({
    soggetto,
    tipo: voci[0].soggettoTipo,
    quante: voci.length,
    // Il pezzo più rilevante apre il gruppo, poi i più recenti.
    voci: [voci.sort((a, b) => b.rilievo - a.rilievo)[0],
           ...voci.slice(1).sort((a, b) => eta(b) - eta(a))].slice(0, MAX_PER_SOGGETTO)
  }))
  .sort((a, b) => eta(b.voci[0]) - eta(a.voci[0]))
  .slice(0, MAX_SOGGETTI);

const finali = [...evidenza, ...gruppi.flatMap(g => g.voci)];

/* ── segnalazioni di prevendita ──────────────────────────
   Nessuna API le espone: le annunciano le testate. Qui isolo
   gli articoli che ne parlano riferendosi a un film che hai in
   lista e che non ha ancora una data di prevendita registrata. */
const senzaPrevendita = new Map(
  catalogo.movies
    .filter(m => m.lista === 'cinema' && !m.prevendita && (!m.release || new Date(m.release) > new Date()))
    .map(m => [normalizza(m.title), m])
);

const segnalazioni = [];
for (const n of tutte.filter(x => x.prevendite)) {
  for (const c of n.citati) {
    if (c.tipo !== 'film') continue;
    const m = senzaPrevendita.get(normalizza(c.nome));
    if (!m) continue;
    if (segnalazioni.some(s => s.id === m.id)) continue;
    segnalazioni.push({ id: m.id, film: m.title, uscita: m.release, titolo: n.titolo, fonte: n.fonte, link: n.link });
  }
}

await writeFile(join(ROOT, 'data', 'notizie.json'),
  JSON.stringify({
    aggiornato: new Date().toISOString(),
    fonti: FONTI.map(f => f.nome),
    segnalazioniPrevendita: segnalazioni,
    evidenza: evidenza.map(n => n.link),
    gruppi: gruppi.map(g => ({ soggetto: g.soggetto, tipo: g.tipo, quante: g.quante,
                               link: g.voci.map(v => v.link) })),
    notizie: finali
  }, null, 2) + '\n');

console.log(`\n✅ data/notizie.json — ${finali.length} notizie in ${gruppi.length} temi + ${evidenza.length} in evidenza, su ${articoli.length} articoli letti.`);
if (segnalazioni.length) {
  console.log('\n🎫 POSSIBILI PREVENDITE — da verificare e registrare a mano:');
  segnalazioni.forEach(s =>
    console.log(`  · ${s.film} (esce ${s.uscita})\n      [${s.fonte}] ${s.titolo.slice(0, 70)}\n      ${s.link}`));
}

console.log('\n★ In evidenza questa settimana:');
evidenza.forEach(n => console.log(`  · [${n.fonte}] ${n.titolo.slice(0, 76)}\n      → ${n.citati.map(c => c.nome).slice(0, 3).join(', ')} · rilievo ${n.rilievo}`));
