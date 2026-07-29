/* ══════════════════════════════════════════════════════════
   stats.js — la stagione, raccontata per immagini

   Niente muri di cifre: ogni dato si appoggia a una locandina,
   a un volto o a una barra, così l'occhio trova un appiglio.
   ══════════════════════════════════════════════════════════ */

const Stats = (() => {
  const root = document.getElementById('stats');

  function render() {
    const films = Store.all();
    const visti = films.filter(m => m.user.seen);

    if (!films.length) { root.innerHTML = '<p class="empty">Catalogo vuoto.</p>'; return; }
    if (!visti.length) { root.innerHTML = '<p class="empty">Segna qualche film come visto e qui comparirà la tua stagione.</p>'; return; }

    root.innerHTML = manifesto(visti)
      + podio(visti)
      + volti(visti)
      + record(visti)
      + ritmo(visti)
      + davanti(films.filter(m => !m.user.seen));
  }

  /* ── il manifesto: tre numeri grandi su un fotogramma ── */
  function manifesto(visti) {
    const minuti = visti.filter(m => m.runtime).reduce((s, m) => s + m.runtime, 0);
    const ore    = Math.floor(minuti / 60);
    const sfondo = [...visti].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
    const bg     = F.backdrop(sfondo) || F.poster(sfondo, 'w780');
    const anno   = new Date().getFullYear();

    return `<section class="poster-hero">
      ${bg ? `<img src="${bg}" alt="" class="ph-bg">` : ''}
      <div class="ph-inner">
        <span class="ph-kicker">La stagione ${anno}</span>
        <div class="ph-numbers">
          <div><b>${visti.length}</b><span>film</span></div>
          <div><b>${ore}</b><span>ore</span></div>
          <div><b>${visti.length}</b><span>🍿 secchielli<i>stima, uno a film</i></span></div>
        </div>
        <p class="ph-foot">${F.esc(minuti ? `${Math.round(minuti / visti.filter(m => m.runtime).length)} minuti di media per film` : '')}</p>
      </div>
    </section>`;
  }

  /* ── il podio: i tre più amati dalla critica ─────────── */
  function podio(visti) {
    const conRT = visti.filter(m => m.rtScore != null).sort((a, b) => b.rtScore - a.rtScore);
    if (conRT.length < 2) return '';

    const tre = conRT.slice(0, 3);
    const ordineVisivo = [tre[1], tre[0], tre[2]].filter(Boolean);   // 2° · 1° · 3°

    return blocco('Il podio della critica', `
      <div class="podio">
        ${ordineVisivo.map(m => {
          const posto = tre.indexOf(m) + 1;
          return `<button class="pod pod-${posto}" data-open="${F.esc(m.id)}">
            <span class="pod-medal">${['🥇','🥈','🥉'][posto - 1]}</span>
            <span class="pod-poster">${F.poster(m)
              ? `<img src="${F.poster(m)}" alt="" loading="lazy">`
              : `<i>${F.esc(F.iniziali(m.title))}</i>`}</span>
            <b class="pod-score">${m.rtScore}%</b>
            <span class="pod-title">${F.esc(m.title)}</span>
          </button>`;
        }).join('')}
      </div>
      ${conRT.length > 3 ? `<p class="nota">Il più stroncato: <b>${F.esc(conRT.at(-1).title)}</b>, ${conRT.at(-1).rtScore}%</p>` : ''}
    `);
  }

  /* ── i volti dell'anno ───────────────────────────────── */
  function volti(visti) {
    // Solo attori di primo piano: oltre i primi ruoli il conteggio perde senso.
    const conta = new Map();
    for (const m of visti) {
      for (const p of (m.castDetail || []).slice(0, 8)) {
        if (!conta.has(p.name)) conta.set(p.name, { nome: p.name, profile: p.profile, film: [] });
        conta.get(p.name).film.push(m);
      }
    }
    const top = [...conta.values()].sort((a, b) => b.film.length - a.film.length).slice(0, 12);
    if (!top.length || top[0].film.length < 2) return '';

    const ricorrenti = top.filter(p => p.film.length > 1);
    return blocco('I volti dell\'anno', `
      <div class="volti">
        ${ricorrenti.map(p => `
          <figure class="volto">
            <span class="volto-ph">
              ${F.profilo(p.profile) ? `<img src="${F.profilo(p.profile)}" alt="" loading="lazy">`
                                     : `<i>${F.esc(F.iniziali(p.nome))}</i>`}
              <b class="volto-n">${p.film.length}</b>
            </span>
            <figcaption>
              <b>${F.esc(p.nome)}</b>
              <span>${p.film.map(f => F.esc(f.title)).join(' · ')}</span>
            </figcaption>
          </figure>`).join('')}
      </div>`);
  }

  /* ── i record, ognuno con la sua locandina ───────────── */
  function record(visti) {
    const primo = (filtro, ordina) => [...visti].filter(filtro).sort(ordina)[0];

    const voci = [
      { et: 'Budget più alto',   m: primo(m => m.budget,  (a,b) => b.budget - a.budget),   val: m => F.soldi(m.budget) },
      { et: 'Ha incassato di più', m: primo(m => m.revenue, (a,b) => b.revenue - a.revenue), val: m => F.soldi(m.revenue) },
      { et: 'Il più lungo',      m: primo(m => m.runtime, (a,b) => b.runtime - a.runtime), val: m => F.durata(m.runtime) },
      { et: 'Il più corto',      m: primo(m => m.runtime, (a,b) => a.runtime - b.runtime), val: m => F.durata(m.runtime) },
      { et: 'Il più votato su IMDb', m: primo(m => m.imdbRating, (a,b) => b.imdbRating - a.imdbRating), val: m => m.imdbRating.toFixed(1) },
      { et: 'Il mio voto più alto', m: primo(m => m.user.myRating, (a,b) => b.user.myRating - a.user.myRating), val: m => '★'.repeat(m.user.myRating) }
    ].filter(v => v.m);

    const incasso = visti.reduce((s, m) => s + (m.revenue || 0), 0);

    return blocco('Gli estremi', `
      <div class="record">
        ${voci.map(v => `
          <button class="rec" data-open="${F.esc(v.m.id)}">
            <span class="rec-poster">${F.poster(v.m, 'w185')
              ? `<img src="${F.poster(v.m, 'w185')}" alt="" loading="lazy">` : ''}</span>
            <span class="rec-body">
              <span class="rec-et">${F.esc(v.et)}</span>
              <b class="rec-val">${F.esc(v.val(v.m))}</b>
              <span class="rec-film">${F.esc(v.m.title)}</span>
            </span>
          </button>`).join('')}
      </div>
      ${incasso ? `<p class="nota">In totale i film che hai visto hanno incassato <b>${F.soldi(incasso)}</b> nel mondo.</p>` : ''}
    `);
  }

  /* ── il ritmo: quanti film mese per mese ─────────────── */
  function ritmo(visti) {
    const conData = visti.filter(m => m.releaseDate);
    if (!conData.length) return '';

    const perMese = new Map(F.MESI.map((_, i) => [i, []]));
    for (const m of conData) perMese.get(m.releaseDate.getMonth()).push(m);
    const max = Math.max(...[...perMese.values()].map(v => v.length));

    return blocco('Il ritmo dell\'anno', `
      <div class="ritmo">
        ${[...perMese.entries()].map(([i, lista]) => `
          <div class="rit ${lista.length ? '' : 'is-vuoto'}" ${lista.length ? `title="${F.esc(lista.map(m => m.title).join(', '))}"` : ''}>
            <span class="rit-barra" style="height:${lista.length ? Math.max(8, lista.length / max * 100) : 3}%"></span>
            <span class="rit-n">${lista.length || ''}</span>
            <span class="rit-m">${F.MESI[i].slice(0, 3)}</span>
          </div>`).join('')}
      </div>
      <p class="nota">Per mese di uscita in Italia — non di quando l'hai visto.</p>`);
  }

  /* ── cosa resta davanti ──────────────────────────────── */
  function davanti(daVedere) {
    if (!daVedere.length) return '';
    const cinema = daVedere.filter(m => m.lista === 'cinema');
    const casa   = daVedere.filter(m => m.lista === 'casa');
    const minuti = daVedere.filter(m => m.runtime).reduce((s, m) => s + m.runtime, 0);

    return blocco('Quel che ti aspetta', `
      <div class="avanti">
        <button class="av" data-vai="cinema">
          <b>${cinema.length}</b><span>🎟️ al cinema</span>
        </button>
        <button class="av" data-vai="casa">
          <b>${casa.length}</b><span>🛋️ sul divano</span>
        </button>
        <div class="av av-statico">
          <b>${Math.floor(minuti / 60)}h</b><span>già in coda</span>
        </div>
      </div>`);
  }

  /* ── impalcatura ─────────────────────────────────────── */
  const blocco = (titolo, dentro) => `<section class="s-block">
    <h3>${F.esc(titolo)}</h3>
    <div class="s-panel">${dentro}</div>
  </section>`;

  root.addEventListener('click', e => {
    const apri = e.target.closest('[data-open]');
    if (apri) return Detail.open(apri.dataset.open);

    const vai = e.target.closest('[data-vai]');
    if (vai) {
      document.querySelector('[data-view="library"]').click();
      document.querySelector(`[data-status="${vai.dataset.vai}"]`).click();
    }
  });

  return { render };
})();
