// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IChallengeReasonRegistry} from "./interfaces/IChallengeReasonRegistry.sol";

/// @notice Generic challenge reasons (R001...) with owner and community registration paths.
contract ChallengeReasonRegistry is IChallengeReasonRegistry, Ownable, ReentrancyGuard {
    enum ProposalStatus {
        None,
        Voting,
        Approved,
        Rejected,
        Inconclusive
    }

    struct Reason {
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
        uint256 reasonId;
    }

    struct Vote {
        uint256 stake;
        bool support;
        bool claimed;
    }

    uint256 public constant POWER_UNIT = 1e15;
    uint256 public reasonCount;
    uint256 public proposalCount;
    mapping(uint256 => Reason) private _reasons;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => Vote)) public votes;
    mapping(bytes32 => bool) public nameTaken;
    mapping(address => uint256) public claimable;
    uint256 public rewardBalance;

    uint256 public proposalBond = 0.1 ether;
    uint256 public proposerReward = 0.1 ether;
    uint64 public votingPeriod = 3 days;
    uint256 public minVoteStake = 0.05 ether;
    uint256 public maxVoteStake = 5 ether;
    uint256 public quorumPower = 300;
    uint32 public minVoters = 3;
    uint16 public approvalBps = 7500;

    event ReasonRegistered(uint256 indexed reasonId, string code, string name, address indexed discoverer);
    event ReasonProposed(
        uint256 indexed proposalId, address indexed proposer, string name, uint256 bond, uint64 endTime
    );
    event ReasonProposalVoted(
        uint256 indexed proposalId, address indexed voter, bool support, uint256 stake, uint256 power
    );
    event ReasonProposalFinalized(uint256 indexed proposalId, ProposalStatus status, uint256 reasonId);
    event DiscovererRewarded(
        uint256 indexed proposalId, uint256 indexed reasonId, address indexed proposer, uint256 amount
    );
    event Withdrawn(address indexed account, uint256 amount);
    event RewardFunded(address indexed from, uint256 amount);
    event ParamsUpdated();

    constructor(address owner_) Ownable(owner_) {
        _register("Fabricated Evidence", "Evidence was fabricated or materially altered", address(0));
        _register("Rule Violation", "The submission does not comply with the category rules", address(0));
        _register("Identity Mismatch", "The submitter is not the person represented by the evidence", address(0));
        _register("Duplicate Submission", "The same achievement was submitted more than once", address(0));
        _register("Invalid Measurement", "The measurement method or device is not acceptable", address(0));
    }

    function isRegistered(uint256 reasonId) external view returns (bool) {
        return _reasons[reasonId].registered;
    }

    function getReason(uint256 reasonId) external view returns (Reason memory) {
        require(_reasons[reasonId].registered, "unknown reason");
        return _reasons[reasonId];
    }

    function votingPower(uint256 stake) public pure returns (uint256) {
        return stake / POWER_UNIT;
    }

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
        emit ParamsUpdated();
    }

    function registerReason(string calldata name, string calldata description) external onlyOwner returns (uint256) {
        bytes32 h = keccak256(bytes(name));
        require(!nameTaken[h], "name taken");
        nameTaken[h] = true;
        return _register(name, description, address(0));
    }

    function fundRewards() external payable {
        rewardBalance += msg.value;
        emit RewardFunded(msg.sender, msg.value);
    }

    function proposeReason(string calldata name, string calldata description, string calldata evidenceURI)
        external
        payable
        nonReentrant
        returns (uint256 proposalId)
    {
        require(bytes(name).length > 0 && bytes(description).length > 0, "empty text");
        require(msg.value >= proposalBond, "bond too low");
        bytes32 h = keccak256(bytes(name));
        require(!nameTaken[h], "name taken");
        nameTaken[h] = true;

        proposalId = ++proposalCount;
        Proposal storage p = proposals[proposalId];
        p.proposer = msg.sender;
        p.name = name;
        p.description = description;
        p.evidenceURI = evidenceURI;
        p.bond = proposalBond;
        p.endTime = uint64(block.timestamp) + votingPeriod;
        p.status = ProposalStatus.Voting;
        if (msg.value > proposalBond) claimable[msg.sender] += msg.value - proposalBond;
        emit ReasonProposed(proposalId, msg.sender, name, proposalBond, p.endTime);
    }

    function voteOnProposal(uint256 proposalId, bool support) external payable nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.Voting && block.timestamp < p.endTime, "not votable");
        require(msg.sender != p.proposer, "proposer cannot vote");
        require(msg.value >= minVoteStake && msg.value <= maxVoteStake, "stake out of range");
        Vote storage v = votes[proposalId][msg.sender];
        require(v.stake == 0, "already voted");
        v.stake = msg.value;
        v.support = support;
        uint256 power = votingPower(msg.value);
        if (support) p.forPower += power;
        else p.againstPower += power;
        p.voters++;
        emit ReasonProposalVoted(proposalId, msg.sender, support, msg.value, power);
    }

    function finalizeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = proposals[proposalId];
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
            p.reasonId = _register(p.name, p.description, p.proposer);
            claimable[p.proposer] += p.bond;
            uint256 reward = proposerReward > rewardBalance ? rewardBalance : proposerReward;
            if (reward > 0) {
                rewardBalance -= reward;
                claimable[p.proposer] += reward;
                emit DiscovererRewarded(proposalId, p.reasonId, p.proposer, reward);
            }
        } else {
            p.status = ProposalStatus.Rejected;
            nameTaken[h] = false;
            rewardBalance += p.bond;
        }
        emit ReasonProposalFinalized(proposalId, p.status, p.reasonId);
    }

    function claimVoteStake(uint256 proposalId) external nonReentrant {
        require(proposals[proposalId].status > ProposalStatus.Voting, "not finalized");
        Vote storage v = votes[proposalId][msg.sender];
        require(v.stake > 0 && !v.claimed, "nothing to claim");
        v.claimed = true;
        claimable[msg.sender] += v.stake;
    }

    function withdraw() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "nothing to withdraw");
        claimable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    function _register(string memory name, string memory description, address discoverer)
        internal
        returns (uint256 reasonId)
    {
        reasonId = ++reasonCount;
        string memory number = Strings.toString(reasonId);
        string memory code = reasonId < 10
            ? string.concat("R00", number)
            : reasonId < 100 ? string.concat("R0", number) : string.concat("R", number);
        _reasons[reasonId] = Reason(code, name, description, discoverer, uint64(block.timestamp), true);
        nameTaken[keccak256(bytes(name))] = true;
        emit ReasonRegistered(reasonId, code, name, discoverer);
    }
}
