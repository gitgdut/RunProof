// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IRunProofCore} from "./interfaces/IRunProofCore.sol";

/// @notice Certificate NFT for verified records. tokenId == recordId.
/// The verification status is NEVER stored here: it is read live from RunProofCore, so a revoked
/// record stays minted (history preserved) but shows "Revoked".
contract RecordNFT is ERC721 {
    using Strings for uint256;

    IRunProofCore public immutable core;

    event NFTMinted(
        uint256 indexed recordId, address indexed player, uint256 indexed gameId, uint256 score, bytes32 evidenceHash
    );

    constructor(IRunProofCore core_) ERC721("RunProof Record", "RUNPROOF") {
        core = core_;
    }

    /// @notice Anyone may trigger the mint for a Verified record; the token always goes to the player.
    function mint(uint256 recordId) external returns (uint256) {
        (address player, uint256 gameId,, uint256 score, bytes32 evidenceHash, IRunProofCore.RecordStatus status) =
            core.recordSummary(recordId);
        require(status == IRunProofCore.RecordStatus.Verified, "record not verified");
        _mint(player, recordId); // reverts if already minted
        emit NFTMinted(recordId, player, gameId, score, evidenceHash);
        return recordId;
    }

    function verificationStatus(uint256 tokenId) public view returns (IRunProofCore.RecordStatus) {
        _requireOwned(tokenId);
        (,,,,, IRunProofCore.RecordStatus status) = core.recordSummary(tokenId);
        return status;
    }

    function isRevoked(uint256 tokenId) external view returns (bool) {
        return verificationStatus(tokenId) == IRunProofCore.RecordStatus.Revoked;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        (address player, uint256 gameId, uint256 mode, uint256 score, bytes32 evidenceHash, IRunProofCore.RecordStatus st) =
            core.recordSummary(tokenId);
        string memory status = st == IRunProofCore.RecordStatus.Verified
            ? "Verified"
            : st == IRunProofCore.RecordStatus.Revoked ? "Revoked" : "Provisional";
        bytes memory json = abi.encodePacked(
            '{"name":"RunProof Record #', tokenId.toString(),
            '","description":"On-chain certified game record. Status is read live from RunProofCore.",',
            '"attributes":[{"trait_type":"Record ID","value":"', tokenId.toString(),
            '"},{"trait_type":"Player","value":"', Strings.toHexString(player),
            '"},{"trait_type":"Game ID","value":"', gameId.toString(),
            '"},{"trait_type":"Mode","value":"', mode.toString(),
            '"},{"trait_type":"Score","value":"', score.toString(),
            '"},{"trait_type":"Evidence Hash","value":"', Strings.toHexString(uint256(evidenceHash), 32),
            '"},{"trait_type":"Verification Status","value":"', status, '"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }
}
