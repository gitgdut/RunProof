/**
 * RPC + ABI probe: does not touch the database.
 *
 * Scans a block window with the same events/addresses the indexer uses and prints
 * how many logs decode per event, plus one decoded sample per event. Use it to
 * confirm the RPC honours eth_getLogs for the configured range and to eyeball the
 * real argument names before trusting the handlers.
 *
 *   pnpm indexer:probe            # last 3000 blocks in 100-block windows
 *   PROBE_BLOCKS=10000 pnpm indexer:probe
 *   PROBE_FROM_BLOCK=81509823 PROBE_BLOCKS=200 pnpm indexer:probe
 */
import { createPublicClient, getAddress, http } from "viem";
import { indexedEvents } from "../src/indexer/abi";

const rpcUrl = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const client = createPublicClient({ transport: http(rpcUrl, { timeout: 25_000, retryCount: 2 }) });

const addresses = [
  process.env.RUNPROOF_CORE_ADDRESS ?? "0x1eb96bf618151adA2F7174CE9b8c41F45486084F",
  process.env.CATEGORY_REGISTRY_ADDRESS ?? "0x8D3aEdd92fA2151F61877D0e844a556E4eAB91A7",
  process.env.CHALLENGE_REASON_REGISTRY_ADDRESS ?? "0x522d2883FA6ac437F414874B9B7cEEAfAE4caC0b",
  process.env.RECORD_NFT_ADDRESS ?? "0x967D0B53cb05BC9D6c85BEB087444e6f5a3e1360",
].map((value) => getAddress(value));

const safe = (value: unknown) => {
  try {
    return JSON.parse(JSON.stringify(value ?? null, (_key, item) => (typeof item === "bigint" ? item.toString() : item)));
  } catch {
    return null;
  }
};

const windowSize = BigInt(process.env.PROBE_WINDOW ?? 100);
const span = BigInt(process.env.PROBE_BLOCKS ?? 3000);

async function main() {
  const head = await client.getBlockNumber();
  const fromBlock = process.env.PROBE_FROM_BLOCK ? BigInt(process.env.PROBE_FROM_BLOCK) : head > span ? head - span : 0n;
  console.log(JSON.stringify({ rpcUrl, head: head.toString(), fromBlock: fromBlock.toString(), windowSize: windowSize.toString() }));

  const counts = new Map<string, number>();
  const samples = new Map<string, unknown>();
  let fetched = 0;

  for (let start = fromBlock; start <= head; start += windowSize) {
    const end = start + windowSize - 1n > head ? head : start + windowSize - 1n;
    const logs = await client.getLogs({ address: addresses, events: indexedEvents, fromBlock: start, toBlock: end, strict: true });
    fetched += logs.length;
    for (const log of logs) {
      const name = String(log.eventName);
      counts.set(name, (counts.get(name) ?? 0) + 1);
      if (!samples.has(name)) {
        samples.set(name, safe(log.args));
      }
    }
  }

  console.log(JSON.stringify({ decodedLogs: fetched, counts: Object.fromEntries([...counts].sort()) }, null, 2));
  for (const [name, args] of [...samples].sort()) console.log(name, JSON.stringify(args));
}

main().catch((error) => {
  console.log("FAIL", error instanceof Error ? error.message.split("\n")[0] : String(error));
  process.exitCode = 1;
});
