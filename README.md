# RunProof — on-chain protocol (Monad)

Decentralized world-record certification for games. Players stake **native MON** on a score, the
community stakes MON to vote whether it is cheated. No ERC-20 is issued.

Target: Monad Testnet, chain id `10143`, native asset MON.

## Contracts (`src/`)

| Contract | Role |
|---|---|
| `GameRegistry` | Games + modes + game/rule versions. Seeds **Tetris (id 1)**: Classic=1, Sprint=2, Marathon=3 |
| `CheatRegistry` | Cheat IDs `C001..C005` (= uint `1..5`), community proposals for new cheats (75% + quorum) |
| `RunProofCore` | RecordRegistry + ChallengeManager + VotingManager + RewardDistributor merged (all MON custody in one place) |
| `RecordNFT` | ERC-721 certificate, `tokenId == recordId`, status read **live** from `RunProofCore` |

### Lifecycle
1. `submitRecord` → pays `submissionFee` (to reward pool) + tiered stake. Status **Provisional**, 30-day window.
2. No challenge in 30 days → anyone calls `finalizeRecord` → **Verified**, stake refunded (claimable).
3. `challengeRecord(recordId, cheatId, …)` + bond → one challenge per (record, cheat). Each challenge is its own vote.
4. Voting is **commit-reveal**: `commitVote(challengeId, hashVote(...))` (stake attached) → `revealVote` → `finalizeVoting`.
5. Outcomes: `Confirmed` (≥75% + quorum) → record **Revoked**, stake slashed · `Denied` (≥75% deny) → challenger bond slashed ·
   `Inconclusive` (no supermajority / low participation) → nothing forced, bond returned, record unchanged.
6. ~50:50 (within `nearTieBps`=5%) or low quorum → voting **extended once**; still tied → **Evidence Sufficiency round**
   (`Confirm` = Evidence Sufficient, `Deny` = Evidence Required). Sufficient ≥75% ⇒ Confirmed, otherwise Inconclusive (can be re-challenged with new evidence).
7. After the 30-day window a **special challenge** is possible on a Verified record (5× bond, new evidence hash required). Its reward is
   **reserved from the reward pool at creation** (`specialReward`) — never from the player's already-refunded stake.
8. `RecordNFT.mint(recordId)` for Verified records. If revoked later the NFT stays, `verificationStatus()` → `Revoked`.

### Key rules / formulas
- Stake tier (default, MON): score <10k: 0.05 · <100k: 0.2 · <1M: 1 · else 5. ×2 if score beats the *verified* top of that game+mode
  (`requiredStake`, `requiredPayment` views). Evidence hash can't be reused.
- Voting power = `stake / 1e15` (1 MON = 1000), stake per vote ∈ [0.05, 5] MON ⇒ per-address power cap 5000. One vote per address per round;
  player and challenger can't vote. Quorum: total revealed power ≥ 300 **and** ≥ 3 revealed voters.
- Wrong or unrevealed votes lose 30% of stake (rounded up per voter); winners split the slashed amount pro-rata by power, plus the voter share.
- Confirmed (normal): player stake → 40% challenger / 40% correct voters / 20% pool; challenger bond returned.
  Denied: bond → 50% player compensation / 50% deny voters.
- All payouts are credited to `claimable[addr]`; money leaves only via `withdraw()` (pull, nonReentrant). Owner's `withdrawPool` only touches *unreserved* pool.
- Defaults are in `RunProofCore` constructor and tunable by owner via `setParams` / `setStakeTiers`.

### Frontend/backend contract (ABI in `abi/`, regenerate with `script/exportAbi.sh`)
Events (indexed fields first; all carry recordId / cheatId / wallet): `RecordSubmitted, ChallengeCreated, EvidenceSubmitted, VoteCommitted,
VoteRevealed, VotingExtended, EvidenceVotingStarted, VotingFinalized, RecordVerified, RecordRevoked, StakeReturned, StakeSlashed,
RewardDistributed` (RunProofCore) and `NFTMinted` (RecordNFT).
Enums: `RecordStatus {None,Provisional,Verified,Revoked}`, `ChallengeStatus {None,Voting,EvidenceVoting,Confirmed,Denied,Inconclusive}`, `Choice {None,Confirm,Deny}`.
Commitment: `hashVote(challengeId, round, choice, salt, voter)` — use the view (round = `getChallenge(id).round`).

## Build / test
```
git submodule update --init --recursive
forge build
forge test -vv
```

## Deploy (Monad Testnet)
```
cp .env.example .env      # fill PRIVATE_KEY (never commit it); .env is git-ignored
source .env
POOL_SEED=2000000000000000000 DEMO_PERIODS=1 \
forge script script/Deploy.s.sol --rpc-url $MONAD_RPC_URL --private-key $PRIVATE_KEY --broadcast
```
`DEMO_PERIODS=1` sets 10 min window / 2 min commit / 2 min reveal so the whole loop can be demoed live; omit it for production values.
`POOL_SEED` (wei) pre-funds the reward pool (needed for special challenges). Addresses are printed and stored in `broadcast/`;
record them in `deployments/monad-testnet.json` (not yet deployed — requires a funded key).

Verify (source publication is a deliberate step — nothing is verified automatically). Pre-checks done on 2026-11-21:
Sourcify serves chain 10143 (Monad Testnet) and its **v2** API answers (`GET https://sourcify.dev/server/v2/contract/10143/<addr>`);
the legacy v1 API was removed, so confirm your `forge` version speaks v2 (forge 1.8.4 was installed here; not yet exercised).
The deployed bytecode of all four contracts was compared byte-for-byte with the local build: identical apart from immutable slots.
```
forge verify-contract <ADDR> src/RunProofCore.sol:RunProofCore --chain 10143 --verifier sourcify \
  --constructor-args $(cast abi-encode "constructor(address,address,address)" $OWNER $GAMES $CHEATS)
# GameRegistry / CheatRegistry: constructor(address owner)   RecordNFT: constructor(address core)
```
Explorer: https://testnet.monadexplorer.com (redirects to monadvision). The explorer may need its own API key for Etherscan-style verification.

## Interaction examples
```
cast call $CORE "requiredPayment(uint256,uint256,uint256)(uint256)" 1 1 50000 --rpc-url $MONAD_RPC_URL
cast send $CORE "submitRecord(uint256,uint256,uint256,bytes32,string)" 1 1 50000 $(cast keccak "replay") "ipfs://..." \
  --value <requiredPayment> --rpc-url $MONAD_RPC_URL --private-key $PRIVATE_KEY
cast send $CORE "challengeRecord(uint256,uint256,bytes32,string)" 1 1 $(cast keccak "proof") "ipfs://..." --value 0.1ether ...
H=$(cast call $CORE "hashVote(uint256,uint8,uint8,bytes32,address)(bytes32)" 1 0 1 $SALT $ME)   # choice 1=Confirm 2=Deny
cast send $CORE "commitVote(uint256,bytes32)" 1 $H --value 1ether ...
cast send $CORE "revealVote(uint256,uint8,bytes32)" 1 1 $SALT ...          # after commitEnd
cast send $CORE "finalizeVoting(uint256)" 1 ...                            # after revealEnd
cast send $CORE "claimVote(uint256,uint8)" 1 0 ... && cast send $CORE "withdraw()" ...
cast send $NFT "mint(uint256)" 1 ...
```

## Known limitations (v1)
Sybil resistance is economic only (linear power, capped stake); the owner can tune parameters (use a multisig); `verifiedTop` is not
rolled back when a record is revoked; cheat-proposal voting is stake-weighted but not commit-reveal. Not audited.
