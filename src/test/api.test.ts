import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";
import { challengeMessage, cheatMessage, recordMessage } from "../lib/auth";
import { GET as getRecords, POST as postRecord } from "../app/api/records/route";
import { GET as getLeaderboard } from "../app/api/leaderboard/route";
import { GET as getChallenge } from "../app/api/challenges/[id]/route";
import { GET as getVoting } from "../app/api/voting/route";
import { GET as getUserRewards } from "../app/api/users/[address]/rewards/route";
import { POST as postCheat } from "../app/api/cheats/route";
import { POST as postChallenge } from "../app/api/challenges/route";

// Public test-only key; never use this account on a real network.
const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const hex = (char: string) => `0x${char.repeat(64)}`;
const jsonRequest = (url: string, body?: unknown) => new Request(`http://localhost${url}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  process.env.DATA_MODE = "mock";
  process.env.MONAD_CHAIN_ID = "10143";
  process.env.AUTH_MAX_SIGNATURE_AGE_SECONDS = "300";
  process.env.CHEAT_REGISTRY_ADMIN_ADDRESSES = account.address.toLowerCase();
});

describe("RunProof API", () => {
  it("lists records with filters and unified pagination", async () => {
    const response = await getRecords(jsonRequest("/api/records?status=VERIFIED&page=1&limit=1"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.meta.pagination.total).toBe(2);
  });

  it("ranks verified scores only", async () => {
    const response = await getLeaderboard(jsonRequest("/api/leaderboard?gameId=game_tetris&gameMode=marathon"));
    const body = await response.json();
    expect(body.data.items.map((item: { score: number }) => item.score)).toEqual([125430, 119870]);
    expect(body.data.items[0].rank).toBe(1);
  });

  it("returns voting summaries and challenge details", async () => {
    const list = await getVoting(jsonRequest("/api/voting"));
    const listBody = await list.json();
    expect(listBody.data.items[0].summary.totalVotes).toBe(1);
    const detail = await getChallenge(jsonRequest("/api/challenges/challenge_voting_001"), { params: Promise.resolve({ id: "challenge_voting_001" }) });
    const detailBody = await detail.json();
    expect(detailBody.data.cheat.cheatCode).toBe("TOOL_ASSIST");
  });

  it("returns a user's reward history", async () => {
    const address = "0x1000000000000000000000000000000000000001";
    const response = await getUserRewards(jsonRequest(`/api/users/${address}/rewards`), { params: Promise.resolve({ address }) });
    const body = await response.json();
    expect(body.data.items[0].rewardType).toBe("CHALLENGE_SUCCESS");
  });

  it("accepts a signed record and rejects duplicate submission", async () => {
    const unsigned = {
      playerAddress: account.address.toLowerCase(), gameId: "game_tetris", gameMode: "marathon", score: 132000,
      stakeAmount: "1000000000000000000", videoUrl: "https://cdn.runproof.demo/videos/new.mp4",
      evidenceHash: hex("a"), transactionHash: hex("b"), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const input = { ...unsigned, signature: await account.signMessage({ message: recordMessage(unsigned) }) };
    const created = await postRecord(jsonRequest("/api/records", input));
    expect(created.status).toBe(201);
    const duplicate = await postRecord(jsonRequest("/api/records", input));
    expect(duplicate.status).toBe(409);
  });

  it("rejects a record forged for another wallet", async () => {
    const unsigned = {
      playerAddress: account.address.toLowerCase(), gameId: "game_tetris", gameMode: "marathon", score: 1,
      stakeAmount: "1", videoUrl: "https://cdn.runproof.demo/videos/forged.mp4",
      evidenceHash: hex("c"), transactionHash: hex("d"), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const input = { ...unsigned, signature: await account.signMessage({ message: recordMessage(unsigned) }), playerAddress: "0x1000000000000000000000000000000000000001" };
    const response = await postRecord(jsonRequest("/api/records", input));
    expect(response.status).toBe(401);
  });

  it("accepts a signed challenge without accepting a voting result", async () => {
    const unsigned = {
      recordId: "rec_voting_003", cheatId: "cheat_video_edit", challenger: account.address.toLowerCase(),
      evidenceHash: hex("e"), transactionHash: hex("f"), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const input = { ...unsigned, signature: await account.signMessage({ message: challengeMessage(unsigned) }) };
    const response = await postChallenge(jsonRequest("/api/challenges", input));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.data.status).toBe("PENDING");
  });

  it("requires an admin wallet signature for cheat registry writes", async () => {
    const unsigned = {
      cheatCode: "MEMORY_EDIT", name: "Memory editing", description: "Altering game memory to change the score.",
      gameId: "game_tetris", adminAddress: account.address.toLowerCase(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const input = { ...unsigned, signature: await account.signMessage({ message: cheatMessage(unsigned) }) };
    const response = await postCheat(jsonRequest("/api/cheats", input));
    expect(response.status).toBe(201);
    const badAdmin = { ...input, adminAddress: "0x1000000000000000000000000000000000000001" };
    const denied = await postCheat(jsonRequest("/api/cheats", badAdmin));
    expect(denied.status).toBe(403);
  });
});
