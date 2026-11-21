import { getAddress, isAddress, zeroAddress } from "viem";

function integer(name: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name]?.trim();
  const value = Number(raw || fallback);
  if (!/^\d+$/.test(raw || String(fallback)) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function indexerConfig() {
  const rpcUrl = process.env.MONAD_RPC_URL;
  const address = process.env.RUNPROOF_CONTRACT_ADDRESS;
  if (!rpcUrl || !/^https?:\/\//i.test(rpcUrl)) throw new Error("MONAD_RPC_URL must be an http/https URL");
  if (!address || !isAddress(address) || getAddress(address) === zeroAddress) throw new Error("RUNPROOF_CONTRACT_ADDRESS must be a deployed, non-zero contract address");
  return {
    rpcUrl,
    chainId: integer("MONAD_CHAIN_ID", 10143, 1, 2_147_483_647),
    address: getAddress(address),
    startBlock: BigInt(integer("INDEXER_START_BLOCK", 0, 0)),
    batchSize: BigInt(integer("INDEXER_BATCH_SIZE", 500, 1, 5000)),
    confirmations: BigInt(integer("INDEXER_CONFIRMATIONS", 2, 0, 1000)),
    pollIntervalMs: integer("INDEXER_POLL_INTERVAL_MS", 5000, 250),
  };
}
