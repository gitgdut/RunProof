import { beforeEach, describe, expect, it } from "vitest";
import { GET as getCategories } from "../app/api/categories/route";
import { GET as getCategory } from "../app/api/categories/[id]/route";
import { GET as getReasons } from "../app/api/reasons/route";
import { GET as getRecords, POST as postRecord } from "../app/api/records/route";
import { GET as getRecord } from "../app/api/records/[id]/route";
import { GET as getLeaderboard } from "../app/api/leaderboard/route";
import { GET as getChallenges } from "../app/api/challenges/route";
import { GET as getChallenge } from "../app/api/challenges/[id]/route";
import { GET as getVoting } from "../app/api/voting/route";
import { GET as getVotingDetail } from "../app/api/voting/[id]/route";
import { GET as getUser } from "../app/api/users/[address]/route";
import { GET as getClaimable } from "../app/api/users/[address]/claimable/route";
import { GET as getNfts } from "../app/api/nfts/route";
import { GET as getNft } from "../app/api/nfts/[id]/route";
import { GET as getHealth } from "../app/api/health/route";
import { formatValue, parseValue } from "../lib/format";

const ALICE = "0x1000000000000000000000000000000000000001";
const hash = (pair: string) => `0x${pair.repeat(32)}`;

type Json = { success: boolean; data: any; error?: any; meta?: any };

const call = async (handler: (request: Request, context?: any) => Promise<Response>, url: string, context?: any) => {
  const response = await handler(new Request(`http://localhost${url}`), context);
  return { status: response.status, body: (await response.json()) as Json };
};

