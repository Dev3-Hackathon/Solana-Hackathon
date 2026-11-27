import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { Escrow } from "../target/types/escrow";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.Escrow as Program<Escrow>;
const conn = provider.connection;

/** Arbiter and admin must match the constants in lib.rs. Run scripts/gen-keys.sh first. */
function loadKeypair(file: string): Keypair {
  const p = path.join(__dirname, "..", "keys", file);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing keys/${file}. Run: bash scripts/gen-keys.sh`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}
const arbiter = loadKeypair("arbiter.json");
const admin = loadKeypair("admin.json");

const AMOUNT = new BN(0.5 * LAMPORTS_PER_SOL);
const WINDOW_SECS = 5; // program minimum; demo uses 180
const SPEC_HASH = Array.from(Buffer.alloc(32, 7));
const DELIVERABLE_HASH = Array.from(Buffer.alloc(32, 9));

const PASS = 1;
const FAIL = 2;
const INCONCLUSIVE = 3;

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const now = () => Math.floor(Date.now() / 1000);
let nextJobId = Date.now();

async function fundedWallet(sol = 2): Promise<Keypair> {
  const kp = Keypair.generate();
  const sig = await conn.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  const bh = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  return kp;
}

function jobPda(client: PublicKey, jobId: BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("job"), client.toBuffer(), jobId.toArrayLike(Buffer, "le", 8)],
    program.programId
  )[0];
}

/** Assert the promise fails with the given Anchor error code name. */
async function expectError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e: any) {
    const got =
      e instanceof AnchorError ? e.error.errorCode.code : e?.error?.errorCode?.code ?? String(e);
    assert.include(got, code, `expected ${code}, got ${got}`);
    return;
  }
  assert.fail(`expected error ${code}, but transaction succeeded`);
}

type Stage = "created" | "funded" | "accepted" | "submitted";

interface Ctx {
  client: Keypair;
  freelancer: Keypair;
  jobId: BN;
  job: PublicKey;
}

/** Create a job and push it to the requested stage. */
async function setupJob(
  stage: Stage,
  opts: { deadlineSecs?: number; windowSecs?: number } = {}
): Promise<Ctx> {
  const client = await fundedWallet();
  const freelancer = await fundedWallet(1);
  const jobId = new BN(nextJobId++);
  const job = jobPda(client.publicKey, jobId);

  await program.methods
    .createJob(
      jobId,
      freelancer.publicKey,
      AMOUNT,
      SPEC_HASH,
      new BN(now() + (opts.deadlineSecs ?? 3600)),
      new BN(opts.windowSecs ?? WINDOW_SECS)
    )
    .accountsPartial({ client: client.publicKey, job })
    .signers([client])
    .rpc();
  if (stage === "created") return { client, freelancer, jobId, job };

  await program.methods
    .fundJob()
    .accountsPartial({ client: client.publicKey, job })
    .signers([client])
    .rpc();
  if (stage === "funded") return { client, freelancer, jobId, job };

  await program.methods
    .acceptJob()
    .accountsPartial({ freelancer: freelancer.publicKey, job })
    .signers([freelancer])
    .rpc();
  if (stage === "accepted") return { client, freelancer, jobId, job };

  await program.methods
    .submitWork("http://localhost:4000/api/deliverables/test", DELIVERABLE_HASH)
    .accountsPartial({ freelancer: freelancer.publicKey, job })
    .signers([freelancer])
    .rpc();
  return { client, freelancer, jobId, job };
}

function propose(c: Ctx, verdict: number, score: number, signer: Keypair = arbiter) {
  return program.methods
    .proposeVerdict(verdict, score, "http://localhost:4000/api/reports/test")
    .accountsPartial({ arbiter: signer.publicKey, job: c.job })
    .signers([signer])
    .rpc();
}

function finalize(c: Ctx) {
  return program.methods
    .finalize()
    .accountsPartial({ job: c.job, client: c.client.publicKey, freelancer: c.freelancer.publicKey })
    .rpc();
}

const statusOf = async (job: PublicKey) =>
  Object.keys((await program.account.job.fetch(job)).status)[0];
const balance = (pk: PublicKey) => conn.getBalance(pk, "processed");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("escrow", () => {
  describe("create_job + fund_job", () => {
    it("creates and funds a job; arbiter/admin come from constants", async () => {
      const c = await setupJob("funded");
      const job = await program.account.job.fetch(c.job);
      assert.equal(Object.keys(job.status)[0], "funded");
      assert.ok(job.client.equals(c.client.publicKey));
      assert.ok(job.freelancer.equals(c.freelancer.publicKey));
      assert.ok(job.arbiter.equals(arbiter.publicKey), "ARBITER constant != keys/arbiter.json");
      assert.ok(job.admin.equals(admin.publicKey), "ADMIN constant != keys/admin.json");
      assert.ok(job.amount.eq(AMOUNT));

      const rent = await conn.getMinimumBalanceForRentExemption(
        (await conn.getAccountInfo(c.job))!.data.length
      );
      assert.equal(await balance(c.job), rent + AMOUNT.toNumber());
    });

    it("create + fund work in one transaction (one wallet signature)", async () => {
      const client = await fundedWallet();
      const freelancer = Keypair.generate();
      const jobId = new BN(nextJobId++);
      const job = jobPda(client.publicKey, jobId);
      const tx = new Transaction().add(
        await program.methods
          .createJob(jobId, freelancer.publicKey, AMOUNT, SPEC_HASH, new BN(now() + 3600), new BN(WINDOW_SECS))
          .accountsPartial({ client: client.publicKey, job })
          .instruction(),
        await program.methods
          .fundJob()
          .accountsPartial({ client: client.publicKey, job })
          .instruction()
      );
      await provider.sendAndConfirm(tx, [client]);
      assert.equal(await statusOf(job), "funded");
    });

    it("rejects funding twice", async () => {
      const c = await setupJob("funded");
      await expectError(
        program.methods.fundJob().accountsPartial({ client: c.client.publicKey, job: c.job }).signers([c.client]).rpc(),
        "InvalidStatus"
      );
    });

    it("rejects funding by someone other than the client", async () => {
      const c = await setupJob("created");
      const stranger = await fundedWallet();
      await expectError(
        program.methods.fundJob().accountsPartial({ client: stranger.publicKey, job: c.job }).signers([stranger]).rpc(),
        "Unauthorized"
      );
    });

    it("rejects amount below minimum", async () => {
      const client = await fundedWallet();
      const jobId = new BN(nextJobId++);
      await expectError(
        program.methods
          .createJob(jobId, Keypair.generate().publicKey, new BN(0), SPEC_HASH, new BN(now() + 3600), new BN(WINDOW_SECS))
          .accountsPartial({ client: client.publicKey, job: jobPda(client.publicKey, jobId) })
          .signers([client])
          .rpc(),
        "InvalidAmount"
      );
    });

    it("rejects client == freelancer", async () => {
      const client = await fundedWallet();
      const jobId = new BN(nextJobId++);
      await expectError(
        program.methods
          .createJob(jobId, client.publicKey, AMOUNT, SPEC_HASH, new BN(now() + 3600), new BN(WINDOW_SECS))
          .accountsPartial({ client: client.publicKey, job: jobPda(client.publicKey, jobId) })
          .signers([client])
          .rpc(),
        "InvalidFreelancer"
      );
    });
  });

  describe("accept_job + submit_work", () => {
    it("rejects accept by the wrong freelancer", async () => {
      const c = await setupJob("funded");
      const stranger = await fundedWallet(1);
      await expectError(
        program.methods.acceptJob().accountsPartial({ freelancer: stranger.publicKey, job: c.job }).signers([stranger]).rpc(),
        "Unauthorized"
      );
    });

    it("rejects submit before accept", async () => {
      const c = await setupJob("funded");
      await expectError(
        program.methods
          .submitWork("http://x", DELIVERABLE_HASH)
          .accountsPartial({ freelancer: c.freelancer.publicKey, job: c.job })
          .signers([c.freelancer])
          .rpc(),
        "InvalidStatus"
      );
    });

    it("rejects a URI longer than 200 bytes", async () => {
      const c = await setupJob("accepted");
      await expectError(
        program.methods
          .submitWork("https://x.com/" + "a".repeat(200), DELIVERABLE_HASH)
          .accountsPartial({ freelancer: c.freelancer.publicKey, job: c.job })
          .signers([c.freelancer])
          .rpc(),
        "UriTooLong"
      );
    });

    it("stores the deliverable hash on submit", async () => {
      const c = await setupJob("submitted");
      const job = await program.account.job.fetch(c.job);
      assert.equal(Object.keys(job.status)[0], "submitted");
      assert.deepEqual(job.deliverableHash, DELIVERABLE_HASH);
    });
  });

  describe("propose_verdict", () => {
    it("rejects a verdict from anyone but the arbiter", async () => {
      const c = await setupJob("submitted");
      await expectError(propose(c, PASS, 90, c.client), "Unauthorized");
    });

    it("rejects an invalid verdict code", async () => {
      const c = await setupJob("submitted");
      await expectError(propose(c, 7, 90), "InvalidVerdict");
    });

    it("inconclusive goes straight to Disputed", async () => {
      const c = await setupJob("submitted");
      await propose(c, INCONCLUSIVE, 40);
      assert.equal(await statusOf(c.job), "disputed");
    });
  });

  describe("finalize", () => {
    it("pass: blocked during window, then pays the freelancer", async () => {
      const c = await setupJob("submitted");
      await propose(c, PASS, 88);
      await expectError(finalize(c), "WindowOpen");

      await sleep(WINDOW_SECS + 2);
      const before = await balance(c.freelancer.publicKey);
      await finalize(c);
      assert.equal(await balance(c.freelancer.publicKey), before + AMOUNT.toNumber());
      assert.equal(await statusOf(c.job), "released");
    });

    it("fail: refunds the client after the window", async () => {
      const c = await setupJob("submitted");
      await propose(c, FAIL, 30);
      await sleep(WINDOW_SECS + 2);
      const before = await balance(c.client.publicKey);
      await finalize(c);
      assert.equal(await balance(c.client.publicKey), before + AMOUNT.toNumber());
      assert.equal(await statusOf(c.job), "refunded");
    });

    it("cannot redirect payout to a different wallet", async () => {
      const c = await setupJob("submitted");
      await propose(c, PASS, 88);
      await sleep(WINDOW_SECS + 2);
      const attacker = Keypair.generate();
      await expectError(
        program.methods
          .finalize()
          .accountsPartial({ job: c.job, client: c.client.publicKey, freelancer: attacker.publicKey })
          .rpc(),
        "Unauthorized"
      );
    });
  });

  describe("approve", () => {
    it("client can release early", async () => {
      const c = await setupJob("submitted");
      await propose(c, PASS, 95);
      const before = await balance(c.freelancer.publicKey);
      await program.methods
        .approve()
        .accountsPartial({ client: c.client.publicKey, job: c.job, freelancer: c.freelancer.publicKey })
        .signers([c.client])
        .rpc();
      assert.equal(await balance(c.freelancer.publicKey), before + AMOUNT.toNumber());
      assert.equal(await statusOf(c.job), "released");
    });

    it("arbiter cannot approve (no path to move funds)", async () => {
      const c = await setupJob("submitted");
      await propose(c, PASS, 95);
      await expectError(
        program.methods
          .approve()
          .accountsPartial({ client: arbiter.publicKey, job: c.job, freelancer: c.freelancer.publicKey })
          .signers([arbiter])
          .rpc(),
        "Unauthorized"
      );
    });
  });

  describe("dispute + resolve_dispute", () => {
    it("a stranger cannot dispute", async () => {
      const c = await setupJob("submitted");
      await propose(c, FAIL, 20);
      const stranger = await fundedWallet(1);
      await expectError(
        program.methods.dispute().accountsPartial({ signer: stranger.publicKey, job: c.job }).signers([stranger]).rpc(),
        "Unauthorized"
      );
    });

    it("cannot dispute after the window closes", async () => {
      const c = await setupJob("submitted");
      await propose(c, FAIL, 20);
      await sleep(WINDOW_SECS + 2);
      await expectError(
        program.methods
          .dispute()
          .accountsPartial({ signer: c.freelancer.publicKey, job: c.job })
          .signers([c.freelancer])
          .rpc(),
        "WindowClosed"
      );
    });

    it("freelancer disputes a fail; only admin can resolve; admin releases", async () => {
      const c = await setupJob("submitted");
      await propose(c, FAIL, 20);
      await program.methods
        .dispute()
        .accountsPartial({ signer: c.freelancer.publicKey, job: c.job })
        .signers([c.freelancer])
        .rpc();
      const job = await program.account.job.fetch(c.job);
      assert.equal(Object.keys(job.status)[0], "disputed");
      assert.ok(job.disputedBy.equals(c.freelancer.publicKey));

      // finalize is not possible once disputed
      await expectError(finalize(c), "InvalidStatus");

      // arbiter is not admin
      await expectError(
        program.methods
          .resolveDispute(true)
          .accountsPartial({ admin: arbiter.publicKey, job: c.job, client: c.client.publicKey, freelancer: c.freelancer.publicKey })
          .signers([arbiter])
          .rpc(),
        "Unauthorized"
      );

      const before = await balance(c.freelancer.publicKey);
      await program.methods
        .resolveDispute(true)
        .accountsPartial({ admin: admin.publicKey, job: c.job, client: c.client.publicKey, freelancer: c.freelancer.publicKey })
        .signers([admin])
        .rpc();
      assert.equal(await balance(c.freelancer.publicKey), before + AMOUNT.toNumber());
      assert.equal(await statusOf(c.job), "released");
    });

    it("admin can refund an inconclusive job", async () => {
      const c = await setupJob("submitted");
      await propose(c, INCONCLUSIVE, 50);
      const before = await balance(c.client.publicKey);
      await program.methods
        .resolveDispute(false)
        .accountsPartial({ admin: admin.publicKey, job: c.job, client: c.client.publicKey, freelancer: c.freelancer.publicKey })
        .signers([admin])
        .rpc();
      assert.equal(await balance(c.client.publicKey), before + AMOUNT.toNumber());
      assert.equal(await statusOf(c.job), "refunded");
    });
  });

  describe("no-verdict timeout (stuck funds escape hatch)", () => {
    it("cannot escalate a Submitted job before the timeout", async () => {
      const c = await setupJob("submitted");
      await expectError(
        program.methods
          .dispute()
          .accountsPartial({ signer: c.freelancer.publicKey, job: c.job })
          .signers([c.freelancer])
          .rpc(),
        "ReviewNotTimedOut"
      );
    });

    it("after the timeout, freelancer escalates; arbiter can no longer post; admin settles", async () => {
      const c = await setupJob("submitted");
      await sleep(WINDOW_SECS + 2);
      await program.methods
        .dispute()
        .accountsPartial({ signer: c.freelancer.publicKey, job: c.job })
        .signers([c.freelancer])
        .rpc();
      assert.equal(await statusOf(c.job), "disputed");

      // a late verdict from the backend is rejected
      await expectError(propose(c, PASS, 90), "InvalidStatus");

      const before = await balance(c.freelancer.publicKey);
      await program.methods
        .resolveDispute(true)
        .accountsPartial({ admin: admin.publicKey, job: c.job, client: c.client.publicKey, freelancer: c.freelancer.publicKey })
        .signers([admin])
        .rpc();
      assert.equal(await balance(c.freelancer.publicKey), before + AMOUNT.toNumber());
    });
  });

  describe("Pollar path: create_job_for + confirm_funding", () => {
    async function createFor(clientPk: PublicKey, freelancerPk: PublicKey) {
      const relayer = await fundedWallet(1);
      const jobId = new BN(nextJobId++);
      const job = jobPda(clientPk, jobId);
      await program.methods
        .createJobFor(jobId, clientPk, freelancerPk, AMOUNT, SPEC_HASH, new BN(now() + 3600), new BN(WINDOW_SECS))
        .accountsPartial({ payer: relayer.publicKey, job })
        .signers([relayer])
        .rpc();
      return job;
    }
    const confirm = (job: PublicKey) =>
      program.methods.confirmFunding().accountsPartial({ job }).rpc();

    it("relayer creates a job for a client who never signs", async () => {
      const client = Keypair.generate(); // e.g. a Pollar social-login wallet
      const freelancer = Keypair.generate();
      const job = await createFor(client.publicKey, freelancer.publicKey);
      const acc = await program.account.job.fetch(job);
      assert.ok(acc.client.equals(client.publicKey));
      assert.equal(Object.keys(acc.status)[0], "created");
    });

    it("confirm_funding fails until the PDA holds the amount", async () => {
      const job = await createFor(Keypair.generate().publicKey, Keypair.generate().publicKey);
      await expectError(confirm(job), "NotFunded");
    });

    it("plain transfer to the PDA (what Pollar sendPayment does) + confirm_funding -> Funded", async () => {
      const client = await fundedWallet(2);
      const freelancer = await fundedWallet(1);
      const job = await createFor(client.publicKey, freelancer.publicKey);

      // Simulates Pollar: a plain SystemProgram transfer, no escrow instruction.
      await provider.sendAndConfirm(
        new Transaction().add(
          SystemProgram.transfer({ fromPubkey: client.publicKey, toPubkey: job, lamports: AMOUNT.toNumber() })
        ),
        [client]
      );
      await confirm(job);
      assert.equal(await statusOf(job), "funded");
      await expectError(confirm(job), "InvalidStatus");

      // The rest of the escrow flow is unchanged.
      const c = { client, freelancer, jobId: new BN(0), job };
      await program.methods.acceptJob().accountsPartial({ freelancer: freelancer.publicKey, job }).signers([freelancer]).rpc();
      await program.methods
        .submitWork("http://localhost:4000/api/deliverables/test", DELIVERABLE_HASH)
        .accountsPartial({ freelancer: freelancer.publicKey, job })
        .signers([freelancer])
        .rpc();
      await propose(c, PASS, 90);
      await sleep(WINDOW_SECS + 2);
      const before = await balance(freelancer.publicKey);
      await finalize(c);
      assert.equal(await balance(freelancer.publicKey), before + AMOUNT.toNumber());
    });
  });
  
  describe("cancel_job", () => {
    it("client can cancel a funded job before acceptance and gets refunded", async () => {
      const c = await setupJob("funded");
      const before = await balance(c.client.publicKey);
      await program.methods
        .cancelJob()
        .accountsPartial({ client: c.client.publicKey, job: c.job })
        .signers([c.client])
        .rpc();
      // provider wallet pays tx fees, so the client gets exactly `amount` back
      assert.equal(await balance(c.client.publicKey), before + AMOUNT.toNumber());
      assert.equal(await statusOf(c.job), "cancelled");
    });

    it("cannot cancel an accepted job before the deadline", async () => {
      const c = await setupJob("accepted");
      await expectError(
        program.methods.cancelJob().accountsPartial({ client: c.client.publicKey, job: c.job }).signers([c.client]).rpc(),
        "DeadlineNotPassed"
      );
    });

    it("can cancel an accepted job after the deadline with no submission", async () => {
      const c = await setupJob("accepted", { deadlineSecs: 5 });
      await sleep(7);
      await program.methods
        .cancelJob()
        .accountsPartial({ client: c.client.publicKey, job: c.job })
        .signers([c.client])
        .rpc();
      assert.equal(await statusOf(c.job), "cancelled");
    });
  });
});
