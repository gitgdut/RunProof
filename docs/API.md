# RunProof API（V2）

Base URL：`http://localhost:3000`。

约定：

- 所有 `uint256`（成绩值、质押、奖励、余额）都用**十进制字符串**返回，避免超过 2^53 丢精度。
- 时间同时给 ISO 字符串与 Unix 秒（`*Seconds`），链上是秒。
- 链上 ID 都是正整数：`categoryId`、`divisionId`、`recordId`、`challengeId`、`reasonId`、`tokenId`。
- 后端只读：除 `POST /api/records` 返回未签名交易外，没有任何写接口。

## 统一响应

```json
{
  "success": true,
  "data": { "items": [] },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-11-21T02:05:00.000Z",
    "pagination": { "offset": 0, "limit": 20, "total": 42, "hasMore": true }
  }
}
```

失败：

```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Record 99 not found" }, "meta": { "requestId": "uuid", "timestamp": "..." } }
```

列表默认 `offset=0&limit=20`，`limit` 上限 100（榜单默认 50）。详情返回对象。

## 端点

| 方法 | 路径 | 参数 / 说明 |
| --- | --- | --- |
| GET | `/api/categories` | 全部分类及 division |
| GET | `/api/categories/:categoryId` | 单个分类 |
| GET | `/api/leaderboard` | `categoryId`、`divisionId`（必填）、`offset`、`limit` |
| GET | `/api/records` | `categoryId`、`divisionId`、`status`、`player`、`offset`、`limit` |
| GET | `/api/records/:recordId` | 成绩 + 分类 + 挑战（含轮次/票/证据）+ NFT + 奖励 + 资金流水 |
| POST | `/api/records` | 返回未签名的 `submitRecord` 交易参数（不落库、不签名） |
| GET | `/api/challenges` | `recordId`、`reasonId`、`challenger`、`status` |
| GET | `/api/challenges/:challengeId` | 挑战 + 当前轮 + 两轮明细 + 汇总 |
| GET | `/api/voting` | 默认仅 `Voting`/`EvidenceVoting`，可用 `status` 覆盖 |
| GET | `/api/voting/:challengeId` | 同上，并附协议阈值（`minVoters`、`quorumPower` 等） |
| GET | `/api/reasons` | 挑战理由（V1 的 `/api/cheats`） |
| GET | `/api/reasons/:reasonId` | 单个理由 |
| GET | `/api/users/:address` | 概览：成绩/挑战/投票/奖励/质押/NFT 数量 + 实时可提余额 |
| GET | `/api/users/:address/records` | 该玩家成绩 |
| GET | `/api/users/:address/votes` | 该地址投票（含所属挑战摘要） |
| GET | `/api/users/:address/rewards` | 奖励流水 |
| GET | `/api/users/:address/stakes` | 质押返还/罚没流水 + 提现记录 |
| GET | `/api/users/:address/nfts` | 持有 NFT |
| GET | `/api/users/:address/claimable` | 实时读 `claimable(address)`（core + reason registry） |
| GET | `/api/nfts` | `ownerAddress`、`status` |
| GET | `/api/nfts/:tokenId` | NFT 详情（tokenId == recordId） |
| GET | `/api/health` | 索引高度、落后块数、最近一次对账结果 |

`status` 过滤既接受链上数值也接受名称：`status=2` 与 `status=Verified` 等价（`Voting`、`Confirmed`、`Revoked`…）。写错名称返回 `400 INVALID_STATUS`。

## 分类

```json
GET /api/categories
{
  "success": true,
  "data": {
    "items": [
      {
        "categoryId": 4,
        "name": "Minecraft Any%",
        "descriptionURI": "ipfs://runproof-rules/mc-any-v1",
        "unit": "ms",
        "decimals": 0,
        "direction": 2,
        "directionName": "LowerIsBetter",
        "ruleVersion": 1,
        "baseStake": "50000000000000000",
        "active": true,
        "divisions": [
          { "divisionId": 1, "name": "Java", "active": true },
          { "divisionId": 2, "name": "Bedrock", "active": true }
        ]
      }
    ]
  }
}
```

## 榜单

