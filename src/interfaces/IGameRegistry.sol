// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGameRegistry {
    function isModeActive(uint256 gameId, uint256 modeId) external view returns (bool);
    function versions(uint256 gameId) external view returns (uint32 gameVersion, uint32 ruleVersion);
}
