// Regenerate bouncer portraits and store them durably.
//
// The original z-image portraits were uploaded to 0G Storage with finalityRequired:false and the
// holding node dropped them before replication; the only other copy lived in Render's ephemeral disk
// cache, which is wiped on restart. This script regenerates each named bouncer's portrait from its
// (still-retrievable) persona, uploads the new PNG to 0G Storage, stores a durable base64 copy in the
// `portraits` table (Turso), and points the campaign's image_uri at the new root.
//
// CAVEATS:
//   - Spends 0G Compute Router credits (one visual-brief chat + one z-image call per bouncer).
//   - Mutates the prod index: rewrites campaigns.image_uri for each slug.
//   - The new rootHash will NOT equal the iNFT's on-chain imageURI (set at mint, immutable, now dead).
//     Display reads the DB image_uri, so the UI shows the regenerated face; the on-chain pointer stays
//     historical. BouncerRegistry has no setImageURI, so the on-chain value can't be updated in v1.
//
// Usage:  npx tsx scripts/regenerate-portraits.ts kenji bad-frogs sakura-society-v2 [--confirm]
//         (no --confirm = dry run: fetches persona, reports, spends nothing)

import "dotenv/config";
import { get, run, initDb } from "../src/db/index.js";
import { readByRoot, uploadBlob } from "../src/og-storage.js";
import { generatePortrait } from "../src/og-image.js";

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const slugs = args.filter((a) => !a.startsWith("--"));

if (slugs.length === 0) {
  console.error("Pass at least one campaign slug. e.g. kenji bad-frogs sakura-society-v2 [--confirm]");
  process.exit(1);
}

await initDb();
console.log(`${confirm ? "LIVE" : "DRY RUN"} — ${slugs.length} slug(s): ${slugs.join(", ")}\n`);

for (const slug of slugs) {
  const row = await get<{ persona_uri: string; image_uri: string | null }>(
    "SELECT persona_uri, image_uri FROM campaigns WHERE slug = ?", [slug]);
  if (!row) { console.log(`✗ ${slug}: not found, skipping`); continue; }

  const personaRoot = row.persona_uri.replace("0g://", "");
  const persona = (await readByRoot(personaRoot)).toString("utf8");
  console.log(`• ${slug}: persona ${persona.length} chars; current image_uri ${row.image_uri ?? "(none)"}`);

  if (!confirm) { console.log("  dry run — pass --confirm to generate, upload, and persist\n"); continue; }

  const png = await generatePortrait(persona);
  const up = await uploadBlob(png);
  await run("INSERT OR REPLACE INTO portraits (root, png_b64, created_at) VALUES (?, ?, ?)",
    [up.rootHash, png.toString("base64"), Math.floor(Date.now() / 1000)]);
  await run("UPDATE campaigns SET image_uri = ? WHERE slug = ?", [`0g://${up.rootHash}`, slug]);
  console.log(`  ✓ new portrait ${png.length} bytes → root ${up.rootHash} (durable in Turso, image_uri updated)\n`);
}

console.log("done.");
