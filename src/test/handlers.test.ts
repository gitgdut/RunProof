import { describe, expect, it } from "vitest";
import { applyEvent, type IndexerLog } from "@/indexer/handlers";

type Call = { model: string; method: string; args: Record<string, any> };

function fakeTx() {
  const calls: Call[] = [];
  const tx = new Proxy({}, {
    get(_target, model: string) {
      return new Proxy({}, {
        get(_inner, method: string) {
          return async (args: Record<string, any> = {}) => {
            calls.push({ model, method, args });
            if (method === "findUnique") {
              if (model === "category") return { id: 4, direction: 2, ruleVersion: 1 };
              if (model === "record") return { id: 9, categoryId: 4, divisionId: 1, status: 3 };
              if (model === "challenge") return { id: 1, round: 0 };
              return { id: 1 };
            }
            if (method === "findFirst") return { id: 1, value: "1152345" };
            if (method === "updateMany") return { count: 1 };
            return {};
          };
        },
      });
    },
  });
  return { tx: tx as any, calls };
}

function log(eventName: string, args: Record<string, unknown>, source = "core", logIndex = 1): IndexerLog {
  return {
    eventName, args, transactionHash: `0x${"1".repeat(64)}`, logIndex, blockNumber: 100n,
    blockHash: `0x${"2".repeat(64)}`, address: `0x${"3".repeat(40)}`, source,
  };
}

const blockTimestamp = new Date("2026-11-21T02:05:00.000Z");
const find = (calls: Call[], model: string, method: string) => calls.find((item) => item.model === model && item.method === method)!;

describe("indexer event handlers", () => {
  it("stores a submitted record as Provisional with the category snapshot", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("RecordSubmitted", {
      recordId: 1n, player: "0x0D64b1D9AbF6C30ced5e1edf325C3536086f32E7", categoryId: 4n, divisionId: 1n,
      value: 1152345n, stake: 100000000000000000n, evidenceHash: `0x${"ab".repeat(32)}`,
      evidenceURI: "ipfs://evidence/1", deadline: 1795244757n,
    }), blockTimestamp);

    const created = find(calls, "record", "upsert").args.create;
    expect(created).toMatchObject({ id: 1, categoryId: 4, divisionId: 1, value: "1152345", status: 1, direction: 2, ruleVersion: 1 });
    expect(created.player).toBe("0x0d64b1d9abf6c30ced5e1edf325c3536086f32e7");
    expect(created.deadline).toEqual(new Date(1795244757 * 1000));
  });

  it("seeds a challenge in Voting with one initial evidence and round 0", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("ChallengeCreated", {
      recordId: 9n, reasonId: 1n, challenger: "0x2000000000000000000000000000000000000002", challengeId: 1n,
      bond: 500000000000000000n, special: true, evidenceHash: `0x${"cd".repeat(32)}`,
      evidenceURI: "ipfs://evidence/edited", commitEnd: 1795245412n,
    }), blockTimestamp);

    expect(find(calls, "challenge", "upsert").args.create).toMatchObject({ id: 1, status: 1, round: 0, special: true, evidenceCount: 1 });
    expect(find(calls, "challengeRound", "upsert").args.create).toMatchObject({ challengeId: 1, round: 0, commitEnd: new Date(1795245412 * 1000) });
  });

  it("maps the VotingFinalized outcome and winner", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("VotingFinalized", {
      recordId: 9n, reasonId: 1n, challengeId: 1n, outcome: 4, round: 0, confirmPower: 400n, denyPower: 500n,
    }), blockTimestamp);

    expect(find(calls, "challenge", "update").args.data).toMatchObject({ status: 4, round: 0 });
    expect(find(calls, "challengeRound", "upsert").args.update).toMatchObject({ finalized: true, winner: 2, confirmPower: "400", denyPower: "500" });
  });

  it("keeps StakeReturned working although the event has no challengeId", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("StakeReturned", {
      recordId: 9n, reasonId: 1n, account: "0x2000000000000000000000000000000000000002",
      amount: 500000000000000000n, kind: 1,
    }), blockTimestamp);

    expect(find(calls, "stakeFlow", "create").args.data).toMatchObject({
      recordId: 9, reasonId: 1, challengeId: null, flow: "RETURNED", kind: 1, amount: "500000000000000000",
    });
  });

  it("maps reward kinds and keeps the challenger reward distinct", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("RewardDistributed", {
      recordId: 9n, reasonId: 1n, account: "0x2000000000000000000000000000000000000002",
      amount: 160000000000000000n, kind: 0, challengeId: 1n,
    }), blockTimestamp);

    expect(find(calls, "reward", "create").args.data).toMatchObject({ kind: 0, challengeId: 1, amount: "160000000000000000", source: "core" });
  });

  it("updates the board pointer from LeaderboardUpdated", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("LeaderboardUpdated", {
      categoryId: 4n, divisionId: 1n, bestRecordId: 1n, bestValue: 1152345n,
    }), blockTimestamp);

    expect(find(calls, "leaderboard", "upsert").args.create).toMatchObject({ categoryId: 4, divisionId: 1, bestRecordId: 1, bestValue: "1152345" });
  });

  it("recomputes the board when a record is revoked", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("RecordRevoked", {
      recordId: 9n, player: "0x5000000000000000000000000000000000000005", reasonId: 1n, challengeId: 1n,
    }), blockTimestamp);

    expect(find(calls, "record", "updateMany").args.data).toEqual({ status: 3 });
    expect(find(calls, "nFT", "updateMany").args.data).toEqual({ status: 3 });
    expect(find(calls, "leaderboard", "upsert").args.create).toMatchObject({ categoryId: 4, divisionId: 1, bestRecordId: 1 });
  });

  it("caches a registered reason with its code", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("ReasonRegistered", {
      reasonId: 1n, code: "R001", name: "Fabricated Evidence", discoverer: "0x0000000000000000000000000000000000000000",
    }, "reasonRegistry"), blockTimestamp);

    expect(find(calls, "challengeReason", "upsert").args.create).toMatchObject({ id: 1, code: "R001", name: "Fabricated Evidence", registered: true });
  });

  it("refuses ChallengeCreated before its record is indexed", async () => {
    const emptyTx = new Proxy({}, { get: () => new Proxy({}, { get: () => async () => null }) }) as any;
    await expect(applyEvent(emptyTx, log("ChallengeCreated", {
      recordId: 9n, reasonId: 1n, challenger: "0x2000000000000000000000000000000000000002", challengeId: 1n,
      bond: 1n, special: false, evidenceHash: `0x${"ab".repeat(32)}`, evidenceURI: "ipfs://x", commitEnd: 1n,
    }), blockTimestamp)).rejects.toThrow(/RecordSubmitted \(record 9\)/);
  });
});
