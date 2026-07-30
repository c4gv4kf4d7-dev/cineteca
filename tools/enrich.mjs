#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════
   enrich.mjs — arricchisce data/seed.json con i dati TMDB
   e scrive data/movies.json (il catalogo che legge l'app).

   Uso:
     1. metti la tua chiave in .env.local:   TMDB_KEY=xxxxxxxx
     2. node tools/enrich.mjs

   La chiave resta in locale: .env.local è in .gitignore e nel
   JSON finiscono solo dati pubblici (percorsi immagine, voti…).
   ══════════════════════════════════════════════════════════ */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API  = 'https://api.themoviedb.org/3';

/* ── chiavi ──────────────────────────────────────────── */
async function chiavi() {
  let env = '';
  try { env = await readFile(join(ROOT, '.env.local'), 'utf8'); } catch { /* nessun .env.local */ }
  const leggi = nome => {
    if (process.env[nome]) return process.env[nome];
    const m = env.match(new RegExp(`^\\s*${nome}\\s*=\\s*(.+?)\\s*$`, 'm'));
    return m ? m[1].replace(/^["']|["']$/g, '') : null;
  };

  const tmdb = leggi('TMDB_KEY');
  if (!tmdb) {
    console.error('✗ Chiave TMDB mancante.\n  Crea .env.local con:  TMDB_KEY=la_tua_chiave');
    process.exit(1);
  }
  return { tmdb, omdb: leggi('OMDB_KEY') };
}

let KEY, OMDB_KEY;
async function tmdb(path, params = {}) {
  const url = new URL(API + path);
  url.searchParams.set('api_key', KEY);
  url.searchParams.set('language', 'it-IT');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} su ${path}`);
  return res.json();
}

/* ── ricerca del film ────────────────────────────────── */
async function trova(film) {
  const anno = film.release ? film.release.slice(0, 4) : undefined;
  const tentativi = [
    { q: film.originalTitle, year: anno },
    { q: film.title,         year: anno },
    { q: film.originalTitle },
    { q: film.title }
  ].filter(t => t.q);

  for (const t of tentativi) {
    const params = { query: t.q, include_adult: 'false' };
    if (t.year) params.primary_release_year = t.year;
    const { results = [] } = await tmdb('/search/movie', params);
    if (results.length) return results[0];
  }
  return null;
}

/* TMDB restituisce i paesi in inglese: traduco i più ricorrenti
   e per gli altri tengo il nome originale. */
const PAESI = {
  'United States of America': 'USA', 'United Kingdom': 'Gran Bretagna',
  'Ireland': 'Irlanda', 'France': 'Francia', 'Spain': 'Spagna', 'Germany': 'Germania',
  'Italy': 'Italia', 'Japan': 'Giappone', 'South Korea': 'Corea del Sud',
  'China': 'Cina', 'Hong Kong': 'Hong Kong', 'Canada': 'Canada', 'Australia': 'Australia',
  'New Zealand': 'Nuova Zelanda', 'United Arab Emirates': 'Emirati Arabi Uniti',
  'Belgium': 'Belgio', 'Netherlands': 'Paesi Bassi', 'Sweden': 'Svezia',
  'Denmark': 'Danimarca', 'Norway': 'Norvegia', 'Mexico': 'Messico', 'Brazil': 'Brasile',
  'India': 'India', 'Argentina': 'Argentina', 'Poland': 'Polonia', 'Switzerland': 'Svizzera'
};
const paese = nome => PAESI[nome] || nome;

/* ── OMDb: Rotten Tomatoes, Metacritic, IMDb ─────────────
   Rotten Tomatoes non espone un'API pubblica; OMDb ne riporta
   il punteggio nel campo Ratings, agganciato all'IMDb ID.
   ──────────────────────────────────────────────────────── */
async function voti(imdbId) {
  if (!OMDB_KEY || !imdbId) return {};

  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('apikey', OMDB_KEY);
  url.searchParams.set('i', imdbId);
  url.searchParams.set('tomatoes', 'true');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OMDb ${res.status}`);
  const d = await res.json();
  if (d.Response === 'False') return {};

  const trova = fonte => (d.Ratings || []).find(r => r.Source === fonte)?.Value;
  const perc = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

  return {
    rtScore:    perc(trova('Rotten Tomatoes')),
    metascore:  perc(trova('Metacritic')) ?? perc(d.Metascore),
    imdbRating: parseFloat(d.imdbRating) || null,
    imdbVotes:  parseInt(String(d.imdbVotes).replace(/,/g, ''), 10) || null
  };
}

/* Data di uscita italiana (tipo 3 = sala, 4 = digitale/home).
   È quella che conta: TMDB come release_date espone la prima al mondo. */
function uscitaItaliana(d) {
  const it = (d.release_dates?.results || []).find(r => r.iso_3166_1 === 'IT');
  if (!it) return null;
  const preferita = it.release_dates.find(x => x.type === 3) || it.release_dates[0];
  return preferita ? preferita.release_date.slice(0, 10) : null;
}

/* Dove si può vedere in Italia, in abbonamento. */
function piattaforme(d) {
  const it = d['watch/providers']?.results?.IT;
  if (!it) return [];
  const nomi = [...(it.flatrate || []), ...(it.free || [])].map(p => p.provider_name);
  return [...new Set(nomi)];
}

/* ── arricchimento di un singolo film ────────────────── */
async function arricchisci(film, giaInLibreria = new Set()) {
  // Se l'ID è già stato verificato a mano, niente ricerca: nessun rischio di sbagliare film.
  const hit = film.tmdbId ? { id: film.tmdbId } : await trova(film);
  if (!hit) {
    console.warn(`  ? nessun risultato TMDB per "${film.title}" — tengo i dati di Notion`);
    return { ...film, tmdbId: null };
  }

  const d = await tmdb(`/movie/${hit.id}`, { append_to_response: 'credits,videos,release_dates,watch/providers' });

  const registi = (d.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.name);
  const castDetail = (d.credits?.cast || []).slice(0, 12).map(c => ({
    name: c.name, character: c.character || null, profile: c.profile_path || null
  }));

  // Un trailer YouTube batte sempre il link generico di comingsoon.
  const video = (d.videos?.results || []).find(v =>
    v.site === 'YouTube' && /trailer/i.test(v.type));
  const trailer = video ? `https://www.youtube.com/watch?v=${video.key}` : film.trailer;

  // La tagline italiana spesso manca: ripiego su quella originale.
  let tagline = d.tagline || null;
  if (!tagline) {
    try {
      const en = await tmdb(`/movie/${d.id}`, { language: 'en-US' });
      tagline = en.tagline || null;
    } catch { /* pazienza, resta senza */ }
  }

  let esterni = {};
  try {
    esterni = await voti(d.imdb_id);
  } catch (err) {
    console.warn(`    ! OMDb non raggiungibile per ${film.title}: ${err.message}`);
  }

  const uscitaIT = uscitaItaliana(d);
  const streaming = piattaforme(d);

  const note = [
    d.poster_path ? null : 'senza locandina',
    esterni.rtScore != null ? `RT ${esterni.rtScore}%` : null,
    streaming.length ? streaming.join('/') : null
  ].filter(Boolean);
  console.log(`  ✓ ${film.title} → ${uscitaIT || d.release_date || '?'}${note.length ? ` · ${note.join(' · ')}` : ''}`);

  return {
    ...film,
    tmdbId: d.id,
    imdbId: d.imdb_id || null,
    ...esterni,
    // I dati di Notion restano prioritari: TMDB riempie solo i buchi.
    // La data di Notion vince; se manca, uscita italiana e solo in ultima istanza quella globale.
    release:  film.release  || uscitaIT || d.release_date || null,
    releaseGlobale: d.release_date || null,
    streaming,
    runtime:  film.runtime  || d.runtime || null,
    director: film.director || registi[0] || null,
    plot:     film.plot     || d.overview || null,
    genres:    film.genres?.length    ? film.genres    : (d.genres || []).map(g => g.name),
    countries: film.countries?.length ? film.countries : (d.production_countries || []).map(c => paese(c.name)),
    cast:      film.cast?.length      ? film.cast      : castDetail.map(c => c.name),
    trailer,
    poster:     d.poster_path   || null,
    backdrop:   d.backdrop_path || null,
    tmdbRating: d.vote_average  || null,
    tmdbVotes:  d.vote_count    || null,
    popularity: d.popularity    || null,
    budget:     d.budget  || null,
    revenue:    d.revenue || null,
    tagline,
    scoperte: await scoperte(d, giaInLibreria),
    castDetail
  };
}

/* ── scoperte: film FUORI dalla libreria da proporre ─────
   Due strade complementari: i film che TMDB associa a questo,
   e le altre interpretazioni dei suoi attori principali.
   ──────────────────────────────────────────────────────── */
function scheda(x, extra = {}) {
  return {
    tmdbId: x.id,
    titolo: x.title,
    poster: x.poster_path || null,
    anno: x.release_date ? Number(x.release_date.slice(0, 4)) : null,
    voto: x.vote_average || null,
    votanti: x.vote_count || 0,
    ...extra
  };
}

async function scoperte(d, giaInLibreria) {
  const fuori = x => x.id !== d.id && !giaInLibreria.has(x.id)
    && x.poster_path && (x.vote_count || 0) >= 50;

  const trovate = new Map();

  /* 1. i consigli di TMDB per questo film */
  try {
    const { results = [] } = await tmdb(`/movie/${d.id}/recommendations`);
    for (const x of results.filter(fuori).slice(0, 8)) {
      trovate.set(x.id, scheda(x, { tipo: 'simile' }));
    }
  } catch { /* pazienza */ }

  /* 2. le altre interpretazioni dei due attori di punta */
  for (const attore of (d.credits?.cast || []).slice(0, 2)) {
    try {
      const cr = await tmdb(`/person/${attore.id}/movie_credits`);
      const suoi = (cr.cast || [])
        .filter(fuori)
        .filter(x => (x.popularity || 0) > 5)
        .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
        .slice(0, 3);
      for (const x of suoi) {
        // Se un film arriva da entrambe le strade, l'attore è l'aggancio più parlante.
        trovate.set(x.id, scheda(x, { tipo: 'attore', attore: attore.name }));
      }
    } catch { /* pazienza */ }
  }

  return [...trovate.values()].slice(0, 14);
}

/* ── main ────────────────────────────────────────────── */
const seed = JSON.parse(await readFile(join(ROOT, 'data', 'seed.json'), 'utf8'));
({ tmdb: KEY, omdb: OMDB_KEY } = await chiavi());

if (!OMDB_KEY) console.warn('· OMDB_KEY assente: salto Rotten Tomatoes, Metacritic e IMDb.\n');
/* Catalogo precedente: su errore di rete è meglio tenere il dato
   vecchio che retrocedere ai soli campi di Notion. */
let precedenti = new Map();
try {
  const vecchio = JSON.parse(await readFile(join(ROOT, 'data', 'movies.json'), 'utf8'));
  precedenti = new Map(vecchio.movies.map(m => [m.id, m]));
} catch { /* prima esecuzione */ }

/* Serve per non proporre come "scoperta" un film che hai già in lista. */
const giaInLibreria = new Set([
  ...seed.movies.map(m => m.tmdbId).filter(Boolean),
  ...[...precedenti.values()].map(m => m.tmdbId).filter(Boolean)
]);

console.log(`Arricchisco ${seed.movies.length} film…`);
const movies = [];
for (const film of seed.movies) {
  try {
    movies.push(await arricchisci(film, giaInLibreria));
  } catch (err) {
    const vecchio = precedenti.get(film.id);
    console.warn(`  ✗ ${film.title}: ${err.message} — ${vecchio ? 'tengo i dati precedenti' : 'tengo i dati di Notion'}`);
    // I campi di Notion restano freschi, il resto viene dall'ultimo arricchimento riuscito.
    movies.push(vecchio ? { ...vecchio, ...film } : film);
  }
}

const out = { ...seed, enrichedAt: new Date().toISOString(), movies };
await writeFile(join(ROOT, 'data', 'movies.json'), JSON.stringify(out, null, 2) + '\n');

const conta = f => movies.filter(f).length;
console.log(`\n✅ data/movies.json scritto — ${movies.length} film`
  + `\n   locandine ${conta(m => m.poster)} · voti TMDB ${conta(m => m.tmdbRating)}`
  + ` · Rotten Tomatoes ${conta(m => m.rtScore != null)} · IMDb ${conta(m => m.imdbRating)}`);
