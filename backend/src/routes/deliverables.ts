import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { env } from "../env";
import { fetchDeliverable } from "../fetcher";
import { sha256Hex } from "../hash";
import { HttpError, parseBody, requirePubkey } from "../http";

export const deliverablesRouter = Router();

const snapshotSchema = z.object({
  jobPda: z.string().min(1).max(100),
  url: z.string().trim().min(1).max(2000),
});

// 3.4  POST /api/deliverables/snapshot
// Fetches the URL, stores the exact bytes and returns their SHA-256.
// The freelancer then puts deliverableUri + deliverableHash on-chain in submit_work.
deliverablesRouter.post("/deliverables/snapshot", async (req, res) => {
  const body = parseBody(snapshotSchema, req.body);
  const jobPda = requirePubkey(body.jobPda);

  const fetched = await fetchDeliverable(body.url);
  const deliverableHash = sha256Hex(fetched.content);
  const id = randomUUID();

  db.prepare(
    `INSERT INTO snapshots (id, job_pda, source_url, content, sha256, content_type)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, jobPda, body.url, fetched.content, deliverableHash, fetched.contentType);

  res.status(201).json({
    deliverableUri: `${env.BACKEND_PUBLIC_URL}/api/deliverables/${id}`,
    deliverableHash,
    bytes: fetched.content.length,
    files: fetched.files, // only present for GitHub repos
  });
});

// 3.5  GET /api/deliverables/:id  -> the raw snapshot, byte for byte
deliverablesRouter.get("/deliverables/:id", (req, res) => {
  const row = db
    .prepare(`SELECT content, content_type FROM snapshots WHERE id = ?`)
    .get(req.params.id) as { content: Buffer; content_type: string } | undefined;

  if (!row) throw new HttpError(404, "SNAPSHOT_NOT_FOUND", "No snapshot with that id");

  // Always text/plain + nosniff so a stored HTML page is shown as text and never rendered.
  res
    .set({
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Snapshot-Content-Type": row.content_type,
    })
    .send(row.content);
});