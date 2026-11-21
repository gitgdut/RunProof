-- A commit hash may be shared by different voters/challenges depending on the contract encoding.
DROP INDEX "votes_commitHash_key";
CREATE INDEX "votes_commitHash_idx" ON "votes"("commitHash");

-- One batch transaction can distribute multiple rewards to the same wallet.
-- Chain-level rewardId is the idempotency key.
DROP INDEX "rewards_transactionHash_walletAddress_rewardType_key";
CREATE INDEX "rewards_transactionHash_idx" ON "rewards"("transactionHash");
