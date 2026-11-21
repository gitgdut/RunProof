/**
 * Validates the generated ABI against the live V2 deployment: decodes getRecord,
 * getCategory, getReason, rounds, votes, params, bestRecordId and requiredPayment
 * with the JSON artifacts that the backend actually imports.
 *
 *   pnpm abi:check
 */
import { createPublicClient, formatEther, http } from "viem";
import coreAbi from "../abi/RunProofCore.json";
import categoryAbi from "../abi/CategoryRegistry.json";
import reasonAbi from "../abi/ChallengeReasonRegistry.json";

const ADDRESSES = {
  core: (process.env.RUNPROOF_CORE_ADDRESS ?? "0x1eb96bf618151adA2F7174CE9b8c41F45486084F") as `0x${string}`,
  category: (process.env.CATEGORY_REGISTRY_ADDRESS ?? "0x8D3aEdd92fA2151F61877D0e844a556E4eAB91A7") as `0x${string}`,
  reason: (process.env.CHALLENGE_REASON_REGISTRY_ADDRESS ?? "0x522d2883FA6ac437F414874B9B7cEEAfAE4caC0b") as `0x${string}`,
};

const client = createPublicClient({ transport: http(process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz", { timeout: 30_000, retryCount: 0 }) });

const show = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)));

async function main() {
  let failures = 0;
  const check = async (label: string, run: () => Promise<unknown>) => {
    try {
      console.log(`OK   ${label}\n     ${JSON.stringify(show(await run()))}`);
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${label}: ${error instanceof Error ? error.message.split("\n")[0].slice(0, 140) : String(error)}`);
    }
  };

  await check("bestRecordId(4,1)", () => client.readContract({ address: ADDRESSES.core, abi: coreAbi, functionName: "bestRecordId", args: [4n, 1n] }));
  await check("getRecord(1)", () => client.readContract({ address: ADDRESSES.core, abi: coreAbi, functionName: "getRecord", args: [1n] }));
  await check("getChallenge(1)", () => client.readContract({ address: ADDRESSES.core, abi: coreAbi, functionName: "getChallenge", args: [1n] }));
  await check("rounds(1,0)", () => client.readContract({ address: ADDRESSES.core, abi: coreAbi, functionName: "rounds", args: [1n, 0] }));
  await check("votes(1,0,player)", () => client.readContract({ address: ADDRESSES.core, abi: coreAbi, functionName: "votes", args: [1n, 0, "0xc338e05fD4F8322E1562DB052c42995223254B97"] }));
  await check("recordSummary(1)", () => client.readContract({ address: ADDRESSES.core, abi: coreAbi, functionName: "recordSummary", args: [1n] }));
  await check("recordCount()", () => client.readContract({ address: ADDRESSES.core, abi: coreAbi, functionName: "recordCount" }));
  await check("challengeCount()", () => client.readContract({ address: ADDRESSES.core, abi: coreAbi, functionName: "challengeCount" }));
  await check("params()", async () => {
    const params = await client.readContract({ address: ADDRESSES.core, abi: coreAbi, functionName: "params" }) as unknown as readonly bigint[];
    // viem returns a plain (named-less) array for a list of scalar outputs.
    const at = (index: number) => BigInt(params[index]);
    return {
      submissionFee: `${at(0)} (${formatEther(at(0))} MON)`,
      challengeBond: `${at(1)} (${formatEther(at(1))} MON)`,
      minVoters: Number(at(8)),
      challengeWindow: Number(at(9)),
      commitPeriod: Number(at(10)),
      revealPeriod: Number(at(11)),
      extensionPeriod: Number(at(12)),
      approvalBps: Number(at(13)),
      wrongSlashBps: Number(at(15)),
      quorumPower: at(6),
    };
  });
  await check("requiredPayment(4,1,1152345)", async () => {
    const payment = await client.readContract({ address: ADDRESSES.core, abi: coreAbi, functionName: "requiredPayment", args: [4n, 1n, 1152345n] }) as unknown as bigint;
    return { wei: payment, eth: formatEther(payment) };
  });
  await check("requiredStake(4,1,1152345)", () => client.readContract({ address: ADDRESSES.core, abi: coreAbi, functionName: "requiredStake", args: [4n, 1n, 1152345n] }));
  await check("claimable(player)", async () => {
    const amount = await client.readContract({ address: ADDRESSES.core, abi: coreAbi, functionName: "claimable", args: ["0xc338e05fD4F8322E1562DB052c42995223254B97"] }) as unknown as bigint;
    return { wei: amount, eth: formatEther(amount) };
  });
  await check("getCategory(1)", () => client.readContract({ address: ADDRESSES.category, abi: categoryAbi, functionName: "getCategory", args: [1n] }));
  await check("getCategory(4)", () => client.readContract({ address: ADDRESSES.category, abi: categoryAbi, functionName: "getCategory", args: [4n] }));
  await check("categoryCount()", () => client.readContract({ address: ADDRESSES.category, abi: categoryAbi, functionName: "categoryCount" }));
  await check("divisionCount(4)", () => client.readContract({ address: ADDRESSES.category, abi: categoryAbi, functionName: "divisionCount", args: [4n] }));
  await check("isDivisionActive(4,1)", () => client.readContract({ address: ADDRESSES.category, abi: categoryAbi, functionName: "isDivisionActive", args: [4n, 1n] }));
  await check("getReason(1)", () => client.readContract({ address: ADDRESSES.reason, abi: reasonAbi, functionName: "getReason", args: [1n] }));
  await check("reasonCount()", () => client.readContract({ address: ADDRESSES.reason, abi: reasonAbi, functionName: "reasonCount" }));

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.log("FAIL", error instanceof Error ? error.message.slice(0, 300) : String(error));
  process.exitCode = 1;
});