```json
GET /api/leaderboard?categoryId=4&divisionId=1
{
  "success": true,
  "data": {
    "categoryId": 4,
    "divisionId": 1,
    "categoryName": "Minecraft Any%",
    "divisionName": "Java",
    "unit": "ms",
    "decimals": 0,
    "direction": 2,
    "directionName": "LowerIsBetter",
    "chainBest": { "recordId": 1, "value": "1152345", "displayValue": "19:12.345" },
    "total": 3,
    "entries": [
      {
        "rank": 1, "recordId": 1, "player": "0x0d64…32e7",
        "value": "1152345", "displayValue": "19:12.345",
        "direction": 2, "directionName": "LowerIsBetter",
        "statusCode": 2, "status": "Verified",
        "stake": "100000000000000000",
        "evidenceURI": "ipfs://runproof-evidence/mc-java-19m12s345",
        "submittedAt": "2026-11-21T02:04:57.000Z", "submittedAtSeconds": 1795244697,
        "transactionHash": "0x…", "blockNumber": "81509860", "logIndex": 1
      }
    ]
  }
}
```

排序规则（后端唯一实现）：

1. `status = Verified(2)`
2. `direction=1` 按 `value` 降序；`direction=2` 按 `value` 升序
3. 同值 → `submittedAt` 更早优先
4. 仍相同 → `recordId` 更小优先

`chainBest` 来自 `LeaderboardUpdated` 事件 + 每轮 `bestRecordId()` 对账；验收时它必须等于链上 `bestRecordId(categoryId, divisionId)`，也应等于 `entries[0].recordId`（`offset=0` 时）。

`displayValue` 由后端按 `unit` + `decimals` 格式化，前端不要再算一遍：

| 原始值 | unit | decimals | displayValue |
| --- | --- | --- | --- |
| `1152345` | `ms` | 0 | `19:12.345` |
| `9845` | `ms` | 0 | `00:09.845` |
| `1432` | `cps` | 2 | `14.32` |
| `1200` | `cps` | 2 | `12` |
| `25` | `reps` | 0 | `25` |

## 成绩

```bash
curl "http://localhost:3000/api/records?categoryId=5&divisionId=1&status=Verified"
curl "http://localhost:3000/api/records/1"
```

列表项包含 `recordId/player/value/displayValue/direction/status/evidenceURI/stake/submittedAt(+秒)/transactionHash/blockNumber/logIndex`；详情额外带 `category`、`challenges`、`nft`、`rewards`、`stakeFlows`。

### POST /api/records（返回未签名交易）

职责边界：校验参数、读链上 `requiredPayment`/`requiredStake`、确认分类与 division 可用，然后返回 `submitRecord` 的调用参数。**不落库、不签名、不广播。**

请求：

```json
{
  "categoryId": 4,
  "divisionId": 1,
  "value": "1152345",
  "evidenceHash": "0x<32 bytes>",
  "evidenceURI": "ipfs://<CID>"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "chainId": 10143,
    "to": "0x1eb96bf618151adA2F7174CE9b8c41F45486084F",
    "functionName": "submitRecord",
    "args": ["4", "1", "1152345", "0x…", "ipfs://…"],
    "data": "0x…",
    "value": "60000000000000000",
    "requiredStake": "50000000000000000",
    "submissionFee": "10000000000000000",
    "category": { "categoryId": 4, "divisionId": 1, "name": "Minecraft Any%", "unit": "ms", "decimals": 0, "direction": 2, "ruleVersion": 1, "baseStake": "50000000000000000" },
    "displayValue": "19:12.345"
  }
}
```

前端用钱包签名并发送该交易，成功后等索引器写入 `RecordSubmitted`（状态 `Provisional`）。金额一律以链上返回值为准，不要缓存。

错误：`400 DIVISION_INACTIVE`、`400 CATEGORY_INACTIVE`、`400 VALIDATION_ERROR`、`502 CHAIN_READ_FAILED`（RPC 不可用）。

## 挑战与投票

```json
GET /api/voting/1
{
  "success": true,
  "data": {
    "challengeId": 1,
    "recordId": 9,
    "reasonId": 1,
    "reason": { "code": "R001", "name": "Fabricated Evidence" },
    "challenger": "0x2000…0002",
    "bond": "500000000000000000",
    "reserved": "1000000000000000000",
    "statusCode": 3,
    "status": "Confirmed",
    "round": 0,
    "currentRound": {
      "round": 0,
      "commitEnd": "2026-11-21T02:05:30.000Z", "commitEndSeconds": 1795245930,
      "revealEnd": "2026-11-21T02:06:00.000Z", "revealEndSeconds": 1795245960,
      "confirmPower": "400", "denyPower": "100",
      "confirmStake": "400000000000000000", "denyStake": "100000000000000000",
      "committedStake": "500000000000000000",
      "committedVoters": 5, "revealedVoters": 5,
      "finalized": true, "winnerCode": 1, "winner": "Confirm", "winnerPower": "400",
      "rewardPool": "430000000000000000", "slashBps": 3000
    },
    "special": true,
    "extended": true,
    "evidenceCount": 1,
    "summary": { "round": 0, "totalVotes": 5, "committedVoters": 5, "revealedVoters": 5, "totalStake": "500000000000000000", "confirmPower": "400", "denyPower": "100", "confirmVotes": 4, "denyVotes": 1 },
    "thresholds": { "minVoters": 3, "quorumPower": "300", "approvalBps": 7500, "minVoteStake": "50000000000000000", "maxVoteStake": "5000000000000000000", "chainId": 10143 },
    "votes": [], "evidence": [], "rounds": []
  }
}
```

