# RunProof

RunProof 后端基于 Next.js Route Handlers、TypeScript、Prisma、PostgreSQL、Zod 和 Viem。数据库只保存索引与展示数据；质押、投票结果、罚没和 NFT 的最终状态以合约为准。

## 快速演示（无需数据库）

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`.env.example` 默认 `DATA_MODE=mock`，服务启动后即可使用内置 Tetris 演示数据：

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/records
curl http://localhost:3000/api/leaderboard
curl http://localhost:3000/api/voting
```

Mock 模式也执行完整的 Zod 校验、EIP-191 签名验证和重复提交检查，不是绕过安全的静态响应。

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

## 验证与构建

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

## Monad 事件索引器

1. 与合约团队确认 `src/indexer/abi.ts` 中 7 个事件的参数；当前 ABI 是待确认的接口草案，不会修改合约。
2. 在 `.env.local` 配置 `MONAD_RPC_URL`、`MONAD_CHAIN_ID`、`RUNPROOF_CONTRACT_ADDRESS` 和 `INDEXER_START_BLOCK`。
3. 确保使用 `DATA_MODE=prisma`，并先完成 Migration 与 Seed。
4. 启动持续同步：

```bash
pnpm indexer
```

单次同步便于部署到定时任务：

```bash
INDEXER_ONCE=true pnpm indexer
```

校验最近 1000 个区块内的链上日志与数据库索引：

```bash
pnpm indexer:verify
```

索引器提供交易 Hash + Log Index 去重、事件日志存档、同步游标、确认块窗口、指数退避重试、重组冲突检测和链上/数据库日志校验。游标同时保存区块 Hash；若重启后发现游标区块已不在主链，索引器会停止并标记 `manual_reconciliation_required`，不会继续在错误游标上追加数据。若事件参数或 ID 映射调整，需要同步修改 `src/indexer/handlers.ts`。最终业务结果仍应通过合约 view 方法复核；拿到只读 ABI 后可扩展 `indexer:verify`。

## API 与安全

完整接口、响应格式、签名消息和请求示例见 [docs/API.md](docs/API.md)。

- 所有输入经过 Zod；金额使用 wei 字符串，媒体地址只允许 HTTP/HTTPS。
- Records/Challenges 创建需要对应钱包的 EIP-191 签名，并拒绝重复交易/证据。API 创建的记录先进入 `PENDING`，只有索引到 `RecordSubmitted` 后才能被挑战。
- Cheat Registry 写入额外要求管理员钱包白名单。
- API 不提供修改投票结果、发放奖励、罚没或铸造 NFT 的写入口。
- 私钥不进入服务端或数据库；环境变量文件已加入 `.gitignore`。

## 目录

- `prisma/`：Schema、Migration、Seed
- `src/app/api/`：REST Route Handlers
- `src/lib/`：统一响应、校验、签名、服务层与演示数据
- `src/indexer/`：Viem ABI、事件处理、同步与校验
- `src/test/`：API 集成测试
