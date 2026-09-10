// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CampaignV2} from "./CampaignV2.sol";
import {Ticket} from "./Ticket.sol";

/// @title TicketGate — the demo consumer of a Hanami ticket
/// @notice What a project would actually put behind a bouncer's approval: one mint per wallet,
///         allowed only while that wallet's ticket from this campaign is live. Expiry and
///         revocation are honoured at the moment of the mint; a mint already taken is not clawed
///         back, because the holder was approved when they took it.
contract TicketGate {
    CampaignV2 public immutable campaign;
    Ticket public immutable ticket;

    mapping(address => bool) public minted;

    error NoLiveTicket();
    error AlreadyMinted();

    event Minted(address indexed wallet, uint256 indexed ticketId);

    constructor(address campaign_) {
        campaign = CampaignV2(campaign_);
        ticket = CampaignV2(campaign_).ticket();
    }

    function mint() external {
        if (minted[msg.sender]) revert AlreadyMinted();
        uint256 ticketId = ticket.liveTicketOf(address(campaign), msg.sender);
        if (ticketId == 0) revert NoLiveTicket();

        minted[msg.sender] = true;
        emit Minted(msg.sender, ticketId);
    }
}
