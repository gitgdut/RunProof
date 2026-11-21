# RunProof 后端

按 **V2 合约模型**（Category / Division / ChallengeReason）把链上事件索引成数据库，并对外提供只读 REST API。排名以链上为准（`bestRecordId`），数据库负责完整榜单与历史；两者每轮同步对账。

- 网络：Monad Testnet（Chain ID `10143`）
- 起始区块：`81509823`
- 后端**不签名、不代发交易**，`POST /api/records` 只返回未签名的 `submitRecord` 调用参数

## 快速演示（无需数据库）

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

默认 `DATA_MODE=mock`，内置与链上演示一致的 5 个分类、9 条成绩、1 个已确认挑战：

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/categories
curl "http://localhost:3000/api/leaderboard?categoryId=4&divisionId=1"
curl "http://localhost:3000/api/records?categoryId=4&divisionId=1&status=Verified"
curl http://localhost:3000/api/reasons
```

## PostgreSQL 模式

```bash
docker compose up -d
cp .env.example .env.local   # 把 DATA_MODE 改成 prisma
pnpm db:deploy
pnpm db:seed
pnpm dev
```

> `prisma/migrations/202611211500_v2_categories` 会用 V2 表结构替换 V1（`games`/`cheats`），开头是 `DROP TABLE ... CASCADE`，只适用于还没有生产数据的阶段。

## 合约

| 合约 | 环境变量 | 地址 |
| --- | --- | --- |
| RunProofCore | `RUNPROOF_CORE_ADDRESS` | `0x1eb96bf618151adA2F7174CE9b8c41F45486084F` |
| CategoryRegistry | `CATEGORY_REGISTRY_ADDRESS` | `0x8D3aEdd92fA2151F61877D0e844a556E4eAB91A7` |
| ChallengeReasonRegistry | `CHALLENGE_REASON_REGISTRY_ADDRESS` | `0x522d2883FA6ac437F414874B9B7cEEAfAE4caC0b` |
| RecordNFT | `RECORD_NFT_ADDRESS` | `0x967D0B53cb05BC9D6c85BEB087444e6f5a3e1360` |

枚举按链上数值存储，不做本地翻译：`RecordStatus` 0 None / 1 Provisional / 2 Verified / 3 Revoked；`ChallengeStatus` 0–5；`Choice` 0 None / 1 Confirm / 2 Deny；`direction` 1 HigherIsBetter / 2 LowerIsBetter；`StakeKind`/`SlashKind` 0–2；`RewardKind` 0–2。API 同时返回数值（`statusCode`）与名称（`status`）。

### ABI 与合约的职责边界

合约不归后端维护。`abi/*.json` 的**准绳是合约团队的产物**，本仓库里的副本只用于"对齐"：读事件、读 view、拼未签名交易。后端不改合约、不发布合约、也不代签交易。

当前 `origin/contracts/core` 发布的仍是 V1（`CheatRegistry/GameRegistry`），没有 V2 的 ABI 文件，所以这份副本是依据 `BACKEND-HANDOFF.md` 的签名重建、并逐项对真实链校验过的：

```bash
pnpm abi:gen     # 从 scripts/gen-abi.ts 的声明生成 abi/*.json
pnpm abi:check   # 用生成的 JSON 真调链：getRecord / getCategory / getReason / rounds / votes / params / bestRecordId / requiredPayment / claimable
```

2026-11-21 实测：`getRecord(1)` = category 4 / division 1 / value 1152345 / direction 2 / Verified；`getCategory(1)` = 100m Sprint / ms / LowerIsBetter；`getReason(1)` = R001 Fabricated Evidence；`params()` 中 `minVoters=3`、`quorumPower=300`、`approvalBps=7500`、`wrongSlashBps=3000`。从部署块起 300 个区块解出 91 条日志、19 类事件。

契约细节里最容易写错的两点已在 `src/indexer/reads.ts` 处理：`getRecord`/`getCategory`/`getReason` 返回**单个 tuple（带外层 offset）**，`rounds`/`votes`/`params` 返回**扁平多值且无命名**（只按下标取）。

**合约团队发布正式 ABI 或重新部署时，后端只需三步**（不改任何业务代码）：

1. 用官方 `abi/*.json` 覆盖本仓库同名文件；
2. 更新 `.env` 的四个地址与 `INDEXER_START_BLOCK`；
3. `pnpm abi:check` 核对只读方法，再 `INDEXER_ONCE=true pnpm indexer` 回放，最后看 `/api/health` 的 `lastReconcile.ok`。

只有事件的**语义**变了（字段增减、枚举重排）才需要改 `src/indexer/handlers.ts`；纯签名补充不用。

## 索引器

## 索引器

```bash
pnpm indexer                     # 持续同步
INDEXER_ONCE=true pnpm indexer    # 单次同步，适合定时任务
pnpm indexer:verify               # 校验最近 1000 块的链上日志与归档表
pnpm indexer:probe                # 不连数据库，只看 RPC 与事件解码
```

同步 4 个合约、30 类事件：`CategoryCreated/Updated/ActiveSet`、`DivisionCreated/ActiveSet`、`ReasonRegistered/Proposed/ProposalVoted/ProposalFinalized/DiscovererRewarded`、`RecordSubmitted/Verified/Revoked`、`LeaderboardUpdated`、`ChallengeCreated`、`EvidenceSubmitted`、`VoteCommitted/Revealed`、`VotingExtended`、`EvidenceVotingStarted`、`VotingFinalized`、`StakeReturned/Slashed`、`RewardDistributed`、`Withdrawn`、`PoolFunded/Withdrawn`、`ParamsUpdated`、`NFTMinted`、`Transfer`。

关键保证：

- **幂等**：`(chainId, txHash, logIndex)` 唯一；原始日志先落 `chain_event_logs`，事件处理与派生表写入在同一个事务里。
- **重组**：游标保存区块 Hash，启动时若已不在主链则抛 `ChainReorgError` 停止，等待人工对账。
- **对账**：每批事件后按链上 view 重写 Record / Challenge / Round / Vote；再对每个涉及的 `(categoryId, divisionId)` 读 `bestRecordId()` 与库内指针比对，不一致时以链上为准修正并写入 `reconcile_runs`。
- **分页**：公共 RPC 的 `eth_getLogs` 跨度上限约 100 块，默认窗口 100，被拒时自动折半（下限 10）。
- **轮次**：挑战升级到证据充分性投票时 round 0 静默结算（不发 `VotingFinalized`），因此对账覆盖 `0..当前轮`。

## 榜单规则

```
1. 只取 status = Verified(2)
2. direction = 1 → value DESC；direction = 2 → value ASC
3. 同值按 submittedAt 更早
4. 仍相同按 recordId 更小
```

排序方向读 `Record.direction`（提交时固化的快照），不读分类当前值。`displayValue` 由后端统一格式化：`1152345` + `ms` → `19:12.345`，`1432` + `cps`(2) → `14.32`。成绩撤销后立即可从榜单消失（软删 `status=3`，保留历史）。

## 验证

```bash
pnpm typecheck
pnpm test        # 34 个用例（25 个接口/格式化 + 9 个事件处理器）
pnpm build
pnpm abi:check   # 需要网络
```

## 目录

- `abi/`：V2 ABI（由 `pnpm abi:gen` 生成，勿手改）
- `prisma/`：Schema、迁移、Seed（V2 演示数据）
- `src/app/api/`：21 个只读 Route Handlers
- `src/indexer/`：ABI 筛选、配置、链上读取、事件处理、同步、校验
- `src/lib/`：响应封装、校验、枚举、格式化、链上只读调用、服务层
- `scripts/`：ABI 生成与链上校验、RPC 探针
- `src/test/`：接口与事件处理器测试
