#!/usr/bin/env bash
# Generates the arbiter + admin keypairs and writes their pubkeys into lib.rs.
# Run once from the repo root. Never commit the keys/ folder.
set -euo pipefail

mkdir -p keys
for name in arbiter admin; do
  if [ ! -f "keys/$name.json" ]; then
    solana-keygen new --no-bip39-passphrase --silent -o "keys/$name.json"
  fi
done

ARBITER=$(solana-keygen pubkey keys/arbiter.json)
ADMIN=$(solana-keygen pubkey keys/admin.json)
LIB=programs/escrow/src/lib.rs

sed -i.bak -E "s|(pub const ARBITER: Pubkey = pubkey!\(\")[^\"]+|\1$ARBITER|" "$LIB"
sed -i.bak -E "s|(pub const ADMIN: +Pubkey = pubkey!\(\")[^\"]+|\1$ADMIN|" "$LIB"
rm -f "$LIB.bak"

echo "ARBITER = $ARBITER   (send keys/arbiter.json PRIVATELY to Hamza)"
echo "ADMIN   = $ADMIN   (send keys/admin.json PRIVATELY to Yanfei to import into Phantom)"
grep -E "pub const (ARBITER|ADMIN)" "$LIB"
