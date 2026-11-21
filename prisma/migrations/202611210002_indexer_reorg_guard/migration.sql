-- Store the canonical hash of the indexed cursor block so a later run can detect reorgs.
ALTER TABLE "sync_states" ADD COLUMN "lastBlockHash" TEXT;
