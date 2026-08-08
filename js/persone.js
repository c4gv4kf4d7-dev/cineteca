/* ══════════════════════════════════════════════════════════
   persone.js — la libreria vista dalle persone

   Le statistiche contano già quante volte un volto ricorre.
   Qui la domanda è un'altra: quel volto ti piace? Un attore
   incrociato cinque volte e sempre votato due stelle non è
   una costante, è un'abitudine sbagliata — e va detto.

   Regia e cast finiscono nello stesso indice: quando cerchi
   "chi seguo davvero" non ti interessa in che ruolo.
   ══════════════════════════════════════════════════════════ */

const Persone = (() => {

  /* Quanto in alto nella locandina bisogna stare per contare.
     Oltre il sesto nome si entra nei ruoli di passaggio: comparirebbero
     persone che non hai nemmeno notato. */
  const PROFONDITA = 6;

  /* ── l'indice ─────────────────────────────────────────
     Una voce per nome, con i film divisi in due mucchi:
     quelli che hai visto (da cui esce il giudizio) e quelli
     che ti restano in lista (da cui esce il consiglio). */
  function indice(tutti) {
    const mappa = new Map();

    const tocca = (nome, profile, film, ruolo) => {
      if (!nome) return;
      if (!mappa.has(nome))
        mappa.set(nome, { nome, profile: null, ruoli: new Set(), visti: [], inLista: [] });
      const p = mappa.get(nome);
      if (profile && !p.profile) p.profile = profile;
      p.ruoli.add(ruolo);
      (film.user.seen ? p.visti : p.inLista).push(film);
    };

    for (const m of tutti) {
      tocca(m.director, null, m, 'regia');
      for (const c of (m.castDetail || []).slice(0, PROFONDITA)) tocca(c.name, c.profile, m, 'cast');
    }

    /* Il giudizio arriva solo dai film visti: uno che hai in lista
       e non hai ancora guardato non dice niente sul tuo gusto. */
    for (const p of mappa.values()) {
      const votati = p.visti.filter(m => m.user.myRating);
      p.votoMedio = votati.length
        ? votati.reduce((s, m) => s + m.user.myRating, 0) / votati.length : null;
      p.votati = votati.length;
      p.gradimento = p.visti.length
        ? p.visti.reduce((s, m) => s + Consiglia.gradimento(m), 0) / p.visti.length : 0;
      // Due film buoni dicono più di uno solo: la fiducia cresce con le prove.
      p.punti = p.gradimento * Math.sqrt(p.visti.length);
    }

    return mappa;
  }

  /* ── le costanti: chi torna, e come ne esci ───────────
     Serve l'incrocio, non la frequenza: almeno due film visti,
     altrimenti è un caso, non una costante. */
  function costanti(tutti, { minimo = 2, quanti = 12 } = {}) {
    return [...indice(tutti).values()]
      .filter(p => p.visti.length >= minimo)
      .sort((a, b) => b.punti - a.punti || b.visti.length - a.visti.length)
      .slice(0, quanti);
  }

  /* ── il legame di un singolo film con la tua libreria ──
     Chi, di questo film, hai già incrociato altrove. Lo usa la
     scheda per rispondere alla domanda "e a me perché riguarda?". */
  function legame(film, tutti) {
    const idx = indice(tutti.filter(m => m.id !== film.id));
    const nomi = [
      film.director && { nome: film.director, ruolo: 'regia' },
      ...(film.castDetail || []).slice(0, PROFONDITA).map(c => ({ nome: c.name, ruolo: 'cast', profile: c.profile }))
    ].filter(Boolean);

    return nomi
      .map(n => ({ ...n, p: idx.get(n.nome) }))
      .filter(n => n.p && n.p.visti.length)
      .sort((a, b) => b.p.visti.length - a.p.visti.length || b.p.punti - a.p.punti);
  }

  /* ── la sezione "Le tue costanti" ─────────────────────
     Ogni scheda dice tre cose: quante volte, come è andata,
     e cosa ti aspetta ancora di quella persona. */
  function sezione(tutti) {
    const voci = costanti(tutti);
    if (voci.length < 3) return '';

    /* Chi ti ha deluso non sta in mezzo agli altri con un numero più
       basso: sarebbe un dettaglio che si perde. Sta in fondo, detto
       a parole. */
    const amati   = voci.filter(p => p.punti > 0.05);
    const delusi  = voci.filter(p => p.punti < -0.05);

    if (!amati.length) return '';

    const scheda = p => {
      const stelle = p.votoMedio ? '★'.repeat(Math.round(p.votoMedio)) : '';
      const attesa = p.inLista.length;
      return `<button class="pers" data-persona="${F.esc(p.nome)}">
        <span class="pers-ph">${p.profile
          ? `<img src="${F.profilo(p.profile)}" alt="" loading="lazy">`
          : `<i>${F.esc(F.iniziali(p.nome))}</i>`}</span>
        <span class="pers-body">
          <b>${F.esc(p.nome)}</b>
          <span class="pers-meta">${p.visti.length} film${
            p.ruoli.has('regia') ? p.ruoli.has('cast') ? ' · regia e recitazione' : ' · regia' : ''}</span>
          ${stelle ? `<span class="pers-voto">${stelle}<i> in media</i></span>`
                   : '<span class="pers-voto pers-muto">nessun voto tuo</span>'}
          ${attesa ? `<span class="pers-attesa">${attesa === 1
            ? `ne hai ancora uno in lista: <i>${F.esc(p.inLista[0].title)}</i>`
            : `ne hai altri ${attesa} in lista`}</span>` : ''}
        </span>
      </button>`;
    };

    const capofila = amati[0];
    return `<section class="s-block">
      <h3>Le tue costanti</h3>
      <div class="persone">${amati.map(scheda).join('')}</div>
      <p class="nota">Le persone che ricorrono nei film che hai visto, ordinate
      per come sono andate — non per quante volte compaiono.
      In cima c'è <b>${F.esc(capofila.nome)}</b>.
      ${delusi.length ? `Dall'altra parte ${delusi.length === 1
        ? `c'è <b>${F.esc(delusi[0].nome)}</b>: ${delusi[0].visti.length} film e nessuno andato bene.`
        : `ci sono ${delusi.map(p => `<b>${F.esc(p.nome)}</b>`).join(', ')}: li incroci spesso e non ti ripagano mai.`}` : ''}
      Tocca un nome per vedere tutti i suoi film in libreria.</p>
    </section>`;
  }

  return { indice, costanti, legame, sezione };
})();
