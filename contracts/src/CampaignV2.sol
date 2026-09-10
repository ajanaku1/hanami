// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BouncerRegistry} from "./BouncerRegistry.sol";
import {Ticket} from "./Ticket.sol";

/// @title CampaignV2 — one whitelist round whose approvals are soulbound tickets
/// @notice Deploys beside the V1 Campaign, against the same BouncerRegistry. It keeps V1's decision
///         log and Merkle export and adds three things: the decision carries the proof-of-human
///         nullifier, an approval mints exactly one expiring soulbound Ticket, and the owner can
///         revoke a ticket without touching the decision record.
/// @dev V1 Campaign and CampaignFactory are untouched; existing campaigns keep running on them.
contract CampaignV2 {
    BouncerRegistry public immutable registry;
    Ticket public immutable ticket;
    uint256 public immutable bouncerTokenId;
    address public immutable owner;
    uint256 public immutable wlSizeCap;
    /// No decision may be recorded at or after this timestamp.
    uint64 public immutable closeAt;
    /// Stamped on every ticket this campaign mints.
    uint64 public immutable ticketExpiry;

    enum DecisionStatus {
        None,
        Approved,
        Rejected
    }

    struct DecisionRecordV2 {
        DecisionStatus status;
        bytes32 reasoningHash;
        bytes32 attestationHash;
        bytes32 nullifierHash;
        uint256 ticketId; // 0 when rejected
        uint64 timestamp;
    }

    mapping(address => DecisionRecordV2) public decisions;
    address[] public approved;
    address[] public rejected;

    bytes32 public merkleRoot;
    bool public finalized;

    error AlreadyDecided();
    error NotOwner();
    error CapReached();
    error AlreadyFinalized();
    error CallerNotBouncerOperator();
    error CampaignClosed();
    error ZeroNullifier();
    error EmptyRoot();

    event DecisionRecordedV2(
        address indexed applicant,
        bool approved,
        bytes32 reasoningHash,
        bytes32 attestationHash,
        bytes32 nullifierHash,
        uint256 ticketId
    );
    event Finalized(bytes32 merkleRoot, uint256 approvedCount);

    constructor(
        address registry_,
        address ticket_,
        uint256 bouncerTokenId_,
        address owner_,
        uint256 wlSizeCap_,
        uint64 closeAt_,
        uint64 ticketExpiry_
    ) {
        registry = BouncerRegistry(registry_);
        ticket = Ticket(ticket_);
        bouncerTokenId = bouncerTokenId_;
        owner = owner_;
        wlSizeCap = wlSizeCap_;
        closeAt = closeAt_;
        ticketExpiry = ticketExpiry_;
    }

    /// @notice Called by the bouncer backend after a TEE-verified inference decision.
    /// @param nullifierHash the anonymous proof-of-human identifier that passed the Door. It is
    ///        required: a decision with no person behind it is not a decision this campaign records.
    function recordDecision(
        address applicant,
        bool approve,
        bytes32 reasoningHash,
        bytes32 attestationHash,
        bytes32 nullifierHash
    ) external {
        if (!registry.isAuthorized(bouncerTokenId, msg.sender)) revert CallerNotBouncerOperator();
        if (finalized) revert AlreadyFinalized();
        if (block.timestamp >= closeAt) revert CampaignClosed();
        if (nullifierHash == bytes32(0)) revert ZeroNullifier();
        if (decisions[applicant].status != DecisionStatus.None) revert AlreadyDecided();
        if (approve && approved.length >= wlSizeCap) revert CapReached();

        uint256 ticketId = approve ? ticket.mint(applicant, ticketExpiry) : 0;

        decisions[applicant] = DecisionRecordV2({
            status: approve ? DecisionStatus.Approved : DecisionStatus.Rejected,
            reasoningHash: reasoningHash,
            attestationHash: attestationHash,
            nullifierHash: nullifierHash,
            ticketId: ticketId,
            timestamp: uint64(block.timestamp)
        });

        if (approve) approved.push(applicant);
        else rejected.push(applicant);

        emit DecisionRecordedV2(applicant, approve, reasoningHash, attestationHash, nullifierHash, ticketId);
    }

    /// @notice The owner withdraws a pass. The decision record stays exactly as it was recorded.
    /// @dev Ticket rejects a tokenId this campaign did not mint, so a campaign cannot revoke
    ///      another campaign's tickets.
    function revokeTicket(uint256 ticketId) external {
        if (msg.sender != owner) revert NotOwner();
        ticket.revoke(ticketId);
    }

    function hasLiveTicket(address wallet) external view returns (bool) {
        return ticket.liveTicketOf(address(this), wallet) != 0;
    }

    /// @notice Project owner publishes the Merkle root over `approved`. Tree is built off-chain.
    function finalizeMerkleRoot(bytes32 root) external {
        if (msg.sender != owner) revert NotOwner();
        if (finalized) revert AlreadyFinalized();
        if (root == bytes32(0)) revert EmptyRoot();
        merkleRoot = root;
        finalized = true;
        emit Finalized(root, approved.length);
    }

    function approvedCount() external view returns (uint256) {
        return approved.length;
    }

    function rejectedCount() external view returns (uint256) {
        return rejected.length;
    }

    function approvedAt(uint256 index) external view returns (address) {
        return approved[index];
    }
}

/// @title CampaignFactoryV2 — deploys V2 campaigns and owns the Ticket they mint from
/// @dev The factory deploys its Ticket in its own constructor so minting authority is structural:
///      Ticket's factory is immutable, only this factory can register a minter, and only campaigns
///      this factory created are ever registered.
contract CampaignFactoryV2 {
    BouncerRegistry public immutable registry;
    Ticket public immutable ticket;

    event CampaignCreatedV2(
        address indexed campaign,
        address indexed owner,
        uint256 indexed bouncerTokenId,
        uint256 wlSizeCap,
        uint64 closeAt,
        uint64 ticketExpiry
    );

    error NotBouncerOwner();
    error BadSchedule();

    constructor(address registry_) {
        registry = BouncerRegistry(registry_);
        ticket = new Ticket(address(this));
    }

    /// @param ticketExpiry_ pass 0 to expire tickets when the campaign closes.
    function createCampaign(uint256 bouncerTokenId, uint256 wlSizeCap, uint64 closeAt, uint64 ticketExpiry_)
        external
        returns (address campaign)
    {
        if (registry.ownerOf(bouncerTokenId) != msg.sender) revert NotBouncerOwner();
        if (closeAt <= block.timestamp) revert BadSchedule();
        uint64 expiry = ticketExpiry_ == 0 ? closeAt : ticketExpiry_;
        if (expiry < block.timestamp) revert BadSchedule();

        campaign = address(
            new CampaignV2(address(registry), address(ticket), bouncerTokenId, msg.sender, wlSizeCap, closeAt, expiry)
        );
        ticket.addMinter(campaign);
        emit CampaignCreatedV2(campaign, msg.sender, bouncerTokenId, wlSizeCap, closeAt, expiry);
    }
}
