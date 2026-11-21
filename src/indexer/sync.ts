import { createPublicClient, http } from "viem";
import { prisma } from "../lib/db";
import { indexedEvents } from "./abi";
import { indexerConfig, sourceForAddress } from "./config";
import { applyEvent, eventPayload, type IndexerLog } from "./handlers";
import { readChallenge, readRecord, readRound, readVote } from "./reads";

export class ChainReorgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainReorgError";
  }
}

export function monadClient(config: ReturnType<typeof indexerConfig>) {
  return createPublicClient({ transport: http(config.rpcUrl, { timeout: 20_000, retryCount: 2 }) });
}

const recordStatuses = { 1: "PROVISIONAL", 2: "VERIFIED", 3: "REVOKED" } as const;
const challengeStatuses = { 1: "VOTING", 2: "EVIDENCE_VOTING", 3: "CONFIRMED", 4: "DENIED", 5: "INCONCLUSIVE" } as const;
const choices = { 1: "CONFIRM", 2: "DENY" } as const;
const date = (seconds: bigint) => new Date(Number(seconds) * 1000);

async function reconcileChainState(client: ReturnType<typeof monadClient>, config: ReturnType<typeof indexerConfig>, logs: IndexerLog[]) {
  const recordIds = new Set<number>();
  const challengeIds = new Set<number>();
  const voteKeys = new Map<string, { challengeId: number; round: number; voter: string }>();
  for (const log of logs) {
    if (log.args.recordId && Number(log.args.recordId) > 0) recordIds.add(Number(log.args.recordId));
    if (log.args.challengeId && Number(log.args.challengeId) > 0) challengeIds.add(Number(log.args.challengeId));
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
      const status = recordStatuses[record.status as keyof typeof recordStatuses];
      if (!status) continue;
      await prisma.record.update({
        where: { id: recordId },
        data: {
          playerAddress: record.player.toLowerCase(), gameId: record.gameId, gameMode: record.gameMode, score: record.score,
          stakeAmount: record.stake.toString(), evidenceHash: record.evidenceHash, evidenceURI: record.evidenceURI,
          status, submittedAt: date(record.submittedAt), challengeDeadline: date(record.deadline),
          gameVersion: record.gameVersion, ruleVersion: record.ruleVersion, stakeSettled: record.stakeSettled,
          activeChallenges: record.activeChallenges, indexedAt: new Date(),
        },
      });
      await prisma.nFT.updateMany({ where: { recordId }, data: { status: status === "VERIFIED" ? "VERIFIED" : status === "REVOKED" ? "REVOKED" : "PROVISIONAL" } });
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", action: "reconcile_record", recordId, message: error instanceof Error ? error.message : String(error) }));
    }
  }

  for (const challengeId of [...challengeIds].slice(0, config.reconcileLimit)) {
    try {
      const challenge = await readChallenge(client, config, challengeId);
      const status = challengeStatuses[challenge.status as keyof typeof challengeStatuses];
      if (!status) continue;
      await prisma.challenge.update({
        where: { id: challengeId },
        data: {
          recordId: challenge.recordId, cheatId: challenge.cheatId, challenger: challenge.challenger.toLowerCase(),
          bond: challenge.bond.toString(), reserved: challenge.reserved.toString(), evidenceHash: challenge.evidenceHash,
          evidenceURI: challenge.evidenceURI, status, round: challenge.round, special: challenge.special,
          extended: challenge.extended, evidenceCount: challenge.evidenceCount, createdAt: date(challenge.createdAt), indexedAt: new Date(),
        },
      });
      const round = await readRound(client, config, challengeId, challenge.round);
      await prisma.challengeRound.upsert({
        where: { challengeId_round: { challengeId, round: challenge.round } },
        update: {
          commitEnd: round.commitEnd > 0n ? date(round.commitEnd) : null, revealEnd: round.revealEnd > 0n ? date(round.revealEnd) : null,
          confirmPower: round.confirmPower, denyPower: round.denyPower, confirmStake: round.confirmStake.toString(),
          denyStake: round.denyStake.toString(), committedStake: round.committedStake.toString(), committedVoters: round.committedVoters,
          revealedVoters: round.revealedVoters, finalized: round.finalized, winner: choices[round.winner as keyof typeof choices] ?? null,
          winnerPower: round.winnerPower, rewardPool: round.rewardPool.toString(), slashBps: round.slashBps,
        },
        create: {
          challengeId, round: challenge.round, commitEnd: round.commitEnd > 0n ? date(round.commitEnd) : null,
          revealEnd: round.revealEnd > 0n ? date(round.revealEnd) : null, confirmPower: round.confirmPower, denyPower: round.denyPower,
          confirmStake: round.confirmStake.toString(), denyStake: round.denyStake.toString(), committedStake: round.committedStake.toString(),
          committedVoters: round.committedVoters, revealedVoters: round.revealedVoters, finalized: round.finalized,
          winner: choices[round.winner as keyof typeof choices] ?? null, winnerPower: round.winnerPower,
          rewardPool: round.rewardPool.toString(), slashBps: round.slashBps,
        },
      });
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
          commitHash: vote.commitment, stakeAmount: vote.stake.toString(), votingChoice: choices[vote.choice as keyof typeof choices] ?? null,
          revealed: vote.revealed, claimed: vote.claimed,
        },
      });
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", action: "reconcile_vote", challengeId, round, voter, message: error instanceof Error ? error.message : String(error) }));
    }
  }
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

  while (fromBlock <= targetBlock) {
    const toBlock = fromBlock + config.batchSize - 1n > targetBlock ? targetBlock : fromBlock + config.batchSize - 1n;
    const rawLogs = await client.getLogs({ address: config.addresses, events: indexedEvents, fromBlock, toBlock, strict: true });
    const logs = rawLogs
      .filter((log) => log.eventName && log.args && log.transactionHash && log.blockNumber !== null && log.blockHash)
      .map((log) => ({
        ...log, eventName: log.eventName!, args: log.args as Record<string, unknown>, transactionHash: log.transactionHash!,
        blockNumber: log.blockNumber!, blockHash: log.blockHash!, source: sourceForAddress(config, log.address),
      })) as IndexerLog[];
    const timestamps = new Map<string, Date>();

    for (const log of logs.sort((a, b) => a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1)) {
      const blockKey = log.blockNumber.toString();
      if (!timestamps.has(blockKey)) {
        const block = await client.getBlock({ blockNumber: log.blockNumber });
        timestamps.set(blockKey, new Date(Number(block.timestamp) * 1000));
      }
      await prisma.$transaction(async (tx) => {
        const existing = await tx.chainEventLog.findUnique({ where: { chainId_transactionHash_logIndex: { chainId: config.chainId, transactionHash: log.transactionHash, logIndex: log.logIndex } } });
        if (existing) {
          if (existing.blockHash !== log.blockHash || existing.eventName !== log.eventName) throw new ChainReorgError(`Chain reorganization detected at ${log.transactionHash}:${log.logIndex}; manual reconciliation required`);
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

    await reconcileChainState(client, config, logs);
    const cursorBlock = await client.getBlock({ blockNumber: toBlock });
    if (!cursorBlock.hash) throw new ChainReorgError(`Block ${toBlock} has no canonical hash`);
    await prisma.syncState.upsert({
      where: { id: stateId },
      update: { lastBlock: toBlock, lastBlockHash: cursorBlock.hash, chainId: config.chainId, contractAddress: config.addresses.map((address) => address.toLowerCase()).join(",") },
      create: { id: stateId, chainId: config.chainId, contractAddress: config.addresses.map((address) => address.toLowerCase()).join(","), lastBlock: toBlock, lastBlockHash: cursorBlock.hash },
    });
    state = { id: stateId, chainId: config.chainId, contractAddress: config.addresses.map((address) => address.toLowerCase()).join(","), lastBlock: toBlock, lastBlockHash: cursorBlock.hash, updatedAt: new Date() };
    fromBlock = state.lastBlock + 1n;
  }
  return { processed, syncedThrough: (state?.lastBlock ?? config.startBlock).toString(), chainHead: currentBlock.toString() };
}
