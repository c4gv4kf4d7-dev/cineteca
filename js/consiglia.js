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

  /* ── il gemello: il film già visto che gli somiglia di più ──
     Non è "somiglianza oggettiva": pesa di più ciò che ti è piaciuto,
     perché serve a dire "se hai amato quello, guarda questo". */
  function gemello(film, visti) {
    const punteggia = v => {
      let s = 0;
      const generiComuni = film.genres.filter(g => v.genres.includes(g));
      s += generiComuni.length * 12;

      const cast = new Set((film.castDetail || []).slice(0, 8).map(c => c.name));
      const comuni = (v.castDetail || []).slice(0, 8).filter(c => cast.has(c.name));
      s += comuni.length * 20;

      if (film.director && film.director === v.director) s += 40;
      if (film.runtime && v.runtime && Math.abs(film.runtime - v.runtime) < 15) s += 6;
      if (film.countries.some(c => v.countries.includes(c))) s += 3;

      // Un film che hai amato è un paragone più utile di uno che hai subito.
      s *= 1 + Math.max(0, gradimento(v)) * 0.7;
      return { v, s, generiComuni, comuni };
    };

    const best = visti.map(punteggia).sort((a, b) => b.s - a.s)[0];
    return best && best.s >= 24 ? best : null;
  }

  /* ── la riga "ti piacerà perché" ─────────────────────
     Frasi intere, non elenchi: deve suonare come qualcuno
     che ti conosce, non come un motore di ricerca. */
  function perche(film, tutti) {
    const visti = tutti.filter(m => m.user.seen && m.id !== film.id);
    if (visti.length < 3) return null;

    const p = profilo(visti);
    const pezzi = [];
    const nome = m => m.title;
    const stelle = m => m.user.myRating ? ` — gli hai dato ${'★'.repeat(m.user.myRating)}` : '';

    // Un film già nominato non va ripetuto: suonerebbe come un disco rotto.
    const citati = new Set();
    const cita = m => { citati.add(m.id); return `<i>${F.esc(nome(m))}</i>`; };
    let haGemello = false;

    /* 1. il regista */
    const reg = film.director && p.registi.get(film.director);
    if (reg && reg.punti > 0) {
      const suo = [...reg.film].sort((a, b) => (b.user.myRating || 0) - (a.user.myRating || 0))[0];
      pezzi.push(`hai già seguito <b>${F.esc(film.director)}</b> in ${cita(suo)}${stelle(suo)}`);
    }

    /* 2. i volti che ritrovi */
    const facce = (film.castDetail || []).slice(0, 6)
      .map(c => ({ nome: c.name, v: p.attori.get(c.name) }))
      .filter(x => x.v && x.v.punti > 0)
      .sort((a, b) => b.v.punti - a.v.punti)
      .slice(0, 2);
    if (facce.length) {
      const dove = facce[0].v.film.sort((a, b) => (b.user.myRating || 0) - (a.user.myRating || 0))[0];
      pezzi.push(facce.length > 1
        ? `ritrovi <b>${F.esc(facce[0].nome)}</b> e <b>${F.esc(facce[1].nome)}</b>, già incrociati nella tua libreria`
        : `c'è <b>${F.esc(facce[0].nome)}</b>, che hai visto in ${cita(dove)}${stelle(dove)}`);
    }

    /* 3. il gemello, solo se porta un film nuovo nel discorso.
       Vario l'attacco: ripetere "sta vicino a" su ogni scheda
       fa sembrare tutto uscito dallo stesso stampo. */
    const g = gemello(film, visti);
    if (g && !reg && !citati.has(g.v.id)) {
      const amato = (g.v.user.myRating || 0) >= 4;
      const legame = g.comuni.length ? 'stesso giro di facce'
        : g.generiComuni.length > 1 ? `stesso incrocio di ${g.generiComuni.map(x => x.toLowerCase()).join(' e ')}`
        : 'stessa stoffa';

      const attacchi = amato
        ? [ t => `ti era piaciuto ${t}: questo gli somiglia`,
            t => `è cugino di ${t}, che hai amato`,
            t => `se ${t} ti ha preso, qui ritrovi ${legame}` ]
        : [ t => `sta dalle parti di ${t} — ${legame}`,
            t => `respira la stessa aria di ${t}`,
            t => `chi ha visto ${t} si ritrova in casa` ];

      // Scelta stabile per film: la frase non cambia a ogni ricarica.
      const seme = [...String(film.id)].reduce((s, c) => s + c.charCodeAt(0), 0);
      pezzi.push(attacchi[seme % attacchi.length](cita(g.v)));
      haGemello = true;
    }

    /* 4. il verdetto della critica, quando è netto */
    const critica = [film.rtScore, film.metascore, film.imdbRating ? film.imdbRating * 10 : null]
      .filter(x => x != null);
    const mediaCritica = critica.length
      ? Math.round(critica.reduce((a, b) => a + b, 0) / critica.length) : null;

    if (pezzi.length < 2 && mediaCritica != null && mediaCritica >= 82)
      pezzi.push(`ne stanno parlando benissimo (${mediaCritica} su cento)`);

    /* 5. il terreno che frequenti, detto una volta sola e senza conteggi */
    if (pezzi.length < 2) {
      const gen = film.genres.map(x => ({ x, v: p.generi.get(x) }))
        .filter(x => x.v && x.v.punti > 0)
        .sort((a, b) => b.v.punti - a.v.punti)[0];
      if (gen) {
        const etichetta = `<b>${F.esc(F.conArticolo(gen.x))}</b>`;
        const seme = [...String(film.id)].reduce((s, c) => s + c.charCodeAt(0), 0);
        // Se un gemello ha già parlato di film, qui resto sul genere:
        // due paragoni di fila con lo stesso giro di parole stonano.
        const esempio = haGemello ? null : [...gen.v.film]
          .filter(f => !citati.has(f.id))
          .sort((a, b) => (b.user.myRating || 0) - (a.user.myRating || 0))[0];

        if (esempio && gen.v.film.length < 3) {
          pezzi.push(`sei dalle parti di ${cita(esempio)}`);
        } else {
          // Niente preposizioni davanti al genere: "su l'avventura"
          // costringerebbe a gestire tutte le elisioni italiane.
          const forme = [
            `${etichetta} è casa tua`,
            `${etichetta} non ti delude mai`,
            `${etichetta} è il tuo terreno`
          ];
          pezzi.push(forme[seme % forme.length]);
        }
      }
    }

    /* 6. l'ultima spiaggia: qualcosa di vero da dire c'è sempre */
    if (!pezzi.length && mediaCritica != null && mediaCritica >= 70)
      pezzi.push(`la critica lo tratta bene (${mediaCritica} su cento)`);
    if (!pezzi.length && film.director)
      pezzi.push(`lo firma <b>${F.esc(film.director)}</b>`);

    if (!pezzi.length) return null;

    /* Il contrappunto onesto: se la critica lo boccia, va detto. */
    let caveat = null;
    const stampa = [film.rtScore, film.metascore].filter(x => x != null);
    if (stampa.length) {
      const media = Math.round(stampa.reduce((a, b) => a + b, 0) / stampa.length);
      if (media < 45) {
        caveat = p.scarto != null && p.scarto > 8
          ? `La critica lo massacra (${media}/100), ma tu tendi a essere più generoso di lei.`
          : `Sappilo: la critica lo massacra, ${media}/100.`;
      } else if (media >= 85) {
        caveat = `E la critica è d'accordo con te: ${media}/100.`;
      }
    }

    /* Il dettaglio pratico: dove e quando. Per un film che aspetti
       in sala, lo streaming è irrilevante — e per una riedizione è
       pure fuorviante, perché è la disponibilità del film originale. */
    let pratico = null;
    const gg = F.giorniA(film.releaseDate);
    const prev = F.prevendita(film);

    if (film.lista === 'cinema') {
      if (prev?.urgente)               pratico = `${maiuscola(prev.testo)}.`;
      else if (gg != null && gg > 0)   pratico = `Esce fra ${gg} giorni.`;
      else if (gg != null && gg >= -70) pratico = 'È in sala adesso.';
    } else if (film.streaming?.length) {
      pratico = `Ce l'hai già su ${F.esc(F.piattaforme(film.streaming)[0])}.`;
    } else if (gg != null && gg > 0 && gg <= 45) {
      pratico = `Esce fra ${gg} giorni.`;
    }

    const frase = pezzi.length > 1
      ? `${maiuscola(pezzi[0])}, e ${pezzi.slice(1).join(', ')}.`
      : `${maiuscola(pezzi[0])}.`;

    return { frase, caveat, pratico };
  }

  /* La frase può iniziare con un tag (<b>, <i>): la maiuscola va
     sulla prima lettera del testo, saltando i tag di apertura. */
  const maiuscola = s =>
    s.replace(/^(\s*(?:<[^>]+>\s*)*)([a-zà-ÿ])/i, (_, tag, c) => tag + c.toUpperCase());

  return { classifica, ritratto, profilo, gradimento, perche, gemello };
})();
