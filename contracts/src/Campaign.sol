// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BouncerRegistry} from "./BouncerRegistry.sol";

/// @title Campaign — one whitelist round, one bouncer
/// @notice Records each applicant decision with the TEE attestation hash returned by 0G Compute Router,
///         enforces one-attempt-per-wallet, and finalizes a Merkle root the project drops into any EVM mint.
contract Campaign {
    BouncerRegistry public immutable registry;
    uint256 public immutable bouncerTokenId;
    address public immutable owner;
    uint256 public immutable wlSizeCap;

    enum DecisionStatus {
        None,
        Approved,
        Rejected
    }

    struct DecisionRecord {
        DecisionStatus status;
        bytes32 reasoningHash;
        bytes32 attestationHash;
        uint64 timestamp;
    }

    mapping(address => DecisionRecord) public decisions;
    address[] public approved;
    address[] public rejected;

    bytes32 public merkleRoot;
    bool public finalized;

    error AlreadyDecided();
    error NotOwner();
    error CapReached();
    error AlreadyFinalized();
    error NotFinalized();
    error CallerNotBouncerOperator();
    error EmptyRoot();

    event DecisionRecorded(
        address indexed applicant, bool approved, bytes32 reasoningHash, bytes32 attestationHash
    );
    event Finalized(bytes32 merkleRoot, uint256 approvedCount);

    constructor(address registry_, uint256 bouncerTokenId_, address owner_, uint256 wlSizeCap_) {
        registry = BouncerRegistry(registry_);
        bouncerTokenId = bouncerTokenId_;
        owner = owner_;
        wlSizeCap = wlSizeCap_;
    }

    /// @notice Called by the bouncer backend after a TEE-verified inference decision.
    /// @dev Caller must be authorized on the bouncer iNFT via BouncerRegistry.authorizeUsage.
    function recordDecision(
        address applicant,
        bool approve,
        bytes32 reasoningHash,
        bytes32 attestationHash
    ) external {
        if (!registry.isAuthorized(bouncerTokenId, msg.sender)) revert CallerNotBouncerOperator();
        if (finalized) revert AlreadyFinalized();
        if (decisions[applicant].status != DecisionStatus.None) revert AlreadyDecided();
        if (approve && approved.length >= wlSizeCap) revert CapReached();

        decisions[applicant] = DecisionRecord({
            status: approve ? DecisionStatus.Approved : DecisionStatus.Rejected,
            reasoningHash: reasoningHash,
            attestationHash: attestationHash,
            timestamp: uint64(block.timestamp)
        });

        if (approve) approved.push(applicant);
        else rejected.push(applicant);

        emit DecisionRecorded(applicant, approve, reasoningHash, attestationHash);
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

/// @title CampaignFactory — one factory deploys per-campaign contracts
contract CampaignFactory {
    BouncerRegistry public immutable registry;

    event CampaignCreated(
        address indexed campaign, address indexed owner, uint256 indexed bouncerTokenId, uint256 wlSizeCap
    );

    error NotBouncerOwner();

    constructor(address registry_) {
        registry = BouncerRegistry(registry_);
    }

    function createCampaign(uint256 bouncerTokenId, uint256 wlSizeCap) external returns (address campaign) {
        if (registry.ownerOf(bouncerTokenId) != msg.sender) revert NotBouncerOwner();
        campaign = address(new Campaign(address(registry), bouncerTokenId, msg.sender, wlSizeCap));
        emit CampaignCreated(campaign, msg.sender, bouncerTokenId, wlSizeCap);
    }
}
