# RunProof — universal on-chain achievement rankings

**Any measurable result, ranked on-chain, with the ranking itself computed by a contract and disputes
settled by stake-weighted voting.** Not a game leaderboard: Minecraft speedruns, click speed, pull-ups,
exam scores — anything expressible as an integer.

Status: deployed on **Monad Testnet (chain `10143`)**, source verified **4/4 perfect** on MonadVision,
**32/32 tests passing**.

**Live links**

- Leaderboard (live, reads the chain in your browser): https://gitgdut.github.io/RunProof/
- 4-minute walkthrough (silent, captioned scenes): https://gitgdut.github.io/RunProof/record.html
- Demo video: _to be added_
- Contracts: see the table below (all verified on `testnet.monadexplorer.com`)

> **中文简介**
> RunProof 把「成绩 + 证据 + 判定过程」全部放到链上：管理员只开分类（定单位、定越高越好还是越低越好），
> 任何人都能提交成绩并质押 MON，过了挑战期自动认证；有人质疑就进入 Commit-Reveal 匿名投票。
> 榜首由合约维护（`bestRecordId`），成绩被撤销时**同一笔交易内**自动回退到下一名 Verified，
> 不需要管理员改榜。已跑通：一条伪造成绩登顶后被社区 80% 投票撤销，榜首自动回退。

---

## Why

Every leaderboard today is owned by a platform that is both referee and interested party. A record can
be deleted, a claim of cheating can be made with no evidence trail, and no two platforms recognise each
other's results. RunProof moves the ranking rule, the evidence, and the adjudication onto a chain so the
result is auditable by anyone.

## How it works

1. **Admins only create categories** — unit, `HigherIsBetter` / `LowerIsBetter`, decimals, base stake,
   and rule version. Direction, unit, and decimals are immutable after creation.
2. **Anyone submits** — the value is normalised to an integer (19:12.345 → `1152345` ms) with an evidence
   hash and URI, plus a MON stake. Beating the current leader requires a higher stake
   (`leaderMultiplierBps`).
3. **Challenge window** — no challenge means anyone can `finalizeRecord`, and the record becomes Verified.
4. **Disputes** — `challengeRecord` opens a commit-reveal vote (commit hash first, reveal later, so nobody
   can follow the crowd). Confirmed invalidity revokes the record and settles slashes and rewards.
5. **Authoritative leader** — `bestRecordId(categoryId, divisionId)` is maintained by a lazy-cleaned heap.
   If the leader is revoked, the next Verified record becomes leader **in the same transaction**.
6. **Certificates** — Verified records can mint an NFT (`tokenId == recordId`), always minted to the
   submitter. Revocation does not burn it; the live status simply becomes `Revoked`.

## Live demo

The full V2 interface supports wallet connection, record submission, voting, user profiles, and direct
Monad Testnet reads:

```bash
cd frontend
npm install
npm run dev
```

The repository also includes a build-free read-only fallback:

```bash
python3 -m http.server 8787        # from the repo root
# open http://127.0.0.1:8787/web/demo.html
```

A single-file, build-free page (viem + public RPC). It rebuilds the board from `RecordSubmitted` logs,
sorts by the category rule, and shows on every refresh whether the local first place still matches the
chain's `bestRecordId`.

### What is already on chain

| Category | Division | Leader | Rule |
|---|---|---|---|
| `Minecraft Any%` | Java | 19:12.345 (`1152345` ms) | lower is better |
| `Minecraft Any%` | Bedrock | 20:00.345 (`1200345` ms) | lower is better |
| `Click Speed` | All | 14.32 (`1432` cps) | higher is better, 2 decimals |

- `recordId` 1–8 are Verified
- `recordId` 9 — a fake `18:59.999` — took the top spot, was challenged, voted down with confirm power
  **400 vs deny 100 (80%)**, and revoked; `bestRecordId(4,1)` fell back to `recordId` 1 in the same
  transaction
- Voters who were right: `0.1` → `0.2075` MON. The voter who lied kept `0.007`. The challenger:
  `0.42` → `1.31` MON
- `RecordNFT` #1 `Verified`; #9 still owned by its submitter but reports `Revoked`

Demo periods are shortened on-chain so the whole flow runs in about 2.5 minutes
(window 60s / commit 30s / reveal 30s / extension 30s).

## Contracts (Monad Testnet, `10143`)

