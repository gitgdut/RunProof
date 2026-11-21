-- Contract-alignment reset. Run only before production data exists.
DROP TABLE IF EXISTS "chain_event_logs", "stake_flows", "rewards", "evidence", "votes", "challenge_rounds", "challenges", "nfts", "records", "cheats", "game_modes", "games", "users", "sync_states" CASCADE;
DROP TYPE IF EXISTS "VotingChoice", "VoteStatus", "RecordStatus", "CheatStatus", "ChallengeStatus", "RewardType", "NFTStatus", "Choice", "StakeFlowType", "StakeKind" CASCADE;

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('PENDING', 'PROVISIONAL', 'VERIFIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CheatStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('PENDING', 'VOTING', 'EVIDENCE_VOTING', 'CONFIRMED', 'DENIED', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "Choice" AS ENUM ('CONFIRM', 'DENY');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('CHALLENGER_REWARD', 'PLAYER_COMPENSATION', 'VOTER_REWARD');

-- CreateEnum
CREATE TYPE "StakeFlowType" AS ENUM ('RETURNED', 'SLASHED');

-- CreateEnum
CREATE TYPE "StakeKind" AS ENUM ('PLAYER_STAKE', 'CHALLENGE_BOND', 'VOTER_STAKE');

-- CreateEnum
CREATE TYPE "NFTStatus" AS ENUM ('PROVISIONAL', 'VERIFIED', 'REVOKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "gameVersion" INTEGER NOT NULL DEFAULT 0,
    "ruleVersion" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_modes" (
    "gameId" INTEGER NOT NULL,
    "modeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_modes_pkey" PRIMARY KEY ("gameId","modeId")
);

-- CreateTable
CREATE TABLE "cheats" (
    "id" INTEGER NOT NULL,
    "cheatCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "evidenceURI" TEXT,
    "discovererAddress" TEXT,
    "status" "CheatStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gameId" INTEGER,

    CONSTRAINT "cheats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "records" (
    "id" INTEGER NOT NULL,
    "playerAddress" TEXT NOT NULL,
    "gameId" INTEGER NOT NULL,
    "gameMode" INTEGER NOT NULL,
    "score" BIGINT NOT NULL,
    "stakeAmount" DECIMAL(78,0) NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "evidenceURI" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "challengeDeadline" TIMESTAMP(3) NOT NULL,
    "gameVersion" INTEGER NOT NULL DEFAULT 0,
    "ruleVersion" INTEGER NOT NULL DEFAULT 0,
    "stakeSettled" BOOLEAN NOT NULL DEFAULT false,
    "activeChallenges" INTEGER NOT NULL DEFAULT 0,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL DEFAULT 0,
    "blockNumber" BIGINT,
    "indexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" INTEGER NOT NULL,
    "recordId" INTEGER NOT NULL,
    "cheatId" INTEGER NOT NULL,
    "challenger" TEXT NOT NULL,
    "bond" DECIMAL(78,0) NOT NULL,
    "reserved" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "evidenceHash" TEXT NOT NULL,
    "evidenceURI" TEXT NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "round" INTEGER NOT NULL DEFAULT 0,
    "special" BOOLEAN NOT NULL DEFAULT false,
    "extended" BOOLEAN NOT NULL DEFAULT false,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL DEFAULT 0,
    "blockNumber" BIGINT,
    "indexedAt" TIMESTAMP(3),

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_rounds" (
    "challengeId" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "commitEnd" TIMESTAMP(3),
    "revealEnd" TIMESTAMP(3),
    "confirmPower" BIGINT NOT NULL DEFAULT 0,
    "denyPower" BIGINT NOT NULL DEFAULT 0,
    "confirmStake" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "denyStake" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "committedStake" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "committedVoters" INTEGER NOT NULL DEFAULT 0,
    "revealedVoters" INTEGER NOT NULL DEFAULT 0,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "winner" "Choice",
    "winnerPower" BIGINT NOT NULL DEFAULT 0,
    "rewardPool" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "slashBps" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_rounds_pkey" PRIMARY KEY ("challengeId","round")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "challengeId" INTEGER NOT NULL,
    "voterAddress" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "votingChoice" "Choice",
    "stakeAmount" DECIMAL(78,0) NOT NULL,
    "votingPower" BIGINT,
    "commitHash" TEXT,
    "commitTransactionHash" TEXT,
    "revealTransactionHash" TEXT,
    "revealed" BOOLEAN NOT NULL DEFAULT false,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "challengeId" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "submitter" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "evidenceURI" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" TEXT NOT NULL,
    "recordId" INTEGER,
    "cheatId" INTEGER,
    "challengeId" INTEGER,
    "walletAddress" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stake_flows" (
    "id" TEXT NOT NULL,
    "recordId" INTEGER,
    "cheatId" INTEGER,
    "challengeId" INTEGER,
    "walletAddress" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "flowType" "StakeFlowType" NOT NULL,
    "stakeKind" "StakeKind" NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stake_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfts" (
    "id" INTEGER NOT NULL,
    "recordId" INTEGER NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "status" "NFTStatus" NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nfts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_event_logs" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "source" TEXT NOT NULL,
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
    "lastBlockHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "cheats_cheatCode_key" ON "cheats"("cheatCode");

-- CreateIndex
CREATE INDEX "cheats_status_idx" ON "cheats"("status");

-- CreateIndex
CREATE UNIQUE INDEX "records_evidenceHash_key" ON "records"("evidenceHash");

-- CreateIndex
CREATE UNIQUE INDEX "records_transactionHash_key" ON "records"("transactionHash");

-- CreateIndex
CREATE INDEX "records_gameId_gameMode_status_score_idx" ON "records"("gameId", "gameMode", "status", "score");

-- CreateIndex
CREATE INDEX "records_playerAddress_submittedAt_idx" ON "records"("playerAddress", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_evidenceHash_key" ON "challenges"("evidenceHash");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_transactionHash_key" ON "challenges"("transactionHash");

-- CreateIndex
CREATE INDEX "challenges_status_createdAt_idx" ON "challenges"("status", "createdAt");

-- CreateIndex
CREATE INDEX "challenges_recordId_cheatId_idx" ON "challenges"("recordId", "cheatId");

-- CreateIndex
CREATE INDEX "challenges_challenger_createdAt_idx" ON "challenges"("challenger", "createdAt");

-- CreateIndex
CREATE INDEX "votes_voterAddress_createdAt_idx" ON "votes"("voterAddress", "createdAt");

-- CreateIndex
CREATE INDEX "votes_commitTransactionHash_idx" ON "votes"("commitTransactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "votes_challengeId_round_voterAddress_key" ON "votes"("challengeId", "round", "voterAddress");

-- CreateIndex
CREATE INDEX "evidence_challengeId_round_idx" ON "evidence"("challengeId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_transactionHash_logIndex_key" ON "evidence"("transactionHash", "logIndex");

-- CreateIndex
CREATE INDEX "rewards_walletAddress_createdAt_idx" ON "rewards"("walletAddress", "createdAt");

-- CreateIndex
CREATE INDEX "rewards_recordId_idx" ON "rewards"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "rewards_transactionHash_logIndex_key" ON "rewards"("transactionHash", "logIndex");

-- CreateIndex
CREATE INDEX "stake_flows_walletAddress_createdAt_idx" ON "stake_flows"("walletAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stake_flows_transactionHash_logIndex_key" ON "stake_flows"("transactionHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "nfts_recordId_key" ON "nfts"("recordId");

-- CreateIndex
CREATE INDEX "nfts_ownerAddress_status_idx" ON "nfts"("ownerAddress", "status");

-- CreateIndex
CREATE INDEX "chain_event_logs_contractAddress_blockNumber_idx" ON "chain_event_logs"("contractAddress", "blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "chain_event_logs_chainId_transactionHash_logIndex_key" ON "chain_event_logs"("chainId", "transactionHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "sync_states_chainId_contractAddress_key" ON "sync_states"("chainId", "contractAddress");

-- AddForeignKey
ALTER TABLE "game_modes" ADD CONSTRAINT "game_modes_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheats" ADD CONSTRAINT "cheats_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_playerAddress_fkey" FOREIGN KEY ("playerAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_cheatId_fkey" FOREIGN KEY ("cheatId") REFERENCES "cheats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_rounds" ADD CONSTRAINT "challenge_rounds_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stake_flows" ADD CONSTRAINT "stake_flows_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfts" ADD CONSTRAINT "nfts_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
