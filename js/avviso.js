/* ══════════════════════════════════════════════════════════
   avviso.js — messaggio in basso con azione di ripensamento

   Serve alle azioni che tolgono qualcosa: comparire per qualche
   secondo con un "Annulla" è più gentile di una finestra che
   chiede conferma prima di ogni cosa.
   ══════════════════════════════════════════════════════════ */

const Avviso = (() => {
  let box = null, timer = null;

  function mostra(testo, etichettaAzione, azione, secondi = 6) {
    if (!box) {
      box = document.createElement('div');
      box.className = 'avviso';
      document.body.appendChild(box);
    }
    clearTimeout(timer);

    box.innerHTML = `<span>${testo}</span>${
      azione ? `<button class="avviso-azione">${F.esc(etichettaAzione)}</button>` : ''}`;
    box.hidden = false;
    box.classList.add('is-vivo');

    if (azione) box.querySelector('.avviso-azione').addEventListener('click', () => {
      azione();
      chiudi();
    });

    timer = setTimeout(chiudi, secondi * 1000);
  }

  function chiudi() {
    if (!box) return;
    box.classList.remove('is-vivo');
    setTimeout(() => { if (box) box.hidden = true; }, 300);
  }

  return { mostra, chiudi };
})();
