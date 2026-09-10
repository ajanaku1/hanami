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
import type { Trace, Attestation } from "./og-compute.js";
import {
  createCampaignV2,
  decisionPathFor,
  readLiveTicketId,
  readTicketAddress,
  readTicketStatuses,
  recordDecisionV2,
  type ChainClients,
  type ChainTicketStatus,
} from "./tickets/chain-v2.js";

export const zeroG = defineChain({
  id: 16661,
  name: "0G",
  nativeCurrency: { name: "0G", symbol: "OG", decimals: 18 },
  rpcUrls: { default: { http: [process.env.OG_RPC_URL ?? "https://evmrpc.0g.ai"] } },
  blockExplorers: { default: { name: "Chainscan", url: "https://chainscan.0g.ai" } },
});

const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);

export const wallet = createWalletClient({ account, chain: zeroG, transport: http() });
export const publicClient = createPublicClient({ chain: zeroG, transport: http() });

export const BOUNCER_REGISTRY = process.env.BOUNCER_REGISTRY_ADDRESS as Address;
export const CAMPAIGN_FACTORY = process.env.CAMPAIGN_FACTORY_ADDRESS as Address;
export const CAMPAIGN_FACTORY_V2 = process.env.CAMPAIGN_FACTORY_V2 as Address;

/// The live viem clients behind the narrow surface chain-v2.ts asks for, so the V2 modules stay
/// injectable and testable while production still talks to one wallet and one RPC.
const v2Clients: ChainClients = {
  wallet: { writeContract: (args) => wallet.writeContract(args as never) },
  publicClient: {
    waitForTransactionReceipt: (args) => publicClient.waitForTransactionReceipt(args),
    readContract: (args) => publicClient.readContract(args as never),
  },
};

const registryAbi = parseAbi([
  "function mintBouncer(string personaURI, string lorebookURI, string imageURI, bytes32 oracleConditions) returns (uint256)",
  "function authorizeUsage(uint256 tokenId, address executor, bytes permissions)",
  "function recordConversation(uint256 tokenId, bytes32 convoHash)",
  "function incrementRep(uint256 tokenId) returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function isAuthorized(uint256 tokenId, address executor) view returns (bool)",
  "event BouncerMinted(uint256 indexed tokenId, address indexed owner, string personaURI, string imageURI)",
  "event RepIncremented(uint256 indexed tokenId, uint256 newScore)",
]);

