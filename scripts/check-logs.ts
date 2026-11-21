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
 *   PROBE_FROM_BLOCK=81498746 PROBE_BLOCKS=200 pnpm indexer:probe
 */
import { createPublicClient, getAddress, http } from "viem";
import { indexedEvents } from "../src/indexer/abi";

const rpcUrl = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const client = createPublicClient({ transport: http(rpcUrl, { timeout: 25_000, retryCount: 0 }) });

const addresses = [
  process.env.RUNPROOF_CORE_ADDRESS ?? "0x606717FC7055B81C4290b34F9cA1E8123416b0Ab",
  process.env.CHEAT_REGISTRY_ADDRESS ?? "0xc0df0A2342557D42D35F34913EDB28E0792Ff400",
  process.env.GAME_REGISTRY_ADDRESS ?? "0x9906867e359F1C7d609f89f39beD4b15023601B0",
  process.env.RECORD_NFT_ADDRESS ?? "0x2bFb2e522e51A458b6317343ea6Ef8A5E454c6EE",
].map((value) => getAddress(value));

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
        samples.set(name, JSON.parse(JSON.stringify(log.args, (_key, value) => (typeof value === "bigint" ? value.toString() : value))));
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
