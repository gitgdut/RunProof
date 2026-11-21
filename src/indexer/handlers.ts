import type { Prisma } from "@prisma/client";
import type { Address } from "viem";

export type IndexerLog = {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockHash: string;
  address: string;
  source: string;
};

const id = (value: unknown) => {
  const parsed = Number(String(value));
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) throw new Error(`On-chain ID ${String(value)} is outside the supported integer range`);
  return parsed;
};
const int = (value: unknown) => Number(String(value));
const text = (value: unknown) => String(value);
const wallet = (value: unknown) => text(value).toLowerCase();
const amount = (value: unknown) => BigInt(String(value)).toString();
const seconds = (value: unknown) => new Date(Number(String(value)) * 1000);
// Some events omit recordId / cheatId / challengeId entirely (e.g. StakeReturned only
// carries recordId, cheatId and account), so missing and zero both mean "not applicable".
const optionalId = (value: unknown) => {
  if (value === undefined || value === null) return null;
  const parsed = id(value);
  return parsed === 0 ? null : parsed;
};

const recordStatuses = { 1: "PROVISIONAL", 2: "VERIFIED", 3: "REVOKED" } as const;
const challengeStatuses = { 1: "VOTING", 2: "EVIDENCE_VOTING", 3: "CONFIRMED", 4: "DENIED", 5: "INCONCLUSIVE" } as const;
const choices = { 1: "CONFIRM", 2: "DENY" } as const;
const rewardKinds = { 0: "CHALLENGER_REWARD", 1: "PLAYER_COMPENSATION", 2: "VOTER_REWARD" } as const;
const stakeKinds = { 0: "PLAYER_STAKE", 1: "CHALLENGE_BOND", 2: "VOTER_STAKE" } as const;

function recordStatus(value: unknown) {
  const status = recordStatuses[int(value) as keyof typeof recordStatuses];
  if (!status) throw new Error(`Unknown RecordStatus ${String(value)}`);
  return status;
}
function challengeStatus(value: unknown) {
  const status = challengeStatuses[int(value) as keyof typeof challengeStatuses];
  if (!status) throw new Error(`Unknown ChallengeStatus ${String(value)}`);
  return status;
}
function choice(value: unknown) {
  return choices[int(value) as keyof typeof choices] ?? null;
}
function rewardKind(value: unknown) {
  const kind = rewardKinds[int(value) as keyof typeof rewardKinds];
  if (!kind) throw new Error(`Unknown RewardKind ${String(value)}`);
  return kind;
}
function stakeKind(value: unknown) {
  const kind = stakeKinds[int(value) as keyof typeof stakeKinds];
  if (!kind) throw new Error(`Unknown StakeKind ${String(value)}`);
  return kind;
}

async function ensureUser(tx: Prisma.TransactionClient, walletAddress: string) {
  await tx.user.upsert({ where: { walletAddress }, update: {}, create: { walletAddress } });
}

async function ensureGame(tx: Prisma.TransactionClient, gameId: number) {
  return tx.game.upsert({
    where: { id: gameId },
    update: {},
    create: { id: gameId, name: `Game #${gameId}`, gameVersion: 0, ruleVersion: 0, active: false },
  });
}

async function ensureCheat(tx: Prisma.TransactionClient, cheatId: number, gameId?: number) {
  return tx.cheat.upsert({
    where: { id: cheatId },
    update: {},
    create: { id: cheatId, cheatCode: `C${String(cheatId).padStart(3, "0")}`, name: `Cheat #${cheatId}`, status: "ACTIVE", gameId: gameId ?? null },
  });
}

function nftStatusFor(recordStatusValue: "PENDING" | "PROVISIONAL" | "VERIFIED" | "REVOKED") {
  if (recordStatusValue === "VERIFIED") return "VERIFIED" as const;
  if (recordStatusValue === "REVOKED") return "REVOKED" as const;
  return "PROVISIONAL" as const;
}

