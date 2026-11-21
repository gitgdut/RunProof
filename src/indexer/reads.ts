import type { PublicClient } from "viem";
import { categoryRegistryAbi, coreAbi } from "./abi";
import type { indexerConfig } from "./config";

type Config = ReturnType<typeof indexerConfig>;

/**
 * viem returns a named object for a single tuple output (getRecord/getChallenge/...) and a
 * plain array for a list of scalar outputs (rounds/votes/params). These helpers tolerate
 * both shapes so a viem upgrade cannot silently shift a field.
 */
function field(value: unknown, name: string, index: number): unknown {
  if (Array.isArray(value)) return value[index];
  const record = value as Record<string, unknown>;
  return record?.[name] ?? (record ? Object.values(record)[index] : undefined);
}

const big = (value: unknown) => BigInt(String(value ?? 0));
const num = (value: unknown) => Number(value ?? 0);
const str = (value: unknown) => String(value ?? "");
const bool = (value: unknown) => Boolean(value);

export type ChainRecord = {
  player: string;
  categoryId: number;
  divisionId: number;
  value: bigint;
  direction: number;
  evidenceHash: string;
  evidenceURI: string;
  stake: bigint;
  submittedAt: bigint;
  deadline: bigint;
  ruleVersion: number;
  status: number;
  stakeSettled: boolean;
  activeChallenges: number;
};

