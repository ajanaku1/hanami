// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Reference consumer contract — what a project's mint on Base/Ethereum/etc. would look like.
/// Takes the Merkle root exported by a Hanami Campaign and gates `mint()` on a proof.
contract WhitelistMint {
    bytes32 public immutable merkleRoot;
    mapping(address => bool) public hasMinted;

    error AlreadyMinted();
    error NotApproved();

    constructor(bytes32 root) {
        merkleRoot = root;
    }

    function mint(bytes32[] calldata proof) external {
        if (hasMinted[msg.sender]) revert AlreadyMinted();
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert NotApproved();
        hasMinted[msg.sender] = true;
    }
}

/// @notice Proves that the Merkle root Hanami exports drops into a vanilla mint contract on any EVM chain.
/// Runs locally (no fork needed) since Merkle math is chain-agnostic. Same root would work on Base Sepolia,
/// Ethereum mainnet, anywhere.
contract MerkleConsumerTest is Test {
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant CHARLIE = address(0xC4A1E);
    address constant DENIED = address(0xDEAD);

    function _leaf(address a) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(a));
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    /// Builds a sorted-pair Merkle tree over [ALICE, BOB, CHARLIE] and returns (root, proofs).
    /// Mirrors the algorithm in merkletreejs which Hanami's admin /export endpoint uses.
    function _buildTree() internal pure returns (bytes32 root, bytes32[] memory aliceProof, bytes32[] memory bobProof, bytes32[] memory charlieProof) {
        bytes32 lA = _leaf(ALICE);
        bytes32 lB = _leaf(BOB);
        bytes32 lC = _leaf(CHARLIE);

        // sort leaves for canonical tree (matches merkletreejs sortPairs)
        bytes32 h_AB = _hashPair(lA, lB);
        root = _hashPair(h_AB, lC);

        aliceProof = new bytes32[](2);
        aliceProof[0] = lB;
        aliceProof[1] = lC;

        bobProof = new bytes32[](2);
        bobProof[0] = lA;
        bobProof[1] = lC;

        charlieProof = new bytes32[](1);
        charlieProof[0] = h_AB;
    }

    function test_ApprovedAddressCanMint() public {
        (bytes32 root, bytes32[] memory aliceProof,,) = _buildTree();
        WhitelistMint mint = new WhitelistMint(root);
        vm.prank(ALICE);
        mint.mint(aliceProof);
        assertTrue(mint.hasMinted(ALICE));
    }

    function test_AllApprovedCanMint() public {
        (bytes32 root, bytes32[] memory aP, bytes32[] memory bP, bytes32[] memory cP) = _buildTree();
        WhitelistMint mint = new WhitelistMint(root);

        vm.prank(ALICE); mint.mint(aP);
        vm.prank(BOB); mint.mint(bP);
        vm.prank(CHARLIE); mint.mint(cP);

        assertTrue(mint.hasMinted(ALICE));
        assertTrue(mint.hasMinted(BOB));
        assertTrue(mint.hasMinted(CHARLIE));
    }

    function test_RevertWhen_RejectedAddressTriesAnyProof() public {
        (bytes32 root, bytes32[] memory aliceProof,,) = _buildTree();
        WhitelistMint mint = new WhitelistMint(root);
        vm.prank(DENIED);
        vm.expectRevert(WhitelistMint.NotApproved.selector);
        mint.mint(aliceProof);
    }

    function test_RevertWhen_ApprovedAddressUsesWrongProof() public {
        (bytes32 root, , bytes32[] memory bobProof,) = _buildTree();
        WhitelistMint mint = new WhitelistMint(root);
        // Alice tries to use Bob's proof — won't verify since leaf is Alice's address.
        vm.prank(ALICE);
        vm.expectRevert(WhitelistMint.NotApproved.selector);
        mint.mint(bobProof);
    }

    function test_RevertWhen_ApprovedAddressMintsTwice() public {
        (bytes32 root, bytes32[] memory aliceProof,,) = _buildTree();
        WhitelistMint mint = new WhitelistMint(root);
        vm.startPrank(ALICE);
        mint.mint(aliceProof);
        vm.expectRevert(WhitelistMint.AlreadyMinted.selector);
        mint.mint(aliceProof);
        vm.stopPrank();
    }
}
