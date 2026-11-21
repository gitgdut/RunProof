import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { AppError, pageMeta } from "./api";
import { challengeWindowHours } from "./config";
import { prisma } from "./db";
import { demoCheats, demoChallenges, demoGames, demoNfts, demoRecords, demoRewards, demoUsers, demoVotes } from "./demo-data";

type MockRow = Record<string, any>;
type MockDb = { users: MockRow[]; games: MockRow[]; records: MockRow[]; cheats: MockRow[]; challenges: MockRow[]; votes: MockRow[]; rewards: MockRow[]; nfts: MockRow[] };
const globalForMock = globalThis as unknown as { runProofMock?: MockDb };
function createMockDb(): MockDb {
  return structuredClone({ users: demoUsers, games: demoGames, records: demoRecords, cheats: demoCheats, challenges: demoChallenges, votes: demoVotes, rewards: demoRewards, nfts: demoNfts });
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
function mockRecord(record: Record<string, unknown>) {
  const db = mockDb();
  return { ...record, game: db.games.find((game) => game.id === record.gameId) };
}
function mockChallenge(challenge: Record<string, unknown>) {
  const db = mockDb();
  return {
    ...challenge,
    record: db.records.find((record) => record.id === challenge.recordId),
    cheat: db.cheats.find((cheat) => cheat.id === challenge.cheatId),
  };
}

export async function listRecords(query: { gameId?: string; gameMode?: string; status?: "PENDING" | "CHALLENGE_PERIOD" | "VERIFIED" | "REVOKED"; playerAddress?: string; page: number; limit: number }) {
  if (isMock()) {
    const rows = mockDb().records.filter((record) => (!query.gameId || record.gameId === query.gameId) && (!query.gameMode || record.gameMode === query.gameMode) && (!query.status || record.status === query.status) && (!query.playerAddress || record.playerAddress === query.playerAddress)).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const result = mockPage(rows, query.page, query.limit);
    return { ...result, items: result.items.map(mockRecord) };
  }
  const where: Prisma.RecordWhereInput = { gameId: query.gameId, gameMode: query.gameMode, status: query.status, playerAddress: query.playerAddress };
  const [total, items] = await prisma.$transaction([
    prisma.record.count({ where }),
    prisma.record.findMany({ where, include: { game: true }, orderBy: { submittedAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit }),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getRecord(id: string) {
  if (isMock()) {
    const record = mockDb().records.find((item) => item.id === id);
    if (!record) notFound("Record");
    return {
      ...mockRecord(record),
      player: mockDb().users.find((user) => user.walletAddress === record.playerAddress),
      challenges: mockDb().challenges.filter((item) => item.recordId === id).map(mockChallenge),
      nfts: mockDb().nfts.filter((item) => item.recordId === id),
    };
  }
  const record = await prisma.record.findUnique({ where: { id }, include: { game: true, player: true, challenges: { include: { cheat: true } }, nfts: true } });
  if (!record) notFound("Record");
  return record;
}

export async function createRecord(input: { playerAddress: string; gameId: string; gameMode: string; score: number; stakeAmount: string; videoUrl: string; replayUrl?: string; evidenceHash: string; transactionHash: string }) {
  const challengeDeadline = new Date(Date.now() + challengeWindowHours() * 3_600_000);
  if (isMock()) {
    const db = mockDb();
    const game = db.games.find((item) => item.id === input.gameId);
    if (!game) notFound("Game");
    if (!game.supportedModes.includes(input.gameMode)) throw new AppError(400, "UNSUPPORTED_GAME_MODE", "Game mode is not supported");
    if (db.records.some((item) => item.transactionHash.toLowerCase() === input.transactionHash.toLowerCase() || (item.playerAddress === input.playerAddress && item.gameId === input.gameId && item.gameMode === input.gameMode && item.evidenceHash.toLowerCase() === input.evidenceHash.toLowerCase()))) {
      throw new AppError(409, "DUPLICATE_RESOURCE", "Record transaction or evidence has already been submitted");
    }
    if (!db.users.some((user) => user.walletAddress === input.playerAddress)) db.users.push({ id: `user_${randomUUID()}`, walletAddress: input.playerAddress, createdAt: new Date().toISOString() });
    const record = { id: `rec_${randomUUID()}`, chainRecordId: null, ...input, replayUrl: input.replayUrl ?? null, status: "PENDING", submittedAt: new Date().toISOString(), challengeDeadline: challengeDeadline.toISOString() };
    db.records.push(record);
    return getRecord(record.id);
  }
  return prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({ where: { id: input.gameId } });
    if (!game) notFound("Game");
    if (!Array.isArray(game.supportedModes) || !game.supportedModes.includes(input.gameMode)) throw new AppError(400, "UNSUPPORTED_GAME_MODE", "Game mode is not supported");
    await tx.user.upsert({ where: { walletAddress: input.playerAddress }, update: {}, create: { walletAddress: input.playerAddress } });
    const record = await tx.record.create({ data: { ...input, status: "PENDING", challengeDeadline } });
    return tx.record.findUniqueOrThrow({ where: { id: record.id }, include: { game: true, player: true, challenges: true, nfts: true } });
  });
}

export async function getLeaderboard(query: { gameId: string; gameMode: string; limit: number }) {
  const mapRows = (rows: any[]) => rows.map((row, index) => ({ rank: index + 1, ...row }));
  if (isMock()) {
    const rows = mockDb().records.filter((record) => record.gameId === query.gameId && record.gameMode === query.gameMode && record.status === "VERIFIED").sort((a, b) => b.score - a.score || a.submittedAt.localeCompare(b.submittedAt)).slice(0, query.limit);
    return { gameId: query.gameId, gameMode: query.gameMode, items: mapRows(rows) };
  }
  const rows = await prisma.record.findMany({ where: { gameId: query.gameId, gameMode: query.gameMode, status: "VERIFIED" }, select: { id: true, playerAddress: true, score: true, submittedAt: true, transactionHash: true }, orderBy: [{ score: "desc" }, { submittedAt: "asc" }], take: query.limit });
  return { gameId: query.gameId, gameMode: query.gameMode, items: mapRows(rows) };
}

export async function listChallenges(query: { recordId?: string; challenger?: string; status?: "PENDING" | "VOTING" | "UPHELD" | "REJECTED" | "CANCELLED"; page: number; limit: number }) {
  if (isMock()) {
    const rows = mockDb().challenges.filter((challenge) => (!query.recordId || challenge.recordId === query.recordId) && (!query.challenger || challenge.challenger === query.challenger) && (!query.status || challenge.status === query.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const result = mockPage(rows, query.page, query.limit);
    return { ...result, items: result.items.map(mockChallenge) };
  }
  const where: Prisma.ChallengeWhereInput = { recordId: query.recordId, challenger: query.challenger, status: query.status };
  const [total, items] = await prisma.$transaction([
    prisma.challenge.count({ where }),
    prisma.challenge.findMany({ where, include: { record: true, cheat: true }, orderBy: { createdAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit }),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getChallenge(id: string) {
  if (isMock()) {
    const challenge = mockDb().challenges.find((item) => item.id === id);
    if (!challenge) notFound("Challenge");
    return { ...mockChallenge(challenge), votes: mockDb().votes.filter((vote) => vote.challengeId === id) };
  }
  const challenge = await prisma.challenge.findUnique({ where: { id }, include: { record: true, cheat: true, votes: { orderBy: { createdAt: "desc" } } } });
  if (!challenge) notFound("Challenge");
  return challenge;
}

export async function createChallenge(input: { recordId: string; cheatId: string; challenger: string; evidenceHash: string; transactionHash: string }) {
  if (isMock()) {
    const db = mockDb();
    const record = db.records.find((item) => item.id === input.recordId);
    if (!record) notFound("Record");
    const cheat = db.cheats.find((item) => item.id === input.cheatId);
    if (!cheat) notFound("Cheat");
    if (!record.chainRecordId) throw new AppError(409, "CHAIN_RECORD_REQUIRED", "Record must be confirmed by RecordSubmitted before it can be challenged");
    if (cheat.gameId !== record.gameId || cheat.status !== "ACTIVE") throw new AppError(400, "INVALID_CHEAT", "Cheat must be active and belong to the record's game");
    if (record.status !== "CHALLENGE_PERIOD" || Date.parse(record.challengeDeadline) <= Date.now()) throw new AppError(409, "CHALLENGE_CLOSED", "Record is not open for challenges");
    if (db.challenges.some((item) => item.transactionHash.toLowerCase() === input.transactionHash.toLowerCase() || (item.recordId === input.recordId && item.challenger === input.challenger && item.evidenceHash.toLowerCase() === input.evidenceHash.toLowerCase()))) throw new AppError(409, "DUPLICATE_RESOURCE", "Challenge has already been submitted");
    if (!db.users.some((user) => user.walletAddress === input.challenger)) db.users.push({ id: `user_${randomUUID()}`, walletAddress: input.challenger, createdAt: new Date().toISOString() });
    const challenge = { id: `challenge_${randomUUID()}`, chainChallengeId: null, ...input, status: "PENDING", createdAt: new Date().toISOString() };
    db.challenges.push(challenge);
    return getChallenge(challenge.id);
  }
  return prisma.$transaction(async (tx) => {
    const record = await tx.record.findUnique({ where: { id: input.recordId } });
    if (!record) notFound("Record");
    const cheat = await tx.cheat.findUnique({ where: { id: input.cheatId } });
    if (!cheat) notFound("Cheat");
    if (!record.chainRecordId) throw new AppError(409, "CHAIN_RECORD_REQUIRED", "Record must be confirmed by RecordSubmitted before it can be challenged");
    if (cheat.gameId !== record.gameId || cheat.status !== "ACTIVE") throw new AppError(400, "INVALID_CHEAT", "Cheat must be active and belong to the record's game");
    if (record.status !== "CHALLENGE_PERIOD" || record.challengeDeadline <= new Date()) throw new AppError(409, "CHALLENGE_CLOSED", "Record is not open for challenges");
    await tx.user.upsert({ where: { walletAddress: input.challenger }, update: {}, create: { walletAddress: input.challenger } });
    const challenge = await tx.challenge.create({ data: { ...input, status: "PENDING" } });
    return tx.challenge.findUniqueOrThrow({ where: { id: challenge.id }, include: { record: true, cheat: true, votes: true } });
  });
}

type VoteLike = { stakeAmount: { toString(): string } | string; votingChoice?: "YES" | "NO" | null };
function votingSummary(votes: Array<VoteLike | MockRow>) {
  return {
    totalVotes: votes.length,
    totalStake: votes.reduce((sum, vote) => sum + BigInt(vote.stakeAmount.toString()), 0n).toString(),
    yesVotes: votes.filter((vote) => vote.votingChoice === "YES").length,
    noVotes: votes.filter((vote) => vote.votingChoice === "NO").length,
  };
}

export async function listVoting(query: { status?: "PENDING" | "VOTING" | "UPHELD" | "REJECTED" | "CANCELLED"; page: number; limit: number }) {
  const whereStatus: Array<"PENDING" | "VOTING" | "UPHELD" | "REJECTED" | "CANCELLED"> = query.status ? [query.status] : ["PENDING", "VOTING"];
  if (isMock()) {
    const rows = mockDb().challenges.filter((challenge) => whereStatus.includes(challenge.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const result = mockPage(rows, query.page, query.limit);
    return { ...result, items: result.items.map((challenge) => ({ ...mockChallenge(challenge), summary: votingSummary(mockDb().votes.filter((vote) => vote.challengeId === challenge.id)) })) };
  }
  const where: Prisma.ChallengeWhereInput = { status: { in: whereStatus } };
  const [total, rows] = await prisma.$transaction([
    prisma.challenge.count({ where }),
    prisma.challenge.findMany({ where, include: { record: true, cheat: true, votes: true }, orderBy: { createdAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit }),
  ]);
  return { items: rows.map(({ votes, ...challenge }) => ({ ...challenge, summary: votingSummary(votes) })), pagination: pageMeta(query.page, query.limit, total) };
}

export async function getVoting(id: string) {
  const challenge = await getChallenge(id);
  return { ...challenge, summary: votingSummary(challenge.votes) };
}

export async function listCheats(query: { gameId?: string; status?: "ACTIVE" | "DEPRECATED"; page: number; limit: number }) {
  if (isMock()) {
    const rows = mockDb().cheats.filter((cheat) => (!query.gameId || cheat.gameId === query.gameId) && (!query.status || cheat.status === query.status));
    return mockPage(rows, query.page, query.limit);
  }
  const where: Prisma.CheatWhereInput = { gameId: query.gameId, status: query.status };
  const [total, items] = await prisma.$transaction([
    prisma.cheat.count({ where }),
    prisma.cheat.findMany({ where, orderBy: { createdAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit }),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getCheat(id: string) {
  if (isMock()) {
    const cheat = mockDb().cheats.find((item) => item.id === id);
    if (!cheat) notFound("Cheat");
    return cheat;
  }
  const cheat = await prisma.cheat.findUnique({ where: { id } });
  if (!cheat) notFound("Cheat");
  return cheat;
}

export async function createCheat(input: { cheatCode: string; name: string; description: string; gameId: string }) {
  if (isMock()) {
    const db = mockDb();
    if (!db.games.some((game) => game.id === input.gameId)) notFound("Game");
    if (db.cheats.some((cheat) => cheat.gameId === input.gameId && cheat.cheatCode === input.cheatCode)) throw new AppError(409, "DUPLICATE_RESOURCE", "Cheat code already exists for this game");
    const cheat = { id: `cheat_${randomUUID()}`, chainCheatId: null, ...input, status: "ACTIVE", createdAt: new Date().toISOString() };
    db.cheats.push(cheat);
    return cheat;
  }
  if (!await prisma.game.findUnique({ where: { id: input.gameId } })) notFound("Game");
  return prisma.cheat.create({ data: input });
}

export async function getUser(address: string) {
  if (isMock()) {
    const db = mockDb();
    const user = db.users.find((item) => item.walletAddress === address);
    if (!user) notFound("User");
    return { ...user, stats: { recordCount: db.records.filter((item) => item.playerAddress === address).length, voteCount: db.votes.filter((item) => item.voterAddress === address).length, rewardCount: db.rewards.filter((item) => item.walletAddress === address).length, nftCount: db.nfts.filter((item) => item.ownerAddress === address).length } };
  }
  const user = await prisma.user.findUnique({ where: { walletAddress: address } });
  if (!user) notFound("User");
  const [recordCount, voteCount, rewardCount, nftCount] = await prisma.$transaction([
    prisma.record.count({ where: { playerAddress: address } }), prisma.vote.count({ where: { voterAddress: address } }),
    prisma.reward.count({ where: { walletAddress: address } }), prisma.nFT.count({ where: { ownerAddress: address } }),
  ]);
  return { ...user, stats: { recordCount, voteCount, rewardCount, nftCount } };
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
    prisma.vote.count({ where }), prisma.vote.findMany({ where, include: { challenge: { include: { record: true, cheat: true } } }, orderBy: { createdAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit }),
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

export async function listNfts(query: { ownerAddress?: string; recordId?: string; status?: "PENDING" | "MINTED" | "TRANSFERRED" | "REVOKED"; page: number; limit: number }) {
  if (isMock()) {
    const rows = mockDb().nfts.filter((nft) => (!query.ownerAddress || nft.ownerAddress === query.ownerAddress) && (!query.recordId || nft.recordId === query.recordId) && (!query.status || nft.status === query.status));
    return mockPage(rows, query.page, query.limit);
  }
  const where: Prisma.NFTWhereInput = { ownerAddress: query.ownerAddress, recordId: query.recordId, status: query.status };
  const [total, items] = await prisma.$transaction([
    prisma.nFT.count({ where }), prisma.nFT.findMany({ where, orderBy: { createdAt: "desc" }, skip: skip(query.page, query.limit), take: query.limit }),
  ]);
  return { items, pagination: pageMeta(query.page, query.limit, total) };
}

export async function getUserNfts(address: string, query: { page: number; limit: number }) {
  await getUser(address);
  return listNfts({ ownerAddress: address, page: query.page, limit: query.limit });
}

export async function getNft(id: string) {
  if (isMock()) {
    const nft = mockDb().nfts.find((item) => item.id === id);
    if (!nft) notFound("NFT");
    return nft;
  }
  const nft = await prisma.nFT.findUnique({ where: { id } });
  if (!nft) notFound("NFT");
  return nft;
}
