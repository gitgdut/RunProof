# RunProof API 使用说明

Base URL：`http://localhost:3000`。

约定：

- 所有响应均为 JSON，时间使用 ISO 8601（链上 Unix 秒已换算），金额使用十进制 wei 字符串。
- 链上 ID（record / challenge / cheat / game / mode / token）全部是**正整数**，不是字符串 slug。
- 服务端不提供改变链上结果的写入口，投票、领取、撤销、铸造都必须由前端直连合约。

## 统一响应

成功：

```json
{
  "success": true,
  "data": { "items": [] },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-11-21T05:00:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
  }
}
```

失败：

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": {} },
  "meta": { "requestId": "uuid", "timestamp": "2026-11-21T05:00:00.000Z" }
}
```

列表接口的 `data` 为 `{ "items": [...] }`，分页信息在 `meta.pagination`。详情接口的 `data` 直接是对象。列表默认 `page=1&limit=20`，最大 `limit=100`。

错误码：

| HTTP | code | 触发场景 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Zod 校验失败，`details.fieldErrors` 给出字段 |
| 400 | `INVALID_JSON` | 请求体不是合法 JSON |
| 400 | `UNSUPPORTED_GAME_MODE` | GameRegistry 中该 `gameId + modeId` 不存在或未激活 |
| 400 | `INVALID_CHEAT` | `cheatId` 不存在或不是 `ACTIVE` |
| 401 | `INVALID_SIGNATURE` | 签名者与声明钱包不一致 |
| 401 | `SIGNATURE_EXPIRED` | `expiresAt` 已过期 |
| 400 | `SIGNATURE_WINDOW_TOO_LONG` | `expiresAt` 超出 `AUTH_MAX_SIGNATURE_AGE_SECONDS` |
| 403 | `NOT_REGISTRY_ADMIN` | 不在 `CHEAT_REGISTRY_ADMIN_ADDRESSES` 白名单 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `DUPLICATE_RESOURCE` | ID / 交易 Hash / 证据 Hash 重复 |
| 409 | `CHAIN_RECORD_REQUIRED` | 记录尚未被索引器确认，不能创建挑战 |
| 409 | `CHALLENGE_CLOSED` | 记录状态或挑战期不允许挑战 |
| 409 | `SPECIAL_CHALLENGE_NOT_ELIGIBLE` | 特殊挑战要求记录已 `VERIFIED` |
| 502 | `CHAIN_READ_FAILED` | 链上只读调用失败 |
| 503 | `CHAIN_NOT_CONFIGURED` | 缺少 RPC 或合约地址配置 |
| 503 | `DATABASE_UNAVAILABLE` | `DATA_MODE=prisma` 但数据库不可用或未迁移 |
| 500 | `INTERNAL_ERROR` | 未预期异常 |

## 端点

| 方法 | 路径 | 查询参数 / 说明 |
| --- | --- | --- |
| GET | `/api/health` | 服务状态；`prisma` 模式会真实探测数据库 |
| GET | `/api/games` | 游戏与模式列表（来自 `GameRegistered` / `ModeRegistered`） |
| GET | `/api/games/:id` | 单个游戏及其模式、作弊类型 |
| GET | `/api/records` | `gameId`、`gameMode`、`status`、`playerAddress`、分页 |
| GET | `/api/records/:id` | 记录 + 游戏 + 玩家 + 挑战（含轮次/票/证据）+ NFT + 奖励 + 资金流水 |
| POST | `/api/records` | 预登记已上链的记录，需要玩家签名 |
| GET | `/api/leaderboard` | `gameId`（默认 1）、`gameMode`（默认 3）、`limit`（默认 50）；只统计 `VERIFIED` |
| GET | `/api/challenges` | `recordId`、`cheatId`、`challenger`、`status`、分页 |
| GET | `/api/challenges/:id` | 挑战、记录、作弊类型、轮次、投票明细、证据 |
| POST | `/api/challenges` | 预登记已上链的挑战，需要挑战者签名 |
| GET | `/api/voting` | 默认返回 `PENDING`/`VOTING`/`EVIDENCE_VOTING`，可用 `status` 覆盖 |
| GET | `/api/voting/:id` | 挑战详情 + 当前轮 + 投票汇总 |
| GET | `/api/cheats` | `status`（`ACTIVE`/`INACTIVE`）、分页 |
| GET | `/api/cheats/:id` | 作弊类型详情 |
| POST | `/api/cheats` | 缓存作弊类型元数据，需要白名单管理员签名 |
| GET | `/api/users/:address` | 用户资料与各类计数 |
| GET | `/api/users/:address/records` | 该玩家记录，分页 |
| GET | `/api/users/:address/votes` | 该地址投票（含挑战摘要），分页 |
| GET | `/api/users/:address/rewards` | 奖励流水，分页 |
| GET | `/api/users/:address/stakes` | 质押返还/罚没流水，分页 |
| GET | `/api/users/:address/claimable` | 实时读取 Core 与 CheatRegistry 的 `claimable`，**不落库** |
| GET | `/api/users/:address/nfts` | 该地址持有的 NFT，分页 |
| GET | `/api/nfts` | `ownerAddress`、`recordId`、`status`、分页 |
| GET | `/api/nfts/:id` | NFT 索引详情（tokenId == recordId） |

### 状态枚举

- Record：`PENDING`（仅 API 预登记，链上还没有该记录）、`PROVISIONAL`、`VERIFIED`、`REVOKED`
- Challenge：`PENDING`、`VOTING`、`EVIDENCE_VOTING`、`CONFIRMED`、`DENIED`、`INCONCLUSIVE`
- Vote：`votingChoice` 在 reveal 前为 `null`；`revealed`、`claimed` 为布尔；`round` 区分 0=作弊判定、1=证据充分性
- Cheat：`ACTIVE`、`INACTIVE`
- NFT：`PROVISIONAL`、`VERIFIED`、`REVOKED`

## 查询示例

```bash
curl "http://localhost:3000/api/records?gameId=1&gameMode=3&status=VERIFIED&page=1&limit=20"
curl "http://localhost:3000/api/games/1"
curl "http://localhost:3000/api/leaderboard?gameId=1&gameMode=3&limit=10"
curl "http://localhost:3000/api/users/0x1000000000000000000000000000000000000001/rewards"
curl "http://localhost:3000/api/users/0x1000000000000000000000000000000000000001/claimable"
```

排行榜响应：

```json
{
  "success": true,
  "data": {
    "gameId": 1,
    "gameMode": 3,
    "items": [
      { "rank": 1, "id": 1, "playerAddress": "0x1000...0001", "score": "125430", "evidenceURI": "ipfs://runproof/records/1", "submittedAt": "2026-11-20T08:00:00.000Z", "transactionHash": "0x1111..." }
    ]
  }
}
```

投票接口在挑战对象上追加 `currentRound` 与 `summary`：

```json
{
  "id": 1,
  "round": 0,
  "status": "VOTING",
  "currentRound": { "challengeId": 1, "round": 0, "confirmPower": "1000", "denyPower": "0", "finalized": false },
  "summary": {
    "round": 0,
    "totalVotes": 2,
    "revealedVoters": 1,
    "totalStake": "200000000000000000",
    "confirmPower": "1000",
    "denyPower": "0",
    "confirmVotes": 1,
    "denyVotes": 0
  },
  "votes": []
}
```

`summary` 只统计当前轮的票；`confirmPower` / `denyPower` 来自 `VoteRevealed` 的 `power`，未 reveal 的票不计入。

`/api/users/:address/claimable` 响应：

```json
{
  "walletAddress": "0x1000...0001",
  "chainId": 10143,
  "coreClaimable": "0",
  "cheatRegistryClaimable": "0",
  "totalClaimable": "0"
}
```

该接口在 `DATA_MODE=mock` 下同样要求配置 `MONAD_RPC_URL` 与合约地址，否则返回 `503 CHAIN_NOT_CONFIGURED`。

## 签名写接口

三个 POST 接口都使用 EIP-191 `personal_sign`（viem `signMessage`）。`expiresAt` 必须是 ISO 8601 未来时间，且距服务端当前时间不超过 `AUTH_MAX_SIGNATURE_AGE_SECONDS`（默认 300 秒）。消息逐行拼接、`\n` 连接、**不带末尾换行**；地址与哈希在消息中使用小写形式。

### POST /api/records

请求字段（`.strict()`，多余字段直接 400）：

```json
{
  "recordId": 42,
  "playerAddress": "0x1000000000000000000000000000000000000001",
  "gameId": 1,
  "gameMode": 3,
  "score": "132000",
  "stakeAmount": "1000000000000000000",
  "evidenceURI": "ipfs://<CID>",
  "evidenceHash": "0x<64 hex chars>",
  "challengeDeadline": "2026-11-21T06:10:00.000Z",
  "transactionHash": "0x<64 hex chars>",
  "expiresAt": "2026-11-21T06:00:00.000Z",
  "signature": "0x<130 hex chars>"
}
```

待签名消息：

```text
RunProof: Index submitted record v2
Chain ID: 10143
Record ID: 42
Player: 0x1000000000000000000000000000000000000001
Game ID: 1
Mode ID: 3
Score: 132000
Stake (wei): 1000000000000000000
Evidence hash: 0x<lowercase hash>
Evidence URI: ipfs://<CID>
Deadline: 2026-11-21T06:10:00.000Z
Transaction: 0x<lowercase hash>
Expires: 2026-11-21T06:00:00.000Z
```

要求与行为：

- `recordId`、`score`、`stakeAmount`、`challengeDeadline` 必须与链上 `RecordSubmitted` 事件一致；服务端不计算质押，也不参考 `requiredPayment`。
- `gameId + gameMode` 必须存在于 GameRegistry 索引且模式为激活状态，否则 `400 UNSUPPORTED_GAME_MODE`。
- 记录落库状态固定为 `PENDING`，`indexedAt` 为空。索引器读到 `RecordSubmitted` 后写入真实区块信息并改为 `PROVISIONAL`（或链上已推进的状态）。
- `recordId`、`transactionHash`、`evidenceHash` 任一重复返回 `409 DUPLICATE_RESOURCE`。
- 客户端不能指定 `status`、`gameVersion`、`ruleVersion`，这些由索引器按链上事件写入。

### POST /api/challenges

字段：`challengeId`、`recordId`、`cheatId`、`challenger`、`bond`、`evidenceURI`、`evidenceHash`、`special`、`transactionHash`、`expiresAt`、`signature`。

```text
RunProof: Index submitted challenge v2
Chain ID: 10143
Challenge ID: 7
Record ID: 42
Cheat ID: 3
Challenger: 0x3000000000000000000000000000000000000003
Bond (wei): 500000000000000000
Special: false
Evidence hash: 0x<lowercase hash>
Evidence URI: ipfs://<CID>
Transaction: 0x<lowercase hash>
Expires: 2026-11-21T06:00:00.000Z
```

要求与行为：

- 记录必须已被索引器确认（`indexedAt` 非空），否则 `409 CHAIN_RECORD_REQUIRED`。
- `cheatId` 必须存在且为 `ACTIVE`，否则 `400 INVALID_CHEAT`。
- 普通挑战（`special=false`）：记录必须 `PROVISIONAL` 且未过 `challengeDeadline`；否则 `409 CHALLENGE_CLOSED`。
- 特殊挑战（`special=true`）：记录必须 `VERIFIED`；否则 `409 SPECIAL_CHALLENGE_NOT_ELIGIBLE`。保证金由合约按 5 倍校验，后端只记录事件中的 `bond`。
- 挑战落库状态固定为 `PENDING`，等待 `ChallengeCreated` 事件补全 `round`、`reserved`、`commitEnd` 等字段。

### POST /api/cheats

字段：`cheatId`、`cheatCode`（`C001` 形式）、`name`、`description?`、`evidenceURI?`、`adminAddress`、`expiresAt`、`signature`。

```text
RunProof: Cache cheat metadata v2
Chain ID: 10143
Cheat ID: 6
Admin: 0xa00000000000000000000000000000000000000a
Code: C006
Name: Save File Editing
Description: Editing local save data to skip progression.
Evidence URI: ipfs://runproof/cheats/C006
Expires: 2026-11-21T06:00:00.000Z
```

`description` 与 `evidenceURI` 省略时对应行保留为 `Description: ` / `Evidence URI: `（空值，不删行）。管理员地址来自 `CHEAT_REGISTRY_ADMIN_ADDRESSES`（逗号分隔），非白名单地址返回 `403`。该接口只缓存元数据，链上注册仍以 `CheatRegistered` 事件为准；同名/同码由合约保证唯一。

## 前端对接注意事项

- 提交成绩前先读 `requiredPayment(gameId, mode, score)` 作为 `msg.value`，不要复用本 API 的 `stakeAmount` 作为付款依据。
- 投票是 commit-reveal 两步，`commitment` 必须用链上 `hashVote(challengeId, round, choice, salt, voter)` 计算，`salt` 由前端持久化；`round` 变化后旧 commitment 失效。
- 所有资金展示以 `claimable(address)` 为准，配合 `claimVote` / `withdraw` 完成提现。
- NFT 状态用 `verificationStatus(tokenId)` 实时读取，成绩撤销后 NFT 仍存在但状态为 Revoked。

## 演示数据

Mock / Seed 包含 4 个用户、Tetris（`gameId=1`，模式 1 Classic / 2 Sprint / 3 Marathon）、5 个作弊类型（C001–C005）、4 条不同状态的记录（`VERIFIED` / `PROVISIONAL` / `REVOKED`）、2 个挑战（含 2 个轮次）、2 张票（其中一张未 reveal）、证据、奖励、质押流水与 1 个 NFT。

演示地址：

- 玩家：`0x1000000000000000000000000000000000000001`（Alice，记录 1，分数 125430，排行榜第 1）
- 挑战者：`0x2000000000000000000000000000000000000002`（Bob，挑战 1，状态 `VOTING`）
- 投票者：Alice 已 reveal（`CONFIRM`），Dave 仅 commit（`votingChoice` 为 `null`）