export type ChainChallenge = {
  recordId: number;
  reasonId: number;
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

export type ChainVote = { commitment: string; stake: bigint; choice: number; revealed: boolean; claimed: boolean };

export type ChainParams = {
  submissionFee: bigint;
  challengeBond: bigint;
  specialBondMultiplier: bigint;
  specialReward: bigint;
  minVoteStake: bigint;
  maxVoteStake: bigint;
  quorumPower: bigint;
  powerUnit: bigint;
  minVoters: number;
  challengeWindow: bigint;
  commitPeriod: bigint;
  revealPeriod: bigint;
  extensionPeriod: bigint;
  approvalBps: number;
  nearTieBps: number;
  wrongSlashBps: number;
  challengerRewardBps: number;
  voterRewardBps: number;
  playerCompBps: number;
};

export async function readRecord(client: PublicClient, config: Config, recordId: number): Promise<ChainRecord> {
  const value = await client.readContract({ address: config.contracts.core, abi: coreAbi, functionName: "getRecord", args: [BigInt(recordId)] });
  return {
    player: str(field(value, "player", 0)),
    categoryId: num(field(value, "categoryId", 1)),
    divisionId: num(field(value, "divisionId", 2)),
    value: big(field(value, "value", 3)),
    direction: num(field(value, "direction", 4)),
    evidenceHash: str(field(value, "evidenceHash", 5)),
    evidenceURI: str(field(value, "evidenceURI", 6)),
    stake: big(field(value, "stake", 7)),
    submittedAt: big(field(value, "submittedAt", 8)),
    deadline: big(field(value, "deadline", 9)),
    ruleVersion: num(field(value, "ruleVersion", 10)),
    status: num(field(value, "status", 11)),
    stakeSettled: bool(field(value, "stakeSettled", 12)),
    activeChallenges: num(field(value, "activeChallenges", 13)),
  };
}

export async function readChallenge(client: PublicClient, config: Config, challengeId: number): Promise<ChainChallenge> {
  const value = await client.readContract({ address: config.contracts.core, abi: coreAbi, functionName: "getChallenge", args: [BigInt(challengeId)] });
  return {
    recordId: num(field(value, "recordId", 0)),
    reasonId: num(field(value, "reasonId", 1)),
    challenger: str(field(value, "challenger", 2)),
    bond: big(field(value, "bond", 3)),
    reserved: big(field(value, "reserved", 4)),
    evidenceHash: str(field(value, "evidenceHash", 5)),
    evidenceURI: str(field(value, "evidenceURI", 6)),
    createdAt: big(field(value, "createdAt", 7)),
    status: num(field(value, "status", 8)),
    round: num(field(value, "round", 9)),
    special: bool(field(value, "special", 10)),
    extended: bool(field(value, "extended", 11)),
    evidenceCount: num(field(value, "evidenceCount", 12)),
  };
}

export async function readRound(client: PublicClient, config: Config, challengeId: number, round: number): Promise<ChainRound> {
  const value = await client.readContract({ address: config.contracts.core, abi: coreAbi, functionName: "rounds", args: [BigInt(challengeId), round] });
  return {
    commitEnd: big(field(value, "commitEnd", 0)),
    revealEnd: big(field(value, "revealEnd", 1)),
    confirmPower: big(field(value, "confirmPower", 2)),
    denyPower: big(field(value, "denyPower", 3)),
    confirmStake: big(field(value, "confirmStake", 4)),
    denyStake: big(field(value, "denyStake", 5)),
    committedStake: big(field(value, "committedStake", 6)),
    committedVoters: num(field(value, "committedVoters", 7)),
    revealedVoters: num(field(value, "revealedVoters", 8)),
    finalized: bool(field(value, "finalized", 9)),
    winner: num(field(value, "winner", 10)),
    winnerPower: big(field(value, "winnerPower", 11)),
    rewardPool: big(field(value, "rewardPool", 12)),
    slashBps: num(field(value, "slashBps", 13)),
  };
}

export async function readVote(client: PublicClient, config: Config, challengeId: number, round: number, voter: string): Promise<ChainVote> {
  const value = await client.readContract({
    address: config.contracts.core, abi: coreAbi, functionName: "votes", args: [BigInt(challengeId), round, voter as `0x${string}`],
  });
  return {
    commitment: str(field(value, "commitment", 0)),
    stake: big(field(value, "stake", 1)),
    choice: num(field(value, "choice", 2)),
    revealed: bool(field(value, "revealed", 3)),
    claimed: bool(field(value, "claimed", 4)),
  };
}

export async function readParams(client: PublicClient, config: { contracts: { core: `0x${string}` } }): Promise<ChainParams> {
  const value = await client.readContract({ address: config.contracts.core, abi: coreAbi, functionName: "params" });
  return {
    submissionFee: big(field(value, "submissionFee", 0)),
    challengeBond: big(field(value, "challengeBond", 1)),
    specialBondMultiplier: big(field(value, "specialBondMultiplier", 2)),
    specialReward: big(field(value, "specialReward", 3)),
    minVoteStake: big(field(value, "minVoteStake", 4)),
    maxVoteStake: big(field(value, "maxVoteStake", 5)),
    quorumPower: big(field(value, "quorumPower", 6)),
    powerUnit: big(field(value, "powerUnit", 7)),
    minVoters: num(field(value, "minVoters", 8)),
    challengeWindow: big(field(value, "challengeWindow", 9)),
    commitPeriod: big(field(value, "commitPeriod", 10)),
    revealPeriod: big(field(value, "revealPeriod", 11)),
    extensionPeriod: big(field(value, "extensionPeriod", 12)),
    approvalBps: num(field(value, "approvalBps", 13)),
    nearTieBps: num(field(value, "nearTieBps", 14)),
    wrongSlashBps: num(field(value, "wrongSlashBps", 15)),
    challengerRewardBps: num(field(value, "challengerRewardBps", 16)),
    voterRewardBps: num(field(value, "voterRewardBps", 17)),
    playerCompBps: num(field(value, "playerCompBps", 18)),
  };
}

export async function readBestRecord(client: PublicClient, config: Config, categoryId: number, divisionId: number) {
  return client.readContract({
    address: config.contracts.core, abi: coreAbi, functionName: "bestRecordId", args: [BigInt(categoryId), BigInt(divisionId)],
  }) as Promise<bigint>;
}

export type ChainCategory = {
  name: string;
  descriptionURI: string;
  unit: string;
  decimals: number;
  direction: number;
  ruleVersion: number;
  baseStake: bigint;
  active: boolean;
};

export async function readCategory(client: PublicClient, config: Config, categoryId: number): Promise<ChainCategory> {
  const value = await client.readContract({ address: config.contracts.categoryRegistry, abi: categoryRegistryAbi, functionName: "getCategory", args: [BigInt(categoryId)] });
  return {
    name: str(field(value, "name", 0)),
    descriptionURI: str(field(value, "descriptionURI", 1)),
    unit: str(field(value, "unit", 2)),
    decimals: num(field(value, "decimals", 3)),
    direction: num(field(value, "direction", 4)),
    ruleVersion: num(field(value, "ruleVersion", 5)),
    baseStake: big(field(value, "baseStake", 6)),
    active: bool(field(value, "active", 7)),
  };
}
