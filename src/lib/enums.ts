/** Canonical chain enum names. Numbers come from the contracts; names are for API output. */

const recordStatusNames = ["None", "Provisional", "Verified", "Revoked"] as const;
const challengeStatusNames = ["None", "Voting", "EvidenceVoting", "Confirmed", "Denied", "Inconclusive"] as const;
const proposalStatusNames = ["None", "Voting", "Approved", "Rejected", "Inconclusive"] as const;
const choiceNames = ["None", "Confirm", "Deny"] as const;
const directionNames = ["None", "HigherIsBetter", "LowerIsBetter"] as const;
const stakeKindNames = ["PlayerStake", "ChallengeBond", "VoterStake"] as const;
const rewardKindNames = ["ChallengerReward", "PlayerCompensation", "VoterReward"] as const;

const name = (names: readonly string[], value: number | null | undefined) =>
  value === null || value === undefined ? null : (names[value] ?? `Unknown(${value})`);

export const recordStatusName = (value: number) => name(recordStatusNames, value);
export const challengeStatusName = (value: number) => name(challengeStatusNames, value);
export const proposalStatusName = (value: number) => name(proposalStatusNames, value);
export const choiceName = (value: number | null) => name(choiceNames, value);
export const directionName = (value: number) => name(directionNames, value);
export const stakeKindName = (value: number) => name(stakeKindNames, value);
export const rewardKindName = (value: number | null) => name(rewardKindNames, value);

export const RECORD_STATUS = { NONE: 0, PROVISIONAL: 1, VERIFIED: 2, REVOKED: 3 } as const;
export const CHALLENGE_STATUS = { NONE: 0, VOTING: 1, EVIDENCE_VOTING: 2, CONFIRMED: 3, DENIED: 4, INCONCLUSIVE: 5 } as const;
export const CHOICE = { NONE: 0, CONFIRM: 1, DENY: 2 } as const;

/** Accepts either the numeric value or its name, so query strings can use `status=Verified`. */
export function parseRecordStatus(value: string): number | undefined {
  if (/^\d+$/.test(value)) return Number(value);
  const index = recordStatusNames.findIndex((item) => item.toLowerCase() === value.toLowerCase());
  return index === -1 ? undefined : index;
}

export function parseChallengeStatus(value: string): number | undefined {
  if (/^\d+$/.test(value)) return Number(value);
  const index = challengeStatusNames.findIndex((item) => item.toLowerCase() === value.toLowerCase());
  return index === -1 ? undefined : index;
}
