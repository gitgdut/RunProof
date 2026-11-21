import type { Prisma } from "@prisma/client";
import { AppError, pageMeta } from "./api";
import { prisma } from "./db";
import * as demo from "./demo-data";
import {
  challengeStatusName, choiceName, directionName, parseChallengeStatus, parseRecordStatus,
  recordStatusName, rewardKindName, stakeKindName,
} from "./enums";
import { formatValue } from "./format";
import { getChainParams, getChainHead, getClaimable } from "./chain";

// Rows come from mixed sources (Prisma models with includes, in-memory fixtures).
type AnyRow = any;
const isMock = () => process.env.DATA_MODE === "mock";
const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value));
const iso = (value: string | Date) => toDate(value).toISOString();
const seconds = (value: string | Date) => Math.floor(toDate(value).getTime() / 1000);
const decimal = (value: unknown) => (value === null || value === undefined ? "0" : String(value));
const sortedDesc = (rows: AnyRow[], key: string) => [...rows].sort((a, b) => toDate(b[key]).getTime() - toDate(a[key]).getTime());

function statusFilter(value: string | undefined, parser: (input: string) => number | undefined, label: string) {
  if (!value) return undefined;
  const parsed = parser(value);
  if (parsed === undefined) throw new AppError(400, "INVALID_STATUS", `Unknown ${label} status: ${value}`);
  return parsed;
}

function slice<T>(rows: T[], offset: number, limit: number) {
  return { items: rows.slice(offset, offset + limit), pagination: pageMeta(offset, limit, rows.length) };
}

// --------------------------------------------------------------------------- categories

const mockCategory = (category: AnyRow) => ({
  categoryId: category.id,
  name: category.name,
  descriptionURI: category.descriptionURI,
  unit: category.unit,
  decimals: category.decimals,
  direction: category.direction,
  directionName: directionName(category.direction),
  ruleVersion: category.ruleVersion,
  baseStake: category.baseStake,
  active: category.active,
  divisions: demo.demoDivisions
    .filter((division) => division.categoryId === category.id)
    .map((division) => ({ divisionId: division.divisionId, name: division.name, active: division.active })),
});

const prismaCategory = (category: AnyRow) => ({
  categoryId: category.id,
  name: category.name,
  descriptionURI: category.descriptionURI,
  unit: category.unit,
  decimals: category.decimals,
  direction: category.direction,
  directionName: directionName(category.direction),
  ruleVersion: category.ruleVersion,
  baseStake: decimal(category.baseStake),
  active: category.active,
  divisions: (category.divisions ?? []).map((division: AnyRow) => ({
    divisionId: division.divisionId, name: division.name, active: division.active,
  })),
});

export async function listCategories() {
  if (isMock()) return { items: demo.demoCategories.map(mockCategory) };
  const rows = await prisma.category.findMany({ include: { divisions: { orderBy: { divisionId: "asc" } } }, orderBy: { id: "asc" } });
  return { items: rows.map(prismaCategory) };
}

export async function getCategory(categoryId: number) {
  if (isMock()) {
    const category = demo.demoCategories.find((item) => item.id === categoryId);
    if (!category) throw new AppError(404, "NOT_FOUND", `Category ${categoryId} not found`);
    return mockCategory(category);
  }
  const category = await prisma.category.findUnique({ where: { id: categoryId }, include: { divisions: { orderBy: { divisionId: "asc" } } } });
  if (!category) throw new AppError(404, "NOT_FOUND", `Category ${categoryId} not found`);
  return prismaCategory(category);
}

// ------------------------------------------------------------------------------ reasons

const reasonView = (reason: AnyRow) => ({
  reasonId: reason.id,
  code: reason.code,
  name: reason.name,
  description: reason.description ?? null,
  discoverer: reason.discovererAddress ?? null,
  registeredAt: reason.registeredAt ? iso(reason.registeredAt) : null,
  registered: reason.registered,
});

