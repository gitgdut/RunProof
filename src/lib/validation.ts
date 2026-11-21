import { getAddress, isAddress } from "viem";
import { z } from "zod";

export const addressSchema = z.string().refine(isAddress, "Invalid EVM address").transform((value) => getAddress(value).toLowerCase());
export const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hex hash").transform((value) => value.toLowerCase());
const uintStringSchema = z.string().regex(/^\d+$/, "Expected an unsigned integer string");
const positiveUintStringSchema = uintStringSchema.refine((value) => BigInt(value) > 0n, "Value must be greater than zero");
const chainIdSchema = z.coerce.number().int().min(0).max(2_147_483_647);
const positiveIdSchema = z.coerce.number().int().positive().max(2_147_483_647);
const evidenceUriSchema = z.string().max(2048).refine((value) => /^(https?|ipfs):\/\//i.test(value), "Only http, https and ipfs URIs are allowed");

export const offset = z.coerce.number().int().min(0).max(100_000).default(0);
export const limit = z.coerce.number().int().min(1).max(100).default(20);
export const paginationSchema = z.object({ offset, limit });

/** Status filters accept either the chain number or the canonical name (`Verified`). */
const statusParam = z.string().max(32).optional();

export const listRecordsSchema = z.object({
  categoryId: positiveIdSchema.optional(),
  divisionId: positiveIdSchema.optional(),
  status: statusParam,
  player: addressSchema.optional(),
  offset,
  limit,
});

export const leaderboardSchema = z.object({
  categoryId: positiveIdSchema,
  divisionId: positiveIdSchema,
  offset,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listChallengesSchema = z.object({
  recordId: positiveIdSchema.optional(),
  reasonId: positiveIdSchema.optional(),
  challenger: addressSchema.optional(),
  status: statusParam,
  offset,
  limit,
});

export const listVotingSchema = z.object({ status: statusParam, offset, limit });
export const listReasonsSchema = z.object({ offset, limit });
export const listNftsSchema = z.object({
  ownerAddress: addressSchema.optional(),
  status: statusParam,
  offset,
  limit,
});

export const addressParamSchema = z.object({ address: addressSchema });
export const idParamSchema = z.object({ id: positiveIdSchema });

/** Body of POST /api/records: the backend only turns this into an unsigned transaction. */
export const submissionPlanSchema = z.object({
  categoryId: positiveIdSchema,
  divisionId: positiveIdSchema,
  value: positiveUintStringSchema,
  evidenceHash: hashSchema,
  evidenceURI: evidenceUriSchema,
}).strict();

export const claimableQuerySchema = z.object({ address: addressSchema });

export type SubmissionPlanInput = z.infer<typeof submissionPlanSchema>;
export type RecordListQuery = z.infer<typeof listRecordsSchema>;
