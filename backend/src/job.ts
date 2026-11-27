import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { bytesToHex } from "./hash";
import { HttpError } from "./http";

export const JOB_STATUS_NAMES = [
  "created",
  "funded",
  "accepted",
  "submitted",
  "verdictProposed",
  "disputed",
  "released",
  "refunded",
  "cancelled",
] as const;

export type JobStatusName = (typeof JOB_STATUS_NAMES)[number];

export interface JobView {
  jobPda: string;
  jobId: string;
  client: string;
  freelancer: string;
  arbiter: string;
  admin: string;
  amount: string; // lamports as string (safe > 2^53)
  specHash: string;
  deliverableHash: string;
  status: JobStatusName;
  verdict: number;
  verdictScore: number;
  verdictProposedAt: number;
  disputeWindowSecs: number;
  deadline: number;
  disputedBy: string;
  bump: number;
  submittedAt: number;
  deliverableUri: string;
  verdictUri: string;
}

function toNumber(val: unknown, field: string): number {
  if (typeof val === "number") return val;
  if (val && typeof (val as BN).toNumber === "function") {
    return (val as BN).toNumber();
  }
  throw new HttpError(500, "JOB_DECODE_FAILED", `Invalid numeric field ${field}`);
}

function toBigIntString(val: unknown, field: string): string {
  if (typeof val === "bigint" || typeof val === "number") return String(val);
  if (val && typeof (val as BN).toString === "function") {
    return (val as BN).toString(10);
  }
  throw new HttpError(500, "JOB_DECODE_FAILED", `Invalid u64 field ${field}`);
}

function toPubkeyString(val: unknown, field: string): string {
  if (val instanceof PublicKey) return val.toBase58();
  if (typeof val === "string") return val;
  throw new HttpError(500, "JOB_DECODE_FAILED", `Invalid pubkey field ${field}`);
}

function toHashHex(val: unknown, field: string): string {
  if (val instanceof Uint8Array || Array.isArray(val)) {
    const bytes = Uint8Array.from(val);
    if (bytes.length !== 32) {
      throw new HttpError(500, "JOB_DECODE_FAILED", `Expected 32 bytes for ${field}`);
    }
    return bytesToHex(bytes);
  }
  throw new HttpError(500, "JOB_DECODE_FAILED", `Invalid hash field ${field}`);
}

function parseStatus(rawStatus: unknown): JobStatusName {
  if (rawStatus && typeof rawStatus === "object") {
    const keys = Object.keys(rawStatus as Record<string, unknown>);
    if (keys.length === 1) {
      const key = keys[0];
      const normalized = (key.charAt(0).toLowerCase() + key.slice(1)) as JobStatusName;
      if ((JOB_STATUS_NAMES as readonly string[]).includes(normalized)) {
        return normalized;
      }
    }
  }
  throw new HttpError(500, "UNKNOWN_JOB_STATUS", `Unknown on-chain JobStatus: ${JSON.stringify(rawStatus)}`);
}

/** Converts a raw Anchor-decoded Job account into a plain JSON-safe JobView. */
export function decodeJobAccount(jobPda: string, raw: Record<string, unknown>): JobView {
  return {
    jobPda,
    jobId: toBigIntString(raw.jobId, "jobId"),
    client: toPubkeyString(raw.client, "client"),
    freelancer: toPubkeyString(raw.freelancer, "freelancer"),
    arbiter: toPubkeyString(raw.arbiter, "arbiter"),
    admin: toPubkeyString(raw.admin, "admin"),
    amount: toBigIntString(raw.amount, "amount"),
    specHash: toHashHex(raw.specHash, "specHash"),
    deliverableHash: toHashHex(raw.deliverableHash, "deliverableHash"),
    status: parseStatus(raw.status),
    verdict: toNumber(raw.verdict, "verdict"),
    verdictScore: toNumber(raw.verdictScore, "verdictScore"),
    verdictProposedAt: toNumber(raw.verdictProposedAt, "verdictProposedAt"),
    disputeWindowSecs: toNumber(raw.disputeWindowSecs, "disputeWindowSecs"),
    deadline: toNumber(raw.deadline, "deadline"),
    disputedBy: toPubkeyString(raw.disputedBy, "disputedBy"),
    bump: toNumber(raw.bump, "bump"),
    submittedAt: toNumber(raw.submittedAt, "submittedAt"),
    deliverableUri: String(raw.deliverableUri ?? ""),
    verdictUri: String(raw.verdictUri ?? ""),
  };
}