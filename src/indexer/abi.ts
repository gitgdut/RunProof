import type { Abi, AbiEvent } from "viem";
import coreArtifact from "../../abi/RunProofCore.json";
import cheatArtifact from "../../abi/CheatRegistry.json";
import gameArtifact from "../../abi/GameRegistry.json";
import nftArtifact from "../../abi/RecordNFT.json";

export const coreAbi = coreArtifact as unknown as Abi;
export const cheatRegistryAbi = cheatArtifact as unknown as Abi;
export const gameRegistryAbi = gameArtifact as unknown as Abi;
export const recordNftAbi = nftArtifact as unknown as Abi;

function selectedEvents(abi: Abi, names: string[]): AbiEvent[] {
  return abi.filter((item): item is AbiEvent => item.type === "event" && names.includes(item.name ?? ""));
}

const coreEvents = selectedEvents(coreAbi, [
  "RecordSubmitted",
  "ChallengeCreated",
  "EvidenceSubmitted",
  "VoteCommitted",
  "VoteRevealed",
  "VotingExtended",
  "EvidenceVotingStarted",
  "VotingFinalized",
  "RecordVerified",
  "RecordRevoked",
  "RewardDistributed",
  "StakeReturned",
  "StakeSlashed",
]);
const cheatEvents = selectedEvents(cheatRegistryAbi, ["CheatRegistered"]);
const gameEvents = selectedEvents(gameRegistryAbi, [
  "GameRegistered",
  "GameVersionUpdated",
  "GameActiveSet",
  "ModeRegistered",
  "ModeActiveSet",
]);
const nftEvents = selectedEvents(recordNftAbi, ["NFTMinted", "Transfer"]);

export const indexedEvents = [...coreEvents, ...cheatEvents, ...gameEvents, ...nftEvents];
