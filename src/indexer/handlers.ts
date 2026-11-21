import type { Prisma } from "@prisma/client";

export type IndexerLog = {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockHash: string;
  address: string;
  source: string;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const id = (value: unknown) => {
  const parsed = Number(String(value));
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) throw new Error(`On-chain id ${String(value)} is outside the supported integer range`);
  return parsed;
};
const int = (value: unknown) => Number(String(value ?? 0));
const text = (value: unknown) => String(value ?? "");
const wallet = (value: unknown) => text(value).toLowerCase();
const money = (value: unknown) => BigInt(String(value ?? 0)).toString();
const seconds = (value: unknown) => new Date(Number(String(value ?? 0)) * 1000);
const optionalId = (value: unknown) => {
  if (value === undefined || value === null) return null;
  const parsed = id(value);
  return parsed === 0 ? null : parsed;
};

/** RecordStatus */
export const RECORD_PROVISIONAL = 1;
export const RECORD_VERIFIED = 2;
export const RECORD_REVOKED = 3;
/** ChallengeStatus */
export const CHALLENGE_VOTING = 1;
export const CHALLENGE_EVIDENCE_VOTING = 2;

function nftStatusFor(recordStatus: number) {
  if (recordStatus === RECORD_VERIFIED) return RECORD_VERIFIED;
  if (recordStatus === RECORD_REVOKED) return RECORD_REVOKED;
  return RECORD_PROVISIONAL;
}

async function ensureCategory(tx: Prisma.TransactionClient, categoryId: number) {
  return tx.category.upsert({
    where: { id: categoryId },
    update: {},
    create: { id: categoryId, name: `Category #${categoryId}`, unit: "", decimals: 0, direction: 1, ruleVersion: 0, baseStake: "0", active: false },
  });
}

async function ensureDivision(tx: Prisma.TransactionClient, categoryId: number, divisionId: number, name?: string) {
  await ensureCategory(tx, categoryId);
  return tx.division.upsert({
    where: { categoryId_divisionId: { categoryId, divisionId } },
    update: name ? { name } : {},
    create: { categoryId, divisionId, name: name ?? `Division #${divisionId}`, active: true },
  });
}

async function ensureReason(tx: Prisma.TransactionClient, reasonId: number) {
  return tx.challengeReason.upsert({
    where: { id: reasonId },
    update: {},
    create: { id: reasonId, code: `R${String(reasonId).padStart(3, "0")}`, name: `Reason #${reasonId}`, registered: false },
  });
}

/**
 * Best record for a board according to the contract ordering (value by direction, then the
 * earlier submission, then the smaller recordId). The chain stays authoritative through
 * bestRecordId + LeaderboardUpdated; this keeps the board sane between events and gives
 * reconciliation something to compare against.
 */
export async function computeBest(tx: Prisma.TransactionClient, categoryId: number, divisionId: number) {
  const category = await tx.category.findUnique({ where: { id: categoryId } });
  const direction = category?.direction === 2 ? 2 : 1;
  return tx.record.findFirst({
    where: { categoryId, divisionId, status: RECORD_VERIFIED },
    orderBy: direction === 2
      ? [{ value: "asc" }, { submittedAt: "asc" }, { id: "asc" }]
      : [{ value: "desc" }, { submittedAt: "asc" }, { id: "asc" }],
  });
}

async function recomputeBoard(tx: Prisma.TransactionClient, categoryId: number, divisionId: number) {
  const best = await computeBest(tx, categoryId, divisionId);
  const data = { bestRecordId: best?.id ?? 0, bestValue: best?.value ?? "0" };
  await tx.leaderboard.upsert({
    where: { categoryId_divisionId: { categoryId, divisionId } },
    update: data,
    create: { categoryId, divisionId, ...data },
  });
}

