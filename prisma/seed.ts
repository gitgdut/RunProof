import { PrismaClient } from "@prisma/client";
import {
  demoChallengeRounds, demoChallenges, demoCheats, demoEvidence, demoGameModes, demoGames,
  demoNfts, demoRecords, demoRewards, demoStakeFlows, demoUsers, demoVotes,
} from "../src/lib/demo-data";

const prisma = new PrismaClient();
const dates = (value: Record<string, unknown>): any => Object.fromEntries(
  Object.entries(value).map(([key, item]) => [key, /At$|End$|Deadline$|submittedAt|createdAt|updatedAt/.test(key) ? new Date(String(item)) : item]),
);

async function main() {
  for (const user of demoUsers) {
    const { id: _id, ...profile } = user;
    await prisma.user.upsert({ where: { walletAddress: user.walletAddress }, update: dates(profile), create: dates(user) });
  }
  for (const game of demoGames) {
    await prisma.game.upsert({ where: { id: game.id }, update: dates(game), create: dates(game) });
  }
  for (const mode of demoGameModes) {
    await prisma.gameMode.upsert({ where: { gameId_modeId: { gameId: mode.gameId, modeId: mode.modeId } }, update: dates(mode), create: dates(mode) });
  }
  for (const cheat of demoCheats) {
    await prisma.cheat.upsert({ where: { id: cheat.id }, update: dates(cheat), create: dates(cheat) });
  }
  for (const record of demoRecords) {
    await prisma.record.upsert({ where: { id: record.id }, update: dates(record), create: dates(record) });
  }
  for (const challenge of demoChallenges) {
    await prisma.challenge.upsert({ where: { id: challenge.id }, update: dates(challenge), create: dates(challenge) });
  }
  for (const round of demoChallengeRounds) {
    await prisma.challengeRound.upsert({ where: { challengeId_round: { challengeId: round.challengeId, round: round.round } }, update: dates(round), create: dates(round) });
  }
  for (const evidence of demoEvidence) {
    await prisma.evidence.upsert({ where: { id: evidence.id }, update: dates(evidence), create: dates(evidence) });
  }
  for (const vote of demoVotes) {
    await prisma.vote.upsert({ where: { id: vote.id }, update: dates(vote), create: dates(vote) });
  }
  for (const reward of demoRewards) {
    await prisma.reward.upsert({ where: { id: reward.id }, update: dates(reward), create: dates(reward) });
  }
  for (const flow of demoStakeFlows) {
    await prisma.stakeFlow.upsert({ where: { id: flow.id }, update: dates(flow), create: dates(flow) });
  }
  for (const nft of demoNfts) {
    await prisma.nFT.upsert({ where: { id: nft.id }, update: dates(nft), create: dates(nft) });
  }
  console.log(`Seeded ${demoRecords.length} records, ${demoChallenges.length} challenges, ${demoVotes.length} votes.`);
}

main().finally(() => prisma.$disconnect());
