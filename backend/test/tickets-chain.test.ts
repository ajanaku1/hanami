import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { encodeAbiParameters, encodeEventTopics, parseAbi, type Address, type Hex } from "viem";
import {
  campaignV2Abi,
  createCampaignV2,
  decisionPathFor,
  hasLiveTicket,
  prepareRevokeTicket,
  recordDecisionV2,
  type ChainClients,
} from "../src/tickets/chain-v2.js";

const CAMPAIGN = "0x00000000000000000000000000000000000000c2" as Address;
const FACTORY = "0x00000000000000000000000000000000000000fa" as Address;
const APPLICANT = "0x00000000000000000000000000000000000000aa" as Address;
const REASONING = `0x${"11".repeat(32)}` as Hex;
const ATTESTATION = `0x${"22".repeat(32)}` as Hex;
const NULLIFIER = `0x${"33".repeat(32)}` as Hex;
const TX = `0x${"ab".repeat(32)}` as Hex;

type Call = { address: Address; functionName: string; args: readonly unknown[] };

/// A client that records what it was asked to do and replays canned receipts, so the encoding and
/// the event parsing are tested without a chain.
function fakeClients(logs: unknown[] = [], reads: unknown[] = []): ChainClients & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    wallet: {
      async writeContract(args) {
        calls.push({ address: args.address, functionName: args.functionName, args: args.args });
        return TX;
      },
    },
    publicClient: {
      async waitForTransactionReceipt() {
        return { logs };
      },
      async readContract(args) {
        calls.push({ address: args.address, functionName: args.functionName, args: args.args });
        return reads.shift();
      },
    },
  };
}

function decisionLog(applicant: Address, approved: boolean, ticketId: bigint) {
  return {
    address: CAMPAIGN,
    topics: encodeEventTopics({
      abi: campaignV2Abi,
      eventName: "DecisionRecordedV2",
      args: { applicant },
    }),
    data: encodeAbiParameters(
      [{ type: "bool" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
      [approved, REASONING, ATTESTATION, NULLIFIER, ticketId],
    ),
  };
}

describe("V2 chain client", () => {
  test("recordDecision carries the nullifier and returns the minted ticket id", async () => {
    const clients = fakeClients([decisionLog(APPLICANT, true, 7n)]);

    const result = await recordDecisionV2(clients, {
      campaign: CAMPAIGN,
      applicant: APPLICANT,
      approve: true,
      reasoningHash: REASONING,
      attestationHash: ATTESTATION,
      nullifierHash: NULLIFIER,
    });

    assert.deepEqual(clients.calls[0], {
      address: CAMPAIGN,
      functionName: "recordDecision",
      args: [APPLICANT, true, REASONING, ATTESTATION, NULLIFIER],
    });
    assert.deepEqual(result, { txHash: TX, ticketId: 7n });
  });

  test("a rejection records with ticket id zero and reports no ticket", async () => {
    const clients = fakeClients([decisionLog(APPLICANT, false, 0n)]);

    const result = await recordDecisionV2(clients, {
      campaign: CAMPAIGN,
      applicant: APPLICANT,
      approve: false,
      reasoningHash: REASONING,
      attestationHash: ATTESTATION,
      nullifierHash: NULLIFIER,
    });

    assert.equal(result.ticketId, null);
  });

  test("refuses to record a decision with no proof behind it", async () => {
    const clients = fakeClients();
    await assert.rejects(
      recordDecisionV2(clients, {
        campaign: CAMPAIGN,
        applicant: APPLICANT,
        approve: true,
        reasoningHash: REASONING,
        attestationHash: ATTESTATION,
        nullifierHash: `0x${"00".repeat(32)}` as Hex,
      }),
      /nullifier/i,
    );
    assert.equal(clients.calls.length, 0, "nothing is sent to the chain");
  });

  test("a missing DecisionRecordedV2 event is an error, not a silent zero", async () => {
    const clients = fakeClients([]);
    await assert.rejects(
      recordDecisionV2(clients, {
        campaign: CAMPAIGN,
        applicant: APPLICANT,
        approve: true,
        reasoningHash: REASONING,
        attestationHash: ATTESTATION,
        nullifierHash: NULLIFIER,
      }),
      /DecisionRecordedV2/,
    );
  });

  test("createCampaign passes the schedule and returns the new campaign", async () => {
    const created = {
      address: FACTORY,
      topics: encodeEventTopics({
        abi: parseAbi([
          "event CampaignCreatedV2(address indexed campaign, address indexed owner, uint256 indexed bouncerTokenId, uint256 wlSizeCap, uint64 closeAt, uint64 ticketExpiry)",
        ]),
        eventName: "CampaignCreatedV2",
        args: { campaign: CAMPAIGN, owner: APPLICANT, bouncerTokenId: 1n },
      }),
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint64" }, { type: "uint64" }],
        [100n, 1_757_600_000n, 1_759_000_000n],
      ),
    };
    const clients = fakeClients([created]);

    const result = await createCampaignV2(clients, {
      factory: FACTORY,
      bouncerTokenId: 1n,
      wlSizeCap: 100n,
      closeAt: 1_757_600_000n,
      ticketExpiry: 1_759_000_000n,
    });

    assert.deepEqual(clients.calls[0], {
      address: FACTORY,
      functionName: "createCampaign",
      args: [1n, 100n, 1_757_600_000n, 1_759_000_000n],
    });
    assert.deepEqual(result, { txHash: TX, campaign: CAMPAIGN });
  });

  test("hasLiveTicket reads the campaign", async () => {
    const clients = fakeClients([], [true]);
    assert.equal(await hasLiveTicket(clients, CAMPAIGN, APPLICANT), true);
    assert.deepEqual(clients.calls[0], {
      address: CAMPAIGN,
      functionName: "hasLiveTicket",
      args: [APPLICANT],
    });
  });

  test("revoke is prepared for the owner to sign, never sent by the backend", async () => {
    const prepared = prepareRevokeTicket(CAMPAIGN, 7n);
    assert.equal(prepared.address, CAMPAIGN);
    assert.equal(prepared.functionName, "revokeTicket");
    assert.deepEqual(prepared.args, ["7"]);
    assert.ok(prepared.abi.some((entry) => "name" in entry && entry.name === "revokeTicket"));
  });
});

describe("contract version routing", () => {
  test("campaigns that predate feature 002 keep the V1 path", () => {
    // A row written before the migration has no contract_version at all.
    for (const version of [1, null, undefined]) {
      const path = decisionPathFor(version);
      assert.equal(path.version, 1);
      assert.equal(path.sendsNullifier, false, "the V1 ABI has no nullifier argument to send");
      assert.equal(path.mintsTicket, false);
    }
  });

  test("V2 campaigns take the ticket path and must carry a nullifier", () => {
    const path = decisionPathFor(2);
    assert.equal(path.version, 2);
    assert.equal(path.sendsNullifier, true);
    assert.equal(path.mintsTicket, true);
  });

  test("an unknown contract version is refused rather than guessed", () => {
    assert.throws(() => decisionPathFor(3), /contract version/i);
    assert.throws(() => decisionPathFor(0), /contract version/i);
  });
});
