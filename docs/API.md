# RunProof API 使用说明

Base URL：`http://localhost:3000`。所有响应均为 JSON，时间使用 ISO 8601，质押/奖励金额使用十进制 wei 字符串。

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

详情接口的 `data` 直接是对象；排行榜的 `data` 包含 `gameId`、`gameMode`、`items`。列表默认 `page=1&limit=20`，最大 `limit=100`。

## 端点

| 方法 | 路径 | 查询参数 / 说明 |
| --- | --- | --- |
| GET | `/api/health` | 服务与数据源状态 |
| GET | `/api/records` | `gameId`、`gameMode`、`status`、`playerAddress`、分页 |
| GET | `/api/records/:id` | 记录、游戏、玩家、挑战和 NFT 详情 |
| POST | `/api/records` | 创建待链上确认记录，需要玩家签名 |
| GET | `/api/leaderboard` | `gameId=game_tetris`、`gameMode=marathon`、`limit=50`；只统计 `VERIFIED` |
| GET | `/api/challenges` | `recordId`、`challenger`、`status`、分页 |
| GET | `/api/challenges/:id` | 挑战、记录、作弊类型和投票明细 |
| POST | `/api/challenges` | 创建待确认挑战，需要挑战者签名 |
| GET | `/api/voting` | 默认只返回 `PENDING`/`VOTING`，可用 `status` 覆盖 |
| GET | `/api/voting/:id` | 挑战详情与票数/质押汇总 |
| GET | `/api/cheats` | `gameId`、`status`、分页 |
| GET | `/api/cheats/:id` | 作弊类型详情 |
| POST | `/api/cheats` | 新增作弊类型，需要白名单管理员签名 |
| GET | `/api/users/:address` | 用户资料与记录/投票/奖励/NFT 数量 |
| GET | `/api/users/:address/records` | 用户记录，分页 |
| GET | `/api/users/:address/votes` | 用户投票，分页 |
| GET | `/api/users/:address/rewards` | 用户奖励，分页 |
| GET | `/api/users/:address/nfts` | 用户 NFT，分页 |
| GET | `/api/nfts` | `ownerAddress`、`recordId`、`status`、分页 |
| GET | `/api/nfts/:id` | NFT 索引详情 |

状态枚举：

- Record：`PENDING`、`CHALLENGE_PERIOD`、`VERIFIED`、`REVOKED`
- Challenge：`PENDING`、`VOTING`、`UPHELD`、`REJECTED`、`CANCELLED`
- Vote：`COMMITTED`、`REVEALED`、`FINALIZED`、`SLASHED`；`votingChoice` 在 reveal 前为 `null`

## 查询示例

```bash
curl "http://localhost:3000/api/records?gameId=game_tetris&status=VERIFIED&page=1&limit=20"
curl "http://localhost:3000/api/leaderboard?gameId=game_tetris&gameMode=marathon&limit=10"
curl "http://localhost:3000/api/users/0x1000000000000000000000000000000000000001/rewards"
```

## 签名写接口

三个 POST 接口都使用 EIP-191 `personal_sign`。`expiresAt` 必须是未来时间，且距服务端当前时间不超过 `AUTH_MAX_SIGNATURE_AGE_SECONDS`（默认 300 秒）。签名覆盖 Chain ID、业务字段、交易 Hash 和过期时间。服务端会验证签名者等于 `playerAddress`/`challenger`/`adminAddress`。

### POST /api/records

请求字段：

```json
{
  "playerAddress": "0x...",
  "gameId": "game_tetris",
  "gameMode": "marathon",
  "score": 132000,
  "stakeAmount": "1000000000000000000",
  "videoUrl": "https://cdn.example.com/gameplay.mp4",
  "replayUrl": "https://cdn.example.com/replay.json",
  "evidenceHash": "0x<64 hex chars>",
  "transactionHash": "0x<64 hex chars>",
  "expiresAt": "2026-11-21T06:00:00.000Z",
  "signature": "0x<130 hex chars>"
}
```

按以下行拼接待签名消息，使用 `\n` 连接，不添加末尾换行：

```text
RunProof: Submit game record v1
Chain ID: 10143
Player: <lowercase address>
Game: game_tetris
Mode: marathon
Score: 132000
Stake (wei): 1000000000000000000
Video URL: https://cdn.example.com/gameplay.mp4
Replay URL: https://cdn.example.com/replay.json
Evidence: <lowercase hash>
Transaction: <lowercase hash>
Expires: <expiresAt>
```

创建后状态固定为 `CHALLENGE_PERIOD`，客户端不能指定 `VERIFIED`。相同交易 Hash，或同一玩家/游戏/模式下的相同证据 Hash，会返回 `409 DUPLICATE_RESOURCE` 或 `DUPLICATE_RECORD`。

### POST /api/challenges

字段：`recordId`、`cheatId`、`challenger`、`evidenceHash`、`transactionHash`、`expiresAt`、`signature`。

```text
RunProof: Create challenge v1
Chain ID: 10143
Record: <recordId>
Cheat: <cheatId>
Challenger: <lowercase address>
Evidence: <lowercase hash>
Transaction: <lowercase hash>
Expires: <expiresAt>
```

记录必须处于挑战期，Cheat 必须属于同一游戏且为 `ACTIVE`。创建状态固定为 `PENDING`，不能提交投票结果。

### POST /api/cheats

字段：`cheatCode`（大写字母/数字/下划线）、`name`、`description`、`gameId`、`adminAddress`、`expiresAt`、`signature`。

```text
RunProof: Register cheat v1
Chain ID: 10143
Admin: <lowercase address>
Game: game_tetris
Code: TOOL_ASSIST
Name: External tool assistance
Description: Using automation or an external solver to generate moves.
Expires: <expiresAt>
```

管理员地址配置在服务端 `CHEAT_REGISTRY_ADMIN_ADDRESSES`（逗号分隔）。非白名单地址返回 403。

## 演示数据

Seed/Mock 包含 5 个用户、Tetris 游戏、4 条不同状态记录、2 个作弊类型、2 个挑战、2 票、2 条奖励和 1 个 NFT。排行榜演示地址：`0x1000000000000000000000000000000000000001`。
