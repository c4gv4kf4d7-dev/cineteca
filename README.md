# CINETECA

Biblioteca cinematografica personale. Statica, vanilla, PWA — stessa filosofia dell'app gym.

## Avvio

```bash
node tools/serve.mjs
```

Poi apri http://localhost:8123 (serve un server: aprendo `index.html` col doppio clic il browser blocca il caricamento del catalogo).

## Come sono organizzati i dati

| File | Ruolo |
|---|---|
| `data/seed.json` | Export dalla pagina Notion "Movies". Base di partenza. |
| `data/movies.json` | Catalogo arricchito con TMDB. È quello che l'app legge davvero. |
| `localStorage` | **Stato personale**: visto, preferito, voto, note. Vive solo nel tuo browser. |

L'app legge `data/movies.json` e, se non c'è, ripiega su `data/seed.json`.
Lo stato personale è indicizzato per `id` del film, quindi rigenerare il catalogo
non cancella voti e note.

## Arricchimento

Due fonti, entrambe con key gratuita, entrambe usate solo in locale.

**TMDB** — locandine, backdrop, voto, budget/incassi, cast con foto, trailer YouTube, durate mancanti.
Key su https://www.themoviedb.org/settings/api

**OMDb** — Rotten Tomatoes, Metacritic, IMDb. Rotten Tomatoes non ha un'API pubblica:
OMDb ne riporta il punteggio agganciandosi all'IMDb ID che TMDB ci fornisce.
Key gratuita (1000 chiamate/giorno) su https://www.omdbapi.com/apikey.aspx

1. Crea `.env.local` nella cartella del progetto:
   ```
   TMDB_KEY=la_tua_chiave
   OMDB_KEY=la_tua_chiave
   ```
   Senza `OMDB_KEY` lo script gira lo stesso e salta i voti RT/Metacritic/IMDb.
2. Lancia:
   ```bash
   node tools/enrich.mjs
   ```

Su errore di rete lo script **non retrocede**: tiene i dati dell'ultimo arricchimento
riuscito e aggiorna solo i campi che arrivano da Notion.

## Aggiornamento dei voti

I film non ancora usciti non hanno voti da nessuna parte. Appena escono, i voti
compaiono rilanciando `node tools/enrich.mjs`.

All'apertura dell'app (e a ogni ritorno da background) il catalogo viene riletto,
quindi i voti nuovi si vedono senza ricaricare la pagina a mano. Il countdown
dell'uscita è vivo, aggiornato ogni secondo.

`.env.local` è in `.gitignore`: la chiave non finisce mai nel sito pubblicato.
Nel JSON vanno solo dati pubblici (percorsi immagine su image.tmdb.org, voti, numeri).

I dati presi da Notion hanno la precedenza: TMDB riempie solo i campi vuoti.

## Struttura

```
index.html          guscio e markup
css/styles.css      tutto lo stile
js/store.js         catalogo + stato personale (localStorage)
js/format.js        date, durate, valute, helper
js/app.js           filtri, griglia, hero, avvio
js/detail.js        scheda film
js/stats.js         vista statistiche
tools/enrich.mjs    arricchimento TMDB
tools/serve.mjs     server statico di sviluppo
```

## Scorciatoie

- `/` — vai alla ricerca
- `Esc` — chiudi la scheda film

## Da fare

- `assets/icon.png` (icona PWA) non c'è ancora
- deploy su GitHub Pages sul modello di `gym/deploy.sh`
