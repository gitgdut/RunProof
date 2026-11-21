-- V2 model (Category / Division / ChallengeReason) replaces the V1 game/cheat model.
-- This migration is a destructive reset and is only valid before any production data exists.
-- If the target database holds data you need to keep, export it first and write an
-- additive migration instead.

DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "games" CASCADE;
DROP TABLE IF EXISTS "game_modes" CASCADE;
DROP TABLE IF EXISTS "cheats" CASCADE;
DROP TABLE IF EXISTS "records" CASCADE;
DROP TABLE IF EXISTS "challenges" CASCADE;
DROP TABLE IF EXISTS "challenge_rounds" CASCADE;
DROP TABLE IF EXISTS "votes" CASCADE;
DROP TABLE IF EXISTS "evidence" CASCADE;
DROP TABLE IF EXISTS "rewards" CASCADE;
DROP TABLE IF EXISTS "stake_flows" CASCADE;
DROP TABLE IF EXISTS "nfts" CASCADE;
DROP TABLE IF EXISTS "leaderboards" CASCADE;
DROP TABLE IF EXISTS "withdrawals" CASCADE;
DROP TABLE IF EXISTS "reason_proposals" CASCADE;
DROP TABLE IF EXISTS "reason_proposal_votes" CASCADE;
DROP TABLE IF EXISTS "challenge_reasons" CASCADE;
DROP TABLE IF EXISTS "categories" CASCADE;
DROP TABLE IF EXISTS "divisions" CASCADE;
DROP TABLE IF EXISTS "reconcile_runs" CASCADE;
DROP TABLE IF EXISTS "chain_event_logs" CASCADE;
DROP TABLE IF EXISTS "sync_states" CASCADE;

DROP TYPE IF EXISTS "RecordStatus" CASCADE;
DROP TYPE IF EXISTS "CheatStatus" CASCADE;
DROP TYPE IF EXISTS "ChallengeStatus" CASCADE;
DROP TYPE IF EXISTS "Choice" CASCADE;
DROP TYPE IF EXISTS "RewardType" CASCADE;
DROP TYPE IF EXISTS "StakeFlowType" CASCADE;
DROP TYPE IF EXISTS "StakeKind" CASCADE;
DROP TYPE IF EXISTS "NFTStatus" CASCADE;

-- CreateTable
CREATE TABLE "categories" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "descriptionURI" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 0,
    "direction" INTEGER NOT NULL DEFAULT 1,
    "ruleVersion" INTEGER NOT NULL DEFAULT 0,
    "baseStake" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divisions" (
    "categoryId" INTEGER NOT NULL,
    "divisionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("categoryId","divisionId")
);

