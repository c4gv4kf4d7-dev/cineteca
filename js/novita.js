/* ══════════════════════════════════════════════════════════
   novita.js — cosa è cambiato da quando non ci sei

   A ogni apertura confronta il catalogo con l'istantanea
   salvata l'ultima volta e racconta le differenze: voti
   arrivati o cambiati, incassi che si muovono, film sbarcati
   date che slittano.

   Tutto in locale, nessun server: l'istantanea vive accanto
   al resto del tuo stato nel browser.
   ══════════════════════════════════════════════════════════ */

const Novita = (() => {
  const KEY = 'cineteca:snapshot';
  const contenitore = document.getElementById('novita');

  /* Solo i campi che vale la pena sorvegliare. */
  const istantanea = films => Object.fromEntries(films.map(m => [m.id, {
    t: m.title,
    rt: m.rtScore ?? null,
    mc: m.metascore ?? null,
    imdb: m.imdbRating ?? null,
    inc: m.revenue ?? null,
    usc: m.release ?? null,
    usc2: m.release ?? null
  }]));

  /* Le voci archiviate non tornano più: "ho letto" è definitivo. */
  const LETTE = `${KEY}:voci-lette`;
  const impronta = v => `${v.id}|${v.tipo}|${v.testo}`.replace(/<[^>]+>/g, '');
  const vociLette = () => {
    try { return new Set(JSON.parse(localStorage.getItem(LETTE)) || []); }
    catch { return new Set(); }
  };
  const archivia = voci => {
    try {
      const insieme = new Set([...vociLette(), ...voci.map(impronta)]);
      localStorage.setItem(LETTE, JSON.stringify([...insieme].slice(-400)));
    } catch { /* pazienza */ }
  };

  const leggi = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; }
    catch { return null; }
  };

  const salva = films => {
    try { localStorage.setItem(KEY, JSON.stringify({ quando: Date.now(), film: istantanea(films) })); }
    catch { /* quota piena, pazienza */ }
  };

  /* ── il confronto ────────────────────────────────────── */
  function confronta(films) {
    const prima = leggi();
    if (!prima) return { primaVolta: true, voci: [] };

    const ora = istantanea(films);
    const voci = [];
    const perId = Object.fromEntries(films.map(m => [m.id, m]));

    for (const [id, adesso] of Object.entries(ora)) {
      const era = prima.film[id];
      const m = perId[id];

      if (!era) {
        voci.push({ id, film: m, tipo: 'nuovo', peso: 5,
          testo: `<b>${F.esc(adesso.t)}</b> è entrato in libreria` });
        continue;
      }

      /* voti apparsi o cambiati */
      const voto = (chiave, nome, suffisso = '') => {
        const a = era[chiave], b = adesso[chiave];
        if (a == null && b != null)
          voci.push({ id, film: m, tipo: 'voto', peso: 4,
            testo: `<b>${F.esc(adesso.t)}</b> ha il suo primo voto ${nome}: <b>${b}${suffisso}</b>` });
        else if (a != null && b != null && a !== b)
          voci.push({ id, film: m, tipo: 'voto', peso: 3,
            testo: `${nome} di <b>${F.esc(adesso.t)}</b>: ${a}${suffisso} → <b>${b}${suffisso}</b>` });
      };
      voto('rt', 'Rotten Tomatoes', '%');
      voto('mc', 'Metacritic');
      voto('imdb', 'IMDb');

      /* incasso: solo salti che si notano */
      if (era.inc != null && adesso.inc != null && adesso.inc > era.inc) {
        const salto = adesso.inc - era.inc;
        const relativo = era.inc ? salto / era.inc : 1;
        if (relativo > 0.08 || salto > 25e6) {
          const soglia = [1e9, 5e8, 2.5e8, 1e8].find(s => era.inc < s && adesso.inc >= s);
          voci.push({ id, film: m, tipo: 'incasso', peso: soglia ? 6 : 2,
            testo: soglia
              ? `<b>${F.esc(adesso.t)}</b> ha sfondato quota <b>${F.soldi(soglia)}</b> al box office`
              : `<b>${F.esc(adesso.t)}</b> ha incassato <b>${F.soldi(salto)}</b> in più` });
        }
      }

      /* data spostata */
      if (era.usc && adesso.usc && era.usc !== adesso.usc) {
        const va = new Date(adesso.usc) > new Date(era.usc);
        voci.push({ id, film: m, tipo: 'data', peso: 5,
          testo: `<b>${F.esc(adesso.t)}</b> ${va ? 'slitta' : 'anticipa'} al <b>${
            F.dataLunga(new Date(`${adesso.usc}T00:00:00`))}</b>` });
      }
    }

    voci.push(...prevendite(films));
    const gia = vociLette();
    const rimaste = voci.filter(v => !gia.has(impronta(v)));
    rimaste.sort((a, b) => b.peso - a.peso);
    return { primaVolta: false, quando: prima.quando, voci: rimaste };
  }

  /* Segnalazioni pescate dalla stampa: un articolo parla di prevendite
     per un film che hai in lista e di cui non conosco ancora la data. */
  let segnalazioni = [];
  async function caricaSegnalazioni() {
    try {
      const res = await fetch(`data/notizie.json?t=${Date.now()}`);
      if (res.ok) segnalazioni = (await res.json()).segnalazioniPrevendita || [];
    } catch { /* niente rassegna, pazienza */ }
    return segnalazioni;
  }

  /* Le prevendite non sono un "cambiamento": sono una scadenza.
     Vanno mostrate finché sono imminenti, anche se non è cambiato nulla. */
  function prevendite(films) {
    const voci = [];

    for (const s of segnalazioni) {
      const m = films.find(x => x.id === s.id);
      if (!m || m.user.seen) continue;
      voci.push({ id: m.id, film: m, tipo: 'prevendita', peso: 9,
        testo: `Si parla di <b>prevendite per ${F.esc(m.title)}</b> — ${F.esc(s.fonte)}`,
        link: s.link });
    }
    for (const m of films) {
      if (m.user.seen) continue;
      const p = F.prevendita(m);
      if (!p) continue;

      if (p.stato === 'oggi')
        voci.push({ id: m.id, film: m, tipo: 'prevendita', peso: 10,
          testo: `<b>${F.esc(m.title)}</b>: <b>le prevendite aprono oggi</b>` });
      else if (p.stato === 'domani')
        voci.push({ id: m.id, film: m, tipo: 'prevendita', peso: 9,
          testo: `<b>${F.esc(m.title)}</b>: prevendite <b>da domani</b>` });
      else if (p.stato === 'vicina')
        voci.push({ id: m.id, film: m, tipo: 'prevendita', peso: 8,
          testo: `<b>${F.esc(m.title)}</b>: prevendite fra ${p.g} giorni` });
      else if (p.stato === 'aperte')
        voci.push({ id: m.id, film: m, tipo: 'prevendita', peso: 4,
          testo: `<b>${F.esc(m.title)}</b>: prevendite aperte, il biglietto si può già prendere` });
    }
    return voci;
  }

  /* ── il pannello ─────────────────────────────────────── */
  async function render(films) {
    if (!contenitore) return;
    await caricaSegnalazioni();
    const esito = confronta(films);

    // Alla prima apertura non c'è un "prima" con cui confrontare,
    // ma le prevendite in scadenza vanno mostrate lo stesso.
    let voci = esito.voci;
    if (esito.primaVolta) {
      salva(films);
      const gia = vociLette();
      voci = prevendite(films).filter(v => !gia.has(impronta(v))).sort((a, b) => b.peso - a.peso);
    }

    if (!voci.length) { contenitore.hidden = true; salva(films); return; }
    esito.voci = voci;

    const giorni = esito.primaVolta ? 0 : Math.round((Date.now() - esito.quando) / 86400000);
    const mostrate = esito.voci.slice(0, 6);

    contenitore.hidden = false;
    contenitore.innerHTML = `
      <div class="nov-head">
        <span class="nov-et"><i class="live-dot"></i>Novità</span>
        <span class="nov-quando">${giorni <= 0 ? 'da poche ore' : giorni === 1 ? 'da ieri' : `negli ultimi ${giorni} giorni`}</span>
        <button class="nov-chiudi" data-nov-chiudi aria-label="Ho letto">Ho letto</button>
      </div>
      <ul class="nov-lista">
        ${mostrate.map(v => `<li class="nov-riga nov-${v.tipo}">
          <button data-open="${F.esc(v.id)}">
            <span class="nov-icona">${{ voto:'★', incasso:'$', pronto:'🍿', data:'📅', nuovo:'+', prevendita:'🎫' }[v.tipo]}</span>
            <span>${v.testo}</span>
          </button>
          ${v.link ? `<a class="nov-link" href="${F.esc(v.link)}" target="_blank" rel="noopener">leggi</a>` : ''}
        </li>`).join('')}
      </ul>
      ${esito.voci.length > mostrate.length
        ? `<p class="nov-altro">e altre ${esito.voci.length - mostrate.length} novità</p>` : ''}`;

    contenitore.querySelector('[data-nov-chiudi]').addEventListener('click', () => {
      salva(films);
      archivia(esito.voci);      // queste non le rivedrai più
      contenitore.hidden = true;
    });
  }

  /* Utile per provare il meccanismo senza aspettare giorni. */
  const dimentica = () => { localStorage.removeItem(KEY); localStorage.removeItem(LETTE); };

  return { render, dimentica, confronta };
})();
