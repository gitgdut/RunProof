const ALICE = "0x1000000000000000000000000000000000000001";
const BOB = "0x2000000000000000000000000000000000000002";
const CAROL = "0x3000000000000000000000000000000000000003";
const DAVE = "0x4000000000000000000000000000000000000004";
const EVE = "0x5000000000000000000000000000000000000005";

export const demoUsers = [ALICE, BOB, CAROL, DAVE, EVE];

/**
 * Mirrors the demo deployment so `/api/*` can be exercised without PostgreSQL.
 * Values match the seeded contracts: 5 categories, Minecraft Any% with Java/Bedrock,
 * Click Speed with 2 decimals, one challenge on a fabricated-evidence Minecraft run.
 */
export const demoCategories = [
  {
    id: 1, name: "100m Sprint", descriptionURI: "ipfs://runproof-rules/100m-sprint-v1", unit: "ms", decimals: 0,
    direction: 2, ruleVersion: 1, baseStake: "50000000000000000", active: true,
    createdAt: "2026-11-20T08:00:00.000Z", updatedAt: "2026-11-20T08:00:00.000Z",
  },
  {
    id: 2, name: "Pull-ups", descriptionURI: "ipfs://runproof-rules/pull-ups-v1", unit: "reps", decimals: 0,
    direction: 1, ruleVersion: 1, baseStake: "50000000000000000", active: true,
    createdAt: "2026-11-20T08:00:00.000Z", updatedAt: "2026-11-20T08:00:00.000Z",
  },
  {
    id: 3, name: "Tetris Score", descriptionURI: "ipfs://runproof-rules/tetris-v1", unit: "points", decimals: 0,
    direction: 1, ruleVersion: 1, baseStake: "50000000000000000", active: true,
    createdAt: "2026-11-20T08:00:00.000Z", updatedAt: "2026-11-20T08:00:00.000Z",
  },
  {
    id: 4, name: "Minecraft Any%", descriptionURI: "ipfs://runproof-rules/mc-any-v1", unit: "ms", decimals: 0,
    direction: 2, ruleVersion: 1, baseStake: "50000000000000000", active: true,
    createdAt: "2026-11-20T08:00:00.000Z", updatedAt: "2026-11-20T08:00:00.000Z",
  },
  {
    id: 5, name: "Click Speed", descriptionURI: "ipfs://runproof-rules/click-speed-v1", unit: "cps", decimals: 2,
    direction: 1, ruleVersion: 1, baseStake: "50000000000000000", active: true,
    createdAt: "2026-11-20T08:00:00.000Z", updatedAt: "2026-11-20T08:00:00.000Z",
  },
];

const division = (categoryId: number, divisionId: number, name: string) => ({
  categoryId, divisionId, name, active: true,
  createdAt: "2026-11-20T08:00:00.000Z", updatedAt: "2026-11-20T08:00:00.000Z",
});

export const demoDivisions = [
  division(1, 1, "Open"),
  division(2, 1, "Open"),
  division(3, 1, "Classic"),
  division(3, 2, "Sprint"),
  division(3, 3, "Marathon"),
  division(4, 1, "Java"),
  division(4, 2, "Bedrock"),
  division(5, 1, "All"),
];

