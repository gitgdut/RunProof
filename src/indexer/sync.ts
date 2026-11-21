import type { Prisma } from "@prisma/client";
import { createPublicClient, http } from "viem";
import { prisma } from "../lib/db";
import { indexedEvents } from "./abi";
import { indexerConfig, sourceForAddress } from "./config";
import { applyEvent, computeBest, eventPayload, type IndexerLog } from "./handlers";
import { readBestRecord, readChallenge, readRecord, readRound, readVote } from "./reads";

export class ChainReorgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainReorgError";
  }
}

export function monadClient(config: ReturnType<typeof indexerConfig>) {
  return createPublicClient({ transport: http(config.rpcUrl, { timeout: 20_000, retryCount: 2 }) });
}

const recordStatuses = { 0: "NONE", 1: "PROVISIONAL", 2: "VERIFIED", 3: "REVOKED" } as const;
const date = (value: bigint) => new Date(Number(value) * 1000);

type Client = ReturnType<typeof monadClient>;
type Config = ReturnType<typeof indexerConfig>;

/** Re-applies chain state over the derived tables for everything the batch touched. */
async function reconcileBlocks(client: Client, config: Config, logs: IndexerLog[]) {
  const recordIds = new Set<number>();
  const challengeIds = new Set<number>();
  const voteKeys = new Map<string, { challengeId: number; round: number; voter: string }>();
  const boards = new Map<string, { categoryId: number; divisionId: number }>();

  for (const log of logs) {
    if (log.args.recordId && Number(log.args.recordId) > 0) recordIds.add(Number(log.args.recordId));
    if (log.args.challengeId && Number(log.args.challengeId) > 0) challengeIds.add(Number(log.args.challengeId));
    if (log.eventName === "LeaderboardUpdated") {
      const categoryId = Number(log.args.categoryId);
      const divisionId = Number(log.args.divisionId);
      boards.set(`${categoryId}:${divisionId}`, { categoryId, divisionId });
    }
    if (log.args.challengeId && log.args.voter) {
      const challengeId = Number(log.args.challengeId);
      const round = Number(log.args.round);
      const voter = String(log.args.voter).toLowerCase();
      voteKeys.set(`${challengeId}:${round}:${voter}`, { challengeId, round, voter });
    }
  }

  for (const recordId of [...recordIds].slice(0, config.reconcileLimit)) {
    try {
      const record = await readRecord(client, config, recordId);
      await prisma.record.update({
        where: { id: recordId },
        data: {
          player: record.player.toLowerCase(), categoryId: record.categoryId, divisionId: record.divisionId,
          value: record.value.toString(), direction: record.direction, evidenceHash: record.evidenceHash,
          evidenceURI: record.evidenceURI, stake: record.stake.toString(), submittedAt: date(record.submittedAt),
          deadline: date(record.deadline), ruleVersion: record.ruleVersion, status: record.status,
          stakeSettled: record.stakeSettled, activeChallenges: record.activeChallenges, indexedAt: new Date(),
        },
      });
      const nftStatus = record.status === 2 ? 2 : record.status === 3 ? 3 : 1;
      await prisma.nFT.updateMany({ where: { recordId }, data: { status: nftStatus } });
      boards.set(`${record.categoryId}:${record.divisionId}`, { categoryId: record.categoryId, divisionId: record.divisionId });
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", action: "reconcile_record", recordId, message: error instanceof Error ? error.message : String(error) }));
    }
  }

  for (const challengeId of [...challengeIds].slice(0, config.reconcileLimit)) {
    try {
      const challenge = await readChallenge(client, config, challengeId);
      await prisma.challenge.update({
        where: { id: challengeId },
        data: {
          recordId: challenge.recordId, reasonId: challenge.reasonId, challenger: challenge.challenger.toLowerCase(),
          bond: challenge.bond.toString(), reserved: challenge.reserved.toString(), evidenceHash: challenge.evidenceHash,
          evidenceURI: challenge.evidenceURI, status: challenge.status, round: challenge.round, special: challenge.special,
          extended: challenge.extended, evidenceCount: challenge.evidenceCount, createdAt: date(challenge.createdAt), indexedAt: new Date(),
        },
      });
      // Round 0 is settled without a VotingFinalized event when a challenge escalates to
      // evidence voting, so reconcile every round up to the current one.
      for (const roundNumber of [...new Set([0, challenge.round])]) {
        const round = await readRound(client, config, challengeId, roundNumber);
        const data = {
          commitEnd: round.commitEnd > 0n ? date(round.commitEnd) : null,
          revealEnd: round.revealEnd > 0n ? date(round.revealEnd) : null,
          confirmPower: round.confirmPower.toString(), denyPower: round.denyPower.toString(),
          confirmStake: round.confirmStake.toString(), denyStake: round.denyStake.toString(),
          committedStake: round.committedStake.toString(), committedVoters: round.committedVoters,
          revealedVoters: round.revealedVoters, finalized: round.finalized, winner: round.winner || null,
          winnerPower: round.winnerPower.toString(), rewardPool: round.rewardPool.toString(), slashBps: round.slashBps,
        };
        await prisma.challengeRound.upsert({
          where: { challengeId_round: { challengeId, round: roundNumber } },
          update: data,
          create: { challengeId, round: roundNumber, ...data },
        });
      }
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", action: "reconcile_challenge", challengeId, message: error instanceof Error ? error.message : String(error) }));
    }
  }

  for (const { challengeId, round, voter } of [...voteKeys.values()].slice(0, config.reconcileLimit)) {
    try {
      const vote = await readVote(client, config, challengeId, round, voter);
      await prisma.vote.update({
        where: { challengeId_round_voterAddress: { challengeId, round, voterAddress: voter } },
        data: {
          commitHash: vote.commitment, stakeAmount: vote.stake.toString(), votingChoice: vote.choice || null,
          revealed: vote.revealed, claimed: vote.claimed,
        },
      });
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", action: "reconcile_vote", challengeId, round, voter, message: error instanceof Error ? error.message : String(error) }));
    }
  }

  return boards;
}

