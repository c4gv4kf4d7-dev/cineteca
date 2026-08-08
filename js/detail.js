/* ══════════════════════════════════════════════════════════
   detail.js — scheda film a tutto schermo
   ══════════════════════════════════════════════════════════ */

const Detail = (() => {
  const sheet = document.getElementById('sheet');
  const body  = document.getElementById('sheet-body');
  let currentId = null;
  let lastFocus = null;

  /* ── apertura / chiusura ─────────────────────────────── */
  function open(id) {
    currentId = id;
    lastFocus = document.activeElement;
    render();
    sheet.hidden = false;
    document.body.classList.add('is-locked');
    sheet.querySelector('.sheet-panel').scrollTop = 0;
    sheet.querySelector('.sheet-close').focus();
  }

  function close() {
    sheet.hidden = true;
    document.body.classList.remove('is-locked');
    currentId = null;
    if (lastFocus) lastFocus.focus();
  }

  const isOpen = () => !sheet.hidden;

  /* Con la scheda aperta il Tab non deve uscire e girovagare
     fra le locandine dietro al velo. */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !isOpen()) return;
    const dentro = [...sheet.querySelectorAll('a[href], button, textarea, input, select')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!dentro.length) return;

    const primo = dentro[0], ultimo = dentro.at(-1);
    if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
    else if (!sheet.contains(document.activeElement)) { e.preventDefault(); primo.focus(); }
  });

  /* ── rendering ───────────────────────────────────────── */
  function render() {
    const m = Store.byId(currentId);
    if (!m) return close();
    const u = m.user;

    const bd = F.backdrop(m) || F.poster(m, 'w780');
    const dataNonIT = m.releaseFonte === 'US' || m.releaseFonte === 'globale';

    const fatti = [
      m.releaseDate && { t: F.dataLunga(m.releaseDate), accent: true },
      dataNonIT && { t: m.releaseFonte === 'US' ? 'data USA, non confermata in Italia'
                                                : 'data internazionale, non confermata in Italia', avviso: true },
      (() => { const p = F.prevendita(m); return p && { t: `🎫 ${p.testo}`, prev: true, urgente: p.urgente }; })(),
      { t: F.attesa(m.releaseDate) },
      F.durata(m.runtime) && { t: F.durata(m.runtime) },
      ...m.genres.map(g => ({ t: g })),
      m.countries.length && { t: m.countries.join(' · ') },
      m.director && { t: `regia di ${m.director}` }
    ].filter(Boolean);

    /* Quando la scheda si ridisegna sullo stesso film (hai messo una
       stella, l'hai segnato visto) la locandina in cima è identica:
       riuso il nodo <img> già decodificato invece di crearne uno
       nuovo, che ripartirebbe da un riquadro vuoto. */
    const vecchiaImg = body.querySelector('.d-hero img');

    body.innerHTML = `
      <div class="d-hero${bd ? '' : ' is-nudo'}">
        ${bd ? `<img src="${bd}" alt="">` : ''}
        ${m.tagline ? `<blockquote class="d-quote">${F.esc(m.tagline)}</blockquote>` : ''}
        <div class="d-head">
          <h2 id="sheet-title">${F.esc(m.title)}</h2>
          ${m.originalTitle && m.originalTitle !== m.title
            ? `<p class="d-orig">${F.esc(m.originalTitle)}</p>` : ''}
          <div class="d-facts">
            ${fatti.map(f => `<span class="fact${f.accent ? ' fact-accent' : ''}${
              f.avviso ? ' fact-avviso' : ''}${f.prev ? ' fact-prev' : ''}${
              f.urgente ? ' is-urgente' : ''}">${f.avviso ? '⚠ ' : ''}${F.esc(f.t)}</span>`).join('')}
          ${m.evento ? `<p class="d-evento">${F.esc(m.evento)}</p>` : ''}
          </div>
        </div>
      </div>

      <div class="d-body">
        ${comandi(m)}

        <section class="d-section d-voto">
          <h4>Il mio voto</h4>
          <div class="rate" data-act="rate">
            ${[1,2,3,4,5].map(n =>
              `<button class="star${n <= u.myRating ? ' is-on' : ''}" data-star="${n}"
                       aria-label="${n} stelle">★</button>`).join('')}
            ${u.myRating ? `<button class="rate-clear" data-star="0">azzera</button>` : ''}
          </div>
        </section>

        ${perche(m)}

        ${m.plot ? `<section class="d-section">
          <h4>Trama</h4>
          <p class="d-plot">${F.esc(m.plot)}</p>
        </section>` : ''}

        ${statsBlock(m)}
        ${castBlock(m)}

        <!-- Spostare e cancellare sono manutenzione, non lettura:
             stanno in fondo, dopo tutto quello che c'è da sapere. -->
        <section class="d-gestione">
          ${m.lista !== 'visto' ? `<button class="d-sposta" data-act="sposta">
            ${m.lista === 'cinema' ? '🛋️ Spostalo fra quelli da vedere'
                                   : '🎟️ Rimettilo al cinema'}
          </button>` : ''}
          <button class="d-elimina" data-act="elimina">🗑 Togli dalla libreria</button>
        </section>

      </div>`;

    const nuovaImg = body.querySelector('.d-hero img');
    if (vecchiaImg && nuovaImg && vecchiaImg.src === nuovaImg.src && vecchiaImg.complete)
      nuovaImg.replaceWith(vecchiaImg);
  }

  /* ── i quattro bottoni in cima ─────────────────────────
     Stanno in una funzione loro perché sono l'unica cosa che cambia
     quando tocchi "pronto" o "voglio rivederlo": così si riscrivono
     da soli, senza tirarsi dietro tutta la scheda. */
  function comandi(m) {
    const u = m.user;
    return `<div class="d-actions">
      ${m.trailer ? `<a class="btn btn-primary" href="${F.esc(m.trailer)}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z"/></svg> Guarda il trailer</a>` : ''}
      <button class="btn btn-ghost${u.seen ? ' btn-on' : ''}" data-act="seen">
        <svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
        ${u.seen ? 'Visto' : 'Segna come visto'}
      </button>
      <button class="btn${u.pronto ? ' btn-pronto' : ' btn-ghost'}" data-act="pronto">
        <span class="btn-emoji">🍿</span>
        ${u.pronto ? 'Pronto da vedere' : 'Segna come pronto'}
      </button>
      <button class="btn${u.rewatch ? ' btn-rewatch' : ' btn-ghost'}" data-act="rewatch">
        <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>
        ${u.rewatch ? 'Da rivedere' : 'Voglio rivederlo'}
      </button>
    </div>`;
  }

  /* Ridisegna il minimo indispensabile.

     Riscrivere l'intera scheda a ogni tocco significa buttare via il
     <img> della locandina e ricrearlo: il browser riparte da un
     riquadro vuoto e la pagina sbatte le palpebre. Per "pronto" e
     "voglio rivederlo" cambiano solo i bottoni, e solo quelli tocco. */
  function aggiorna(soloComandi = false) {
    const m = Store.byId(currentId);
    if (!m) return close();

    if (soloComandi) {
      const zona = body.querySelector('.d-actions');
      if (zona) { zona.outerHTML = comandi(m); return; }
    }
    render();
  }

  /* ── su un film già visto: dove andare adesso ──────────
     Propone titoli che NON hai in libreria, agganciandosi
     al tuo voto. Se l'hai detestato, tacere è meglio che
     insistere con altri film uguali. */
  function scoperte(m) {
    const pool = m.scoperte || [];
    if (!pool.length) return '';

    const voto = m.user.myRating;
    if (voto && voto <= 2) return '';

    // Le altre interpretazioni degli attori parlano più dei "film simili".
    const ordinate = [...pool].sort((a, b) =>
      (b.tipo === 'attore') - (a.tipo === 'attore') || (b.votanti || 0) - (a.votanti || 0));
    const scelte = ordinate.slice(0, 3);

    const conAttore = scelte.find(s => s.tipo === 'attore');
    const titolo = !voto ? 'Visto questo, potresti andare qui'
      : voto >= 5 ? 'Se lo hai amato'
      : voto === 4 ? 'Se ti è piaciuto'
      : 'Restando da queste parti';

    const apertura = voto >= 4 && conAttore
      ? `Non perderti un'altra interpretazione di <b>${F.esc(conAttore.attore)}</b>.`
      : voto >= 4
        ? 'Questi tre gli somigliano, e non ce li hai in libreria.'
        : 'Tre titoli vicini che non hai ancora in lista.';

    return `<section class="d-section">
      <h4>${F.esc(titolo)}</h4>
      <p class="d-scoperte-intro">${apertura}</p>
      <div class="scoperte">
        ${scelte.map(s => `
          <a class="scop" href="https://www.themoviedb.org/movie/${s.tmdbId}"
             target="_blank" rel="noopener">
            <span class="scop-ph">${s.poster
              ? `<img src="${F.profilo(s.poster, 'w185')}" alt="" loading="lazy">` : ''}</span>
            <span class="scop-body">
              <b>${F.esc(s.titolo)}</b>
              <span class="scop-meta">${s.anno || '—'}${s.voto ? ` · ${s.voto.toFixed(1)}` : ''}</span>
              <span class="scop-perche">${s.tipo === 'attore'
                ? `con ${F.esc(s.attore)}` : 'stessa famiglia'}</span>
            </span>
          </a>`).join('')}
      </div>
    </section>`;
  }

  /* Solo per i film che non hai ancora visto: su quelli visti
     il posto del consiglio lo prende il tuo giudizio. */
  function perche(m) {
    if (m.user.seen) return scoperte(m);
    const p = Consiglia.perche(m, Store.all());
    // Qui la trama sta già nella scheda, poco più sotto: il gancio
    // sarebbe un doppione. Se non c'è un legame con la tua libreria
    // da raccontare, questo riquadro non ha niente da dire.
    if (!p || !p.frase) return '';

    return `<section class="d-perche">
      <span class="d-perche-et">Ti piacerà perché</span>
      <p class="d-perche-frase">${p.frase}</p>
      ${p.caveat || p.pratico ? `<p class="d-perche-coda">${
        [p.caveat, p.pratico].filter(Boolean).join(' ')}</p>` : ''}
    </section>`;
  }

  function statsBlock(m) {
    const cells = [
      m.rtScore != null && { v: `${m.rtScore}%`, l: 'Rotten Tomatoes', cls: m.rtScore >= 60 ? 'stat-good' : 'stat-rotten' },
      m.imdbRating && { v: m.imdbRating.toFixed(1), l: 'IMDb', cls: 'stat-hot' },
      m.metascore != null && { v: String(m.metascore), l: 'Metacritic' },
      m.tmdbRating && { v: m.tmdbRating.toFixed(1), l: 'voto TMDB', cls: 'stat-good' },
      m.tmdbVotes  && { v: m.tmdbVotes.toLocaleString('it-IT'), l: 'votanti TMDB' },
      // L'indice TMDB grezzo non dice niente: conta la posizione fra i tuoi film.
      (() => {
        if (!m.popularity) return null;
        const cl = Store.all().filter(x => x.popularity).sort((a, b) => b.popularity - a.popularity);
        const pos = cl.findIndex(x => x.id === m.id) + 1;
        return pos ? { v: `${pos}°`, l: `più chiacchierato dei tuoi ${cl.length}` } : null;
      })(),
      F.durata(m.runtime) && { v: F.durata(m.runtime), l: 'durata', cls: 'stat-accent' },
      F.soldi(m.budget)  && { v: F.soldi(m.budget),  l: 'budget', cls: 'stat-hot' },
      F.soldi(m.revenue) && { v: F.soldi(m.revenue), l: 'incasso', cls: 'stat-good' },
      m.releaseDate && { v: String(F.giorniA(m.releaseDate)), l: 'giorni all\'uscita', cls: 'stat-accent' }
    ].filter(Boolean);

    if (!cells.length) return '';
    return `<section class="d-section">
      <h4>Numeri</h4>
      <div class="d-stats">
        ${cells.map(c => `<div class="stat ${c.cls || ''}"><b>${F.esc(c.v)}</b><span>${F.esc(c.l)}</span></div>`).join('')}
      </div>
    </section>`;
  }

  function castBlock(m) {
    const people = (m.castDetail && m.castDetail.length)
      ? m.castDetail
      : m.cast.map(nome => ({ name: nome, character: null, profile: null }));
    if (!people.length) return '';

    return `<section class="d-section">
      <h4>Cast</h4>
      <div class="cast">
        ${people.slice(0, 12).map(p => {
          const img = F.profilo(p.profile);
          return `<figure>
            <div class="ph">${img
              ? `<img src="${img}" alt="" loading="lazy">`
              : `<i>${F.esc(F.iniziali(p.name))}</i>`}</div>
            <b>${F.esc(p.name)}</b>
            ${p.character ? `<span>${F.esc(p.character)}</span>` : ''}
          </figure>`;
        }).join('')}
      </div>
    </section>`;
  }

  /* ── interazioni ─────────────────────────────────────── */
  sheet.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return close();

    const star = e.target.closest('[data-star]');
    if (star) { Store.setRating(currentId, Number(star.dataset.star)); return render(); }

    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    // "Visto" cambia mezza scheda (il consiglio lascia il posto al voto),
    // gli altri due cambiano solo il proprio bottone.
    if (btn.dataset.act === 'seen')    { Store.toggleSeen(currentId);    aggiorna(); }
    if (btn.dataset.act === 'rewatch') { Store.toggleRewatch(currentId); aggiorna(true); }
    if (btn.dataset.act === 'pronto')  { Store.togglePronto(currentId);  aggiorna(true); }
    if (btn.dataset.act === 'sposta') {
      const m = Store.byId(currentId);
      Store.spostaIn(currentId, m.lista === 'cinema' ? 'casa' : 'cinema');
      render();
    }
    if (btn.dataset.act === 'elimina') {
      const m = Store.byId(currentId);
      Store.rimuovi(currentId);
      close();
      // Un ripensamento capita: lascio una via d'uscita per qualche secondo.
      Avviso.mostra(`<b>${F.esc(m.title)}</b> tolto dalla libreria`, 'Annulla',
        () => Store.ripristina(m.id));
    }
  });

  return { open, close, isOpen };
})();
