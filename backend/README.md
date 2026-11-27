# ProofPay Backend (`backend/`)

TypeScript / Express 5 API server for ProofPay. Stores job specs, deliverable snapshots, AI evaluation reports, and dispute notes in SQLite, calls the FastAPI AI review service, and signs `propose_verdict` on Solana devnet with the arbiter keypair.

## Prerequisites
- Node.js 22+
- Solana CLI (for generating/funding the arbiter devnet keypair)
- Deployed `escrow` program IDL at `src/idl/escrow.json`

## Setup

```bash
cd backend
npm install
cp .env.example .env
mkdir -p keys data
solana-keygen new -o keys/arbiter.json
solana airdrop 1 $(solana-keygen pubkey keys/arbiter.json) --url devnet