import { createPublicClient, http } from "viem";
import { prisma } from "../lib/db";
import { runProofAbi } from "./abi";
import { indexerConfig } from "./config";
import { applyEvent, eventPayload, type IndexerLog } from "./handlers";

export function monadClient(config: ReturnType<typeof indexerConfig>) {
  return createPublicClient({ transport: http(config.rpcUrl, { timeout: 20_000, retryCount: 2 }) });
}

export async function syncOnce() {
  const config = indexerConfig();
  const client = monadClient(config);
  const currentBlock = await client.getBlockNumber();
  const targetBlock = currentBlock > config.confirmations ? currentBlock - config.confirmations : 0n;
  const stateId = "runproof-primary";
  let state = await prisma.syncState.findUnique({ where: { id: stateId } });
  let fromBlock = state ? state.lastBlock + 1n : config.startBlock;
  let processed = 0;

  while (fromBlock <= targetBlock) {
    const toBlock = fromBlock + config.batchSize - 1n > targetBlock ? targetBlock : fromBlock + config.batchSize - 1n;
    const rawLogs = await client.getLogs({ address: config.address, events: runProofAbi, fromBlock, toBlock, strict: true });
    const logs = rawLogs.filter((log) => log.eventName && log.args && log.transactionHash && log.blockNumber !== null && log.blockHash).map((log) => ({ ...log, eventName: log.eventName!, args: log.args as Record<string, unknown>, transactionHash: log.transactionHash!, blockNumber: log.blockNumber!, blockHash: log.blockHash! })) as IndexerLog[];
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
          if (existing.blockHash !== log.blockHash || existing.eventName !== log.eventName) throw new Error(`Chain reorganization detected at ${log.transactionHash}:${log.logIndex}; manual reconciliation required`);
          return;
        }
        await applyEvent(tx, log, timestamps.get(blockKey)!);
        await tx.chainEventLog.create({ data: { chainId: config.chainId, contractAddress: config.address.toLowerCase(), eventName: log.eventName, transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber, blockHash: log.blockHash, payload: eventPayload(log) } });
      }, { timeout: 20_000 });
      processed += 1;
    }

    await prisma.syncState.upsert({
      where: { id: stateId },
      update: { lastBlock: toBlock, chainId: config.chainId, contractAddress: config.address.toLowerCase() },
      create: { id: stateId, chainId: config.chainId, contractAddress: config.address.toLowerCase(), lastBlock: toBlock },
    });
    state = { id: stateId, chainId: config.chainId, contractAddress: config.address.toLowerCase(), lastBlock: toBlock, updatedAt: new Date() };
    fromBlock = state.lastBlock + 1n;
  }
  return { processed, syncedThrough: (state?.lastBlock ?? config.startBlock).toString(), chainHead: currentBlock.toString() };
}
