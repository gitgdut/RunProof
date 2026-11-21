const ALICE = "0x1000000000000000000000000000000000000001";
const BOB = "0x2000000000000000000000000000000000000002";
const CAROL = "0x3000000000000000000000000000000000000003";
const DAVE = "0x4000000000000000000000000000000000000004";

export const demoUsers = [
  { id: "user_alice", walletAddress: ALICE, createdAt: "2026-11-18T08:00:00.000Z" },
  { id: "user_bob", walletAddress: BOB, createdAt: "2026-11-18T09:00:00.000Z" },
  { id: "user_carol", walletAddress: CAROL, createdAt: "2026-11-19T10:00:00.000Z" },
  { id: "user_dave", walletAddress: DAVE, createdAt: "2026-11-19T11:00:00.000Z" },
];

export const demoGames = [
  { id: 1, name: "Tetris", gameVersion: 1, ruleVersion: 1, active: true, createdAt: "2026-11-18T07:00:00.000Z", updatedAt: "2026-11-18T07:00:00.000Z" },
];

export const demoGameModes = [
  { gameId: 1, modeId: 1, name: "Classic", active: true, createdAt: "2026-11-18T07:00:00.000Z", updatedAt: "2026-11-18T07:00:00.000Z" },
  { gameId: 1, modeId: 2, name: "Sprint", active: true, createdAt: "2026-11-18T07:00:00.000Z", updatedAt: "2026-11-18T07:00:00.000Z" },
  { gameId: 1, modeId: 3, name: "Marathon", active: true, createdAt: "2026-11-18T07:00:00.000Z", updatedAt: "2026-11-18T07:00:00.000Z" },
];

export const demoCheats = [
  { id: 1, cheatCode: "C001", name: "Automated Input", description: "Automation performed gameplay input.", evidenceURI: "ipfs://runproof/cheats/C001", discovererAddress: null, status: "ACTIVE", gameId: 1, createdAt: "2026-11-18T07:10:00.000Z", updatedAt: "2026-11-18T07:10:00.000Z" },
  { id: 2, cheatCode: "C002", name: "RNG Manipulation", description: "Manipulating random piece generation.", evidenceURI: "ipfs://runproof/cheats/C002", discovererAddress: null, status: "ACTIVE", gameId: 1, createdAt: "2026-11-18T07:10:00.000Z", updatedAt: "2026-11-18T07:10:00.000Z" },
  { id: 3, cheatCode: "C003", name: "Memory Modification", description: "Changing runtime game memory.", evidenceURI: "ipfs://runproof/cheats/C003", discovererAddress: null, status: "ACTIVE", gameId: 1, createdAt: "2026-11-18T07:10:00.000Z", updatedAt: "2026-11-18T07:10:00.000Z" },
  { id: 4, cheatCode: "C004", name: "Replay Injection", description: "Submitting a replay not produced by the player.", evidenceURI: "ipfs://runproof/cheats/C004", discovererAddress: null, status: "ACTIVE", gameId: 1, createdAt: "2026-11-18T07:10:00.000Z", updatedAt: "2026-11-18T07:10:00.000Z" },
  { id: 5, cheatCode: "C005", name: "Modified Game Files", description: "Running a modified client or game binary.", evidenceURI: "ipfs://runproof/cheats/C005", discovererAddress: null, status: "ACTIVE", gameId: 1, createdAt: "2026-11-18T07:10:00.000Z", updatedAt: "2026-11-18T07:10:00.000Z" },
];

