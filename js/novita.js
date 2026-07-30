/* ══════════════════════════════════════════════════════════
   novita.js — cosa è cambiato da quando non ci sei

   A ogni apertura confronta il catalogo con l'istantanea
   salvata l'ultima volta e racconta le differenze: voti
   arrivati o cambiati, incassi che si muovono, film sbarcati
   in streaming, date che slittano.

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
    str: (m.streaming || []).slice().sort().join('|')
  }]));

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

      /* sbarco in streaming */
      if (adesso.str !== era.str) {
        const nuove = adesso.str.split('|').filter(p => p && !era.str.split('|').includes(p));
        const pulite = F.piattaforme(nuove);
        if (pulite.length)
          voci.push({ id, film: m, tipo: 'streaming', peso: 5,
            testo: `<b>${F.esc(adesso.t)}</b> è arrivato su <b>${F.esc(pulite[0])}</b>` });
      }

      /* data spostata */
      if (era.usc && adesso.usc && era.usc !== adesso.usc) {
        const va = new Date(adesso.usc) > new Date(era.usc);
        voci.push({ id, film: m, tipo: 'data', peso: 5,
          testo: `<b>${F.esc(adesso.t)}</b> ${va ? 'slitta' : 'anticipa'} al <b>${
            F.dataLunga(new Date(`${adesso.usc}T00:00:00`))}</b>` });
      }
    }

    voci.sort((a, b) => b.peso - a.peso);
    return { primaVolta: false, quando: prima.quando, voci };
  }

  /* ── il pannello ─────────────────────────────────────── */
  function render(films) {
    if (!contenitore) return;
    const esito = confronta(films);

    // La prima volta non c'è un "prima": registro e basta.
    if (esito.primaVolta) { salva(films); contenitore.hidden = true; return; }
    if (!esito.voci.length) { contenitore.hidden = true; salva(films); return; }

    const giorni = Math.round((Date.now() - esito.quando) / 86400000);
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
            <span class="nov-icona">${{ voto:'★', incasso:'$', streaming:'▶', data:'📅', nuovo:'+' }[v.tipo]}</span>
            <span>${v.testo}</span>
          </button>
        </li>`).join('')}
      </ul>
      ${esito.voci.length > mostrate.length
        ? `<p class="nov-altro">e altre ${esito.voci.length - mostrate.length} novità</p>` : ''}`;

    contenitore.querySelector('[data-nov-chiudi]').addEventListener('click', () => {
      salva(films);
      contenitore.hidden = true;
    });
  }

  /* Utile per provare il meccanismo senza aspettare giorni. */
  const dimentica = () => localStorage.removeItem(KEY);

  return { render, dimentica, confronta };
})();
