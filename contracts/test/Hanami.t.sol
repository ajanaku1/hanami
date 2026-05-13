// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BouncerRegistry} from "../src/BouncerRegistry.sol";
import {Campaign, CampaignFactory} from "../src/Campaign.sol";

contract HanamiTest is Test {
    BouncerRegistry registry;
    CampaignFactory factory;

    address project = address(0xA11CE);
    address botSigner = address(0xB07);

    function setUp() public {
        registry = new BouncerRegistry();
        factory = new CampaignFactory(address(registry));
    }

    function _mintBouncer() internal returns (uint256 tokenId) {
        vm.prank(project);
        tokenId = registry.mintBouncer("ipfs://persona", "ipfs://lore", bytes32(uint256(1)));
    }

    function test_MintAssignsOwnerAndStoresURIs() public {
        uint256 id = _mintBouncer();
        assertEq(registry.ownerOf(id), project);
        BouncerRegistry.Bouncer memory b = registry.bouncerOf(id);
        assertEq(b.encryptedPersonaURI, "ipfs://persona");
        assertEq(b.repScore, 0);
    }

    function test_RevertWhen_MintWithEmptyPersona() public {
        vm.prank(project);
        vm.expectRevert(BouncerRegistry.EmptyURI.selector);
        registry.mintBouncer("", "ipfs://lore", bytes32(0));
    }

    function test_TransferIsDisabledOnIERC7857Path() public {
        uint256 id = _mintBouncer();
        vm.prank(project);
        vm.expectRevert(BouncerRegistry.TransferDisabled.selector);
        registry.transfer(project, address(0xCAFE), id, "", "");
    }

    function test_AuthorizeUsageGatesRecordAndIncrement() public {
        uint256 id = _mintBouncer();

        // unauthorized caller is rejected
        vm.expectRevert(BouncerRegistry.NotAuthorized.selector);
        registry.recordConversation(id, keccak256("hi"));

        // owner authorizes the bot signer
        vm.prank(project);
        registry.authorizeUsage(id, botSigner, "");

        // now bot can record + increment
        vm.startPrank(botSigner);
        registry.recordConversation(id, keccak256("hi"));
        uint256 rep = registry.incrementRep(id);
        vm.stopPrank();

        assertEq(rep, 1);
        assertEq(registry.bouncerOf(id).repScore, 1);
    }

    function _createCampaign(uint256 tokenId, uint256 cap) internal returns (Campaign c) {
        vm.prank(project);
        c = Campaign(factory.createCampaign(tokenId, cap));
        // backend signer is what records decisions; project authorizes it on the iNFT
        vm.prank(project);
        registry.authorizeUsage(tokenId, botSigner, "");
    }

    function test_RecordDecisionApprovedAndRejectedPaths() public {
        uint256 id = _mintBouncer();
        Campaign c = _createCampaign(id, 100);

        address thoughtful = address(0x1);
        address loweffort = address(0x2);

        vm.startPrank(botSigner);
        c.recordDecision(thoughtful, true, keccak256("reasoning-approve"), keccak256("att-1"));
        c.recordDecision(loweffort, false, keccak256("reasoning-reject"), keccak256("att-2"));
        vm.stopPrank();

        assertEq(c.approvedCount(), 1);
        assertEq(c.rejectedCount(), 1);
        assertEq(c.approvedAt(0), thoughtful);
    }

    function test_OneAttemptPerWalletEnforced() public {
        uint256 id = _mintBouncer();
        Campaign c = _createCampaign(id, 100);

        vm.startPrank(botSigner);
        c.recordDecision(address(0x1), false, keccak256("r1"), keccak256("a1"));
        vm.expectRevert(Campaign.AlreadyDecided.selector);
        c.recordDecision(address(0x1), true, keccak256("r2"), keccak256("a2"));
        vm.stopPrank();
    }

    function test_UnauthorizedCallerCannotRecord() public {
        uint256 id = _mintBouncer();
        vm.prank(project);
        Campaign c = Campaign(factory.createCampaign(id, 100));
        // project did NOT authorize botSigner this time
        vm.prank(botSigner);
        vm.expectRevert(Campaign.CallerNotBouncerOperator.selector);
        c.recordDecision(address(0x1), true, bytes32(0), bytes32(0));
    }

    function test_WlSizeCapBlocksFurtherApprovals() public {
        uint256 id = _mintBouncer();
        Campaign c = _createCampaign(id, 2);

        vm.startPrank(botSigner);
        c.recordDecision(address(0x1), true, bytes32(0), bytes32(0));
        c.recordDecision(address(0x2), true, bytes32(0), bytes32(0));
        vm.expectRevert(Campaign.CapReached.selector);
        c.recordDecision(address(0x3), true, bytes32(0), bytes32(0));
        // rejections beyond cap still allowed
        c.recordDecision(address(0x3), false, bytes32(0), bytes32(0));
        vm.stopPrank();
    }

    function test_FinalizeMerkleRootGatedByOwnerAndImmutableAfter() public {
        uint256 id = _mintBouncer();
        Campaign c = _createCampaign(id, 100);

        // Random caller cannot finalize
        vm.expectRevert(Campaign.NotOwner.selector);
        c.finalizeMerkleRoot(bytes32(uint256(0xdead)));

        // Empty root rejected
        vm.prank(project);
        vm.expectRevert(Campaign.EmptyRoot.selector);
        c.finalizeMerkleRoot(bytes32(0));

        // Happy path
        vm.prank(project);
        c.finalizeMerkleRoot(bytes32(uint256(0xdead)));
        assertTrue(c.finalized());
        assertEq(c.merkleRoot(), bytes32(uint256(0xdead)));

        // Cannot record after finalization
        vm.prank(botSigner);
        vm.expectRevert(Campaign.AlreadyFinalized.selector);
        c.recordDecision(address(0x9), true, bytes32(0), bytes32(0));

        // Cannot re-finalize
        vm.prank(project);
        vm.expectRevert(Campaign.AlreadyFinalized.selector);
        c.finalizeMerkleRoot(bytes32(uint256(0xbeef)));
    }

    function test_RevertWhen_NonOwnerCreatesCampaignForOthersBouncer() public {
        uint256 id = _mintBouncer();
        vm.prank(address(0xDEAD));
        vm.expectRevert(CampaignFactory.NotBouncerOwner.selector);
        factory.createCampaign(id, 10);
    }
}
