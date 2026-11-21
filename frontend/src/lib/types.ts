export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export enum RecordStatus {
  None = 0,
  Provisional = 1,
  Verified = 2,
  Revoked = 3,
}

export enum ChallengeStatus {
  None = 0,
  Voting = 1,
  EvidenceVoting = 2,
  Confirmed = 3,
  Denied = 4,
  Inconclusive = 5,
}

export enum Choice {
  None = 0,
  Confirm = 1,
  Deny = 2,
}

export enum RankingDirection {
  None = 0,
  HigherIsBetter = 1,
  LowerIsBetter = 2,
}

export enum ProposalStatus {
  None = 0,
  Voting = 1,
  Approved = 2,
  Rejected = 3,
  Inconclusive = 4,
}

export interface DivisionInfo {
  divisionId: bigint;
  name: string;
  active: boolean;
}

export interface CategoryInfo {
  categoryId: bigint;
  name: string;
  descriptionURI: string;
  unit: string;
  decimals: number;
  direction: RankingDirection;
  ruleVersion: number;
  baseStake: bigint;
  active: boolean;
  divisions: DivisionInfo[];
}

export interface ChallengeReasonInfo {
  reasonId: bigint;
  code: string;
  name: string;
  description: string;
  discoverer: Address;
  registeredAt: bigint;
  registered: boolean;
}

export interface ReasonProposalInfo {
  proposalId: bigint;
  proposer: Address;
  name: string;
  description: string;
  evidenceURI: string;
  bond: bigint;
  endTime: bigint;
  forPower: bigint;
  againstPower: bigint;
  voters: number;
  status: ProposalStatus;
  reasonId: bigint;
}

export interface RecordItem {
  recordId: bigint;
  player: Address;
  categoryId: bigint;
  divisionId: bigint;
  value: bigint;
  displayValue?: string;
  direction: RankingDirection;
  evidenceHash: Hex;
  evidenceURI: string;
  stake: bigint;
  submittedAt: bigint;
  deadline: bigint;
  ruleVersion: number;
  status: RecordStatus;
  stakeSettled: boolean;
  activeChallenges: number;
  txHash?: Hex;
}

export interface RoundInfo {
  challengeId: bigint;
  round: number;
  commitEnd: bigint;
  revealEnd: bigint;
  confirmPower: bigint;
  denyPower: bigint;
  confirmStake: bigint;
  denyStake: bigint;
  committedStake: bigint;
  committedVoters: number;
  revealedVoters: number;
  finalized: boolean;
  winner: Choice;
  winnerPower: bigint;
  rewardPool: bigint;
  slashBps: number;
}

export interface UserVoteState {
  commitment: Hex;
  stake: bigint;
  choice: Choice;
  revealed: boolean;
  claimed: boolean;
}

export interface ChallengeItem {
  challengeId: bigint;
  recordId: bigint;
  reasonId: bigint;
  challenger: Address;
  bond: bigint;
  reserved: bigint;
  evidenceHash: Hex;
  evidenceURI: string;
  createdAt: bigint;
  status: ChallengeStatus;
  round: number;
  special: boolean;
  extended: boolean;
  evidenceCount: number;
  round0?: RoundInfo;
  round1?: RoundInfo;
}

export interface CoreParams {
  submissionFee: bigint;
  challengeBond: bigint;
  specialBondMultiplier: bigint;
  specialReward: bigint;
  minVoteStake: bigint;
  maxVoteStake: bigint;
  quorumPower: bigint;
  leaderMultiplierBps: bigint;
  minVoters: number;
  challengeWindow: bigint;
  commitPeriod: bigint;
  revealPeriod: bigint;
  extensionPeriod: bigint;
  approvalBps: number;
  nearTieBps: number;
  wrongSlashBps: number;
  challengerRewardBps: number;
  voterRewardBps: number;
  playerCompBps: number;
}

export interface ReasonRegistryConfig {
  proposalBond: bigint;
  proposerReward: bigint;
  votingPeriod: bigint;
  minVoteStake: bigint;
  maxVoteStake: bigint;
  quorumPower: bigint;
  minVoters: number;
  approvalBps: number;
  rewardBalance: bigint;
}

export interface RecordNftStatus {
  recordId: bigint;
  minted: boolean;
  owner?: Address;
  status?: RecordStatus;
}

export interface LocalVoteSalt {
  chainId: number;
  core: Address;
  challengeId: string;
  round: number;
  choice: Choice;
  salt: Hex;
  voter: Address;
  stakeWei: string;
  savedAt: number;
}

export interface BackendHealth {
  online: boolean;
  latestIndexedBlock?: string;
  lagBlocks?: number;
  reconciled?: boolean;
  version?: string;
  message?: string;
}
