/* ══════════════════════════════════════════════════════════
   format.js — formattazione, helper DOM, poster
   ══════════════════════════════════════════════════════════ */

const F = (() => {
  const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
                'luglio','agosto','settembre','ottobre','novembre','dicembre'];

  const GIORNO_MS = 86400000;
  const oggi = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };

  /* ── date ────────────────────────────────────────────── */
  function dataLunga(d) {
    if (!d) return 'Data da definire';
    return `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
  }

  function dataBreve(d) {
    if (!d) return 'TBA';
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  }

  const meseAnno = d => `${MESI[d.getMonth()]} ${d.getFullYear()}`;

  /** Giorni che mancano all'uscita. Negativo = già uscito. */
  function giorniA(d) {
    if (!d) return null;
    return Math.round((d.getTime() - oggi().getTime()) / GIORNO_MS);
  }

  function attesa(d) {
    const g = giorniA(d);
    if (g === null) return 'In arrivo';
    if (g < -30) return 'Nelle sale';
    if (g < 0)   return `Uscito ${-g} ${-g === 1 ? 'giorno' : 'giorni'} fa`;
    if (g === 0) return 'Esce oggi';
    if (g === 1) return 'Domani';
    if (g < 30)  return `Tra ${g} giorni`;
    const m = Math.round(g / 30.4);
    return `Tra ${m} ${m === 1 ? 'mese' : 'mesi'}`;
  }

  /** Countdown vivo all'uscita: giorni, ore, minuti, secondi. */
  function countdown(d) {
    if (!d) return [];
    let resto = Math.max(0, d.getTime() - Date.now());
    const passo = (ms) => { const n = Math.floor(resto / ms); resto -= n * ms; return n; };
    return [
      { v: passo(GIORNO_MS), l: 'giorni' },
      { v: passo(3600000),   l: 'ore' },
      { v: passo(60000),     l: 'min' },
      { v: passo(1000),      l: 'sec' }
    ];
  }

  /* ── numeri ──────────────────────────────────────────── */
  function durata(min) {
    if (!min) return null;
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m`;
  }

  function soldi(n) {
    if (!n) return null;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${Math.round(n / 1e6)}M`;
    if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
    return `$${n}`;
  }

  /* ── poster ──────────────────────────────────────────── */
  const TMDB_IMG = 'https://image.tmdb.org/t/p';
  /* I path TMDB arrivano già con lo slash iniziale: lo normalizzo per non generare "//". */
  const img = (path, size) => path ? `${TMDB_IMG}/${size}/${String(path).replace(/^\/+/, '')}` : null;

  const poster   = (m, size = 'w500')    => img(m.poster, size);
  const backdrop = (m, size = 'w1280')   => img(m.backdrop, size);
  const profilo  = (path, size = 'w185') => img(path, size);

  const iniziali = nome => nome.split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase();

  /* Articolo giusto davanti al genere: "l'horror", non "il horror". */
  const ARTICOLI = {
    azione: "l'", avventura: "l'", animazione: "l'", horror: "l'",
    commedia: 'la ', famiglia: 'la ', storia: 'la ', musica: 'la ',
    fantascienza: 'la ', guerra: 'la ', commediamusicale: 'la ',
    crime: 'il ', documentario: 'il ', dramma: 'il ', drammatico: 'il ',
    fantasy: 'il ', mistero: 'il ', romance: 'il ', thriller: 'il ', western: 'il '
  };
  function conArticolo(genere) {
    const g = String(genere).toLowerCase();
    const art = ARTICOLI[g.replace(/\s+/g, '')] ?? (/^[aeiou]/.test(g) ? "l'" : 'il ');
    return art + g;
  }

  /* TMDB elenca anche i canali rivenduti ("HBO Max Amazon Channel"):
     tengo il servizio vero e tolgo i doppioni. */
  function piattaforme(lista = []) {
    const pulito = lista
      .map(n => n.replace(/\s+Amazon (Channel|channel)$/i, '')
                 .replace(/\s+with Ads$/i, '')
                 .replace(/\s+Full$/i, '')
                 .trim())
      .filter(Boolean);
    return [...new Set(pulito)];
  }

  /* ── DOM ─────────────────────────────────────────────── */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  /** Raggruppa una lista in una Map, preservando l'ordine di inserimento. */
  function raggruppa(items, chiave) {
    const map = new Map();
    for (const it of items) {
      const k = chiave(it);
      if (k == null) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return map;
  }

  /** Conta le occorrenze di ogni valore restituito da `chiave` (che può dare array). */
  function conteggio(items, chiave) {
    const c = new Map();
    for (const it of items) {
      const v = chiave(it);
      for (const k of (Array.isArray(v) ? v : [v])) {
        if (k == null || k === '') continue;
        c.set(k, (c.get(k) || 0) + 1);
      }
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  }

  return { MESI, dataLunga, dataBreve, meseAnno, giorniA, attesa, countdown,
           durata, soldi, poster, backdrop, profilo, iniziali, piattaforme, conArticolo,
           esc, raggruppa, conteggio };
})();
