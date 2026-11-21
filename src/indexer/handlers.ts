import type { Prisma } from "@prisma/client";
import { challengeWindowHours } from "../lib/config";

export type IndexerLog = {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockHash: string;
  address: string;
};

const text = (value: unknown) => String(value);
const address = (value: unknown) => text(value).toLowerCase();
const amount = (value: unknown) => BigInt(String(value)).toString();

async function ensureUser(tx: Prisma.TransactionClient, walletAddress: string) {
  await tx.user.upsert({ where: { walletAddress }, update: {}, create: { walletAddress } });
}

export async function applyEvent(tx: Prisma.TransactionClient, log: IndexerLog, blockTimestamp: Date) {
  const args = log.args;
  switch (log.eventName) {
    case "RecordSubmitted": {
      const chainRecordId = text(args.recordId);
      const playerAddress = address(args.playerAddress);
      const gameId = text(args.gameId);
      const game = await tx.game.findUnique({ where: { id: gameId } });
      if (!game) throw new Error(`Cannot index RecordSubmitted: game ${gameId} is not registered`);
      const score = Number(args.score);
      if (!Number.isSafeInteger(score) || score < 0 || score > 2_147_483_647) throw new Error(`RecordSubmitted score ${String(args.score)} is outside the supported range`);
      await ensureUser(tx, playerAddress);
      const existing = await tx.record.findFirst({ where: { OR: [{ chainRecordId }, { transactionHash: log.transactionHash }] } });
      const data = {
        chainRecordId, playerAddress, gameId, gameMode: text(args.gameMode), score,
        stakeAmount: amount(args.stakeAmount), evidenceHash: text(args.evidenceHash), status: "CHALLENGE_PERIOD" as const,
        submittedAt: blockTimestamp, challengeDeadline: new Date(blockTimestamp.getTime() + challengeWindowHours() * 3_600_000), transactionHash: log.transactionHash,
      };
      if (existing) await tx.record.update({ where: { id: existing.id }, data });
      else await tx.record.create({ data: { ...data, videoUrl: "", replayUrl: null } });
      return;
    }
    case "ChallengeCreated": {
      const chainChallengeId = text(args.challengeId);
      const record = await tx.record.findUnique({ where: { chainRecordId: text(args.recordId) } });
      const cheat = await tx.cheat.findUnique({ where: { chainCheatId: text(args.cheatId) } });
      if (!record || !cheat) throw new Error("Cannot index ChallengeCreated before its record and cheat are registered");
      const challenger = address(args.challenger);
      await ensureUser(tx, challenger);
      const existing = await tx.challenge.findFirst({ where: { OR: [{ chainChallengeId }, { transactionHash: log.transactionHash }] } });
      const data = { chainChallengeId, recordId: record.id, cheatId: cheat.id, challenger, evidenceHash: text(args.evidenceHash), status: "VOTING" as const, createdAt: blockTimestamp, transactionHash: log.transactionHash };
      if (existing) await tx.challenge.update({ where: { id: existing.id }, data });
      else await tx.challenge.create({ data });
      return;
    }
    case "VoteCommitted": {
      const challenge = await tx.challenge.findUnique({ where: { chainChallengeId: text(args.challengeId) } });
      if (!challenge) throw new Error("Cannot index VoteCommitted before its challenge");
      const voterAddress = address(args.voterAddress);
      await ensureUser(tx, voterAddress);
      await tx.vote.upsert({
        where: { challengeId_voterAddress: { challengeId: challenge.id, voterAddress } },
        update: { commitHash: text(args.commitHash), stakeAmount: amount(args.stakeAmount), transactionHash: log.transactionHash, status: "COMMITTED" },
        create: { challengeId: challenge.id, voterAddress, commitHash: text(args.commitHash), stakeAmount: amount(args.stakeAmount), transactionHash: log.transactionHash, status: "COMMITTED" },
      });
      await tx.challenge.update({ where: { id: challenge.id }, data: { status: "VOTING" } });
      return;
    }
    case "VotingFinalized": {
      const challenge = await tx.challenge.findUnique({ where: { chainChallengeId: text(args.challengeId) } });
      if (!challenge) throw new Error("Cannot index VotingFinalized before its challenge");
      await tx.challenge.update({ where: { id: challenge.id }, data: { status: args.challengeUpheld ? "UPHELD" : "REJECTED" } });
      await tx.vote.updateMany({ where: { challengeId: challenge.id }, data: { status: "FINALIZED" } });
      return;
    }
    case "RecordVerified":
    case "RecordRevoked": {
      const result = await tx.record.updateMany({ where: { chainRecordId: text(args.recordId) }, data: { status: log.eventName === "RecordVerified" ? "VERIFIED" : "REVOKED" } });
      if (result.count === 0) throw new Error(`Cannot index ${log.eventName} before RecordSubmitted`);
      return;
    }
    case "RewardDistributed": {
      const chainRewardId = text(args.rewardId);
      const walletAddress = address(args.walletAddress);
      await ensureUser(tx, walletAddress);
      const related = await tx.record.findUnique({ where: { chainRecordId: text(args.relatedRecordId) } });
      const rewardTypes = ["RECORD_VERIFIED", "CHALLENGE_SUCCESS", "VOTE_REWARD", "OTHER"] as const;
      const rewardType = rewardTypes[Number(args.rewardType)] ?? "OTHER";
      await tx.reward.upsert({
        where: { chainRewardId },
        update: { walletAddress, amount: amount(args.amount), rewardType, relatedRecordId: related?.id, transactionHash: log.transactionHash },
        create: { chainRewardId, walletAddress, amount: amount(args.amount), rewardType, relatedRecordId: related?.id, transactionHash: log.transactionHash },
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
