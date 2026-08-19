#!/usr/bin/env bash

set -euo pipefail

npm run cron:stripe-sync:loop &
SYNC_PID=$!

cleanup() {
  if kill -0 "$SYNC_PID" 2>/dev/null; then
    kill "$SYNC_PID" 2>/dev/null || true
    wait "$SYNC_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

npm start
