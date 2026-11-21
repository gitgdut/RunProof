# RunProof Backend

**English** · [简体中文](README.zh-CN.md)

Indexes the RunProof V2 contracts (Category / Division / ChallengeReason) into PostgreSQL and serves a read-only REST API. The chain stays authoritative for ranking (`bestRecordId`); the database owns the full leaderboard and history, and both are reconciled on every sync.

- Network: Monad Testnet (Chain ID `10143`)
- Start block: `81509823`
- The backend **never signs or sends transactions**; `POST /api/records` only returns unsigned `submitRecord` calldata

## Quick start (no database needed)

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`DATA_MODE=mock` is the default and ships the same five categories, nine records and one confirmed challenge as the deployed demo:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/categories
curl "http://localhost:3000/api/leaderboard?categoryId=4&divisionId=1"
curl "http://localhost:3000/api/records?categoryId=4&divisionId=1&status=Verified"
curl http://localhost:3000/api/reasons
```

## PostgreSQL mode

```bash
docker compose up -d
cp .env.example .env.local   # set DATA_MODE=prisma
pnpm db:deploy
pnpm db:seed
pnpm dev
```

> `prisma/migrations/202611211500_v2_categories` replaces the V1 tables (`games` / `cheats`) and starts with `DROP TABLE ... CASCADE`. It is only safe before there is production data.

## Contracts

| Contract | Env var | Address |
| --- | --- | --- |
| RunProofCore | `RUNPROOF_CORE_ADDRESS` | `0x1eb96bf618151adA2F7174CE9b8c41F45486084F` |
| CategoryRegistry | `CATEGORY_REGISTRY_ADDRESS` | `0x8D3aEdd92fA2151F61877D0e844a556E4eAB91A7` |
| ChallengeReasonRegistry | `CHALLENGE_REASON_REGISTRY_ADDRESS` | `0x522d2883FA6ac437F414874B9B7cEEAfAE4caC0b` |
| RecordNFT | `RECORD_NFT_ADDRESS` | `0x967D0B53cb05BC9D6c85BEB087444e6f5a3e1360` |

Chain enums are stored as their numeric values, never translated locally: `RecordStatus` 0 None / 1 Provisional / 2 Verified / 3 Revoked; `ChallengeStatus` 0–5; `Choice` 0 None / 1 Confirm / 2 Deny; `direction` 1 HigherIsBetter / 2 LowerIsBetter; `StakeKind` / `SlashKind` 0–2; `RewardKind` 0–2. The API returns both the number (`statusCode`) and the name (`status`).

### ABI ownership

Contracts are not maintained in this repository. The authoritative `abi/*.json` are the contract team's artifacts; the copies here exist only so the backend can stay aligned (read events, read views, build unsigned transactions).

`origin/contracts/core` still publishes V1 (`CheatRegistry` / `GameRegistry`) without V2 ABIs, so these copies were rebuilt from the handover signatures and verified against the live chain:

```bash
pnpm abi:gen     # generate abi/*.json from the declarations in scripts/gen-abi.ts
pnpm abi:check   # call the live chain with the generated JSON: getRecord / getCategory / getReason / rounds / votes / params / bestRecordId / requiredPayment / claimable
```

Verified on 2026-11-21: `getRecord(1)` = category 4 / division 1 / value 1152345 / direction 2 / Verified; `getCategory(1)` = 100m Sprint / ms / LowerIsBetter; `getReason(1)` = R001 Fabricated Evidence; `params()` gives `minVoters=3`, `quorumPower=300`, `approvalBps=7500`, `wrongSlashBps=3000`. 91 logs across 19 event types decoded from 300 blocks after the deployment block.

Two easy-to-miss encoding details are handled in `src/indexer/reads.ts`: `getRecord` / `getCategory` / `getReason` return a **single tuple with an outer offset**, while `rounds` / `votes` / `params` return **flat unnamed values** (index access only).

**When the contract team publishes official ABIs or redeploys, the backend needs three steps** (no business-code change):

1. overwrite `abi/*.json` with the official files;
2. update the four addresses and `INDEXER_START_BLOCK` in `.env`;
3. run `pnpm abi:check`, then replay with `INDEXER_ONCE=true pnpm indexer`, then confirm `lastReconcile.ok` in `/api/health`.

Only a semantic change to an event (fields added/removed, enums reordered) requires touching `src/indexer/handlers.ts`.

## Indexer

```bash
pnpm indexer                     # continuous sync
INDEXER_ONCE=true pnpm indexer    # single pass, cron friendly
pnpm indexer:verify               # check the last 1000 blocks against the archive table
pnpm indexer:probe                # no database: just RPC + event decoding
```

Syncs four contracts and 30 event types: `CategoryCreated/Updated/ActiveSet`, `DivisionCreated/ActiveSet`, `ReasonRegistered/Proposed/ProposalVoted/ProposalFinalized/DiscovererRewarded`, `RecordSubmitted/Verified/Revoked`, `LeaderboardUpdated`, `ChallengeCreated`, `EvidenceSubmitted`, `VoteCommitted/Revealed`, `VotingExtended`, `EvidenceVotingStarted`, `VotingFinalized`, `StakeReturned/Slashed`, `RewardDistributed`, `Withdrawn`, `PoolFunded/Withdrawn`, `ParamsUpdated`, `NFTMinted`, `Transfer`.

Guarantees:

- **Idempotency**: `(chainId, txHash, logIndex)` is unique; the raw log is archived into `chain_event_logs` in the same transaction that writes the derived tables.
- **Reorgs**: the cursor stores the block hash; if it is no longer canonical on startup the indexer throws `ChainReorgError` and stops for manual reconciliation.
- **Reconciliation**: after each batch, records / challenges / rounds / votes are rewritten from the on-chain views, then every touched `(categoryId, divisionId)` compares `bestRecordId()` with the stored pointer — the chain wins, and mismatches are logged to `reconcile_runs`.
- **Paging**: the public RPC caps `eth_getLogs` at roughly 100 blocks; the default window is 100 and halves itself (down to 10) when a batch is rejected.
- **Rounds**: round 0 is settled silently when a challenge escalates to evidence voting (no `VotingFinalized`), so reconciliation covers rounds `0..current`.

## Leaderboard rules

```
1. status = Verified(2) only
2. direction = 1 → value DESC；direction = 2 → value ASC
3. ties: earlier submittedAt first
4. still tied: smaller recordId first
```

Ordering uses `Record.direction` (the snapshot taken at submission), not the category's current value. `displayValue` is formatted server-side: `1152345` + `ms` → `19:12.345`, `1432` + `cps`(2) → `14.32`. A revoked record disappears from the board immediately (soft delete, `status=3`, history kept).

## Verify

```bash
pnpm typecheck
pnpm test        # 34 cases (25 API/formatting + 9 event handlers)
pnpm build
pnpm abi:check   # needs network
```

## Layout

- `abi/` — V2 ABIs, generated by `pnpm abi:gen`; do not hand-edit
- `prisma/` — schema, migrations, seed (V2 demo data)
- `src/app/api/` — 21 read-only route handlers
- `src/indexer/` — ABI filtering, config, chain reads, event handlers, sync, verification
- `src/lib/` — response envelope, validation, enums, formatting, chain reads, services
- `scripts/` — ABI generation and chain verification, RPC probe
- `src/test/` — API and event-handler tests
