import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });
config(); // also load server/.env if present

export const env = {
  DATABASE_PATH: process.env.DATABASE_PATH ?? "./data/invites.db",
  PORT: Number(process.env.PORT ?? 8787),
};
