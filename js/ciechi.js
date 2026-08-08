/* ══════════════════════════════════════════════════════════
   ciechi.js — gli angoli bui della cineteca

   Le statistiche raccontano quello che hai visto. Questa
   scheda fa il contrario: guarda i buchi. Un paese che non
   hai mai visitato, un regista fermato al primo film, un
   genere che eviti da mesi, un titolo uscito da un pezzo e
   mai aperto.

   Regola: ogni buco deve venire con una via d'uscita, cioè un
   film che hai già in libreria. Dire "non guardi film coreani"
   senza dire quale guardare è una critica, non un consiglio.
   ══════════════════════════════════════════════════════════ */

const Ciechi = (() => {

  /* La proposta per uscire da un buco: fra i candidati, quello
     con la critica migliore. È il tentativo con più probabilità
     di far funzionare la cosa alla prima.

     `usati` tiene fuori i film già proposti in un altro riquadro:
     vedersi consigliare lo stesso titolo tre volte di fila fa
     sembrare che la libreria ne contenga uno solo. */
  function migliore(candidati, usati) {
    const voto = m => {
      const v = [m.rtScore, m.metascore, m.imdbRating ? m.imdbRating * 10 : null].filter(x => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 55;
    };
    const liberi = candidati.filter(m => !usati.has(m.id));
    const scelto = [...liberi].sort((a, b) => voto(b) - voto(a))[0] || null;
    if (scelto) usati.add(scelto.id);
    return scelto;
  }

  /* ── 1. i paesi dove non sei mai andato ──────────────── */
  function paesi(visti, daVedere, usati) {
    const stati = new Set(visti.flatMap(m => m.countries));
    const nuovi = new Map();
    for (const m of daVedere)
      for (const c of m.countries)
        if (!stati.has(c)) {
          if (!nuovi.has(c)) nuovi.set(c, []);
          nuovi.get(c).push(m);
        }
    if (!nuovi.size) return null;

    /* Il paese con più film in attesa: è il buco che stai
       alimentando di più senza accorgertene. */
    const [paese, film] = [...nuovi.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    /* "2 film Irlanda" non è italiano, e l'aggettivo per ogni paese
       sarebbe una tabella da mantenere a mano: la preposizione dice
       la stessa cosa e regge qualsiasi nome. */
    return {
      titolo: 'Un paese mai visitato',
      testo: `Nella tua libreria ${film.length === 1 ? "c'è un film prodotto" : `ci sono ${film.length} film prodotti`}
        in <b>${F.esc(paese)}</b>, e non ne hai mai visto nessuno.`,
      film: migliore(film, usati)
    };
  }

  /* ── 2. i registi fermati al primo film ──────────────── */
  function registi(visti, daVedere, usati) {
    const conta = new Map();
    for (const m of visti) if (m.director) conta.set(m.director, (conta.get(m.director) || 0) + 1);

    /* Interessa solo chi ti è piaciuto: se l'unico film suo che
       hai visto ti ha lasciato freddo, non è un angolo buio —
       è una porta che hai chiuso apposta. */
    const unaVolta = [...conta.entries()]
      .filter(([nome, n]) => n === 1)
      .map(([nome]) => ({
        nome,
        visto: visti.find(m => m.director === nome),
        altri: daVedere.filter(m => m.director === nome)
      }))
      .filter(r => r.altri.length && (r.visto.user.myRating || 0) >= 4);

    if (!unaVolta.length) return null;
    const r = unaVolta.sort((a, b) => b.altri.length - a.altri.length)[0];

    return {
      titolo: 'Un regista lasciato a metà',
      testo: `Di <b>${F.esc(r.nome)}</b> hai visto solo <i>${F.esc(r.visto.title)}</i>${
        r.visto.user.myRating ? ` — ${'★'.repeat(r.visto.user.myRating)}` : ''},
        e ne hai ${r.altri.length === 1 ? 'un altro' : `altri ${r.altri.length}`} in libreria.`,
      film: migliore(r.altri, usati)
    };
  }

  /* ── 3. il genere che rimandi sempre ─────────────────── */
  function generi(visti, daVedere, usati) {
    const vistiPer = F.conteggio(visti, m => m.genres);
    const mai = new Map(vistiPer);
    const attesa = new Map();
    for (const m of daVedere)
      for (const g of m.genres) {
        if (!attesa.has(g)) attesa.set(g, []);
        attesa.get(g).push(m);
      }

    /* Tre o più in attesa e nessuno visto: non è una coincidenza,
       è una scelta che fai ogni sera senza dirtelo. */
    const candidati = [...attesa.entries()]
      .filter(([g, film]) => film.length >= 3 && !mai.get(g))
      .sort((a, b) => b[1].length - a[1].length);
    if (!candidati.length) return null;

    const [genere, film] = candidati[0];
    return {
      titolo: 'Il genere che rimandi',
      testo: `Hai ${film.length} film in attesa dove c'è ${F.esc(F.conArticolo(genere))},
        e non ne hai ancora visto nemmeno uno.`,
      film: migliore(film, usati)
    };
  }

  /* ── 4. i dimenticati: usciti da un pezzo, mai aperti ── */
  function dimenticati(daVedere, usati) {
    const vecchi = daVedere.filter(m => (F.giorniA(m.releaseDate) ?? 1) < -120 && m.lista !== 'cinema');
    if (vecchi.length < 2) return null;

    /* Qui il criterio non è la critica ma l'attesa: il senso della
       voce è "questo aspetta da più tempo di tutti". */
    const inFila = [...vecchi].sort((a, b) => a.releaseDate - b.releaseDate);
    const scelto = inFila.find(m => !usati.has(m.id)) || null;
    if (scelto) usati.add(scelto.id);

    const mesi = Math.round(-F.giorniA(inFila[0].releaseDate) / 30.4);

    return {
      titolo: 'I dimenticati',
      testo: `${vecchi.length} film sono in lista da mesi senza essere mai stati aperti.
        Il più paziente è uscito <b>${mesi} mesi fa</b>.`,
      film: scelto
    };
  }

  /* ── 5. le decadi mai toccate ─────────────────────────
     Con una libreria di sole uscite recenti questa voce direbbe
     l'ovvio ("non guardi film prima del 2010"), quindi tace
     finché non hai davvero una storia da confrontare. */
  function decadi(visti) {
    const anni = visti.map(m => m.releaseDate?.getFullYear()).filter(Boolean);
    const dec = new Set(anni.map(a => Math.floor(a / 10) * 10));
    if (dec.size < 3) return null;

    const min = Math.min(...dec), max = Math.max(...dec);
    const buchi = [];
    for (let d = min; d <= max; d += 10) if (!dec.has(d)) buchi.push(d);
    if (!buchi.length) return null;

    return {
      titolo: 'Un decennio saltato',
      testo: `I tuoi film vanno dagli anni ${String(min).slice(2)} agli anni ${String(max).slice(2)},
        ma ${buchi.length === 1 ? `gli anni <b>${String(buchi[0]).slice(2)}</b> non li hai mai toccati`
                                : `di mezzo mancano gli anni ${buchi.map(d => `<b>${String(d).slice(2)}</b>`).join(', ')}`}.`,
      film: null
    };
  }

  /* ── la sezione ───────────────────────────────────────── */
  function sezione(tutti) {
    const visti    = tutti.filter(m => m.user.seen);
    const daVedere = tutti.filter(m => !m.user.seen);
    if (visti.length < 5 || !daVedere.length) return '';

    /* L'ordine conta: chi passa per primo si prende il film migliore.
       Davanti vanno i buchi più specifici — un regista lasciato a metà
       ha un solo modo per essere chiuso, "i dimenticati" ne ha venti. */
    const usati = new Set();
    const voci = [
      registi(visti, daVedere, usati),
      paesi(visti, daVedere, usati),
      generi(visti, daVedere, usati),
      decadi(visti),
      dimenticati(daVedere, usati)
    ].filter(Boolean);

    if (!voci.length) return '';

    return `<section class="s-block">
      <h3>Angoli bui</h3>
      <div class="ciechi">
        ${voci.map(v => `<article class="cieco">
          <h4>${F.esc(v.titolo)}</h4>
          <p>${v.testo}</p>
          ${v.film ? `<button class="cieco-film" data-open="${F.esc(v.film.id)}">
            <span class="cieco-ph">${F.poster(v.film, 'w185')
              ? `<img src="${F.poster(v.film, 'w185')}" alt="" loading="lazy">` : ''}</span>
            <span><i>Da qui</i><b>${F.esc(v.film.title)}</b></span>
          </button>` : ''}
        </article>`).join('')}
      </div>
      <p class="nota">Quello che la tua libreria dice per sottrazione.
      Non sono errori: sono le strade che non hai preso.</p>
    </section>`;
  }

  return { sezione };
})();
