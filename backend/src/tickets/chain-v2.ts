import { encodeFunctionData, parseAbi, parseEventLogs, type Abi, type Address, type Hex } from "viem";

/// The V2 contracts, beside the V1 pair in og-chain.ts. Everything here takes its clients as an
/// argument rather than reaching for module-level ones, so the encoding and the event parsing are
/// testable without a chain and without a key in the environment.

export const campaignV2Abi = parseAbi([
  "function recordDecision(address applicant, bool approve, bytes32 reasoningHash, bytes32 attestationHash, bytes32 nullifierHash)",
  "function revokeTicket(uint256 ticketId)",
  "function hasLiveTicket(address wallet) view returns (bool)",
  "function closeAt() view returns (uint64)",
  "function ticketExpiry() view returns (uint64)",
  "function finalizeMerkleRoot(bytes32 root)",
  "function approvedCount() view returns (uint256)",
  "function rejectedCount() view returns (uint256)",
  "function approvedAt(uint256 index) view returns (address)",
  "event DecisionRecordedV2(address indexed applicant, bool approved, bytes32 reasoningHash, bytes32 attestationHash, bytes32 nullifierHash, uint256 ticketId)",
]);

export const campaignFactoryV2Abi = parseAbi([
  "function createCampaign(uint256 bouncerTokenId, uint256 wlSizeCap, uint64 closeAt, uint64 ticketExpiry) returns (address)",
  "function ticket() view returns (address)",
  "event CampaignCreatedV2(address indexed campaign, address indexed owner, uint256 indexed bouncerTokenId, uint256 wlSizeCap, uint64 closeAt, uint64 ticketExpiry)",
]);

export const ticketAbi = parseAbi([
  "function isLive(uint256 tokenId) view returns (bool)",
  "function liveTicketOf(address campaign, address wallet) view returns (uint256)",
  "function expiresAt(uint256 tokenId) view returns (uint64)",
  "function revoked(uint256 tokenId) view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

type WriteArgs = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };
type ReadArgs = WriteArgs;

/// The slice of viem's clients this module uses. Narrow on purpose: a test supplies a fake, and
/// nothing here can quietly grow a dependency on the rest of the client surface.
export type ChainClients = {
  wallet: { writeContract(args: WriteArgs): Promise<Hex> };
  publicClient: {
    waitForTransactionReceipt(args: { hash: Hex }): Promise<{ logs: unknown[] }>;
    readContract(args: ReadArgs): Promise<unknown>;
  };
};

const ZERO_BYTES32 = `0x${"00".repeat(32)}`;

export type DecisionV2 = {
  campaign: Address;
  applicant: Address;
  approve: boolean;
  reasoningHash: Hex;
  attestationHash: Hex;
  nullifierHash: Hex;
};

/// Records the decision on chain and returns the ticket the contract minted.
/// `ticketId` is null for a rejection: no approval, no pass.
export async function recordDecisionV2(
  clients: ChainClients,
  decision: DecisionV2,
): Promise<{ txHash: Hex; ticketId: bigint | null }> {
  if (decision.nullifierHash === ZERO_BYTES32) {
    // The contract would revert with ZeroNullifier; refusing here keeps us from paying gas to
    // discover that a decision lost its proof-of-human somewhere upstream.
    throw new Error("recordDecisionV2: a decision needs a nullifier; the Door proof is missing");
  }

  const txHash = await clients.wallet.writeContract({
    address: decision.campaign,
    abi: campaignV2Abi as Abi,
    functionName: "recordDecision",
    args: [
      decision.applicant,
      decision.approve,
      decision.reasoningHash,
      decision.attestationHash,
      decision.nullifierHash,
    ],
  });

  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash });
  const [recorded] = parseEventLogs({
    abi: campaignV2Abi,
    eventName: "DecisionRecordedV2",
    logs: receipt.logs as never,
  });
  if (!recorded) throw new Error("DecisionRecordedV2 event not found");

  const ticketId = recorded.args.ticketId;
  return { txHash, ticketId: ticketId === 0n ? null : ticketId };
}

