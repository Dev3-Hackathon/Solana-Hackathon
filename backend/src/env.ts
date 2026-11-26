import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  RPC_URL: z.string().url().default("https://api.devnet.solana.com"),
  PROGRAM_ID: z.string().default(""), // filled in once Helya deploys
  ARBITER_KEYPAIR_PATH: z.string().default("./keys/arbiter.json"),
  BACKEND_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  AI_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  GITHUB_TOKEN: z.string().default(""),
  DATABASE_PATH: z.string().default("./data/proofpay.db"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
  process.exit(1);
}

export const env = parsed.data;