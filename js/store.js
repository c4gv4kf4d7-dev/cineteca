/* ══════════════════════════════════════════════════════════
   store.js — catalogo + stato personale (localStorage)

   Il catalogo arriva da data/movies.json (arricchito con TMDB)
   con fallback a data/seed.json (export da Notion).
   Lo stato personale — visto, preferito, voto, note — vive
   solo nel browser ed è la fonte di verità dell'app.
   ══════════════════════════════════════════════════════════ */

const Store = (() => {
  const KEY = 'cineteca:v1';

  let catalog = [];
  let state = { movies: {}, updatedAt: null };
  const listeners = new Set();

  /* ── persistenza ─────────────────────────────────────── */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = { ...state, ...JSON.parse(raw) };
    } catch (err) {
      console.warn('Stato locale illeggibile, riparto da zero.', err);
    }
  }

  function save() {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Salvataggio fallito (quota o modalità privata).', err);
    }
    listeners.forEach(fn => fn());
  }

  /* ── stato per singolo film ──────────────────────────── */
  const blank = () => ({
    seen: false, fav: false, myRating: 0, note: '',
    rewatch: false,          // visto al cinema, aspetto che esca per rivederlo
    addedAt: null, seenAt: null
  });

  /* Valore di partenza del film: quelli dell'archivio nascono già visti.
     Deve valere anche alla prima modifica, altrimenti mettere una stella
     a un film visto lo farebbe tornare "da vedere". */
  function predefinito(id) {
    const m = catalog.find(x => x.id === id);
    return { ...blank(), seen: m?.lista === 'visto', rewatch: Boolean(m?.rivedere) };
  }

  function userState(id) {
    return { ...predefinito(id), ...(state.movies[id] || {}) };
  }

  function patch(id, changes) {
    const next = { ...userState(id), ...changes };
    if (!next.addedAt) next.addedAt = new Date().toISOString();
    // Serve a fondere due dispositivi: a parità di film vince il più recente.
    next.updatedAt = new Date().toISOString();
    state.movies[id] = next;
    save();
    return next;
  }

  /* ── azioni ──────────────────────────────────────────── */
  const toggleSeen = id => {
    const seen = !userState(id).seen;
    return patch(id, { seen, seenAt: seen ? new Date().toISOString() : null });
  };
  const toggleFav = id => patch(id, { fav: !userState(id).fav });
  /* Segnare "da rivedere" implica averlo visto. */
  const toggleRewatch = id => {
    const u = userState(id);
    return patch(id, { rewatch: !u.rewatch, seen: u.rewatch ? u.seen : true });
  };
  const setRating = (id, myRating) => patch(id, { myRating });
  const setNote   = (id, note)     => patch(id, { note });

  /* ── catalogo ────────────────────────────────────────── */

  /** Rilegge il catalogo da disco/rete senza toccare lo stato personale. */
  async function refresh() {
    let data = null;
    for (const url of ['data/movies.json', 'data/seed.json']) {
      try {
        const res = await fetch(`${url}?t=${Date.now()}`);
        if (!res.ok) continue;
        data = await res.json();
        break;
      } catch (err) { /* provo la sorgente successiva */ }
    }
    if (!data) throw new Error('Nessun catalogo caricabile (data/movies.json o data/seed.json).');

    catalog = (data.movies || []).map(m => ({
      ...m,
      genres:    m.genres    || [],
      countries: m.countries || [],
      cast:      m.cast      || [],
      releaseDate: m.release ? new Date(`${m.release}T00:00:00`) : null
    }));
    return { enriched: Boolean(data.enrichedAt), enrichedAt: data.enrichedAt || null, source: data.generatedFrom };
  }

  /* Fino alla v2 il valore di partenza "visto" non veniva applicato
     quando si creava il record: mettere una stella a un film
     dell'archivio lo faceva tornare "da vedere". Qui li recupero. */
  function riparaArchivio() {
    if (state.schema >= 2) return;
    let riparati = 0;
    for (const m of catalog) {
      const r = state.movies[m.id];
      if (m.lista === 'visto' && r && r.seen === false && !r.seenAt) {
        r.seen = true;
        riparati++;
      }
    }
    state.schema = 2;
    if (riparati) console.info(`Ripristinati ${riparati} film dell'archivio tornati per errore fra i "da vedere".`);
    save();
  }

  async function init() {
    load();
    const info = await refresh();
    riparaArchivio();
    return info;
  }

  /* film = dati catalogo + stato personale, sempre uniti */
  const all = () => catalog.map(m => ({ ...m, user: userState(m.id) }));
  const byId = id => all().find(m => m.id === id) || null;

  const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

  /* ── ponte verso il cloud ────────────────────────────────
     Il sync non deve conoscere la struttura interna: gli do
     lo stato grezzo e un modo per rimpiazzarlo o fonderlo. */

  const stato = () => JSON.parse(JSON.stringify(state));

  /** Quanti film hai davvero toccato: serve al cloud per non
      sovrascrivere un archivio pieno con uno vuoto. */
  const quantiToccati = () => Object.keys(state.movies || {}).length;

  /** Fonde uno stato remoto con quello locale, film per film:
      a parità di titolo vince la modifica più recente. */
  function fondi(remoto) {
    if (!remoto || !remoto.movies) return false;
    let cambiato = false;

    for (const [id, loro] of Object.entries(remoto.movies)) {
      const mio = state.movies[id];
      if (!mio) { state.movies[id] = loro; cambiato = true; continue; }

      const quandoLoro = Date.parse(loro.updatedAt || loro.addedAt || 0) || 0;
      const quandoMio  = Date.parse(mio.updatedAt  || mio.addedAt  || 0) || 0;
      if (quandoLoro > quandoMio) { state.movies[id] = loro; cambiato = true; }
    }

    if (remoto.schema > (state.schema || 0)) state.schema = remoto.schema;
    if (cambiato) save();
    return cambiato;
  }

  return { init, refresh, all, byId, userState,
           toggleSeen, toggleFav, toggleRewatch, setRating, setNote, subscribe,
           stato, fondi, quantiToccati, riparaArchivio };
})();
