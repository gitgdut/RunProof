import { verifyMessage } from "viem";
import { AppError } from "./api";
import { readIntegerEnv } from "./config";
import type { CreateChallengeInput, CreateCheatInput, CreateRecordInput } from "./validation";

function chainId() {
  const value = Number(process.env.MONAD_CHAIN_ID ?? 10143);
  if (!Number.isSafeInteger(value) || value <= 0) throw new AppError(500, "CHAIN_CONFIG_ERROR", "MONAD_CHAIN_ID is invalid");
  return value;
}

function verifyExpiry(expiresAt: string) {
  const expires = Date.parse(expiresAt);
  const maxAge = readIntegerEnv("AUTH_MAX_SIGNATURE_AGE_SECONDS", 300, 30, 3600) * 1000;
  const now = Date.now();
  if (expires <= now) throw new AppError(401, "SIGNATURE_EXPIRED", "The signed request has expired");
  if (expires - now > maxAge) throw new AppError(400, "SIGNATURE_WINDOW_TOO_LONG", `expiresAt must be within ${maxAge / 1000} seconds`);
}

export function recordMessage(input: Omit<CreateRecordInput, "signature">) {
  return [
    "RunProof: Index submitted record v2",
    `Chain ID: ${chainId()}`,
    `Record ID: ${input.recordId}`,
    `Player: ${input.playerAddress}`,
    `Game ID: ${input.gameId}`,
    `Mode ID: ${input.gameMode}`,
    `Score: ${input.score}`,
    `Stake (wei): ${input.stakeAmount}`,
    `Evidence hash: ${input.evidenceHash}`,
    `Evidence URI: ${input.evidenceURI}`,
    `Deadline: ${input.challengeDeadline}`,
    `Transaction: ${input.transactionHash}`,
    `Expires: ${input.expiresAt}`,
  ].join("\n");
}

export function challengeMessage(input: Omit<CreateChallengeInput, "signature">) {
  return [
    "RunProof: Index submitted challenge v2",
    `Chain ID: ${chainId()}`,
    `Challenge ID: ${input.challengeId}`,
    `Record ID: ${input.recordId}`,
    `Cheat ID: ${input.cheatId}`,
    `Challenger: ${input.challenger}`,
    `Bond (wei): ${input.bond}`,
    `Special: ${input.special}`,
    `Evidence hash: ${input.evidenceHash}`,
    `Evidence URI: ${input.evidenceURI}`,
    `Transaction: ${input.transactionHash}`,
    `Expires: ${input.expiresAt}`,
  ].join("\n");
}

export function cheatMessage(input: Omit<CreateCheatInput, "signature">) {
  return [
    "RunProof: Cache cheat metadata v2",
    `Chain ID: ${chainId()}`,
    `Cheat ID: ${input.cheatId}`,
    `Admin: ${input.adminAddress}`,
    `Code: ${input.cheatCode}`,
    `Name: ${input.name}`,
    `Description: ${input.description ?? ""}`,
    `Evidence URI: ${input.evidenceURI ?? ""}`,
    `Expires: ${input.expiresAt}`,
  ].join("\n");
}

async function verify(address: string, message: string, signature: string) {
  const valid = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
  if (!valid) throw new AppError(401, "INVALID_SIGNATURE", "Wallet signature verification failed");
}

export async function verifyRecordSignature(input: CreateRecordInput) {
  const { signature, ...unsigned } = input;
  verifyExpiry(input.expiresAt);
  await verify(input.playerAddress, recordMessage(unsigned), signature);
}

export async function verifyChallengeSignature(input: CreateChallengeInput) {
  const { signature, ...unsigned } = input;
  verifyExpiry(input.expiresAt);
  await verify(input.challenger, challengeMessage(unsigned), signature);
}

export async function verifyCheatSignature(input: CreateCheatInput) {
  const admins = (process.env.CHEAT_REGISTRY_ADMIN_ADDRESSES ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!admins.includes(input.adminAddress)) throw new AppError(403, "NOT_REGISTRY_ADMIN", "Wallet is not authorized to manage cheat metadata");
  const { signature, ...unsigned } = input;
  verifyExpiry(input.expiresAt);
  await verify(input.adminAddress, cheatMessage(unsigned), signature);
}
