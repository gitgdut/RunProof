// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRunProofCore {
    enum RecordStatus {
        None,
        Provisional,
        Verified,
        Revoked
    }

    function recordSummary(uint256 recordId)
        external
        view
        returns (
            address player,
            uint256 categoryId,
            uint256 divisionId,
            uint256 value,
            bytes32 evidenceHash,
            RecordStatus status
        );
}