// Bumps the bouncer iNFT's on-chain reputation by one. Authorized-executor gated (the backend was
// granted this at mint via authorizeUsage), so the score accrues to the token and travels with it
// across campaigns. Returns the new score parsed from the RepIncremented event.
export async function incrementRep(tokenId: bigint): Promise<{ txHash: Hex; newScore: bigint }> {
  const txHash = await wallet.writeContract({
    address: BOUNCER_REGISTRY,
    abi: registryAbi,
    functionName: "incrementRep",
    args: [tokenId],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const [bumped] = parseEventLogs({ abi: registryAbi, eventName: "RepIncremented", logs: receipt.logs });
  if (!bumped) throw new Error("RepIncremented event not found in receipt");
  return { txHash, newScore: bumped.args.newScore };
}

// Read helpers used by the server.ts /index endpoint to verify the user actually owns the iNFT
// they're claiming and has authorized the backend, before we trust their indexing payload.
export async function readBouncerOwner(tokenId: bigint): Promise<Address | null> {
  try {
    return await publicClient.readContract({
      address: BOUNCER_REGISTRY,
      abi: registryAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });
  } catch { return null; }
}

export async function readIsAuthorized(tokenId: bigint, executor: Address): Promise<boolean> {
  return publicClient.readContract({
    address: BOUNCER_REGISTRY,
    abi: registryAbi,
    functionName: "isAuthorized",
    args: [tokenId, executor],
  });
}

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

// The bytes32 that lands on chain per decision. The Campaign contract treats it as opaque, so the
// derivation can differ by attestation kind without a contract change:
//   - tee-signature: keccak256 of the provider's raw TEE signature. A verifier recomputes this AND
//     recovers the signature to the provider's on-chain teeSignerAddress — cryptographic proof the
//     enclave signed, no trust in the Router.
//   - router: keccak of the Router's trace fields (the Router is trusted to have checked the TEE).
export function attestationHashFor(att: Attestation): Hex {
  if (att.kind === "tee-signature") return keccak256(att.signature as Hex);
  return attestationHashFromTrace(att.trace);
}

export async function mintBouncer(personaURI: string, lorebookURI: string, imageURI: string): Promise<{ txHash: Hex; tokenId: bigint }> {
  const txHash = await wallet.writeContract({
    address: BOUNCER_REGISTRY,
    abi: registryAbi,
    functionName: "mintBouncer",
    args: [personaURI, lorebookURI, imageURI, "0x0000000000000000000000000000000000000000000000000000000000000000"],
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

export async function finalizeMerkleRoot(campaign: Address, root: Hex): Promise<Hex> {
  const finalizeAbi = parseAbi(["function finalizeMerkleRoot(bytes32 root)"]);
  const txHash = await wallet.writeContract({
    address: campaign,
    abi: finalizeAbi,
    functionName: "finalizeMerkleRoot",
    args: [root],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export type RecordedDecision = { txHash: Hex; attestationHash: Hex; reasoningHash: Hex };

function reasoningHashOf(reasoning: string): Hex {
  return keccak256(`0x${Buffer.from(reasoning, "utf8").toString("hex")}` as Hex);
}

export async function recordDecision(
  campaign: Address,
  applicant: Address,
  approve: boolean,
  reasoning: string,
  attestation: Attestation,
): Promise<RecordedDecision> {
  const reasoningHash = reasoningHashOf(reasoning);
  const attestationHash = attestationHashFor(attestation);
  const txHash = await wallet.writeContract({
    address: campaign,
    abi: campaignAbi,
    functionName: "recordDecision",
    args: [applicant, approve, reasoningHash, attestationHash],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, attestationHash, reasoningHash };
}

/// Sends a decision to whichever contract the campaign was created against. V1 campaigns keep the
/// exact call they have always made; only V2 campaigns carry the proof-of-human and mint a ticket.
export type RoutedDecision = RecordedDecision & { ticketId: bigint | null };

export async function recordDecisionRouted(
  campaign: Address,
  contractVersion: number | null | undefined,
  applicant: Address,
  approve: boolean,
  reasoning: string,
  attestation: Attestation,
  nullifierHash: Hex | null,
): Promise<RoutedDecision> {
  const path = decisionPathFor(contractVersion);
  if (path.version === 1) {
    const recorded = await recordDecision(campaign, applicant, approve, reasoning, attestation);
    return { ...recorded, ticketId: null };
  }

  if (!nullifierHash) throw new Error("a V2 decision needs the Door proof's nullifier");
  const reasoningHash = reasoningHashOf(reasoning);
  const attestationHash = attestationHashFor(attestation);
  const { txHash, ticketId } = await recordDecisionV2(v2Clients, {
    campaign,
    applicant,
    approve,
    reasoningHash,
    attestationHash,
    nullifierHash,
  });
  return { txHash, attestationHash, reasoningHash, ticketId };
}

/// Creates a campaign on the factory matching the requested contract version. A V2 campaign needs
/// a schedule; a V1 campaign has none and takes the original two-argument call.
export async function createCampaignRouted(
  contractVersion: number | null | undefined,
  bouncerTokenId: bigint,
  wlSizeCap: bigint,
  schedule: { closeAt: bigint; ticketExpiry: bigint } | null,
): Promise<{ txHash: Hex; campaign: Address }> {
  const path = decisionPathFor(contractVersion);
  if (path.version === 1) return createCampaign(bouncerTokenId, wlSizeCap);

  if (!schedule) throw new Error("a V2 campaign needs a closeAt and a ticket expiry");
  return createCampaignV2(v2Clients, {
    factory: CAMPAIGN_FACTORY_V2,
    bouncerTokenId,
    wlSizeCap,
    closeAt: schedule.closeAt,
    ticketExpiry: schedule.ticketExpiry,
  });
}

/// The Ticket contract address, read from the factory once and remembered. A factory's ticket
/// never changes, so re-reading it on every roster render would be a round trip for nothing.
let ticketAddress: Address | null = null;
async function ticketContract(): Promise<Address> {
  if (!ticketAddress) ticketAddress = await readTicketAddress(v2Clients, CAMPAIGN_FACTORY_V2);
  return ticketAddress;
}

export async function liveTicketId(campaign: Address, wallet: Address): Promise<bigint | null> {
  return readLiveTicketId(v2Clients, await ticketContract(), campaign, wallet);
}

export async function ticketStatuses(ticketIds: string[]): Promise<Record<string, ChainTicketStatus>> {
  if (ticketIds.length === 0) return {};
  return readTicketStatuses(v2Clients, await ticketContract(), ticketIds);
}
