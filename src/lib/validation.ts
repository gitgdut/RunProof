import { getAddress, isAddress } from "viem";
import { z } from "zod";

export const addressSchema = z.string().refine(isAddress, "Invalid EVM address").transform((value) => getAddress(value).toLowerCase());
export const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hex hash").transform((value) => value.toLowerCase());
export const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte EIP-191 signature");
const amountSchema = z.string().regex(/^[0-9]+$/).refine((value) => BigInt(value) > 0n, "Amount must be greater than zero");
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
export const paginationSchema = z.object({ page, limit });

export const listRecordsSchema = z.object({
  gameId: z.string().min(1).optional(), gameMode: z.string().min(1).optional(),
  status: z.enum(["PENDING", "CHALLENGE_PERIOD", "VERIFIED", "REVOKED"]).optional(),
  playerAddress: addressSchema.optional(), page, limit,
});
export const leaderboardSchema = z.object({
  gameId: z.string().min(1).default("game_tetris"), gameMode: z.string().min(1).default("marathon"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const listChallengesSchema = z.object({
  recordId: z.string().min(1).optional(), challenger: addressSchema.optional(),
  status: z.enum(["PENDING", "VOTING", "UPHELD", "REJECTED", "CANCELLED"]).optional(), page, limit,
});
export const listVotingSchema = z.object({
  status: z.enum(["PENDING", "VOTING", "UPHELD", "REJECTED", "CANCELLED"]).optional(), page, limit,
});
export const listCheatsSchema = z.object({
  gameId: z.string().min(1).optional(), status: z.enum(["ACTIVE", "DEPRECATED"]).optional(), page, limit,
});
export const listNftsSchema = z.object({
  ownerAddress: addressSchema.optional(), recordId: z.string().min(1).optional(),
  status: z.enum(["PENDING", "MINTED", "TRANSFERRED", "REVOKED"]).optional(), page, limit,
});
export const addressParamSchema = z.object({ address: addressSchema });
export const idParamSchema = z.object({ id: z.string().min(1).max(128) });

const signedFields = {
  transactionHash: hashSchema,
  evidenceHash: hashSchema,
  expiresAt: z.string().datetime(),
  signature: signatureSchema,
};

export const createRecordSchema = z.object({
  playerAddress: addressSchema,
  gameId: z.string().min(1).max(64),
  gameMode: z.string().min(1).max(64),
  score: z.number().int().nonnegative().max(2_147_483_647),
  stakeAmount: amountSchema,
  videoUrl: z.string().url().max(2048),
  replayUrl: z.string().url().max(2048).optional(),
  ...signedFields,
}).strict();

export const createChallengeSchema = z.object({
  recordId: z.string().min(1).max(128),
  cheatId: z.string().min(1).max(128),
  challenger: addressSchema,
  ...signedFields,
}).strict();

export const createCheatSchema = z.object({
  cheatCode: z.string().regex(/^[A-Z0-9_]{2,64}$/),
  name: z.string().min(2).max(120),
  description: z.string().min(2).max(2000),
  gameId: z.string().min(1).max(64),
  adminAddress: addressSchema,
  expiresAt: z.string().datetime(),
  signature: signatureSchema,
}).strict();

export type CreateRecordInput = z.infer<typeof createRecordSchema>;
export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
export type CreateCheatInput = z.infer<typeof createCheatSchema>;
