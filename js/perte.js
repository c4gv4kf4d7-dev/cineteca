/* ══════════════════════════════════════════════════════════
   perte.js — la scheda dei consigli

   Mostra il ritratto del tuo gusto e la coda riordinata,
   ogni titolo accompagnato dal motivo per cui è lì.
   ══════════════════════════════════════════════════════════ */

const PerTe = (() => {
  const root = document.getElementById('perte');

  let notizie = null;   // caricate una volta sola, alla prima apertura

  async function caricaNotizie() {
    if (notizie !== null) return notizie;
    try {
      const res = await fetch(`data/notizie.json?t=${Date.now()}`);
      notizie = res.ok ? await res.json() : { notizie: [] };
    } catch { notizie = { notizie: [] }; }
    return notizie;
  }

  function render() {
    try { disegna(); }
    catch (err) {
      console.error('Consigli non disegnabili:', err);
      root.innerHTML = `<p class="empty">I consigli non si sono caricati.<br><small>${F.esc(err.message)}</small></p>`;
    }
  }

  function disegna() {
    const tutti = Store.all();
    const esito = Consiglia.classifica(tutti, { quanti: 10 });

    if (!esito.pronti) {
      root.innerHTML = `<p class="empty">Servono almeno 3 film visti per capire i tuoi gusti.<br>
        Al momento ne ho ${esito.visti}.</p>`;
      return;
    }

    root.innerHTML = ritratto(esito.profilo, esito.visti)
      + coda('Se stasera vai al cinema', Consiglia.classifica(tutti, { lista: 'cinema', quanti: 4 }).voci)
      + coda('Se stasera resti sul divano', Consiglia.classifica(tutti, { lista: 'casa', quanti: 6 }).voci)
      + affinita(tutti)
      + '<div id="rassegna"></div>';

    // La rassegna arriva da un file a parte: la innesto quando è pronta.
    caricaNotizie().then(n => {
      const box = document.getElementById('rassegna');
      if (box) box.innerHTML = rassegna(n);
    });
  }

  /* ── si parla di loro ────────────────────────────────── */
  function rassegna(dati) {
    const voci = (dati?.notizie || []).slice(0, 12);
    if (!voci.length) return '';

    const quando = iso => {
      if (!iso) return '';
      const g = Math.round((Date.now() - new Date(iso)) / 86400000);
      return g <= 0 ? 'oggi' : g === 1 ? 'ieri' : `${g} giorni fa`;
    };

    return `<section class="s-block">
      <h3>Si parla di loro</h3>
      <div class="rassegna">
        ${voci.map(n => `
          <a class="news" href="${F.esc(n.link)}" target="_blank" rel="noopener">
            <span class="news-top">
              <span class="news-fonte">${F.esc(n.fonte)}</span>
              <span class="news-quando">${F.esc(quando(n.data))}</span>
            </span>
            <b class="news-titolo">${F.esc(n.titolo)}</b>
            <span class="news-chi">
              ${n.citati.slice(0, 3).map(c =>
                `<i class="news-tag news-${c.tipo}">${F.esc(c.nome)}</i>`).join('')}
            </span>
          </a>`).join('')}
      </div>
      <p class="nota">Da ${F.esc((dati.fonti || []).join(', '))}.
      Tengo solo gli articoli che nominano un film, un regista o un attore che hai in libreria —
      aggiornati l'ultima volta ${F.esc(quando(dati.aggiornato))}.</p>
    </section>`;
  }

  /* ── chi sei, secondo i tuoi film ────────────────────── */
  function ritratto(p, quanti) {
    const r = Consiglia.ritratto(p);
    const frase = [];

    // Elenco all'italiana: virgole e una "e" prima dell'ultimo.
    const elenca = (voci, mappa = x => x) => {
      const l = voci.map(v => `<b>${F.esc(mappa(v))}</b>`);
      return l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l.at(-1)}` : l[0];
    };

    if (r.generi.length)
      frase.push(`ti muovi soprattutto tra ${elenca(r.generi, g => g.nome.toLowerCase())}`);
    if (r.registi.length)
      frase.push(`torni volentieri da ${elenca(r.registi, x => x.nome)}`);
    if (r.durata)
      frase.push(`la tua misura è <b>${F.durata(r.durata)}</b>`);

    const scarto = r.scarto == null ? null
      : r.scarto > 8  ? `Sei più generoso della critica, di circa ${r.scarto} punti su cento.`
      : r.scarto < -8 ? `Sei più severo della critica, di circa ${Math.abs(r.scarto)} punti su cento.`
      : 'I tuoi voti seguono la critica da vicino.';

    return `<section class="ritratto">
      <span class="ph-kicker">Il tuo ritratto</span>
      <p class="ritratto-frase">Su ${quanti} film, ${frase.join('; ')}.</p>
      ${scarto ? `<p class="nota">${scarto}</p>` : `<p class="nota">Vota qualche film con le stelle e il ritratto diventerà molto più preciso.</p>`}
      ${r.attori.length ? `<div class="ritratto-tag">
        ${r.attori.map(a => `<span class="fact">${F.esc(a.nome)}</span>`).join('')}
      </div>` : ''}
    </section>`;
  }

  /* ── la coda riordinata ──────────────────────────────── */
  function coda(titolo, voci) {
    if (!voci.length) return '';

    return `<section class="s-block">
      <h3>${F.esc(titolo)}</h3>
      <div class="consigli">
        ${voci.map((v, i) => {
          const m = v.film;
          return `<button class="cons" data-open="${F.esc(m.id)}">
            <span class="cons-pos">${i + 1}</span>
            <span class="cons-ph">${F.poster(m, 'w185')
              ? `<img src="${F.poster(m, 'w185')}" alt="" loading="lazy">` : ''}</span>
            <span class="cons-body">
              <b>${F.esc(m.title)}</b>
              <span class="cons-meta">${F.esc(F.dataBreve(m.releaseDate))}${
                m.genres[0] ? ` · ${F.esc(m.genres[0])}` : ''}${
                F.durata(m.runtime) ? ` · ${F.durata(m.runtime)}` : ''}</span>
              ${v.motivi.length ? `<span class="cons-perche">${F.esc(v.motivi.join(' · '))}</span>` : ''}
            </span>
            <span class="cons-punti" title="Affinità stimata">${Math.round(v.punti)}</span>
          </button>`;
        }).join('')}
      </div>
    </section>`;
  }

  /* ── quanto i tuoi voti si allontanano dalla critica ─── */
  function affinita(tutti) {
    const con = tutti.filter(m => m.user.seen && m.user.myRating
      && (m.rtScore != null || m.metascore != null));
    if (con.length < 3) return '';

    const voci = con.map(m => {
      const c = [m.rtScore, m.metascore].filter(x => x != null);
      const critica = Math.round(c.reduce((a, b) => a + b, 0) / c.length);
      return { m, mio: m.user.myRating / 5 * 100, critica, delta: Math.round(m.user.myRating / 5 * 100 - critica) };
    }).sort((a, b) => b.delta - a.delta);

    return `<section class="s-block">
      <h3>Tu contro la critica</h3>
      <div class="s-panel">
        ${Chart.manubri(
          voci.map(v => ({ id: v.m.id, titolo: v.m.title, mio: Math.round(v.mio), critica: v.critica })),
          [{ chiave: 'mio', nome: 'il tuo voto', colore: '#FFC24D' },
           { chiave: 'critica', nome: 'la critica', colore: '#4DE3FF' }]
        )}
        <p class="nota">In cima i film che hai amato più della critica,
        in fondo quelli su cui sei stato più duro.
        ${voci[0].delta > 10 ? `Il tuo caso più clamoroso è <b>${F.esc(voci[0].m.title)}</b>.` : ''}</p>
      </div>
    </section>`;
  }

  root.addEventListener('click', e => {
    const apri = e.target.closest('[data-open]');
    if (apri) Detail.open(apri.dataset.open);
  });

  return { render };
})();
