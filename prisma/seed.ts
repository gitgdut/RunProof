import { PrismaClient } from "@prisma/client";
import { demoCheats, demoChallenges, demoGames, demoNfts, demoRecords, demoRewards, demoUsers, demoVotes } from "../src/lib/demo-data";

const prisma = new PrismaClient();
const dates = (value: Record<string, unknown>): any => Object.fromEntries(
  Object.entries(value).map(([key, item]) => [key, key.endsWith("At") || key === "challengeDeadline" ? new Date(String(item)) : item]),
);

async function main() {
  for (const user of demoUsers) {
    const { id: _id, ...profile } = user;
    await prisma.user.upsert({ where: { walletAddress: user.walletAddress }, update: dates(profile), create: dates(user) });
  }
  for (const game of demoGames) {
    await prisma.game.upsert({ where: { id: game.id }, update: game, create: game });
  }
  for (const record of demoRecords) {
    await prisma.record.upsert({ where: { id: record.id }, update: dates(record), create: dates(record) });
  }
  for (const cheat of demoCheats) {
    await prisma.cheat.upsert({ where: { id: cheat.id }, update: dates(cheat), create: dates(cheat) });
  }
  for (const challenge of demoChallenges) {
    await prisma.challenge.upsert({ where: { id: challenge.id }, update: dates(challenge), create: dates(challenge) });
  }
  for (const vote of demoVotes) {
    await prisma.vote.upsert({ where: { id: vote.id }, update: dates(vote), create: dates(vote) });
  }
  for (const reward of demoRewards) {
    await prisma.reward.upsert({ where: { id: reward.id }, update: dates(reward), create: dates(reward) });
  }
  for (const nft of demoNfts) {
    await prisma.nFT.upsert({ where: { id: nft.id }, update: dates(nft), create: dates(nft) });
  }
  console.log(`Seeded ${demoRecords.length} records, ${demoChallenges.length} challenges, ${demoVotes.length} votes.`);
}

main().finally(() => prisma.$disconnect());
