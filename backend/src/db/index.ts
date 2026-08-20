import { createClient, type Client, type InValue, type Row } from "@libsql/client";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// libSQL (Turso) client. The DB lives off-disk so it survives Render free-tier spin-downs,
// which wipe the container filesystem. Falls back to a local file for dev when TURSO_* is unset.
const url = process.env.TURSO_DATABASE_URL ?? "file:hanami.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient(authToken ? { url, authToken } : { url });

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(here, "schema.sql");

/// Runs the schema and idempotent column migrations. Call once before serving.
async function migrateCampaigns(client: Client): Promise<void> {
  const cols = await client.execute("PRAGMA table_info(campaigns)");
  const has = (name: string) => cols.rows.some((c) => c.name === name);
  if (!has("visibility")) {
    await client.execute("ALTER TABLE campaigns ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");
  }
  if (!has("image_uri")) {
    await client.execute("ALTER TABLE campaigns ADD COLUMN image_uri TEXT");
  }
  if (!has("rep_score")) {
    await client.execute("ALTER TABLE campaigns ADD COLUMN rep_score INTEGER NOT NULL DEFAULT 0");
  }
  if (!has("publication_policy")) {
    await client.execute(
      "ALTER TABLE campaigns ADD COLUMN publication_policy TEXT NOT NULL DEFAULT 'certification-required'",
    );
    await client.execute(
      "UPDATE campaigns SET publication_policy = 'legacy-public' WHERE visibility = 'public'",
    );
  }
}

async function migrateApplicants(client: Client): Promise<void> {
  const appCols = await client.execute("PRAGMA table_info(applicants)");
  const hasApp = (name: string) => appCols.rows.some((c) => c.name === name);
  if (!hasApp("transcript_uri")) {
    await client.execute("ALTER TABLE applicants ADD COLUMN transcript_uri TEXT");
  }
  if (!hasApp("attestation_json")) {
    await client.execute("ALTER TABLE applicants ADD COLUMN attestation_json TEXT");
  }
}

export async function applyMigrations(client: Client): Promise<void> {
  await client.executeMultiple(readFileSync(SCHEMA_PATH, "utf8"));
  await migrateCampaigns(client);
  await migrateApplicants(client);
}

export async function initDb(): Promise<void> {
  await applyMigrations(db);
}

/// libSQL Row objects don't JSON-serialize cleanly, so we flatten each row into a plain
/// object keyed by column name before it leaves the data layer.
function toPlain(res: { columns: string[]; rows: Row[] }): Record<string, unknown>[] {
  return res.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (const col of res.columns) obj[col] = row[col as keyof Row];
    return obj;
  });
}

/// Thin query helpers so route code reads close to the old better-sqlite3 calls.
/// `get` → first row or undefined, `all` → all rows, `run` → execute (insert/update/delete).
export async function get<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T | undefined> {
  const res = await db.execute({ sql, args });
  return toPlain(res)[0] as T | undefined;
}

export async function all<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T[]> {
  const res = await db.execute({ sql, args });
  return toPlain(res) as T[];
}

export async function run(sql: string, args: InValue[] = []) {
  return db.execute({ sql, args });
}
