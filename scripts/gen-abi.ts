/**
 * Generates abi/*.json for the V2 deployment.
 *
 * The contracts branch published so far still ships the V1 (Game/Cheat) ABI, so the
 * declarations below were reconstructed from the V2 handoff document and then verified
 * against real chain data:
 *   - every event signature here that has fired on chain produces the topic0 found in
 *     the logs of the four deployed contracts (scripts used during verification are
 *     gone; re-run `pnpm indexer:probe` to repeat the check)
 *   - getRecord / getCategory / getReason / rounds / votes / params / bestRecordId /
 *     requiredPayment / claimable are called with real arguments and decode correctly
 *
 * Re-run with `pnpm abi:gen` after the contract team publishes the official artifacts,
 * then diff against theirs and prefer theirs if anything differs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAbi } from "viem";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../abi");

const core = [
  // ---------------------------------------------------------------- events
  "event RecordSubmitted(uint256 indexed recordId, address indexed player, uint256 indexed categoryId, uint256 divisionId, uint256 value, uint256 stake, bytes32 evidenceHash, string evidenceURI, uint64 deadline)",
  "event RecordVerified(uint256 indexed recordId, address indexed player, uint256 indexed categoryId, uint256 value)",
  "event RecordRevoked(uint256 indexed recordId, address indexed player, uint256 indexed reasonId, uint256 challengeId)",
  "event LeaderboardUpdated(uint256 indexed categoryId, uint256 indexed divisionId, uint256 indexed bestRecordId, uint256 bestValue)",
  "event ChallengeCreated(uint256 indexed recordId, uint256 indexed reasonId, address indexed challenger, uint256 challengeId, uint256 bond, bool special, bytes32 evidenceHash, string evidenceURI, uint64 commitEnd)",
  "event EvidenceSubmitted(uint256 indexed recordId, uint256 indexed reasonId, address indexed submitter, uint256 challengeId, uint8 round, bytes32 evidenceHash, string evidenceURI)",
  "event VoteCommitted(uint256 indexed recordId, uint256 indexed reasonId, address indexed voter, uint256 challengeId, uint8 round, uint256 stake)",
  "event VoteRevealed(uint256 indexed recordId, uint256 indexed reasonId, address indexed voter, uint256 challengeId, uint8 round, uint8 choice, uint256 power)",
  "event VotingExtended(uint256 indexed recordId, uint256 indexed reasonId, uint256 challengeId, uint64 newCommitEnd, uint64 newRevealEnd)",
  "event EvidenceVotingStarted(uint256 indexed recordId, uint256 indexed reasonId, uint256 challengeId, uint64 commitEnd, uint64 revealEnd)",
  "event VotingFinalized(uint256 indexed recordId, uint256 indexed reasonId, uint256 challengeId, uint8 outcome, uint8 round, uint256 confirmPower, uint256 denyPower)",
  "event StakeReturned(uint256 indexed recordId, uint256 indexed reasonId, address indexed account, uint256 amount, uint8 kind)",
  "event StakeSlashed(uint256 indexed recordId, uint256 indexed reasonId, address indexed account, uint256 amount, uint8 kind, uint256 challengeId)",
  "event RewardDistributed(uint256 indexed recordId, uint256 indexed reasonId, address indexed account, uint256 amount, uint8 kind, uint256 challengeId)",
  "event Withdrawn(address indexed account, uint256 amount)",
  "event PoolFunded(address indexed from, uint256 amount)",
  "event PoolWithdrawn(address indexed to, uint256 amount)",
  "event ParamsUpdated()",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  // ---------------------------------------------------------------- reads
  "function bestRecordId(uint256 categoryId, uint256 divisionId) view returns (uint256)",
  "function getRecord(uint256 recordId) view returns ((address player, uint256 categoryId, uint256 divisionId, uint256 value, uint8 direction, bytes32 evidenceHash, string evidenceURI, uint256 stake, uint64 submittedAt, uint64 deadline, uint32 ruleVersion, uint8 status, bool stakeSettled, uint32 activeChallenges))",
  "function getChallenge(uint256 challengeId) view returns ((uint256 recordId, uint256 reasonId, address challenger, uint256 bond, uint256 reserved, bytes32 evidenceHash, string evidenceURI, uint64 createdAt, uint8 status, uint8 round, bool special, bool extended, uint32 evidenceCount))",
  "function rounds(uint256 challengeId, uint8 round) view returns (uint64 commitEnd, uint64 revealEnd, uint256 confirmPower, uint256 denyPower, uint256 confirmStake, uint256 denyStake, uint256 committedStake, uint32 committedVoters, uint32 revealedVoters, bool finalized, uint8 winner, uint256 winnerPower, uint256 rewardPool, uint16 slashBps)",
  "function votes(uint256 challengeId, uint8 round, address voter) view returns (bytes32 commitment, uint256 stake, uint8 choice, bool revealed, bool claimed)",
  "function recordSummary(uint256 recordId) view returns (address player, uint256 categoryId, uint256 divisionId, uint256 value, bytes32 evidenceHash, uint8 status)",
  "function params() view returns (uint256 submissionFee, uint256 challengeBond, uint256 specialBondMultiplier, uint256 specialReward, uint256 minVoteStake, uint256 maxVoteStake, uint256 quorumPower, uint256 powerUnit, uint32 minVoters, uint64 challengeWindow, uint64 commitPeriod, uint64 revealPeriod, uint64 extensionPeriod, uint16 approvalBps, uint16 nearTieBps, uint16 challengerRewardBps, uint16 voterRewardBps, uint16 playerCompBps, uint16 wrongSlashBps)",
  "function requiredPayment(uint256 categoryId, uint256 divisionId, uint256 value) view returns (uint256)",
  "function requiredStake(uint256 categoryId, uint256 divisionId, uint256 value) view returns (uint256)",
  "function claimable(address account) view returns (uint256)",
  "function recordCount() view returns (uint256)",
  "function challengeCount() view returns (uint256)",
  // write entry point, only used to build unsigned calldata for POST /api/records
  "function submitRecord(uint256 categoryId, uint256 divisionId, uint256 value, bytes32 evidenceHash, string evidenceURI) payable returns (uint256)",
];

const category = [
  "event CategoryCreated(uint256 indexed categoryId, string name, string unit, uint8 decimals, uint8 direction, uint32 ruleVersion, uint256 baseStake, string descriptionURI)",
  "event CategoryUpdated(uint256 indexed categoryId, string name, string unit, uint8 decimals, uint8 direction, uint32 ruleVersion, uint256 baseStake, string descriptionURI)",
  "event CategoryActiveSet(uint256 indexed categoryId, bool active)",
  "event DivisionCreated(uint256 indexed categoryId, uint256 indexed divisionId, string name)",
  "event DivisionActiveSet(uint256 indexed categoryId, uint256 indexed divisionId, bool active)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "function getCategory(uint256 categoryId) view returns ((string name, string descriptionURI, string unit, uint8 decimals, uint8 direction, uint32 ruleVersion, uint256 baseStake, bool active))",
  "function categoryCount() view returns (uint256)",
  "function divisionCount(uint256 categoryId) view returns (uint256)",
  "function isDivisionActive(uint256 categoryId, uint256 divisionId) view returns (bool)",
];

const reason = [
  "event ReasonRegistered(uint256 indexed reasonId, string code, string name, address indexed discoverer)",
  "event ReasonProposed(uint256 indexed proposalId, address indexed proposer, string name, uint256 bond, uint64 endTime)",
  "event ReasonProposalVoted(uint256 indexed proposalId, address indexed voter, bool support, uint256 stake, uint256 power)",
  "event ReasonProposalFinalized(uint256 indexed proposalId, uint8 status, uint256 reasonId)",
  "event DiscovererRewarded(uint256 indexed proposalId, uint256 indexed reasonId, address indexed proposer, uint256 amount)",
  "event RewardFunded(address indexed from, uint256 amount)",
  "event Withdrawn(address indexed account, uint256 amount)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "function getReason(uint256 reasonId) view returns ((string code, string name, string description, address discoverer, uint64 registeredAt, bool registered))",
  "function reasonCount() view returns (uint256)",
];

const nft = [
  "event NFTMinted(uint256 indexed recordId, address indexed player, uint256 indexed categoryId, uint256 value, bytes32 evidenceHash)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
  "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function verificationStatus(uint256 tokenId) view returns (uint8)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function core() view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

const artifacts: Record<string, string[]> = {
  RunProofCore: core,
  CategoryRegistry: category,
  ChallengeReasonRegistry: reason,
  RecordNFT: nft,
};

mkdirSync(outDir, { recursive: true });
for (const [name, declarations] of Object.entries(artifacts)) {
  const abi = parseAbi(declarations as unknown as readonly string[]);
  writeFileSync(resolve(outDir, `${name}.json`), `${JSON.stringify(abi, null, 2)}\n`, "utf8");
  console.log(`${name}.json`, abi.length, "items");
}
