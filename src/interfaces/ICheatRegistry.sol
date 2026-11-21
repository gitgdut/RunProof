// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICheatRegistry {
    function isRegistered(uint256 cheatId) external view returns (bool);
}
