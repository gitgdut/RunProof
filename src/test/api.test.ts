import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";
import { challengeMessage, cheatMessage, recordMessage } from "../lib/auth";
import { GET as getRecords, POST as postRecord } from "../app/api/records/route";
import { GET as getLeaderboard } from "../app/api/leaderboard/route";
import { GET as getChallenge } from "../app/api/challenges/[id]/route";
import { GET as getVoting } from "../app/api/voting/route";
import { GET as getUserRewards } from "../app/api/users/[address]/rewards/route";
import { GET as getGames } from "../app/api/games/route";
import { POST as postCheat } from "../app/api/cheats/route";
import { POST as postChallenge } from "../app/api/challenges/route";
import { GET as getHealth } from "../app/api/health/route";

// Public test-only key; never use this account on a real network.
const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const hex = (char: string) => `0x${char.repeat(64)}`;
const hexPair = (pair: string) => `0x${pair.repeat(32)}`;
const jsonRequest = (url: string, body?: unknown) => new Request(`http://localhost${url}`, {
  method: body ? "POST" : "GET",
  headers: { "content-type": "application/json" },
  body: body ? JSON.stringify(body) : undefined,
});
const expiresAt = () => new Date(Date.now() + 60_000).toISOString();

beforeEach(() => {
  process.env.DATA_MODE = "mock";
  process.env.MONAD_CHAIN_ID = "10143";
  process.env.AUTH_MAX_SIGNATURE_AGE_SECONDS = "300";
  process.env.CHEAT_REGISTRY_ADMIN_ADDRESSES = account.address.toLowerCase();
});

