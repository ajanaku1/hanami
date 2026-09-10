// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title Ticket — the soulbound, expiring pass a bouncer issues on approval
/// @notice One ERC-721 per CampaignFactoryV2. Campaigns created by that factory are its minters;
///         a ticket can never move wallets, and only the campaign that minted it can revoke it.
///         Expiry is derived from time, revocation is terminal, and neither burns the token: a dead
///         ticket stays in the applicant's wallet as a record that the decision happened.
contract Ticket is ERC721 {
    /// The CampaignFactoryV2 that deployed this contract. It is the only address that may register
    /// a campaign as a minter, so minting authority can never be granted by anyone else.
    address public immutable factory;

    uint256 private _nextId = 1;

    mapping(address => bool) public isMinter;
    /// tokenId => the CampaignV2 that minted it; the only address allowed to revoke it.
    mapping(uint256 => address) public campaignOf;
    mapping(uint256 => uint64) public expiresAt;
    mapping(uint256 => bool) public revoked;
    /// campaign => wallet => tokenId (0 when that wallet was never issued one by that campaign).
    mapping(address => mapping(address => uint256)) private _issued;

    error Soulbound();
    error NotMinter();
    error NotFactory();
    error ZeroExpiry();

    event TicketMinted(uint256 indexed tokenId, address indexed campaign, address indexed applicant, uint64 expiresAt);
    event TicketRevoked(uint256 indexed tokenId, address indexed campaign, address indexed applicant);
    event MinterAdded(address indexed campaign);

    constructor(address factory_) ERC721("Hanami Ticket", "HANAMI") {
        factory = factory_;
    }

    function addMinter(address campaign) external {
        if (msg.sender != factory) revert NotFactory();
        isMinter[campaign] = true;
        emit MinterAdded(campaign);
    }

    function mint(address applicant, uint64 expiresAt_) external returns (uint256 tokenId) {
        if (!isMinter[msg.sender]) revert NotMinter();
        if (expiresAt_ == 0) revert ZeroExpiry();

        tokenId = _nextId++;
        campaignOf[tokenId] = msg.sender;
        expiresAt[tokenId] = expiresAt_;
        _issued[msg.sender][applicant] = tokenId;

        _mint(applicant, tokenId);
        emit TicketMinted(tokenId, msg.sender, applicant, expiresAt_);
    }

    function revoke(uint256 tokenId) external {
        if (campaignOf[tokenId] != msg.sender) revert NotMinter();
        revoked[tokenId] = true;
        emit TicketRevoked(tokenId, msg.sender, _ownerOf(tokenId));
    }

    function isLive(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0) && !revoked[tokenId] && block.timestamp < expiresAt[tokenId];
    }

    /// @return tokenId of that wallet's live ticket from that campaign, or 0 when there is none.
    function liveTicketOf(address campaign, address wallet) external view returns (uint256) {
        uint256 tokenId = _issued[campaign][wallet];
        return isLive(tokenId) ? tokenId : 0;
    }

    /// @dev The soulbound rule. Minting (`from == 0`) is the only movement allowed; transfers and
    ///      burns both revert, so a decision on chain can never be laundered or erased.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
