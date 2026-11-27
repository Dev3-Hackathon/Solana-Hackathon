#!/usr/bin/env bash
# Copy the latest IDL + TS types to every place that uses them.
set -euo pipefail
for d in frontend/src/idl backend/src/idl; do
  mkdir -p "$d"
  cp target/idl/escrow.json target/types/escrow.ts "$d/"
done
echo "IDL synced to frontend/src/idl and backend/src/idl"
