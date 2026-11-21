// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICategoryRegistry} from "./interfaces/ICategoryRegistry.sol";

/// @notice Registry for any measurable achievement category and its divisions.
contract CategoryRegistry is ICategoryRegistry, Ownable {
    struct Category {
        string name;
        string descriptionURI;
        string unit;
        uint8 decimals;
        RankingDirection direction;
        uint32 ruleVersion;
        uint256 baseStake;
        bool active;
    }

    uint256 public categoryCount;
    mapping(uint256 => Category) private _categories;
    mapping(uint256 => uint256) public divisionCount;
    mapping(uint256 => mapping(uint256 => string)) public divisionNames;
    mapping(uint256 => mapping(uint256 => bool)) public divisionActive;

    event CategoryCreated(
        uint256 indexed categoryId,
        string name,
        string unit,
        uint8 decimals,
        RankingDirection direction,
        uint32 ruleVersion,
        uint256 baseStake,
        string descriptionURI
    );
    event CategoryUpdated(
        uint256 indexed categoryId,
        string name,
        string unit,
        uint8 decimals,
        RankingDirection direction,
        uint32 ruleVersion,
        uint256 baseStake,
        string descriptionURI
    );
    event CategoryActiveSet(uint256 indexed categoryId, bool active);
    event DivisionCreated(uint256 indexed categoryId, uint256 indexed divisionId, string name);
    event DivisionActiveSet(uint256 indexed categoryId, uint256 indexed divisionId, bool active);

    constructor(address owner_) Ownable(owner_) {}

    function getCategory(uint256 categoryId) external view returns (Category memory) {
        require(categoryId != 0 && categoryId <= categoryCount, "unknown category");
        return _categories[categoryId];
    }

    function createCategory(
        string calldata name,
        string calldata descriptionURI,
        string calldata unit,
        uint8 decimals,
        RankingDirection direction,
        uint32 ruleVersion,
        uint256 baseStake
    ) external onlyOwner returns (uint256 categoryId) {
        _validateCategory(name, unit, direction, ruleVersion, baseStake);
        categoryId = ++categoryCount;
        _categories[categoryId] = Category({
            name: name,
            descriptionURI: descriptionURI,
            unit: unit,
            decimals: decimals,
            direction: direction,
            ruleVersion: ruleVersion,
            baseStake: baseStake,
            active: true
        });
        emit CategoryCreated(categoryId, name, unit, decimals, direction, ruleVersion, baseStake, descriptionURI);
    }

    function updateCategory(
        uint256 categoryId,
        string calldata name,
        string calldata descriptionURI,
        string calldata unit,
        uint8 decimals,
        RankingDirection direction,
        uint32 ruleVersion,
        uint256 baseStake
    ) external onlyOwner {
        require(categoryId != 0 && categoryId <= categoryCount, "unknown category");
        _validateCategory(name, unit, direction, ruleVersion, baseStake);
        Category storage current = _categories[categoryId];
        require(
            current.direction == direction && current.decimals == decimals
                && keccak256(bytes(current.unit)) == keccak256(bytes(unit)),
            "ranking immutable"
        );
        bool active = current.active;
        _categories[categoryId] = Category({
            name: name,
            descriptionURI: descriptionURI,
            unit: unit,
            decimals: decimals,
            direction: direction,
            ruleVersion: ruleVersion,
            baseStake: baseStake,
            active: active
        });
        emit CategoryUpdated(categoryId, name, unit, decimals, direction, ruleVersion, baseStake, descriptionURI);
    }

    function addDivision(uint256 categoryId, string calldata name) external onlyOwner returns (uint256 divisionId) {
        require(categoryId != 0 && categoryId <= categoryCount, "unknown category");
        require(bytes(name).length > 0, "empty name");
        divisionId = ++divisionCount[categoryId];
        divisionNames[categoryId][divisionId] = name;
        divisionActive[categoryId][divisionId] = true;
        emit DivisionCreated(categoryId, divisionId, name);
    }

    function setCategoryActive(uint256 categoryId, bool active) external onlyOwner {
        require(categoryId != 0 && categoryId <= categoryCount, "unknown category");
        _categories[categoryId].active = active;
        emit CategoryActiveSet(categoryId, active);
    }

    function setDivisionActive(uint256 categoryId, uint256 divisionId, bool active) external onlyOwner {
        require(divisionId != 0 && divisionId <= divisionCount[categoryId], "unknown division");
        divisionActive[categoryId][divisionId] = active;
        emit DivisionActiveSet(categoryId, divisionId, active);
    }

    function isDivisionActive(uint256 categoryId, uint256 divisionId) external view returns (bool) {
        return _categories[categoryId].active && divisionActive[categoryId][divisionId];
    }

    function rankingConfig(uint256 categoryId)
        external
        view
        returns (RankingDirection direction, uint8 decimals, uint32 ruleVersion, uint256 baseStake)
    {
        Category storage c = _categories[categoryId];
        require(c.direction != RankingDirection.None, "unknown category");
        return (c.direction, c.decimals, c.ruleVersion, c.baseStake);
    }

    function _validateCategory(
        string calldata name,
        string calldata unit,
        RankingDirection direction,
        uint32 ruleVersion,
        uint256 baseStake
    ) private pure {
        require(bytes(name).length > 0, "empty name");
        require(bytes(unit).length > 0, "empty unit");
        require(direction != RankingDirection.None, "bad direction");
        require(ruleVersion > 0, "zero version");
        require(baseStake > 0, "zero stake");
    }
}