export const demoReasons = [
  { id: 1, code: "R001", name: "Fabricated Evidence", description: "Evidence was fabricated or materially altered", discovererAddress: null, registeredAt: "2026-11-20T07:40:00.000Z", registered: true, createdAt: "2026-11-20T07:40:00.000Z", updatedAt: "2026-11-20T07:40:00.000Z" },
  { id: 2, code: "R002", name: "Automated Input", description: "Gameplay input produced by automation", discovererAddress: null, registeredAt: "2026-11-20T07:40:00.000Z", registered: true, createdAt: "2026-11-20T07:40:00.000Z", updatedAt: "2026-11-20T07:40:00.000Z" },
  { id: 3, code: "R003", name: "Modified Client", description: "Modified game client or assets", discovererAddress: null, registeredAt: "2026-11-20T07:40:00.000Z", registered: true, createdAt: "2026-11-20T07:40:00.000Z", updatedAt: "2026-11-20T07:40:00.000Z" },
  { id: 4, code: "R004", name: "Replay Injection", description: "Replay produced by someone else", discovererAddress: null, registeredAt: "2026-11-20T07:40:00.000Z", registered: true, createdAt: "2026-11-20T07:40:00.000Z", updatedAt: "2026-11-20T07:40:00.000Z" },
  { id: 5, code: "R005", name: "Duplicate Submission", description: "Same run submitted more than once", discovererAddress: null, registeredAt: "2026-11-20T07:40:00.000Z", registered: true, createdAt: "2026-11-20T07:40:00.000Z", updatedAt: "2026-11-20T07:40:00.000Z" },
];

const record = (
  id: number, player: string, categoryId: number, divisionId: number, value: string,
  status: number, submittedAt: string, deadline: string, evidenceHash: string,
) => ({
  id, player, categoryId, divisionId, value, direction: demoCategories.find((item) => item.id === categoryId)!.direction,
  evidenceHash, evidenceURI: `ipfs://runproof-evidence/${id}`, stake: "100000000000000000",
  submittedAt, deadline, ruleVersion: 1, status, stakeSettled: status !== 1, activeChallenges: 0,
  transactionHash: `0x${String(id).repeat(64).slice(0, 64)}`, logIndex: id, blockNumber: BigInt(81509823 + id * 10),
  indexedAt: submittedAt, createdAt: submittedAt, updatedAt: submittedAt,
});

export const demoRecords = [
  record(1, ALICE, 4, 1, "1152345", 2, "2026-11-20T08:10:00.000Z", "2026-11-20T08:11:00.000Z", `0x${"a1".repeat(32)}`),
  record(2, BOB, 4, 1, "1180000", 2, "2026-11-20T08:20:00.000Z", "2026-11-20T08:21:00.000Z", `0x${"a2".repeat(32)}`),
  record(3, CAROL, 4, 1, "1199999", 2, "2026-11-20T08:30:00.000Z", "2026-11-20T08:31:00.000Z", `0x${"a3".repeat(32)}`),
  record(4, DAVE, 4, 2, "1300000", 2, "2026-11-20T08:40:00.000Z", "2026-11-20T08:41:00.000Z", `0x${"a4".repeat(32)}`),
  record(5, ALICE, 5, 1, "1200", 2, "2026-11-20T09:00:00.000Z", "2026-11-20T09:01:00.000Z", `0x${"a5".repeat(32)}`),
  record(6, BOB, 5, 1, "1432", 2, "2026-11-20T09:10:00.000Z", "2026-11-20T09:11:00.000Z", `0x${"a6".repeat(32)}`),
  record(7, CAROL, 1, 1, "9845", 2, "2026-11-20T09:20:00.000Z", "2026-11-20T09:21:00.000Z", `0x${"a7".repeat(32)}`),
  record(8, DAVE, 2, 1, "25", 2, "2026-11-20T09:30:00.000Z", "2026-11-20T09:31:00.000Z", `0x${"a8".repeat(32)}`),
  record(9, EVE, 4, 1, "1139999", 3, "2026-11-21T02:00:00.000Z", "2026-11-21T02:01:00.000Z", `0x${"a9".repeat(32)}`),
];