const post = async (handler: (request: Request) => Promise<Response>, url: string, body: unknown) => {
  const response = await handler(new Request(`http://localhost${url}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: response.status, body: (await response.json()) as Json };
};

beforeEach(() => {
  process.env.DATA_MODE = "mock";
  process.env.MONAD_CHAIN_ID = "10143";
  // Unreachable RPC: chain-backed fields must degrade predictably instead of hanging.
  process.env.MONAD_RPC_URL = "http://127.0.0.1:9";
  delete process.env.RUNPROOF_CORE_ADDRESS;
  delete process.env.CATEGORY_REGISTRY_ADDRESS;
});

describe("catalogue", () => {
  it("serves the five V2 categories with their divisions", async () => {
    const { status, body } = await call(getCategories, "/api/categories");
    expect(status).toBe(200);
    expect(body.data.items).toHaveLength(5);
    const minecraft = body.data.items.find((item: any) => item.categoryId === 4);
    expect(minecraft).toMatchObject({ name: "Minecraft Any%", unit: "ms", direction: 2, directionName: "LowerIsBetter" });
    expect(minecraft.divisions.map((division: any) => division.name)).toEqual(["Java", "Bedrock"]);
  });

  it("returns a single category and 404s on unknown ids", async () => {
    const found = await call(getCategory, "/api/categories/5", { params: Promise.resolve({ id: "5" }) });
    expect(found.body.data).toMatchObject({ name: "Click Speed", decimals: 2, direction: 1 });
    const missing = await call(getCategory, "/api/categories/99", { params: Promise.resolve({ id: "99" }) });
    expect(missing.status).toBe(404);
  });

  it("lists challenge reasons", async () => {
    const { body } = await call(getReasons, "/api/reasons");
    expect(body.data.items[0]).toMatchObject({ reasonId: 1, code: "R001", name: "Fabricated Evidence" });
  });
});

describe("records", () => {
  it("filters and paginates by numeric ids", async () => {
    const { body } = await call(getRecords, "/api/records?categoryId=4&divisionId=1&status=Verified&limit=2");
    expect(body.meta.pagination).toMatchObject({ offset: 0, limit: 2, total: 3, hasMore: true });
    expect(body.data.items.map((item: any) => item.recordId)).toEqual([3, 2]);
    expect(body.data.items[0].status).toBe("Verified");
    expect(body.data.items[0].displayValue).toBe("19:59.999");
  });

  it("exposes value, direction and display unit on a detail read", async () => {
    const { body } = await call(getRecord, "/api/records/1", { params: Promise.resolve({ id: "1" }) });
    expect(body.data).toMatchObject({ recordId: 1, value: "1152345", displayValue: "19:12.345", direction: 2, status: "Verified" });
    expect(body.data.category.name).toBe("Minecraft Any%");
  });

  it("shows a revoked record with its confirmed challenge", async () => {
    const { body } = await call(getRecord, "/api/records/9", { params: Promise.resolve({ id: "9" }) });
    expect(body.data.status).toBe("Revoked");
    expect(body.data.challenges[0]).toMatchObject({ challengeId: 1, status: "Confirmed", special: true });
  });

  it("rejects an invalid status filter", async () => {
    const { status, body } = await call(getRecords, "/api/records?status=Nope");
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_STATUS");
  });
});

describe("leaderboard", () => {
  it("orders a lower-is-better board ascending and reports the chain best", async () => {
    const { body } = await call(getLeaderboard, "/api/leaderboard?categoryId=4&divisionId=1");
    expect(body.data.direction).toBe(2);
    expect(body.data.entries.map((entry: any) => entry.value)).toEqual(["1152345", "1180000", "1199999"]);
    expect(body.data.entries[0]).toMatchObject({ rank: 1, recordId: 1, displayValue: "19:12.345" });
    expect(body.data.chainBest).toMatchObject({ recordId: 1, displayValue: "19:12.345" });
  });

  it("orders a higher-is-better board descending with two decimals", async () => {
    const { body } = await call(getLeaderboard, "/api/leaderboard?categoryId=5&divisionId=1");
    expect(body.data.entries.map((entry: any) => entry.displayValue)).toEqual(["14.32", "12"]);
    expect(body.data.chainBest).toMatchObject({ recordId: 6, value: "1432" });
  });

  it("excludes revoked records from the board", async () => {
    const { body } = await call(getLeaderboard, "/api/leaderboard?categoryId=4&divisionId=1&offset=0&limit=50");
    expect(body.data.entries.some((entry: any) => entry.recordId === 9)).toBe(false);
    expect(body.data.total).toBe(3);
  });

  it("404s for an unknown division", async () => {
    const { status } = await call(getLeaderboard, "/api/leaderboard?categoryId=4&divisionId=9");
    expect(status).toBe(404);
  });
});

describe("challenges and voting", () => {
  it("lists the challenge for a record", async () => {
    const { body } = await call(getChallenges, "/api/challenges?recordId=9");
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].challengeId).toBe(1);
  });

  it("returns both rounds only for the current one", async () => {
    const { body } = await call(getChallenge, "/api/challenges/1", { params: Promise.resolve({ id: "1" }) });
    expect(body.data.currentRound.round).toBe(0);
    expect(body.data.summary).toMatchObject({ confirmPower: "400", denyPower: "100", revealedVoters: 5, totalVotes: 5 });
  });

  it("hides settled challenges from the default voting list", async () => {
    const open = await call(getVoting, "/api/voting");
    expect(open.body.data.items).toHaveLength(0);
    const confirmed = await call(getVoting, "/api/voting?status=Confirmed");
    expect(confirmed.body.data.items).toHaveLength(1);
  });

  it("degrades to null thresholds when the RPC is unreachable", async () => {
    const { status, body } = await call(getVotingDetail, "/api/voting/1", { params: Promise.resolve({ id: "1" }) });
    expect(status).toBe(200);
    expect(body.data.thresholds).toBeNull();
    expect(body.data.currentRound.commitEndSeconds).toBeTypeOf("number");
  });
});

describe("users and nfts", () => {
  it("summarises a player without requiring a chain read", async () => {
    const { body } = await call(getUser, `/api/users/${ALICE}`, { params: Promise.resolve({ address: ALICE }) });
    expect(body.data.stats).toMatchObject({ records: 2, votes: 1, nfts: 1 });
    expect(body.data.claimable).toBeNull();
  });

  it("returns 502 for claimable when the chain cannot be reached", async () => {
    const { status, body } = await call(getClaimable, `/api/users/${ALICE}/claimable`, { params: Promise.resolve({ address: ALICE }) });
    expect(status).toBe(502);
    expect(body.error.code).toBe("CHAIN_READ_FAILED");
  });

  it("lists NFTs and keeps a revoked one visible", async () => {
    const list = await call(getNfts, "/api/nfts");
    expect(list.body.data.items).toHaveLength(3);
    const revoked = await call(getNft, "/api/nfts/9", { params: Promise.resolve({ id: "9" }) });
    expect(revoked.body.data.status).toBe("Revoked");
  });
});

describe("submission planning", () => {
  const body = { categoryId: 4, divisionId: 1, value: "1152345", evidenceHash: hash("ab"), evidenceURI: "ipfs://evidence/1" };

  it("validates the body before touching the chain", async () => {
    const { status, body: response } = await post(postRecord, "/api/records", { ...body, evidenceURI: "javascript:alert(1)" });
    expect(status).toBe(400);
    expect(response.error.code).toBe("VALIDATION_ERROR");
  });

  it("reports a chain failure instead of inventing a transaction", async () => {
    const { status, body: response } = await post(postRecord, "/api/records", body);
    expect(status).toBe(502);
    expect(response.error.code).toBe("CHAIN_READ_FAILED");
  });

  it("never persists a record on POST", async () => {
    await post(postRecord, "/api/records", body);
    const after = await call(getRecords, "/api/records?limit=100");
    expect(after.body.meta.pagination.total).toBe(9);
  });
});

describe("health", () => {
  it("reports mock mode and tolerates an unreachable chain", async () => {
    const { status, body } = await call(getHealth, "/api/health");
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ dataMode: "mock", database: "not-used", indexer: null, chain: null });
  });
});

describe("value formatting", () => {
  it("renders milliseconds as a stopwatch", () => {
    expect(formatValue(1152345, "ms", 0)).toBe("19:12.345");
    expect(formatValue(9845, "ms", 0)).toBe("00:09.845");
    expect(formatValue(3_600_000, "ms", 0)).toBe("1:00:00.000");
  });

  it("renders decimals and trims trailing zeros", () => {
    expect(formatValue(1432, "cps", 2)).toBe("14.32");
    expect(formatValue(1200, "cps", 2)).toBe("12");
    expect(formatValue(25, "reps", 0)).toBe("25");
  });

  it("round-trips a decimal string back to the on-chain integer", () => {
    expect(parseValue("14.32", 2)).toBe(1432n);
    expect(parseValue("19", 0)).toBe(19n);
  });
});