export async function listReasons(query: { offset: number; limit: number }) {
  if (isMock()) return slice(demo.demoReasons.map(reasonView), query.offset, query.limit);
  const [total, rows] = await prisma.$transaction([
    prisma.challengeReason.count(),
    prisma.challengeReason.findMany({ orderBy: { id: "asc" }, skip: query.offset, take: query.limit }),
  ]);
  return { items: rows.map(reasonView), pagination: pageMeta(query.offset, query.limit, total) };
}

export async function getReason(reasonId: number) {
  const reason = isMock()
    ? demo.demoReasons.find((item) => item.id === reasonId)
    : await prisma.challengeReason.findUnique({ where: { id: reasonId } });
  if (!reason) throw new AppError(404, "NOT_FOUND", `Reason ${reasonId} not found`);
  return reasonView(reason);
}

// ------------------------------------------------------------------------------ records

type CategoryInfo = { unit: string; decimals: number; direction: number; name: string };

function recordView(record: AnyRow, category?: CategoryInfo) {
  const unit = category?.unit ?? "";
  const decimals = category?.decimals ?? 0;
  const value = decimal(record.value);
  return {
    recordId: record.id,
    player: record.player,
    categoryId: record.categoryId,
    divisionId: record.divisionId,
    value,
    displayValue: formatValue(value, unit, decimals),
    direction: record.direction,
    directionName: directionName(record.direction),
    statusCode: record.status,
    status: recordStatusName(record.status),
    evidenceHash: record.evidenceHash,
    evidenceURI: record.evidenceURI,
    stake: decimal(record.stake),
    ruleVersion: record.ruleVersion,
    stakeSettled: Boolean(record.stakeSettled),
    activeChallenges: Number(record.activeChallenges ?? 0),
    submittedAt: iso(record.submittedAt),
    submittedAtSeconds: seconds(record.submittedAt),
    deadline: iso(record.deadline),
    deadlineSeconds: seconds(record.deadline),
    transactionHash: record.transactionHash,
    blockNumber: record.blockNumber === null || record.blockNumber === undefined ? null : String(record.blockNumber),
    logIndex: record.logIndex,
  };
}

export async function listRecords(query: {
  categoryId?: number; divisionId?: number; status?: string; player?: string; offset: number; limit: number;
}) {
  const status = statusFilter(query.status, parseRecordStatus, "record");
  if (isMock()) {
    const rows = demo.demoRecords
      .filter((record) =>
        (query.categoryId === undefined || record.categoryId === query.categoryId)
        && (query.divisionId === undefined || record.divisionId === query.divisionId)
        && (status === undefined || record.status === status)
        && (!query.player || record.player === query.player))
      .sort((a, b) => toDate(b.submittedAt).getTime() - toDate(a.submittedAt).getTime());
    const page = slice(rows, query.offset, query.limit);
    return {
      items: page.items.map((record) => recordView(record, demo.demoCategories.find((item) => item.id === record.categoryId))),
      pagination: page.pagination,
    };
  }
  const where: Prisma.RecordWhereInput = {
    categoryId: query.categoryId, divisionId: query.divisionId, status, player: query.player,
  };
  const [total, rows] = await prisma.$transaction([
    prisma.record.count({ where }),
    prisma.record.findMany({
      where, include: { category: true }, orderBy: { submittedAt: "desc" }, skip: query.offset, take: query.limit,
    }),
  ]);
  return { items: rows.map((row) => recordView(row, row.category as unknown as CategoryInfo)), pagination: pageMeta(query.offset, query.limit, total) };
}

