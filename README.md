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
sw.js               service worker: prima la rete, la cache è il paracadute

js/store.js         catalogo + stato personale (localStorage)
js/format.js        date, durate, valute, helper
js/app.js           filtri, griglia, hero, avvio
js/detail.js        scheda film
js/avviso.js        il messaggio con "annulla" in fondo allo schermo
js/novita.js        cosa è cambiato da quando non ci sei
js/notizie.js       la rassegna stampa
js/charts.js        i grafici, disegnati a mano in SVG
js/stats.js         vista statistiche
js/consiglia.js     il consigliere: perché sì e perché no
js/persone.js       la libreria vista dalle persone (regia + cast)
js/ciechi.js        gli angoli bui: i buchi della libreria
js/perte.js         la scheda "Per te"
js/cloud.js         accesso e sincronia via Supabase (facoltativa)

tools/enrich.mjs    arricchimento TMDB + OMDb
tools/notizie.mjs   rassegna stampa italiana
tools/importa.mjs   import dall'export Notion
tools/versione.mjs  allinea il `?v=` degli asset e la cache del service worker
tools/serve.mjs     server statico di sviluppo
```

## Scorciatoie

- `/` — vai alla ricerca
- `Esc` — chiudi la scheda film
- il nome di una persona, ovunque compaia, porta ai suoi film in libreria

## Quando tocchi il codice

Ogni asset è caricato con un `?v=…` e il service worker nomina la cache
allo stesso modo. Il workflow notturno lo aggiorna da solo **quando cambiano
i dati**; se invece hai cambiato codice, fallo a mano:

```bash
node tools/versione.mjs
```

Senza, un telefono che ha già aperto la cineteca continua a servire il
JavaScript vecchio. Lo script avvisa anche se hai aggiunto uno script
all'index dimenticandolo nell'elenco `SHELL` di `sw.js`.
