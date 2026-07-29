#!/usr/bin/env node
/* Cerca su TMDB i titoli di data/lista.json e stampa i candidati,
   così le corrispondenze si verificano a occhio prima di fissarle.
   Uso: node tools/risolvi.mjs */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = await readFile(join(ROOT, '.env.local'), 'utf8');
const KEY = env.match(/^\s*TMDB_KEY\s*=\s*(.+?)\s*$/m)[1];

async function cerca(q, anno) {
  const url = new URL('https://api.themoviedb.org/3/search/movie');
  url.searchParams.set('api_key', KEY);
  url.searchParams.set('language', 'it-IT');
  url.searchParams.set('query', q);
  if (anno) url.searchParams.set('primary_release_year', anno);
  const r = await fetch(url);
  return (await r.json()).results || [];
}

const lista = JSON.parse(await readFile(join(ROOT, 'data', 'lista.json'), 'utf8'));

for (const voce of lista) {
  const q = typeof voce === 'string' ? voce : voce.q;
  let res = await cerca(q, 2026);
  if (!res.length) res = await cerca(q);
  console.log(`\n■ ${q}`);
  if (!res.length) { console.log('   nessun risultato'); continue; }
  res.slice(0, 4).forEach((m, i) =>
    console.log(`   ${i === 0 ? '→' : ' '} ${m.id} | ${m.title} / ${m.original_title} | ${m.release_date || 'senza data'} | pop ${Math.round(m.popularity)}`));
}
