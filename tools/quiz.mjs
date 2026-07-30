#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════
   quiz.mjs — "hai visto questi?"

   Costruisce l'elenco dei film usciti al cinema in Italia in un
   dato anno, esclusi quelli già in libreria, ordinati per quanto
   è probabile che tu li abbia visti: popolarità in sala + affinità
   con i gusti che emergono dai film già segnati come visti.

   Uso: node tools/quiz.mjs [anno] [quanti]
        node tools/quiz.mjs 2025 60
   ══════════════════════════════════════════════════════════ */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANNO = Number(process.argv[2]) || 2025;
const QUANTI = Number(process.argv[3]) || 60;

const env = await readFile(join(ROOT, '.env.local'), 'utf8');
const KEY = env.match(/^\s*TMDB_KEY\s*=\s*(.+?)\s*$/m)[1];

async function tmdb(path, params = {}, tentativi = 3) {
  const url = new URL('https://api.themoviedb.org/3' + path);
  url.searchParams.set('api_key', KEY);
  url.searchParams.set('language', 'it-IT');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let i = 1; i <= tentativi; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`TMDB ${res.status}`);
      return await res.json();
    } catch (err) {
      // La rete cade: aspetto un po' di più a ogni giro invece di arrendermi.
      if (i === tentativi) throw err;
      await new Promise(r => setTimeout(r, 800 * i));
    }
  }
}

/* ── il profilo, dai film che hai già segnato ────────── */
const catalogo = JSON.parse(await readFile(join(ROOT, 'data', 'movies.json'), 'utf8'));
const visti = catalogo.movies.filter(m => m.lista === 'visto');
const giaDentro = new Set(catalogo.movies.map(m => m.tmdbId).filter(Boolean));

const conta = (lista, chiave) => {
  const c = new Map();
  for (const m of lista) for (const k of chiave(m)) if (k) c.set(k, (c.get(k) || 0) + 1);
  return c;
};
const generiAmati  = conta(visti, m => m.genres || []);
const registiAmati = conta(visti, m => [m.director]);
const attoriAmati  = conta(visti, m => (m.castDetail || []).slice(0, 6).map(c => c.name));

/* ── i candidati: usciti in sala in Italia quell'anno ── */
const candidati = new Map();
for (let pagina = 1; pagina <= 6; pagina++) {
  const d = await tmdb('/discover/movie', {
    'primary_release_date.gte': `${ANNO}-01-01`,
    'primary_release_date.lte': `${ANNO}-12-31`,
    region: 'IT',
    with_release_type: '3|2',          // sala e uscita limitata, niente streaming diretto
    sort_by: 'popularity.desc',
    'vote_count.gte': 40,
    include_adult: 'false',
    page: pagina
  });
  for (const f of d.results || []) if (!giaDentro.has(f.id)) candidati.set(f.id, f);
  if (pagina >= (d.total_pages || 1)) break;
}

/* ── quanto è probabile che tu l'abbia visto ─────────── */
const GENERI = await tmdb('/genre/movie/list');
const nomeGenere = Object.fromEntries((GENERI.genres || []).map(g => [g.id, g.name]));

const valutati = [...candidati.values()].map(f => {
  const generi = (f.genre_ids || []).map(id => nomeGenere[id]).filter(Boolean);
  let affinita = 0;
  for (const g of generi) affinita += (generiAmati.get(g) || 0) * 3;
  // La popolarità in sala conta: i film molto visti li ha visti anche lui, probabilmente.
  const richiamo = Math.log10((f.vote_count || 1) + 1) * 6 + (f.popularity || 0) / 40;
  return { f, generi, punti: affinita + richiamo };
}).sort((a, b) => b.punti - a.punti).slice(0, QUANTI);

/* ── uscita ──────────────────────────────────────────── */
const righe = valutati.map((v, i) => ({
  n: i + 1,
  tmdbId: v.f.id,
  titolo: v.f.title,
  originale: v.f.original_title !== v.f.title ? v.f.original_title : null,
  uscita: v.f.release_date || null,
  generi: v.generi,
  voto: v.f.vote_average ? Number(v.f.vote_average.toFixed(1)) : null
}));

await writeFile(join(ROOT, 'data', `quiz-${ANNO}.json`), JSON.stringify({ anno: ANNO, film: righe }, null, 2) + '\n');

console.log(`\n═══ USCITI AL CINEMA IN ITALIA NEL ${ANNO} — ${righe.length} titoli ═══`);
console.log(`Profilo: ${[...generiAmati.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([g,n])=>`${g} (${n})`).join(', ')}\n`);
righe.forEach(r => {
  const mese = r.uscita ? r.uscita.slice(5, 7) : '??';
  console.log(`${String(r.n).padStart(2)}. ${r.titolo}${r.originale ? ` (${r.originale})` : ''}`
    + `  ·  ${mese}/${ANNO}  ·  ${r.generi.slice(0, 2).join('/')}${r.voto ? `  ·  ${r.voto}` : ''}`);
});
console.log(`\nElenco salvato in data/quiz-${ANNO}.json`);
