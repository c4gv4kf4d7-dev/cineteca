/* ══════════════════════════════════════════════════════════
   consiglia.js — il consigliere

   Costruisce un profilo di gusto dai film già visti e lo usa
   per due cose: ordinare la coda di quelli che hai in lista,
   e spiegare *perché* un titolo dovrebbe interessarti.

   Nessun modello, nessuna chiamata di rete: solo i dati che
   hai già in casa. La spiegazione conta quanto il punteggio —
   un consiglio che non sai giustificare non è un consiglio.
   ══════════════════════════════════════════════════════════ */

const Consiglia = (() => {

  /* Il gradimento di un film visto, da -1 a +1.
     Le tue stelle pesano il doppio della critica: è la tua libreria. */
  function gradimento(m) {
    const critica = (() => {
      const v = [m.rtScore, m.metascore, m.imdbRating ? m.imdbRating * 10 : null].filter(x => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length / 100 : null;   // 0..1
    })();

    if (m.user.myRating) {
      const mio = (m.user.myRating - 3) / 2;                                     // -1..+1
      return critica == null ? mio : mio * 0.7 + (critica - 0.6) * 0.75;
    }
    // Senza il tuo voto resta un segnale debole: l'hai visto, quindi ti interessava.
    return critica == null ? 0.15 : (critica - 0.62) * 0.8;
  }

  /* Somma i gradimenti per ogni chiave (genere, regista, attore…). */
  function pesa(visti, estrai) {
    const peso = new Map();
    for (const m of visti) {
      const g = gradimento(m);
      for (const k of estrai(m)) {
        if (!k) continue;
        const p = peso.get(k) || { punti: 0, film: [] };
        p.punti += g;
        p.film.push(m);
        peso.set(k, p);
      }
    }
    return peso;
  }

  /* ── il profilo ──────────────────────────────────────── */
  function profilo(visti) {
    return {
      generi:  pesa(visti, m => m.genres),
      registi: pesa(visti, m => [m.director]),
      attori:  pesa(visti, m => (m.castDetail || []).slice(0, 6).map(c => c.name)),
      paesi:   pesa(visti, m => m.countries),
      durata:  (() => {
        const d = visti.filter(m => m.runtime);
        return d.length ? d.reduce((s, m) => s + m.runtime, 0) / d.length : null;
      })(),
      // Quanto ti discosti dalla critica: se sistematicamente voti sopra o sotto.
      scarto: (() => {
        const con = visti.filter(m => m.user.myRating && (m.rtScore != null || m.metascore != null));
        if (!con.length) return null;
        const d = con.map(m => {
          const c = [m.rtScore, m.metascore].filter(x => x != null);
          return (m.user.myRating / 5 * 100) - (c.reduce((a, b) => a + b, 0) / c.length);
        });
        return Math.round(d.reduce((a, b) => a + b, 0) / d.length);
      })()
    };
  }

  /* ── punteggio e motivazione di un candidato ─────────── */
  function valuta(film, p) {
    const motivi = [];
    let punti = 0;

    const contributo = (mappa, chiavi, moltiplicatore, frase) => {
      for (const k of chiavi) {
        const v = mappa.get(k);
        if (!v || v.punti <= 0.05) continue;
        punti += v.punti * moltiplicatore;
        motivi.push(frase(k, v));
      }
    };

    contributo(p.registi, [film.director], 26,
      (k, v) => `hai visto ${v.film.length === 1 ? 'un film' : `${v.film.length} film`} di ${k}`);

    contributo(p.attori, (film.castDetail || []).slice(0, 6).map(c => c.name), 13,
      (k, v) => `c'è ${k}, che hai già visto in ${v.film[0].title}`);

    contributo(p.generi, film.genres, 9,
      (k, v) => `${k.toLowerCase()} è un genere che frequenti (${v.film.length})`);

    contributo(p.paesi, film.countries, 3, k => `produzione ${k}`);

    // La critica conta, ma non deve schiacciare il gusto personale.
    const critica = [film.rtScore, film.metascore, film.imdbRating ? film.imdbRating * 10 : null]
      .filter(x => x != null);
    if (critica.length) {
      const media = critica.reduce((a, b) => a + b, 0) / critica.length;
      punti += (media - 60) * 0.32;
      if (media >= 80) motivi.push(`la critica lo promuove (${Math.round(media)}/100)`);
      if (media < 45)  motivi.push(`la critica lo boccia (${Math.round(media)}/100)`);
    }

    if (p.durata && film.runtime) {
      const scostamento = Math.abs(film.runtime - p.durata);
      if (scostamento < 12) { punti += 4; motivi.push('dura quanto i film che scegli di solito'); }
    }

    // Un titolo già disponibile in abbonamento è un consiglio azionabile stasera.
    if (film.streaming?.length) {
      punti += 6;
      motivi.push(`è già su ${F.piattaforme(film.streaming)[0]}`);
    }

    return { punti, motivi: [...new Set(motivi)].slice(0, 3) };
  }

  /* ── la classifica dei consigli ──────────────────────── */
  function classifica(tutti, { lista = null, quanti = 8 } = {}) {
    const visti = tutti.filter(m => m.user.seen);
    if (visti.length < 3) return { pronti: false, visti: visti.length, voci: [], profilo: null };

    const p = profilo(visti);
    const candidati = tutti.filter(m => !m.user.seen && (!lista || m.lista === lista));

    const voci = candidati
      .map(m => ({ film: m, ...valuta(m, p) }))
      .sort((a, b) => b.punti - a.punti)
      .slice(0, quanti);

    return { pronti: true, visti: visti.length, voci, profilo: p };
  }

  /* Le tre cose che ti descrivono meglio, per la scheda del profilo. */
  function ritratto(p) {
    const cima = (mappa, n = 3) => [...mappa.entries()]
      .filter(([, v]) => v.punti > 0)
      .sort((a, b) => b[1].punti - a[1].punti)
      .slice(0, n)
      .map(([k, v]) => ({ nome: k, film: v.film.length, punti: v.punti }));

    return {
      generi:  cima(p.generi),
      registi: cima(p.registi, 2),
      attori:  cima(p.attori, 4),
      durata:  p.durata ? Math.round(p.durata) : null,
      scarto:  p.scarto
    };
  }

  return { classifica, ritratto, profilo, gradimento };
})();
