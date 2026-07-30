/* ══════════════════════════════════════════════════════════
   stats.js — la stagione, raccontata per immagini e grafici

   Ogni sezione risponde a una domanda precisa. Se il dato per
   rispondere non c'è, la sezione non compare: meglio il vuoto
   che un grafico costruito su tre valori a caso.
   ══════════════════════════════════════════════════════════ */

const Stats = (() => {
  const root = document.getElementById('stats');

  const COL = {
    rt:   '#FF6B6B',
    mc:   '#FFC24D',
    imdb: '#4DE3FF',
    ok:   '#4BE39B',
    viola:'#B78CFF'
  };

  /* Voti diversi, scala unica 0–100, così sono confrontabili. */
  const norm = m => ({
    rt:   m.rtScore ?? null,
    mc:   m.metascore ?? null,
    imdb: m.imdbRating ? Math.round(m.imdbRating * 10) : null
  });

  /* Media dei pareri disponibili: un film con tre voti pesa
     quanto uno con uno solo, ma almeno non sparisce. */
  function consenso(m) {
    const v = Object.values(norm(m)).filter(x => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  }

  function render() {
    try { disegna(); }
    catch (err) {
      // Meglio dire cosa è andato storto che lasciare la pagina bianca.
      console.error('Statistiche non disegnabili:', err);
      root.innerHTML = `<p class="empty">Le statistiche non si sono caricate.<br>
        <small>${F.esc(err.message)}</small><br><br>
        Ricarica la pagina; se insiste, svuota la cache del browser.</p>`;
    }
  }

  function disegna() {
    const films = Store.all();
    const visti = films.filter(m => m.user.seen);

    if (!films.length) { root.innerHTML = '<p class="empty">Catalogo vuoto.</p>'; return; }
    if (!visti.length) { root.innerHTML = '<p class="empty">Segna qualche film come visto e qui comparirà la tua stagione.</p>'; return; }

    root.innerHTML = [
      manifesto(visti),
      classificheDelMese(films),
      podio(visti),
      botteghino(visti),
      moltiplicatore(visti),
      verdetti(visti),
      volti(visti),
      firme(visti),
      anatomia(visti),
      inSala(films),
      ritmo(visti),
      davanti(films.filter(m => !m.user.seen))
    ].join('');
  }

  /* ══ 1. manifesto ═════════════════════════════════════ */
  function manifesto(visti) {
    const conDurata = visti.filter(m => m.runtime);
    const minuti = conDurata.reduce((s, m) => s + m.runtime, 0);
    const incasso = visti.reduce((s, m) => s + (m.revenue || 0), 0);
    const sfondo = [...visti].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
    const bg = F.backdrop(sfondo) || F.poster(sfondo, 'w780');

    const numeri = [
      { n: visti.length, e: 'film' },
      { n: Math.floor(minuti / 60), e: 'ore' },
      incasso && { n: F.soldi(incasso), e: 'mossi al box office' }
    ].filter(Boolean);

    return `<section class="poster-hero">
      ${bg ? `<img src="${bg}" alt="" class="ph-bg">` : ''}
      <div class="ph-inner">
        <span class="ph-kicker">La stagione ${new Date().getFullYear()}</span>
        <div class="ph-numbers">
          ${numeri.map(x => `<div><b>${F.esc(String(x.n))}</b><span>${F.esc(x.e)}${
            x.nota ? `<i>${F.esc(x.nota)}</i>` : ''}</span></div>`).join('')}
        </div>
        ${conDurata.length ? `<p class="ph-foot">${Math.round(minuti / conDurata.length)} minuti di media per film · ${
          (minuti / 60 / 24).toFixed(1)} giorni pieni di proiezione</p>` : ''}
      </div>
    </section>`;
  }

  /* ══ 1bis. le due classifiche ═════════════════════════
     Top 10 del mese in corso: per incasso e per voto.
     Se il mese è troppo magro, allargo all'anno e lo dico. */
  function classificheDelMese(films) {
    const ora = new Date();
    const delMese = m => m.releaseDate
      && m.releaseDate.getMonth() === ora.getMonth()
      && m.releaseDate.getFullYear() === ora.getFullYear();

    let campo = films.filter(delMese);
    let ambito = `${F.MESI[ora.getMonth()]} ${ora.getFullYear()}`;
    if (campo.filter(m => m.revenue).length < 4) {
      campo = films.filter(m => m.releaseDate && m.releaseDate.getFullYear() === ora.getFullYear());
      ambito = `${ora.getFullYear()}`;
    }

    // Le riedizioni portano l'incasso del film originale: in una
    // classifica dell'anno in corso falserebbero tutto.
    const perIncasso = campo.filter(m => m.revenue && !m.evento)
      .sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const perVoto = campo.filter(m => consenso(m) != null)
      .sort((a, b) => consenso(b) - consenso(a)).slice(0, 10);

    if (perIncasso.length < 3 && perVoto.length < 3) return '';

    const colonna = (titolo, voci, valore, formato, colore) => !voci.length ? '' : `
      <div class="classifica">
        <h4 class="s-sub">${F.esc(titolo)}</h4>
        ${Chart.barre(voci.map(m => ({
          id: m.id, etichetta: m.title, valore: valore(m), poster: F.poster(m, 'w185'),
          sotto: F.dataBreve(m.releaseDate)
        })), { formato, colore })}
      </div>`;

    return blocco(`Le classifiche di ${ambito}`, `
      <div class="classifiche">
        ${colonna('Box office mondiale', perIncasso, m => m.revenue, F.soldi,
          'linear-gradient(90deg,var(--good),var(--accent))')}
        ${colonna('Consenso della critica', perVoto, consenso, v => `${v}`,
          'linear-gradient(90deg,var(--hot),var(--rotten))')}
      </div>
      <p class="nota">${ambito.match(/^\d+$/)
        ? 'Il mese in corso ha ancora troppi pochi film con dati: la classifica si allarga a tutto l\'anno.'
        : 'Solo i film usciti questo mese.'} Il consenso è la media di Rotten Tomatoes, Metacritic e IMDb su scala 0–100.</p>`);
  }

  /* ══ 2. podio ═════════════════════════════════════════ */
  function podio(visti) {
    const conVoto = visti.filter(m => consenso(m) != null)
      .sort((a, b) => consenso(b) - consenso(a));
    if (conVoto.length < 3) return '';

    const tre = conVoto.slice(0, 3);
    const ordine = [tre[1], tre[0], tre[2]];

    return blocco('Il podio', `
      <div class="podio">
        ${ordine.map(m => {
          const posto = tre.indexOf(m) + 1;
          const n = norm(m);
          return `<button class="pod pod-${posto}" data-open="${F.esc(m.id)}">
            <span class="pod-medal">${['🥇','🥈','🥉'][posto - 1]}</span>
            <span class="pod-poster">${F.poster(m)
              ? `<img src="${F.poster(m)}" alt="" loading="lazy">` : `<i>${F.esc(F.iniziali(m.title))}</i>`}</span>
            <b class="pod-score">${consenso(m)}</b>
            <span class="pod-title">${F.esc(m.title)}</span>
            <span class="pod-detail">${[
              n.rt   != null ? `🍅 ${n.rt}` : null,
              n.mc   != null ? `MC ${n.mc}` : null,
              n.imdb != null ? `IMDb ${(n.imdb / 10).toFixed(1)}` : null
            ].filter(Boolean).join(' · ')}</span>
          </button>`;
        }).join('')}
      </div>
      <p class="nota">Punteggio di consenso: media dei pareri disponibili — Rotten Tomatoes,
      Metacritic e IMDb portati tutti su scala 0–100. Il più stroncato dell'anno è
      <b>${F.esc(conVoto.at(-1).title)}</b> con ${consenso(conVoto.at(-1))}.</p>`);
  }

  /* ══ 3. botteghino ════════════════════════════════════ */
  function botteghino(visti) {
    const voci = visti.filter(m => m.revenue)
      .sort((a, b) => b.revenue - a.revenue)
      .map(m => ({
        id: m.id, etichetta: m.title, valore: m.revenue,
        poster: F.poster(m, 'w185'),
        sotto: m.budget ? `budget ${F.soldi(m.budget)}` : null
      }));
    if (!voci.length) return '';

    const tot = voci.reduce((s, v) => s + v.valore, 0);
    return blocco('Il botteghino dei film che hai visto', `
      ${Chart.barre(voci, { formato: F.soldi, colore: 'linear-gradient(90deg,var(--good),var(--accent))' })}
      <p class="nota">Incasso mondiale complessivo <b>${F.soldi(tot)}</b>.
      Il primo da solo vale il ${Math.round(voci[0].valore / tot * 100)}% del totale.</p>`);
  }

  /* ══ 4. moltiplicatore ════════════════════════════════ */
  function moltiplicatore(visti) {
    const voci = visti.filter(m => m.budget && m.revenue)
      .map(m => ({ m, roi: m.revenue / m.budget }))
      .sort((a, b) => b.roi - a.roi);
    if (voci.length < 3) return '';

    const flop = voci.filter(v => v.roi < 2.5);
    return blocco('Il moltiplicatore', `
      ${Chart.barre(voci.map(v => ({
        id: v.m.id, etichetta: v.m.title, valore: v.roi, poster: F.poster(v.m, 'w185'),
        sotto: `${F.soldi(v.m.budget)} → ${F.soldi(v.m.revenue)}`
      })), { formato: v => `×${v < 10 ? v.toFixed(1) : Math.round(v)}`,
             colore: 'linear-gradient(90deg,var(--hot),var(--rotten))',
             scala: 'compressa' })}
      <p class="nota">Quante volte il film ha ripagato il proprio costo.
      Le barre usano una scala compressa: senza, un caso limite come
      <b>${F.esc(voci[0].m.title)}</b> (×${Math.round(voci[0].roi)}) ridurrebbe tutti gli altri a una riga invisibile.
      I numeri a destra restano quelli veri.
      Regola del pollice del settore: sotto <b>×2.5</b> un film in sala fatica a rientrare,
      perché circa metà dell'incasso resta agli esercenti e il marketing non compare nel budget.
      ${flop.length ? `Con questo metro, ${flop.length} dei tuoi film ${flop.length === 1 ? 'è' : 'sono'} in bilico: ${
        F.esc(flop.map(v => v.m.title).join(', '))}.` : 'Tutti i tuoi film hanno superato quella soglia.'}</p>`);
  }

  /* ══ 6. i tre verdetti ════════════════════════════════ */
  function verdetti(visti) {
    const voci = visti
      .map(m => ({ ...norm(m), id: m.id, titolo: m.title }))
      .filter(v => [v.rt, v.mc, v.imdb].filter(x => x != null).length >= 2)
      .sort((a, b) => {
        const sp = v => { const d = [v.rt, v.mc, v.imdb].filter(x => x != null); return Math.max(...d) - Math.min(...d); };
        return sp(b) - sp(a);
      });
    if (voci.length < 3) return '';

    const serie = [
      { chiave: 'rt',   nome: 'Rotten Tomatoes', colore: COL.rt },
      { chiave: 'mc',   nome: 'Metacritic',      colore: COL.mc },
      { chiave: 'imdb', nome: 'IMDb (×10)',      colore: COL.imdb }
    ];

    return blocco('Dove critica e pubblico litigano', `
      ${Chart.manubri(voci, serie)}
      <p class="nota">Ordinati per distanza fra il giudizio più alto e il più basso.
      In cima trovi i film su cui non si sono messi d'accordo:
      <b>${F.esc(voci[0].titolo)}</b> apre un divario di ${
        (() => { const d = [voci[0].rt, voci[0].mc, voci[0].imdb].filter(x => x != null);
                 return Math.max(...d) - Math.min(...d); })()} punti.</p>`);
  }

  /* ══ 7. volti ═════════════════════════════════════════ */
  function volti(visti) {
    const conta = new Map();
    for (const m of visti) {
      for (const p of (m.castDetail || []).slice(0, 10)) {
        if (!conta.has(p.name)) conta.set(p.name, { nome: p.name, profile: p.profile, film: [] });
        conta.get(p.name).film.push(m);
      }
    }
    const tutti = [...conta.values()]
      .sort((a, b) => b.film.length - a.film.length
        || b.film.reduce((s, f) => s + (f.revenue || 0), 0) - a.film.reduce((s, f) => s + (f.revenue || 0), 0));
    if (!tutti.length) return '';

    const ricorrenti = tutti.filter(p => p.film.length > 1);
    const mostra = ricorrenti.length ? ricorrenti : tutti.slice(0, 12);

    return blocco('I volti dell\'anno', `
      <div class="volti">
        ${mostra.map(p => `
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
      </div>
      <p class="nota">${ricorrenti.length
        ? `${ricorrenti.length} attori tornano in più di un film che hai visto. In tutto hai incrociato <b>${tutti.length}</b> interpreti di primo piano.`
        : `Nessun attore si ripete ancora: ecco i primi nomi dei ${visti.length} film, <b>${tutti.length}</b> interpreti in tutto.`}</p>`);
  }

  /* ══ 8. firme: registi e paesi ════════════════════════ */
  function firme(visti) {
    const registi = F.conteggio(visti, m => m.director);
    const paesi   = F.conteggio(visti, m => m.countries);
    if (!registi.length && !paesi.length) return '';

    const tavola = (titolo, dati, colore) => !dati.length ? '' : `
      <div class="firma">
        <h4 class="s-sub">${F.esc(titolo)}</h4>
        ${Chart.barre(dati.slice(0, 8).map(([et, n]) => ({ etichetta: et, valore: n })),
          { formato: v => `${v} film`, colore })}
      </div>`;

    return blocco('Firme e bandiere', `
      <div class="firme">
        ${tavola('Registi', registi, 'var(--viola, #B78CFF)')}
        ${tavola('Paesi di produzione', paesi, 'var(--accent)')}
      </div>`);
  }

  /* ══ 9. anatomia: generi e durate ═════════════════════ */
  function anatomia(visti) {
    const generi = F.conteggio(visti, m => m.genres).slice(0, 6);
    const tavolozza = [COL.imdb, COL.viola, COL.mc, COL.ok, COL.rt, '#7A86A8'];

    const conDurata = visti.filter(m => m.runtime);
    const fasce = [
      { e: '<90′',     min: 0,   max: 89 },
      { e: '90–109′',  min: 90,  max: 109 },
      { e: '110–129′', min: 110, max: 129 },
      { e: '130–149′', min: 130, max: 149 },
      { e: '150′+',    min: 150, max: 999 }
    ].map(f => {
      const dentro = conDurata.filter(m => m.runtime >= f.min && m.runtime <= f.max);
      return { etichetta: f.e, valore: dentro.length, nota: dentro.map(m => m.title).join(', ') };
    });

    if (!generi.length && !conDurata.length) return '';

    return blocco('Anatomia delle tue visioni', `
      <div class="anatomia">
        ${generi.length ? `<div>
          <h4 class="s-sub">Generi</h4>
          ${Chart.anello(generi.map(([nome, valore], i) => ({ nome, valore, colore: tavolozza[i] })),
            { numero: visti.length, etichetta: 'film' })}
        </div>` : ''}
        ${conDurata.length ? `<div>
          <h4 class="s-sub">Quanto durano</h4>
          ${Chart.istogramma(fasce)}
          <p class="nota">Il più lungo è <b>${F.esc([...conDurata].sort((a,b)=>b.runtime-a.runtime)[0].title)}</b>
          con ${F.durata([...conDurata].sort((a,b)=>b.runtime-a.runtime)[0].runtime)}.</p>
        </div>` : ''}
      </div>`);
  }

  /* ══ 10. da quanto sono in sala ═══════════════════════ */
  function inSala(films) {
    const usciti = films
      .map(m => ({ m, g: F.giorniA(m.releaseDate) }))
      .filter(x => x.g != null && x.g <= 0)
      .sort((a, b) => a.g - b.g);
    if (usciti.length < 3) return '';

    const voci = usciti.map(({ m, g }) => ({
      id: m.id, etichetta: m.title, valore: -g,
      poster: F.poster(m, 'w185'),
      sotto: `${F.dataLunga(m.releaseDate)}${m.user.seen ? ' · visto' : ''}`
    }));

    const settimane = g => Math.floor(g / 7);
    // voci è ordinata dal più vecchio al più recente: il primo è il più lontano.
    const piuVecchio = voci[0];

    return blocco('Da quanti giorni sono usciti', `
      ${Chart.barre(voci, {
        formato: v => `${v} g · ${settimane(v)} sett.`,
        colore: 'linear-gradient(90deg,var(--accent),var(--accent-2))'
      })}
      <p class="nota">Giorni trascorsi dall'uscita italiana.
      <b>${F.esc(piuVecchio.etichetta)}</b> è il più lontano nel tempo, ${piuVecchio.valore} giorni fa.
      Nelle multisala un film regge in media 4–6 settimane: ${
        voci.filter(v => v.valore > 42).length} dei tuoi hanno già superato quella soglia.</p>`);
  }

  /* ══ 11. il ritmo dell'anno ═══════════════════════════ */
  function ritmo(visti) {
    const conData = visti.filter(m => m.releaseDate);
    if (!conData.length) return '';

    const perMese = F.MESI.map((nome, i) => {
      const dentro = conData.filter(m => m.releaseDate.getMonth() === i);
      return { etichetta: nome.slice(0, 3), valore: dentro.length, nota: dentro.map(m => m.title).join(', ') };
    });
    const picco = [...perMese].sort((a, b) => b.valore - a.valore)[0];

    return blocco('Il ritmo dell\'anno', `
      ${Chart.istogramma(perMese)}
      <p class="nota">Per mese di uscita in Italia, non di quando l'hai visto.
      Il mese più affollato è <b>${F.esc(picco.etichetta)}</b> con ${picco.valore} film.</p>`);
  }

  /* ══ 12. quel che ti aspetta ══════════════════════════ */
  function davanti(daVedere) {
    if (!daVedere.length) return '';
    const cinema = daVedere.filter(m => m.lista === 'cinema');
    const casa   = daVedere.filter(m => m.lista === 'casa');
    const minuti = daVedere.filter(m => m.runtime).reduce((s, m) => s + m.runtime, 0);
    const prossimo = cinema.filter(m => (F.giorniA(m.releaseDate) ?? -1) >= 0)
      .sort((a, b) => a.releaseDate - b.releaseDate)[0];

    return blocco('Quel che ti aspetta', `
      <div class="avanti">
        <button class="av" data-vai="cinema"><b>${cinema.length}</b><span>🎟️ al cinema</span></button>
        <button class="av" data-vai="casa"><b>${casa.length}</b><span>🛋️ sul divano</span></button>
        <div class="av av-statico"><b>${Math.floor(minuti / 60)}h</b><span>già in coda</span></div>
        ${prossimo ? `<button class="av" data-open="${F.esc(prossimo.id)}">
          <b>${F.giorniA(prossimo.releaseDate)}</b><span>giorni al prossimo</span></button>` : ''}
      </div>
      ${prossimo ? `<p class="nota">Il prossimo è <b>${F.esc(prossimo.title)}</b>, ${F.dataLunga(prossimo.releaseDate)}.</p>` : ''}`);
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
