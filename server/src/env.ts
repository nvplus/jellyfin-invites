import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });
config(); // also load server/.env if present

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  JELLYFIN_URL: required("JELLYFIN_URL").replace(/\/$/, ""),
  PUBLIC_BASE_URL: (process.env.PUBLIC_BASE_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  SESSION_SECRET: required("SESSION_SECRET"),
  DATABASE_PATH: process.env.DATABASE_PATH ?? "./data/invites.db",
  PORT: Number(process.env.PORT ?? 8787),
};
