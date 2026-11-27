import test from "node:test";
import assert from "node:assert/strict";
import BN from "bn.js";
import { Keypair } from "@solana/web3.js";
import { decodeJobAccount } from "./job";
import { HttpError } from "./http";

function makeRawJob(overrides: Record<string, unknown> = {}) {
  return {
    jobId: new BN("1732700000000"),
    client: Keypair.generate().publicKey,
    freelancer: Keypair.generate().publicKey,
    arbiter: Keypair.generate().publicKey,
    admin: Keypair.generate().publicKey,
    amount: new BN(500_000_000),
    specHash: Array.from({ length: 32 }, (_, i) => i),
    deliverableHash: Array.from({ length: 32 }, (_, i) => 255 - i),
    status: { submitted: {} },
    verdict: 0,
    verdictScore: 0,
    verdictProposedAt: new BN(0),
    disputeWindowSecs: new BN(180),
    deadline: new BN(1732800000),
    disputedBy: Keypair.generate().publicKey,
    bump: 254,
    submittedAt: new BN(1732700500),
    deliverableUri: "http://localhost:4000/api/deliverables/abc",
    verdictUri: "",
    ...overrides,
  };
}

test("decodeJobAccount converts BN fields, hashes, and status cleanly", () => {
  const pda = Keypair.generate().publicKey.toBase58();
  const raw = makeRawJob();
  const view = decodeJobAccount(pda, raw);

  assert.equal(view.jobPda, pda);
  assert.equal(view.jobId, "1732700000000");
  assert.equal(view.amount, "500000000");
  assert.equal(view.status, "submitted");
  assert.equal(view.disputeWindowSecs, 180);
  assert.equal(view.submittedAt, 1732700500);
  assert.equal(view.specHash.length, 64);
  assert.equal(view.deliverableHash.length, 64);
  assert.equal(view.deliverableUri, "http://localhost:4000/api/deliverables/abc");
});

test("decodeJobAccount handles PascalCase enum variant keys", () => {
  const pda = Keypair.generate().publicKey.toBase58();
  const view = decodeJobAccount(pda, makeRawJob({ status: { VerdictProposed: {} } }));
  assert.equal(view.status, "verdictProposed");
});

test("decodeJobAccount throws UNKNOWN_JOB_STATUS on invalid status", () => {
  const pda = Keypair.generate().publicKey.toBase58();
  assert.throws(
    () => decodeJobAccount(pda, makeRawJob({ status: { bogus: {} } })),
    (err: unknown) => err instanceof HttpError && err.code === "UNKNOWN_JOB_STATUS"
  );
});