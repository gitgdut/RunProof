import { PrismaClient } from "@prisma/client";
import * as demo from "../src/lib/demo-data";

const prisma = new PrismaClient();
const date = (value: string | Date) => new Date(value);

/**
 * Seeds the V2 demo dataset that mirrors the deployed contracts (5 categories, one
 * confirmed challenge on a fabricated Minecraft run). Safe to re-run: every write is an
 * upsert keyed by the on-chain id.
 */
async function main() {
  for (const category of demo.demoCategories) {
    const { id, ...data } = category;
    await prisma.category.upsert({
      where: { id },
      update: { ...data, createdAt: date(category.createdAt), updatedAt: date(category.updatedAt) },
      create: { id, ...data, createdAt: date(category.createdAt), updatedAt: date(category.updatedAt) },
    });
  }

  for (const division of demo.demoDivisions) {
    await prisma.division.upsert({
      where: { categoryId_divisionId: { categoryId: division.categoryId, divisionId: division.divisionId } },
      update: { name: division.name, active: division.active },
      create: {
        categoryId: division.categoryId, divisionId: division.divisionId, name: division.name, active: division.active,
        createdAt: date(division.createdAt), updatedAt: date(division.updatedAt),
      },
    });
  }

  for (const reason of demo.demoReasons) {
    const { id, ...data } = reason;
    await prisma.challengeReason.upsert({
      where: { id },
      update: { ...data, registeredAt: data.registeredAt ? date(data.registeredAt) : null },
      create: {
        id, ...data, registeredAt: data.registeredAt ? date(data.registeredAt) : null,
        createdAt: date(reason.createdAt), updatedAt: date(reason.updatedAt),
      },
    });
  }

  for (const record of demo.demoRecords) {
    const { id, ...data } = record;
    const payload = {
      ...data,
      submittedAt: date(record.submittedAt),
      deadline: date(record.deadline),
      indexedAt: date(record.indexedAt),
      createdAt: date(record.createdAt),
      updatedAt: date(record.updatedAt),
    };
    await prisma.record.upsert({ where: { id }, update: payload, create: { id, ...payload } });
  }

  for (const board of demo.demoLeaderboards) {
    await prisma.leaderboard.upsert({
      where: { categoryId_divisionId: { categoryId: board.categoryId, divisionId: board.divisionId } },
      update: { bestRecordId: board.bestRecordId, bestValue: board.bestValue, blockNumber: board.blockNumber },
      create: {
        categoryId: board.categoryId, divisionId: board.divisionId, bestRecordId: board.bestRecordId,
        bestValue: board.bestValue, blockNumber: board.blockNumber,
      },
    });
  }

  for (const challenge of demo.demoChallenges) {
    const { id, ...data } = challenge;
    const payload = { ...data, createdAt: date(challenge.createdAt), indexedAt: date(challenge.indexedAt) };
    await prisma.challenge.upsert({ where: { id }, update: payload, create: { id, ...payload } });
  }

  for (const round of demo.demoChallengeRounds) {
    const payload = {
      ...round,
      commitEnd: date(round.commitEnd),
      revealEnd: date(round.revealEnd),
      updatedAt: date(round.updatedAt),
    };
    await prisma.challengeRound.upsert({
      where: { challengeId_round: { challengeId: round.challengeId, round: round.round } },
      update: payload,
      create: payload,
    });
  }

  for (const vote of demo.demoVotes) {
    const { id, ...data } = vote;
    const payload = { ...data, createdAt: date(vote.createdAt), updatedAt: date(vote.updatedAt) };
    await prisma.vote.upsert({
      where: { challengeId_round_voterAddress: { challengeId: vote.challengeId, round: vote.round, voterAddress: vote.voterAddress } },
      update: payload,
      create: { id, ...payload },
    });
  }

  for (const evidence of demo.demoEvidence) {
    const { id, ...data } = evidence;
    await prisma.evidence.upsert({
      where: { transactionHash_logIndex: { transactionHash: data.transactionHash, logIndex: data.logIndex } },
      update: data,
      create: { id, ...data, createdAt: date(evidence.createdAt) },
    });
  }

  for (const reward of demo.demoRewards) {
    const { id, ...data } = reward;
    await prisma.reward.upsert({
      where: { transactionHash_logIndex: { transactionHash: data.transactionHash, logIndex: data.logIndex } },
      update: data,
      create: { id, ...data, createdAt: date(reward.createdAt) },
    });
  }

  for (const flow of demo.demoStakeFlows) {
    const { id, ...data } = flow;
    await prisma.stakeFlow.upsert({
      where: { transactionHash_logIndex: { transactionHash: data.transactionHash, logIndex: data.logIndex } },
      update: data,
      create: { id, ...data, createdAt: date(flow.createdAt) },
    });
  }

  for (const withdrawal of demo.demoWithdrawals) {
    const { id, ...data } = withdrawal;
    await prisma.withdrawal.upsert({
      where: { transactionHash_logIndex: { transactionHash: data.transactionHash, logIndex: data.logIndex } },
      update: data,
      create: { id, ...data, createdAt: date(withdrawal.createdAt) },
    });
  }

  for (const nft of demo.demoNfts) {
    const { id, ...data } = nft;
    await prisma.nFT.upsert({
      where: { id },
      update: { ...data, createdAt: date(nft.createdAt), updatedAt: date(nft.updatedAt) },
      create: { id, ...data, createdAt: date(nft.createdAt), updatedAt: date(nft.updatedAt) },
    });
  }

  const counts = await prisma.$transaction([
    prisma.category.count(), prisma.division.count(), prisma.challengeReason.count(), prisma.record.count(),
    prisma.leaderboard.count(), prisma.challenge.count(), prisma.vote.count(), prisma.nFT.count(),
  ]);
  console.log(JSON.stringify({
    categories: counts[0], divisions: counts[1], reasons: counts[2], records: counts[3],
    leaderboards: counts[4], challenges: counts[5], votes: counts[6], nfts: counts[7],
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
