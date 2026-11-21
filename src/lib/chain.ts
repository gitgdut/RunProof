import { createPublicClient, encodeFunctionData, getAddress, http, isAddress } from "viem";
import { categoryRegistryAbi, coreAbi, reasonRegistryAbi } from "@/indexer/abi";
import { V2_DEPLOYMENT } from "@/indexer/config";
import { AppError } from "./api";
import { formatValue } from "./format";
import { readParams, type ChainParams } from "@/indexer/reads";

export type ChainSettings = {
  rpcUrl: string;
  chainId: number;
  core: `0x${string}`;
  categoryRegistry: `0x${string}`;
  reasonRegistry: `0x${string}`;
  recordNft: `0x${string}`;
};

function addressFrom(value: string | undefined, fallback: string, name: string): `0x${string}` {
  const candidate = value ?? fallback;
  if (!isAddress(candidate)) throw new AppError(500, "CHAIN_CONFIG_ERROR", `${name} is not a valid address`);
  return getAddress(candidate);
}

/**
 * Falls back to the documented demo deployment so a fresh clone can serve chain-backed
 * fields without configuration. Redeploying the contracts means setting these env vars;
 * see README.
 */
export function chainSettings(): ChainSettings {
  return {
    rpcUrl: process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz",
    chainId: Number(process.env.MONAD_CHAIN_ID ?? V2_DEPLOYMENT.chainId),
    core: addressFrom(process.env.RUNPROOF_CORE_ADDRESS, V2_DEPLOYMENT.core, "RUNPROOF_CORE_ADDRESS"),
    categoryRegistry: addressFrom(process.env.CATEGORY_REGISTRY_ADDRESS, V2_DEPLOYMENT.categoryRegistry, "CATEGORY_REGISTRY_ADDRESS"),
    reasonRegistry: addressFrom(process.env.CHALLENGE_REASON_REGISTRY_ADDRESS, V2_DEPLOYMENT.reasonRegistry, "CHALLENGE_REASON_REGISTRY_ADDRESS"),
    recordNft: addressFrom(process.env.RECORD_NFT_ADDRESS, V2_DEPLOYMENT.recordNft, "RECORD_NFT_ADDRESS"),
  };
}

function client(settings: ChainSettings) {
  return createPublicClient({ transport: http(settings.rpcUrl, { timeout: 15_000, retryCount: 1 }) });
}

async function readOrFail<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "CHAIN_READ_FAILED", `Failed to read ${label} from Monad: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
}

/**
 * Withdrawable balances live in two contracts (core payouts, reason-registry discoverer
 * rewards). Both are read live: withdrawals change them without a guaranteed synced event.
 */
export async function getClaimable(walletAddress: string) {
  const settings = chainSettings();
  const account = getAddress(walletAddress);
  const publicClient = client(settings);

  const coreClaimable = await readOrFail("claimable", () => publicClient.readContract({
    address: settings.core, abi: coreAbi, functionName: "claimable", args: [account],
  }) as Promise<bigint>);

  let reasonRegistryClaimable = 0n;
  try {
    reasonRegistryClaimable = await publicClient.readContract({
      address: settings.reasonRegistry, abi: reasonRegistryAbi, functionName: "claimable", args: [account],
    }) as bigint;
  } catch {
    // Not every deployment exposes claimable on the registry; treat as zero rather than failing.
    reasonRegistryClaimable = 0n;
  }

  return {
    walletAddress: account.toLowerCase(),
    chainId: settings.chainId,
    coreClaimable: coreClaimable.toString(),
    reasonRegistryClaimable: reasonRegistryClaimable.toString(),
    totalClaimable: (coreClaimable + reasonRegistryClaimable).toString(),
  };
}

let paramsCache: { value: ChainParams; expiresAt: number } | null = null;

/** Protocol parameters change rarely and are read on every voting request. */
export async function getChainParams(): Promise<ChainParams> {
  if (paramsCache && paramsCache.expiresAt > Date.now()) return paramsCache.value;
  const settings = chainSettings();
  const value = await readOrFail("params", () => readParams(client(settings), { contracts: { core: settings.core } }));
  paramsCache = { value, expiresAt: Date.now() + 60_000 };
  return value;
}

export type SubmissionPlan = {
  categoryId: number;
  divisionId: number;
  value: string;
  evidenceHash: string;
  evidenceURI: string;
};

/**
 * Builds the unsigned `submitRecord` call. The backend never signs or sends it: the player's
 * wallet does. Payment is always read from the contract, never hard-coded on the client.
 */
export async function prepareSubmission(input: SubmissionPlan) {
  const settings = chainSettings();
  const publicClient = client(settings);
  const { categoryId, divisionId, value, evidenceHash, evidenceURI } = input;

  const category = await readOrFail("getCategory", () => publicClient.readContract({
    address: settings.categoryRegistry, abi: categoryRegistryAbi, functionName: "getCategory", args: [BigInt(categoryId)],
  }) as Promise<{
    name: string; descriptionURI: string; unit: string; decimals: number; direction: number; ruleVersion: number; baseStake: bigint; active: boolean;
  }>);

  if (!category?.active) throw new AppError(400, "CATEGORY_INACTIVE", "Category is not active");

  const divisionActive = await readOrFail("isDivisionActive", () => publicClient.readContract({
    address: settings.categoryRegistry, abi: categoryRegistryAbi, functionName: "isDivisionActive", args: [BigInt(categoryId), BigInt(divisionId)],
  }) as Promise<boolean>);
  if (!divisionActive) throw new AppError(400, "DIVISION_INACTIVE", "Division is not active");

  const [payment, stake] = await Promise.all([
    readOrFail("requiredPayment", () => publicClient.readContract({
      address: settings.core, abi: coreAbi, functionName: "requiredPayment", args: [BigInt(categoryId), BigInt(divisionId), BigInt(value)],
    }) as Promise<bigint>),
    readOrFail("requiredStake", () => publicClient.readContract({
      address: settings.core, abi: coreAbi, functionName: "requiredStake", args: [BigInt(categoryId), BigInt(divisionId), BigInt(value)],
    }) as Promise<bigint>),
  ]);

  const args = [BigInt(categoryId), BigInt(divisionId), BigInt(value), evidenceHash as `0x${string}`, evidenceURI] as const;
  const data = encodeFunctionData({ abi: coreAbi, functionName: "submitRecord", args });

  return {
    chainId: settings.chainId,
    to: settings.core,
    functionName: "submitRecord",
    args: args.map((item) => item.toString()),
    data,
    value: payment.toString(),
    requiredStake: stake.toString(),
    submissionFee: (payment - stake).toString(),
    category: {
      categoryId, divisionId, name: category.name, unit: category.unit, decimals: category.decimals,
      direction: category.direction, ruleVersion: category.ruleVersion, baseStake: category.baseStake.toString(),
    },
    displayValue: formatValue(value, category.unit, category.decimals),
  };
}

/** Best-effort chain head for /api/health; never throws. */
export async function getChainHead(): Promise<{ chainId: number; head: string } | null> {
  try {
    const settings = chainSettings();
    const head = await client(settings).getBlockNumber();
    return { chainId: settings.chainId, head: head.toString() };
  } catch {
    return null;
  }
}
