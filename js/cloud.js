/* ══════════════════════════════════════════════════════════
   cloud.js — accesso e sincronizzazione via Supabase

   Il login è facoltativo: senza, l'app funziona esattamente
   come prima e i dati restano nel browser. Da loggato, voti e
   stato viaggiano nella tua riga di `cineteca_states` e li
   ritrovi su qualsiasi dispositivo.

   Regola di fusione: film per film vince la modifica più
   recente. Così Mac e iPhone si sommano invece di sovrascriversi.
   ══════════════════════════════════════════════════════════ */

const Cloud = (() => {
  const pronto = typeof window.supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined';
  if (!pronto) {
    console.warn('[cloud] Supabase non disponibile: la cineteca resta solo locale.');
    return { disponibile: false, render: () => {} };
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const TABELLA = 'cineteca_states';

  let utente = null;
  let cloudPieno = false;      // il cloud aveva dati all'ultimo scaricamento
  let timerPush = null;
  let stato = 'scollegato';    // scollegato | collegato | invio | errore

  const guscio = document.getElementById('account');

  /* ── invio ───────────────────────────────────────────── */
  function programmaInvio() {
    clearTimeout(timerPush);
    timerPush = setTimeout(invia, 800);
  }

  async function invia() {
    if (!utente) return;

    /* Rete di sicurezza: se il cloud ha dati e qui non c'è niente
       (Safari che svuota lo storage, browser nuovo) non cancello
       l'archivio — scarico invece di caricare. */
    if (cloudPieno && Store.quantiToccati() === 0) {
      console.warn('[cloud] invio bloccato: stato locale vuoto ma il cloud ha dati');
      return scarica();
    }

    segnala('invio');
    const { error } = await sb.from(TABELLA)
      .upsert({ user_id: utente.id, data: Store.stato() }, { onConflict: 'user_id' });

    if (error) { console.error('[cloud] invio fallito:', error.message); segnala('errore', error.message); }
    else { cloudPieno = Store.quantiToccati() > 0; segnala('collegato'); }
  }

  /* ── scaricamento e fusione ──────────────────────────── */
  async function scarica() {
    if (!utente) return;
    segnala('invio');

    const { data, error } = await sb.from(TABELLA)
      .select('data').eq('user_id', utente.id).maybeSingle();

    if (error) { console.error('[cloud] scaricamento fallito:', error.message); return segnala('errore', error.message); }

    const remoto = data?.data || null;
    cloudPieno = Boolean(remoto && Object.keys(remoto.movies || {}).length);

    if (cloudPieno) {
      const cambiato = Store.fondi(remoto);
      Store.riparaArchivio?.();
      if (cambiato) document.dispatchEvent(new Event('cineteca:aggiornato'));
    }

    segnala('collegato');
    // Quel che ho in più qui va comunque caricato.
    if (Store.quantiToccati() > 0) invia();
  }

  /* ── accesso ─────────────────────────────────────────── */
  async function entra(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return error?.message || null;
  }

  async function registra(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return error.message;
    if (!data.session) return 'Ti ho mandato una mail: confermala e poi accedi.';
    return null;
  }

  async function esci() {
    await sb.auth.signOut();
  }

  async function reimposta(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href });
    return error?.message || 'Ti ho mandato una mail per reimpostare la password.';
  }

  /* ── interfaccia ─────────────────────────────────────── */
  const ETICHETTE = {
    scollegato: 'Non sincronizzato',
    collegato:  'Sincronizzato',
    invio:      'Sincronizzo…',
    errore:     'Errore di sincronia'
  };

  let messaggio = '';
  function segnala(nuovo, msg = '') {
    stato = nuovo;
    messaggio = msg;
    render();
  }

  function render() {
    if (!guscio) return;
    guscio.innerHTML = utente ? dentro() : fuori();
  }

  const dentro = () => `
    <button class="acc-chip is-${stato}" data-acc="apri" title="${F.esc(utente.email)}">
      <i class="acc-spia"></i>
      <span class="acc-nome">${F.esc(utente.email.split('@')[0])}</span>
    </button>
    <div class="acc-pannello" hidden data-acc-pannello>
      <p class="acc-titolo">${F.esc(ETICHETTE[stato])}</p>
      <p class="acc-mail">${F.esc(utente.email)}</p>
      ${messaggio ? `<p class="acc-errore">${F.esc(messaggio)}</p>` : ''}
      <p class="acc-nota">I tuoi voti viaggiano fra i dispositivi. Il catalogo dei film no: quello è uguale per tutti.</p>
      <div class="acc-azioni">
        <button class="btn btn-ghost" data-acc="scarica">Sincronizza ora</button>
        <button class="btn btn-ghost" data-acc="esci">Esci</button>
      </div>
    </div>`;

  const fuori = () => `
    <button class="acc-chip is-scollegato" data-acc="apri">
      <i class="acc-spia"></i><span class="acc-nome">Accedi</span>
    </button>
    <div class="acc-pannello" hidden data-acc-pannello>
      <p class="acc-titolo">Sincronizza i tuoi voti</p>
      <p class="acc-nota">Senza accesso la cineteca funziona lo stesso, ma voti e "da rivedere"
      restano su questo dispositivo. Accedendo li ritrovi ovunque.</p>
      <label class="acc-campo"><span>Email</span><input type="email" data-acc-email autocomplete="email"></label>
      <label class="acc-campo"><span>Password</span><input type="password" data-acc-pw autocomplete="current-password"></label>
      ${messaggio ? `<p class="acc-errore">${F.esc(messaggio)}</p>` : ''}
      <div class="acc-azioni">
        <button class="btn btn-primary" data-acc="entra">Accedi</button>
        <button class="btn btn-ghost" data-acc="registra">Crea account</button>
      </div>
      <button class="acc-link" data-acc="reimposta">Password dimenticata</button>
    </div>`;

  /* ── eventi ──────────────────────────────────────────── */
  document.addEventListener('click', async e => {
    const pannello = guscio?.querySelector('[data-acc-pannello]');
    const b = e.target.closest('[data-acc]');

    if (!b) {
      if (pannello && !e.target.closest('#account')) pannello.hidden = true;
      return;
    }

    const email = () => guscio.querySelector('[data-acc-email]')?.value.trim() || '';
    const pw    = () => guscio.querySelector('[data-acc-pw]')?.value || '';

    switch (b.dataset.acc) {
      case 'apri':
        pannello.hidden = !pannello.hidden;
        break;
      case 'entra': {
        const err = await entra(email(), pw());
        if (err) segnala(stato, err);
        break;
      }
      case 'registra': {
        const err = await registra(email(), pw());
        if (err) segnala(stato, err);
        break;
      }
      case 'reimposta':
        segnala(stato, await reimposta(email()));
        break;
      case 'scarica':
        await scarica();
        break;
      case 'esci':
        await esci();
        break;
    }
  });

  /* Ogni modifica locale parte verso il cloud, con un attimo di respiro
     per non fare una chiamata per ogni stella premuta. */
  Store.subscribe(() => { if (utente) programmaInvio(); });

  sb.auth.onAuthStateChange((_evento, sessione) => {
    utente = sessione?.user || null;
    if (utente) { messaggio = ''; scarica(); }
    else { cloudPieno = false; segnala('scollegato'); }
  });

  render();
  return { disponibile: true, render, scarica };
})();
