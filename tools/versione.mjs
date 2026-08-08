/* ══════════════════════════════════════════════════════════
   versione.mjs — allinea la versione degli asset

   Ogni file caricato dall'index porta un `?v=…`, e il service
   worker nomina la sua cache allo stesso modo: è così che un
   telefono che ha già aperto la cineteca si accorge che c'è
   qualcosa di nuovo.

   Il workflow notturno lo fa da solo quando cambiano i dati
   (.github/workflows/aggiorna.yml). Quando invece a cambiare è
   il codice — un file nuovo, uno stile corretto — quel giro non
   passa, e senza questo comando la versione resta indietro:
   il browser continua a servire il JavaScript vecchio e il file
   appena aggiunto non viene mai chiesto.

   Uso:  node tools/versione.mjs
   ══════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from 'node:fs';

const due = n => String(n).padStart(2, '0');
const d = new Date();
const V = `${d.getUTCFullYear()}${due(d.getUTCMonth() + 1)}${due(d.getUTCDate())}${due(d.getUTCHours())}${due(d.getUTCMinutes())}`;

/* Le stesse due sostituzioni del workflow, per non avere due
   verità diverse su come si chiama una versione. */
const passaggi = [
  { file: 'index.html', da: /v=[0-9]{8,12}/g,    a: `v=${V}` },
  { file: 'sw.js',      da: /cineteca-v[0-9]+/g, a: `cineteca-v${V}` }
];

for (const { file, da, a } of passaggi) {
  const prima = readFileSync(file, 'utf8');
  const dopo = prima.replace(da, a);
  writeFileSync(file, dopo);
  const n = (prima.match(da) || []).length;
  console.log(`${file}: ${n} riferimenti aggiornati`);
}

/* Il service worker elenca a mano i file della shell: se ne aggiungi
   uno all'index e ti dimentichi di sw.js, la cineteca funziona finché
   c'è rete e si rompe in aereo. Meglio accorgersene adesso. */
const script = [...readFileSync('index.html', 'utf8').matchAll(/src="(js\/[^"?]+)/g)].map(m => m[1]);
const shell = readFileSync('sw.js', 'utf8');
const mancanti = script.filter(s => !shell.includes(`./${s}`));

console.log(`\nVersione: ${V}`);
if (mancanti.length) {
  console.warn(`\n⚠ Questi script sono nell'index ma non nella shell del service worker:\n  ${mancanti.join('\n  ')}\n  Aggiungili all'elenco SHELL in sw.js, o offline mancheranno.`);
  process.exitCode = 1;
}
