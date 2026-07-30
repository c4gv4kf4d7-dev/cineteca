/* ══════════════════════════════════════════════════════════
   notizie.js — la rassegna, in una scheda sua

   Poche notizie, raggruppate per film, tutte italiane.
   Sopra le tre da non perdere, sotto i temi della settimana.
   ══════════════════════════════════════════════════════════ */

const Notizie = (() => {
  const root = document.getElementById('notizie');
  const LETTE = 'cineteca:notizie-lette';
  let dati = null;

  const lette = () => {
    try { return new Set(JSON.parse(localStorage.getItem(LETTE)) || []); }
    catch { return new Set(); }
  };
  const segna = links => {
    try { localStorage.setItem(LETTE, JSON.stringify([...links].slice(-200))); } catch { /* pazienza */ }
  };

  const quando = iso => {
    if (!iso) return '';
    const g = Math.round((Date.now() - new Date(iso)) / 86400000);
    return g <= 0 ? 'oggi' : g === 1 ? 'ieri' : `${g} giorni fa`;
  };

  async function carica() {
    if (dati) return dati;
    try {
      const res = await fetch(`data/notizie.json?t=${Date.now()}`);
      dati = res.ok ? await res.json() : { notizie: [] };
    } catch { dati = { notizie: [] }; }
    return dati;
  }

  async function render() {
    const d = await carica();
    const tutte = d.notizie || [];
    if (!tutte.length) {
      root.innerHTML = '<p class="empty">Nessuna notizia sui tuoi film in questo momento.</p>';
      return;
    }

    const viste = lette();
    const perLink = new Map(tutte.map(n => [n.link, n]));
    const evidenza = (d.evidenza || []).map(l => perLink.get(l)).filter(Boolean);
    const gruppi = (d.gruppi || []).map(g => ({
      ...g, voci: g.link.map(l => perLink.get(l)).filter(Boolean)
    })).filter(g => g.voci.length);

    root.innerHTML = `
      ${evidenza.length ? `<section class="n-top">
        <span class="ph-kicker">Da non perdere</span>
        <div class="n-top-griglia">${evidenza.map(n => grande(n, viste)).join('')}</div>
      </section>` : ''}

      ${gruppi.map(g => `
        <section class="n-tema">
          <h3 class="n-tema-testa">
            <span>${F.esc(g.soggetto)}</span>
            ${g.quante > g.voci.length
              ? `<i>${g.quante} notizie, le ${g.voci.length} principali</i>`
              : `<i>${g.quante} ${g.quante === 1 ? 'notizia' : 'notizie'}</i>`}
          </h3>
          <div class="n-lista">${g.voci.map(n => riga(n, viste)).join('')}</div>
        </section>`).join('')}

      <p class="nota">Da ${F.esc((d.fonti || []).join(', '))} — solo testate italiane.
      Tengo gli articoli che nominano nel titolo un tuo film, un regista che segui
      o un attore che hai visto almeno tre volte. Aggiornato ${F.esc(quando(d.aggiornato))}.</p>`;

    // Aprire la scheda vale come lettura.
    setTimeout(() => segna(new Set([...viste, ...tutte.map(n => n.link)])), 2500);
  }

  const grande = (n, viste) => `
    <a class="n-grande${viste.has(n.link) ? '' : ' is-nuova'}"
       href="${F.esc(n.link)}" target="_blank" rel="noopener">
      <span class="n-meta">
        <span class="news-fonte">${F.esc(n.fonte)}</span>
        <span class="news-quando">${F.esc(quando(n.data))}</span>
      </span>
      <b>${F.esc(n.titolo)}</b>
      ${n.sommario ? `<span class="n-sommario">${F.esc(n.sommario.slice(0, 130))}…</span>` : ''}
    </a>`;

  const riga = (n, viste) => `
    <a class="n-riga${viste.has(n.link) ? '' : ' is-nuova'}"
       href="${F.esc(n.link)}" target="_blank" rel="noopener">
      <span class="n-riga-testo">
        <b>${F.esc(n.titolo)}</b>
        <span class="n-meta">
          <span class="news-fonte">${F.esc(n.fonte)}</span>
          <span class="news-quando">${F.esc(quando(n.data))}</span>
        </span>
      </span>
      <svg class="n-freccia" viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9"/></svg>
    </a>`;

  return { render };
})();
