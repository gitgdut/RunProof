import { createPublicClient, getAddress, http, isAddress } from "viem";
import { cheatRegistryAbi, coreAbi } from "@/indexer/abi";
import { AppError } from "./api";

function addressEnv(name: string) {
  const value = process.env[name];
  if (!value || !isAddress(value)) throw new AppError(503, "CHAIN_NOT_CONFIGURED", `${name} is not configured`);
  return getAddress(value);
}

export async function getClaimable(walletAddress: string) {
  const rpcUrl = process.env.MONAD_RPC_URL;
  if (!rpcUrl) throw new AppError(503, "CHAIN_NOT_CONFIGURED", "MONAD_RPC_URL is not configured");
  const core = addressEnv("RUNPROOF_CORE_ADDRESS");
  const cheats = addressEnv("CHEAT_REGISTRY_ADDRESS");
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15_000, retryCount: 1 }) });
  try {
    const [coreClaimable, cheatClaimable] = await Promise.all([
      client.readContract({ address: core, abi: coreAbi, functionName: "claimable", args: [walletAddress as `0x${string}`] }) as Promise<bigint>,
      client.readContract({ address: cheats, abi: cheatRegistryAbi, functionName: "claimable", args: [walletAddress as `0x${string}`] }) as Promise<bigint>,
    ]);
    return {
      walletAddress,
      chainId: Number(process.env.MONAD_CHAIN_ID ?? 10143),
      coreClaimable: coreClaimable.toString(),
      cheatRegistryClaimable: cheatClaimable.toString(),
      totalClaimable: (coreClaimable + cheatClaimable).toString(),
    };
  } catch {
    throw new AppError(502, "CHAIN_READ_FAILED", "Failed to read claimable balances from Monad");
  }
}
