// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Interface contract for feature 002. Implementations live in contracts/src/{CampaignV2,Ticket,TicketGate}.sol.
/// V1 Campaign/CampaignFactory are untouched; V2 deploys beside them against the existing BouncerRegistry.

interface ITicket {
    error Soulbound();
    error NotMinter();

    event TicketMinted(uint256 indexed tokenId, address indexed campaign, address indexed applicant, uint64 expiresAt);
    event TicketRevoked(uint256 indexed tokenId, address indexed campaign, address indexed applicant);

    function mint(address applicant, uint64 expiresAt) external returns (uint256 tokenId); // minter = campaign from factory
    function revoke(uint256 tokenId) external;                                              // only the minting campaign
    function isLive(uint256 tokenId) external view returns (bool);
    function liveTicketOf(address campaign, address wallet) external view returns (uint256); // 0 when none
    function expiresAt(uint256 tokenId) external view returns (uint64);
    function revoked(uint256 tokenId) external view returns (bool);
}

interface ICampaignV2 {
    enum DecisionStatus { None, Approved, Rejected }

    struct DecisionRecordV2 {
        DecisionStatus status;
        bytes32 reasoningHash;
        bytes32 attestationHash;
        bytes32 nullifierHash;
        uint256 ticketId;       // 0 when rejected
        uint64 timestamp;
    }

    error AlreadyDecided();
    error NotOwner();
    error CapReached();
    error AlreadyFinalized();
    error CallerNotBouncerOperator();
    error CampaignClosed();
    error ZeroNullifier();
    error NoLiveTicket();

    event DecisionRecordedV2(
        address indexed applicant, bool approved, bytes32 reasoningHash, bytes32 attestationHash, bytes32 nullifierHash, uint256 ticketId
    );
    event Finalized(bytes32 merkleRoot, uint256 approvedCount);

    function closeAt() external view returns (uint64);
    function ticketExpiry() external view returns (uint64);
    function recordDecision(address applicant, bool approve, bytes32 reasoningHash, bytes32 attestationHash, bytes32 nullifierHash) external;
    function revokeTicket(uint256 ticketId) external;          // owner only
    function hasLiveTicket(address wallet) external view returns (bool);
    function finalizeMerkleRoot(bytes32 root) external;         // unchanged
    function approvedCount() external view returns (uint256);
    function rejectedCount() external view returns (uint256);
    function approvedAt(uint256 index) external view returns (address);
}

interface ICampaignFactoryV2 {
    error NotBouncerOwner();
    error BadSchedule(); // closeAt <= now or ticketExpiry < now

    event CampaignCreatedV2(
        address indexed campaign, address indexed owner, uint256 indexed bouncerTokenId, uint256 wlSizeCap, uint64 closeAt, uint64 ticketExpiry
    );

    function ticket() external view returns (address);
    function createCampaign(uint256 bouncerTokenId, uint256 wlSizeCap, uint64 closeAt, uint64 ticketExpiry) external returns (address campaign);
}

interface ITicketGate {
    error NoLiveTicket();
    error AlreadyMinted();
    event Minted(address indexed wallet, uint256 indexed ticketId);
    function mint() external;
}
