// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BouncerRegistry} from "../src/BouncerRegistry.sol";
import {CampaignV2, CampaignFactoryV2} from "../src/CampaignV2.sol";
import {Ticket} from "../src/Ticket.sol";
import {TicketGate} from "../src/TicketGate.sol";

/// TicketGate is the demo consumer: the thing a project would actually gate on a Hanami approval.
contract TicketGateTest is Test {
    BouncerRegistry registry;
    CampaignFactoryV2 factory;
    Ticket ticket;
    CampaignV2 campaign;
    TicketGate gate;

    address project = address(0xA11CE);
    address botSigner = address(0xB07);
    address holder = address(0x1);
    address stranger = address(0x2);

    uint64 closeAt;
    uint64 ticketExpiry;

    function setUp() public {
        vm.warp(1_757_000_000);
        registry = new BouncerRegistry();
        factory = new CampaignFactoryV2(address(registry));
        ticket = Ticket(factory.ticket());
        closeAt = uint64(block.timestamp + 7 days);
        ticketExpiry = uint64(block.timestamp + 30 days);

        vm.prank(project);
        uint256 tokenId = registry.mintBouncer("ipfs://persona", "ipfs://lore", "ipfs://image", bytes32(uint256(1)));
        vm.prank(project);
        campaign = CampaignV2(factory.createCampaign(tokenId, 100, closeAt, ticketExpiry));
        vm.prank(project);
        registry.authorizeUsage(tokenId, botSigner, "");

        gate = new TicketGate(address(campaign));
    }

    function _approve(address who) internal returns (uint256 ticketId) {
        vm.prank(botSigner);
        campaign.recordDecision(who, true, keccak256("r"), keccak256("a"), keccak256(abi.encode(who)));
        ticketId = ticket.liveTicketOf(address(campaign), who);
    }

    function test_AcceptsALiveTicketHolder() public {
        uint256 ticketId = _approve(holder);

        vm.expectEmit(true, true, false, true);
        emit TicketGate.Minted(holder, ticketId);
        vm.prank(holder);
        gate.mint();

        assertTrue(gate.minted(holder));
    }

    function test_RevertWhen_NoTicket() public {
        vm.prank(stranger);
        vm.expectRevert(TicketGate.NoLiveTicket.selector);
        gate.mint();
    }

    function test_RevertWhen_TicketExpired() public {
        _approve(holder);
        vm.warp(ticketExpiry);

        vm.prank(holder);
        vm.expectRevert(TicketGate.NoLiveTicket.selector);
        gate.mint();
    }

    function test_RevertWhen_TicketRevoked() public {
        uint256 ticketId = _approve(holder);
        vm.prank(project);
        campaign.revokeTicket(ticketId);

        vm.prank(holder);
        vm.expectRevert(TicketGate.NoLiveTicket.selector);
        gate.mint();
    }

    function test_RevertWhen_MintingTwice() public {
        _approve(holder);

        vm.startPrank(holder);
        gate.mint();
        vm.expectRevert(TicketGate.AlreadyMinted.selector);
        gate.mint();
        vm.stopPrank();
    }

    function test_RevocationAfterMintDoesNotUnmint() public {
        uint256 ticketId = _approve(holder);
        vm.prank(holder);
        gate.mint();

        vm.prank(project);
        campaign.revokeTicket(ticketId);
        assertTrue(gate.minted(holder), "revocation stops future mints, it does not claw back past ones");
    }
}