`thresholds` 从 `params()` 读取并缓存 60 秒；RPC 不可用时为 `null`，其余字段照常返回。

前端按钮条件（与合约阶段一致）：

| 条件 | 动作 |
| --- | --- |
| `now < commitEnd` | `commitVote`；当事人可 `submitEvidence` |
| `commitEnd <= now < revealEnd` | 已 commit 者可 `revealVote` |
| `now >= revealEnd && !finalized` | 任意地址可 `finalizeVoting` |
| 已结算且投过票、`claimed=false` | `claimVote` |
| `claimable > 0` | `withdraw` |

投票是 commit-reveal 两步：`commitment` 必须用链上 `hashVote(challengeId, round, choice, salt, voter)` 计算，`salt` 由前端持久化；`round` 变化后旧 commitment 失效。证据充分性轮（`round=1`）中 `Choice` 语义为 Evidence Sufficient / Evidence Required。

## 用户

```json
GET /api/users/0x1000000000000000000000000000000000000001
{
  "success": true,
  "data": {
    "address": "0x1000…0001",
    "known": true,
    "stats": { "records": 2, "challenges": 0, "votes": 1, "rewards": 0, "stakes": 0, "nfts": 1 },
    "claimable": { "walletAddress": "0x1000…0001", "chainId": 10143, "coreClaimable": "0", "reasonRegistryClaimable": "0", "totalClaimable": "0" }
  }
}
```

`claimable` 实时读合约；RPC 不可用时该字段为 `null`，但统计照常返回。需要严格金额时用 `/api/users/:address/claimable`（读不到直接 `502`，不会返回假数据）。

## 健康检查

```json
GET /api/health
{
  "success": true,
  "data": {
    "service": "runproof-api",
    "status": "ok",
    "dataMode": "prisma",
    "database": "connected",
    "chain": { "chainId": 10143, "head": "81521785" },
    "indexer": { "indexedBlock": "81521780", "indexedBlockHash": "0x…", "lastSyncedAt": "2026-11-21T08:00:00.000Z", "lagBlocks": "5" },
    "lastReconcile": { "ranAt": "2026-11-21T08:00:00.000Z", "ok": true, "checkedBoards": 5, "mismatches": [], "lagBlocks": "5" }
  }
}
```

`status` 为 `lagging` 表示落后超过 100 块；`lastReconcile.mismatches` 非空说明库内指针与 `bestRecordId` 不一致（已按链上修正并记录）。

## 错误码

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Zod 校验失败（附 `details.fieldErrors`） |
| 400 | `INVALID_JSON` | 请求体不是 JSON |
| 400 | `INVALID_STATUS` | `status` 既不是数字也不是已知名称 |
| 400 | `DIVISION_INACTIVE` / `CATEGORY_INACTIVE` | 该榜不接受提交 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 502 | `CHAIN_READ_FAILED` | 链上只读调用失败 |
| 503 | `DATABASE_UNAVAILABLE` | `DATA_MODE=prisma` 但库不可用或未迁移 |
| 500 | `INTERNAL_ERROR` | 未预期异常 |

## 演示数据

`DATA_MODE=mock` 与 `pnpm db:seed` 的数据一致：

- 分类：1 100m Sprint（ms，越低越好）、2 Pull-ups（reps）、3 Tetris Score（points，3 个 division）、4 Minecraft Any%（ms，Java/Bedrock）、5 Click Speed（cps，2 位小数）
- 成绩 1–8 已 Verified，9 已 Revoked（对应挑战 1 `Confirmed`，理由 R001）
- 理由 R001–R005；NFT tokenId 1、6、9
- 演示玩家：`0x1000000000000000000000000000000000000001`；挑战者：`0x2000000000000000000000000000000000000002`
