// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICategoryRegistry {
    enum RankingDirection {
        None,
        HigherIsBetter,
        LowerIsBetter
    }

    function isDivisionActive(uint256 categoryId, uint256 divisionId) external view returns (bool);

    function rankingConfig(uint256 categoryId)
        external
        view
        returns (RankingDirection direction, uint8 decimals, uint32 ruleVersion, uint256 baseStake);
}
