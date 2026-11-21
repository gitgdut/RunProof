// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IGameRegistry} from "./interfaces/IGameRegistry.sol";
import {ICheatRegistry} from "./interfaces/ICheatRegistry.sol";
import {IRunProofCore} from "./interfaces/IRunProofCore.sol";

/// @title RunProofCore
/// @notice Records (RecordRegistry) + challenges (ChallengeManager) + commit-reveal voting
///         (VotingManager) + settlement/rewards (RewardDistributor) in one contract so that all
///         MON custody and accounting lives in a single place.
///
/// Money rules
///  - Every payout is CREDITED to `claimable[account]`; the only way MON leaves is `withdraw()`
///    (pull pattern, nonReentrant, zero-before-send) or the owner's `withdrawPool()` which can only
///    touch unreserved pool funds.
///  - Settlement steps are one-shot (status transitions / `stakeSettled` / per-vote `claimed`).
///  - Special (post-window) challenge rewards are paid from a pool reservation made at creation,
///    never from the player's stake (which was already refunded).
///
/// Voting power = stake / POWER_UNIT (linear => splitting across wallets gains nothing). Per-address
/// power is capped by capping the per-vote stake at `maxVoteStake`.
contract RunProofCore is IRunProofCore, Ownable, ReentrancyGuard {
    // ------------------------------------------------------------------ types

    enum ChallengeStatus { None, Voting, EvidenceVoting, Confirmed, Denied, Inconclusive }
    /// Round 0: Confirm = Confirm Cheating, Deny = Deny Cheating.
    /// Round 1 (evidence sufficiency): Confirm = Evidence Sufficient, Deny = Evidence Required.
    enum Choice { None, Confirm, Deny }
    enum StakeKind { PlayerStake, ChallengeBond, VoterStake }
    enum SlashKind { PlayerStake, ChallengeBond, VoterStake }
    enum RewardKind { ChallengerReward, PlayerCompensation, VoterReward }

    struct Record {
        address player;
        uint256 gameId;
        uint256 gameMode;
        uint256 score;
        bytes32 evidenceHash;
        string evidenceURI;
        uint256 stake;
        uint64 submittedAt;
        uint64 deadline;
        uint32 gameVersion;
        uint32 ruleVersion;
        RecordStatus status;
        bool stakeSettled;
        uint32 activeChallenges;
    }

    struct Challenge {
        uint256 recordId;
        uint256 cheatId;
        address challenger;
        uint256 bond;
        uint256 reserved; // pool reservation for special challenges
        bytes32 evidenceHash;
        string evidenceURI;
        uint64 createdAt;
        ChallengeStatus status;
        uint8 round;
        bool special;
        bool extended;
        uint32 evidenceCount;
    }

    struct Round {
        uint64 commitEnd;
        uint64 revealEnd;
        uint256 confirmPower;
        uint256 denyPower;
        uint256 confirmStake;
        uint256 denyStake;
        uint256 committedStake;
        uint32 committedVoters;
        uint32 revealedVoters;
        bool finalized;
        Choice winner;
        uint256 winnerPower;
        uint256 rewardPool; // MON distributed pro-rata (by power) to winning voters
        uint16 slashBps;
    }

    struct Vote {
        bytes32 commitment;
        uint256 stake;
        Choice choice;
        bool revealed;
        bool claimed;
    }

    struct Params {
        uint256 submissionFee;
        uint256 challengeBond;
        uint256 specialBondMultiplier;
        uint256 specialReward;
        uint256 minVoteStake;
        uint256 maxVoteStake;
        uint256 quorumPower;
        uint256 recordBreakerBps; // stake multiplier when score beats the verified top
        uint32 minVoters;
        uint64 challengeWindow;
        uint64 commitPeriod;
        uint64 revealPeriod;
        uint64 extensionPeriod;
        uint16 approvalBps;
        uint16 nearTieBps; // |confirm% - 50%| <= this => "close to 50:50"
        uint16 wrongSlashBps;
        uint16 challengerRewardBps; // of slashed player stake / special reward
        uint16 voterRewardBps; //      of slashed player stake / special reward
        uint16 playerCompBps; //       of a slashed (denied) challenge bond
    }

    // ---------------------------------------------------------------- storage

    uint256 public constant POWER_UNIT = 1e15;

    IGameRegistry public immutable games;
    ICheatRegistry public immutable cheats;

    Params public params;
    uint256[] public tierThresholds;
    uint256[] public tierStakes; // length = thresholds + 1

    uint256 public recordCount;
    uint256 public challengeCount;
    mapping(uint256 => Record) private _records;
    mapping(uint256 => Challenge) private _challenges;
    mapping(uint256 => mapping(uint256 => uint256)) public challengeOf; // recordId => cheatId => challengeId
    mapping(uint256 => mapping(uint8 => Round)) public rounds;
    mapping(uint256 => mapping(uint8 => mapping(address => Vote))) public votes;
    mapping(bytes32 => bool) public evidenceUsed; // record evidence hashes
    mapping(bytes32 => bool) public challengeEvidenceUsed;
    mapping(uint256 => mapping(uint256 => uint256)) public verifiedTop; // gameId => mode => score

    mapping(address => uint256) public claimable;
    uint256 public poolBalance; // protocol reward pool (includes reserved part)
    uint256 public reservedPool;

    // ----------------------------------------------------------------- events

    event RecordSubmitted(
        uint256 indexed recordId,
        address indexed player,
        uint256 indexed gameId,
        uint256 gameMode,
        uint256 score,
        uint256 stake,
        bytes32 evidenceHash,
        string evidenceURI,
        uint64 deadline
    );
    event ChallengeCreated(
        uint256 indexed recordId,
        uint256 indexed cheatId,
        address indexed challenger,
        uint256 challengeId,
        uint256 bond,
        bool special,
        bytes32 evidenceHash,
        string evidenceURI,
        uint64 commitEnd
    );
    event EvidenceSubmitted(
        uint256 indexed recordId,
        uint256 indexed cheatId,
        address indexed submitter,
        uint256 challengeId,
        uint8 round,
        bytes32 evidenceHash,
        string evidenceURI
    );
    event VoteCommitted(
        uint256 indexed recordId, uint256 indexed cheatId, address indexed voter, uint256 challengeId, uint8 round, uint256 stake
    );
    event VoteRevealed(
        uint256 indexed recordId,
        uint256 indexed cheatId,
        address indexed voter,
        uint256 challengeId,
        uint8 round,
        Choice choice,
        uint256 power
    );
    event VotingExtended(
        uint256 indexed recordId, uint256 indexed cheatId, uint256 challengeId, uint64 newCommitEnd, uint64 newRevealEnd
    );
    event EvidenceVotingStarted(
        uint256 indexed recordId, uint256 indexed cheatId, uint256 challengeId, uint64 commitEnd, uint64 revealEnd
    );
    event VotingFinalized(
        uint256 indexed recordId,
        uint256 indexed cheatId,
        uint256 challengeId,
        ChallengeStatus outcome,
        uint8 round,
        uint256 confirmPower,
        uint256 denyPower
    );
    event RecordVerified(uint256 indexed recordId, address indexed player, uint256 indexed gameId, uint256 score);
    event RecordRevoked(uint256 indexed recordId, address indexed player, uint256 indexed cheatId, uint256 challengeId);
    event StakeReturned(
        uint256 indexed recordId, uint256 indexed cheatId, address indexed account, uint256 amount, StakeKind kind
    );
    event StakeSlashed(
        uint256 indexed recordId,
        uint256 indexed cheatId,
        address indexed account,
        uint256 amount,
        SlashKind kind,
        uint256 challengeId
    );
    event RewardDistributed(
        uint256 indexed recordId,
        uint256 indexed cheatId,
        address indexed account,
        uint256 amount,
        RewardKind kind,
        uint256 challengeId
    );
    event Withdrawn(address indexed account, uint256 amount);
    event PoolFunded(address indexed from, uint256 amount);
    event PoolWithdrawn(address indexed to, uint256 amount);
    event ParamsUpdated();

    // ------------------------------------------------------------ constructor

    constructor(address owner_, IGameRegistry games_, ICheatRegistry cheats_) Ownable(owner_) {
        games = games_;
        cheats = cheats_;
        params = Params({
            submissionFee: 0.01 ether,
            challengeBond: 0.1 ether,
            specialBondMultiplier: 5,
            specialReward: 1 ether,
            minVoteStake: 0.05 ether,
            maxVoteStake: 5 ether,
            quorumPower: 300, // 0.3 MON of total revealed stake
            recordBreakerBps: 20000,
            minVoters: 3,
            challengeWindow: 30 days,
            commitPeriod: 3 days,
            revealPeriod: 1 days,
            extensionPeriod: 2 days,
            approvalBps: 7500,
            nearTieBps: 500,
            wrongSlashBps: 3000,
            challengerRewardBps: 4000,
            voterRewardBps: 4000,
            playerCompBps: 5000
        });
        tierThresholds = [10_000, 100_000, 1_000_000];
        tierStakes = [0.05 ether, 0.2 ether, 1 ether, 5 ether];
    }

    // ------------------------------------------------------------------ admin

    function setParams(Params calldata p) external onlyOwner {
        require(p.approvalBps > 5000 && p.approvalBps <= 10000, "approval");
        require(p.nearTieBps < 2500, "nearTie");
        require(p.wrongSlashBps <= 10000 && p.playerCompBps <= 10000, "bps");
        require(uint256(p.challengerRewardBps) + p.voterRewardBps <= 10000, "reward bps");
        require(p.minVoteStake >= POWER_UNIT && p.maxVoteStake >= p.minVoteStake, "stake range");
        require(p.minVoters > 0 && p.commitPeriod > 0 && p.revealPeriod > 0 && p.extensionPeriod > 0, "periods");
        require(p.specialBondMultiplier > 0 && p.recordBreakerBps >= 10000, "multipliers");
        params = p;
        emit ParamsUpdated();
    }

    function setStakeTiers(uint256[] calldata thresholds, uint256[] calldata stakes) external onlyOwner {
        require(stakes.length == thresholds.length + 1 && stakes.length > 0, "length");
        for (uint256 i = 1; i < thresholds.length; i++) {
            require(thresholds[i] > thresholds[i - 1], "not ascending");
        }
        tierThresholds = thresholds;
        tierStakes = stakes;
        emit ParamsUpdated();
    }

    function fundPool() external payable {
        poolBalance += msg.value;
        emit PoolFunded(msg.sender, msg.value);
    }

    /// @notice Owner may only move UNRESERVED pool funds; never player/voter/challenger money.
    function withdrawPool(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "zero address");
        require(amount <= poolBalance - reservedPool, "exceeds free pool");
        poolBalance -= amount;
        (bool ok,) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit PoolWithdrawn(to, amount);
    }

    // ------------------------------------------------------------------ views

    function getRecord(uint256 recordId) external view returns (Record memory) {
        return _records[recordId];
    }

    function getChallenge(uint256 challengeId) external view returns (Challenge memory) {
        return _challenges[challengeId];
    }

    function recordSummary(uint256 recordId)
        external
        view
        returns (address, uint256, uint256, uint256, bytes32, RecordStatus)
    {
        Record storage r = _records[recordId];
        return (r.player, r.gameId, r.gameMode, r.score, r.evidenceHash, r.status);
    }

    function votingPower(uint256 stake) public pure returns (uint256) {
        return stake / POWER_UNIT;
    }

    function requiredStake(uint256 gameId, uint256 gameMode, uint256 score) public view returns (uint256 s) {
        uint256 n = tierThresholds.length;
        s = tierStakes[n];
        for (uint256 i = 0; i < n; i++) {
            if (score < tierThresholds[i]) {
                s = tierStakes[i];
                break;
            }
        }
        if (score > verifiedTop[gameId][gameMode]) s = (s * params.recordBreakerBps) / 10000;
    }

    function requiredPayment(uint256 gameId, uint256 gameMode, uint256 score) external view returns (uint256) {
        return params.submissionFee + requiredStake(gameId, gameMode, score);
    }

    function hashVote(uint256 challengeId, uint8 round, Choice choice, bytes32 salt, address voter)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(challengeId, round, choice, salt, voter));
    }

    // ----------------------------------------------------------- RecordRegistry

    function submitRecord(
        uint256 gameId,
        uint256 gameMode,
        uint256 score,
        bytes32 evidenceHash,
        string calldata evidenceURI
    ) external payable nonReentrant returns (uint256 recordId) {
        require(score > 0, "zero score");
        require(evidenceHash != bytes32(0) && bytes(evidenceURI).length > 0, "evidence required");
        require(games.isModeActive(gameId, gameMode), "mode inactive");
        require(!evidenceUsed[evidenceHash], "evidence already used");
        evidenceUsed[evidenceHash] = true;

        uint256 stake = requiredStake(gameId, gameMode, score);
        uint256 fee = params.submissionFee;
        require(msg.value >= fee + stake, "insufficient payment");
        if (msg.value > fee + stake) claimable[msg.sender] += msg.value - fee - stake;
        poolBalance += fee;

        recordId = ++recordCount;
        Record storage r = _records[recordId];
        r.player = msg.sender;
        r.gameId = gameId;
        r.gameMode = gameMode;
        r.score = score;
        r.evidenceHash = evidenceHash;
        r.evidenceURI = evidenceURI;
        r.stake = stake;
        r.submittedAt = uint64(block.timestamp);
        r.deadline = uint64(block.timestamp) + params.challengeWindow;
        (r.gameVersion, r.ruleVersion) = games.versions(gameId);
        r.status = RecordStatus.Provisional;

        emit RecordSubmitted(recordId, msg.sender, gameId, gameMode, score, stake, evidenceHash, evidenceURI, r.deadline);
    }

    /// @notice Anyone may call once the window is over and no challenge is open: auto-verify + refund.
    function finalizeRecord(uint256 recordId) external nonReentrant {
        Record storage r = _records[recordId];
        require(r.status == RecordStatus.Provisional, "not provisional");
        require(block.timestamp > r.deadline, "window open");
        require(r.activeChallenges == 0, "open challenges");
        _verify(recordId, r);
    }

    // -------------------------------------------------------- ChallengeManager

    function challengeRecord(uint256 recordId, uint256 cheatId, bytes32 evidenceHash, string calldata evidenceURI)
        external
        payable
        nonReentrant
        returns (uint256 challengeId)
    {
        Record storage rec = _records[recordId];
        require(rec.status == RecordStatus.Provisional || rec.status == RecordStatus.Verified, "not challengeable");
        require(cheats.isRegistered(cheatId), "unknown cheat");
        require(msg.sender != rec.player, "own record");
        require(evidenceHash != bytes32(0) && bytes(evidenceURI).length > 0, "evidence required");
        require(!challengeEvidenceUsed[evidenceHash], "evidence already used");
        challengeEvidenceUsed[evidenceHash] = true;

        uint256 existing = challengeOf[recordId][cheatId];
        require(existing == 0 || _challenges[existing].status == ChallengeStatus.Inconclusive, "duplicate challenge");

        bool special;
        if (rec.status == RecordStatus.Verified) {
            special = true;
        } else if (block.timestamp > rec.deadline && rec.activeChallenges == 0) {
            _verify(recordId, rec); // window is over: settle first, this is now a special challenge
            special = true;
        }

        Params storage p = params;
        uint256 bond = special ? p.challengeBond * p.specialBondMultiplier : p.challengeBond;
        require(msg.value >= bond, "insufficient bond");
        if (msg.value > bond) claimable[msg.sender] += msg.value - bond;

        challengeId = ++challengeCount;
        Challenge storage c = _challenges[challengeId];
        c.recordId = recordId;
        c.cheatId = cheatId;
        c.challenger = msg.sender;
        c.bond = bond;
        c.evidenceHash = evidenceHash;
        c.evidenceURI = evidenceURI;
        c.createdAt = uint64(block.timestamp);
        c.status = ChallengeStatus.Voting;
        c.special = special;
        c.evidenceCount = 1;
        if (special) {
            // reward for special challenges must NOT depend on the (already refunded) player stake
            require(poolBalance - reservedPool >= p.specialReward, "pool cannot fund reward");
            reservedPool += p.specialReward;
            c.reserved = p.specialReward;
        }
        challengeOf[recordId][cheatId] = challengeId;
        rec.activeChallenges++;

        Round storage r = rounds[challengeId][0];
        r.commitEnd = uint64(block.timestamp) + p.commitPeriod;
        r.revealEnd = r.commitEnd + p.revealPeriod;

        emit ChallengeCreated(recordId, cheatId, msg.sender, challengeId, bond, special, evidenceHash, evidenceURI, r.commitEnd);
    }

    /// @notice Challenger or player adds evidence while the current round is still accepting commits.
    function submitEvidence(uint256 challengeId, bytes32 evidenceHash, string calldata evidenceURI) external {
        Challenge storage c = _challenges[challengeId];
        require(c.status == ChallengeStatus.Voting || c.status == ChallengeStatus.EvidenceVoting, "closed");
        require(msg.sender == c.challenger || msg.sender == _records[c.recordId].player, "not a party");
        require(block.timestamp < rounds[challengeId][c.round].commitEnd, "commit phase over");
        require(evidenceHash != bytes32(0) && bytes(evidenceURI).length > 0, "evidence required");
        c.evidenceCount++;
        emit EvidenceSubmitted(c.recordId, c.cheatId, msg.sender, challengeId, c.round, evidenceHash, evidenceURI);
    }

    // ------------------------------------------------------------ VotingManager

    function commitVote(uint256 challengeId, bytes32 commitment) external payable nonReentrant {
        Challenge storage c = _challenges[challengeId];
        require(c.status == ChallengeStatus.Voting || c.status == ChallengeStatus.EvidenceVoting, "not votable");
        Round storage r = rounds[challengeId][c.round];
        require(block.timestamp < r.commitEnd, "commit phase over");
        require(commitment != bytes32(0), "empty commitment");
        require(msg.sender != c.challenger && msg.sender != _records[c.recordId].player, "party cannot vote");
        require(msg.value >= params.minVoteStake && msg.value <= params.maxVoteStake, "stake out of range");
        Vote storage v = votes[challengeId][c.round][msg.sender];
        require(v.stake == 0, "already voted");

        v.commitment = commitment;
        v.stake = msg.value;
        r.committedStake += msg.value;
        r.committedVoters++;
        emit VoteCommitted(c.recordId, c.cheatId, msg.sender, challengeId, c.round, msg.value);
    }

    function revealVote(uint256 challengeId, Choice choice, bytes32 salt) external {
        Challenge storage c = _challenges[challengeId];
        require(c.status == ChallengeStatus.Voting || c.status == ChallengeStatus.EvidenceVoting, "not votable");
        Round storage r = rounds[challengeId][c.round];
        require(block.timestamp >= r.commitEnd && block.timestamp < r.revealEnd, "not reveal phase");
        require(choice == Choice.Confirm || choice == Choice.Deny, "bad choice");
        Vote storage v = votes[challengeId][c.round][msg.sender];
        require(v.stake > 0, "no vote");
        require(!v.revealed, "already revealed");
        require(hashVote(challengeId, c.round, choice, salt, msg.sender) == v.commitment, "commitment mismatch");

        v.revealed = true;
        v.choice = choice;
        uint256 power = votingPower(v.stake);
        if (choice == Choice.Confirm) {
            r.confirmPower += power;
            r.confirmStake += v.stake;
        } else {
            r.denyPower += power;
            r.denyStake += v.stake;
        }
        r.revealedVoters++;
        emit VoteRevealed(c.recordId, c.cheatId, msg.sender, challengeId, c.round, choice, power);
    }

    function finalizeVoting(uint256 challengeId) external nonReentrant {
        Challenge storage c = _challenges[challengeId];
        require(c.status == ChallengeStatus.Voting || c.status == ChallengeStatus.EvidenceVoting, "not votable");
        uint8 round = c.round;
        Round storage r = rounds[challengeId][round];
        require(block.timestamp >= r.revealEnd, "reveal phase open");

        Params storage p = params;
        uint256 total = r.confirmPower + r.denyPower;
        bool quorum = total >= p.quorumPower && r.revealedVoters >= p.minVoters;
        bool confirmWins = quorum && r.confirmPower * 10000 >= uint256(p.approvalBps) * total;
        bool denyWins = quorum && r.denyPower * 10000 >= uint256(p.approvalBps) * total;

        if (round == 0) {
            if (confirmWins) {
                _finalizeRound(challengeId, 0, Choice.Confirm);
                _resolve(challengeId, ChallengeStatus.Confirmed);
            } else if (denyWins) {
                _finalizeRound(challengeId, 0, Choice.Deny);
                _resolve(challengeId, ChallengeStatus.Denied);
            } else if (!quorum || _nearTie(r, total, p.nearTieBps)) {
                if (!c.extended) {
                    // not enough participation, or ~50:50 => extend once, existing votes stay
                    c.extended = true;
                    r.commitEnd = r.revealEnd + p.extensionPeriod;
                    r.revealEnd = r.commitEnd + p.revealPeriod;
                    emit VotingExtended(c.recordId, c.cheatId, challengeId, r.commitEnd, r.revealEnd);
                } else if (quorum) {
                    // still ~50:50 after the extension => Evidence Sufficiency Voting
                    _finalizeRound(challengeId, 0, Choice.None);
                    c.status = ChallengeStatus.EvidenceVoting;
                    c.round = 1;
                    Round storage e = rounds[challengeId][1];
                    e.commitEnd = uint64(block.timestamp) + p.commitPeriod;
                    e.revealEnd = e.commitEnd + p.revealPeriod;
                    emit EvidenceVotingStarted(c.recordId, c.cheatId, challengeId, e.commitEnd, e.revealEnd);
                } else {
                    _finalizeRound(challengeId, 0, Choice.None);
                    _resolve(challengeId, ChallengeStatus.Inconclusive);
                }
            } else {
                // no supermajority and not a tie: Inconclusive, nobody is declared right or wrong
                _finalizeRound(challengeId, 0, Choice.None);
                _resolve(challengeId, ChallengeStatus.Inconclusive);
            }
        } else {
            // Evidence Sufficient >= approval => cheating established. Anything else => Inconclusive
            // ("evidence required": challenger may re-challenge with new evidence).
            if (confirmWins) {
                _finalizeRound(challengeId, 1, Choice.Confirm);
                _resolve(challengeId, ChallengeStatus.Confirmed);
            } else {
                _finalizeRound(challengeId, 1, denyWins ? Choice.Deny : Choice.None);
                _resolve(challengeId, ChallengeStatus.Inconclusive);
            }
        }
    }

    /// @notice Settle one voter's stake for a finalized round (returns/penalizes/rewards). One-shot.
    function claimVote(uint256 challengeId, uint8 round) external nonReentrant {
        Round storage r = rounds[challengeId][round];
        require(r.finalized, "round not finalized");
        Vote storage v = votes[challengeId][round][msg.sender];
        require(v.stake > 0 && !v.claimed, "nothing to claim");
        v.claimed = true;
        Challenge storage c = _challenges[challengeId];

        uint256 stake = v.stake;
        // per-voter slash rounds UP so retained funds always cover the (rounded-down) reward pool
        uint256 slash = (stake * r.slashBps + 9999) / 10000;
        uint256 payout;
        if (v.revealed && (r.winner == Choice.None || v.choice == r.winner)) {
            payout = stake;
            if (r.winner != Choice.None) {
                uint256 reward = (r.rewardPool * votingPower(stake)) / r.winnerPower;
                payout += reward;
                emit RewardDistributed(c.recordId, c.cheatId, msg.sender, reward, RewardKind.VoterReward, challengeId);
            }
        } else {
            // unrevealed votes, or revealed votes on the losing side: partial slash
            payout = stake - slash;
            emit StakeSlashed(c.recordId, c.cheatId, msg.sender, slash, SlashKind.VoterStake, challengeId);
        }
        claimable[msg.sender] += payout;
        emit StakeReturned(c.recordId, c.cheatId, msg.sender, payout, StakeKind.VoterStake);
    }

    // ------------------------------------------------------- RewardDistributor

    function withdraw() external nonReentrant {
        uint256 amt = claimable[msg.sender];
        require(amt > 0, "nothing to withdraw");
        claimable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amt}("");
        require(ok, "transfer failed");
        emit Withdrawn(msg.sender, amt);
    }

    // --------------------------------------------------------------- internals

    function _nearTie(Round storage r, uint256 total, uint16 nearTieBps) internal view returns (bool) {
        if (total == 0) return false;
        uint256 confirmBps = (r.confirmPower * 10000) / total;
        return confirmBps + nearTieBps >= 5000 && confirmBps <= 5000 + nearTieBps;
    }

    function _verify(uint256 recordId, Record storage rec) internal {
        rec.status = RecordStatus.Verified;
        if (rec.score > verifiedTop[rec.gameId][rec.gameMode]) verifiedTop[rec.gameId][rec.gameMode] = rec.score;
        if (!rec.stakeSettled) {
            rec.stakeSettled = true;
            claimable[rec.player] += rec.stake;
            emit StakeReturned(recordId, 0, rec.player, rec.stake, StakeKind.PlayerStake);
        }
        emit RecordVerified(recordId, rec.player, rec.gameId, rec.score);
    }

    function _finalizeRound(uint256 challengeId, uint8 round, Choice winner) internal {
        Round storage r = rounds[challengeId][round];
        r.finalized = true;
        r.winner = winner;
        r.slashBps = params.wrongSlashBps;
        uint256 unrevealed = r.committedStake - r.confirmStake - r.denyStake;
        uint256 loserStake = winner == Choice.Confirm ? r.denyStake : winner == Choice.Deny ? r.confirmStake : 0;
        uint256 slash = ((loserStake + unrevealed) * r.slashBps) / 10000;
        if (winner == Choice.None) {
            poolBalance += slash; // only unrevealed stakes are penalized
        } else {
            r.winnerPower = winner == Choice.Confirm ? r.confirmPower : r.denyPower;
            r.rewardPool = slash;
        }
    }

    function _resolve(uint256 challengeId, ChallengeStatus outcome) internal {
        Challenge storage c = _challenges[challengeId];
        Record storage rec = _records[c.recordId];
        Round storage r = rounds[challengeId][c.round];
        Params storage p = params;
        c.status = outcome;
        rec.activeChallenges--;
        emit VotingFinalized(c.recordId, c.cheatId, challengeId, outcome, c.round, r.confirmPower, r.denyPower);

        if (outcome == ChallengeStatus.Confirmed) {
            claimable[c.challenger] += c.bond;
            emit StakeReturned(c.recordId, c.cheatId, c.challenger, c.bond, StakeKind.ChallengeBond);

            uint256 pot;
            if (c.special) {
                pot = c.reserved; // funded from the pool, not from the player's refunded stake
                reservedPool -= pot;
                poolBalance -= pot;
                c.reserved = 0;
            } else if (!rec.stakeSettled) {
                rec.stakeSettled = true;
                pot = rec.stake;
                emit StakeSlashed(c.recordId, c.cheatId, rec.player, pot, SlashKind.PlayerStake, challengeId);
            }
            if (pot > 0) {
                uint256 toChallenger = (pot * p.challengerRewardBps) / 10000;
                uint256 toVoters = (pot * p.voterRewardBps) / 10000;
                claimable[c.challenger] += toChallenger;
                r.rewardPool += toVoters;
                poolBalance += pot - toChallenger - toVoters;
                emit RewardDistributed(
                    c.recordId, c.cheatId, c.challenger, toChallenger, RewardKind.ChallengerReward, challengeId
                );
            }
            if (rec.status != RecordStatus.Revoked) {
                rec.status = RecordStatus.Revoked; // NFT (if any) is kept and reads this status
                emit RecordRevoked(c.recordId, rec.player, c.cheatId, challengeId);
            }
        } else {
            if (outcome == ChallengeStatus.Denied) {
                uint256 comp = (c.bond * p.playerCompBps) / 10000;
                claimable[rec.player] += comp;
                r.rewardPool += c.bond - comp; // winners = deny voters
                emit StakeSlashed(c.recordId, c.cheatId, c.challenger, c.bond, SlashKind.ChallengeBond, challengeId);
                emit RewardDistributed(c.recordId, c.cheatId, rec.player, comp, RewardKind.PlayerCompensation, challengeId);
            } else {
                claimable[c.challenger] += c.bond;
                emit StakeReturned(c.recordId, c.cheatId, c.challenger, c.bond, StakeKind.ChallengeBond);
            }
            if (c.special) {
                reservedPool -= c.reserved;
                c.reserved = 0;
            }
            if (rec.status == RecordStatus.Provisional && rec.activeChallenges == 0 && block.timestamp > rec.deadline) {
                _verify(c.recordId, rec);
            }
        }
    }

    receive() external payable {
        poolBalance += msg.value;
        emit PoolFunded(msg.sender, msg.value);
    }
}
