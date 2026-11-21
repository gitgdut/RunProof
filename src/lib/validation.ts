import { getAddress, isAddress } from "viem";
import { z } from "zod";

export const addressSchema = z.string().refine(isAddress, "Invalid EVM address").transform((value) => getAddress(value).toLowerCase());
export const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hex hash").transform((value) => value.toLowerCase());
export const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte EIP-191 signature");
const uintStringSchema = z.string().regex(/^\d+$/, "Expected an unsigned integer string");
const positiveUintStringSchema = uintStringSchema.refine((value) => BigInt(value) > 0n, "Amount must be greater than zero");
const evidenceUriSchema = z.string().max(2048).refine((value) => /^(https?|ipfs):\/\//i.test(value), "Only http, https and ipfs URIs are allowed");
const chainIdSchema = z.number().int().positive().max(2_147_483_647);
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
export const paginationSchema = z.object({ page, limit });

export const listRecordsSchema = z.object({
  gameId: z.coerce.number().int().positive().optional(),
  gameMode: z.coerce.number().int().positive().optional(),
  status: z.enum(["PENDING", "PROVISIONAL", "VERIFIED", "REVOKED"]).optional(),
  playerAddress: addressSchema.optional(), page, limit,
});
export const leaderboardSchema = z.object({
  gameId: z.coerce.number().int().positive().default(1),
  gameMode: z.coerce.number().int().positive().default(3),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const listChallengesSchema = z.object({
  recordId: z.coerce.number().int().positive().optional(),
  cheatId: z.coerce.number().int().positive().optional(),
  challenger: addressSchema.optional(),
  status: z.enum(["PENDING", "VOTING", "EVIDENCE_VOTING", "CONFIRMED", "DENIED", "INCONCLUSIVE"]).optional(), page, limit,
});
export const listVotingSchema = z.object({
  status: z.enum(["PENDING", "VOTING", "EVIDENCE_VOTING", "CONFIRMED", "DENIED", "INCONCLUSIVE"]).optional(), page, limit,
});
export const listCheatsSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(), page, limit,
});
export const listNftsSchema = z.object({
  ownerAddress: addressSchema.optional(),
  recordId: z.coerce.number().int().positive().optional(),
  status: z.enum(["PROVISIONAL", "VERIFIED", "REVOKED"]).optional(), page, limit,
});
export const addressParamSchema = z.object({ address: addressSchema });
export const idParamSchema = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) });

const signedFields = {
  transactionHash: hashSchema,
  evidenceHash: hashSchema,
  expiresAt: z.string().datetime(),
  signature: signatureSchema,
};

export const createRecordSchema = z.object({
  recordId: chainIdSchema,
  playerAddress: addressSchema,
  gameId: chainIdSchema,
  gameMode: chainIdSchema,
  score: uintStringSchema,
  stakeAmount: positiveUintStringSchema,
  evidenceURI: evidenceUriSchema,
  challengeDeadline: z.string().datetime(),
  ...signedFields,
}).strict();

export const createChallengeSchema = z.object({
  challengeId: chainIdSchema,
  recordId: chainIdSchema,
  cheatId: chainIdSchema,
  challenger: addressSchema,
  bond: positiveUintStringSchema,
  evidenceURI: evidenceUriSchema,
  special: z.boolean().default(false),
  ...signedFields,
}).strict();

export const createCheatSchema = z.object({
  cheatId: chainIdSchema,
  cheatCode: z.string().regex(/^C[0-9]{3}$/, "Cheat code must look like C001"),
  name: z.string().min(2).max(120),
  description: z.string().min(2).max(2000).optional(),
  evidenceURI: evidenceUriSchema.optional(),
  adminAddress: addressSchema,
  expiresAt: z.string().datetime(),
  signature: signatureSchema,
}).strict();

export type CreateRecordInput = z.infer<typeof createRecordSchema>;
export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
export type CreateCheatInput = z.infer<typeof createCheatSchema>;