export const demoRecords = [
  {
    id: 1, playerAddress: ALICE, gameId: 1, gameMode: 3, score: 125430n, stakeAmount: "1000000000000000000",
    evidenceHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", evidenceURI: "ipfs://runproof/records/1",
    status: "VERIFIED", submittedAt: "2026-11-20T08:00:00.000Z", challengeDeadline: "2026-11-20T08:10:00.000Z",
    gameVersion: 1, ruleVersion: 1, stakeSettled: true, activeChallenges: 0,
    transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111", logIndex: 1, blockNumber: 100n,
    indexedAt: "2026-11-20T08:00:00.000Z", createdAt: "2026-11-20T08:00:00.000Z", updatedAt: "2026-11-20T08:10:00.000Z",
  },
  {
    id: 2, playerAddress: BOB, gameId: 1, gameMode: 3, score: 119870n, stakeAmount: "1000000000000000000",
    evidenceHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", evidenceURI: "ipfs://runproof/records/2",
    status: "VERIFIED", submittedAt: "2026-11-20T09:00:00.000Z", challengeDeadline: "2026-11-20T09:10:00.000Z",
    gameVersion: 1, ruleVersion: 1, stakeSettled: true, activeChallenges: 0,
    transactionHash: "0x2222222222222222222222222222222222222222222222222222222222222222", logIndex: 2, blockNumber: 101n,
    indexedAt: "2026-11-20T09:00:00.000Z", createdAt: "2026-11-20T09:00:00.000Z", updatedAt: "2026-11-20T09:10:00.000Z",
  },
  {
    id: 3, playerAddress: CAROL, gameId: 1, gameMode: 3, score: 98450n, stakeAmount: "500000000000000000",
    evidenceHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", evidenceURI: "ipfs://runproof/records/3",
    status: "PROVISIONAL", submittedAt: "2026-11-21T08:00:00.000Z", challengeDeadline: "2026-11-21T18:00:00.000Z",
    gameVersion: 1, ruleVersion: 1, stakeSettled: false, activeChallenges: 1,
    transactionHash: "0x3333333333333333333333333333333333333333333333333333333333333333", logIndex: 3, blockNumber: 102n,
    indexedAt: "2026-11-21T08:00:00.000Z", createdAt: "2026-11-21T08:00:00.000Z", updatedAt: "2026-11-21T08:05:00.000Z",
  },
  {
    id: 4, playerAddress: DAVE, gameId: 1, gameMode: 2, score: 250000n, stakeAmount: "2000000000000000000",
    evidenceHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", evidenceURI: "ipfs://runproof/records/4",
    status: "REVOKED", submittedAt: "2026-11-19T08:00:00.000Z", challengeDeadline: "2026-11-19T08:10:00.000Z",
    gameVersion: 1, ruleVersion: 1, stakeSettled: true, activeChallenges: 0,
    transactionHash: "0x4444444444444444444444444444444444444444444444444444444444444444", logIndex: 4, blockNumber: 103n,
    indexedAt: "2026-11-19T08:00:00.000Z", createdAt: "2026-11-19T08:00:00.000Z", updatedAt: "2026-11-19T09:00:00.000Z",
  },
];

export const demoChallenges = [
  {
    id: 1, recordId: 3, cheatId: 1, challenger: BOB, bond: "100000000000000000", reserved: "0",
    evidenceHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", evidenceURI: "ipfs://runproof/challenges/1",
    status: "VOTING", round: 0, special: false, extended: false, evidenceCount: 1,
    createdAt: "2026-11-21T08:05:00.000Z", transactionHash: "0x5555555555555555555555555555555555555555555555555555555555555555",
    logIndex: 5, blockNumber: 104n, indexedAt: "2026-11-21T08:05:00.000Z",
  },
  {
    id: 2, recordId: 4, cheatId: 4, challenger: ALICE, bond: "100000000000000000", reserved: "0",
    evidenceHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", evidenceURI: "ipfs://runproof/challenges/2",
    status: "CONFIRMED", round: 0, special: false, extended: false, evidenceCount: 1,
    createdAt: "2026-11-19T08:05:00.000Z", transactionHash: "0x6666666666666666666666666666666666666666666666666666666666666666",
    logIndex: 6, blockNumber: 105n, indexedAt: "2026-11-19T08:05:00.000Z",
  },
];

