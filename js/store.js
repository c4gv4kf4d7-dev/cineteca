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
  const blank = () => ({ seen: false, fav: false, myRating: 0, note: '', addedAt: null, seenAt: null });

  function userState(id) {
    return { ...blank(), ...(state.movies[id] || {}) };
  }

  function patch(id, changes) {
    const next = { ...userState(id), ...changes };
    if (!next.addedAt) next.addedAt = new Date().toISOString();
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

  async function init() {
    load();
    return refresh();
  }

  /* film = dati catalogo + stato personale, sempre uniti.
     I film dell'archivio partono già come visti, ma se li tocchi
     una volta comanda la tua scelta, non più il valore di partenza. */
  const all = () => catalog.map(m => {
    const toccato = Boolean(state.movies[m.id]);
    const user = userState(m.id);
    if (!toccato && m.lista === 'visto') user.seen = true;
    return { ...m, user };
  });
  const byId = id => all().find(m => m.id === id) || null;

  const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

  return { init, refresh, all, byId, userState, toggleSeen, toggleFav, setRating, setNote, subscribe };
})();