describe("RunProof API", () => {
  it("reports the active data source in health", async () => {
    const response = await getHealth();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ status: "ok", dataMode: "mock", database: "not-used" });
  });

  it("exposes GameRegistry IDs and modes", async () => {
    const response = await getGames();
    const body = await response.json();
    expect(body.data.items[0]).toMatchObject({ id: 1, name: "Tetris" });
    expect(body.data.items[0].modes.map((mode: { modeId: number }) => mode.modeId)).toEqual([1, 2, 3]);
  });

  it("lists records with numeric filters and unified pagination", async () => {
    const response = await getRecords(jsonRequest("/api/records?gameId=1&status=VERIFIED&page=1&limit=1"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.meta.pagination.total).toBe(2);
  });

  it("ranks verified scores only using uint256 string values", async () => {
    const response = await getLeaderboard(jsonRequest("/api/leaderboard?gameId=1&gameMode=3"));
    const body = await response.json();
    expect(body.data.items.map((item: { score: string }) => item.score)).toEqual(["125430", "119870"]);
    expect(body.data.items[0].rank).toBe(1);
  });

  it("returns challenge rounds and voting power summaries", async () => {
    const list = await getVoting(jsonRequest("/api/voting"));
    const listBody = await list.json();
    expect(listBody.data.items[0].summary).toMatchObject({ round: 0, confirmPower: "1000", denyPower: "0" });
    const detail = await getChallenge(jsonRequest("/api/challenges/1"), { params: Promise.resolve({ id: "1" }) });
    const detailBody = await detail.json();
    expect(detailBody.data.cheat.cheatCode).toBe("C001");
    expect(detailBody.data.rounds[0].slashBps).toBe(0);
  });

  it("returns a user's reward history", async () => {
    const address = "0x1000000000000000000000000000000000000001";
    const response = await getUserRewards(jsonRequest(`/api/users/${address}/rewards`), { params: Promise.resolve({ address }) });
    const body = await response.json();
    expect(body.data.items[0].rewardType).toBe("CHALLENGER_REWARD");
  });

  it("accepts a signed pending record and rejects duplicate submission", async () => {
    const unsigned = {
      recordId: 99, playerAddress: account.address.toLowerCase(), gameId: 1, gameMode: 3, score: "132000",
      stakeAmount: "1000000000000000000", evidenceURI: "ipfs://runproof/test/99", evidenceHash: hexPair("9f"),
      challengeDeadline: new Date(Date.now() + 600_000).toISOString(), transactionHash: hexPair("8e"), expiresAt: expiresAt(),
    };
    const input = { ...unsigned, signature: await account.signMessage({ message: recordMessage(unsigned) }) };
    const created = await postRecord(jsonRequest("/api/records", input));
    const createdBody = await created.json();
    expect(created.status).toBe(201);
    expect(createdBody.data.status).toBe("PENDING");
    const duplicate = await postRecord(jsonRequest("/api/records", input));
    expect(duplicate.status).toBe(409);

    const challenge = {
      challengeId: 51, recordId: 99, cheatId: 1, challenger: account.address.toLowerCase(),
      bond: "100000000000000000", evidenceURI: "ipfs://runproof/test/challenge-99",
      evidenceHash: hex("3"), special: false, transactionHash: hex("4"), expiresAt: expiresAt(),
    };
    const challengeInput = { ...challenge, signature: await account.signMessage({ message: challengeMessage(challenge) }) };
    const blocked = await postChallenge(jsonRequest("/api/challenges", challengeInput));
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error.code).toBe("CHAIN_RECORD_REQUIRED");
  });

  it("rejects a record forged for another wallet", async () => {
    const unsigned = {
      recordId: 98, playerAddress: account.address.toLowerCase(), gameId: 1, gameMode: 3, score: "1",
      stakeAmount: "1", evidenceURI: "ipfs://runproof/test/98", evidenceHash: hex("c"),
      challengeDeadline: new Date(Date.now() + 600_000).toISOString(), transactionHash: hex("d"), expiresAt: expiresAt(),
    };
    const input = { ...unsigned, signature: await account.signMessage({ message: recordMessage(unsigned) }), playerAddress: "0x1000000000000000000000000000000000000001" };
    const response = await postRecord(jsonRequest("/api/records", input));
    expect(response.status).toBe(401);
  });

  it("rejects unsupported evidence URI schemes before signature verification", async () => {
    const response = await postRecord(jsonRequest("/api/records", {
      recordId: 97, playerAddress: account.address, gameId: 1, gameMode: 3, score: "1", stakeAmount: "1",
      evidenceURI: "javascript:alert(1)", evidenceHash: hex("1"), challengeDeadline: new Date(Date.now() + 600_000).toISOString(),
      transactionHash: hex("2"), expiresAt: expiresAt(), signature: `0x${"1".repeat(130)}`,
    }));
    expect(response.status).toBe(400);
  });

  it("accepts a signed challenge on an indexed record", async () => {
    const unsigned = {
      challengeId: 52, recordId: 3, cheatId: 1, challenger: account.address.toLowerCase(),
      bond: "100000000000000000", evidenceURI: "ipfs://runproof/test/challenge-3", evidenceHash: hexPair("7d"),
      special: false, transactionHash: hexPair("6c"), expiresAt: expiresAt(),
    };
    const input = { ...unsigned, signature: await account.signMessage({ message: challengeMessage(unsigned) }) };
    const response = await postChallenge(jsonRequest("/api/challenges", input));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.data.status).toBe("PENDING");
  });

  it("requires an admin wallet signature for cached cheat metadata", async () => {
    const unsigned = {
      cheatId: 9, cheatCode: "C009", name: "Replay tampering", description: "Altered replay payload.",
      evidenceURI: "ipfs://runproof/cheats/C009", adminAddress: account.address.toLowerCase(), expiresAt: expiresAt(),
    };
    const input = { ...unsigned, signature: await account.signMessage({ message: cheatMessage(unsigned) }) };
    const response = await postCheat(jsonRequest("/api/cheats", input));
    expect(response.status).toBe(201);
    const badAdmin = { ...input, adminAddress: "0x1000000000000000000000000000000000000001" };
    expect((await postCheat(jsonRequest("/api/cheats", badAdmin))).status).toBe(403);
  });
});