export const demoChallengeRounds = [
  {
    challengeId: 1, round: 0, commitEnd: "2026-11-21T16:02:00.000Z", revealEnd: "2026-11-21T16:04:00.000Z",
    confirmPower: 1000n, denyPower: 0n, confirmStake: "100000000000000000", denyStake: "0",
    committedStake: "200000000000000000", committedVoters: 2, revealedVoters: 1, finalized: false,
    winner: null, winnerPower: 0n, rewardPool: "0", slashBps: 0, updatedAt: "2026-11-21T14:00:00.000Z",
  },
  {
    challengeId: 2, round: 0, commitEnd: "2026-11-19T08:07:00.000Z", revealEnd: "2026-11-19T08:09:00.000Z",
    confirmPower: 4000n, denyPower: 500n, confirmStake: "400000000000000000", denyStake: "50000000000000000",
    committedStake: "450000000000000000", committedVoters: 2, revealedVoters: 2, finalized: true,
    winner: "CONFIRM", winnerPower: 4000n, rewardPool: "500000000000000000", slashBps: 3000, updatedAt: "2026-11-19T09:00:00.000Z",
  },
];

export const demoVotes = [
  {
    id: "vote_1", challengeId: 1, voterAddress: ALICE, round: 0, votingChoice: "CONFIRM", stakeAmount: "100000000000000000",
    votingPower: 1000n, commitHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
    commitTransactionHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
    revealTransactionHash: "0x8888888888888888888888888888888888888888888888888888888888888888", revealed: true, claimed: false,
    createdAt: "2026-11-21T08:06:00.000Z", updatedAt: "2026-11-21T08:08:00.000Z",
  },
  {
    id: "vote_2", challengeId: 1, voterAddress: DAVE, round: 0, votingChoice: null, stakeAmount: "100000000000000000",
    votingPower: null, commitHash: "0x9999999999999999999999999999999999999999999999999999999999999999",
    commitTransactionHash: "0x9999999999999999999999999999999999999999999999999999999999999999", revealTransactionHash: null,
    revealed: false, claimed: false, createdAt: "2026-11-21T08:07:00.000Z", updatedAt: "2026-11-21T08:07:00.000Z",
  },
];

export const demoEvidence = [
  {
    id: "evidence_1", challengeId: 2, round: 0, submitter: DAVE, evidenceHash: "0xabababababababababababababababababababababababababababababababab",
    evidenceURI: "ipfs://runproof/evidence/2", transactionHash: "0xabababababababababababababababababababababababababababababababab",
    logIndex: 7, blockNumber: 106n, createdAt: "2026-11-19T08:06:00.000Z",
  },
];

export const demoRewards = [
  {
    id: "reward_1", recordId: 4, cheatId: 4, challengeId: 2, walletAddress: ALICE, amount: "400000000000000000",
    rewardType: "CHALLENGER_REWARD", transactionHash: "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    logIndex: 8, blockNumber: 107n, createdAt: "2026-11-19T09:00:00.000Z",
  },
  {
    id: "reward_2", recordId: 4, cheatId: 4, challengeId: 2, walletAddress: BOB, amount: "200000000000000000",
    rewardType: "VOTER_REWARD", transactionHash: "0xefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
    logIndex: 9, blockNumber: 107n, createdAt: "2026-11-19T09:00:00.000Z",
  },
];

export const demoStakeFlows = [
  {
    id: "stake_1", recordId: 4, cheatId: 4, challengeId: 2, walletAddress: DAVE, amount: "2000000000000000000",
    flowType: "SLASHED", stakeKind: "PLAYER_STAKE", transactionHash: "0x1212121212121212121212121212121212121212121212121212121212121212",
    logIndex: 10, blockNumber: 107n, createdAt: "2026-11-19T09:00:00.000Z",
  },
];

export const demoNfts = [
  {
    id: 1, recordId: 1, ownerAddress: ALICE, status: "VERIFIED",
    transactionHash: "0x1357135713571357135713571357135713571357135713571357135713571357", logIndex: 11,
    createdAt: "2026-11-20T09:30:00.000Z", updatedAt: "2026-11-20T09:30:00.000Z",
  },
];
