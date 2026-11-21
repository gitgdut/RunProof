import { getAddress, isAddress } from "viem";

function integer(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

export function indexerConfig() {
  const rpcUrl = process.env.MONAD_RPC_URL;
  const address = process.env.RUNPROOF_CONTRACT_ADDRESS;
  if (!rpcUrl) throw new Error("MONAD_RPC_URL is required");
  if (!address || !isAddress(address)) throw new Error("RUNPROOF_CONTRACT_ADDRESS must be a deployed contract address");
  return {
    rpcUrl,
    chainId: integer("MONAD_CHAIN_ID", 10143),
    address: getAddress(address),
    startBlock: BigInt(integer("INDEXER_START_BLOCK", 0)),
    batchSize: BigInt(integer("INDEXER_BATCH_SIZE", 500) || 500),
    confirmations: BigInt(integer("INDEXER_CONFIRMATIONS", 2)),
    pollIntervalMs: integer("INDEXER_POLL_INTERVAL_MS", 5000) || 5000,
  };
}