/** Compares the stored board pointer with the chain and repairs drift. */
export async function reconcileBoards(client: Client, config: Config, boards: Map<string, { categoryId: number; divisionId: number }>) {
  const mismatches: Array<Record<string, unknown>> = [];
  let checked = 0;

  for (const { categoryId, divisionId } of [...boards.values()].slice(0, config.reconcileLimit)) {
    checked += 1;
    try {
      const chainBest = await readBestRecord(client, config, categoryId, divisionId);
      const stored = await prisma.leaderboard.findUnique({ where: { categoryId_divisionId: { categoryId, divisionId } } });
      const storedBest = stored?.bestRecordId ?? 0;
      if (Number(chainBest) === storedBest) continue;

      mismatches.push({ categoryId, divisionId, stored: storedBest, chain: Number(chainBest) });
      const best = Number(chainBest) === 0 ? null : await readRecord(client, config, Number(chainBest));
      if (best) {
        // Repair the record the chain points at when we already know it; never invent a row,
        // because a fabricated transactionHash would pollute the archive.
        const repaired = await prisma.record.updateMany({
          where: { id: Number(chainBest) },
          data: {
            player: best.player.toLowerCase(), categoryId: best.categoryId, divisionId: best.divisionId,
            value: best.value.toString(), direction: best.direction, evidenceHash: best.evidenceHash,
            evidenceURI: best.evidenceURI, stake: best.stake.toString(), submittedAt: date(best.submittedAt),
            deadline: date(best.deadline), ruleVersion: best.ruleVersion, status: best.status,
            stakeSettled: best.stakeSettled, activeChallenges: best.activeChallenges, indexedAt: new Date(),
          },
        });
        if (repaired.count === 0) {
          mismatches.push({ categoryId, divisionId, kind: "missing_record", recordId: Number(chainBest) });
        }
      }
      const data = { bestRecordId: Number(chainBest), bestValue: best?.value.toString() ?? "0" };
      await prisma.leaderboard.upsert({
        where: { categoryId_divisionId: { categoryId, divisionId } },
        update: data,
        create: { categoryId, divisionId, ...data },
      });
    } catch (error) {
      mismatches.push({ categoryId, divisionId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Local ordering must agree with the chain; a discrepancy means missing or stale records.
  for (const { categoryId, divisionId } of [...boards.values()].slice(0, config.reconcileLimit)) {
    const localBest = await computeBest(prisma as unknown as Prisma.TransactionClient, categoryId, divisionId);
    const stored = await prisma.leaderboard.findUnique({ where: { categoryId_divisionId: { categoryId, divisionId } } });
    if (localBest && stored && stored.bestRecordId !== 0 && localBest.id !== stored.bestRecordId) {
      mismatches.push({ categoryId, divisionId, localBest: localBest.id, storedBest: stored.bestRecordId, kind: "local_order" });
    }
  }

  return { checked, ok: mismatches.length === 0, mismatches };
}

export async function syncOnce() {
  const config = indexerConfig();
  const client = monadClient(config);
  const currentBlock = await client.getBlockNumber();
  const targetBlock = currentBlock > config.confirmations ? currentBlock - config.confirmations : 0n;
  const stateId = "runproof-primary";
  let state = await prisma.syncState.findUnique({ where: { id: stateId } });
  if (state?.lastBlockHash) {
    const cursorBlock = await client.getBlock({ blockNumber: state.lastBlock });
    if (!cursorBlock.hash || cursorBlock.hash !== state.lastBlockHash) {
      throw new ChainReorgError(`Indexed cursor block ${state.lastBlock} is no longer canonical; reset or reconcile the index before retrying`);
    }
  }
  let fromBlock = state ? state.lastBlock + 1n : config.startBlock;
  let processed = 0;
  // Public Monad RPC caps eth_getLogs ranges; shrink the window instead of failing the loop.
  let batchSize = config.batchSize;
  const minBatchSize = 10n;
  const boards = new Map<string, { categoryId: number; divisionId: number }>();

  while (fromBlock <= targetBlock) {
    const windowEnd = (size: bigint) => (fromBlock + size - 1n > targetBlock ? targetBlock : fromBlock + size - 1n);
    const fetchWindow = async (to: bigint) =>
      client.getLogs({ address: config.addresses, events: indexedEvents, fromBlock, toBlock: to, strict: true });
    let toBlock = windowEnd(batchSize);
    let rawLogs: Awaited<ReturnType<typeof fetchWindow>> = [];
    for (;;) {
      try {
        rawLogs = await fetchWindow(toBlock);
        break;
      } catch (error) {
        if (batchSize <= minBatchSize) throw error;
        batchSize = batchSize / 2n;
        toBlock = windowEnd(batchSize);
        console.warn(JSON.stringify({
          level: "warn", action: "reduce_batch_size", batchSize: batchSize.toString(), fromBlock: fromBlock.toString(),
          message: error instanceof Error ? error.message.split("\n")[0] : String(error),
        }));
      }
    }

    const logs = rawLogs
      .filter((log) => log.eventName && log.transactionHash && log.blockNumber !== null && log.blockHash)
      .map((log) => ({
        ...log, eventName: log.eventName!, args: (log.args ?? {}) as Record<string, unknown>, transactionHash: log.transactionHash!,
        blockNumber: log.blockNumber!, blockHash: log.blockHash!, source: sourceForAddress(config, log.address),
      })) as IndexerLog[];
    const timestamps = new Map<string, Date>();

    for (const log of logs.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1))) {
      const blockKey = log.blockNumber.toString();
      if (!timestamps.has(blockKey)) {
        const block = await client.getBlock({ blockNumber: log.blockNumber });
        timestamps.set(blockKey, new Date(Number(block.timestamp) * 1000));
      }
      await prisma.$transaction(async (tx) => {
        const existing = await tx.chainEventLog.findUnique({
          where: { chainId_transactionHash_logIndex: { chainId: config.chainId, transactionHash: log.transactionHash, logIndex: log.logIndex } },
        });
        if (existing) {
          if (existing.blockHash !== log.blockHash || existing.eventName !== log.eventName) {
            throw new ChainReorgError(`Chain reorganization detected at ${log.transactionHash}:${log.logIndex}; manual reconciliation required`);
          }
          return;
        }
        await applyEvent(tx, log, timestamps.get(blockKey)!);
        await tx.chainEventLog.create({
          data: {
            chainId: config.chainId, contractAddress: log.address.toLowerCase(), source: log.source, eventName: log.eventName,
            transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber, blockHash: log.blockHash,
            payload: eventPayload(log),
          },
        });
      }, { timeout: 30_000 });
      processed += 1;
    }

    for (const [key, board] of await reconcileBlocks(client, config, logs)) boards.set(key, board);

    const cursorBlock = await client.getBlock({ blockNumber: toBlock });
    if (!cursorBlock.hash) throw new ChainReorgError(`Block ${toBlock} has no canonical hash`);
    await prisma.syncState.upsert({
      where: { id: stateId },
      update: { lastBlock: toBlock, lastBlockHash: cursorBlock.hash, chainId: config.chainId, contractAddress: config.addresses.map((value) => value.toLowerCase()).join(",") },
      create: {
        id: stateId, chainId: config.chainId, contractAddress: config.addresses.map((value) => value.toLowerCase()).join(","),
        lastBlock: toBlock, lastBlockHash: cursorBlock.hash,
      },
    });
    state = { id: stateId, chainId: config.chainId, contractAddress: config.addresses.map((value) => value.toLowerCase()).join(","), lastBlock: toBlock, lastBlockHash: cursorBlock.hash, updatedAt: new Date() };
    fromBlock = state.lastBlock + 1n;
  }

  // Boards the batch touched; when nothing was processed still reconcile the known ones.
  if (boards.size === 0) {
    for (const board of await prisma.leaderboard.findMany({ take: config.reconcileLimit })) {
      boards.set(`${board.categoryId}:${board.divisionId}`, { categoryId: board.categoryId, divisionId: board.divisionId });
    }
  }
  const reconcile = await reconcileBoards(client, config, boards);
  const indexedBlock = state?.lastBlock ?? config.startBlock;
  const lagBlocks = currentBlock > indexedBlock ? currentBlock - indexedBlock : 0n;
  await prisma.reconcileRun.create({
    data: {
      chainHead: currentBlock, indexedBlock, lagBlocks, checkedBoards: reconcile.checked,
      mismatches: reconcile.mismatches as unknown as Prisma.InputJsonValue, ok: reconcile.ok,
    },
  });

  return {
    processed, syncedThrough: indexedBlock.toString(), chainHead: currentBlock.toString(), lagBlocks: lagBlocks.toString(),
    boardsChecked: reconcile.checked, boardsOk: reconcile.ok,
  };
}
