/* ══════════════════════════════════════════════════════════
   app.js — filtri, griglia, hero, avvio
   ══════════════════════════════════════════════════════════ */

(() => {
  const $ = sel => document.querySelector(sel);

  const grid    = $('#grid');
  const heroEl  = $('#hero');
  const countEl = $('#count');
  const emptyEl = $('#empty');
  const qInput  = $('#q');

  const filtro = { q: '', status: 'cinema', sort: 'release', layout: 'grid' };
  let meta = {};

  /* ── selezione e ordinamento ─────────────────────────── */
  function visibili() {
    const q = filtro.q.toLowerCase().trim();

    /* Tre gruppi che non si sovrappongono: dove lo devo vedere,
       oppure l'ho già visto e non importa più dove.
       Quando cerchi, però, i gruppi si aprono: cercare "chastain"
       e non trovare Mammina perché sta in un'altra scheda è assurdo. */
    let films = Store.all().filter(m => {
      if (!q) {
        if (filtro.status === 'seen') { if (!m.user.seen) return false; }
        else if (m.user.seen || m.lista !== filtro.status) return false;
        return true;
      }

      return [m.title, m.originalTitle, m.director, m.plot,
              ...m.genres, ...m.countries,
              ...m.cast.map(c => typeof c === 'string' ? c : c.name)]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });

    const ordini = {
      release:  (a, b) => (a.releaseDate?.getTime() ?? Infinity) - (b.releaseDate?.getTime() ?? Infinity),
      title:    (a, b) => a.title.localeCompare(b.title, 'it'),
      rating:   (a, b) => (b.tmdbRating || 0) - (a.tmdbRating || 0),
      rt:       (a, b) => (b.rtScore ?? -1) - (a.rtScore ?? -1),
      myRating: (a, b) => (b.user.myRating || 0) - (a.user.myRating || 0),
      runtime:  (a, b) => (b.runtime || 0) - (a.runtime || 0),
      added:    (a, b) => String(b.user.addedAt || '').localeCompare(String(a.user.addedAt || ''))
    };
    return films.sort(ordini[filtro.sort] || ordini.release);
  }

  /* ── card ────────────────────────────────────────────── */
  /* Angolo in basso a destra: quando esce. Ce l'hanno tutti i film.
     L'ambra resta riservata all'imminenza, così mantiene un senso. */
  function badgeUscita(m) {
    const g = F.giorniA(m.releaseDate);
    if (g === null) return { testo: 'TBA', hot: false };
    if (g === 0)    return { testo: 'OGGI', hot: true };
    if (g > 0)      return { testo: `${g}G`, hot: g <= 30 };
    // Già uscito: cambia cosa è utile sapere a seconda della lista.
    if (m.lista === 'casa') return { testo: 'USCITO', hot: false };
    // Nelle multisala la tenitura vera è di circa dieci settimane:
    // oltre, dire "in sala" sarebbe una bugia.
    if (g >= -70) return { testo: 'IN SALA', live: true };
    return { testo: 'GIÀ PASSATO', hot: false };
  }

  /* Angolo in alto a destra: il voto. Rotten Tomatoes quando c'è;
     altrimenti TMDB, ma etichettato per non confonderlo con RT. */
  function badgeVoto(m) {
    if (m.rtScore != null)
      return { testo: `🍅 ${m.rtScore}%`, cls: m.rtScore >= 60 ? 'badge-score' : 'badge-rotten' };
    if (m.tmdbRating)
      return { testo: `TMDB ${m.tmdbRating.toFixed(1)}`, cls: 'badge-tmdb' };
    return null;
  }

  function card(m) {
    const img = F.poster(m);
    const uscita = badgeUscita(m);
    const voto = badgeVoto(m);
    const prev = F.prevendita(m);
    // Popcorn: lo decidi tu, non lo deduco dalla data.
    const pronto = m.user.pronto && !m.user.seen;

    return `<div class="card">
      <button class="poster" data-open="${F.esc(m.id)}" aria-label="Apri ${F.esc(m.title)}">
        ${img
          ? `<img src="${img}" alt="Locandina di ${F.esc(m.title)}" loading="lazy">`
          : `<span class="poster-fallback"><b>${F.esc(m.title)}</b><span>${F.esc(F.dataBreve(m.releaseDate))}</span></span>`}
        <span class="poster-top">
          ${m.user.rewatch
            ? '<span class="badge badge-rewatch">↻ DA RIVEDERE</span>'
            : m.user.seen ? '<span class="badge badge-seen">VISTO</span>' : '<span></span>'}
          ${voto ? `<span class="badge ${voto.cls}">${F.esc(voto.testo)}</span>` : ''}
        </span>
        ${prev ? `<span class="poster-prev">
          <span class="badge badge-prev${prev.urgente ? ' is-urgente' : ''}">${
            prev.urgente ? '<i class="live-dot"></i>' : '🎫 '}${F.esc(prev.breve)}</span>
        </span>` : ''}
        ${pronto ? '<span class="poster-pronto"><span class="badge badge-pronto">🍿 PRONTO</span></span>' : ''}
        ${uscita ? `<span class="poster-bottom">
          <span class="badge ${uscita.live ? 'badge-live' : uscita.hot ? 'badge-hot' : 'badge-soon'}">${
            uscita.live ? '<i class="live-dot"></i>' : ''}${F.esc(uscita.testo)}</span>
        </span>` : ''}
      </button>
      <div class="card-meta">
        <h3>${F.esc(m.title)}</h3>
        <p>${F.esc(F.dataBreve(m.releaseDate))}${
          m.releaseFonte === 'US' || m.releaseFonte === 'globale'
            ? '<span class="stimata" title="Data non ancora confermata per l\'Italia">≈</span>' : ''
          } · ${F.esc(m.genres[0] || '—')}${F.durata(m.runtime) ? ` · ${F.durata(m.runtime)}` : ''}</p>
      </div>
    </div>`;
  }

  /* ── hero: il prossimo film che esce ─────────────────── */
  let prossimo = null;

  /* Solo le cifre, una volta al secondo: ridisegnare tutto l'hero
     ogni secondo farebbe sfarfallare l'immagine di sfondo. */
  function tickCountdown() {
    const box = heroEl.querySelector('.hero-count');
    if (!box || !prossimo) return;
    const cd = F.countdown(prossimo.releaseDate);
    if (!cd.length) return;

    // Scaduto: il film è uscito, la libreria va ricalcolata.
    if (cd.every(c => c.v === 0)) { render(); return; }

    box.innerHTML = cd.map(c =>
      `<div class="cd"><b>${String(c.v).padStart(2, '0')}</b><span>${c.l}</span></div>`).join('');
  }

  function renderHero() {
    const next = Store.all()
      .filter(m => m.lista === 'cinema' && !m.user.seen && (F.giorniA(m.releaseDate) ?? -1) >= 0)
      .sort((a, b) => a.releaseDate - b.releaseDate)[0];

    prossimo = next || null;
    if (!next) { heroEl.hidden = true; return; }
    heroEl.hidden = false;

    const bg = F.backdrop(next) || F.poster(next, 'w780');
    heroEl.innerHTML = `
      ${bg ? `<img class="hero-bg" src="${bg}" alt="">` : ''}
      <div class="hero-inner">
        <span class="hero-kicker">Prossima uscita</span>
        <h1>${F.esc(next.title)}</h1>
        <p class="hero-sub">${F.esc(F.dataLunga(next.releaseDate))} · ${F.esc(next.genres.join(', ') || '—')}${
          next.director ? ` · regia di ${F.esc(next.director)}` : ''}</p>
        <div class="hero-count">
          ${F.countdown(next.releaseDate).map(c =>
            `<div class="cd"><b>${String(c.v).padStart(2, '0')}</b><span>${c.l}</span></div>`).join('')}
        </div>
        <div class="hero-actions">
          <button class="btn btn-primary" data-open="${F.esc(next.id)}">Apri la scheda</button>
          ${next.trailer ? `<a class="btn" href="${F.esc(next.trailer)}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z"/></svg> Trailer</a>` : ''}
        </div>
      </div>`;
  }

  /* ── render principale ───────────────────────────────── */
  function render() {
    const films = visibili();
    const tot = Store.all().length;

    grid.className = `grid${filtro.layout === 'list' ? ' is-list' : ''}`;
    grid.innerHTML = films.map(card).join('');
    emptyEl.hidden = films.length > 0;

    const cercando = filtro.q.trim().length > 0;
    const etichetta = { cinema: 'da vedere al cinema', casa: 'da vedere sul divano', seen: 'già visti' };
    countEl.textContent = cercando
      ? `${films.length} ${films.length === 1 ? 'risultato' : 'risultati'} in tutta la libreria`
      : `${films.length} film ${etichetta[filtro.status]} · ${tot} in libreria`;

    // L'hero ha senso solo sulla lista del cinema, e non mentre cerchi.
    heroEl.hidden = cercando || filtro.status !== 'cinema';
    if (!heroEl.hidden) renderHero();
    if ($('#view-perte').classList.contains('is-active')) PerTe.render();
    if ($('#view-stats').classList.contains('is-active')) Stats.render();
  }

  /* ── eventi ──────────────────────────────────────────── */
  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open]');
    if (open) return Detail.open(open.dataset.open);

    const status = e.target.closest('[data-status]');
    if (status) { filtro.status = status.dataset.status; syncChips('#filter-status', 'status'); return render(); }

    const layout = e.target.closest('[data-layout]');
    if (layout) { filtro.layout = layout.dataset.layout; syncChips('#layout', 'layout'); return render(); }

    const tab = e.target.closest('[data-view]');
    if (tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('is-active', t === tab));
      document.querySelectorAll('.view').forEach(v =>
        v.classList.toggle('is-active', v.id === `view-${tab.dataset.view}`));
      if (tab.dataset.view === 'stats') Stats.render();
      if (tab.dataset.view === 'perte') PerTe.render();
      if (tab.dataset.view === 'notizie') Notizie.render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  function syncChips(container, attr) {
    document.querySelectorAll(`${container} [data-${attr}]`).forEach(el =>
      el.classList.toggle('is-active', el.dataset[attr] === filtro[attr === 'layout' ? 'layout' : 'status']));
  }

  qInput.addEventListener('input', () => { filtro.q = qInput.value; render(); });
  $('#sort').addEventListener('change', e => { filtro.sort = e.target.value; render(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && Detail.isOpen()) return Detail.close();
    if (e.key === '/' && document.activeElement !== qInput) { e.preventDefault(); qInput.focus(); }
  });

  /* Ogni modifica allo stato personale ridisegna la libreria. */
  Store.subscribe(render);

  function aggiornaFooter() {
    if (!meta.enriched) {
      $('#footer-meta').textContent = 'Catalogo base da Notion — lancia tools/enrich.mjs per locandine, voti e statistiche';
      return;
    }
    // Cito OMDb solo se i suoi voti sono davvero nel catalogo.
    const conOmdb = Store.all().some(m => m.rtScore != null || m.imdbRating);
    $('#footer-meta').textContent =
      `Dati aggiornati al ${new Date(meta.enrichedAt).toLocaleDateString('it-IT')} · `
      + (conOmdb ? 'fonti TMDB e OMDb' : 'fonte TMDB');
  }

  /* Riapertura dell'app: il catalogo può contenere voti pubblicati
     nel frattempo, quindi lo rileggo invece di fidarmi di quello in memoria. */
  async function riprendi() {
    try {
      meta = await Store.refresh();
      render();
      aggiornaFooter();
    } catch (err) {
      console.warn('Catalogo non ricaricabile, tengo quello già in memoria.', err);
      render();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) riprendi();
  });

  /* ── avvio ───────────────────────────────────────────── */
  Store.init()
    .then(info => {
      meta = info;
      render();
      aggiornaFooter();
      Novita.render(Store.all());
      setInterval(tickCountdown, 1000);
    })
    .catch(err => {
      console.error(err);
      grid.innerHTML = `<p class="empty">${F.esc(err.message)}<br><br>
        Se hai aperto il file con doppio clic: serve un server locale.<br>
        Nella cartella del progetto lancia <code>python3 -m http.server 8080</code></p>`;
    });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