-- CreateTable
CREATE TABLE "records" (
    "id" INTEGER NOT NULL,
    "player" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "divisionId" INTEGER NOT NULL,
    "value" DECIMAL(78,0) NOT NULL,
    "direction" INTEGER NOT NULL DEFAULT 1,
    "evidenceHash" TEXT NOT NULL,
    "evidenceURI" TEXT NOT NULL,
    "stake" DECIMAL(78,0) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "ruleVersion" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 1,
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
CREATE TABLE "challenge_reasons" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discovererAddress" TEXT,
    "registeredAt" TIMESTAMP(3),
    "registered" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reason_proposals" (
    "id" INTEGER NOT NULL,
    "proposer" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bond" DECIMAL(78,0) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "reasonId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reason_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reason_proposal_votes" (
    "id" TEXT NOT NULL,
    "proposalId" INTEGER NOT NULL,
    "voter" TEXT NOT NULL,
    "support" BOOLEAN NOT NULL,
    "stake" DECIMAL(78,0) NOT NULL,
    "power" DECIMAL(78,0) NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reason_proposal_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" INTEGER NOT NULL,
    "recordId" INTEGER NOT NULL,
    "reasonId" INTEGER NOT NULL,
    "challenger" TEXT NOT NULL,
    "bond" DECIMAL(78,0) NOT NULL,
    "reserved" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "evidenceHash" TEXT NOT NULL,
    "evidenceURI" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "round" INTEGER NOT NULL DEFAULT 0,
    "special" BOOLEAN NOT NULL DEFAULT false,
    "extended" BOOLEAN NOT NULL DEFAULT false,
    "evidenceCount" INTEGER NOT NULL DEFAULT 1,
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
    "confirmPower" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "denyPower" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "confirmStake" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "denyStake" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "committedStake" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "committedVoters" INTEGER NOT NULL DEFAULT 0,
    "revealedVoters" INTEGER NOT NULL DEFAULT 0,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "winner" INTEGER,
    "winnerPower" DECIMAL(78,0) NOT NULL DEFAULT 0,
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
    "votingChoice" INTEGER,
    "stakeAmount" DECIMAL(78,0) NOT NULL,
    "votingPower" DECIMAL(65,30),
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
    "source" TEXT NOT NULL,
    "recordId" INTEGER,
    "reasonId" INTEGER,
    "challengeId" INTEGER,
    "proposalId" INTEGER,
    "walletAddress" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "kind" INTEGER,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stake_flows" (
    "id" TEXT NOT NULL,
    "flow" TEXT NOT NULL,
    "recordId" INTEGER,
    "reasonId" INTEGER,
    "challengeId" INTEGER,
    "walletAddress" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "kind" INTEGER NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stake_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfts" (
    "id" INTEGER NOT NULL,
    "recordId" INTEGER NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nfts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboards" (
    "categoryId" INTEGER NOT NULL,
    "divisionId" INTEGER NOT NULL,
    "bestRecordId" INTEGER NOT NULL,
    "bestValue" DECIMAL(78,0) NOT NULL,
    "blockNumber" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboards_pkey" PRIMARY KEY ("categoryId","divisionId")
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

-- CreateTable
CREATE TABLE "reconcile_runs" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainHead" BIGINT NOT NULL,
    "indexedBlock" BIGINT NOT NULL,
    "lagBlocks" BIGINT NOT NULL,
    "checkedBoards" INTEGER NOT NULL DEFAULT 0,
    "mismatches" JSONB NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "reconcile_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "divisions_categoryId_active_idx" ON "divisions"("categoryId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "records_evidenceHash_key" ON "records"("evidenceHash");

-- CreateIndex
CREATE UNIQUE INDEX "records_transactionHash_key" ON "records"("transactionHash");

-- CreateIndex
CREATE INDEX "records_categoryId_divisionId_status_value_idx" ON "records"("categoryId", "divisionId", "status", "value");

-- CreateIndex
CREATE INDEX "records_player_submittedAt_idx" ON "records"("player", "submittedAt");

-- CreateIndex
CREATE INDEX "records_status_submittedAt_idx" ON "records"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_reasons_code_key" ON "challenge_reasons"("code");

-- CreateIndex
CREATE INDEX "reason_proposals_status_idx" ON "reason_proposals"("status");

-- CreateIndex
CREATE INDEX "reason_proposal_votes_proposalId_idx" ON "reason_proposal_votes"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "reason_proposal_votes_transactionHash_logIndex_key" ON "reason_proposal_votes"("transactionHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_evidenceHash_key" ON "challenges"("evidenceHash");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_transactionHash_key" ON "challenges"("transactionHash");

-- CreateIndex
CREATE INDEX "challenges_status_createdAt_idx" ON "challenges"("status", "createdAt");

-- CreateIndex
CREATE INDEX "challenges_recordId_reasonId_idx" ON "challenges"("recordId", "reasonId");

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
CREATE INDEX "withdrawals_walletAddress_createdAt_idx" ON "withdrawals"("walletAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_transactionHash_logIndex_key" ON "withdrawals"("transactionHash", "logIndex");

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

-- CreateIndex
CREATE INDEX "reconcile_runs_ranAt_idx" ON "reconcile_runs"("ranAt");

-- AddForeignKey
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reason_proposal_votes" ADD CONSTRAINT "reason_proposal_votes_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "reason_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "challenge_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