export const demoLeaderboards = [
  { categoryId: 4, divisionId: 1, bestRecordId: 1, bestValue: "1152345", blockNumber: BigInt(81509900), updatedAt: "2026-11-20T08:10:00.000Z" },
  { categoryId: 4, divisionId: 2, bestRecordId: 4, bestValue: "1300000", blockNumber: BigInt(81509940), updatedAt: "2026-11-20T08:40:00.000Z" },
  { categoryId: 5, divisionId: 1, bestRecordId: 6, bestValue: "1432", blockNumber: BigInt(81509990), updatedAt: "2026-11-20T09:10:00.000Z" },
  { categoryId: 1, divisionId: 1, bestRecordId: 7, bestValue: "9845", blockNumber: BigInt(81510020), updatedAt: "2026-11-20T09:20:00.000Z" },
  { categoryId: 2, divisionId: 1, bestRecordId: 8, bestValue: "25", blockNumber: BigInt(81510030), updatedAt: "2026-11-20T09:30:00.000Z" },
];

export const demoChallenges = [
  {
    id: 1, recordId: 9, reasonId: 1, challenger: BOB, bond: "500000000000000000", reserved: "1000000000000000000",
    evidenceHash: `0x${"b1".repeat(32)}`, evidenceURI: "ipfs://runproof-evidence/the-submission-video-is-edited",
    status: 3, round: 0, special: true, extended: true, evidenceCount: 1,
    createdAt: "2026-11-21T02:05:00.000Z", transactionHash: `0x${"c1".repeat(32)}`, logIndex: 11,
    blockNumber: BigInt(81510050), indexedAt: "2026-11-21T02:05:00.000Z",
  },
];

export const demoChallengeRounds = [
  {
    challengeId: 1, round: 0, commitEnd: "2026-11-21T02:05:30.000Z", revealEnd: "2026-11-21T02:06:00.000Z",
    confirmPower: "400", denyPower: "100", confirmStake: "400000000000000000", denyStake: "100000000000000000",
    committedStake: "500000000000000000", committedVoters: 5, revealedVoters: 5, finalized: true,
    winner: 1, winnerPower: "400", rewardPool: "430000000000000000", slashBps: 3000,
    updatedAt: "2026-11-21T02:06:00.000Z",
  },
];

export const demoVotes = [
  { id: "vote_1", challengeId: 1, voterAddress: ALICE, round: 0, votingChoice: 1, stakeAmount: "100000000000000000", votingPower: "100", commitHash: `0x${"d1".repeat(32)}`, commitTransactionHash: `0x${"d1".repeat(32)}`, revealTransactionHash: `0x${"e1".repeat(32)}`, revealed: true, claimed: false, createdAt: "2026-11-21T02:05:10.000Z", updatedAt: "2026-11-21T02:05:40.000Z" },
  { id: "vote_2", challengeId: 1, voterAddress: CAROL, round: 0, votingChoice: 1, stakeAmount: "100000000000000000", votingPower: "100", commitHash: `0x${"d2".repeat(32)}`, commitTransactionHash: `0x${"d2".repeat(32)}`, revealTransactionHash: `0x${"e2".repeat(32)}`, revealed: true, claimed: false, createdAt: "2026-11-21T02:05:12.000Z", updatedAt: "2026-11-21T02:05:42.000Z" },
  { id: "vote_3", challengeId: 1, voterAddress: DAVE, round: 0, votingChoice: 1, stakeAmount: "100000000000000000", votingPower: "100", commitHash: `0x${"d3".repeat(32)}`, commitTransactionHash: `0x${"d3".repeat(32)}`, revealTransactionHash: `0x${"e3".repeat(32)}`, revealed: true, claimed: false, createdAt: "2026-11-21T02:05:14.000Z", updatedAt: "2026-11-21T02:05:44.000Z" },
  { id: "vote_4", challengeId: 1, voterAddress: EVE, round: 0, votingChoice: 1, stakeAmount: "100000000000000000", votingPower: "100", commitHash: `0x${"d4".repeat(32)}`, commitTransactionHash: `0x${"d4".repeat(32)}`, revealTransactionHash: `0x${"e4".repeat(32)}`, revealed: true, claimed: false, createdAt: "2026-11-21T02:05:16.000Z", updatedAt: "2026-11-21T02:05:46.000Z" },
  { id: "vote_5", challengeId: 1, voterAddress: BOB, round: 0, votingChoice: 2, stakeAmount: "100000000000000000", votingPower: "100", commitHash: `0x${"d5".repeat(32)}`, commitTransactionHash: `0x${"d5".repeat(32)}`, revealTransactionHash: `0x${"e5".repeat(32)}`, revealed: true, claimed: false, createdAt: "2026-11-21T02:05:18.000Z", updatedAt: "2026-11-21T02:05:48.000Z" },
];