export async function getRecordDetail(recordId: number) {
  if (isMock()) {
    const record = demo.demoRecords.find((item) => item.id === recordId);
    if (!record) throw new AppError(404, "NOT_FOUND", `Record ${recordId} not found`);
    const category = demo.demoCategories.find((item) => item.id === record.categoryId);
    const challenges = demo.demoChallenges.filter((challenge) => challenge.recordId === recordId).map((challenge) => challengeView(challenge));
    return {
      ...recordView(record, category),
      category: category ? { categoryId: category.id, name: category.name, unit: category.unit, decimals: category.decimals, direction: category.direction } : null,
      challenges,
      nft: demo.demoNfts.find((nft) => nft.recordId === recordId) ?? null,
      rewards: demo.demoRewards.filter((reward) => reward.recordId === recordId).map(rewardView),
      stakeFlows: demo.demoStakeFlows.filter((flow) => flow.recordId === recordId).map(stakeFlowView),
    };
  }
  const record = await prisma.record.findUnique({
    where: { id: recordId },
    include: {
      category: true,
      challenges: { include: { reason: true, rounds: true, votes: true, evidence: true }, orderBy: { createdAt: "desc" } },
      nft: true, rewards: true, stakeFlows: true,
    },
  });
  if (!record) throw new AppError(404, "NOT_FOUND", `Record ${recordId} not found`);
  return {
    ...recordView(record, record.category as unknown as CategoryInfo),
    category: { categoryId: record.category.id, name: record.category.name, unit: record.category.unit, decimals: record.category.decimals, direction: record.category.direction },
    challenges: record.challenges.map((challenge) => challengeView(challenge)),
    nft: record.nft ? nftView(record.nft) : null,
    rewards: record.rewards.map(rewardView),
    stakeFlows: record.stakeFlows.map(stakeFlowView),
  };
}

// -------------------------------------------------------------------------- leaderboard

export async function getLeaderboard(query: { categoryId: number; divisionId: number; offset: number; limit: number }) {
  const category = isMock()
    ? demo.demoCategories.find((item) => item.id === query.categoryId)
    : await prisma.category.findUnique({ where: { id: query.categoryId }, include: { divisions: { orderBy: { divisionId: "asc" } } } });
  if (!category) throw new AppError(404, "NOT_FOUND", `Category ${query.categoryId} not found`);

  const division = isMock()
    ? demo.demoDivisions.find((item) => item.categoryId === query.categoryId && item.divisionId === query.divisionId)
    : (category as AnyRow).divisions?.find((item: AnyRow) => item.divisionId === query.divisionId);
  if (!division) throw new AppError(404, "NOT_FOUND", `Division ${query.divisionId} not found in category ${query.categoryId}`);

  const info = { unit: category.unit, decimals: category.decimals, direction: category.direction, name: category.name };
  const order = category.direction === 2 ? "asc" : "desc";

  const build = (records: AnyRow[]) => records
    .sort((a, b) => {
      const left = BigInt(decimal(a.value));
      const right = BigInt(decimal(b.value));
      if (left !== right) return category.direction === 2 ? (left < right ? -1 : 1) : (left > right ? -1 : 1);
      const byTime = toDate(a.submittedAt).getTime() - toDate(b.submittedAt).getTime();
      return byTime !== 0 ? byTime : a.id - b.id;
    });

  if (isMock()) {
    const verified = demo.demoRecords.filter((record) =>
      record.categoryId === query.categoryId && record.divisionId === query.divisionId && record.status === 2);
    const ordered = build(verified);
    const board = demo.demoLeaderboards.find((item) => item.categoryId === query.categoryId && item.divisionId === query.divisionId);
    return {
      categoryId: query.categoryId, divisionId: query.divisionId, categoryName: category.name, divisionName: division.name,
      unit: info.unit, decimals: info.decimals, direction: info.direction, directionName: directionName(info.direction),
      chainBest: board ? { recordId: board.bestRecordId, value: board.bestValue, displayValue: formatValue(board.bestValue, info.unit, info.decimals) } : null,
      total: ordered.length,
      entries: ordered.slice(query.offset, query.offset + query.limit).map((record, index) => ({
        rank: query.offset + index + 1,
        ...recordView(record, info),
      })),
      pagination: pageMeta(query.offset, query.limit, ordered.length),
    };
  }

  const where: Prisma.RecordWhereInput = { categoryId: query.categoryId, divisionId: query.divisionId, status: 2 };
  const [total, rows, board] = await prisma.$transaction([
    prisma.record.count({ where }),
    prisma.record.findMany({
      where, orderBy: [{ value: order }, { submittedAt: "asc" }, { id: "asc" }], skip: query.offset, take: query.limit,
    }),
    prisma.leaderboard.findUnique({ where: { categoryId_divisionId: { categoryId: query.categoryId, divisionId: query.divisionId } } }),
  ]);
  return {
    categoryId: query.categoryId, divisionId: query.divisionId, categoryName: category.name, divisionName: division.name,
    unit: info.unit, decimals: info.decimals, direction: info.direction, directionName: directionName(info.direction),
    chainBest: board ? {
      recordId: board.bestRecordId, value: decimal(board.bestValue),
      displayValue: formatValue(decimal(board.bestValue), info.unit, info.decimals),
    } : null,
    total,
    entries: rows.map((row, index) => ({ rank: query.offset + index + 1, ...recordView(row, info) })),
    pagination: pageMeta(query.offset, query.limit, total),
  };
}

