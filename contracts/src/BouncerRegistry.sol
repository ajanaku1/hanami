// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IERC7857 is IERC165 {
    event MetadataUpdated(uint256 indexed tokenId, bytes32 newHash);
    event UsageAuthorized(uint256 indexed tokenId, address indexed executor);

    function transfer(address from, address to, uint256 tokenId, bytes calldata sealedKey, bytes calldata proof) external;

    function clone(address to, uint256 tokenId, bytes calldata sealedKey, bytes calldata proof)
        external
        returns (uint256 newTokenId);

    function authorizeUsage(uint256 tokenId, address executor, bytes calldata permissions) external;
}

/// @title BouncerRegistry — Hanami's ERC-7857 iNFT
/// @notice Each token is one AI bouncer. Persona + lorebook live off-chain
///         (IPFS in MVP, 0G Storage when SDK catches up); the on-chain URI is opaque.
/// @dev v1 is soulbound: ERC-7857 transfer/clone revert. authorizeUsage gates
///      who may call recordConversation + incrementRep for a given tokenId
///      (this is how a Campaign contract earns rep on the bouncer's behalf).
contract BouncerRegistry is ERC721, IERC7857 {
    struct Bouncer {
        string encryptedPersonaURI;
        string lorebookURI;
        bytes32 oracleConditions;
        uint256 repScore;
    }

    mapping(uint256 => Bouncer) private _bouncers;
    mapping(uint256 => mapping(address => bool)) private _authorized;

    uint256 private _nextId;

    error TransferDisabled();
    error CloneDisabled();
    error NotOwner();
    error NotAuthorized();
    error EmptyURI();

    event BouncerMinted(uint256 indexed tokenId, address indexed owner, string personaURI);
    event ConversationRecorded(uint256 indexed tokenId, bytes32 convoHash);
    event RepIncremented(uint256 indexed tokenId, uint256 newScore);

    constructor() ERC721("Hanami Bouncer", "BNCR") {}

    function mintBouncer(string calldata personaURI, string calldata lorebookURI, bytes32 oracleConditions)
        external
        returns (uint256 tokenId)
    {
        if (bytes(personaURI).length == 0) revert EmptyURI();
        tokenId = ++_nextId;
        _bouncers[tokenId] = Bouncer({
            encryptedPersonaURI: personaURI,
            lorebookURI: lorebookURI,
            oracleConditions: oracleConditions,
            repScore: 0
        });
        _safeMint(msg.sender, tokenId);
        emit BouncerMinted(tokenId, msg.sender, personaURI);
        emit MetadataUpdated(tokenId, keccak256(bytes(personaURI)));
    }

    function bouncerOf(uint256 tokenId) external view returns (Bouncer memory) {
        _requireOwned(tokenId);
        return _bouncers[tokenId];
    }

    function authorizeUsage(uint256 tokenId, address executor, bytes calldata) external override {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();
        _authorized[tokenId][executor] = true;
        emit UsageAuthorized(tokenId, executor);
    }

    function isAuthorized(uint256 tokenId, address executor) external view returns (bool) {
        return _authorized[tokenId][executor];
    }

    function recordConversation(uint256 tokenId, bytes32 convoHash) external {
        if (!_authorized[tokenId][msg.sender]) revert NotAuthorized();
        emit ConversationRecorded(tokenId, convoHash);
    }

    function incrementRep(uint256 tokenId) external returns (uint256 newScore) {
        if (!_authorized[tokenId][msg.sender]) revert NotAuthorized();
        newScore = ++_bouncers[tokenId].repScore;
        emit RepIncremented(tokenId, newScore);
    }

    function transfer(address, address, uint256, bytes calldata, bytes calldata) external pure override {
        revert TransferDisabled();
    }

    function clone(address, uint256, bytes calldata, bytes calldata) external pure override returns (uint256) {
        revert CloneDisabled();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, IERC165) returns (bool) {
        return interfaceId == type(IERC7857).interfaceId || super.supportsInterface(interfaceId);
    }
}
