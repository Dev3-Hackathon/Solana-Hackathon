import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair } from "@solana/web3.js";
import { env } from "./env";

export const connection = new Connection(env.RPC_URL, "confirmed");

function loadArbiter(): Keypair {
  const file = path.resolve(env.ARBITER_KEYPAIR_PATH);
  if (!fs.existsSync(file)) {
    console.error(`Arbiter keypair not found at ${file}`);
    console.error("Create it with: solana-keygen new -o keys/arbiter.json");
    process.exit(1);
  }
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")));
  return Keypair.fromSecretKey(secret);
}

// Only this module ever touches the private key. Never log it.
export const arbiter = loadArbiter();