// --------------------------------------------------------------------------- challenges

export function challengeView(challenge: AnyRow) {
  const rounds = (challenge.rounds ?? demo.demoChallengeRounds.filter((round) => round.challengeId === challenge.id))
    .slice()
    .sort((a: AnyRow, b: AnyRow) => a.round - b.round);
  const currentRound = rounds.find((round: AnyRow) => round.round === challenge.round) ?? rounds[rounds.length - 1] ?? null;
  const votes = challenge.votes ?? demo.demoVotes.filter((vote) => vote.challengeId === challenge.id);
  const evidence = challenge.evidence ?? demo.demoEvidence.filter((item) => item.challengeId === challenge.id);
  const reason = challenge.reason ?? demo.demoReasons.find((item) => item.id === challenge.reasonId);

  return {
    challengeId: challenge.id,
    recordId: challenge.recordId,
    reasonId: challenge.reasonId,
    reason: reason ? { code: reason.code, name: reason.name } : null,
    challenger: challenge.challenger,
    bond: decimal(challenge.bond),
    reserved: decimal(challenge.reserved),
    evidenceHash: challenge.evidenceHash,
    evidenceURI: challenge.evidenceURI,
    statusCode: challenge.status,
    status: challengeStatusName(challenge.status),
    round: challenge.round,
    currentRound: currentRound ? roundView(currentRound) : null,
    special: Boolean(challenge.special),
    extended: Boolean(challenge.extended),
    evidenceCount: Number(challenge.evidenceCount ?? 0),
    createdAt: iso(challenge.createdAt),
    createdAtSeconds: seconds(challenge.createdAt),
    transactionHash: challenge.transactionHash,
    blockNumber: challenge.blockNumber === null || challenge.blockNumber === undefined ? null : String(challenge.blockNumber),
    logIndex: challenge.logIndex,
    summary: summarize(votes, challenge.round),
    votes: votes.map(voteView),
    evidence: evidence.map(evidenceView),
    rounds: rounds.map(roundView),
  };
}

function roundView(round: AnyRow) {
  return {
    round: round.round,
    commitEnd: round.commitEnd ? iso(round.commitEnd) : null,
    commitEndSeconds: round.commitEnd ? seconds(round.commitEnd) : null,
    revealEnd: round.revealEnd ? iso(round.revealEnd) : null,
    revealEndSeconds: round.revealEnd ? seconds(round.revealEnd) : null,
    confirmPower: decimal(round.confirmPower),
    denyPower: decimal(round.denyPower),
    confirmStake: decimal(round.confirmStake),
    denyStake: decimal(round.denyStake),
    committedStake: decimal(round.committedStake),
    committedVoters: Number(round.committedVoters ?? 0),
    revealedVoters: Number(round.revealedVoters ?? 0),
    finalized: Boolean(round.finalized),
    winnerCode: round.winner ?? null,
    winner: choiceName(round.winner),
    winnerPower: decimal(round.winnerPower),
    rewardPool: decimal(round.rewardPool),
    slashBps: Number(round.slashBps ?? 0),
  };
}

