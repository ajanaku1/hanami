// Rebuild a campaign's index row from on-chain state. Used when the index DB was lost
// (Render free-tier wiped the ephemeral disk) but the iNFTs + Campaign contracts are still
// permanent on 0G mainnet. Reads ownerOf / bouncerOf / factory events, recovers the tx
// hashes from event logs, and POSTs to /api/campaigns/index. No re-mint, no gas spent.

import "dotenv/config";
import { createPublicClient, http, defineChain, parseAbi, type Address, type Hex } from "viem";

const zeroG = defineChain({
  id: 16661,
  name: "0G",
  nativeCurrency: { name: "0G", symbol: "OG", decimals: 18 },
  rpcUrls: { default: { http: [process.env.OG_RPC_URL ?? "https://evmrpc.0g.ai"] } },
});
const client = createPublicClient({ chain: zeroG, transport: http() });

const REGISTRY = process.env.BOUNCER_REGISTRY_ADDRESS as Address;
const FACTORY = process.env.CAMPAIGN_FACTORY_ADDRESS as Address;
const BACKEND = process.env.SEED_BACKEND_URL ?? "http://localhost:8787";

const registryAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function bouncerOf(uint256 tokenId) view returns ((string encryptedPersonaURI, string lorebookURI, string imageURI, bytes32 oracleConditions, uint256 repScore))",
  "event BouncerMinted(uint256 indexed tokenId, address indexed owner, string personaURI, string imageURI)",
  "event UsageAuthorized(uint256 indexed tokenId, address indexed executor)",
]);
const factoryAbi = parseAbi([
  "event CampaignCreated(address indexed campaign, address indexed owner, uint256 indexed bouncerTokenId, uint256 wlSizeCap)",
]);
const campaignAbi = parseAbi(["function wlSizeCap() view returns (uint256)"]);

type Meta = { tokenId: bigint; slug: string; name: string; targetChain: string; visibility: "public" | "private" };

async function firstLog(address: Address, abi: readonly unknown[], eventName: string, args: Record<string, unknown>) {
  const logs = await client.getLogs({ address, event: (abi as any).find((e: any) => e.name === eventName), args, fromBlock: 0n, toBlock: "latest" });
  const log = logs[0];
  if (!log) throw new Error(`no ${eventName} log found`);
  return log;
}

async function reindex(m: Meta) {
  console.log(`\nreindexing "${m.name}" — token #${m.tokenId}`);

  const owner = await client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "ownerOf", args: [m.tokenId] });
  const bouncer = await client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "bouncerOf", args: [m.tokenId] });
  console.log("  owner:", owner);
  console.log("  personaURI:", bouncer.encryptedPersonaURI);

  const mintLog = await firstLog(REGISTRY, registryAbi, "BouncerMinted", { tokenId: m.tokenId });
  const authLog = await firstLog(REGISTRY, registryAbi, "UsageAuthorized", { tokenId: m.tokenId });
  const campLog = await firstLog(FACTORY, factoryAbi, "CampaignCreated", { bouncerTokenId: m.tokenId });
  const campaignAddress = (campLog as any).args.campaign as Address;
  const wlSizeCap = await client.readContract({ address: campaignAddress, abi: campaignAbi, functionName: "wlSizeCap" });
  console.log("  campaign:", campaignAddress, "cap:", wlSizeCap.toString());

  const res = await fetch(`${BACKEND}/api/campaigns/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: m.slug,
      name: m.name,
      targetChain: m.targetChain,
      wlSizeCap: Number(wlSizeCap),
      ownerAddress: owner,
      visibility: m.visibility,
      personaURI: bouncer.encryptedPersonaURI,
      lorebookURI: bouncer.lorebookURI,
      imageURI: bouncer.imageURI,
      bouncerTokenId: m.tokenId.toString(),
      bouncerMintTx: mintLog.transactionHash as Hex,
      authorizeTx: authLog.transactionHash as Hex,
      campaignAddress,
      campaignTx: campLog.transactionHash as Hex,
    }),
  });
  if (!res.ok) throw new Error(`index ${res.status}: ${await res.text()}`);
  console.log(`  ✓ indexed → /c/${m.slug}`);
}

const bouncers: Meta[] = [
  { tokenId: 17n, slug: "sakura-society-v2", name: "Sakura Society", targetChain: "base", visibility: "public" },
  { tokenId: 18n, slug: "bad-frogs", name: "Badfrog wl", targetChain: "base", visibility: "public" },
];

for (const b of bouncers) await reindex(b);
console.log("\ndone.");
