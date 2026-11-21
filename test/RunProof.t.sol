// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CategoryRegistry} from "../src/CategoryRegistry.sol";
import {ICategoryRegistry} from "../src/interfaces/ICategoryRegistry.sol";
import {ChallengeReasonRegistry} from "../src/ChallengeReasonRegistry.sol";
import {RunProofCore} from "../src/RunProofCore.sol";
import {RecordNFT} from "../src/RecordNFT.sol";
import {IRunProofCore} from "../src/interfaces/IRunProofCore.sol";

contract RunProofTest is Test {
    CategoryRegistry categories;
    ChallengeReasonRegistry reasons;
    RunProofCore core;
    RecordNFT nft;

    address owner = makeAddr("owner");
    address player = makeAddr("player");
    address challenger = makeAddr("challenger");

    uint256 constant C001 = 1;
    uint256 constant C002 = 2;
    uint256 constant VOTE_STAKE = 1 ether;
    uint256 evNonce;

    function setUp() public {
        vm.startPrank(owner);
        categories = new CategoryRegistry(owner);
        reasons = new ChallengeReasonRegistry(owner);
        uint256 high = categories.createCategory(
            "Open Score",
            "ipfs://rules/high",
            "points",
            0,
            ICategoryRegistry.RankingDirection.HigherIsBetter,
            1,
            0.05 ether
        );
        categories.addDivision(high, "Open");
        categories.addDivision(high, "Women");
        categories.addDivision(high, "Men");
        uint256 low = categories.createCategory(
            "Sprint", "ipfs://rules/low", "ms", 0, ICategoryRegistry.RankingDirection.LowerIsBetter, 1, 0.05 ether
        );
        categories.addDivision(low, "Open");
        core = new RunProofCore(owner, categories, reasons);
        nft = new RecordNFT(core);
        vm.stopPrank();
        vm.deal(player, 100 ether);
        vm.deal(challenger, 100 ether);
        vm.deal(address(this), 100 ether);
        core.fundPool{value: 10 ether}();
    }

    // ------------------------------------------------------------- helpers

    function _ev() internal returns (bytes32) {
        return keccak256(abi.encode("ev", ++evNonce));
    }

    function _submit(uint256 value) internal returns (uint256 id) {
        uint256 pay = core.requiredPayment(1, 1, value);
        vm.prank(player);
        id = core.submitRecord{value: pay}(1, 1, value, _ev(), "ipfs://evidence");
    }

    function _challenge(uint256 recordId, uint256 reasonId) internal returns (uint256 cid) {
        RunProofCore.Params memory p = _p();
        vm.prank(challenger);
        cid = core.challengeRecord{value: p.challengeBond}(recordId, reasonId, _ev(), "ipfs://category");
    }

    function _p() internal view returns (RunProofCore.Params memory p) {
        (
            uint256 a,
            uint256 b,
            uint256 c,
            uint256 d,
            uint256 e,
            uint256 f,
            uint256 g,
            uint256 h,
            uint32 i,
            uint64 j,
            uint64 k,
            uint64 l,
            uint64 m,
            uint16 n,
            uint16 o,
            uint16 q,
            uint16 r,
            uint16 s,
            uint16 t
        ) = core.params();
        p = RunProofCore.Params(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, q, r, s, t);
    }

    function _voter(uint256 base, uint256 i) internal pure returns (address) {
        return address(uint160(base + i));
    }

    function _salt(address v) internal pure returns (bytes32) {
        return keccak256(abi.encode("salt", v));
    }

    function _commit(uint256 cid, address v, RunProofCore.Choice ch) internal {
        uint8 round = core.getChallenge(cid).round;
        vm.deal(v, 10 ether);
        bytes32 h = core.hashVote(cid, round, ch, _salt(v), v);
        vm.prank(v);
        core.commitVote{value: VOTE_STAKE}(cid, h);
    }

    function _reveal(uint256 cid, address v, RunProofCore.Choice ch) internal {
        vm.prank(v);
        core.revealVote(cid, ch, _salt(v));
    }

    /// n confirm voters (0x1000+) and m deny voters (0x2000+) run a full round and finalize.
    function _round(uint256 cid, uint256 n, uint256 m) internal {
        for (uint256 i; i < n; i++) {
            _commit(cid, _voter(0x1000, i), RunProofCore.Choice.Confirm);
        }
        for (uint256 i; i < m; i++) {
            _commit(cid, _voter(0x2000, i), RunProofCore.Choice.Deny);
        }
        uint8 round = core.getChallenge(cid).round;
        (uint64 commitEnd, uint64 revealEnd,,,,,,,,,,,,) = core.rounds(cid, round);
        vm.warp(commitEnd);
        for (uint256 i; i < n; i++) {
            _reveal(cid, _voter(0x1000, i), RunProofCore.Choice.Confirm);
        }
        for (uint256 i; i < m; i++) {
            _reveal(cid, _voter(0x2000, i), RunProofCore.Choice.Deny);
        }
        vm.warp(revealEnd);
        core.finalizeVoting(cid);
    }

    function _status(uint256 cid) internal view returns (RunProofCore.ChallengeStatus) {
        return core.getChallenge(cid).status;
    }

    function _rstatus(uint256 id) internal view returns (IRunProofCore.RecordStatus) {
        return core.getRecord(id).status;
    }

    // ------------------------------------------------------ record submission

    function test_submitRecord() public {
        uint256 pay = core.requiredPayment(1, 1, 5000);
        uint256 poolBefore = core.poolBalance();
        vm.prank(player);
        uint256 id = core.submitRecord{value: pay}(1, 2, 5000, keccak256("e"), "ipfs://x");
        RunProofCore.Record memory r = core.getRecord(id);
        assertEq(id, 1);
        assertEq(r.player, player);
        assertEq(r.value, 5000);
        assertEq(r.evidenceHash, keccak256("e"));
        assertEq(r.deadline, r.submittedAt + 30 days);
        assertEq(uint8(r.status), uint8(IRunProofCore.RecordStatus.Provisional));
        assertEq(r.ruleVersion, 1);
        assertEq(core.poolBalance(), poolBefore + 0.01 ether);
    }

    function test_submit_rejectsDuplicateEvidenceAndBadInput() public {
        _submit(5000);
        bytes32 used = core.getRecord(1).evidenceHash;
        vm.startPrank(player);
        vm.expectRevert("evidence already used");
        core.submitRecord{value: 1 ether}(1, 1, 7000, used, "ipfs://x");
        vm.expectRevert("zero value");
        core.submitRecord{value: 1 ether}(1, 1, 0, _ev(), "ipfs://x");
        vm.expectRevert("division inactive");
        core.submitRecord{value: 1 ether}(1, 9, 100, _ev(), "ipfs://x");
        vm.expectRevert("insufficient payment");
        core.submitRecord{value: 0.001 ether}(1, 1, 100, _ev(), "ipfs://x");
        vm.stopPrank();
    }

    function test_dynamicStake() public {
        // Nothing verified yet: the first prospective leader uses the configured 2x multiplier.
        assertEq(core.requiredStake(1, 1, 5_000), 0.1 ether);
        assertEq(core.requiredStake(1, 1, 50_000), 0.1 ether);
        // Verify a 50k record: only a strictly better value receives the multiplier.
        uint256 id = _submit(50_000);
        vm.warp(core.getRecord(id).deadline + 1);
        core.finalizeRecord(id);
        assertEq(core.requiredStake(1, 1, 50_000), 0.05 ether);
        assertEq(core.requiredStake(1, 1, 5_000), 0.05 ether);
        assertEq(core.requiredStake(1, 1, 60_000), 0.1 ether);
        // Divisions are independent.
        assertEq(core.requiredStake(1, 2, 50_000), 0.1 ether);
    }

    function test_lowerIsBetterLeaderboard() public {
        uint256 pay = core.requiredPayment(2, 1, 12_000);
        vm.prank(player);
        uint256 first = core.submitRecord{value: pay}(2, 1, 12_000, _ev(), "ipfs://12s");
        vm.warp(block.timestamp + 30 days + 1);
        core.finalizeRecord(first);
        assertEq(core.bestRecordId(2, 1), first);
        assertEq(core.requiredStake(2, 1, 13_000), 0.05 ether);
        assertEq(core.requiredStake(2, 1, 11_000), 0.1 ether);

        pay = core.requiredPayment(2, 1, 11_000);
        vm.prank(player);
        uint256 faster = core.submitRecord{value: pay}(2, 1, 11_000, _ev(), "ipfs://11s");
        vm.warp(core.getRecord(faster).deadline + 1);
        core.finalizeRecord(faster);
        assertEq(core.bestRecordId(2, 1), faster);
        assertTrue(core.outranks(faster, first));
    }

    function test_revokedLeaderFallsBackToNextVerifiedRecord() public {
        uint256 first = _submit(100);
        uint256 leader = _submit(200);
        vm.warp(block.timestamp + 30 days + 1);
        core.finalizeRecord(first);
        core.finalizeRecord(leader);
        assertEq(core.bestRecordId(1, 1), leader);

        RunProofCore.Params memory p = _p();
        vm.prank(challenger);
        uint256 cid = core.challengeRecord{value: p.challengeBond * p.specialBondMultiplier}(
            leader, 1, _ev(), "ipfs://invalid-leader"
        );
        _round(cid, 3, 0);
        assertEq(uint8(_rstatus(leader)), uint8(IRunProofCore.RecordStatus.Revoked));
        assertEq(core.bestRecordId(1, 1), first);
    }

    function test_equalValuesUseEarlierRecordAsTieBreaker() public {
        uint256 first = _submit(100);
        uint256 second = _submit(100);
        vm.warp(core.getRecord(first).deadline + 1);
        core.finalizeRecord(second);
        core.finalizeRecord(first);
        assertEq(core.bestRecordId(1, 1), first);
        assertTrue(core.outranks(first, second));
    }

    function test_autoVerifyAfter30Days_refundsStake() public {
        uint256 id = _submit(5000);
        uint256 stake = core.getRecord(id).stake;
        vm.expectRevert("window open");
        core.finalizeRecord(id);
        vm.warp(block.timestamp + 30 days + 1);
        core.finalizeRecord(id);
        assertEq(uint8(_rstatus(id)), uint8(IRunProofCore.RecordStatus.Verified));
        assertEq(core.claimable(player), stake);
        uint256 bal = player.balance;
        vm.prank(player);
        core.withdraw();
        assertEq(player.balance, bal + stake);
        vm.expectRevert("not provisional"); // no double settlement
        core.finalizeRecord(id);
        vm.prank(player);
        vm.expectRevert("nothing to withdraw");
        core.withdraw();
    }

    // ------------------------------------------------------------- challenges

    function test_challengeAndDuplicateProtection() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, C001);
        assertEq(core.challengeOf(id, C001), cid);
        assertEq(core.getRecord(id).activeChallenges, 1);

        RunProofCore.Params memory p = _p();
        vm.startPrank(challenger);
        vm.expectRevert("duplicate challenge");
        core.challengeRecord{value: p.challengeBond}(id, C001, _ev(), "ipfs://again");
        vm.expectRevert("unknown reason");
        core.challengeRecord{value: p.challengeBond}(id, 99, _ev(), "ipfs://c");
        vm.expectRevert("insufficient bond");
        core.challengeRecord{value: 1}(id, C002, _ev(), "ipfs://c");
        // a different category id is independent
        core.challengeRecord{value: p.challengeBond}(id, C002, _ev(), "ipfs://c");
        vm.stopPrank();

        vm.prank(player);
        vm.expectRevert("own record");
        core.challengeRecord{value: p.challengeBond}(id, 3, _ev(), "ipfs://c");
    }

    function test_cannotFinalizeWhileChallengeOpen() public {
        uint256 id = _submit(5000);
        _challenge(id, C001);
        vm.warp(block.timestamp + 31 days);
        vm.expectRevert("open challenges");
        core.finalizeRecord(id);
    }

    function test_submitEvidence() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, C001);
        vm.expectEmit(true, true, true, true);
        emit RunProofCore.EvidenceSubmitted(id, C001, challenger, cid, 0, keccak256("more"), "ipfs://more");
        vm.prank(challenger);
        core.submitEvidence(cid, keccak256("more"), "ipfs://more");
        vm.prank(player);
        core.submitEvidence(cid, keccak256("defense"), "ipfs://defense");
        vm.prank(makeAddr("rando"));
        vm.expectRevert("not a party");
        core.submitEvidence(cid, keccak256("x"), "ipfs://x");
        assertEq(core.getChallenge(cid).evidenceCount, 3);
    }

    // ------------------------------------------------------------------ voting

    function test_commitReveal_preventsFrontRunning() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, C001);
        address v = _voter(0x1000, 0);
        _commit(cid, v, RunProofCore.Choice.Confirm);

        // cannot reveal (and so nobody can see the tally) during the commit phase
        vm.prank(v);
        vm.expectRevert("not reveal phase");
        core.revealVote(cid, RunProofCore.Choice.Confirm, _salt(v));

        // commitment does not leak the choice; wrong choice / wrong salt do not open it
        (uint64 commitEnd,,,,,,,,,,,,,) = core.rounds(cid, 0);
        vm.warp(commitEnd);
        vm.prank(v);
        vm.expectRevert("commitment mismatch");
        core.revealVote(cid, RunProofCore.Choice.Deny, _salt(v));
        vm.prank(v);
        vm.expectRevert("commitment mismatch");
        core.revealVote(cid, RunProofCore.Choice.Confirm, bytes32(uint256(1)));
        // someone copying the commitment hash cannot reveal it either (bound to voter address)
        address copycat = makeAddr("copycat");
        vm.deal(copycat, 5 ether);
        vm.warp(commitEnd - 1);
        bytes32 copied = core.hashVote(cid, 0, RunProofCore.Choice.Confirm, _salt(v), v);
        vm.prank(copycat);
        core.commitVote{value: VOTE_STAKE}(cid, copied);
        vm.warp(commitEnd);
        vm.prank(copycat);
        vm.expectRevert("commitment mismatch");
        core.revealVote(cid, RunProofCore.Choice.Confirm, _salt(v));

        _reveal(cid, v, RunProofCore.Choice.Confirm);
        vm.prank(v);
        vm.expectRevert("already revealed");
        core.revealVote(cid, RunProofCore.Choice.Confirm, _salt(v));
    }

    function test_voteRules() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, C001);
        _commit(cid, _voter(0x1000, 0), RunProofCore.Choice.Confirm);
        vm.prank(_voter(0x1000, 0));
        vm.expectRevert("already voted");
        core.commitVote{value: VOTE_STAKE}(cid, bytes32(uint256(5)));
        address v = _voter(0x1000, 1);
        vm.deal(v, 100 ether);
        vm.startPrank(v);
        vm.expectRevert("stake out of range"); // per-address power cap
        core.commitVote{value: 6 ether}(cid, bytes32(uint256(5)));
        vm.expectRevert("stake out of range");
        core.commitVote{value: 0.001 ether}(cid, bytes32(uint256(5)));
        vm.stopPrank();
        vm.prank(player);
        vm.expectRevert("party cannot vote");
        core.commitVote{value: VOTE_STAKE}(cid, bytes32(uint256(5)));
        assertEq(core.votingPower(1 ether), 1000);
    }

    function test_75percentThreshold_exactlyMet() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, C001);
        _round(cid, 3, 1); // 75%
        assertEq(uint8(_status(cid)), uint8(RunProofCore.ChallengeStatus.Confirmed));
        assertEq(uint8(_rstatus(id)), uint8(IRunProofCore.RecordStatus.Revoked));
    }

    function test_belowThreshold_isInconclusive_notForced() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, C001);
        _round(cid, 4, 2); // 66% confirm: not a tie, no supermajority
        assertEq(uint8(_status(cid)), uint8(RunProofCore.ChallengeStatus.Inconclusive));
        assertEq(uint8(_rstatus(id)), uint8(IRunProofCore.RecordStatus.Provisional)); // not revoked
        // bond returned, nobody slashed (all revealed)
        assertEq(core.claimable(challenger), _p().challengeBond);
        vm.prank(_voter(0x2000, 0));
        core.claimVote(cid, 0);
        assertEq(core.claimable(_voter(0x2000, 0)), VOTE_STAKE);
    }

    function test_denied_slashesChallengerBond() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, C001);
        _round(cid, 0, 3);
        assertEq(uint8(_status(cid)), uint8(RunProofCore.ChallengeStatus.Denied));
        uint256 bond = _p().challengeBond;
        assertEq(core.claimable(challenger), 0);
        assertEq(core.claimable(player), bond / 2); // compensation
        // voters share the other half of the bond
        vm.prank(_voter(0x2000, 0));
        core.claimVote(cid, 0);
        assertEq(core.claimable(_voter(0x2000, 0)), VOTE_STAKE + (bond - bond / 2) / 3);
        // record can be auto-verified after window
        vm.warp(block.timestamp + 30 days);
        core.finalizeRecord(id);
        assertEq(uint8(_rstatus(id)), uint8(IRunProofCore.RecordStatus.Verified));
    }

    function test_nearTie_extendsThenEvidenceVoting() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, C001);
        // 2 v 2 => 50:50 => extension
        for (uint256 i; i < 2; i++) {
            _commit(cid, _voter(0x1000, i), RunProofCore.Choice.Confirm);
        }
        for (uint256 i; i < 2; i++) {
            _commit(cid, _voter(0x2000, i), RunProofCore.Choice.Deny);
        }
        (uint64 ce, uint64 re,,,,,,,,,,,,) = core.rounds(cid, 0);
        vm.warp(ce);
        for (uint256 i; i < 2; i++) {
            _reveal(cid, _voter(0x1000, i), RunProofCore.Choice.Confirm);
        }
        for (uint256 i; i < 2; i++) {
            _reveal(cid, _voter(0x2000, i), RunProofCore.Choice.Deny);
        }
        vm.warp(re);
        vm.expectEmit(true, true, false, false);
        emit RunProofCore.VotingExtended(id, C001, cid, 0, 0);
        core.finalizeVoting(cid);
        assertEq(uint8(_status(cid)), uint8(RunProofCore.ChallengeStatus.Voting));
        assertTrue(core.getChallenge(cid).extended);
        (uint64 ce2, uint64 re2,,,,,,,,,,,,) = core.rounds(cid, 0);
        assertGt(ce2, re);

        // extension: late voters join (existing votes remain). stays 3 v 3 => still tied
        _commit(cid, _voter(0x1000, 2), RunProofCore.Choice.Confirm);
        _commit(cid, _voter(0x2000, 2), RunProofCore.Choice.Deny);
        vm.warp(ce2);
        _reveal(cid, _voter(0x1000, 2), RunProofCore.Choice.Confirm);
        _reveal(cid, _voter(0x2000, 2), RunProofCore.Choice.Deny);
        vm.warp(re2);
        vm.expectEmit(true, true, false, false);
        emit RunProofCore.EvidenceVotingStarted(id, C001, cid, 0, 0);
        core.finalizeVoting(cid);
        assertEq(uint8(_status(cid)), uint8(RunProofCore.ChallengeStatus.EvidenceVoting));

        // evidence sufficiency round: Sufficient (Confirm) 4 v Required (Deny) 1 => 80% => Confirmed
        (uint64 ee,,,,,,,,,,,,,) = core.rounds(cid, 1);
        assertGt(ee, block.timestamp);
        _round(cid, 4, 1);
        assertEq(uint8(_status(cid)), uint8(RunProofCore.ChallengeStatus.Confirmed));
        assertEq(uint8(_rstatus(id)), uint8(IRunProofCore.RecordStatus.Revoked));
        // round 0 voters were not penalised (no decisive result), round 1 loser is
        vm.prank(_voter(0x2000, 0));
        core.claimVote(cid, 0);
        assertEq(core.claimable(_voter(0x2000, 0)), VOTE_STAKE);
        vm.prank(_voter(0x2000, 0));
        core.claimVote(cid, 1);
        assertEq(core.claimable(_voter(0x2000, 0)), VOTE_STAKE + VOTE_STAKE - (VOTE_STAKE * 3000 + 9999) / 10000);
    }

    function test_evidenceRequired_inconclusive_allowsRechallenge() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, C001);
        // tie twice
        _tieAndExtendAndStartEvidence(cid);
        // Evidence Required wins 4:1
        _round(cid, 1, 4);
        assertEq(uint8(_status(cid)), uint8(RunProofCore.ChallengeStatus.Inconclusive));
        assertEq(uint8(_rstatus(id)), uint8(IRunProofCore.RecordStatus.Provisional));
        // new evidence => a fresh challenge for the same record+category is allowed
        RunProofCore.Params memory p = _p();
        vm.prank(challenger);
        uint256 cid2 = core.challengeRecord{value: p.challengeBond}(id, C001, _ev(), "ipfs://new");
        assertGt(cid2, cid);
        // but a finalized-as-Denied pair is final
    }

    function _tieAndExtendAndStartEvidence(uint256 cid) internal {
        for (uint256 r; r < 2; r++) {
            for (uint256 i; i < 2; i++) {
                if (r == 0 || true) {
                    address a = _voter(0x1000, i + r * 10);
                    address b = _voter(0x2000, i + r * 10);
                    _commit(cid, a, RunProofCore.Choice.Confirm);
                    _commit(cid, b, RunProofCore.Choice.Deny);
                }
            }
            (uint64 ce, uint64 re,,,,,,,,,,,,) = core.rounds(cid, 0);
            vm.warp(ce);
            for (uint256 i; i < 2; i++) {
                _reveal(cid, _voter(0x1000, i + r * 10), RunProofCore.Choice.Confirm);
                _reveal(cid, _voter(0x2000, i + r * 10), RunProofCore.Choice.Deny);
            }
            vm.warp(re);
            core.finalizeVoting(cid);
        }
        assertEq(uint8(_status(cid)), uint8(RunProofCore.ChallengeStatus.EvidenceVoting));
    }

    function test_lowParticipation_extendsThenInconclusive() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, C001);
        _round(cid, 1, 0); // 1 voter: quorum (min 3 voters) not met -> extended
        assertEq(uint8(_status(cid)), uint8(RunProofCore.ChallengeStatus.Voting));
        assertTrue(core.getChallenge(cid).extended);
        (, uint64 re,,,,,,,,,,,,) = core.rounds(cid, 0);
        vm.warp(re + 3 days);
        // nobody else voted: second finalize => Inconclusive, never forced
        core.finalizeVoting(cid);
        assertEq(uint8(_status(cid)), uint8(RunProofCore.ChallengeStatus.Inconclusive));
        assertEq(uint8(_rstatus(id)), uint8(IRunProofCore.RecordStatus.Provisional));
    }

    // ------------------------------------------------- settlement / rewards

    function test_categoryConfirmed_slashAndRewards() public {
        uint256 id = _submit(5000);
        uint256 stake = core.getRecord(id).stake;
        uint256 poolBefore = core.poolBalance();
        uint256 cid = _challenge(id, C001);
        // 3 confirm + 1 deny; the deny voter is wrong
        _round(cid, 3, 1);

        // player stake slashed: nothing for the player
        assertEq(core.claimable(player), 0);
        // challenger: bond back + 40% of stake
        assertEq(core.claimable(challenger), _p().challengeBond + (stake * 4000) / 10000);
        // pool gets the remaining 20%
        assertEq(core.poolBalance(), poolBefore + stake - (stake * 4000) / 10000 - (stake * 4000) / 10000);

        // correct voters: stake + share of (40% of stake + 30% of wrong voter's stake)
        uint256 rewardPool = (stake * 4000) / 10000 + (VOTE_STAKE * 3000) / 10000;
        address w = _voter(0x1000, 0);
        vm.prank(w);
        core.claimVote(cid, 0);
        assertEq(core.claimable(w), VOTE_STAKE + rewardPool / 3);
        // wrong voter: partially slashed (30%)
        address l = _voter(0x2000, 0);
        vm.prank(l);
        core.claimVote(cid, 0);
        assertEq(core.claimable(l), VOTE_STAKE - (VOTE_STAKE * 3000) / 10000);

        // no double claim
        vm.prank(w);
        vm.expectRevert("nothing to claim");
        core.claimVote(cid, 0);
        // can't settle twice
        vm.expectRevert("not votable");
        core.finalizeVoting(cid);
    }

    function test_unrevealedVoteIsPenalised() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, C001);
        address lazy = makeAddr("lazy");
        _commit(cid, lazy, RunProofCore.Choice.Confirm); // never reveals
        _round(cid, 3, 0); // 3 reveal unanimous confirm
        vm.prank(lazy);
        core.claimVote(cid, 0);
        assertEq(core.claimable(lazy), VOTE_STAKE - (VOTE_STAKE * 3000) / 10000);
    }

    function test_noOverpayment_contractStaysSolvent() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, C001);
        _round(cid, 3, 1);
        for (uint256 i; i < 3; i++) {
            vm.prank(_voter(0x1000, i));
            core.claimVote(cid, 0);
        }
        vm.prank(_voter(0x2000, 0));
        core.claimVote(cid, 0);
        _drainAndCheckSolvency(id);
    }

    function _drainAndCheckSolvency(uint256) internal {
        address[6] memory who =
            [challenger, player, _voter(0x1000, 0), _voter(0x1000, 1), _voter(0x1000, 2), _voter(0x2000, 0)];
        for (uint256 i; i < who.length; i++) {
            if (core.claimable(who[i]) > 0) {
                vm.prank(who[i]);
                core.withdraw();
            }
        }
        // what's left must cover the pool accounting
        assertGe(address(core).balance, core.poolBalance());
        // owner cannot take more than the free pool
        uint256 tooMuch = core.poolBalance() + 1;
        vm.prank(owner);
        vm.expectRevert("exceeds free pool");
        core.withdrawPool(owner, tooMuch);
        // and strangers cannot touch it
        vm.prank(makeAddr("thief"));
        vm.expectRevert();
        core.withdrawPool(makeAddr("thief"), 1);
    }

    // -------------------------------------------------------- special challenge

    function test_specialChallenge_after30Days_paidFromPool_notPlayerStake() public {
        uint256 id = _submit(5000);
        uint256 stake = core.getRecord(id).stake;
        vm.warp(block.timestamp + 30 days + 1);
        core.finalizeRecord(id);
        vm.prank(player);
        core.withdraw(); // player already got the stake back
        assertEq(core.claimable(player), 0);

        RunProofCore.Params memory p = _p();
        uint256 bond = p.challengeBond * p.specialBondMultiplier;
        vm.prank(challenger);
        vm.expectRevert("insufficient bond");
        core.challengeRecord{value: p.challengeBond}(id, R003(), _ev(), "ipfs://new");

        uint256 poolBefore = core.poolBalance();
        vm.prank(challenger);
        uint256 cid = core.challengeRecord{value: bond}(id, R003(), _ev(), "ipfs://new");
        assertTrue(core.getChallenge(cid).special);
        assertEq(core.reservedPool(), p.specialReward);

        _round(cid, 3, 0);
        assertEq(uint8(_status(cid)), uint8(RunProofCore.ChallengeStatus.Confirmed));
        assertEq(uint8(_rstatus(id)), uint8(IRunProofCore.RecordStatus.Revoked));
        assertEq(core.reservedPool(), 0);
        // challenger: bond + 40% of the pool reward; player stake untouched/irrelevant
        assertEq(core.claimable(challenger), bond + (p.specialReward * 4000) / 10000);
        assertEq(core.poolBalance(), poolBefore - (p.specialReward * 8000) / 10000);
        assertGt(stake, 0);
    }

    function R003() internal pure returns (uint256) {
        return 3;
    }

    function test_specialChallenge_revertsIfPoolCannotFundReward() public {
        // fresh deployment with an empty pool
        vm.startPrank(owner);
        RunProofCore c2 = new RunProofCore(owner, categories, reasons);
        vm.stopPrank();
        vm.prank(player);
        uint256 id = c2.submitRecord{value: 1 ether}(1, 1, 5000, _ev(), "ipfs://e");
        vm.warp(block.timestamp + 30 days + 1);
        c2.finalizeRecord(id);
        // pool only holds the 0.01 fee, special reward is 1 MON
        vm.prank(challenger);
        vm.expectRevert("pool cannot fund reward");
        c2.challengeRecord{value: 0.5 ether}(id, 1, _ev(), "ipfs://c");
    }

    function test_challengeAfterWindowOnProvisional_autoSettlesThenSpecial() public {
        uint256 id = _submit(5000);
        vm.warp(block.timestamp + 31 days);
        RunProofCore.Params memory p = _p();
        vm.prank(challenger);
        uint256 cid = core.challengeRecord{value: p.challengeBond * p.specialBondMultiplier}(id, 1, _ev(), "ipfs://c");
        assertTrue(core.getChallenge(cid).special);
        assertEq(uint8(_rstatus(id)), uint8(IRunProofCore.RecordStatus.Verified));
    }

    // -------------------------------------------------------------------- NFT

    function test_nft_mintAndRevoke() public {
        uint256 id = _submit(5000);
        vm.expectRevert("record not verified");
        nft.mint(id);

        vm.warp(block.timestamp + 30 days + 1);
        core.finalizeRecord(id);
        vm.expectEmit(true, true, true, true);
        emit RecordNFT.NFTMinted(id, player, 1, 5000, core.getRecord(id).evidenceHash);
        nft.mint(id);
        assertEq(nft.ownerOf(id), player);
        assertEq(uint8(nft.verificationStatus(id)), uint8(IRunProofCore.RecordStatus.Verified));
        vm.expectRevert();
        nft.mint(id); // only once

        // later revoked via special challenge
        RunProofCore.Params memory p = _p();
        vm.prank(challenger);
        uint256 cid = core.challengeRecord{value: p.challengeBond * p.specialBondMultiplier}(id, 1, _ev(), "ipfs://c");
        _round(cid, 3, 0);
        assertEq(nft.ownerOf(id), player); // NOT burned
        assertEq(uint8(nft.verificationStatus(id)), uint8(IRunProofCore.RecordStatus.Revoked));
        assertTrue(nft.isRevoked(id));
        string memory uri = nft.tokenURI(id);
        assertGt(bytes(uri).length, 50);
    }

    function test_nft_cannotMintRevokedOrProvisional() public {
        uint256 id = _submit(5000);
        uint256 cid = _challenge(id, 1);
        _round(cid, 3, 0);
        vm.expectRevert("record not verified");
        nft.mint(id);
    }

    // ---------------------------------------------------------- registries

    function test_registries() public view {
        assertEq(categories.divisionCount(1), 3);
        assertEq(categories.divisionNames(1, 2), "Women");
        assertTrue(categories.isDivisionActive(1, 3));
        assertFalse(categories.isDivisionActive(1, 4));
        assertEq(reasons.reasonCount(), 5);
        assertEq(reasons.getReason(1).code, "R001");
        assertEq(reasons.getReason(5).code, "R005");
        assertEq(reasons.getReason(5).name, "Invalid Measurement");
        assertFalse(reasons.isRegistered(6));
    }

    function test_categoryRankingSemanticsAreImmutable() public {
        vm.startPrank(owner);
        vm.expectRevert("ranking immutable");
        categories.updateCategory(
            1,
            "Open Score",
            "ipfs://rules/v2",
            "points",
            0,
            ICategoryRegistry.RankingDirection.LowerIsBetter,
            2,
            0.2 ether
        );
        categories.updateCategory(
            1,
            "Open Score",
            "ipfs://rules/v2",
            "points",
            0,
            ICategoryRegistry.RankingDirection.HigherIsBetter,
            2,
            0.2 ether
        );
        vm.stopPrank();
        (,, uint32 version, uint256 baseStake) = categories.rankingConfig(1);
        assertEq(version, 2);
        assertEq(baseStake, 0.2 ether);
    }

    function test_reasonProposal_approvedAt75() public {
        address proposer = makeAddr("proposer");
        vm.deal(proposer, 5 ether);
        reasons.fundRewards{value: 1 ether}();
        vm.prank(proposer);
        uint256 pid = reasons.proposeReason{value: 0.1 ether}("Unapproved Equipment", "desc", "ipfs://p");
        vm.prank(proposer);
        vm.expectRevert("name taken");
        reasons.proposeReason{value: 0.1 ether}("Unapproved Equipment", "desc", "ipfs://p");
        for (uint256 i; i < 4; i++) {
            address v = _voter(0x3000, i);
            vm.deal(v, 5 ether);
            vm.prank(v);
            reasons.voteOnProposal{value: 1 ether}(pid, i < 3); // 3 for, 1 against = 75%
        }
        vm.expectRevert("voting open");
        reasons.finalizeProposal(pid);
        vm.warp(block.timestamp + 3 days);
        reasons.finalizeProposal(pid);
        assertTrue(reasons.isRegistered(6));
        assertEq(reasons.getReason(6).code, "R006");
        assertEq(reasons.claimable(proposer), 0.1 ether + 0.1 ether);
        vm.prank(_voter(0x3000, 0));
        reasons.claimVoteStake(pid);
        vm.prank(_voter(0x3000, 0));
        vm.expectRevert("nothing to claim");
        reasons.claimVoteStake(pid);
    }

    function test_reasonProposal_rejectedBelow75() public {
        address proposer = makeAddr("proposer");
        vm.deal(proposer, 5 ether);
        vm.prank(proposer);
        uint256 pid = reasons.proposeReason{value: 0.1 ether}("Weak Claim", "desc", "ipfs://p");
        for (uint256 i; i < 4; i++) {
            address v = _voter(0x3000, i);
            vm.deal(v, 5 ether);
            vm.prank(v);
            reasons.voteOnProposal{value: 1 ether}(pid, i < 2);
        }
        vm.warp(block.timestamp + 3 days);
        reasons.finalizeProposal(pid);
        assertFalse(reasons.isRegistered(6));
        assertEq(reasons.claimable(proposer), 0);
    }

    // --------------------------------------------------------------- security

    function test_withdraw_reentrancyGuarded() public {
        Reenter r = new Reenter(core);
        vm.deal(address(r), 5 ether);
        r.submit{value: 1 ether}();
        vm.warp(block.timestamp + 30 days + 1);
        core.finalizeRecord(1);
        uint256 owed = core.claimable(address(r));
        uint256 before_ = address(core).balance;
        r.attack();
        // attacker only ever received what it was owed, exactly once
        assertEq(address(core).balance, before_ - owed);
        assertEq(core.claimable(address(r)), 0);
    }
}

contract Reenter {
    RunProofCore core;
    uint256 hits;

    constructor(RunProofCore c) {
        core = c;
    }

    function submit() external payable {
        core.submitRecord{value: msg.value}(1, 1, 5000, keccak256("reenter"), "ipfs://r");
    }

    function attack() external {
        core.withdraw();
    }

    receive() external payable {
        if (hits++ < 2) {
            try core.withdraw() {} catch {}
        }
    }
}
