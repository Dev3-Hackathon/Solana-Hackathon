import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { env } from "./env";
import { arbiter } from "./solana";
import "./db";
import { HttpError } from "./http";
import { specsRouter } from "./routes/specs";
import { reportsRouter } from "./routes/reports";

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

app.use("/api", specsRouter);
app.use("/api", specsRouter);
app.use("/api", reportsRouter);

// 404 + error handler: all errors use { error, code }
app.use((_req, res) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const type = (err as { type?: string } | null)?.type;
  if (type === "entity.parse.failed") {
    res.status(400).json({ error: "Request body is not valid JSON", code: "INVALID_JSON" });
    return;
  }
  if (type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large", code: "PAYLOAD_TOO_LARGE" });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
});

app.listen(env.PORT, () => {
  console.log(`Backend listening on http://localhost:${env.PORT}`);
  console.log(`Arbiter pubkey: ${arbiter.publicKey.toBase58()}`);
});