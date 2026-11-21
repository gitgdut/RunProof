# RunProof

RunProof 后端基于 Next.js Route Handlers、TypeScript、Prisma、PostgreSQL、Zod 和 Viem。数据库只保存索引与展示数据；质押金额、投票结果、罚没和 NFT 的最终状态一律以 Monad 上的合约为准。

本文档与 `abi/*.json`、合约团队提供的 `INTEGRATION.md` 保持一致（对接基线 commit `2ba9e3a`）。

## 快速演示（无需数据库）

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`.env.example` 默认 `DATA_MODE=mock`，服务启动后即可使用内置 Tetris 演示数据：

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/games
curl http://localhost:3000/api/records
curl http://localhost:3000/api/leaderboard
curl http://localhost:3000/api/voting
```

Mock 模式同样执行完整的 Zod 校验、EIP-191 签名验证和重复提交检查，不是绕过安全的静态响应。唯一的例外是 `/api/users/:address/claimable`，它必须真实读取链上 `claimable(address)`，没有 RPC 时返回 `503 CHAIN_NOT_CONFIGURED`。

## PostgreSQL 模式

需要 Docker 或已有 PostgreSQL 16：

```bash
docker compose up -d
cp .env.example .env.local
```

将 `.env.local` 中的 `DATA_MODE` 改为 `prisma`，然后执行：

```bash
pnpm db:deploy
pnpm db:seed
pnpm dev
```

数据库连接默认为 `postgresql://runproof:runproof@localhost:5432/runproof?schema=public`。生产环境必须更换数据库密码，且不要提交 `.env.local`。

> `prisma/migrations/202611210004_contract_alignment` 是贴合链上 ID 的重构迁移，开头包含 `DROP TABLE ... CASCADE`。它只适用于还没有生产数据的阶段；若目标库已有需要保留的数据，请先导出再迁移。

## 验证与构建

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

`pnpm test` 使用 Mock 数据源运行 18 个用例：11 个接口集成测试（健康检查、分页筛选、排行榜、投票汇总、签名写入、防重放、防伪造、作弊库权限）+ 7 个事件处理器测试（`StakeReturned` 缺少 `challengeId`、`RewardDistributed` 类型映射、`VotingFinalized` 结果、`RecordVerified` 联动 NFT、事件顺序校验）。

## 合约对接

Monad Testnet，Chain ID `10143`，RPC `https://testnet-rpc.monad.xyz`。ABI 已随仓库提交在 `abi/`，后端不再维护手写事件签名。

| 合约 | 环境变量 | 地址 |
| --- | --- | --- |
| RunProofCore | `RUNPROOF_CORE_ADDRESS` | `0x606717FC7055B81C4290b34F9cA1E8123416b0Ab` |
| CheatRegistry | `CHEAT_REGISTRY_ADDRESS` | `0xc0df0A2342557D42D35F34913EDB28E0792Ff400` |
| GameRegistry | `GAME_REGISTRY_ADDRESS` | `0x9906867e359F1C7d609f89f39beD4b15023601B0` |
| RecordNFT | `RECORD_NFT_ADDRESS` | `0x2bFb2e522e51A458b6317343ea6Ef8A5E454c6EE` |

重新部署后四个地址与 `INDEXER_START_BLOCK` 必须一起更新，否则索引器会读错合约或漏掉早期事件。

数据模型的取值严格对应链上枚举：

- `RecordStatus`：链上 0 None / 1 Provisional / 2 Verified / 3 Revoked → 库内 `PENDING`（仅 API 预登记）/ `PROVISIONAL` / `VERIFIED` / `REVOKED`
- `ChallengeStatus`：链上 0–5 → `PENDING` / `VOTING` / `EVIDENCE_VOTING` / `CONFIRMED` / `DENIED` / `INCONCLUSIVE`
- `Choice`：链上 1 Confirm / 2 Deny → `CONFIRM` / `DENY`；`round=1` 的证据充分性轮中二者语义分别是 Evidence Sufficient / Evidence Required
- `StakeKind` 与 `RewardKind` 分别落到 `StakeFlow.stakeKind` 与 `Reward.rewardType`
- 所有 `uint*` 在服务端以 `bigint`/十进制字符串处理，金额单位为 wei，时间为 Unix 秒转 `Date`

## Monad 事件索引器

