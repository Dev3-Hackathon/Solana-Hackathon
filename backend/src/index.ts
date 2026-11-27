import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { env } from "./env";
import { arbiter } from "./solana";
import "./db";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  let aiService: "up" | "down" = "down";
  try {
    const r = await fetch(`${env.AI_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (r.ok) aiService = "up";
  } catch {
    // AI service not running yet: that's fine for now
  }
  res.json({ ok: true, arbiter: arbiter.publicKey.toBase58(), aiService });
});

// 404 + error handler: all errors use { error, code }
app.use((_req, res) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
});

app.listen(env.PORT, () => {
  console.log(`Backend listening on http://localhost:${env.PORT}`);
  console.log(`Arbiter pubkey: ${arbiter.publicKey.toBase58()}`);
});