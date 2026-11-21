import { describe, expect, it } from "vitest";
import { applyEvent, type IndexerLog } from "@/indexer/handlers";

type Call = { model: string; method: string; args: Record<string, any> };

function fakeTx() {
  const calls: Call[] = [];
  const handler = {
    get(_target: unknown, model: string) {
      return new Proxy({}, {
        get(_inner: unknown, method: string) {
          return async (args: Record<string, any> = {}) => {
            calls.push({ model, method, args });
            if (method === "findUnique") {
              if (model === "record") return { id: 1, gameId: 1, status: "PROVISIONAL" };
              if (model === "challenge") return { id: 1, round: 0, status: "VOTING" };
              return { id: 1 };
            }
            if (method === "updateMany") return { count: 1 };
            return {};
          };
        },
      });
    },
  };
  return { tx: new Proxy({}, handler) as any, calls };
}

function log(eventName: string, args: Record<string, unknown>, logIndex = 1): IndexerLog {
  return {
    eventName, args, transactionHash: `0x${"1".repeat(64)}`, logIndex, blockNumber: 100n,
    blockHash: `0x${"2".repeat(64)}`, address: `0x${"3".repeat(40)}`, source: "core",
  };
}

const blockTimestamp = new Date("2026-11-21T08:00:00.000Z");
const call = (calls: Call[], model: string, method: string) => calls.find((item) => item.model === model && item.method === method)!;

describe("indexer event handlers", () => {
  it("stores StakeReturned without a challengeId as null", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("StakeReturned", {
      recordId: 1n, cheatId: 0n, account: "0x1000000000000000000000000000000000000001",
      amount: 1000000000000000000n, kind: 0,
    }), blockTimestamp);

    const created = call(calls, "stakeFlow", "create").args.data;
    expect(created).toMatchObject({ recordId: 1, cheatId: null, challengeId: null, flowType: "RETURNED", stakeKind: "PLAYER_STAKE" });
    expect(created.amount).toBe("1000000000000000000");
  });

  it("records StakeSlashed with its challengeId and stake kind", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("StakeSlashed", {
      recordId: 1n, cheatId: 2n, account: "0x2000000000000000000000000000000000000002",
      amount: 500n, kind: 1, challengeId: 7n,
    }), blockTimestamp);

    expect(call(calls, "stakeFlow", "create").args.data).toMatchObject({ cheatId: 2, challengeId: 7, flowType: "SLASHED", stakeKind: "CHALLENGE_BOND" });
  });

  it("maps RewardDistributed kinds onto RewardType", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("RewardDistributed", {
      recordId: 1n, cheatId: 2n, account: "0x3000000000000000000000000000000000000003",
      amount: 10n, kind: 1, challengeId: 0n,
    }), blockTimestamp);

    expect(call(calls, "reward", "create").args.data).toMatchObject({ rewardType: "PLAYER_COMPENSATION", challengeId: null });
  });

  it("seeds a challenge in VOTING with one initial evidence and round 0 commit window", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("ChallengeCreated", {
      recordId: 1n, cheatId: 2n, challenger: "0x3000000000000000000000000000000000000003", challengeId: 7n,
      bond: 100000000000000000n, special: false, evidenceHash: `0x${"a".repeat(64)}`,
      evidenceURI: "ipfs://runproof/challenges/7", commitEnd: 1763712000n,
    }), blockTimestamp);

    expect(call(calls, "challenge", "upsert").args.create).toMatchObject({ id: 7, status: "VOTING", round: 0, special: false, evidenceCount: 1 });
    expect(call(calls, "challengeRound", "upsert").args.create).toMatchObject({ challengeId: 7, round: 0, commitEnd: new Date(1763712000 * 1000) });
  });

  it("applies VotingFinalized outcome, round and powers", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("VotingFinalized", {
      recordId: 1n, cheatId: 2n, challengeId: 7n, outcome: 4, round: 0, confirmPower: 4000n, denyPower: 500n,
    }), blockTimestamp);

    expect(call(calls, "challenge", "update").args.data).toMatchObject({ status: "DENIED", round: 0 });
    expect(call(calls, "challengeRound", "upsert").args.update).toMatchObject({ finalized: true, winner: "DENY", confirmPower: 4000n, denyPower: 500n });
  });

  it("marks the record verified and syncs the NFT status", async () => {
    const { tx, calls } = fakeTx();
    await applyEvent(tx, log("RecordVerified", {
      recordId: 1n, player: "0x1000000000000000000000000000000000000001", gameId: 1n, score: 125430n,
    }), blockTimestamp);

    expect(call(calls, "record", "updateMany").args.data).toMatchObject({ status: "VERIFIED", score: 125430n });
    expect(call(calls, "nFT", "updateMany").args.data).toEqual({ status: "VERIFIED" });
  });

  it("rejects an indexer sequence where ChallengeCreated precedes RecordSubmitted", async () => {
    const emptyTx = new Proxy({}, { get: () => new Proxy({}, { get: () => async () => null }) }) as any;
    await expect(applyEvent(emptyTx, log("ChallengeCreated", {
      recordId: 9n, cheatId: 1n, challenger: "0x3000000000000000000000000000000000000003", challengeId: 3n,
      bond: 1n, special: false, evidenceHash: `0x${"a".repeat(64)}`, evidenceURI: "ipfs://x", commitEnd: 1n,
    }), blockTimestamp)).rejects.toThrow(/RecordSubmitted 9/);
  });
});
