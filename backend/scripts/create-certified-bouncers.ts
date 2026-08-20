import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { buildSafetyAuthorizationMessage } from "../src/safety/auth.js";
import { hashBouncerContent } from "../src/safety/content-hash.js";
import {
  authorizeBackend,
  createCampaign,
  mintBouncer,
  publicClient,
} from "../src/og-chain.js";

const API = "https://hanami-backend-ugak.onrender.com/api";

type Config = {
  slug: string;
  name: string;
  personaFile: string;
  lorebookFile: string;
  wlSizeCap: number;
};

type SafetyRun = {
  id: string;
  status: "running" | "passed" | "failed" | "interrupted";
  reportRoot: string | null;
  completedCount: number;
};

type Prepared = {
  personaURI: string;
  lorebookURI: string;
  imageURI: string;
  personaRoot: string;
  lorebookRoot: string;
  backendAddress: Address;
};

const configs: Config[] = [
  {
    slug: "material-memory",
    name: "Material Memory",
    personaFile: "mizuki.md",
    lorebookFile: "material-memory-lore.md",
    wlSizeCap: 120,
  },
  {
    slug: "slow-collectors-circle",
    name: "Slow Collectors Circle",
    personaFile: "haru.md",
    lorebookFile: "slow-collectors-circle-lore.md",
    wlSizeCap: 150,
  },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text}`);
  return JSON.parse(text) as T;
}

async function waitForSafety(runId: string): Promise<SafetyRun> {
  for (;;) {
    const run = await api<SafetyRun>(`/safety-runs/${runId}`);
    console.log(`  safety ${run.completedCount}/8 · ${run.status}`);
    if (run.status !== "running") return run;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
}

async function certify(config: Config, account: ReturnType<typeof privateKeyToAccount>) {
  const persona = (await readFile(resolve("personas", config.personaFile), "utf8")).trim();
  const lorebook = (await readFile(resolve("personas", config.lorebookFile), "utf8")).trim();
  const contentHash = hashBouncerContent(persona, lorebook);
  const nonce = Date.now();
  const signature = await account.signMessage({
    message: buildSafetyAuthorizationMessage({ scope: "draft", slug: config.slug, contentHash, nonce }),
  });
  const started = await api<SafetyRun>("/safety-runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scope: "draft",
      slug: config.slug,
      persona,
      lorebook,
      caller: account.address,
      nonce,
      signature,
    }),
  });
  const run = await waitForSafety(started.id);
  if (run.status !== "passed" || !run.reportRoot) {
    throw new Error(`${config.name} safety failed at ${run.completedCount}/8 (${run.id})`);
  }
  return { persona, lorebook, run };
}

async function createOnChain(prepared: Prepared, wlSizeCap: number) {
  const mint = await mintBouncer(prepared.personaURI, prepared.lorebookURI, prepared.imageURI);
  console.log(`  minted token #${mint.tokenId} · ${mint.txHash}`);
  const authorizeTx = await authorizeBackend(mint.tokenId, prepared.backendAddress);
  const authorizeReceipt = await publicClient.waitForTransactionReceipt({ hash: authorizeTx });
  if (authorizeReceipt.status !== "success") throw new Error("authorizeUsage reverted");
  console.log(`  backend authorized · ${authorizeTx}`);
  const campaign = await createCampaign(mint.tokenId, BigInt(wlSizeCap));
  console.log(`  campaign deployed · ${campaign.campaign}`);
  return { mint, authorizeTx, campaign };
}

async function indexCampaign(
  config: Config,
  account: ReturnType<typeof privateKeyToAccount>,
  prepared: Prepared,
  safetyRunId: string,
  chainResult: Awaited<ReturnType<typeof createOnChain>>,
): Promise<void> {
  await api<Record<string, unknown>>("/campaigns/index", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      slug: config.slug,
      name: config.name,
      targetChain: "base",
      wlSizeCap: config.wlSizeCap,
      ownerAddress: account.address,
      visibility: "private",
      personaURI: prepared.personaURI,
      lorebookURI: prepared.lorebookURI,
      imageURI: prepared.imageURI,
      bouncerTokenId: chainResult.mint.tokenId.toString(),
      bouncerMintTx: chainResult.mint.txHash,
      authorizeTx: chainResult.authorizeTx,
      campaignAddress: chainResult.campaign.campaign,
      campaignTx: chainResult.campaign.txHash,
      safetyRunId,
    }),
  });
  console.log(`  indexed · /c/${config.slug}`);
}

async function create(config: Config, account: ReturnType<typeof privateKeyToAccount>): Promise<void> {
  console.log(`\n${config.name}`);
  const certified = await certify(config, account);
  const prepared = await api<Prepared>("/campaigns/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      slug: config.slug,
      persona: certified.persona,
      lorebook: certified.lorebook,
      ownerAddress: account.address,
      safetyRunId: certified.run.id,
    }),
  });
  console.log("  prepared certified 0G roots");
  const chainResult = await createOnChain(prepared, config.wlSizeCap);
  await indexCampaign(config, account, prepared, certified.run.id, chainResult);
}

async function main(): Promise<void> {
  if (process.argv[2] !== "--confirm") throw new Error("Pass --confirm to create two mainnet NFTs.");
  const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY is empty");
  const account = privateKeyToAccount(key);
  if (account.address.toLowerCase() !== "0x34b0ba20669f3ec4f1056853780c381e5e35f724") {
    throw new Error(`Expected owner 0x34b0…F724, received ${account.address}`);
  }
  for (const config of configs) await create(config, account);
}

void main();
