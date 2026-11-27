import { createHash } from "node:crypto";

export type SpecInput = {
  title: string;
  description: string;
  criteria: string[];
};

/** SHA-256 as a 64-char lowercase hex string. Strings are hashed as UTF-8. */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Canonical spec JSON (INTERFACE.md §4.1).
 * The keys are written out one by one so the order is ALWAYS
 * title, description, criteria, whatever order the caller's object had.
 */
export function canonicalSpec(spec: SpecInput): string {
  return JSON.stringify({
    title: spec.title,
    description: spec.description,
    criteria: spec.criteria,
  });
}

/** Hex hash of the canonical spec. Sent over HTTP as hex. */
export function specHashHex(spec: SpecInput): string {
  return sha256Hex(canonicalSpec(spec));
}

/** Hex string -> number[32] for Anchor [u8; 32] arguments. */
export function hexToBytes(hex: string): number[] {
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error("Expected a 64-character hex string");
  }
  return Array.from(Buffer.from(hex, "hex"));
}

/** number[32] / Uint8Array from the chain -> hex string. */
export function bytesToHex(bytes: ArrayLike<number>): string {
  return Buffer.from(Array.from(bytes)).toString("hex");
}