function summarize(votes: AnyRow[], round: number) {
  const scoped = votes.filter((vote) => Number(vote.round) === round);
  const sum = (rows: AnyRow[], pick: (row: AnyRow) => unknown) => rows.reduce((total, row) => total + BigInt(decimal(pick(row))), 0n).toString();
  return {
    round,
    totalVotes: scoped.length,
    committedVoters: scoped.length,
    revealedVoters: scoped.filter((vote) => vote.revealed).length,
    totalStake: sum(scoped, (vote) => vote.stakeAmount),
    confirmPower: sum(scoped.filter((vote) => vote.votingChoice === 1), (vote) => vote.votingPower),
    denyPower: sum(scoped.filter((vote) => vote.votingChoice === 2), (vote) => vote.votingPower),
    confirmVotes: scoped.filter((vote) => vote.votingChoice === 1).length,
    denyVotes: scoped.filter((vote) => vote.votingChoice === 2).length,
  };
}

function voteView(vote: AnyRow) {
  return {
    challengeId: vote.challengeId,
    round: vote.round,
    voter: vote.voterAddress,
    choiceCode: vote.votingChoice ?? null,
    choice: choiceName(vote.votingChoice),
    stakeAmount: decimal(vote.stakeAmount),
    votingPower: vote.votingPower === null || vote.votingPower === undefined ? null : decimal(vote.votingPower),
    commitHash: vote.commitHash ?? null,
    commitTransactionHash: vote.commitTransactionHash ?? null,
    revealTransactionHash: vote.revealTransactionHash ?? null,
    revealed: Boolean(vote.revealed),
    claimed: Boolean(vote.claimed),
    createdAt: iso(vote.createdAt),
  };
}

function evidenceView(item: AnyRow) {
  return {
    challengeId: item.challengeId, round: item.round, submitter: item.submitter, evidenceHash: item.evidenceHash,
    evidenceURI: item.evidenceURI, transactionHash: item.transactionHash, logIndex: item.logIndex, createdAt: iso(item.createdAt),
  };
}

export async function listChallenges(query: {
  recordId?: number; reasonId?: number; challenger?: string; status?: string; offset: number; limit: number;
}) {
  const status = statusFilter(query.status, parseChallengeStatus, "challenge");
  if (isMock()) {
    const rows = sortedDesc(
      demo.demoChallenges.filter((challenge) =>
        (query.recordId === undefined || challenge.recordId === query.recordId)
        && (query.reasonId === undefined || challenge.reasonId === query.reasonId)
        && (!query.challenger || challenge.challenger === query.challenger)
        && (status === undefined || challenge.status === status)),
      "createdAt",
    );
    const page = slice(rows, query.offset, query.limit);
    return { items: page.items.map(challengeView), pagination: page.pagination };
  }
  const where: Prisma.ChallengeWhereInput = { recordId: query.recordId, reasonId: query.reasonId, challenger: query.challenger, status };
  const [total, rows] = await prisma.$transaction([
    prisma.challenge.count({ where }),
    prisma.challenge.findMany({
      where, include: { reason: true, rounds: true, votes: true, evidence: true },
      orderBy: { createdAt: "desc" }, skip: query.offset, take: query.limit,
    }),
  ]);
  return { items: rows.map(challengeView), pagination: pageMeta(query.offset, query.limit, total) };
}

export async function getChallengeDetail(challengeId: number) {
  if (isMock()) {
    const challenge = demo.demoChallenges.find((item) => item.id === challengeId);
    if (!challenge) throw new AppError(404, "NOT_FOUND", `Challenge ${challengeId} not found`);
    return challengeView(challenge);
  }
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: {
      reason: true, rounds: { orderBy: { round: "asc" } },
      votes: { orderBy: { createdAt: "asc" } }, evidence: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!challenge) throw new AppError(404, "NOT_FOUND", `Challenge ${challengeId} not found`);
  return challengeView(challenge);
}

