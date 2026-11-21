// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IGameRegistry} from "./interfaces/IGameRegistry.sol";

/// @notice Registers games and their modes, with game/rule versions. v1 seeds Tetris.
contract GameRegistry is IGameRegistry, Ownable {
    struct Game {
        string name;
        uint32 gameVersion;
        uint32 ruleVersion;
        bool active;
    }

    uint256 public gameCount;
    mapping(uint256 => Game) public games;
    mapping(uint256 => uint256) public modeCount;
    mapping(uint256 => mapping(uint256 => string)) public modeNames;
    mapping(uint256 => mapping(uint256 => bool)) public modeActive;

    uint256 public constant TETRIS = 1;
    uint256 public constant CLASSIC = 1;
    uint256 public constant SPRINT = 2;
    uint256 public constant MARATHON = 3;

    event GameRegistered(uint256 indexed gameId, string name, uint32 gameVersion, uint32 ruleVersion);
    event GameVersionUpdated(uint256 indexed gameId, uint32 gameVersion, uint32 ruleVersion);
    event ModeRegistered(uint256 indexed gameId, uint256 indexed modeId, string name);
    event GameActiveSet(uint256 indexed gameId, bool active);
    event ModeActiveSet(uint256 indexed gameId, uint256 indexed modeId, bool active);

    constructor(address owner_) Ownable(owner_) {
        uint256 id = _addGame("Tetris", 1, 1);
        _addMode(id, "Classic");
        _addMode(id, "Sprint");
        _addMode(id, "Marathon");
    }

    function addGame(string calldata name, uint32 gameVersion, uint32 ruleVersion) external onlyOwner returns (uint256) {
        return _addGame(name, gameVersion, ruleVersion);
    }

    function addMode(uint256 gameId, string calldata name) external onlyOwner returns (uint256) {
        require(gameId != 0 && gameId <= gameCount, "unknown game");
        return _addMode(gameId, name);
    }

    function updateVersions(uint256 gameId, uint32 gameVersion, uint32 ruleVersion) external onlyOwner {
        require(gameId != 0 && gameId <= gameCount, "unknown game");
        games[gameId].gameVersion = gameVersion;
        games[gameId].ruleVersion = ruleVersion;
        emit GameVersionUpdated(gameId, gameVersion, ruleVersion);
    }

    function setGameActive(uint256 gameId, bool active) external onlyOwner {
        require(gameId != 0 && gameId <= gameCount, "unknown game");
        games[gameId].active = active;
        emit GameActiveSet(gameId, active);
    }

    function setModeActive(uint256 gameId, uint256 modeId, bool active) external onlyOwner {
        require(modeId != 0 && modeId <= modeCount[gameId], "unknown mode");
        modeActive[gameId][modeId] = active;
        emit ModeActiveSet(gameId, modeId, active);
    }

    function isModeActive(uint256 gameId, uint256 modeId) external view returns (bool) {
        return games[gameId].active && modeActive[gameId][modeId];
    }

    function versions(uint256 gameId) external view returns (uint32, uint32) {
        Game storage g = games[gameId];
        return (g.gameVersion, g.ruleVersion);
    }

    function _addGame(string memory name, uint32 gv, uint32 rv) internal returns (uint256 id) {
        require(bytes(name).length > 0, "empty name");
        id = ++gameCount;
        games[id] = Game(name, gv, rv, true);
        emit GameRegistered(id, name, gv, rv);
    }

    function _addMode(uint256 gameId, string memory name) internal returns (uint256 id) {
        require(bytes(name).length > 0, "empty name");
        id = ++modeCount[gameId];
        modeNames[gameId][id] = name;
        modeActive[gameId][id] = true;
        emit ModeRegistered(gameId, id, name);
    }
}
