// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IChallengeReasonRegistry {
    function isRegistered(uint256 reasonId) external view returns (bool);
}