// ------------------------------------------------------------------------------- voting

const OPEN_STATUSES = [1, 2];

export async function listVoting(query: { status?: string; offset: number; limit: number }) {
  const status = statusFilter(query.status, parseChallengeStatus, "challenge");
  const statuses = status === undefined ? OPEN_STATUSES : [status];
  if (isMock()) {
    const rows = sortedDesc(demo.demoChallenges.filter((challenge) => statuses.includes(challenge.status)), "createdAt");
    const page = slice(rows, query.offset, query.limit);
    return { items: page.items.map(challengeView), pagination: page.pagination };
  }
  const where: Prisma.ChallengeWhereInput = { status: { in: statuses } };
  const [total, rows] = await prisma.$transaction([
    prisma.challenge.count({ where }),
    prisma.challenge.findMany({
      where, include: { reason: true, rounds: true, votes: true, evidence: true },
      orderBy: { createdAt: "desc" }, skip: query.offset, take: query.limit,
    }),
  ]);
  return { items: rows.map(challengeView), pagination: pageMeta(query.offset, query.limit, total) };
}

/** Thresholds the frontend needs to render voting buttons; read from the contract once a minute. */
async function votingThresholds() {
  try {
    const params = await getChainParams();
    return {
      minVoters: params.minVoters,
      quorumPower: params.quorumPower.toString(),
      approvalBps: params.approvalBps,
      minVoteStake: params.minVoteStake.toString(),
      maxVoteStake: params.maxVoteStake.toString(),
      chainId: Number(process.env.MONAD_CHAIN_ID ?? 10143),
    };
  } catch {
    return null;
  }
}

export async function getVotingDetail(challengeId: number) {
  const challenge = await getChallengeDetail(challengeId);
  return { ...challenge, thresholds: await votingThresholds() };
}

// --------------------------------------------------------------------------- user views

function rewardView(reward: AnyRow) {
  return {
    source: reward.source,
    recordId: reward.recordId ?? null,
    reasonId: reward.reasonId ?? null,
    challengeId: reward.challengeId ?? null,
    proposalId: reward.proposalId ?? null,
    wallet: reward.walletAddress,
    amount: decimal(reward.amount),
    kindCode: reward.kind ?? null,
    kind: rewardKindName(reward.kind ?? null),
    transactionHash: reward.transactionHash,
    logIndex: reward.logIndex,
    createdAt: iso(reward.createdAt),
  };
}

function stakeFlowView(flow: AnyRow) {
  return {
    flow: flow.flow,
    recordId: flow.recordId ?? null,
    reasonId: flow.reasonId ?? null,
    challengeId: flow.challengeId ?? null,
    wallet: flow.walletAddress,
    amount: decimal(flow.amount),
    kindCode: flow.kind,
    kind: stakeKindName(flow.kind),
    transactionHash: flow.transactionHash,
    logIndex: flow.logIndex,
    createdAt: iso(flow.createdAt),
  };
}

function nftView(nft: AnyRow) {
  return {
    tokenId: nft.id,
    recordId: nft.recordId,
    owner: nft.ownerAddress,
    statusCode: nft.status,
    status: recordStatusName(nft.status),
    transactionHash: nft.transactionHash,
    logIndex: nft.logIndex,
    createdAt: iso(nft.createdAt),
  };
}

