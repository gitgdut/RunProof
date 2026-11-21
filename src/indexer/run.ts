import { prisma } from "../lib/db";
import { indexerConfig } from "./config";
import { syncOnce } from "./sync";

async function main() {
  const config = indexerConfig();
  let attempt = 0;
  while (true) {
    try {
      const result = await syncOnce();
      attempt = 0;
      console.log(JSON.stringify({ level: "info", ...result }));
      if (process.env.INDEXER_ONCE === "true") return;
    } catch (error) {
      attempt += 1;
      const delay = Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6));
      console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : String(error), retryInMs: delay }));
      if (process.env.INDEXER_ONCE === "true") throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

main().finally(() => prisma.$disconnect());
