#!/usr/bin/env node
/* Aggiunge a data/seed.json i film elencati in data/lista.json,
   con l'ID TMDB già verificato. Non tocca i film già presenti.
   Uso: node tools/importa.mjs */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = join(ROOT, 'data', 'seed.json');

const seed  = JSON.parse(await readFile(seedPath, 'utf8'));
const lista = JSON.parse(await readFile(join(ROOT, 'data', 'lista.json'), 'utf8'));

const esistenti = new Set(seed.movies.map(m => String(m.tmdbId ?? m.id)));
let aggiunti = 0;

for (const elenco of ['visto', 'cinema', 'casa']) {
  for (const voce of lista[elenco] || []) {
    const id = `tmdb-${voce.tmdbId}`;
    if (esistenti.has(String(voce.tmdbId)) || seed.movies.some(m => m.id === id)) {
      console.log(`  = ${voce.titolo} già presente, salto`);
      continue;
    }
    seed.movies.push({
      id,
      tmdbId: voce.tmdbId,
      title: voce.titolo,
      originalTitle: null,
      release: null,          // la prende TMDB, preferendo l'uscita italiana
      director: null,
      genres: [],
      countries: [],
      runtime: null,
      trailer: null,
      cast: [],
      plot: null,
      lista: elenco,
      ...(voce.rivedere ? { rivedere: true } : {}),
      source: `tmdb:${voce.tmdbId}`
    });
    aggiunti++;
  }
}

/* I film già in libreria sono tutti da vedere al cinema. */
for (const m of seed.movies) if (!m.lista) m.lista = 'cinema';

await writeFile(seedPath, JSON.stringify(seed, null, 2) + '\n');
console.log(`\n✅ seed.json aggiornato — ${aggiunti} film aggiunti, ${seed.movies.length} in totale.`);
