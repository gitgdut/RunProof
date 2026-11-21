import { parseAbi } from "viem";

// Proposed event ABI only. Confirm every argument with the contract team before deployment.
export const runProofAbi = parseAbi([
  "event RecordSubmitted(bytes32 indexed recordId, address indexed playerAddress, string gameId, string gameMode, uint256 score, uint256 stakeAmount, bytes32 evidenceHash)",
  "event ChallengeCreated(bytes32 indexed challengeId, bytes32 indexed recordId, bytes32 indexed cheatId, address challenger, bytes32 evidenceHash)",
  "event VoteCommitted(bytes32 indexed challengeId, address indexed voterAddress, bytes32 commitHash, uint256 stakeAmount)",
  "event VotingFinalized(bytes32 indexed challengeId, bool challengeUpheld)",
  "event RecordVerified(bytes32 indexed recordId)",
  "event RecordRevoked(bytes32 indexed recordId)",
  "event RewardDistributed(bytes32 indexed rewardId, address indexed walletAddress, uint256 amount, uint8 rewardType, bytes32 relatedRecordId)",
]);
