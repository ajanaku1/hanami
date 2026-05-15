// Seed a demo bouncer onto the live deployment. Signs all three txs with the deployer key
// (which is also the backend executor), then registers the campaign with the live Render
// backend via /api/campaigns/index. Used for the canonical demo bouncers like Mei-chan
// that the landing page links to. Real users still go through the user-signed mint flow.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { uploadText } from "../src/og-storage.js";
import { generatePortrait } from "../src/og-image.js";
import { uploadBlob } from "../src/og-storage.js";
import { mintBouncer, authorizeBackend, createCampaign } from "../src/og-chain.js";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const BACKEND = process.env.SEED_BACKEND_URL ?? "https://hanami-backend-ugak.onrender.com";

type SeedArgs = {
  slug: string;
  name: string;
  personaFile: string;
  lorebookFile: string;
  targetChain: "ethereum" | "base" | "arbitrum" | "op" | "0g";
  wlSizeCap: number;
  visibility: "public" | "private";
};

async function seed(a: SeedArgs) {
  const owner = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex).address;
  console.log(`seeding "${a.name}" (slug: ${a.slug}) — owner ${owner}`);

  const persona = (await readFile(resolve(a.personaFile), "utf8")).trim();
  const lorebook = (await readFile(resolve(a.lorebookFile), "utf8")).trim();

  console.log("1. uploading persona + lorebook to 0G Storage...");
  const personaUp = await uploadText(persona);
  const loreUp = await uploadText(lorebook);
  console.log("   persona:", personaUp.rootHash);
  console.log("   lorebook:", loreUp.rootHash);

  console.log("2. generating + uploading portrait...");
  let imageURI = "";
  let portraitBytes: Buffer | null = null;
  try {
    portraitBytes = await generatePortrait(persona);
    const imgUp = await uploadBlob(portraitBytes);
    imageURI = `0g://${imgUp.rootHash}`;
    console.log("   portrait:", imgUp.rootHash);

    // Mirror PNG bytes to the deployed backend's cache so the frontend can render immediately,
    // even before 0G Storage finalization makes the file fetchable via the indexer.
    if (process.env.SEED_ADMIN_SECRET) {
      const cacheRes = await fetch(`${BACKEND}/admin/cache-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": process.env.SEED_ADMIN_SECRET },
        body: JSON.stringify({ rootHash: imgUp.rootHash, b64: portraitBytes.toString("base64") }),
      });
      if (cacheRes.ok) console.log("   portrait mirrored to backend cache");
      else console.warn("   portrait cache push failed:", cacheRes.status, await cacheRes.text());
    } else {
      console.warn("   SEED_ADMIN_SECRET not set — frontend may show broken image until 0G finalizes");
    }
  } catch (e) {
    console.warn("   portrait gen failed, continuing without:", (e as Error).message);
  }

  console.log("3. mintBouncer (deployer signs)...");
  const mint = await mintBouncer(`0g://${personaUp.rootHash}`, `0g://${loreUp.rootHash}`, imageURI);
  console.log("   tokenId:", mint.tokenId.toString(), "tx:", mint.txHash);

  console.log("4. authorizeUsage(deployer)...");
  const authTx = await authorizeBackend(mint.tokenId, owner);
  console.log("   tx:", authTx);

  console.log("5. createCampaign...");
  const camp = await createCampaign(mint.tokenId, BigInt(a.wlSizeCap));
  console.log("   campaign:", camp.campaign, "tx:", camp.txHash);

  console.log("6. POST /api/campaigns/index to live backend...");
  const res = await fetch(`${BACKEND}/api/campaigns/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: a.slug,
      name: a.name,
      targetChain: a.targetChain,
      wlSizeCap: a.wlSizeCap,
      ownerAddress: owner,
      visibility: a.visibility,
      personaURI: `0g://${personaUp.rootHash}`,
      lorebookURI: `0g://${loreUp.rootHash}`,
      imageURI,
      bouncerTokenId: mint.tokenId.toString(),
      bouncerMintTx: mint.txHash,
      authorizeTx: authTx,
      campaignAddress: camp.campaign,
      campaignTx: camp.txHash,
    }),
  });
  if (!res.ok) throw new Error(`index ${res.status}: ${await res.text()}`);
  console.log("   indexed:", await res.json());
  console.log(`\n✓ ${a.name} live at ${BACKEND.replace(/\/api.*$/, "")} → /c/${a.slug}`);
}

const which = process.argv[2] ?? "mei";
const seeds: Record<string, SeedArgs> = {
  mei: {
    slug: "sakura-society",
    name: "Sakura Society",
    personaFile: "personas/mei-chan.md",
    lorebookFile: "personas/sakura-society-lore.md",
    targetChain: "base",
    wlSizeCap: 200,
    visibility: "public",
  },
  kenji: {
    slug: "degen-detector",
    name: "Degen Detector",
    personaFile: "personas/kenji.md",
    lorebookFile: "personas/kenji-lore.md",
    targetChain: "base",
    wlSizeCap: 300,
    visibility: "public",
  },
};

const args = seeds[which];
if (!args) {
  console.error(`unknown seed "${which}". Available: ${Object.keys(seeds).join(", ")}`);
  process.exit(1);
}
await seed(args);