export async function getUser(address: string) {
  const stats = isMock()
    ? {
      records: demo.demoRecords.filter((row) => row.player === address).length,
      challenges: demo.demoChallenges.filter((row) => row.challenger === address).length,
      votes: demo.demoVotes.filter((row) => row.voterAddress === address).length,
      rewards: demo.demoRewards.filter((row) => row.walletAddress === address).length,
      stakes: demo.demoStakeFlows.filter((row) => row.walletAddress === address).length,
      nfts: demo.demoNfts.filter((row) => row.ownerAddress === address).length,
    }
    : await (async () => {
      const [records, challenges, votes, rewards, stakes, nfts] = await prisma.$transaction([
        prisma.record.count({ where: { player: address } }),
        prisma.challenge.count({ where: { challenger: address } }),
        prisma.vote.count({ where: { voterAddress: address } }),
        prisma.reward.count({ where: { walletAddress: address } }),
        prisma.stakeFlow.count({ where: { walletAddress: address } }),
        prisma.nFT.count({ where: { ownerAddress: address } }),
      ]);
      return { records, challenges, votes, rewards, stakes, nfts };
    })();

  let claimable: Awaited<ReturnType<typeof getClaimable>> | null = null;
  try {
    claimable = await getClaimable(address);
  } catch {
    claimable = null;
  }

  return {
    address,
    stats,
    claimable,
    known: stats.records + stats.votes + stats.rewards + stats.nfts > 0,
  };
}

export async function getUserRecords(address: string, query: { offset: number; limit: number }) {
  return listRecords({ player: address, offset: query.offset, limit: query.limit });
}

export async function getUserVotes(address: string, query: { offset: number; limit: number }) {
  if (isMock()) {
    const rows = sortedDesc(demo.demoVotes.filter((vote) => vote.voterAddress === address), "createdAt");
    const page = slice(rows, query.offset, query.limit);
    return {
      items: page.items.map((vote) => ({
        ...voteView(vote),
        challenge: (() => {
          const challenge = demo.demoChallenges.find((item) => item.id === vote.challengeId);
          return challenge ? { challengeId: challenge.id, recordId: challenge.recordId, status: challengeStatusName(challenge.status) } : null;
        })(),
      })),
      pagination: page.pagination,
    };
  }
  const where: Prisma.VoteWhereInput = { voterAddress: address };
  const [total, rows] = await prisma.$transaction([
    prisma.vote.count({ where }),
    prisma.vote.findMany({ where, include: { challenge: true }, orderBy: { createdAt: "desc" }, skip: query.offset, take: query.limit }),
  ]);
  return {
    items: rows.map((vote) => ({
      ...voteView(vote),
      challenge: vote.challenge ? {
        challengeId: vote.challenge.id, recordId: vote.challenge.recordId,
        statusCode: vote.challenge.status, status: challengeStatusName(vote.challenge.status),
      } : null,
    })),
    pagination: pageMeta(query.offset, query.limit, total),
  };
}

export async function getUserRewards(address: string, query: { offset: number; limit: number }) {
  if (isMock()) {
    const page = slice(sortedDesc(demo.demoRewards.filter((row) => row.walletAddress === address), "createdAt"), query.offset, query.limit);
    return { items: page.items.map(rewardView), pagination: page.pagination };
  }
  const where = { walletAddress: address };
  const [total, rows] = await prisma.$transaction([
    prisma.reward.count({ where }),
    prisma.reward.findMany({ where, orderBy: { createdAt: "desc" }, skip: query.offset, take: query.limit }),
  ]);
  return { items: rows.map(rewardView), pagination: pageMeta(query.offset, query.limit, total) };
}

