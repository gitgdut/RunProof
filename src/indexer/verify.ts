import { prisma } from "../lib/db";
import { runProofAbi } from "./abi";
import { indexerConfig } from "./config";
import { monadClient } from "./sync";

async function verifyRecentEvents() {
  const config = indexerConfig();
  const client = monadClient(config);
  const state = await prisma.syncState.findUnique({ where: { id: "runproof-primary" } });
  if (!state) throw new Error("No sync cursor found; run the indexer first");
  const lookback = BigInt(Number(process.env.INDEXER_VERIFY_LOOKBACK ?? 1000));
  const fromBlock = state.lastBlock > lookback ? state.lastBlock - lookback : 0n;
  const logs = await client.getLogs({ address: config.address, events: runProofAbi, fromBlock, toBlock: state.lastBlock, strict: true });
  const mismatches: string[] = [];
  for (const log of logs) {
    if (!log.transactionHash || log.logIndex === null || !log.blockHash || !log.eventName) continue;
    const stored = await prisma.chainEventLog.findUnique({ where: { chainId_transactionHash_logIndex: { chainId: config.chainId, transactionHash: log.transactionHash, logIndex: log.logIndex } } });
    if (!stored || stored.blockHash !== log.blockHash || stored.eventName !== log.eventName) mismatches.push(`${log.transactionHash}:${log.logIndex}`);
  }
  const result = { chainEvents: logs.length, checked: logs.length - mismatches.length, mismatches };
  console.log(JSON.stringify(result, null, 2));
  if (mismatches.length) throw new Error("Chain/database event verification failed");
}

verifyRecentEvents().finally(() => prisma.$disconnect());
