# RunProof — universal on-chain achievement rankings

RunProof lets anyone submit a measurable achievement with evidence, stake native MON, and enter a
community-verified ranking. Games are one use case; categories can also represent sports, fitness,
competitions, learning milestones, or any result expressible as an unsigned integer.

Target: Monad Testnet, chain ID `10143`, native asset MON. No ERC-20 is issued.

## Contracts

| Contract | Role |
|---|---|
| `CategoryRegistry` | Categories, divisions, units, rule versions, base stakes, and ranking direction |
| `ChallengeReasonRegistry` | Generic challenge reasons `R001...`, including community proposals |
| `RunProofCore` | Submissions, current leaders, challenges, commit-reveal voting, and MON settlement |
| `RecordNFT` | ERC-721 certificate; `tokenId == recordId` and verification status is read live |

The deploy script seeds three examples:

1. 100m Sprint — milliseconds, lower is better, Open division.
2. Pull-ups — repetitions, higher is better, Open division.
3. Tetris Score — points, higher is better, three divisions.

These are deployment data, not hard-coded protocol rules.

## Ranking model

- Every submission stores its category, division, normalized integer value, evidence hash, evidence
  URI, rule version, status, and stake on-chain.
- Each category declares `HigherIsBetter` or `LowerIsBetter`. Equal values are ordered by earlier
  submission time, then lower `recordId`.
- The contract maintains `bestRecordId(categoryId, divisionId)` with a lazy-cleaned heap. If a leader
  is revoked, the next verified result becomes leader in the same transaction.
- Full rankings are derived from contract events. An indexer must sort only `Verified` submissions
  using the category rule; on-chain state remains the source of truth.
- `Provisional` submissions may be displayed separately but must not be mixed into verified rankings.

## Lifecycle

1. `submitRecord` pays the submission fee plus the category's base stake. A prospective new leader
   uses `leaderMultiplierBps` (2x by default).
2. With no challenge during the window, anyone calls `finalizeRecord`; the result becomes Verified
   and the submitter's stake becomes claimable.
3. `challengeRecord(recordId, reasonId, ...)` starts one challenge per record/reason pair.
4. Voters use commit-reveal: `commitVote` with MON, then `revealVote` after `commitEnd`.
5. Confirmed invalidity revokes the record and distributes the slash. A denied challenge compensates
   the submitter and correct voters. Inconclusive results return the challenge bond.
6. Near ties or low participation extend once and may enter an Evidence Sufficiency round.
7. Verified results can be challenged later with a 5x bond; rewards are reserved from the pool.
8. All payouts accumulate in `claimable`; users pull funds with `withdraw()`.
9. Anyone may call `RecordNFT.mint(recordId)` for a Verified result. Later revocation does not burn it.

See the [frontend/backend integration guide](docs/INTEGRATION.md) for ABI usage and indexing rules.

## Build and test

```bash
git submodule update --init --recursive
forge build
forge test -vv
```

Regenerate ABI files after every public interface change:

```bash
script/exportAbi.sh
```

## Deploy

```bash
cp .env.example .env
source .env
POOL_SEED=2000000000000000000 DEMO_PERIODS=1 \
forge script script/Deploy.s.sol --rpc-url "$MONAD_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast
```

`DEMO_PERIODS=1` uses a 10-minute challenge window and 2-minute commit/reveal/extension periods.
Without it, defaults are 30 days / 3 days / 1 day / 2 days.

V2 was deployed to Monad Testnet with demo periods on 2026-11-21. Its addresses and deployment
transactions are in `deployments/monad-testnet-v2.json`. The previous game-specific deployment is
preserved in `deployments/monad-testnet-v1.json` and must not be used with the V2 ABI.

Source verification is pending explicit approval to upload the public sources and compiler metadata
to the multi-explorer verification service. Verification must finish before initializing the indexer.

## Demo scripts

After a V2 demo deployment, export `CORE` and `NFT`, then run:

```bash
script/demo_loop.sh
script/demo_tie.sh
```

The scripts submit results, challenge them, run voting, settle funds, and mint a certificate.

## Known limitations

- Full rankings require an event indexer; the contract exposes the authoritative current leader.
- Category creation and configuration are owner-managed in V2. Use a multisig in production.
- Ranking direction, unit, and decimals are immutable after category creation. Rule metadata and
  base stake can be versioned by the owner.
- Sybil resistance is economic: voting power is linear and per-wallet vote stake is capped.
- Challenge-reason proposal voting is stake weighted but not commit-reveal.
- The contracts have not been externally audited.
