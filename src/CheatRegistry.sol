// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ICheatRegistry} from "./interfaces/ICheatRegistry.sol";

/// @notice Registry of cheat types (C001..) plus community proposals for new ones.
/// Proposal voting is stake-weighted (1 address = 1 vote, linear power, capped stake).
/// Voter stakes are never slashed here; they are returned in full after finalization.
contract CheatRegistry is ICheatRegistry, Ownable, ReentrancyGuard {
    enum ProposalStatus { None, Voting, Approved, Rejected, Inconclusive }

    struct Cheat {
        string code;
        string name;
        string description;
        address discoverer;
        uint64 registeredAt;
        bool registered;
    }

    struct Proposal {
        address proposer;
        string name;
        string description;
        string evidenceURI;
        uint256 bond;
        uint64 endTime;
        uint256 forPower;
        uint256 againstPower;
        uint32 voters;
        ProposalStatus status;
        uint256 cheatId;
    }

    struct Vote {
        uint256 stake;
        bool support;
        bool claimed;
    }

    uint256 public constant POWER_UNIT = 1e15;

    uint256 public cheatCount;
    uint256 public proposalCount;
    mapping(uint256 => Cheat) private _cheats;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => Vote)) public votes;
    mapping(bytes32 => bool) public nameTaken;
    mapping(address => uint256) public claimable;

    /// funds for proposer rewards (donations + forfeited bonds)
    uint256 public rewardBalance;

    uint256 public proposalBond = 0.1 ether;
    uint256 public proposerReward = 0.1 ether;
    uint64 public votingPeriod = 3 days;
    uint256 public minVoteStake = 0.05 ether;
    uint256 public maxVoteStake = 5 ether;
    uint256 public quorumPower = 300;
    uint32 public minVoters = 3;
    uint16 public approvalBps = 7500;

    event CheatRegistered(uint256 indexed cheatId, string code, string name, address indexed discoverer);
    event CheatProposed(uint256 indexed proposalId, address indexed proposer, string name, uint256 bond, uint64 endTime);
    event CheatProposalVoted(uint256 indexed proposalId, address indexed voter, bool support, uint256 stake, uint256 power);
    event CheatProposalFinalized(uint256 indexed proposalId, ProposalStatus status, uint256 cheatId);
    event DiscovererRewarded(uint256 indexed proposalId, uint256 indexed cheatId, address indexed proposer, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event RewardFunded(address indexed from, uint256 amount);

    constructor(address owner_) Ownable(owner_) {
        _register("Automated Input", "Bots, macros or scripts generating inputs", address(0));
        _register("RNG Manipulation", "Manipulating or predicting the random piece generator", address(0));
        _register("Memory Modification", "Editing process memory to change score or state", address(0));
        _register("Replay Injection", "Injecting or splicing pre-recorded replays as live play", address(0));
        _register("Modified Game Files", "Running modified binaries or assets that alter gameplay", address(0));
    }

    // ---------------- views ----------------

    function isRegistered(uint256 cheatId) external view returns (bool) {
        return _cheats[cheatId].registered;
    }

    function getCheat(uint256 cheatId) external view returns (Cheat memory) {
        require(_cheats[cheatId].registered, "unknown cheat");
        return _cheats[cheatId];
    }

    function votingPower(uint256 stake) public pure returns (uint256) {
        return stake / POWER_UNIT;
    }

    // ---------------- admin ----------------

    function setParams(
        uint256 bond,
        uint256 reward,
        uint64 period,
        uint256 minStake,
        uint256 maxStake,
        uint256 quorum,
        uint32 minVoters_,
        uint16 approval
    ) external onlyOwner {
        require(minStake >= POWER_UNIT && maxStake >= minStake, "bad stake range");
        require(approval > 5000 && approval <= 10000, "bad approval");
        require(period > 0 && minVoters_ > 0, "bad params");
        proposalBond = bond;
        proposerReward = reward;
        votingPeriod = period;
        minVoteStake = minStake;
        maxVoteStake = maxStake;
        quorumPower = quorum;
        minVoters = minVoters_;
        approvalBps = approval;
    }

    /// @notice Owner-curated registration (used for fast additions); community path is proposeCheat.
    function registerCheat(string calldata name, string calldata description) external onlyOwner returns (uint256) {
        bytes32 h = keccak256(bytes(name));
        require(!nameTaken[h], "name taken");
        nameTaken[h] = true;
        return _register(name, description, address(0));
    }

    function fundRewards() external payable {
        rewardBalance += msg.value;
        emit RewardFunded(msg.sender, msg.value);
    }

    // ---------------- proposals ----------------

    function proposeCheat(string calldata name, string calldata description, string calldata evidenceURI)
        external
        payable
        nonReentrant
        returns (uint256 id)
    {
        require(bytes(name).length > 0 && bytes(description).length > 0, "empty text");
        require(msg.value >= proposalBond, "bond too low");
        bytes32 h = keccak256(bytes(name));
        require(!nameTaken[h], "name taken");
        nameTaken[h] = true;

        id = ++proposalCount;
        Proposal storage p = proposals[id];
        p.proposer = msg.sender;
        p.name = name;
        p.description = description;
        p.evidenceURI = evidenceURI;
        p.bond = proposalBond;
        p.endTime = uint64(block.timestamp) + votingPeriod;
        p.status = ProposalStatus.Voting;
        if (msg.value > proposalBond) claimable[msg.sender] += msg.value - proposalBond;
        emit CheatProposed(id, msg.sender, name, proposalBond, p.endTime);
    }

    function voteOnProposal(uint256 id, bool support) external payable nonReentrant {
        Proposal storage p = proposals[id];
        require(p.status == ProposalStatus.Voting && block.timestamp < p.endTime, "not votable");
        require(msg.sender != p.proposer, "proposer cannot vote");
        require(msg.value >= minVoteStake && msg.value <= maxVoteStake, "stake out of range");
        Vote storage v = votes[id][msg.sender];
        require(v.stake == 0, "already voted");
        v.stake = msg.value;
        v.support = support;
        uint256 power = votingPower(msg.value);
        if (support) p.forPower += power;
        else p.againstPower += power;
        p.voters++;
        emit CheatProposalVoted(id, msg.sender, support, msg.value, power);
    }

    function finalizeProposal(uint256 id) external nonReentrant {
        Proposal storage p = proposals[id];
        require(p.status == ProposalStatus.Voting, "not voting");
        require(block.timestamp >= p.endTime, "voting open");
        uint256 total = p.forPower + p.againstPower;
        bytes32 h = keccak256(bytes(p.name));

        if (total < quorumPower || p.voters < minVoters) {
            p.status = ProposalStatus.Inconclusive;
            nameTaken[h] = false;
            claimable[p.proposer] += p.bond;
        } else if (p.forPower * 10000 >= uint256(approvalBps) * total) {
            p.status = ProposalStatus.Approved;
            uint256 cheatId = _register(p.name, p.description, p.proposer);
            p.cheatId = cheatId;
            claimable[p.proposer] += p.bond;
            uint256 reward = proposerReward > rewardBalance ? rewardBalance : proposerReward;
            if (reward > 0) {
                rewardBalance -= reward;
                claimable[p.proposer] += reward;
                emit DiscovererRewarded(id, cheatId, p.proposer, reward);
            }
        } else {
            p.status = ProposalStatus.Rejected;
            nameTaken[h] = false;
            rewardBalance += p.bond; // bond forfeited
        }
        emit CheatProposalFinalized(id, p.status, p.cheatId);
    }

    /// @notice Return a voter's stake after the proposal is finalized (stake is never slashed here).
    function claimVoteStake(uint256 id) external nonReentrant {
        require(proposals[id].status > ProposalStatus.Voting, "not finalized");
        Vote storage v = votes[id][msg.sender];
        require(v.stake > 0 && !v.claimed, "nothing to claim");
        v.claimed = true;
        claimable[msg.sender] += v.stake;
    }

    function withdraw() external nonReentrant {
        uint256 amt = claimable[msg.sender];
        require(amt > 0, "nothing to withdraw");
        claimable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amt}("");
        require(ok, "transfer failed");
        emit Withdrawn(msg.sender, amt);
    }

    // ---------------- internal ----------------

    function _register(string memory name, string memory description, address discoverer) internal returns (uint256 id) {
        id = ++cheatCount;
        string memory num = Strings.toString(id);
        string memory code = id < 10
            ? string.concat("C00", num)
            : id < 100 ? string.concat("C0", num) : string.concat("C", num);
        _cheats[id] = Cheat(code, name, description, discoverer, uint64(block.timestamp), true);
        nameTaken[keccak256(bytes(name))] = true;
        emit CheatRegistered(id, code, name, discoverer);
    }
}
