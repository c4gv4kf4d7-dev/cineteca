/* ══════════════════════════════════════════════════════════
   perte.js — la scheda dei consigli

   Mostra il ritratto del tuo gusto e la coda riordinata,
   ogni titolo accompagnato dal motivo per cui è lì.
   ══════════════════════════════════════════════════════════ */

const PerTe = (() => {
  const root = document.getElementById('perte');

  /* Estrazione del giorno: pesca a caso ma resta identica per tutta
     la giornata, così l'app non cambia sotto le dita mentre la usi,
     e domani propone altro. */
  function pescaOggi(lista, quanti, sale = '') {
    if (lista.length <= quanti) return lista;

    const oggi = new Date().toISOString().slice(0, 10) + sale;
    let seme = [...oggi].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
    const caso = () => (seme = (seme * 1664525 + 1013904223) >>> 0) / 4294967296;

    const mazzo = [...lista];
    for (let i = mazzo.length - 1; i > 0; i--) {
      const j = Math.floor(caso() * (i + 1));
      [mazzo[i], mazzo[j]] = [mazzo[j], mazzo[i]];
    }
    return mazzo.slice(0, quanti);
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

    // Pesco fra i primi dieci per affinità, non fra tutti: resta
    // una proposta sensata, ma cambia faccia ogni giorno.
    const divano = pescaOggi(
      Consiglia.classifica(tutti, { lista: 'casa', quanti: 10 }).voci, 3, 'divano');

    root.innerHTML = ritratto(esito.profilo, esito.visti)
      + coda('Se stasera resti sul divano', divano, tutti,
          'Tre pescati fra i più affini della tua lista, diversi ogni giorno.')
      + daRivedere(tutti)
      + affinita(tutti);
  }

  /* ── i film che aspetti di rivedere ──────────────────── */
  function daRivedere(tutti) {
    const voci = tutti.filter(m => m.user.rewatch);
    if (!voci.length) return '';

    // Chi è già uscito viene prima: è quello che puoi rivedere stasera.
    const guardabile = m => (F.giorniA(m.releaseDate) ?? 1) <= 0;
    const disponibili = pescaOggi(voci.filter(guardabile), 3, 'rivedere');
    const attesa = pescaOggi(voci.filter(m => !guardabile(m)), 3 - disponibili.length, 'attesa');

    const riga = m => `<button class="cons" data-open="${F.esc(m.id)}">
      <span class="cons-ph">${F.poster(m, 'w185')
        ? `<img src="${F.poster(m, 'w185')}" alt="" loading="lazy">` : ''}</span>
      <span class="cons-body">
        <b>${F.esc(m.title)}</b>
        <span class="cons-meta">${F.esc(F.dataBreve(m.releaseDate))}${
          m.user.myRating ? ` · ${'★'.repeat(m.user.myRating)}` : ''}</span>
        <span class="cons-perche">${(F.giorniA(m.releaseDate) ?? 1) <= 0
          ? 'pronto da rivedere' : 'non ancora uscito'}</span>
      </span>
      <span class="cons-punti">${(F.giorniA(m.releaseDate) ?? 1) <= 0 ? '🍿' : '↻'}</span>
    </button>`;

    return `<section class="s-block">
      <h3>Da rivedere</h3>
      <div class="consigli">
        ${[...disponibili, ...attesa].map(riga).join('')}
      </div>
      <p class="nota">${voci.length > 3
        ? `Tre pescati fra i ${voci.length} che vuoi rivedere, diversi ogni giorno. `
        : ''}Quelli già usciti vengono per primi.</p>
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
  function coda(titolo, voci, tutti, nota = '') {
    if (!voci.length) return '';

    return `<section class="s-block">
      <h3>${F.esc(titolo)}</h3>
      <div class="consigli">
        ${voci.map((v, i) => {
          const m = v.film;
          // Una frase scritta per questo film, non tre etichette uguali per tutti.
          const p = Consiglia.perche(m, tutti);
          const coda2 = [p?.caveat, p?.pratico].filter(Boolean).join(' ');
          return `<button class="cons" data-open="${F.esc(m.id)}">
            <span class="cons-pos">${i + 1}</span>
            <span class="cons-ph">${F.poster(m, 'w185')
              ? `<img src="${F.poster(m, 'w185')}" alt="" loading="lazy">` : ''}</span>
            <span class="cons-body">
              <b>${F.esc(m.title)}</b>
              <span class="cons-meta">${F.esc(F.dataBreve(m.releaseDate))}${
                m.genres[0] ? ` · ${F.esc(m.genres[0])}` : ''}${
                F.durata(m.runtime) ? ` · ${F.durata(m.runtime)}` : ''}</span>
              ${p ? `<span class="cons-perche">${p.frase}</span>` : ''}
              ${coda2 ? `<span class="cons-coda">${coda2}</span>` : ''}
            </span>
            <span class="cons-punti" title="Affinità stimata">${Math.round(v.punti)}</span>
          </button>`;
        }).join('')}
      </div>
      ${nota ? `<p class="nota">${F.esc(nota)}</p>` : ''}
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
