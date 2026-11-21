import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { AppError, pageMeta } from "./api";
import { prisma } from "./db";
import {
  demoChallengeRounds, demoChallenges, demoCheats, demoEvidence, demoGameModes, demoGames,
  demoNfts, demoRecords, demoRewards, demoStakeFlows, demoUsers, demoVotes,
} from "./demo-data";

type MockRow = Record<string, any>;
type MockDb = {
  users: MockRow[]; games: MockRow[]; gameModes: MockRow[]; cheats: MockRow[]; records: MockRow[];
  challenges: MockRow[]; challengeRounds: MockRow[]; votes: MockRow[]; evidence: MockRow[];
  rewards: MockRow[]; stakeFlows: MockRow[]; nfts: MockRow[];
};
const globalForMock = globalThis as unknown as { runProofMock?: MockDb };
function createMockDb(): MockDb {
  return structuredClone({
    users: demoUsers, games: demoGames, gameModes: demoGameModes, cheats: demoCheats, records: demoRecords,
    challenges: demoChallenges, challengeRounds: demoChallengeRounds, votes: demoVotes, evidence: demoEvidence,
    rewards: demoRewards, stakeFlows: demoStakeFlows, nfts: demoNfts,
  });
}
function mockDb() {
  globalForMock.runProofMock ??= createMockDb();
  return globalForMock.runProofMock;
}
const isMock = () => process.env.DATA_MODE === "mock";
const skip = (page: number, limit: number) => (page - 1) * limit;

type ListResult<T> = { items: T[]; pagination: ReturnType<typeof pageMeta> };
function mockPage<T>(rows: T[], page: number, limit: number): ListResult<T> {
  return { items: rows.slice(skip(page, limit), skip(page, limit) + limit), pagination: pageMeta(page, limit, rows.length) };
}
function notFound(resource: string): never {
  throw new AppError(404, "NOT_FOUND", `${resource} not found`);
}
function maxRound(rounds: MockRow[]) {
  return rounds.reduce<MockRow | null>((latest, round) => !latest || round.round > latest.round ? round : latest, null);
}
function mockGame(gameId: number) {
  const db = mockDb();
  const game = db.games.find((item) => item.id === gameId);
  return game ? { ...game, modes: db.gameModes.filter((mode) => mode.gameId === gameId) } : undefined;
}
function mockChallenge(challenge: MockRow) {
  const db = mockDb();
  return {
    ...challenge,
    round: Number(challenge.round ?? 0),
    record: db.records.find((record) => record.id === challenge.recordId),
    cheat: db.cheats.find((cheat) => cheat.id === challenge.cheatId),
    rounds: db.challengeRounds.filter((round) => round.challengeId === challenge.id).sort((a, b) => a.round - b.round),
    votes: db.votes.filter((vote) => vote.challengeId === challenge.id),
    evidence: db.evidence.filter((item) => item.challengeId === challenge.id),
  };
}
function mockRecord(record: MockRow) {
  const db = mockDb();
  return {
    ...record,
    game: mockGame(record.gameId),
    player: db.users.find((user) => user.walletAddress === record.playerAddress),
    challenges: db.challenges.filter((challenge) => challenge.recordId === record.id).map(mockChallenge),
    nft: db.nfts.find((nft) => nft.recordId === record.id) ?? null,
    rewards: db.rewards.filter((reward) => reward.recordId === record.id),
    stakeFlows: db.stakeFlows.filter((flow) => flow.recordId === record.id),
  };
}

