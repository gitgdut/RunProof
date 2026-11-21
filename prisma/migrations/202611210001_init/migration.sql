-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('PENDING', 'CHALLENGE_PERIOD', 'VERIFIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CheatStatus" AS ENUM ('ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('PENDING', 'VOTING', 'UPHELD', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VotingChoice" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "VoteStatus" AS ENUM ('COMMITTED', 'REVEALED', 'FINALIZED', 'SLASHED');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('RECORD_VERIFIED', 'CHALLENGE_SUCCESS', 'VOTE_REWARD', 'OTHER');

-- CreateEnum
CREATE TYPE "NFTStatus" AS ENUM ('PENDING', 'MINTED', 'TRANSFERRED', 'REVOKED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supportedModes" JSONB NOT NULL,
    "rulesVersion" TEXT NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "records" (
    "id" TEXT NOT NULL,
    "chainRecordId" TEXT,
    "playerAddress" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gameMode" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "stakeAmount" DECIMAL(78,0) NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "replayUrl" TEXT,
    "evidenceHash" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "challengeDeadline" TIMESTAMP(3) NOT NULL,
    "transactionHash" TEXT NOT NULL,

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cheats" (
    "id" TEXT NOT NULL,
    "chainCheatId" TEXT,
    "cheatCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" "CheatStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cheats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "chainChallengeId" TEXT,
    "recordId" TEXT NOT NULL,
    "cheatId" TEXT NOT NULL,
    "challenger" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionHash" TEXT NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "voterAddress" TEXT NOT NULL,
    "votingChoice" "VotingChoice",
    "stakeAmount" DECIMAL(78,0) NOT NULL,
    "commitHash" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "status" "VoteStatus" NOT NULL DEFAULT 'COMMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" TEXT NOT NULL,
    "chainRewardId" TEXT,
    "walletAddress" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "relatedRecordId" TEXT,
    "transactionHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfts" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "status" "NFTStatus" NOT NULL DEFAULT 'PENDING',
    "transactionHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nfts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_event_logs" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_states" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "lastBlock" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_walletAddress_key" ON "users"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "records_chainRecordId_key" ON "records"("chainRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "records_transactionHash_key" ON "records"("transactionHash");

-- CreateIndex
CREATE INDEX "records_gameId_gameMode_status_score_idx" ON "records"("gameId", "gameMode", "status", "score");

-- CreateIndex
CREATE INDEX "records_playerAddress_submittedAt_idx" ON "records"("playerAddress", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "records_playerAddress_gameId_gameMode_evidenceHash_key" ON "records"("playerAddress", "gameId", "gameMode", "evidenceHash");

-- CreateIndex
CREATE UNIQUE INDEX "cheats_chainCheatId_key" ON "cheats"("chainCheatId");

-- CreateIndex
CREATE INDEX "cheats_gameId_status_idx" ON "cheats"("gameId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cheats_gameId_cheatCode_key" ON "cheats"("gameId", "cheatCode");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_chainChallengeId_key" ON "challenges"("chainChallengeId");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_transactionHash_key" ON "challenges"("transactionHash");

-- CreateIndex
CREATE INDEX "challenges_status_createdAt_idx" ON "challenges"("status", "createdAt");

-- CreateIndex
CREATE INDEX "challenges_challenger_createdAt_idx" ON "challenges"("challenger", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_recordId_challenger_evidenceHash_key" ON "challenges"("recordId", "challenger", "evidenceHash");

-- CreateIndex
CREATE UNIQUE INDEX "votes_commitHash_key" ON "votes"("commitHash");

-- CreateIndex
CREATE INDEX "votes_voterAddress_createdAt_idx" ON "votes"("voterAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "votes_challengeId_voterAddress_key" ON "votes"("challengeId", "voterAddress");

-- CreateIndex
CREATE UNIQUE INDEX "rewards_chainRewardId_key" ON "rewards"("chainRewardId");

-- CreateIndex
CREATE INDEX "rewards_walletAddress_createdAt_idx" ON "rewards"("walletAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rewards_transactionHash_walletAddress_rewardType_key" ON "rewards"("transactionHash", "walletAddress", "rewardType");

-- CreateIndex
CREATE UNIQUE INDEX "nfts_tokenId_key" ON "nfts"("tokenId");

-- CreateIndex
CREATE INDEX "nfts_ownerAddress_status_idx" ON "nfts"("ownerAddress", "status");

-- CreateIndex
CREATE INDEX "chain_event_logs_contractAddress_blockNumber_idx" ON "chain_event_logs"("contractAddress", "blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "chain_event_logs_chainId_transactionHash_logIndex_key" ON "chain_event_logs"("chainId", "transactionHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "sync_states_chainId_contractAddress_key" ON "sync_states"("chainId", "contractAddress");

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_playerAddress_fkey" FOREIGN KEY ("playerAddress") REFERENCES "users"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheats" ADD CONSTRAINT "cheats_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_cheatId_fkey" FOREIGN KEY ("cheatId") REFERENCES "cheats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_relatedRecordId_fkey" FOREIGN KEY ("relatedRecordId") REFERENCES "records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfts" ADD CONSTRAINT "nfts_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