export const demoEvidence = [
  {
    id: "evidence_1", challengeId: 1, round: 0, submitter: BOB, evidenceHash: `0x${"b1".repeat(32)}`,
    evidenceURI: "ipfs://runproof-evidence/the-submission-video-is-edited", transactionHash: `0x${"c1".repeat(32)}`,
    logIndex: 12, blockNumber: BigInt(81510050), createdAt: "2026-11-21T02:05:05.000Z",
  },
];

export const demoRewards = [
  { id: "reward_1", source: "core", recordId: 9, reasonId: 1, challengeId: 1, proposalId: null, walletAddress: BOB, amount: "160000000000000000", kind: 0, transactionHash: `0x${"f1".repeat(32)}`, logIndex: 13, blockNumber: BigInt(81510060), createdAt: "2026-11-21T02:06:00.000Z" },
  { id: "reward_2", source: "core", recordId: 9, reasonId: 1, challengeId: 1, proposalId: null, walletAddress: ALICE, amount: "53750000000000000", kind: 2, transactionHash: `0x${"f2".repeat(32)}`, logIndex: 14, blockNumber: BigInt(81510060), createdAt: "2026-11-21T02:06:00.000Z" },
  { id: "reward_3", source: "core", recordId: 9, reasonId: 1, challengeId: 1, proposalId: null, walletAddress: CAROL, amount: "53750000000000000", kind: 2, transactionHash: `0x${"f3".repeat(32)}`, logIndex: 15, blockNumber: BigInt(81510060), createdAt: "2026-11-21T02:06:00.000Z" },
];

export const demoStakeFlows = [
  { id: "stake_1", flow: "RETURNED", recordId: 9, reasonId: 1, challengeId: 1, walletAddress: BOB, amount: "500000000000000000", kind: 1, transactionHash: `0x${"g1".repeat(32)}`, logIndex: 16, blockNumber: BigInt(81510060), createdAt: "2026-11-21T02:06:00.000Z" },
  { id: "stake_2", flow: "SLASHED", recordId: 9, reasonId: 1, challengeId: 1, walletAddress: EVE, amount: "400000000000000000", kind: 0, transactionHash: `0x${"g2".repeat(32)}`, logIndex: 17, blockNumber: BigInt(81510060), createdAt: "2026-11-21T02:06:00.000Z" },
];

export const demoWithdrawals = [
  { id: "withdraw_1", source: "core", walletAddress: BOB, amount: "210000000000000000", transactionHash: `0x${"h1".repeat(32)}`, logIndex: 18, blockNumber: BigInt(81510100), createdAt: "2026-11-21T02:10:00.000Z" },
];

export const demoNfts = [
  { id: 1, recordId: 1, ownerAddress: ALICE, status: 2, transactionHash: `0x${"i1".repeat(32)}`, logIndex: 19, createdAt: "2026-11-21T02:20:00.000Z", updatedAt: "2026-11-21T02:20:00.000Z" },
  { id: 6, recordId: 6, ownerAddress: BOB, status: 2, transactionHash: `0x${"i2".repeat(32)}`, logIndex: 20, createdAt: "2026-11-21T02:21:00.000Z", updatedAt: "2026-11-21T02:21:00.000Z" },
  { id: 9, recordId: 9, ownerAddress: EVE, status: 3, transactionHash: `0x${"i3".repeat(32)}`, logIndex: 21, createdAt: "2026-11-21T02:22:00.000Z", updatedAt: "2026-11-21T02:22:00.000Z" },
];