export async function createCampaignV2(
  clients: ChainClients,
  params: { factory: Address; bouncerTokenId: bigint; wlSizeCap: bigint; closeAt: bigint; ticketExpiry: bigint },
): Promise<{ txHash: Hex; campaign: Address }> {
  const txHash = await clients.wallet.writeContract({
    address: params.factory,
    abi: campaignFactoryV2Abi as Abi,
    functionName: "createCampaign",
    args: [params.bouncerTokenId, params.wlSizeCap, params.closeAt, params.ticketExpiry],
  });

  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash });
  const [created] = parseEventLogs({
    abi: campaignFactoryV2Abi,
    eventName: "CampaignCreatedV2",
    logs: receipt.logs as never,
  });
  if (!created) throw new Error("CampaignCreatedV2 event not found");
  return { txHash, campaign: created.args.campaign };
}

export async function hasLiveTicket(
  clients: ChainClients,
  campaign: Address,
  wallet: Address,
): Promise<boolean> {
  const live = await clients.publicClient.readContract({
    address: campaign,
    abi: campaignV2Abi as Abi,
    functionName: "hasLiveTicket",
    args: [wallet],
  });
  return live === true;
}

/// Revocation is the owner's authority, not the backend's: the backend holds the bouncer's operator
/// key, never the owner's. So this returns a transaction for the owner's wallet to sign, with the
/// ticket id as a decimal string because it crosses JSON on the way to the browser.
export function prepareRevokeTicket(
  campaign: Address,
  ticketId: bigint,
): { address: Address; abi: Abi; functionName: "revokeTicket"; args: [string]; data: Hex } {
  return {
    address: campaign,
    abi: campaignV2Abi as Abi,
    functionName: "revokeTicket",
    args: [ticketId.toString()],
    data: encodeFunctionData({ abi: campaignV2Abi, functionName: "revokeTicket", args: [ticketId] }),
  };
}

/// Which decision path a campaign takes. The database column is the authority: campaigns created
/// before feature 002 have no version and stay on the V1 Campaign contract forever, so a V1
/// campaign is never sent a nullifier the V1 ABI has no argument for.
export type DecisionPath =
  | { version: 1; sendsNullifier: false; mintsTicket: false }
  | { version: 2; sendsNullifier: true; mintsTicket: true };

export function decisionPathFor(contractVersion: number | null | undefined): DecisionPath {
  if (contractVersion === null || contractVersion === undefined || contractVersion === 1) {
    return { version: 1, sendsNullifier: false, mintsTicket: false };
  }
  if (contractVersion === 2) return { version: 2, sendsNullifier: true, mintsTicket: true };
  throw new Error(`unknown contract version ${contractVersion}`);
}

export type ChainTicketStatus = { live: boolean; revoked: boolean; expiresAt: number };

/// The Ticket contract belongs to the factory that deployed it, so it is read rather than
/// configured. Cached by the caller: a factory's ticket address never changes.
export async function readTicketAddress(clients: ChainClients, factory: Address): Promise<Address> {
  const address = await clients.publicClient.readContract({
    address: factory,
    abi: campaignFactoryV2Abi as Abi,
    functionName: "ticket",
    args: [],
  });
  return address as Address;
}

export async function readLiveTicketId(
  clients: ChainClients,
  ticket: Address,
  campaign: Address,
  wallet: Address,
): Promise<bigint | null> {
  const id = (await clients.publicClient.readContract({
    address: ticket,
    abi: ticketAbi as Abi,
    functionName: "liveTicketOf",
    args: [campaign, wallet],
  })) as bigint;
  return id === 0n ? null : id;
}

/// The roster's source of truth. Status is three reads per ticket because live, revoked, and
/// expired are three different answers and the roster has to tell them apart.
export async function readTicketStatuses(
  clients: ChainClients,
  ticket: Address,
  ticketIds: string[],
): Promise<Record<string, ChainTicketStatus>> {
  const entries = await Promise.all(
    ticketIds.map(async (id) => {
      const tokenId = BigInt(id);
      const read = (functionName: string) =>
        clients.publicClient.readContract({ address: ticket, abi: ticketAbi as Abi, functionName, args: [tokenId] });
      const [live, revoked, expiresAt] = await Promise.all([read("isLive"), read("revoked"), read("expiresAt")]);
      return [id, { live: live === true, revoked: revoked === true, expiresAt: Number(expiresAt) }] as const;
    }),
  );
  return Object.fromEntries(entries);
}
