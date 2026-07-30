#!/usr/bin/env node
/* Elenca i film la cui data non è ancora quella italiana ufficiale.
   Da rilanciare ogni tanto: appena TMDB pubblica l'uscita IT,
   basta un `node tools/enrich.mjs` e il film si sistema da solo.

   Uso: node tools/date-da-controllare.mjs */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { movies } = JSON.parse(await readFile(join(ROOT, 'data', 'movies.json'), 'utf8'));

const sospette = movies
  .filter(m => m.releaseFonte === 'US' || m.releaseFonte === 'globale')
  .sort((a, b) => String(a.release).localeCompare(String(b.release)));

if (!sospette.length) {
  console.log('✅ Tutte le date sono confermate per l\'Italia.');
} else {
  console.log(`⚠  ${sospette.length} film senza data italiana ufficiale:\n`);
  for (const m of sospette) {
    console.log(`  ${m.release}  ${m.title}`);
    console.log(`     fonte: ${m.releaseFonte}${m.releaseUS ? ` · USA ${m.releaseUS}` : ''}`
      + `${m.releaseGlobale ? ` · globale ${m.releaseGlobale}` : ''}`);
    console.log(`     https://www.themoviedb.org/movie/${m.tmdbId}/releases\n`);
  }
  console.log('Rilancia `node tools/enrich.mjs` per riprovare a prenderle.');
}
