import type { PublicClient } from "viem";
import { cheatRegistryAbi, coreAbi } from "./abi";
import type { indexerConfig } from "./config";

type Config = ReturnType<typeof indexerConfig>;

export type ChainRecord = {
  player: string;
  gameId: number;
  gameMode: number;
  score: bigint;
  evidenceHash: string;
  evidenceURI: string;
  stake: bigint;
  submittedAt: bigint;
  deadline: bigint;
  gameVersion: number;
  ruleVersion: number;
  status: number;
  stakeSettled: boolean;
  activeChallenges: number;
};

export type ChainChallenge = {
  recordId: number;
  cheatId: number;
  challenger: string;
  bond: bigint;
  reserved: bigint;
  evidenceHash: string;
  evidenceURI: string;
  createdAt: bigint;
  status: number;
  round: number;
  special: boolean;
  extended: boolean;
  evidenceCount: number;
};

export type ChainRound = {
  commitEnd: bigint;
  revealEnd: bigint;
  confirmPower: bigint;
  denyPower: bigint;
  confirmStake: bigint;
  denyStake: bigint;
  committedStake: bigint;
  committedVoters: number;
  revealedVoters: number;
  finalized: boolean;
  winner: number;
  winnerPower: bigint;
  rewardPool: bigint;
  slashBps: number;
};

export type ChainVote = {
  commitment: string;
  stake: bigint;
  choice: number;
  revealed: boolean;
  claimed: boolean;
};

export async function readRecord(client: PublicClient, config: Config, recordId: number) {
  const value = await client.readContract({ address: config.contracts.core, abi: coreAbi, functionName: "getRecord", args: [BigInt(recordId)] }) as readonly unknown[];
  return {
    player: String(value[0]), gameId: Number(value[1]), gameMode: Number(value[2]), score: BigInt(String(value[3])),
    evidenceHash: String(value[4]), evidenceURI: String(value[5]), stake: BigInt(String(value[6])),
    submittedAt: BigInt(String(value[7])), deadline: BigInt(String(value[8])), gameVersion: Number(value[9]),
    ruleVersion: Number(value[10]), status: Number(value[11]), stakeSettled: Boolean(value[12]), activeChallenges: Number(value[13]),
  } satisfies ChainRecord;
}

export async function readChallenge(client: PublicClient, config: Config, challengeId: number) {
  const value = await client.readContract({ address: config.contracts.core, abi: coreAbi, functionName: "getChallenge", args: [BigInt(challengeId)] }) as readonly unknown[];
  return {
    recordId: Number(value[0]), cheatId: Number(value[1]), challenger: String(value[2]), bond: BigInt(String(value[3])),
    reserved: BigInt(String(value[4])), evidenceHash: String(value[5]), evidenceURI: String(value[6]),
    createdAt: BigInt(String(value[7])), status: Number(value[8]), round: Number(value[9]), special: Boolean(value[10]),
    extended: Boolean(value[11]), evidenceCount: Number(value[12]),
  } satisfies ChainChallenge;
}

export async function readRound(client: PublicClient, config: Config, challengeId: number, round: number) {
  const value = await client.readContract({ address: config.contracts.core, abi: coreAbi, functionName: "rounds", args: [BigInt(challengeId), round] }) as readonly unknown[];
  return {
    commitEnd: BigInt(String(value[0])), revealEnd: BigInt(String(value[1])), confirmPower: BigInt(String(value[2])),
    denyPower: BigInt(String(value[3])), confirmStake: BigInt(String(value[4])), denyStake: BigInt(String(value[5])),
    committedStake: BigInt(String(value[6])), committedVoters: Number(value[7]), revealedVoters: Number(value[8]),
    finalized: Boolean(value[9]), winner: Number(value[10]), winnerPower: BigInt(String(value[11])),
    rewardPool: BigInt(String(value[12])), slashBps: Number(value[13]),
  } satisfies ChainRound;
}

export async function readVote(client: PublicClient, config: Config, challengeId: number, round: number, voter: string) {
  const value = await client.readContract({ address: config.contracts.core, abi: coreAbi, functionName: "votes", args: [BigInt(challengeId), round, voter as `0x${string}`] }) as readonly unknown[];
  return { commitment: String(value[0]), stake: BigInt(String(value[1])), choice: Number(value[2]), revealed: Boolean(value[3]), claimed: Boolean(value[4]) } satisfies ChainVote;
}

export async function readCheat(client: PublicClient, config: Config, cheatId: number) {
  const value = await client.readContract({ address: config.contracts.cheatRegistry, abi: cheatRegistryAbi, functionName: "getCheat", args: [BigInt(cheatId)] }) as readonly unknown[];
  return { code: String(value[0]), name: String(value[1]), evidenceURI: String(value[2]), discoverer: String(value[3]), createdAt: BigInt(String(value[4])), active: Boolean(value[5]) };
}

export async function readClaimable(client: PublicClient, config: Config, account: string) {
  const [core, cheatRegistry] = await Promise.all([
    client.readContract({ address: config.contracts.core, abi: coreAbi, functionName: "claimable", args: [account as `0x${string}`] }) as Promise<bigint>,
    client.readContract({ address: config.contracts.cheatRegistry, abi: cheatRegistryAbi, functionName: "claimable", args: [account as `0x${string}`] }) as Promise<bigint>,
  ]);
  return { core, cheatRegistry };
}
