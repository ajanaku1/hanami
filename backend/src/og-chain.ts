import "dotenv/config";
import {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
  keccak256,
  encodeAbiParameters,
  parseAbi,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Trace } from "./og-compute.js";

export const galileo = defineChain({
  id: 16602,
  name: "0G-Galileo-Testnet",
  nativeCurrency: { name: "0G", symbol: "OG", decimals: 18 },
  rpcUrls: { default: { http: [process.env.GALILEO_RPC_URL ?? "https://evmrpc-testnet.0g.ai"] } },
  blockExplorers: { default: { name: "Chainscan", url: "https://chainscan-galileo.0g.ai" } },
});

const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);

export const wallet = createWalletClient({ account, chain: galileo, transport: http() });
export const publicClient = createPublicClient({ chain: galileo, transport: http() });

export const BOUNCER_REGISTRY = process.env.BOUNCER_REGISTRY_ADDRESS as Address;
export const CAMPAIGN_FACTORY = process.env.CAMPAIGN_FACTORY_ADDRESS as Address;

const registryAbi = parseAbi([
  "function mintBouncer(string personaURI, string lorebookURI, bytes32 oracleConditions) returns (uint256)",
  "function authorizeUsage(uint256 tokenId, address executor, bytes permissions)",
  "function recordConversation(uint256 tokenId, bytes32 convoHash)",
  "function incrementRep(uint256 tokenId) returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "event BouncerMinted(uint256 indexed tokenId, address indexed owner, string personaURI)",
]);

const factoryAbi = parseAbi([
  "function createCampaign(uint256 bouncerTokenId, uint256 wlSizeCap) returns (address)",
  "event CampaignCreated(address indexed campaign, address indexed owner, uint256 indexed bouncerTokenId, uint256 wlSizeCap)",
]);

const campaignAbi = parseAbi([
  "function recordDecision(address applicant, bool approve, bytes32 reasoningHash, bytes32 attestationHash)",
  "function finalizeMerkleRoot(bytes32 root)",
  "function approvedCount() view returns (uint256)",
  "function rejectedCount() view returns (uint256)",
  "function approvedAt(uint256 index) view returns (address)",
]);

export function attestationHashFromTrace(trace: Trace): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "bool" }],
      [keccak256(`0x${Buffer.from(trace.request_id, "utf8").toString("hex")}` as Hex), trace.provider as Address, trace.tee_verified],
    ),
  );
}

export async function mintBouncer(personaURI: string, lorebookURI: string): Promise<{ txHash: Hex; tokenId: bigint }> {
  const txHash = await wallet.writeContract({
    address: BOUNCER_REGISTRY,
    abi: registryAbi,
    functionName: "mintBouncer",
    args: [personaURI, lorebookURI, "0x0000000000000000000000000000000000000000000000000000000000000000"],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const [minted] = parseEventLogs({ abi: registryAbi, eventName: "BouncerMinted", logs: receipt.logs });
  if (!minted) throw new Error("BouncerMinted event not found in receipt");
  return { txHash, tokenId: minted.args.tokenId };
}

export async function authorizeBackend(tokenId: bigint, backendAddress: Address): Promise<Hex> {
  return wallet.writeContract({
    address: BOUNCER_REGISTRY,
    abi: registryAbi,
    functionName: "authorizeUsage",
    args: [tokenId, backendAddress, "0x"],
  });
}

export async function createCampaign(bouncerTokenId: bigint, wlSizeCap: bigint): Promise<{ txHash: Hex; campaign: Address }> {
  const txHash = await wallet.writeContract({
    address: CAMPAIGN_FACTORY,
    abi: factoryAbi,
    functionName: "createCampaign",
    args: [bouncerTokenId, wlSizeCap],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const [created] = parseEventLogs({ abi: factoryAbi, eventName: "CampaignCreated", logs: receipt.logs });
  if (!created) throw new Error("CampaignCreated event not found");
  return { txHash, campaign: created.args.campaign };
}

export type RecordedDecision = { txHash: Hex; attestationHash: Hex; reasoningHash: Hex };

export async function recordDecision(
  campaign: Address,
  applicant: Address,
  approve: boolean,
  reasoning: string,
  trace: Trace,
): Promise<RecordedDecision> {
  const reasoningHash = keccak256(`0x${Buffer.from(reasoning, "utf8").toString("hex")}` as Hex);
  const attestationHash = attestationHashFromTrace(trace);
  const txHash = await wallet.writeContract({
    address: campaign,
    abi: campaignAbi,
    functionName: "recordDecision",
    args: [applicant, approve, reasoningHash, attestationHash],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, attestationHash, reasoningHash };
}
