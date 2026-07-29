#!/bin/bash
# Aggiornamento automatico del catalogo (TMDB + OMDb).
# Lanciato dal LaunchAgent com.mike.cineteca, ma anche eseguibile a mano.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/aggiornamento.log"
NODE="$(command -v node || echo /opt/homebrew/bin/node)"

cd "$ROOT" || exit 1

{
  echo "─── $(date '+%Y-%m-%d %H:%M:%S') ───"

  # Senza rete non ha senso provarci: eviterei solo rumore nel log.
  if ! curl -sf -m 10 -o /dev/null https://api.themoviedb.org/3/configuration; then
    echo "· nessuna connessione a TMDB, salto"
    exit 0
  fi

  "$NODE" tools/enrich.mjs 2>&1
  echo "esito: $?"
  echo
} >> "$LOG" 2>&1

# Il log non deve crescere all'infinito.
if [ "$(wc -l < "$LOG")" -gt 500 ]; then
  tail -n 300 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
