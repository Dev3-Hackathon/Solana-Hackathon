import fs from "node:fs";
import path from "node:path";
import BN from "bn.js";
import { AnchorProvider, Idl, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { env } from "./env";
import { hexToBytes } from "./hash";
import { HttpError } from "./http";
import { decodeJobAccount, JobView } from "./job";
import { VerdictOutcome } from "./ai";
import { VERDICT_CODES } from "./evaluate";

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

let cachedProgram: Program | null = null;

export function getProgram(): Program {
  if (cachedProgram) return cachedProgram;

  const idlPath = path.resolve(__dirname, "idl", "escrow.json");
  if (!fs.existsSync(idlPath)) {
    throw new HttpError(
      503,
      "CHAIN_NOT_CONFIGURED",
      "Program IDL not found at src/idl/escrow.json"
    );
  }

  const rawIdl = JSON.parse(fs.readFileSync(idlPath, "utf8")) as Idl & { address?: string };
  if (env.PROGRAM_ID) {
    rawIdl.address = env.PROGRAM_ID;
  }
  if (!rawIdl.address) {
    throw new HttpError(503, "CHAIN_NOT_CONFIGURED", "PROGRAM_ID is not configured");
  }

  const wallet = new Wallet(arbiter);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  cachedProgram = new Program(rawIdl, provider);
  return cachedProgram;
}

export async function getJob(jobPda: string): Promise<JobView> {
  const program = getProgram();
  const pubkey = new PublicKey(jobPda);

  let info;
  try {
    info = await connection.getAccountInfo(pubkey, "confirmed");
  } catch (err) {
    throw new HttpError(
      502,
      "RPC_ERROR",
      `Failed to fetch account ${jobPda}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!info) {
    throw new HttpError(404, "JOB_NOT_FOUND", `On-chain job account not found: ${jobPda}`);
  }

  if (!info.owner.equals(program.programId)) {
    throw new HttpError(
      404,
      "JOB_NOT_FOUND",
      `Account ${jobPda} is not owned by program ${program.programId.toBase58()}`
    );
  }

  const accountEntry = program.idl.accounts?.find(
    (a) => a.name.toLowerCase() === "job"
  );
  if (!accountEntry) {
    throw new HttpError(500, "IDL_MISMATCH", "Job account definition missing from IDL");
  }

  let decoded: Record<string, unknown>;
  try {
    decoded = program.coder.accounts.decode(accountEntry.name, info.data);
  } catch (err) {
    throw new HttpError(
      500,
      "JOB_DECODE_FAILED",
      `Failed to decode Job account ${jobPda}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return decodeJobAccount(jobPda, decoded);
}

export async function getArbiterBalanceSol(): Promise<number | null> {
  try {
    const lamports = await connection.getBalance(arbiter.publicKey, "confirmed");
    return Number((lamports / LAMPORTS_PER_SOL).toFixed(6));
  } catch {
    return null;
  }
}

export async function proposeVerdictOnChain(
  jobPda: string,
  outcome: VerdictOutcome,
  score: number,
  verdictUri: string
): Promise<string> {
  if (Buffer.byteLength(verdictUri, "utf8") > 200) {
    throw new HttpError(400, "URI_TOO_LONG", "verdict_uri exceeds 200 bytes");
  }

  const program = getProgram();
  const code = VERDICT_CODES[outcome];

  const txSignature = await program.methods
    .proposeVerdict(code, score, verdictUri)
    .accounts({
      arbiter: arbiter.publicKey,
      job: new PublicKey(jobPda),
    })
    .signers([arbiter])
    .rpc();

  return txSignature;
}

export interface CreateJobForParams {
  client: string;
  freelancer: string;
  amountLamports: string;
  specHashHex: string;
  deadline: number;
  disputeWindowSecs: number;
}

export async function createJobForOnChain(
  params: CreateJobForParams
): Promise<{ jobPda: string; jobId: string; txSignature: string }> {
  const program = getProgram();
  const clientPk = new PublicKey(params.client);
  const freelancerPk = new PublicKey(params.freelancer);
  const jobId = new BN(Date.now());
  const amount = new BN(params.amountLamports, 10);

  const [jobPdaPk] = PublicKey.findProgramAddressSync(
    [Buffer.from("job"), clientPk.toBuffer(), jobId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  const txSignature = await program.methods
    .createJobFor(
      jobId,
      clientPk,
      freelancerPk,
      amount,
      Array.from(hexToBytes(params.specHashHex)),
      new BN(params.deadline),
      new BN(params.disputeWindowSecs)
    )
    .accounts({
      payer: arbiter.publicKey,
      job: jobPdaPk,
      systemProgram: SystemProgram.programId,
    })
    .signers([arbiter])
    .rpc();

  return {
    jobPda: jobPdaPk.toBase58(),
    jobId: jobId.toString(10),
    txSignature,
  };
}

export async function confirmFundingOnChain(jobPda: string): Promise<string> {
  const program = getProgram();
  const txSignature = await program.methods
    .confirmFunding()
    .accounts({
      job: new PublicKey(jobPda),
    })
    .signers([arbiter])
    .rpc();

  return txSignature;
}

export function isNotFundedAnchorError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("NotFunded") || msg.includes("does not hold the escrow amount yet");
}