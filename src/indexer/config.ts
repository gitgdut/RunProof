import { getAddress, isAddress, zeroAddress } from "viem";

function integer(name: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name]?.trim();
  const value = Number(raw || fallback);
  if (!/^\d+$/.test(raw || String(fallback)) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function contractAddress(name: string) {
  const value = process.env[name];
  if (!value || !isAddress(value) || getAddress(value) === zeroAddress) throw new Error(`${name} must be a deployed, non-zero contract address`);
  return getAddress(value);
}

/** Demo deployment of the V2 contracts on Monad testnet (see BACKEND-HANDOFF.md). */
export const V2_DEPLOYMENT = {
  chainId: 10143,
  startBlock: 81509823,
  core: "0x1eb96bf618151adA2F7174CE9b8c41F45486084F",
  categoryRegistry: "0x8D3aEdd92fA2151F61877D0e844a556E4eAB91A7",
  reasonRegistry: "0x522d2883FA6ac437F414874B9B7cEEAfAE4caC0b",
  recordNft: "0x967D0B53cb05BC9D6c85BEB087444e6f5a3e1360",
} as const;

export function indexerConfig() {
  const rpcUrl = process.env.MONAD_RPC_URL;
  if (!rpcUrl || !/^https?:\/\//i.test(rpcUrl)) throw new Error("MONAD_RPC_URL must be an http/https URL");
  const contracts = {
    core: contractAddress("RUNPROOF_CORE_ADDRESS"),
    categoryRegistry: contractAddress("CATEGORY_REGISTRY_ADDRESS"),
    reasonRegistry: contractAddress("CHALLENGE_REASON_REGISTRY_ADDRESS"),
    recordNft: contractAddress("RECORD_NFT_ADDRESS"),
  };
  return {
    rpcUrl,
    chainId: integer("MONAD_CHAIN_ID", V2_DEPLOYMENT.chainId, 1, 2_147_483_647),
    contracts,
    addresses: Object.values(contracts),
    startBlock: BigInt(integer("INDEXER_START_BLOCK", V2_DEPLOYMENT.startBlock, 0)),
    batchSize: BigInt(integer("INDEXER_BATCH_SIZE", 100, 1, 5000)),
    confirmations: BigInt(integer("INDEXER_CONFIRMATIONS", 5, 1, 1000)),
    pollIntervalMs: integer("INDEXER_POLL_INTERVAL_MS", 5000, 250),
    reconcileLimit: integer("INDEXER_RECONCILE_LIMIT", 50, 0, 1000),
  };
}

export function sourceForAddress(config: ReturnType<typeof indexerConfig>, address: string) {
  const normalized = getAddress(address);
  for (const [source, value] of Object.entries(config.contracts)) {
    if (getAddress(value) === normalized) return source;
  }
  return "unknown";
}