export async function applyEvent(tx: Prisma.TransactionClient, log: IndexerLog, blockTimestamp: Date) {
  const args = log.args;
  switch (log.eventName) {
    // ------------------------------------------------------------ CategoryRegistry
    case "CategoryCreated":
    case "CategoryUpdated": {
      const categoryId = id(args.categoryId);
      await tx.category.upsert({
        where: { id: categoryId },
        update: {
          name: text(args.name), unit: text(args.unit), decimals: int(args.decimals), direction: int(args.direction),
          ruleVersion: int(args.ruleVersion), baseStake: money(args.baseStake), descriptionURI: text(args.descriptionURI),
        },
        create: {
          id: categoryId, name: text(args.name), unit: text(args.unit), decimals: int(args.decimals),
          direction: int(args.direction), ruleVersion: int(args.ruleVersion), baseStake: money(args.baseStake),
          descriptionURI: text(args.descriptionURI), active: true,
        },
      });
      return;
    }
    case "CategoryActiveSet": {
      const categoryId = id(args.categoryId);
      await ensureCategory(tx, categoryId);
      await tx.category.update({ where: { id: categoryId }, data: { active: Boolean(args.active) } });
      return;
    }
    case "DivisionCreated": {
      const categoryId = id(args.categoryId);
      const divisionId = id(args.divisionId);
      await ensureDivision(tx, categoryId, divisionId, text(args.name));
      await tx.division.update({ where: { categoryId_divisionId: { categoryId, divisionId } }, data: { active: true } });
      return;
    }
    case "DivisionActiveSet": {
      const categoryId = id(args.categoryId);
      const divisionId = id(args.divisionId);
      await ensureDivision(tx, categoryId, divisionId);
      await tx.division.update({ where: { categoryId_divisionId: { categoryId, divisionId } }, data: { active: Boolean(args.active) } });
      return;
    }

    // -------------------------------------------------- ChallengeReasonRegistry
    case "ReasonRegistered": {
      const reasonId = id(args.reasonId);
      const data = { code: text(args.code), name: text(args.name), discovererAddress: wallet(args.discoverer), registeredAt: blockTimestamp, registered: true };
      await tx.challengeReason.upsert({
        where: { id: reasonId },
        update: data,
        create: { id: reasonId, ...data },
      });
      return;
    }
    case "ReasonProposed": {
      const proposalId = id(args.proposalId);
      const data = { proposer: wallet(args.proposer), name: text(args.name), bond: money(args.bond), endTime: seconds(args.endTime), status: 1 };
      await tx.reasonProposal.upsert({ where: { id: proposalId }, update: data, create: { id: proposalId, ...data } });
      return;
    }
    case "ReasonProposalVoted": {
      const proposalId = id(args.proposalId);
      await tx.reasonProposal.upsert({
        where: { id: proposalId },
        update: {},
        create: { id: proposalId, proposer: ZERO_ADDRESS, name: "", bond: "0", endTime: blockTimestamp, status: 1 },
      });
      await tx.reasonProposalVote.create({
        data: {
          proposalId, voter: wallet(args.voter), support: Boolean(args.support), stake: money(args.stake), power: money(args.power),
          transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber, createdAt: blockTimestamp,
        },
      });
      return;
    }
    case "ReasonProposalFinalized": {
      const proposalId = id(args.proposalId);
      const data = { status: int(args.status), reasonId: optionalId(args.reasonId) };
      await tx.reasonProposal.upsert({
        where: { id: proposalId },
        update: data,
        create: { id: proposalId, proposer: ZERO_ADDRESS, name: "", bond: "0", endTime: blockTimestamp, ...data },
      });
      return;
    }
    case "DiscovererRewarded": {
      await tx.reward.create({
        data: {
          source: log.source, proposalId: id(args.proposalId), reasonId: optionalId(args.reasonId), walletAddress: wallet(args.proposer),
          amount: money(args.amount), kind: null, transactionHash: log.transactionHash, logIndex: log.logIndex,
          blockNumber: log.blockNumber, createdAt: blockTimestamp,
        },
      });
      return;
    }

    // --------------------------------------------------------------- RunProofCore
    case "RecordSubmitted": {
      const recordId = id(args.recordId);
      const categoryId = id(args.categoryId);
      const divisionId = id(args.divisionId);
      await ensureDivision(tx, categoryId, divisionId);
      const category = await tx.category.findUnique({ where: { id: categoryId } });
      const data = {
        player: wallet(args.player), categoryId, divisionId, value: money(args.value),
        direction: category?.direction ?? 1, ruleVersion: category?.ruleVersion ?? 0,
        evidenceHash: text(args.evidenceHash), evidenceURI: text(args.evidenceURI), stake: money(args.stake),
        submittedAt: blockTimestamp, deadline: seconds(args.deadline), status: RECORD_PROVISIONAL,
        transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber, indexedAt: blockTimestamp,
      };
      await tx.record.upsert({ where: { id: recordId }, update: data, create: { id: recordId, ...data } });
      return;
    }
    case "RecordVerified": {
      const recordId = id(args.recordId);
      const result = await tx.record.updateMany({
        where: { id: recordId },
        data: { status: RECORD_VERIFIED, player: wallet(args.player), categoryId: id(args.categoryId), value: money(args.value) },
      });
      if (result.count === 0) throw new Error(`Cannot index RecordVerified before RecordSubmitted (record ${recordId})`);
      const record = await tx.record.findUnique({ where: { id: recordId } });
      await tx.nFT.updateMany({ where: { recordId }, data: { status: RECORD_VERIFIED } });
      if (record) await recomputeBoard(tx, record.categoryId, record.divisionId);
      return;
    }
    case "RecordRevoked": {
      const recordId = id(args.recordId);
      const result = await tx.record.updateMany({ where: { id: recordId }, data: { status: RECORD_REVOKED } });
      if (result.count === 0) throw new Error(`Cannot index RecordRevoked before RecordSubmitted (record ${recordId})`);
      const record = await tx.record.findUnique({ where: { id: recordId } });
      await tx.nFT.updateMany({ where: { recordId }, data: { status: RECORD_REVOKED } });
      if (record) await recomputeBoard(tx, record.categoryId, record.divisionId);
      return;
    }
    case "LeaderboardUpdated": {
      const categoryId = id(args.categoryId);
      const divisionId = id(args.divisionId);
      const data = { bestRecordId: id(args.bestRecordId), bestValue: money(args.bestValue), blockNumber: log.blockNumber };
      await tx.leaderboard.upsert({
        where: { categoryId_divisionId: { categoryId, divisionId } },
        update: data,
        create: { categoryId, divisionId, ...data },
      });
      return;
    }
    case "ChallengeCreated": {
      const challengeId = id(args.challengeId);
      const recordId = id(args.recordId);
      const reasonId = id(args.reasonId);
      const record = await tx.record.findUnique({ where: { id: recordId } });
      if (!record) throw new Error(`Cannot index ChallengeCreated before RecordSubmitted (record ${recordId})`);
      await ensureReason(tx, reasonId);
      const data = {
        recordId, reasonId, challenger: wallet(args.challenger), bond: money(args.bond), reserved: "0",
        evidenceHash: text(args.evidenceHash), evidenceURI: text(args.evidenceURI), status: CHALLENGE_VOTING,
        round: 0, special: Boolean(args.special), evidenceCount: 1, createdAt: blockTimestamp,
        transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber, indexedAt: blockTimestamp,
      };
      await tx.challenge.upsert({ where: { id: challengeId }, update: data, create: { id: challengeId, ...data } });
      await tx.challengeRound.upsert({
        where: { challengeId_round: { challengeId, round: 0 } },
        update: { commitEnd: seconds(args.commitEnd) },
        create: { challengeId, round: 0, commitEnd: seconds(args.commitEnd) },
      });
      return;
    }
    case "EvidenceSubmitted": {
      const challengeId = id(args.challengeId);
      await tx.evidence.create({
        data: {
          challengeId, round: int(args.round), submitter: wallet(args.submitter), evidenceHash: text(args.evidenceHash),
          evidenceURI: text(args.evidenceURI), transactionHash: log.transactionHash, logIndex: log.logIndex,
          blockNumber: log.blockNumber, createdAt: blockTimestamp,
        },
      });
      await tx.challenge.update({ where: { id: challengeId }, data: { evidenceCount: { increment: 1 } } });
      return;
    }
    case "VoteCommitted": {
      const challengeId = id(args.challengeId);
      const round = int(args.round);
      const voterAddress = wallet(args.voter);
      await tx.vote.upsert({
        where: { challengeId_round_voterAddress: { challengeId, round, voterAddress } },
        update: { stakeAmount: money(args.stake), commitTransactionHash: log.transactionHash },
        create: { challengeId, round, voterAddress, stakeAmount: money(args.stake), commitTransactionHash: log.transactionHash },
      });
      return;
    }
    case "VoteRevealed": {
      const challengeId = id(args.challengeId);
      const round = int(args.round);
      const voterAddress = wallet(args.voter);
      const choice = int(args.choice);
      await tx.vote.upsert({
        where: { challengeId_round_voterAddress: { challengeId, round, voterAddress } },
        update: { votingChoice: choice, votingPower: money(args.power), revealed: true, revealTransactionHash: log.transactionHash },
        create: {
          challengeId, round, voterAddress, votingChoice: choice, votingPower: money(args.power), stakeAmount: "0",
          revealed: true, revealTransactionHash: log.transactionHash,
        },
      });
      return;
    }
    case "VotingExtended": {
      const challengeId = id(args.challengeId);
      const challenge = await tx.challenge.findUnique({ where: { id: challengeId } });
      if (!challenge) throw new Error(`Cannot index VotingExtended before ChallengeCreated (challenge ${challengeId})`);
      await tx.challenge.update({ where: { id: challengeId }, data: { extended: true } });
      await tx.challengeRound.upsert({
        where: { challengeId_round: { challengeId, round: challenge.round } },
        update: { commitEnd: seconds(args.newCommitEnd), revealEnd: seconds(args.newRevealEnd) },
        create: { challengeId, round: challenge.round, commitEnd: seconds(args.newCommitEnd), revealEnd: seconds(args.newRevealEnd) },
      });
      return;
    }
    case "EvidenceVotingStarted": {
      const challengeId = id(args.challengeId);
      await tx.challenge.update({ where: { id: challengeId }, data: { status: CHALLENGE_EVIDENCE_VOTING, round: 1 } });
      await tx.challengeRound.upsert({
        where: { challengeId_round: { challengeId, round: 1 } },
        update: { commitEnd: seconds(args.commitEnd), revealEnd: seconds(args.revealEnd) },
        create: { challengeId, round: 1, commitEnd: seconds(args.commitEnd), revealEnd: seconds(args.revealEnd) },
      });
      return;
    }
    case "VotingFinalized": {
      const challengeId = id(args.challengeId);
      const round = int(args.round);
      const outcome = int(args.outcome);
      await tx.challenge.update({ where: { id: challengeId }, data: { status: outcome, round } });
      const data = {
        finalized: true, confirmPower: money(args.confirmPower), denyPower: money(args.denyPower),
        winner: outcome === 3 ? 1 : outcome === 4 ? 2 : 0,
      };
      await tx.challengeRound.upsert({
        where: { challengeId_round: { challengeId, round } },
        update: data,
        create: { challengeId, round, ...data },
      });
      return;
    }
    case "StakeReturned":
    case "StakeSlashed": {
      await tx.stakeFlow.create({
        data: {
          flow: log.eventName === "StakeReturned" ? "RETURNED" : "SLASHED",
          recordId: optionalId(args.recordId), reasonId: optionalId(args.reasonId), challengeId: optionalId(args.challengeId),
          walletAddress: wallet(args.account), amount: money(args.amount), kind: int(args.kind),
          transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber, createdAt: blockTimestamp,
        },
      });
      return;
    }
    case "RewardDistributed": {
      await tx.reward.create({
        data: {
          source: log.source, recordId: optionalId(args.recordId), reasonId: optionalId(args.reasonId),
          challengeId: optionalId(args.challengeId), walletAddress: wallet(args.account), amount: money(args.amount),
          kind: int(args.kind), transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber, createdAt: blockTimestamp,
        },
      });
      return;
    }
    case "Withdrawn": {
      await tx.withdrawal.create({
        data: {
          source: log.source, walletAddress: wallet(args.account), amount: money(args.amount),
          transactionHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber, createdAt: blockTimestamp,
        },
      });
      return;
    }
    case "PoolFunded":
    case "PoolWithdrawn":
    case "ParamsUpdated":
      // Protocol-level changes: the archived raw log in chain_event_logs is the record of truth.
      return;

    // ------------------------------------------------------------------ RecordNFT
    case "NFTMinted": {
      const recordId = id(args.recordId);
      const record = await tx.record.findUnique({ where: { id: recordId } });
      if (!record) throw new Error(`Cannot index NFTMinted before RecordSubmitted (record ${recordId})`);
      const status = nftStatusFor(record.status);
      await tx.nFT.upsert({
        where: { id: recordId },
        update: { ownerAddress: wallet(args.player), status, transactionHash: log.transactionHash, logIndex: log.logIndex, createdAt: blockTimestamp },
        create: { id: recordId, recordId, ownerAddress: wallet(args.player), status, transactionHash: log.transactionHash, logIndex: log.logIndex, createdAt: blockTimestamp },
      });
      return;
    }
    case "Transfer": {
      const tokenId = id(args.tokenId);
      const to = wallet(args.to);
      if (to === ZERO_ADDRESS) return;
      const record = await tx.record.findUnique({ where: { id: tokenId } });
      if (!record) throw new Error(`Cannot index NFT Transfer before RecordSubmitted (record ${tokenId})`);
      const status = nftStatusFor(record.status);
      await tx.nFT.upsert({
        where: { id: tokenId },
        update: { ownerAddress: to, status },
        create: { id: tokenId, recordId: tokenId, ownerAddress: to, status, transactionHash: log.transactionHash, logIndex: log.logIndex, createdAt: blockTimestamp },
      });
      return;
    }
    default:
      throw new Error(`No handler registered for ${log.eventName}`);
  }
}

export function eventPayload(log: IndexerLog) {
  // Events without inputs (ParamsUpdated) decode to an empty args object; never let
  // JSON.stringify(undefined) blow up the transaction that archives the log.
  const args = log.args ?? {};
  return JSON.parse(JSON.stringify(args, (_key, value) => (typeof value === "bigint" ? value.toString() : value))) as Prisma.InputJsonValue;
}
