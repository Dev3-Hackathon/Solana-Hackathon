import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

/** Throw this from any route; the global error handler turns it into { error, code }. */
export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Validate a request body with zod, or throw a 400 VALIDATION_ERROR. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    throw new HttpError(400, "VALIDATION_ERROR", message);
  }
  return result.data;
}

/** Check that a string is a valid Solana address and return it normalized. */
export function requirePubkey(value: unknown, name = "jobPda"): string {
  try {
    return new PublicKey(String(value)).toBase58();
  } catch {
    throw new HttpError(400, "INVALID_PUBKEY", `${name} is not a valid Solana address`);
  }
}