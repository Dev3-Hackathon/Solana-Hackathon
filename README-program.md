# ProofPay escrow program (Helya)

Anchor 0.32.1 · SOL escrow · 10 instructions · devnet.

## Files

```
Anchor.toml
Cargo.toml                      # workspace
programs/escrow/Cargo.toml
programs/escrow/src/lib.rs      # the whole program (single file on purpose)
tests/escrow.ts                 # 25 tests
scripts/gen-keys.sh             # creates arbiter/admin keys and writes them into lib.rs
package.json, tsconfig.json, .gitignore
```

Copy these into the repo root (`programs/` and `tests/` sit next to `app/`, `backend/` and `ai-service/`).

## First run (about 15 min)

```bash
# 0. toolchain (once)
# Linux/WSL only: sudo apt install -y libudev-dev pkg-config   (Anchor CLI fails to build without it)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.32.1 && avm use 0.32.1
solana-keygen new                      # deployer wallet, if you don't have one

# 1. deps
npm install

# 2. arbiter + admin keys -> writes pubkeys into lib.rs
bash scripts/gen-keys.sh

# 3. program id -> writes real id into lib.rs + Anchor.toml
anchor keys sync

# 4. build + test on a local validator
anchor build
anchor test
```

## Deploy to devnet

```bash
solana config set --url devnet
solana airdrop 2        # or https://faucet.solana.com, deploy needs ~2-3 SOL
anchor deploy --provider.cluster devnet
```

Then:
1. Post the **program ID** in team chat (`solana address -k target/deploy/escrow-keypair.json`).
2. Commit `target/idl/escrow.json` and `target/types/escrow.ts` (the .gitignore allows these).
3. **Back up `target/deploy/escrow-keypair.json` privately.** It is ignored by git, and without it you can't upgrade the program at the same ID.

Re-deploying after changes uses the same command and keeps the same program ID.

## Status

Compiles against `anchor-lang 0.32.1` with no warnings. The IDL in `target/idl/` and `target/types/` was generated from this code, and the tests type-check against it.
**The tests have not been run on a validator yet.** Run `anchor test` first and fix anything red before deploying.

## Changes from TEAM_PLAN.md / INTERFACE.md (tell the team)

| Change | Why |
|---|---|
| **Helya generates both arbiter and admin keys** (`gen-keys.sh`) instead of getting pubkeys from Hamza and Yanfei | Tests must sign as arbiter and admin, so they need the secret keys. Send `keys/arbiter.json` privately to Hamza (his backend signs with it) and `keys/admin.json` privately to Yanfei (import into Phantom as the admin wallet). Devnet-only keys. |
| `MIN_WINDOW_SECS` = **5** (was 60) | Tests can run with a 5 s window. Demo still uses 180. |
| `MIN_AMOUNT_LAMPORTS` = **0.001 SOL** | A tiny payout to a brand-new wallet would fail Solana's rent rule. |
| New errors: `InvalidFreelancer`, `InsufficientEscrow` | Clearer messages. |
| Strings moved to the end of `Job` | Fixed byte offsets: `client` @16, `freelancer` @48, **`status` @216**, so the frontend can filter by status too. |
| `finalize` is permissionless, **including for the arbiter** | It can only pay out what the verdict and window already decided. The arbiter still can't `approve` or `resolve_dispute`, and both are tested. |
| `approve` also works in `Submitted` | Client can pay before the AI finishes. **Hamza:** if `proposeVerdict` fails with `InvalidStatus`, the client already approved. Treat it as done. |

## Calling it from TypeScript (Hamza, Yanfei)

Use `.accountsPartial({...})` and pass every account explicitly. It's the least surprising option in Anchor 0.30+.

```ts
// PDA
const [job] = PublicKey.findProgramAddressSync(
  [Buffer.from("job"), client.toBuffer(), jobId.toArrayLike(Buffer, "le", 8)],
  program.programId
);

// status comes back as an object: { funded: {} }
const status = Object.keys((await program.account.job.fetch(job)).status)[0];

// verdict codes: 1 pass, 2 fail, 3 inconclusive
await program.methods.proposeVerdict(1, 88, reportUrl)
  .accountsPartial({ arbiter: arbiter.publicKey, job })
  .signers([arbiter]).rpc();

// finalize / resolve_dispute need client + freelancer as accounts
await program.methods.finalize()
  .accountsPartial({ job, client, freelancer }).rpc();
```

Filters for the dashboard:
```ts
program.account.job.all([{ memcmp: { offset: 16, bytes: wallet.toBase58() } }]); // as client
program.account.job.all([{ memcmp: { offset: 48, bytes: wallet.toBase58() } }]); // as freelancer
```

The test file has a working example of `createJob + fundJob` in **one transaction**, which is what the frontend should do.

## Known limits (fine for the MVP)

- If the AI backend never posts a verdict, a `Submitted` job waits until the client `approve`s. There's no admin rescue from `Submitted` yet. Easy to add on Day 2 if wanted.
- Job accounts are never closed, so rent (~0.004 SOL) stays in each PDA.
