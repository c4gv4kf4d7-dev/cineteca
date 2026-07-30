/* ══════════════════════════════════════════════════════════
   charts.js — grafici in SVG puro, nessuna libreria

   Tutto disegnato su viewBox 0..100 in larghezza, così le
   proporzioni reggono a qualsiasi dimensione del contenitore.
   ══════════════════════════════════════════════════════════ */

const Chart = (() => {

  /* ── barre orizzontali con locandina ─────────────────── */
  function barre(voci, { formato = v => v, colore = 'var(--accent)', scala = 'lineare' } = {}) {
    if (!voci.length) return '';
    const max = Math.max(...voci.map(v => v.valore));

    /* Con un valore fuori scala (un ×612 fra dei ×3) la scala lineare
       schiaccia tutti gli altri a una riga invisibile. La radice
       comprime l'estremo senza falsare l'ordine né i numeri scritti. */
    const larghezza = v => {
      if (scala !== 'compressa') return v / max * 100;
      const k = 0.34;                       // quanto comprimere: più basso, più piatto
      return Math.pow(v / max, k) * 100;
    };

    return `<div class="cbars">
      ${voci.map((v, i) => `
        <button class="cbar" ${v.id ? `data-open="${F.esc(v.id)}"` : ''}>
          <span class="cbar-pos">${i + 1}</span>
          ${v.poster ? `<span class="cbar-ph"><img src="${v.poster}" alt="" loading="lazy"></span>` : ''}
          <span class="cbar-main">
            <span class="cbar-top">
              <b>${F.esc(v.etichetta)}</b>
              <i>${F.esc(formato(v.valore))}</i>
            </span>
            <span class="cbar-track">
              <span class="cbar-fill" style="width:${larghezza(v.valore).toFixed(1)}%;background:${colore}"></span>
            </span>
            ${v.sotto ? `<span class="cbar-sotto">${F.esc(v.sotto)}</span>` : ''}
          </span>
        </button>`).join('')}
    </div>`;
  }

  /* ── manubri: più voti a confronto sullo stesso film ─── */
  function manubri(voci, serie) {
    if (!voci.length) return '';

    return `<div class="dumb">
      <div class="dumb-legenda">
        ${serie.map(s => `<span><i style="background:${s.colore}"></i>${F.esc(s.nome)}</span>`).join('')}
      </div>
      ${voci.map(v => {
        const punti = serie
          .map(s => ({ ...s, valore: v[s.chiave] }))
          .filter(p => p.valore != null)
          .sort((a, b) => a.valore - b.valore);
        if (!punti.length) return '';
        const min = punti[0].valore, max = punti.at(-1).valore;

        return `<button class="dumb-riga" data-open="${F.esc(v.id)}">
          <span class="dumb-nome">${F.esc(v.titolo)}</span>
          <span class="dumb-scala">
            ${punti.length > 1
              ? `<span class="dumb-link" style="left:${min}%;width:${max - min}%"></span>` : ''}
            ${punti.map(p => `<span class="dumb-punto" style="left:${p.valore}%;background:${p.colore}"
                                    title="${F.esc(p.nome)} ${p.valore}"></span>`).join('')}
          </span>
          <span class="dumb-delta">${punti.length > 1 ? `Δ${max - min}` : '—'}</span>
        </button>`;
      }).join('')}
    </div>`;
  }

  /* ── dispersione budget/incasso, scala logaritmica ───── */
  function dispersione(punti, { xEtichetta, yEtichetta }) {
    if (punti.length < 2) return '';

    const log = v => Math.log10(Math.max(v, 1));
    const xs = punti.map(p => log(p.x)), ys = punti.map(p => log(p.y));
    const minL = Math.floor(Math.min(...xs, ...ys));
    const maxL = Math.ceil(Math.max(...xs, ...ys));
    const scala = v => (log(v) - minL) / (maxL - minL) * 100;

    const tacche = [];
    for (let e = minL; e <= maxL; e++) tacche.push(Math.pow(10, e));

    return `<div class="disp">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="disp-svg" aria-hidden="true">
        ${tacche.map(t => `<line x1="${scala(t)}" y1="0" x2="${scala(t)}" y2="100" class="disp-griglia"/>
                           <line x1="0" y1="${100 - scala(t)}" x2="100" y2="${100 - scala(t)}" class="disp-griglia"/>`).join('')}
        <line x1="0" y1="100" x2="100" y2="0" class="disp-pari"/>
      </svg>
      <div class="disp-punti">
        ${punti.map(p => `
          <button class="disp-p ${p.y >= p.x ? 'is-su' : 'is-giu'}"
                  style="left:${scala(p.x)}%; bottom:${scala(p.y)}%"
                  data-open="${F.esc(p.id)}"
                  title="${F.esc(p.etichetta)} — ${F.esc(p.nota)}">
            <span class="disp-tip">${F.esc(p.etichetta)}<i>${F.esc(p.nota)}</i></span>
          </button>`).join('')}
      </div>
      <span class="disp-x">${F.esc(xEtichetta)} →</span>
      <span class="disp-y">${F.esc(yEtichetta)} →</span>
      <span class="disp-pari-et">in pari</span>
    </div>`;
  }

  /* ── istogramma verticale ────────────────────────────── */
  function istogramma(colonne, { formato = v => v } = {}) {
    const max = Math.max(...colonne.map(c => c.valore), 1);
    return `<div class="isto">
      ${colonne.map(c => `
        <div class="isto-col ${c.valore ? '' : 'is-vuoto'}" ${c.nota ? `title="${F.esc(c.nota)}"` : ''}>
          <span class="isto-v">${c.valore ? formato(c.valore) : ''}</span>
          <span class="isto-b" style="height:${c.valore ? Math.max(6, c.valore / max * 100) : 2}%"></span>
          <span class="isto-e">${F.esc(c.etichetta)}</span>
        </div>`).join('')}
    </div>`;
  }

  /* ── anello di ripartizione ──────────────────────────── */
  function anello(fette, centro) {
    const tot = fette.reduce((s, f) => s + f.valore, 0);
    if (!tot) return '';
    const R = 42, C = 2 * Math.PI * R;
    let offset = 0;

    return `<div class="anello">
      <svg viewBox="0 0 100 100">
        ${fette.map(f => {
          const quota = f.valore / tot;
          const el = `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${f.colore}" stroke-width="13"
            stroke-dasharray="${(quota * C).toFixed(2)} ${C}" stroke-dashoffset="${(-offset * C).toFixed(2)}"
            transform="rotate(-90 50 50)"><title>${F.esc(f.nome)}: ${f.valore}</title></circle>`;
          offset += quota;
          return el;
        }).join('')}
        <text x="50" y="47" class="anello-n">${F.esc(String(centro.numero))}</text>
        <text x="50" y="60" class="anello-e">${F.esc(centro.etichetta)}</text>
      </svg>
      <div class="anello-leg">
        ${fette.map(f => `<span><i style="background:${f.colore}"></i>${F.esc(f.nome)} <b>${f.valore}</b></span>`).join('')}
      </div>
    </div>`;
  }

  return { barre, manubri, dispersione, istogramma, anello };
})();
