export const demoUsers = [
  { id: "user_alice", walletAddress: "0x1000000000000000000000000000000000000001", createdAt: "2026-11-18T08:00:00.000Z" },
  { id: "user_bob", walletAddress: "0x2000000000000000000000000000000000000002", createdAt: "2026-11-18T09:00:00.000Z" },
  { id: "user_carol", walletAddress: "0x3000000000000000000000000000000000000003", createdAt: "2026-11-19T10:00:00.000Z" },
  { id: "user_dave", walletAddress: "0x4000000000000000000000000000000000000004", createdAt: "2026-11-19T11:00:00.000Z" },
  { id: "user_admin", walletAddress: "0xa00000000000000000000000000000000000000a", createdAt: "2026-11-18T07:00:00.000Z" },
];

export const demoGames = [
  { id: "game_tetris", name: "Tetris", supportedModes: ["marathon", "sprint", "ultra"], rulesVersion: "1.0.0" },
];

export const demoRecords = [
  {
    id: "rec_verified_001", chainRecordId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    playerAddress: demoUsers[0].walletAddress, gameId: "game_tetris", gameMode: "marathon", score: 125430,
    stakeAmount: "1000000000000000000", videoUrl: "https://cdn.runproof.demo/videos/alice-marathon.mp4",
    replayUrl: "https://cdn.runproof.demo/replays/alice-marathon.json", evidenceHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    status: "VERIFIED", submittedAt: "2026-11-20T08:00:00.000Z", challengeDeadline: "2026-11-20T10:00:00.000Z",
    transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
  },
  {
    id: "rec_verified_002", chainRecordId: "0x2222222222222222222222222222222222222222222222222222222222222222",
    playerAddress: demoUsers[1].walletAddress, gameId: "game_tetris", gameMode: "marathon", score: 119870,
    stakeAmount: "1000000000000000000", videoUrl: "https://cdn.runproof.demo/videos/bob-marathon.mp4",
    replayUrl: "https://cdn.runproof.demo/replays/bob-marathon.json", evidenceHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    status: "VERIFIED", submittedAt: "2026-11-20T09:00:00.000Z", challengeDeadline: "2026-11-20T11:00:00.000Z",
    transactionHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
  },
  {
    id: "rec_voting_003", chainRecordId: "0x3333333333333333333333333333333333333333333333333333333333333333",
    playerAddress: demoUsers[2].walletAddress, gameId: "game_tetris", gameMode: "marathon", score: 98450,
    stakeAmount: "500000000000000000", videoUrl: "https://cdn.runproof.demo/videos/carol-marathon.mp4",
    replayUrl: null, evidenceHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    status: "CHALLENGE_PERIOD", submittedAt: "2026-11-21T08:00:00.000Z", challengeDeadline: "2026-11-23T08:00:00.000Z",
    transactionHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
  },
  {
    id: "rec_revoked_004", chainRecordId: "0x4444444444444444444444444444444444444444444444444444444444444444",
    playerAddress: demoUsers[3].walletAddress, gameId: "game_tetris", gameMode: "sprint", score: 250000,
    stakeAmount: "2000000000000000000", videoUrl: "https://cdn.runproof.demo/videos/dave-sprint.mp4",
    replayUrl: null, evidenceHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    status: "REVOKED", submittedAt: "2026-11-19T08:00:00.000Z", challengeDeadline: "2026-11-20T08:00:00.000Z",
    transactionHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
  },
];

export const demoCheats = [
  {
    id: "cheat_tool_assist", chainCheatId: "0x5555555555555555555555555555555555555555555555555555555555555555",
    cheatCode: "TOOL_ASSIST", name: "External tool assistance", description: "Using automation or an external solver to generate moves.",
    gameId: "game_tetris", status: "ACTIVE", createdAt: "2026-11-18T08:00:00.000Z",
  },
  {
    id: "cheat_video_edit", chainCheatId: "0x6666666666666666666666666666666666666666666666666666666666666666",
    cheatCode: "VIDEO_EDIT", name: "Edited gameplay video", description: "The submitted video contains cuts, speed changes, or altered frames.",
    gameId: "game_tetris", status: "ACTIVE", createdAt: "2026-11-18T08:05:00.000Z",
  },
];

export const demoChallenges = [
  {
    id: "challenge_voting_001", chainChallengeId: "0x7777777777777777777777777777777777777777777777777777777777777777",
    recordId: "rec_voting_003", cheatId: "cheat_tool_assist", challenger: demoUsers[1].walletAddress,
    evidenceHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", status: "VOTING",
    createdAt: "2026-11-21T09:00:00.000Z", transactionHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
  },
  {
    id: "challenge_upheld_002", chainChallengeId: "0x8888888888888888888888888888888888888888888888888888888888888888",
    recordId: "rec_revoked_004", cheatId: "cheat_video_edit", challenger: demoUsers[0].walletAddress,
    evidenceHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", status: "UPHELD",
    createdAt: "2026-11-19T10:00:00.000Z", transactionHash: "0x8888888888888888888888888888888888888888888888888888888888888888",
  },
];

export const demoVotes = [
  {
    id: "vote_001", challengeId: "challenge_voting_001", voterAddress: demoUsers[0].walletAddress, votingChoice: null,
    stakeAmount: "100000000000000000", commitHash: "0x9999999999999999999999999999999999999999999999999999999999999999",
    transactionHash: "0x9999999999999999999999999999999999999999999999999999999999999999", status: "COMMITTED", createdAt: "2026-11-21T09:30:00.000Z",
  },
  {
    id: "vote_002", challengeId: "challenge_upheld_002", voterAddress: demoUsers[1].walletAddress, votingChoice: "YES",
    stakeAmount: "200000000000000000", commitHash: "0x1212121212121212121212121212121212121212121212121212121212121212",
    transactionHash: "0xabababababababababababababababababababababababababababababababab", status: "FINALIZED", createdAt: "2026-11-19T11:00:00.000Z",
  },
];

export const demoRewards = [
  {
    id: "reward_001", chainRewardId: "0x3434343434343434343434343434343434343434343434343434343434343434",
    walletAddress: demoUsers[0].walletAddress, amount: "1500000000000000000", rewardType: "CHALLENGE_SUCCESS",
    relatedRecordId: "rec_revoked_004", transactionHash: "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    createdAt: "2026-11-20T12:00:00.000Z",
  },
  {
    id: "reward_002", chainRewardId: "0x5656565656565656565656565656565656565656565656565656565656565656",
    walletAddress: demoUsers[1].walletAddress, amount: "300000000000000000", rewardType: "VOTE_REWARD",
    relatedRecordId: "rec_revoked_004", transactionHash: "0xefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
    createdAt: "2026-11-20T12:05:00.000Z",
  },
];

export const demoNfts = [
  {
    id: "nft_001", recordId: "rec_verified_001", tokenId: "1", ownerAddress: demoUsers[0].walletAddress,
    status: "MINTED", transactionHash: "0x1357135713571357135713571357135713571357135713571357135713571357",
    createdAt: "2026-11-20T12:10:00.000Z",
  },
];
