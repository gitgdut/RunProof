// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {CheatRegistry} from "../src/CheatRegistry.sol";
import {RunProofCore} from "../src/RunProofCore.sol";
import {IRunProofCore} from "../src/interfaces/IRunProofCore.sol";

/// Drives RunProofCore with random (mostly valid) action sequences.
contract Handler is Test {
    RunProofCore public core;
    address[] public actors;
    uint256 nonce;
    mapping(uint256 => mapping(uint8 => mapping(address => uint8))) public choiceOf;

    constructor(RunProofCore c) {
        core = c;
        for (uint256 i; i < 10; i++) {
            address a = address(uint160(0xA000 + i));
            vm.deal(a, 100_000 ether);
            actors.push(a);
        }
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    function _a(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _salt(address a, uint256 cid, uint8 round) internal pure returns (bytes32) {
        return keccak256(abi.encode(a, cid, round));
    }

    function submit(uint256 who, uint256 score, uint256 mode, uint256 extra) external {
        address p = _a(who);
        score = bound(score, 1, 3_000_000);
        mode = bound(mode, 1, 3);
        uint256 pay = core.requiredPayment(1, mode, score) + bound(extra, 0, 1 ether);
        vm.prank(p);
        try core.submitRecord{value: pay}(1, mode, score, keccak256(abi.encode(++nonce)), "ipfs://x") {} catch {}
    }

    function challenge(uint256 who, uint256 rid, uint256 cheat) external {
        uint256 n = core.recordCount();
        if (n == 0) return;
        rid = bound(rid, 1, n);
        cheat = bound(cheat, 1, 5);
        vm.prank(_a(who));
        try core.challengeRecord{value: 0.6 ether}(rid, cheat, keccak256(abi.encode(++nonce)), "ipfs://c") {} catch {}
    }

    function commit(uint256 who, uint256 cid, uint256 choice, uint256 stake) external {
        uint256 n = core.challengeCount();
        if (n == 0) return;
        cid = bound(cid, 1, n);
        address v = _a(who);
        uint8 ch = uint8(bound(choice, 1, 2));
        stake = bound(stake, 0.05 ether, 5 ether);
        uint8 round = core.getChallenge(cid).round;
        bytes32 h = core.hashVote(cid, round, RunProofCore.Choice(ch), _salt(v, cid, round), v);
        vm.prank(v);
        try core.commitVote{value: stake}(cid, h) {
            choiceOf[cid][round][v] = ch;
        } catch {}
    }

    function reveal(uint256 who, uint256 cid) external {
        uint256 n = core.challengeCount();
        if (n == 0) return;
        cid = bound(cid, 1, n);
        address v = _a(who);
        uint8 round = core.getChallenge(cid).round;
        uint8 ch = choiceOf[cid][round][v];
        if (ch == 0) return;
        vm.prank(v);
        try core.revealVote(cid, RunProofCore.Choice(ch), _salt(v, cid, round)) {} catch {}
    }

    function finalizeVoting(uint256 cid) external {
        uint256 n = core.challengeCount();
        if (n == 0) return;
        try core.finalizeVoting(bound(cid, 1, n)) {} catch {}
    }

    function finalizeRecord(uint256 rid) external {
        uint256 n = core.recordCount();
        if (n == 0) return;
        try core.finalizeRecord(bound(rid, 1, n)) {} catch {}
    }

    function claimVote(uint256 who, uint256 cid, uint256 round) external {
        uint256 n = core.challengeCount();
        if (n == 0) return;
        vm.prank(_a(who));
        try core.claimVote(bound(cid, 1, n), uint8(bound(round, 0, 1))) {} catch {}
    }

    function withdraw(uint256 who) external {
        vm.prank(_a(who));
        try core.withdraw() {} catch {}
    }

    /// Guided action: a whole voting round (commit -> reveal -> finalize), some voters skip the reveal,
    /// then everyone settles. Needed because purely random calls almost never reach settlement.
    function fullVote(uint256 cid, uint256 nc, uint256 nd, uint256 stakeSeed, uint256 skipMask) external {
        uint256 n = core.challengeCount();
        if (n == 0) return;
        cid = bound(cid, 1, n);
        RunProofCore.ChallengeStatus st = core.getChallenge(cid).status;
        if (st != RunProofCore.ChallengeStatus.Voting && st != RunProofCore.ChallengeStatus.EvidenceVoting) return;
        nc = bound(nc, 0, 6);
        nd = bound(nd, 0, 10 - nc);
        uint8 round = core.getChallenge(cid).round;
        uint256 total = nc + nd;
        uint8[10] memory ch;
        for (uint256 i; i < total; i++) {
            address v = actors[i];
            ch[i] = i < nc ? 1 : 2;
            uint256 stake = bound(uint256(keccak256(abi.encode(stakeSeed, i))), 0.05 ether, 5 ether);
            bytes32 h = core.hashVote(cid, round, RunProofCore.Choice(ch[i]), _salt(v, cid, round), v);
            vm.prank(v);
            try core.commitVote{value: stake}(cid, h) {
                choiceOf[cid][round][v] = ch[i];
            } catch {}
        }
        (uint64 commitEnd, uint64 revealEnd,,,,,,,,,,,,) = core.rounds(cid, round);
        if (block.timestamp < commitEnd) vm.warp(commitEnd);
        for (uint256 i; i < total; i++) {
            if ((skipMask >> i) & 1 == 1) continue;
            address v = actors[i];
            if (choiceOf[cid][round][v] == 0) continue;
            vm.prank(v);
            try core.revealVote(cid, RunProofCore.Choice(ch[i]), _salt(v, cid, round)) {} catch {}
        }
        if (block.timestamp < revealEnd) vm.warp(revealEnd);
        try core.finalizeVoting(cid) {} catch {}
        for (uint256 i; i < total; i++) {
            vm.prank(actors[i]);
            try core.claimVote(cid, round) {} catch {}
        }
    }

    /// advance time: usually minutes/days, sometimes past the 30-day window
    function warp(uint256 secs) external {
        secs = bound(secs, 1 minutes, 40 days);
        vm.warp(block.timestamp + secs);
    }
}

contract RunProofInvariantTest is Test {
    RunProofCore core;
    Handler handler;

    function setUp() public {
        address owner = address(0xBEEF);
        GameRegistry games = new GameRegistry(owner);
        CheatRegistry cheats = new CheatRegistry(owner);
        core = new RunProofCore(owner, games, cheats);
        vm.deal(address(this), 1000 ether);
        core.fundPool{value: 50 ether}();
        handler = new Handler(core);
        targetContract(address(handler));
    }

    /// Everything the contract owes must be backed by its balance:
    ///  pool + claimable + unsettled player stakes + open challenge bonds + unclaimed voter stakes
    function invariant_solvency() public view {
        uint256 owed = core.poolBalance();
        uint256 na = handler.actorsLength();
        for (uint256 i; i < na; i++) {
            owed += core.claimable(handler.actors(i));
        }
        for (uint256 r = 1; r <= core.recordCount(); r++) {
            RunProofCore.Record memory rec = core.getRecord(r);
            if (!rec.stakeSettled) owed += rec.stake;
        }
        for (uint256 c = 1; c <= core.challengeCount(); c++) {
            RunProofCore.ChallengeStatus st = core.getChallenge(c).status;
            if (st == RunProofCore.ChallengeStatus.Voting || st == RunProofCore.ChallengeStatus.EvidenceVoting) {
                owed += core.getChallenge(c).bond;
            }
            for (uint8 round = 0; round < 2; round++) {
                for (uint256 i; i < na; i++) {
                    owed += _pendingVotePayout(c, round, handler.actors(i));
                }
            }
        }
        assertGe(address(core).balance, owed, "contract is insolvent");
    }

    /// What claimVote would pay this voter (0 if nothing/already claimed). Mirrors the settlement rules.
    function _pendingVotePayout(uint256 cid, uint8 round, address voter) internal view returns (uint256) {
        (, uint256 stake,, bool revealed, bool claimed) = core.votes(cid, round, voter);
        if (stake == 0 || claimed) return 0;
        (
            ,,,,,,,,,
            bool finalized,
            RunProofCore.Choice winner,
            uint256 winnerPower,
            uint256 rewardPool,
            uint16 slashBps
        ) = core.rounds(cid, round);
        if (!finalized) return stake; // fully locked
        uint256 slash = (stake * slashBps + 9999) / 10000;
        if (revealed && winner == RunProofCore.Choice.None) return stake;
        if (revealed) {
            (,,, RunProofCore.Choice choice,,) = _voteFull(cid, round, voter);
            if (choice == winner) return stake + (rewardPool * (stake / 1e15)) / winnerPower;
        }
        return stake - slash;
    }

    function _voteFull(uint256 cid, uint8 round, address voter)
        internal
        view
        returns (bytes32, uint256, uint256, RunProofCore.Choice, bool, bool)
    {
        (bytes32 h, uint256 stake, RunProofCore.Choice ch, bool rev, bool cl) = core.votes(cid, round, voter);
        return (h, stake, 0, ch, rev, cl);
    }

    uint256[6] public seen;
    uint256 public revoked;
    uint256 public verified;

    function afterInvariant() public {
        for (uint256 c = 1; c <= core.challengeCount(); c++) {
            seen[uint8(core.getChallenge(c).status)]++;
        }
        for (uint256 r = 1; r <= core.recordCount(); r++) {
            IRunProofCore.RecordStatus st = core.getRecord(r).status;
            if (st == IRunProofCore.RecordStatus.Revoked) revoked++;
            if (st == IRunProofCore.RecordStatus.Verified) verified++;
        }
        console.log("coverage confirmed/denied/inconclusive:", seen[3], seen[4], seen[5]);
        console.log("coverage revoked/verified:", revoked, verified);
    }

    function invariant_reservedNeverExceedsPool() public view {
        assertLe(core.reservedPool(), core.poolBalance());
    }

    function invariant_noActiveChallengeMismatch() public view {
        // activeChallenges on each record == number of its challenges still voting
        for (uint256 r = 1; r <= core.recordCount(); r++) {
            uint32 active;
            for (uint256 c = 1; c <= core.challengeCount(); c++) {
                RunProofCore.Challenge memory ch = core.getChallenge(c);
                if (
                    ch.recordId == r
                        && (ch.status == RunProofCore.ChallengeStatus.Voting
                            || ch.status == RunProofCore.ChallengeStatus.EvidenceVoting)
                ) active++;
            }
            assertEq(core.getRecord(r).activeChallenges, active);
        }
    }
}