索引器同时同步四个合约，覆盖 21 个事件：

- RunProofCore：`RecordSubmitted`、`ChallengeCreated`、`EvidenceSubmitted`、`VoteCommitted`、`VoteRevealed`、`VotingExtended`、`EvidenceVotingStarted`、`VotingFinalized`、`RecordVerified`、`RecordRevoked`、`RewardDistributed`、`StakeReturned`、`StakeSlashed`
- CheatRegistry：`CheatRegistered`
- GameRegistry：`GameRegistered`、`GameVersionUpdated`、`GameActiveSet`、`ModeRegistered`、`ModeActiveSet`
- RecordNFT：`NFTMinted`、`Transfer`

启用步骤：

1. 使用 `DATA_MODE=prisma`，先完成 Migration 与 Seed。
2. 在 `.env.local` 填好四个合约地址、`MONAD_RPC_URL`、`MONAD_CHAIN_ID`、`INDEXER_START_BLOCK`。演示部署的四合约部署块为 `81498746`（`0x4db927a`），`INDEXER_START_BLOCK` 不应小于该值。
3. 启动持续同步：

```bash
pnpm indexer
```

单次同步便于部署到定时任务或 CI：

```bash
INDEXER_ONCE=true pnpm indexer
```

校验最近 1000 个区块的链上日志与数据库索引：

```bash
pnpm indexer:verify
```

索引器的关键保证：

- `(chainId, transactionHash, logIndex)` 唯一去重，原始日志先落 `chain_event_logs`，事件处理与派生表写入在同一个 `prisma.$transaction` 内完成，重复投递不会产生重复记录或重复奖励。
- `sync_states` 保存 `lastBlock` 与 `lastBlockHash`；启动时若游标区块哈希已变化，抛出 `ChainReorgError` 并停止（`manual_reconciliation_required`），不会在错误游标上继续追加数据。
- 每批事件之后用链上 view（`getRecord` / `getChallenge` / `rounds` / `votes` / `claimable`）对账派生表，链上状态覆盖数据库，避免事件丢失导致状态长期偏离。
- RPC 失败按指数退避重试；失败不推进游标。

注意：`RewardDistributed`、`StakeReturned`、`StakeSlashed` 只是资金流水。账户**当前可提余额**始终以 `claimable(address)` 为准，由 `/api/users/:address/claimable` 实时读取，不使用数据库累计值。

## 与合约的分工

后端不提供任何能改变链上结果的写入口：

- 记录与挑战的 POST 只做“签名 + 链上事实入库前预登记”，状态固定为 `PENDING`，必须由 `RecordSubmitted` / `ChallengeCreated` 事件确认。
- 投票（commit / reveal / finalize）、领取奖励（`claimVote` / `withdraw`）、撤销成绩、铸造 NFT 全部由前端直连合约，后端只读。
- 挑战创建前校验：记录必须已被索引器确认（`indexedAt` 非空），`CheatStatus=ACTIVE`，普通挑战要求 `PROVISIONAL` 且未过 `challengeDeadline`，特殊挑战要求 `VERIFIED`。
- API 不保存私钥，`.env*` 已在 `.gitignore` 中。

## API 与安全

完整接口、响应格式、签名消息和请求示例见 [docs/API.md](docs/API.md)。

- 所有输入经过 Zod（`.strict()` 拒绝未声明字段）；金额使用 wei 字符串；证据 URI 只允许 `http`、`https`、`ipfs`。
- Records / Challenges / Cheats 三个写接口要求 EIP-191 `personal_sign`，签名消息含 Chain ID、全部业务字段与 `expiresAt`（默认 5 分钟窗口）。
- Cheat Registry 写入额外要求 `CHEAT_REGISTRY_ADMIN_ADDRESSES` 白名单，非白名单返回 `403`。
- 重复的 `recordId` / `challengeId`、重复交易 Hash、重复证据 Hash 一律 `409`。

## 目录

- `abi/`：四合约正式 ABI（唯一准绳，勿手改）
- `prisma/`：Schema、Migration、Seed
- `src/app/api/`：REST Route Handlers
- `src/lib/`：统一响应、校验、签名、服务层、链上只读调用与演示数据
- `src/indexer/`：ABI 事件筛选、配置、链上读取、事件处理、同步、校验
- `src/test/`：接口集成测试与索引器事件处理器测试