export async function applyEvent(tx: Prisma.TransactionClient, log: IndexerLog, blockTimestamp: Date) {
  const args = log.args;
  switch (log.eventName) {
    case "GameRegistered": {
      const gameId = id(args.gameId);
      await tx.game.upsert({
        where: { id: gameId },
        update: { name: text(args.name), gameVersion: int(args.gameVersion), ruleVersion: int(args.ruleVersion), active: true },
        create: { id: gameId, name: text(args.name), gameVersion: int(args.gameVersion), ruleVersion: int(args.ruleVersion), active: true },
      });
      return;
    }
    case "GameVersionUpdated": {
      const gameId = id(args.gameId);
      await ensureGame(tx, gameId);
      await tx.game.update({ where: { id: gameId }, data: { gameVersion: int(args.gameVersion), ruleVersion: int(args.ruleVersion) } });
      return;
    }
    case "GameActiveSet": {
      const gameId = id(args.gameId);
      await ensureGame(tx, gameId);
      await tx.game.update({ where: { id: gameId }, data: { active: Boolean(args.active) } });
      return;
    }
    case "ModeRegistered": {
      const gameId = id(args.gameId);
      const modeId = id(args.modeId);
      await ensureGame(tx, gameId);
      await tx.gameMode.upsert({
        where: { gameId_modeId: { gameId, modeId } },
        update: { name: text(args.name), active: true },
        create: { gameId, modeId, name: text(args.name), active: true },
      });
      return;
    }
    case "ModeActiveSet": {
      const gameId = id(args.gameId);
      const modeId = id(args.modeId);
      await tx.gameMode.upsert({
        where: { gameId_modeId: { gameId, modeId } },
        update: { active: Boolean(args.active) },
        create: { gameId, modeId, name: `Mode #${modeId}`, active: Boolean(args.active) },
      });
      return;
    }
    case "CheatRegistered": {
      const cheatId = id(args.cheatId);
      await tx.cheat.upsert({
        where: { id: cheatId },
        update: { cheatCode: text(args.code), name: text(args.name), discovererAddress: wallet(args.discoverer), status: "ACTIVE", createdAt: blockTimestamp },
        create: { id: cheatId, cheatCode: text(args.code), name: text(args.name), discovererAddress: wallet(args.discoverer), status: "ACTIVE", createdAt: blockTimestamp },
      });
      return;
    }
    case "RecordSubmitted": {
      const recordId = id(args.recordId);
      const playerAddress = wallet(args.player);
      const gameId = id(args.gameId);
      await ensureUser(tx, playerAddress);
      await ensureGame(tx, gameId);
      const data = {
        playerAddress, gameId, gameMode: id(args.gameMode), score: BigInt(String(args.score)), stakeAmount: amount(args.stake),
        evidenceHash: text(args.evidenceHash), evidenceURI: text(args.evidenceURI), status: recordStatus(1),
        submittedAt: blockTimestamp, challengeDeadline: seconds(args.deadline), transactionHash: log.transactionHash,
        logIndex: log.logIndex, blockNumber: log.blockNumber, indexedAt: blockTimestamp,
      };
      await tx.record.upsert({ where: { id: recordId }, update: data, create: { id: recordId, ...data } });
      return;
    }
    case "ChallengeCreated": {
      const challengeId = id(args.challengeId);
      const recordId = id(args.recordId);
      const cheatId = id(args.cheatId);
      const record = await tx.record.findUnique({ where: { id: recordId } });
      if (!record) throw new Error(`Cannot index ChallengeCreated before RecordSubmitted ${recordId}`);
      await ensureUser(tx, wallet(args.challenger));
      await ensureCheat(tx, cheatId, record.gameId);
      const data = {
        recordId, cheatId, challenger: wallet(args.challenger), bond: amount(args.bond), reserved: "0",
        evidenceHash: text(args.evidenceHash), evidenceURI: text(args.evidenceURI), status: challengeStatus(1),
        round: 0, special: Boolean(args.special), evidenceCount: 1, createdAt: blockTimestamp,
        transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber, indexedAt: blockTimestamp,
      };
      await tx.challenge.upsert({ where: { id: challengeId }, update: data, create: { id: challengeId, ...data } });
      await tx.challengeRound.upsert({
        where: { challengeId_round: { challengeId, round: 0 } },
        update: { commitEnd: seconds(args.commitEnd) },
        create: { challengeId, round: 0, commitEnd: seconds(args.commitEnd) },
      });
      return;
    }
    case "EvidenceSubmitted": {
      const challengeId = id(args.challengeId);
      await tx.evidence.create({
        data: {
          challengeId, round: int(args.round), submitter: wallet(args.submitter), evidenceHash: text(args.evidenceHash),
          evidenceURI: text(args.evidenceURI), transactionHash: log.transactionHash, logIndex: log.logIndex,
          blockNumber: log.blockNumber, createdAt: blockTimestamp,
        },
      });
      await tx.challenge.update({ where: { id: challengeId }, data: { evidenceCount: { increment: 1 } } });
      return;
    }
    case "VoteCommitted": {
      const challengeId = id(args.challengeId);
      const voterAddress = wallet(args.voter);
      const round = int(args.round);
      await ensureUser(tx, voterAddress);
      await tx.vote.upsert({
        where: { challengeId_round_voterAddress: { challengeId, round, voterAddress } },
        update: { stakeAmount: amount(args.stake), commitTransactionHash: log.transactionHash },
        create: { challengeId, round, voterAddress, stakeAmount: amount(args.stake), commitTransactionHash: log.transactionHash },
      });
      return;
    }
    case "VoteRevealed": {
      const challengeId = id(args.challengeId);
      const voterAddress = wallet(args.voter);
      const round = int(args.round);
      await ensureUser(tx, voterAddress);
      await tx.vote.upsert({
        where: { challengeId_round_voterAddress: { challengeId, round, voterAddress } },
        update: { votingChoice: choice(args.choice), votingPower: BigInt(String(args.power)), revealed: true, revealTransactionHash: log.transactionHash },
        create: {
          challengeId, round, voterAddress, votingChoice: choice(args.choice), votingPower: BigInt(String(args.power)),
          stakeAmount: "0", revealed: true, revealTransactionHash: log.transactionHash,
        },
      });
      return;
    }
    case "VotingExtended": {
      const challengeId = id(args.challengeId);
      const challenge = await tx.challenge.findUnique({ where: { id: challengeId } });
      if (!challenge) throw new Error(`Cannot index VotingExtended before challenge ${challengeId}`);
      await tx.challenge.update({ where: { id: challengeId }, data: { extended: true } });
      await tx.challengeRound.upsert({
        where: { challengeId_round: { challengeId, round: challenge.round } },
        update: { commitEnd: seconds(args.newCommitEnd), revealEnd: seconds(args.newRevealEnd) },
        create: { challengeId, round: challenge.round, commitEnd: seconds(args.newCommitEnd), revealEnd: seconds(args.newRevealEnd) },
      });
      return;
    }
    case "EvidenceVotingStarted": {
      const challengeId = id(args.challengeId);
      await tx.challenge.update({ where: { id: challengeId }, data: { status: "EVIDENCE_VOTING", round: 1 } });
      await tx.challengeRound.upsert({
        where: { challengeId_round: { challengeId, round: 1 } },
        update: { commitEnd: seconds(args.commitEnd), revealEnd: seconds(args.revealEnd) },
        create: { challengeId, round: 1, commitEnd: seconds(args.commitEnd), revealEnd: seconds(args.revealEnd) },
      });
      return;
    }
    case "VotingFinalized": {
      const challengeId = id(args.challengeId);
      const round = int(args.round);
      const status = challengeStatus(args.outcome);
      await tx.challenge.update({ where: { id: challengeId }, data: { status, round } });
      await tx.challengeRound.upsert({
        where: { challengeId_round: { challengeId, round } },
        update: { finalized: true, confirmPower: BigInt(String(args.confirmPower)), denyPower: BigInt(String(args.denyPower)), winner: choice(args.outcome === 3 ? 1 : args.outcome === 4 ? 2 : 0) },
        create: {
          challengeId, round, finalized: true, confirmPower: BigInt(String(args.confirmPower)), denyPower: BigInt(String(args.denyPower)),
          winner: choice(args.outcome === 3 ? 1 : args.outcome === 4 ? 2 : 0),
        },
      });
      return;
    }
    case "RecordVerified": {
      const recordId = id(args.recordId);
      const result = await tx.record.updateMany({
        where: { id: recordId },
        data: { status: "VERIFIED", playerAddress: wallet(args.player), gameId: id(args.gameId), score: BigInt(String(args.score)) },
      });
      if (result.count === 0) throw new Error(`Cannot index RecordVerified before RecordSubmitted ${recordId}`);
      await tx.nFT.updateMany({ where: { recordId }, data: { status: "VERIFIED" } });
      return;
    }
    case "RecordRevoked": {
      const recordId = id(args.recordId);
      const result = await tx.record.updateMany({ where: { id: recordId }, data: { status: "REVOKED" } });
      if (result.count === 0) throw new Error(`Cannot index RecordRevoked before RecordSubmitted ${recordId}`);
      await tx.nFT.updateMany({ where: { recordId }, data: { status: "REVOKED" } });
      return;
    }
    case "RewardDistributed": {
      await ensureUser(tx, wallet(args.account));
      await tx.reward.create({
        data: {
          recordId: optionalId(args.recordId), cheatId: optionalId(args.cheatId), challengeId: optionalId(args.challengeId),
          walletAddress: wallet(args.account), amount: amount(args.amount), rewardType: rewardKind(args.kind),
          transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber, createdAt: blockTimestamp,
        },
      });
      return;
    }
    case "StakeReturned":
    case "StakeSlashed": {
      await ensureUser(tx, wallet(args.account));
      await tx.stakeFlow.create({
        data: {
          recordId: optionalId(args.recordId), cheatId: optionalId(args.cheatId), challengeId: optionalId(args.challengeId),
          walletAddress: wallet(args.account), amount: amount(args.amount), flowType: log.eventName === "StakeReturned" ? "RETURNED" : "SLASHED",
          stakeKind: stakeKind(args.kind), transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber, createdAt: blockTimestamp,
        },
      });
      return;
    }
    case "NFTMinted": {
      const recordId = id(args.recordId);
      const record = await tx.record.findUnique({ where: { id: recordId } });
      if (!record) throw new Error(`Cannot index NFTMinted before RecordSubmitted ${recordId}`);
      await tx.nFT.upsert({
        where: { id: recordId },
        update: { ownerAddress: wallet(args.player), status: nftStatusFor(record.status), transactionHash: log.transactionHash, logIndex: log.logIndex, createdAt: blockTimestamp },
        create: { id: recordId, recordId, ownerAddress: wallet(args.player), status: nftStatusFor(record.status), transactionHash: log.transactionHash, logIndex: log.logIndex, createdAt: blockTimestamp },
      });
      return;
    }
    case "Transfer": {
      const tokenId = id(args.tokenId);
      const to = wallet(args.to);
      if (to === "0x0000000000000000000000000000000000000000") return;
      const record = await tx.record.findUnique({ where: { id: tokenId } });
      if (!record) throw new Error(`Cannot index NFT Transfer before RecordSubmitted ${tokenId}`);
      await tx.nFT.upsert({
        where: { id: tokenId },
        update: { ownerAddress: to, status: nftStatusFor(record.status) },
        create: { id: tokenId, recordId: tokenId, ownerAddress: to, status: nftStatusFor(record.status), transactionHash: log.transactionHash, logIndex: log.logIndex, createdAt: blockTimestamp },
      });
      return;
    }
    default:
      throw new Error(`No handler registered for ${log.eventName}`);
  }
}

export function eventPayload(log: IndexerLog) {
  return JSON.parse(JSON.stringify(log.args, (_key, value) => typeof value === "bigint" ? value.toString() : value)) as Prisma.InputJsonValue;
}