export async function listRecords(query: { gameId?: number; gameMode?: number; status?: "PENDING" | "PROVISIONAL" | "VERIFIED" | "REVOKED"; playerAddress?: string; page: number; limit: number }) {
  if (isMock()) {
    const rows = mockDb().records
      .filter((record) => (!query.gameId || record.gameId === query.gameId) && (!query.gameMode || record.gameMode === query.gameMode) && (!query.status || record.status === query.status) && (!query.playerAddress || record.playerAddress === query.playerAddress))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const result = mockPage(rows, query.page, query.limit);
    return { ...result, items: result.items.map((record) => ({ ...record, game: mockGame(record.gameId) })) };
  }
  const where: Prisma.RecordWhereInput = { gameId: query.gameId, gameMode: query.gameMode, status: query.status, playerAddress: query.playerAddress };
  const [total, items] = await prisma.$transaction([
    prisma.record.count({ where }),
    prisma.record.findMany({ where, include: { game: { include: { modes: true } } }, orderBy: { submittedAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit }),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getRecord(recordId: number) {
  if (isMock()) {
    const record = mockDb().records.find((item) => item.id === recordId);
    if (!record) notFound("Record");
    return mockRecord(record);
  }
  const record = await prisma.record.findUnique({
    where: { id: recordId },
    include: {
      game: { include: { modes: true } }, player: true,
      challenges: { include: { cheat: true, rounds: true, votes: true, evidence: true } },
      nft: true, rewards: true, stakeFlows: true,
    },
  });
  if (!record) notFound("Record");
  return record;
}

export async function createRecord(input: {
  recordId: number; playerAddress: string; gameId: number; gameMode: number; score: string; stakeAmount: string;
  evidenceHash: string; evidenceURI: string; challengeDeadline: string; transactionHash: string;
}) {
  if (isMock()) {
    const db = mockDb();
    const game = db.games.find((item) => item.id === input.gameId);
    if (!game) notFound("Game");
    const mode = db.gameModes.find((item) => item.gameId === input.gameId && item.modeId === input.gameMode);
    if (!mode || !mode.active) throw new AppError(400, "UNSUPPORTED_GAME_MODE", "Game mode is not active in GameRegistry");
    if (db.records.some((record) => record.id === input.recordId || record.transactionHash === input.transactionHash || record.evidenceHash === input.evidenceHash)) {
      throw new AppError(409, "DUPLICATE_RESOURCE", "Record ID, transaction or evidence has already been submitted");
    }
    if (!db.users.some((user) => user.walletAddress === input.playerAddress)) db.users.push({ id: `user_${randomUUID()}`, walletAddress: input.playerAddress, createdAt: new Date().toISOString() });
    const now = new Date().toISOString();
    db.records.push({
      id: input.recordId, ...input, score: BigInt(input.score), status: "PENDING", gameVersion: game.gameVersion,
      ruleVersion: game.ruleVersion, stakeSettled: false, activeChallenges: 0, logIndex: 0, blockNumber: null,
      indexedAt: null, createdAt: now, updatedAt: now,
    });
    return getRecord(input.recordId);
  }
  return prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({ where: { id: input.gameId }, include: { modes: true } });
    if (!game) notFound("Game");
    if (!game.modes.some((mode) => mode.modeId === input.gameMode && mode.active)) throw new AppError(400, "UNSUPPORTED_GAME_MODE", "Game mode is not active in GameRegistry");
    await tx.user.upsert({ where: { walletAddress: input.playerAddress }, update: {}, create: { walletAddress: input.playerAddress } });
    await tx.record.create({
      data: {
        id: input.recordId, playerAddress: input.playerAddress, gameId: input.gameId, gameMode: input.gameMode,
        score: BigInt(input.score), stakeAmount: input.stakeAmount, evidenceHash: input.evidenceHash, evidenceURI: input.evidenceURI,
        status: "PENDING", submittedAt: new Date(), challengeDeadline: new Date(input.challengeDeadline),
        gameVersion: game.gameVersion, ruleVersion: game.ruleVersion, transactionHash: input.transactionHash,
      },
    });
    return tx.record.findUniqueOrThrow({
      where: { id: input.recordId },
      include: { game: { include: { modes: true } }, player: true, challenges: { include: { cheat: true, rounds: true, votes: true, evidence: true } }, nft: true, rewards: true, stakeFlows: true },
    });
  });
}

export async function getLeaderboard(query: { gameId: number; gameMode: number; limit: number }) {
  if (isMock()) {
    const rows = mockDb().records
      .filter((record) => record.gameId === query.gameId && record.gameMode === query.gameMode && record.status === "VERIFIED")
      .sort((a, b) => a.score === b.score ? a.submittedAt.localeCompare(b.submittedAt) : a.score > b.score ? -1 : 1)
      .slice(0, query.limit)
      .map((record, index) => ({ rank: index + 1, id: record.id, playerAddress: record.playerAddress, score: record.score, evidenceURI: record.evidenceURI, submittedAt: record.submittedAt, transactionHash: record.transactionHash }));
    return { gameId: query.gameId, gameMode: query.gameMode, items: rows };
  }
  const rows = await prisma.record.findMany({
    where: { gameId: query.gameId, gameMode: query.gameMode, status: "VERIFIED" },
    select: { id: true, playerAddress: true, score: true, evidenceURI: true, submittedAt: true, transactionHash: true },
    orderBy: [{ score: "desc" }, { submittedAt: "asc" }], take: query.limit,
  });
  return { gameId: query.gameId, gameMode: query.gameMode, items: rows.map((row, index) => ({ rank: index + 1, ...row })) };
}

export async function listChallenges(query: {
  recordId?: number; cheatId?: number; challenger?: string;
  status?: "PENDING" | "VOTING" | "EVIDENCE_VOTING" | "CONFIRMED" | "DENIED" | "INCONCLUSIVE"; page: number; limit: number;
}) {
  if (isMock()) {
    const rows = mockDb().challenges
      .filter((challenge) => (!query.recordId || challenge.recordId === query.recordId) && (!query.cheatId || challenge.cheatId === query.cheatId) && (!query.challenger || challenge.challenger === query.challenger) && (!query.status || challenge.status === query.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const result = mockPage(rows, query.page, query.limit);
    return { ...result, items: result.items.map(mockChallenge) };
  }
  const where: Prisma.ChallengeWhereInput = { recordId: query.recordId, cheatId: query.cheatId, challenger: query.challenger, status: query.status };
  const [total, items] = await prisma.$transaction([
    prisma.challenge.count({ where }),
    prisma.challenge.findMany({
      where, include: { record: true, cheat: true, rounds: true, votes: true, evidence: true },
      orderBy: { createdAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit,
    }),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getChallenge(challengeId: number) {
  if (isMock()) {
    const challenge = mockDb().challenges.find((item) => item.id === challengeId);
    if (!challenge) notFound("Challenge");
    return mockChallenge(challenge);
  }
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: { record: true, cheat: true, rounds: { orderBy: { round: "asc" } }, votes: { orderBy: { createdAt: "desc" } }, evidence: { orderBy: { createdAt: "asc" } } },
  });
  if (!challenge) notFound("Challenge");
  return challenge;
}

export async function createChallenge(input: {
  challengeId: number; recordId: number; cheatId: number; challenger: string; bond: string;
  evidenceHash: string; evidenceURI: string; special: boolean; transactionHash: string;
}) {
  if (isMock()) {
    const db = mockDb();
    const record = db.records.find((item) => item.id === input.recordId);
    if (!record) notFound("Record");
    if (!record.indexedAt) throw new AppError(409, "CHAIN_RECORD_REQUIRED", "Record must be confirmed on-chain before it can be challenged");
    const cheat = db.cheats.find((item) => item.id === input.cheatId);
    if (!cheat || cheat.status !== "ACTIVE") throw new AppError(400, "INVALID_CHEAT", "Cheat must be active in CheatRegistry");
    if (!["PROVISIONAL", "VERIFIED"].includes(record.status)) throw new AppError(409, "CHALLENGE_CLOSED", "Record status does not accept challenges");
    if (!input.special && (record.status !== "PROVISIONAL" || Date.parse(record.challengeDeadline) <= Date.now())) throw new AppError(409, "CHALLENGE_CLOSED", "Normal challenge window is closed; use a special challenge when eligible");
    if (input.special && record.status !== "VERIFIED") throw new AppError(409, "SPECIAL_CHALLENGE_NOT_ELIGIBLE", "Special challenges require a Verified record");
    if (db.challenges.some((challenge) => challenge.id === input.challengeId || challenge.transactionHash === input.transactionHash || challenge.evidenceHash === input.evidenceHash)) throw new AppError(409, "DUPLICATE_RESOURCE", "Challenge ID, transaction or evidence has already been used");
    if (!db.users.some((user) => user.walletAddress === input.challenger)) db.users.push({ id: `user_${randomUUID()}`, walletAddress: input.challenger, createdAt: new Date().toISOString() });
    db.challenges.push({
      id: input.challengeId, recordId: input.recordId, cheatId: input.cheatId, challenger: input.challenger,
      bond: input.bond, evidenceHash: input.evidenceHash, evidenceURI: input.evidenceURI, transactionHash: input.transactionHash,
      special: input.special, reserved: "0", status: "PENDING", round: 0, extended: false,
      evidenceCount: 0, createdAt: new Date().toISOString(), logIndex: 0, blockNumber: null, indexedAt: null,
    });
    record.activeChallenges = Number(record.activeChallenges ?? 0) + 1;
    return getChallenge(input.challengeId);
  }
  return prisma.$transaction(async (tx) => {
    const record = await tx.record.findUnique({ where: { id: input.recordId } });
    if (!record) notFound("Record");
    if (!record.indexedAt) throw new AppError(409, "CHAIN_RECORD_REQUIRED", "Record must be confirmed on-chain before it can be challenged");
    const cheat = await tx.cheat.findUnique({ where: { id: input.cheatId } });
    if (!cheat || cheat.status !== "ACTIVE") throw new AppError(400, "INVALID_CHEAT", "Cheat must be active in CheatRegistry");
    if (!["PROVISIONAL", "VERIFIED"].includes(record.status)) throw new AppError(409, "CHALLENGE_CLOSED", "Record status does not accept challenges");
    if (!input.special && (record.status !== "PROVISIONAL" || record.challengeDeadline <= new Date())) throw new AppError(409, "CHALLENGE_CLOSED", "Normal challenge window is closed; use a special challenge when eligible");
    if (input.special && record.status !== "VERIFIED") throw new AppError(409, "SPECIAL_CHALLENGE_NOT_ELIGIBLE", "Special challenges require a Verified record");
    await tx.user.upsert({ where: { walletAddress: input.challenger }, update: {}, create: { walletAddress: input.challenger } });
    await tx.challenge.create({
      data: {
        id: input.challengeId, recordId: input.recordId, cheatId: input.cheatId, challenger: input.challenger,
        bond: input.bond, evidenceHash: input.evidenceHash, evidenceURI: input.evidenceURI, status: "PENDING",
        special: input.special, transactionHash: input.transactionHash, createdAt: new Date(),
      },
    });
    await tx.record.update({ where: { id: input.recordId }, data: { activeChallenges: { increment: 1 } } });
    return tx.challenge.findUniqueOrThrow({
      where: { id: input.challengeId },
      include: { record: true, cheat: true, rounds: true, votes: true, evidence: true },
    });
  });
}

type VoteLike = { round: number; stakeAmount: { toString(): string } | string; votingPower?: bigint | null; votingChoice?: string | null; revealed?: boolean };
function votingSummary(votes: Array<VoteLike | MockRow>, round: number | null) {
  const scoped = votes.filter((vote) => round === null || Number(vote.round) === round);
  return {
    round,
    totalVotes: scoped.length,
    revealedVoters: scoped.filter((vote) => vote.revealed !== false).length,
    totalStake: scoped.reduce((sum, vote) => sum + BigInt(vote.stakeAmount.toString()), 0n).toString(),
    confirmPower: scoped.filter((vote) => vote.votingChoice === "CONFIRM").reduce((sum, vote) => sum + BigInt(vote.votingPower ?? 0), 0n).toString(),
    denyPower: scoped.filter((vote) => vote.votingChoice === "DENY").reduce((sum, vote) => sum + BigInt(vote.votingPower ?? 0), 0n).toString(),
    confirmVotes: scoped.filter((vote) => vote.votingChoice === "CONFIRM").length,
    denyVotes: scoped.filter((vote) => vote.votingChoice === "DENY").length,
  };
}
function withVotingSummary<T extends { votes: any[]; rounds: any[]; round?: number }>(challenge: T) {
  const currentRound = challenge.rounds.find((round) => round.round === challenge.round) ?? maxRound(challenge.rounds);
  return { ...challenge, currentRound, summary: votingSummary(challenge.votes, currentRound?.round ?? null) };
}

export async function listVoting(query: { status?: "PENDING" | "VOTING" | "EVIDENCE_VOTING" | "CONFIRMED" | "DENIED" | "INCONCLUSIVE"; page: number; limit: number }) {
  const statuses = query.status ? [query.status] : ["PENDING", "VOTING", "EVIDENCE_VOTING"];
  if (isMock()) {
    const rows = mockDb().challenges.filter((challenge) => statuses.includes(challenge.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const result = mockPage(rows, query.page, query.limit);
    return { ...result, items: result.items.map((challenge) => withVotingSummary(mockChallenge(challenge))) };
  }
  const where: Prisma.ChallengeWhereInput = { status: { in: statuses as any } };
  const [total, rows] = await prisma.$transaction([
    prisma.challenge.count({ where }),
    prisma.challenge.findMany({ where, include: { record: true, cheat: true, rounds: true, votes: true, evidence: true }, orderBy: { createdAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit }),
  ]);
  return { items: rows.map(withVotingSummary), pagination: pageMeta(query.page, query.limit, total) };
}

export async function getVoting(challengeId: number) {
  return withVotingSummary(await getChallenge(challengeId));
}

export async function listCheats(query: { status?: "ACTIVE" | "INACTIVE"; page: number; limit: number }) {
  if (isMock()) {
    const rows = mockDb().cheats.filter((cheat) => !query.status || cheat.status === query.status);
    return mockPage(rows, query.page, query.limit);
  }
  const where: Prisma.CheatWhereInput = { status: query.status };
  const [total, items] = await prisma.$transaction([
    prisma.cheat.count({ where }),
    prisma.cheat.findMany({ where, orderBy: { id: "asc" }, skip: skip(query.page, query.limit), take: query.limit }),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getCheat(cheatId: number) {
  if (isMock()) {
    const cheat = mockDb().cheats.find((item) => item.id === cheatId);
    if (!cheat) notFound("Cheat");
    return cheat;
  }
  const cheat = await prisma.cheat.findUnique({ where: { id: cheatId } });
  if (!cheat) notFound("Cheat");
  return cheat;
}

export async function createCheat(input: { cheatId: number; cheatCode: string; name: string; description?: string; evidenceURI?: string }) {
  if (isMock()) {
    const db = mockDb();
    const existing = db.cheats.find((cheat) => cheat.id === input.cheatId);
    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, input, { status: "ACTIVE", updatedAt: now });
      return existing;
    }
    const cheat = { ...input, description: input.description ?? null, evidenceURI: input.evidenceURI ?? null, discovererAddress: null, status: "ACTIVE", gameId: null, createdAt: now, updatedAt: now };
    db.cheats.push(cheat);
    return cheat;
  }
  const { cheatId, ...data } = input;
  return prisma.cheat.upsert({
    where: { id: cheatId },
    update: { ...data, status: "ACTIVE" },
    create: { id: cheatId, ...data, status: "ACTIVE" },
  });
}

export async function getUser(address: string) {
  if (isMock()) {
    const db = mockDb();
    const user = db.users.find((item) => item.walletAddress === address);
    if (!user) notFound("User");
    return {
      ...user,
      stats: {
        recordCount: db.records.filter((item) => item.playerAddress === address).length,
        challengeCount: db.challenges.filter((item) => item.challenger === address).length,
        voteCount: db.votes.filter((item) => item.voterAddress === address).length,
        rewardCount: db.rewards.filter((item) => item.walletAddress === address).length,
        stakeFlowCount: db.stakeFlows.filter((item) => item.walletAddress === address).length,
        nftCount: db.nfts.filter((item) => item.ownerAddress === address).length,
      },
    };
  }
  const user = await prisma.user.findUnique({ where: { walletAddress: address } });
  if (!user) notFound("User");
  const [recordCount, challengeCount, voteCount, rewardCount, stakeFlowCount, nftCount] = await prisma.$transaction([
    prisma.record.count({ where: { playerAddress: address } }),
    prisma.challenge.count({ where: { challenger: address } }),
    prisma.vote.count({ where: { voterAddress: address } }),
    prisma.reward.count({ where: { walletAddress: address } }),
    prisma.stakeFlow.count({ where: { walletAddress: address } }),
    prisma.nFT.count({ where: { ownerAddress: address } }),
  ]);
  return { ...user, stats: { recordCount, challengeCount, voteCount, rewardCount, stakeFlowCount, nftCount } };
}

export async function getUserRecords(address: string, query: { page: number; limit: number }) {
  await getUser(address);
  return listRecords({ playerAddress: address, page: query.page, limit: query.limit });
}

export async function getUserVotes(address: string, query: { page: number; limit: number }) {
  await getUser(address);
  if (isMock()) {
    const rows = mockDb().votes.filter((vote) => vote.voterAddress === address).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const result = mockPage(rows, query.page, query.limit);
    return { ...result, items: result.items.map((vote) => ({ ...vote, challenge: mockDb().challenges.find((challenge) => challenge.id === vote.challengeId) })) };
  }
  const where = { voterAddress: address };
  const [total, items] = await prisma.$transaction([
    prisma.vote.count({ where }),
    prisma.vote.findMany({ where, include: { challenge: { include: { record: true, cheat: true, rounds: true } } }, orderBy: { createdAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit }),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getUserRewards(address: string, query: { page: number; limit: number }) {
  await getUser(address);
  if (isMock()) {
    const rows = mockDb().rewards.filter((reward) => reward.walletAddress === address).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return mockPage(rows, query.page, query.limit);
  }
  const where = { walletAddress: address };
  const [total, items] = await prisma.$transaction([
    prisma.reward.count({ where }), prisma.reward.findMany({ where, orderBy: { createdAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit }),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getUserStakeFlows(address: string, query: { page: number; limit: number }) {
  await getUser(address);
  if (isMock()) {
    const rows = mockDb().stakeFlows.filter((flow) => flow.walletAddress === address).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return mockPage(rows, query.page, query.limit);
  }
  const where = { walletAddress: address };
  const [total, items] = await prisma.$transaction([
    prisma.stakeFlow.count({ where }), prisma.stakeFlow.findMany({ where, orderBy: { createdAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit }),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function listNfts(query: { ownerAddress?: string; recordId?: number; status?: "PROVISIONAL" | "VERIFIED" | "REVOKED"; page: number; limit: number }) {
  if (isMock()) {
    const rows = mockDb().nfts.filter((nft) => (!query.ownerAddress || nft.ownerAddress === query.ownerAddress) && (!query.recordId || nft.recordId === query.recordId) && (!query.status || nft.status === query.status));
    return mockPage(rows, query.page, query.limit);
  }
  const where: Prisma.NFTWhereInput = { ownerAddress: query.ownerAddress, recordId: query.recordId, status: query.status };
  const [total, items] = await prisma.$transaction([
    prisma.nFT.count({ where }), prisma.nFT.findMany({ where, include: { record: true }, orderBy: { createdAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit }),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getUserNfts(address: string, query: { page: number; limit: number }) {
  await getUser(address);
  return listNfts({ ownerAddress: address, page: query.page, limit: query.limit });
}

export async function getNft(tokenId: number) {
  if (isMock()) {
    const nft = mockDb().nfts.find((item) => item.id === tokenId);
    if (!nft) notFound("NFT");
    return nft;
  }
  const nft = await prisma.nFT.findUnique({ where: { id: tokenId }, include: { record: true } });
  if (!nft) notFound("NFT");
  return nft;
}

export async function listGames() {
  if (isMock()) return { items: mockDb().games.map((game) => mockGame(game.id)) };
  return { items: await prisma.game.findMany({ include: { modes: { orderBy: { modeId: "asc" } } }, orderBy: { id: "asc" } }) };
}

export async function getGame(gameId: number) {
  if (isMock()) {
    const game = mockGame(gameId);
    if (!game) notFound("Game");
    return game;
  }
  const game = await prisma.game.findUnique({ where: { id: gameId }, include: { modes: { orderBy: { modeId: "asc" } }, cheats: true } });
  if (!game) notFound("Game");
  return game;
}
