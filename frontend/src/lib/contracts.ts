// Minimal ABIs for the three calls the user signs during mint. We deliberately keep these
// inline rather than importing from a generated artifact — the surface is tiny and the user-
// signed flow is what justifies the whole "you own your bouncer iNFT" story; an ABI mismatch
// would silently fail in MetaMask. Inline is easier to audit at a glance.

import { parseAbi, type Address, type Hex } from "viem";
import { decodeEventLog } from "viem";

export const registryAbi = parseAbi([
  "function mintBouncer(string personaURI, string lorebookURI, string imageURI, bytes32 oracleConditions) returns (uint256)",
  "function authorizeUsage(uint256 tokenId, address executor, bytes permissions)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "event BouncerMinted(uint256 indexed tokenId, address indexed owner, string personaURI, string imageURI)",
]);

export const factoryAbi = parseAbi([
  "function createCampaign(uint256 bouncerTokenId, uint256 wlSizeCap) returns (address)",
  "event CampaignCreated(address indexed campaign, address indexed owner, uint256 indexed bouncerTokenId, uint256 wlSizeCap)",
]);

export const ZERO_BYTES32: Hex =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export const EMPTY_BYTES: Hex = "0x";

/// Pull tokenId out of a mintBouncer receipt by decoding the BouncerMinted event.
export function tokenIdFromMintLogs(logs: { address: Address; topics: readonly Hex[]; data: Hex }[]): bigint {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({ abi: registryAbi, data: log.data, topics: [...log.topics] as [Hex, ...Hex[]] });
      if (decoded.eventName === "BouncerMinted") {
        return decoded.args.tokenId;
      }
    } catch {
      // Not a registry event — skip.
    }
  }
  throw new Error("BouncerMinted event not in mint receipt logs");
}

/// Pull the new Campaign address out of a createCampaign receipt.
export function campaignAddressFromLogs(logs: { address: Address; topics: readonly Hex[]; data: Hex }[]): Address {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({ abi: factoryAbi, data: log.data, topics: [...log.topics] as [Hex, ...Hex[]] });
      if (decoded.eventName === "CampaignCreated") {
        return decoded.args.campaign;
      }
    } catch {
      // Not a factory event — skip.
    }
  }
  throw new Error("CampaignCreated event not in createCampaign receipt logs");
}
