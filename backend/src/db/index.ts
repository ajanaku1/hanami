import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(here, "schema.sql");
const DB_PATH = process.env.HANAMI_DB ?? join(here, "..", "..", "hanami.db");

export const db = new Database(DB_PATH);
db.exec(readFileSync(SCHEMA_PATH, "utf8"));

// idempotent column adds for older DBs
const cols = db.prepare("PRAGMA table_info(campaigns)").all() as Array<{ name: string }>;
const has = (name: string) => cols.some((c) => c.name === name);
if (!has("visibility")) db.exec("ALTER TABLE campaigns ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");
