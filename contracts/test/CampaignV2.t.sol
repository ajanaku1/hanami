// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BouncerRegistry} from "../src/BouncerRegistry.sol";
import {CampaignV2, CampaignFactoryV2} from "../src/CampaignV2.sol";
import {Ticket} from "../src/Ticket.sol";

contract CampaignV2Test is Test {
    BouncerRegistry registry;
    CampaignFactoryV2 factory;
    Ticket ticket;

    address project = address(0xA11CE);
    address botSigner = address(0xB07);
    address applicant = address(0x1);
    address other = address(0x2);

    uint64 closeAt;
    uint64 ticketExpiry;
    bytes32 constant NULLIFIER = keccak256("world-nullifier");

    function setUp() public {
        vm.warp(1_757_000_000);
        registry = new BouncerRegistry();
        factory = new CampaignFactoryV2(address(registry));
        ticket = Ticket(factory.ticket());
        closeAt = uint64(block.timestamp + 7 days);
        ticketExpiry = uint64(block.timestamp + 30 days);
    }

    function _bouncer() internal returns (uint256 tokenId) {
        vm.prank(project);
        tokenId = registry.mintBouncer("ipfs://persona", "ipfs://lore", "ipfs://image", bytes32(uint256(1)));
    }

    function _campaign(uint256 cap) internal returns (CampaignV2 c) {
        uint256 tokenId = _bouncer();
        vm.prank(project);
        c = CampaignV2(factory.createCampaign(tokenId, cap, closeAt, ticketExpiry));
        vm.prank(project);
        registry.authorizeUsage(tokenId, botSigner, "");
    }

    function _approve(CampaignV2 c, address who, bytes32 nullifier) internal {
        vm.prank(botSigner);
        c.recordDecision(who, true, keccak256("reasoning"), keccak256("attestation"), nullifier);
    }

    function test_ApproveMintsExactlyOneTicketAndRejectMintsNone() public {
        CampaignV2 c = _campaign(100);

        _approve(c, applicant, NULLIFIER);
        assertEq(ticket.balanceOf(applicant), 1);
        uint256 id = ticket.liveTicketOf(address(c), applicant);
        assertGt(id, 0);
        assertEq(ticket.expiresAt(id), ticketExpiry, "the ticket carries the campaign's expiry");

        vm.prank(botSigner);
        c.recordDecision(other, false, keccak256("reasoning"), keccak256("attestation"), keccak256("n2"));
        assertEq(ticket.balanceOf(other), 0, "a rejection issues nothing");
        assertEq(c.approvedCount(), 1);
        assertEq(c.rejectedCount(), 1);
    }

    function test_DecisionRecordCarriesAttestationNullifierAndTicket() public {
        CampaignV2 c = _campaign(100);

        vm.expectEmit(true, false, false, true);
        emit CampaignV2.DecisionRecordedV2(
            applicant, true, keccak256("reasoning"), keccak256("attestation"), NULLIFIER, 1
        );
        _approve(c, applicant, NULLIFIER);

        (
            CampaignV2.DecisionStatus status,
            bytes32 reasoningHash,
            bytes32 attestationHash,
            bytes32 nullifierHash,
            uint256 ticketId,
            uint64 timestamp
        ) = c.decisions(applicant);
        assertEq(uint8(status), uint8(CampaignV2.DecisionStatus.Approved));
        assertEq(reasoningHash, keccak256("reasoning"));
        assertEq(attestationHash, keccak256("attestation"));
        assertEq(nullifierHash, NULLIFIER, "the proof-of-human travels with the decision");
        assertEq(ticketId, 1);
        assertEq(timestamp, uint64(block.timestamp));
    }

    function test_RevertWhen_NullifierIsZero() public {
        CampaignV2 c = _campaign(100);
        vm.prank(botSigner);
        vm.expectRevert(CampaignV2.ZeroNullifier.selector);
        c.recordDecision(applicant, true, bytes32(0), bytes32(0), bytes32(0));
    }

    function test_RevertWhen_CampaignClosed() public {
        CampaignV2 c = _campaign(100);

        vm.warp(uint256(closeAt) - 1);
        _approve(c, applicant, NULLIFIER);

        vm.warp(closeAt);
        vm.prank(botSigner);
        vm.expectRevert(CampaignV2.CampaignClosed.selector);
        c.recordDecision(other, false, bytes32(0), bytes32(0), keccak256("n2"));
    }

    function test_CapReachedStillAllowsRejections() public {
        CampaignV2 c = _campaign(1);

        _approve(c, applicant, NULLIFIER);

        vm.startPrank(botSigner);
        vm.expectRevert(CampaignV2.CapReached.selector);
        c.recordDecision(other, true, bytes32(0), bytes32(0), keccak256("n2"));
        c.recordDecision(other, false, bytes32(0), bytes32(0), keccak256("n2"));
        vm.stopPrank();
        assertEq(c.rejectedCount(), 1);
    }

    function test_OneDecisionPerApplicant() public {
        CampaignV2 c = _campaign(100);
        _approve(c, applicant, NULLIFIER);

        vm.prank(botSigner);
        vm.expectRevert(CampaignV2.AlreadyDecided.selector);
        c.recordDecision(applicant, false, bytes32(0), bytes32(0), NULLIFIER);
    }

    function test_UnauthorizedCallerCannotRecord() public {
        uint256 tokenId = _bouncer();
        vm.prank(project);
        CampaignV2 c = CampaignV2(factory.createCampaign(tokenId, 100, closeAt, ticketExpiry));

        vm.prank(botSigner);
        vm.expectRevert(CampaignV2.CallerNotBouncerOperator.selector);
        c.recordDecision(applicant, true, bytes32(0), bytes32(0), NULLIFIER);
    }

    function test_RevokeTicketIsOwnerOnly() public {
        CampaignV2 c = _campaign(100);
        _approve(c, applicant, NULLIFIER);
        uint256 id = ticket.liveTicketOf(address(c), applicant);

        vm.prank(botSigner);
        vm.expectRevert(CampaignV2.NotOwner.selector);
        c.revokeTicket(id);

        vm.prank(project);
        c.revokeTicket(id);
        assertTrue(ticket.revoked(id));
    }

    function test_RevertWhen_RevokingATicketFromAnotherCampaign() public {
        CampaignV2 a = _campaign(100);
        CampaignV2 b = _campaign(100);
        _approve(a, applicant, NULLIFIER);
        uint256 id = ticket.liveTicketOf(address(a), applicant);

        vm.prank(project);
        vm.expectRevert(Ticket.NotMinter.selector);
        b.revokeTicket(id);
    }

    function test_HasLiveTicketTransitions() public {
        CampaignV2 c = _campaign(100);
        assertFalse(c.hasLiveTicket(applicant), "none before a decision");

        _approve(c, applicant, NULLIFIER);
        assertTrue(c.hasLiveTicket(applicant), "live after approval");

        uint256 id = ticket.liveTicketOf(address(c), applicant);
        vm.prank(project);
        c.revokeTicket(id);
        assertFalse(c.hasLiveTicket(applicant), "not live once revoked");
    }

    function test_HasLiveTicketFalseAfterExpiry() public {
        CampaignV2 c = _campaign(100);
        _approve(c, applicant, NULLIFIER);

        vm.warp(ticketExpiry);
        assertFalse(c.hasLiveTicket(applicant));
    }

    function test_FactoryDefaultsTicketExpiryToCloseAt() public {
        uint256 tokenId = _bouncer();
        vm.prank(project);
        CampaignV2 c = CampaignV2(factory.createCampaign(tokenId, 100, closeAt, 0));
        assertEq(c.ticketExpiry(), closeAt);
        assertEq(c.closeAt(), closeAt);
    }

    function test_RevertWhen_ScheduleIsInThePast() public {
        uint256 tokenId = _bouncer();

        vm.prank(project);
        vm.expectRevert(CampaignFactoryV2.BadSchedule.selector);
        factory.createCampaign(tokenId, 100, uint64(block.timestamp), ticketExpiry);

        vm.prank(project);
        vm.expectRevert(CampaignFactoryV2.BadSchedule.selector);
        factory.createCampaign(tokenId, 100, closeAt, uint64(block.timestamp - 1));
    }

    function test_RevertWhen_NonOwnerCreatesCampaign() public {
        uint256 tokenId = _bouncer();
        vm.prank(other);
        vm.expectRevert(CampaignFactoryV2.NotBouncerOwner.selector);
        factory.createCampaign(tokenId, 100, closeAt, ticketExpiry);
    }

    function test_MerkleFinalizeStillWorks() public {
        CampaignV2 c = _campaign(100);
        _approve(c, applicant, NULLIFIER);

        vm.prank(project);
        c.finalizeMerkleRoot(keccak256("root"));
        assertEq(c.merkleRoot(), keccak256("root"));
        assertTrue(c.finalized());

        vm.prank(botSigner);
        vm.expectRevert(CampaignV2.AlreadyFinalized.selector);
        c.recordDecision(other, true, bytes32(0), bytes32(0), keccak256("n2"));
    }
}
