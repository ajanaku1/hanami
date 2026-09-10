// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ticket} from "../src/Ticket.sol";

/// The test contract stands in for the factory, so minter registration is exercised directly
/// without dragging CampaignV2 into a Ticket unit test.
contract TicketTest is Test {
    Ticket ticket;

    address campaign = address(0xCA11);
    address otherCampaign = address(0xCA12);
    address applicant = address(0xA11CE);
    address stranger = address(0xBEEF);

    uint64 expiry;

    function setUp() public {
        vm.warp(1_757_000_000);
        expiry = uint64(block.timestamp + 30 days);
        ticket = new Ticket(address(this));
        ticket.addMinter(campaign);
        ticket.addMinter(otherCampaign);
    }

    function _mint() internal returns (uint256 id) {
        vm.prank(campaign);
        id = ticket.mint(applicant, expiry);
    }

    function test_MintOnlyByRegisteredMinter() public {
        uint256 id = _mint();
        assertEq(ticket.ownerOf(id), applicant);
        assertEq(ticket.expiresAt(id), expiry);
        assertTrue(ticket.isLive(id));

        vm.prank(stranger);
        vm.expectRevert(Ticket.NotMinter.selector);
        ticket.mint(stranger, expiry);
    }

    function test_OnlyFactoryRegistersMinters() public {
        vm.prank(stranger);
        vm.expectRevert(Ticket.NotFactory.selector);
        ticket.addMinter(stranger);
    }

    function test_RevertWhen_Transferred() public {
        uint256 id = _mint();

        vm.prank(applicant);
        vm.expectRevert(Ticket.Soulbound.selector);
        ticket.transferFrom(applicant, stranger, id);

        vm.prank(applicant);
        vm.expectRevert(Ticket.Soulbound.selector);
        ticket.safeTransferFrom(applicant, stranger, id);
    }

    function test_IsLiveFalseAfterExpiry() public {
        uint256 id = _mint();
        assertTrue(ticket.isLive(id));

        vm.warp(uint256(expiry) - 1);
        assertTrue(ticket.isLive(id));

        vm.warp(expiry);
        assertFalse(ticket.isLive(id), "a ticket is dead at its expiry second");
        assertFalse(ticket.revoked(id), "expiry is derived from time, not a revocation");
        assertEq(ticket.ownerOf(id), applicant, "an expired ticket is still held, just not live");
    }

    function test_RevokeOnlyByMintingCampaign() public {
        uint256 id = _mint();

        vm.prank(stranger);
        vm.expectRevert(Ticket.NotMinter.selector);
        ticket.revoke(id);

        // A different registered campaign is still not the minting campaign.
        vm.prank(otherCampaign);
        vm.expectRevert(Ticket.NotMinter.selector);
        ticket.revoke(id);

        vm.prank(campaign);
        ticket.revoke(id);
        assertTrue(ticket.revoked(id));
        assertFalse(ticket.isLive(id));

        // Revocation is terminal: it survives a second call and does not unset.
        vm.prank(campaign);
        ticket.revoke(id);
        assertTrue(ticket.revoked(id));
    }

    function test_LiveTicketOfIsScopedToCampaignAndStatus() public {
        assertEq(ticket.liveTicketOf(campaign, applicant), 0, "no ticket means zero");

        uint256 id = _mint();
        assertEq(ticket.liveTicketOf(campaign, applicant), id);
        assertEq(ticket.liveTicketOf(otherCampaign, applicant), 0, "tickets do not cross campaigns");
        assertEq(ticket.liveTicketOf(campaign, stranger), 0);

        vm.prank(campaign);
        ticket.revoke(id);
        assertEq(ticket.liveTicketOf(campaign, applicant), 0, "a revoked ticket is not live");
    }

    function test_LiveTicketOfIsZeroAfterExpiry() public {
        uint256 id = _mint();
        vm.warp(expiry);
        assertEq(ticket.liveTicketOf(campaign, applicant), 0);
        assertEq(ticket.ownerOf(id), applicant);
    }

    function test_MintEmitsTicketMinted() public {
        vm.expectEmit(true, true, true, true);
        emit Ticket.TicketMinted(1, campaign, applicant, expiry);
        vm.prank(campaign);
        ticket.mint(applicant, expiry);
    }

    function test_RevokeEmitsTicketRevoked() public {
        uint256 id = _mint();
        vm.expectEmit(true, true, true, true);
        emit Ticket.TicketRevoked(id, campaign, applicant);
        vm.prank(campaign);
        ticket.revoke(id);
    }
}