export async function getUserStakes(address: string, query: { offset: number; limit: number }) {
  if (isMock()) {
    const page = slice(sortedDesc(demo.demoStakeFlows.filter((row) => row.walletAddress === address), "createdAt"), query.offset, query.limit);
    return {
      items: page.items.map(stakeFlowView),
      pagination: page.pagination,
      withdrawals: demo.demoWithdrawals.filter((row) => row.walletAddress === address).map((row) => ({
        amount: row.amount, transactionHash: row.transactionHash, createdAt: iso(row.createdAt),
      })),
    };
  }
  const where = { walletAddress: address };
  const [total, rows, withdrawals] = await prisma.$transaction([
    prisma.stakeFlow.count({ where }),
    prisma.stakeFlow.findMany({ where, orderBy: { createdAt: "desc" }, skip: query.offset, take: query.limit }),
    prisma.withdrawal.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return {
    items: rows.map(stakeFlowView),
    pagination: pageMeta(query.offset, query.limit, total),
    withdrawals: withdrawals.map((row) => ({
      amount: decimal(row.amount), transactionHash: row.transactionHash, source: row.source, createdAt: iso(row.createdAt),
    })),
  };
}

export async function listNfts(query: { ownerAddress?: string; status?: string; offset: number; limit: number }) {
  const status = query.status === undefined ? undefined : (() => {
    const parsed = parseRecordStatus(query.status);
    if (parsed === undefined) throw new AppError(400, "INVALID_STATUS", `Unknown NFT status: ${query.status}`);
    return parsed;
  })();
  if (isMock()) {
    const rows = demo.demoNfts.filter((nft) =>
      (!query.ownerAddress || nft.ownerAddress === query.ownerAddress) && (status === undefined || nft.status === status));
    const page = slice(rows, query.offset, query.limit);
    return { items: page.items.map(nftView), pagination: page.pagination };
  }
  const where: Prisma.NFTWhereInput = { ownerAddress: query.ownerAddress, status };
  const [total, rows] = await prisma.$transaction([
    prisma.nFT.count({ where }),
    prisma.nFT.findMany({ where, orderBy: { id: "asc" }, skip: query.offset, take: query.limit }),
  ]);
  return { items: rows.map(nftView), pagination: pageMeta(query.offset, query.limit, total) };
}

export async function getNft(tokenId: number) {
  const nft = isMock()
    ? demo.demoNfts.find((item) => item.id === tokenId)
    : await prisma.nFT.findUnique({ where: { id: tokenId }, include: { record: true } });
  if (!nft) throw new AppError(404, "NOT_FOUND", `NFT ${tokenId} not found`);
  return { ...nftView(nft), record: (nft as AnyRow).record ?? null };
}

// ------------------------------------------------------------------------------- health

export async function getHealth() {
  const dataMode = process.env.DATA_MODE === "mock" ? "mock" : "prisma";
  const chain = await getChainHead();

  if (dataMode === "mock") {
    return {
      service: "runproof-api", status: "ok", dataMode, database: "not-used",
      indexer: null, chain,
    };
  }

  try {
    await prisma.$queryRaw`SELECT 1 FROM "categories" LIMIT 1`;
  } catch {
    throw new AppError(503, "DATABASE_UNAVAILABLE", "Database is unavailable or migrations have not been applied");
  }

  const [state, reconcile] = await Promise.all([
    prisma.syncState.findUnique({ where: { id: "runproof-primary" } }),
    prisma.reconcileRun.findFirst({ orderBy: { ranAt: "desc" } }),
  ]);

  const indexedBlock = state?.lastBlock ?? null;
  const chainHead = chain ? BigInt(chain.head) : null;
  const lagBlocks = indexedBlock !== null && chainHead !== null
    ? (chainHead > indexedBlock ? (chainHead - indexedBlock).toString() : "0")
    : null;

  return {
    service: "runproof-api",
    status: lagBlocks !== null && Number(lagBlocks) > 100 ? "lagging" : "ok",
    dataMode,
    database: "connected",
    chain,
    indexer: {
      indexedBlock: indexedBlock === null ? null : indexedBlock.toString(),
      indexedBlockHash: state?.lastBlockHash ?? null,
      lastSyncedAt: state?.updatedAt ?? null,
      lagBlocks,
    },
    lastReconcile: reconcile ? {
      ranAt: reconcile.ranAt,
      ok: reconcile.ok,
      checkedBoards: reconcile.checkedBoards,
      mismatches: reconcile.mismatches,
      lagBlocks: reconcile.lagBlocks.toString(),
    } : null,
  };
}