| Contract | Address | Role |
|---|---|---|
| `CategoryRegistry` | `0x8D3aEdd92fA2151F61877D0e844a556E4eAB91A7` | Categories, divisions, units, rule versions, base stakes, direction |
| `ChallengeReasonRegistry` | `0x522d2883FA6ac437F414874B9B7cEEAfAE4caC0b` | Generic challenge reasons, including community proposals |
| `RunProofCore` | `0x1eb96bf618151adA2F7174CE9b8c41F45486084F` | Submissions, leaders, challenges, commit-reveal voting, MON settlement |
| `RecordNFT` | `0x967D0B53cb05BC9D6c85BEB087444e6f5a3e1360` | ERC-721 certificate; verification status read live |

All four are **verified (perfect match) on Sourcify / MonadVision** — open any address on
`testnet.monadexplorer.com` and the source is readable. Deployment block `81509823`; addresses,
transactions, constructor arguments, and demo evidence are recorded in
[`deployments/monad-testnet-v2.json`](deployments/monad-testnet-v2.json). The previous game-specific
deployment is preserved in `monad-testnet-v1.json` and must not be used with the V2 ABI.

## Ranking model

- Every submission stores category, division, normalised integer value, evidence hash, evidence URI,
  rule version, status, and stake on-chain.
- Each category declares `HigherIsBetter` or `LowerIsBetter`. Equal values are ordered by earlier
  submission time, then lower `recordId`.
- `bestRecordId(categoryId, divisionId)` is the authoritative leader, kept with a lazy-cleaned heap.
- Full rankings are derived from events; only `Verified` records belong in the official board.
  `Provisional` may be shown separately and must not be mixed in.
- Ranking direction, unit, and decimals are immutable per category so historical results keep their
  meaning; rule content changes bump `ruleVersion`.

## Lifecycle

1. `submitRecord` pays the submission fee plus the category base stake; a prospective new leader pays a
   multiplied stake.
2. No challenge during the window → anyone calls `finalizeRecord`, status becomes Verified, stake becomes
   claimable.
3. `challengeRecord(recordId, reasonId, …)` opens one challenge per record/reason pair.
4. Voters `commitVote` with MON, then `revealVote` after `commitEnd`. Unrevealed or wrong-side votes are
   slashed.
5. Confirmed → record revoked, slash distributed. Denied → submitter and correct voters compensated.
   Inconclusive → bond returned, record stays.
6. Near ties or low participation extend once and may enter an Evidence Sufficiency round.
7. Verified records can still be challenged later with a multiplied bond, funded from the pool.
8. All payouts accrue in `claimable`; users pull funds with `withdraw()`.
9. `RecordNFT.mint(recordId)` is permissionless for Verified records, but always mints to the submitter.

## Build and test

```bash
git submodule update --init --recursive
forge build
forge test -vv
```

31 functional tests plus an invariant suite (solvency, reserved ≤ pool, `activeChallenges`
consistency) — **32/32 passing**, 120 invariant runs / 9,600 handler calls / 0 reverts.

```bash
script/exportAbi.sh     # regenerate abi/*.json after any public interface change
```

## Deploy

```bash
cp .env.example .env
source .env
POOL_SEED=2000000000000000000 DEMO_PERIODS=1 \
forge script script/Deploy.s.sol --rpc-url "$MONAD_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast
```

`DEMO_PERIODS=1` uses a 10-minute window and 2-minute commit/reveal/extension periods; defaults without it
are 30 days / 3 days / 1 day / 2 days. `PRIVATE_KEY` may be given with or without a `0x` prefix.

## Docs

| File | What it covers |
|---|---|
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | ABI usage, enums, struct layouts, user flows, frontend button conditions |
| [`docs/BACKEND-HANDOFF.md`](docs/BACKEND-HANDOFF.md) | Indexer spec, event list, API contract, V1→V2 migration table |
| [`docs/DEMO.md`](docs/DEMO.md) | Recording checklist and demo data |
| [`docs/DEMO-VOICEOVER.md`](docs/DEMO-VOICEOVER.md) | Word-for-word 5-minute narration |
| [`docs/SUBMISSION.md`](docs/SUBMISSION.md) | One-page project summary |

## Roadmap

1. **Indexer + public API** — full boards from events, endpoints for categories, records, challenges,
   voting, and user balances, reconciled against `bestRecordId` every round.
2. **Frontend** — wallet connect, submit, challenge, commit-reveal vote (with salt persistence across
   reloads), leaderboards, user dashboard.
3. **Governance** — category creation and parameter changes move to a multisig, then to stake-weighted
   governance.
4. **Mainnet** — Monad mainnet with real events and fitness integrations.

## Known limitations

- Full rankings require an event indexer; the contract exposes only the authoritative current leader.
- Category creation and configuration are owner-managed in this version — use a multisig in production.
- Sybil resistance is economic: voting power is linear and per-wallet vote stake is capped.
- Challenge-reason proposal voting is stake-weighted but not commit-reveal.
- The contracts have not been externally audited.
