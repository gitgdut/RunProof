# RunProof 后端交接文档（V2）

> 写给后端同学：这份文档假设你没参与合约开发。看完你应该知道**现在链上有什么**、**你必须建什么**、**哪些做法会直接踩坑**。
> 合约地址、事件签名、字段顺序都是从 `src/*.sol` 里逐条核对出来的，不是凭文档记忆。

---

## 0. 一句话目标

把链上事件索引成数据库，对外提供一个 REST API：**任何人上传成绩、看榜单、查挑战和投票状态、查用户资产**。
链上负责权威排名（`bestRecordId`），数据库负责**完整榜单**和**历史记录**。这两者必须每轮对账。

---

## 1. 现状（截至交接）

| 项 | 值 |
|---|---|
| 网络 | Monad Testnet |
| Chain ID | `10143` |
| RPC | `https://testnet-rpc.monad.xyz` |
| 部署起始区块 | `81509823` |
| CategoryRegistry | `0x8D3aEdd92fA2151F61877D0e844a556E4eAB91A7` |
| ChallengeReasonRegistry | `0x522d2883FA6ac437F414874B9B7cEEAfAE4caC0b` |
| RunProofCore | `0x1eb96bf618151adA2F7174CE9b8c41F45486084F` |
| RecordNFT | `0x967D0B53cb05BC9D6c85BEB087444e6f5a3e1360` |

**当前是演示参数**：挑战窗口 60 秒、Commit 30 秒、Reveal 30 秒、延期 30 秒，`minVoters=3`、`quorumPower=300`（即 0.3 MON 有效投票权）、`approvalBps=7500`（75% 通过）。
时间字段全部是 **Unix 秒**，不要当成毫秒。

链上已有演示数据，可以直接拿来联调：

- 分类 1 `100m Sprint`（ms，越低越好）
- 分类 2 `Pull-ups`（reps，越高越好）
- 分类 3 `Tetris Score`（points，越高越好，3 个 division）
- 分类 4 **`Minecraft Any%`**（ms，越低越好，division 1=Java、2=Bedrock）
- 分类 5 **`Click Speed`**（cps，精度 2，越高越好，division 1=All）
- 成绩 `recordId` 1–8 已认证（Verified），可用于验证榜单排序

---

## 2. 最重要的一件事：现有分支是 V1 模型，必须迁移

`feat/backend-api` 分支**不能直接接 V2**。它的 schema、ABI、环境变量全是旧的游戏世界纪录模型，接上去会解析失败或写错数据。

必须做的替换（逐个改，不要打补丁）：

| 旧（V1，现分支） | 新（V2，必须改成） |
|---|---|
| `Game` / `gameId` | `Category` / `categoryId` |
| `GameMode` / `gameMode` | `Division` / `divisionId` |
| `Record.score` | `Record.value` |
| `Cheat` / `cheatId` / `cheatCode` | `ChallengeReason` / `reasonId` / `code` |
| `GameRegistered` 事件 | `CategoryCreated` 事件 |
| `CheatRegistered` 事件 | `ReasonRegistered` 事件 |
| `GAME_REGISTRY_ADDRESS` | `CATEGORY_REGISTRY_ADDRESS` |
| `CHEAT_REGISTRY_ADDRESS` | `CHALLENGE_REASON_REGISTRY_ADDRESS` |
| `gameRegistryAbi` / `cheatRegistryAbi` | `categoryRegistryAbi` / `reasonRegistryAbi` |
| `RecordStatus.PENDING` | 没有 PENDING，V2 只有 `None/Provisional/Verified/Revoked` |

`abi/*.json` 在合约分支里已经导出好，直接 import，别手写 ABI。

---

## 3. 数据模型

建议保留你现在的 Prisma 结构，只换字段。核心表：

```prisma
model Category {
  id             Int      @id
  name           String
  descriptionURI String
  unit           String   // "ms" / "reps" / "cps" / "points"
  decimals       Int
  direction      Int      // 1=HigherIsBetter 2=LowerIsBetter
  ruleVersion    Int
  baseStake      String   // wei，字符串存，别用 Float
  active         Boolean
  divisions      Division[]
}

model Division {
  categoryId Int
  divisionId Int
  name       String
  active     Boolean
  @@id([categoryId, divisionId])
}

model Record {
  id           Int      @id          // 链上 recordId
  player       String
  categoryId   Int
  divisionId   Int
  value        String                // 归一化后的整数（已按 decimals 放大）
  direction    Int                    // 提交时固化，不要用分类当前值
  evidenceHash String
  evidenceURI  String
  stake        String
  submittedAt  DateTime
  deadline     DateTime
  ruleVersion  Int
  status       Int                    // 0 None 1 Provisional 2 Verified 3 Revoked
  stakeSettled Boolean
  activeChallenges Int
  txHash       String
  blockNumber  BigInt
  logIndex     Int
  @@index([categoryId, divisionId, status, value])
  @@index([player, submittedAt])
}
```

**所有 `uint256` / `int256` 一律用字符串或 Prisma `Decimal` 存**，不要用 JS `number`。成绩值、质押、奖励、池子余额都可能超过 2^53。

`Challenge` / `ChallengeRound` / `Vote` / `Evidence` / `Reward` / `StakeFlow` / `NFT` / `ChainEventLog` / `SyncState` 结构基本可以沿用你现有的，把 `gameId/gameMode` 换成 `categoryId/divisionId`，再加 `round`（0=有效性判断，1=证据充分性）作为挑战轮次维度 —— 一轮挑战**最多两轮投票**，这点旧模型没有。

---

## 4. 索引器规范（这一节是重点）

### 4.1 起止与幂等

- `startBlock = 81509823`（V2 部署块），不要从 0 扫
- 事件唯一键 **`(chainId, txHash, logIndex)`**，用它做幂等 upsert。V2 里同一个 tx 可能发出同类型多条事件，`txHash` 单独不够
- 保存 `txHash` 和 `blockNumber`，前端要拿去链浏览器跳转

### 4.2 必须处理的事件（真实签名）

```solidity
// CategoryRegistry
event CategoryCreated(uint256 indexed categoryId, string name, string unit, uint8 decimals, RankingDirection direction, uint32 ruleVersion, uint256 baseStake, string descriptionURI);
event CategoryUpdated(uint256 indexed categoryId, string name, string unit, uint8 decimals, RankingDirection direction, uint32 ruleVersion, uint256 baseStake, string descriptionURI);
event CategoryActiveSet(uint256 indexed categoryId, bool active);
event DivisionCreated(uint256 indexed categoryId, uint256 indexed divisionId, string name);
event DivisionActiveSet(uint256 indexed categoryId, uint256 indexed divisionId, bool active);

// RunProofCore —— 成绩
event RecordSubmitted(uint256 indexed recordId, address indexed player, uint256 indexed categoryId, uint256 divisionId, uint256 value, uint256 stake, bytes32 evidenceHash, string evidenceURI, uint64 deadline);
event RecordVerified(uint256 indexed recordId, address indexed player, uint256 indexed categoryId, uint256 value);
event RecordRevoked(uint256 indexed recordId, address indexed player, uint256 indexed reasonId, uint256 challengeId);
event LeaderboardUpdated(uint256 indexed categoryId, uint256 indexed divisionId, uint256 indexed bestRecordId, uint256 bestValue);

// RunProofCore —— 挑战与投票
event ChallengeCreated(uint256 indexed recordId, uint256 indexed reasonId, address indexed challenger, uint256 challengeId, uint256 bond, bool special, bytes32 evidenceHash, string evidenceURI, uint64 commitEnd);
event EvidenceSubmitted(uint256 indexed recordId, uint256 indexed reasonId, address indexed submitter, uint256 challengeId, uint8 round, bytes32 evidenceHash, string evidenceURI);
event VoteCommitted(uint256 indexed recordId, uint256 indexed reasonId, address indexed voter, uint256 challengeId, uint8 round, uint256 stake);
event VoteRevealed(uint256 indexed recordId, uint256 indexed reasonId, address indexed voter, uint256 challengeId, uint8 round, Choice choice, uint256 power);
event VotingExtended(uint256 indexed recordId, uint256 indexed reasonId, uint256 challengeId, uint64 newCommitEnd, uint64 newRevealEnd);
event EvidenceVotingStarted(uint256 indexed recordId, uint256 indexed reasonId, uint256 challengeId, uint64 commitEnd, uint64 revealEnd);
event VotingFinalized(uint256 indexed recordId, uint256 indexed reasonId, uint256 challengeId, ChallengeStatus outcome, uint8 round, uint256 confirmPower, uint256 denyPower);

// RunProofCore —— 资金
event StakeReturned(uint256 indexed recordId, uint256 indexed reasonId, address indexed account, uint256 amount, StakeKind kind);
event StakeSlashed(uint256 indexed recordId, uint256 indexed reasonId, address indexed account, uint256 amount, SlashKind kind, uint256 challengeId);
event RewardDistributed(uint256 indexed recordId, uint256 indexed reasonId, address indexed account, uint256 amount, RewardKind kind, uint256 challengeId);
event Withdrawn(address indexed account, uint256 amount);
event PoolFunded(address indexed from, uint256 amount);
event PoolWithdrawn(address indexed to, uint256 amount);
event ParamsUpdated();

// ChallengeReasonRegistry
event ReasonRegistered(uint256 indexed reasonId, string code, string name, address indexed discoverer);
event ReasonProposed(uint256 indexed proposalId, address indexed proposer, string name, uint256 bond, uint64 endTime);
event ReasonProposalVoted(uint256 indexed proposalId, address indexed voter, bool support, uint256 stake, uint256 power);
event ReasonProposalFinalized(uint256 indexed proposalId, ProposalStatus status, uint256 reasonId);
event DiscovererRewarded(uint256 indexed proposalId, uint256 indexed reasonId, address indexed proposer, uint256 amount);
event RewardFunded(address indexed from, uint256 amount);

// RecordNFT
event NFTMinted(uint256 indexed recordId, address indexed player, uint256 indexed categoryId, uint256 value, bytes32 evidenceHash);
```

**注意**：`ChallengeCreated` 里没有 `commitEnd` 之外的时间字段，`revealEnd` 要自己按 `params().commitPeriod/revealPeriod` 推，或者直接读 `rounds(challengeId, 0)`。投票延期要用 `VotingExtended` / `EvidenceVotingStarted` 事件覆盖，不要只在本地加时间。

### 4.3 分页取日志

Monad 的 `eth_getLogs` 有区块范围上限，不要一次从 `81509823` 扫到最新：

```ts
const CHUNK = 1000n; // 按 RPC 实际限制调整，被拒就自动减半
for (let from = cursor; from <= latest; from += CHUNK) {
  const to = min(from + CHUNK - 1n, latest);
  await client.getLogs({ address: ALL, fromBlock: from, toBlock: to });
  await saveCursor(to); // 每块成功后落库，崩溃可续
}
```

三个合约地址合起来放在一个 `address: [...]` 里查，比分开查少 2/3 的请求。

### 4.4 重组与回滚

- 只处理 `latest - confirmations` 之前的数据（建议 `confirmations = 5`）
- 检测到父哈希不匹配时，回滚到共同祖先：删除 `blockNumber >= 分叉点` 的事件并对相关实体重算
- 每轮回滚后必须**重算榜单**，不能只补删数据

### 4.5 对账（必须有，别省）

每轮同步结束，对每个有成绩的 `(categoryId, divisionId)`：

```ts
const dbBest = await db.record.findFirst({ where: { categoryId, divisionId, status: 2 }, orderBy: [...] });
const chainBest = await client.readContract({ functionName: 'bestRecordId', args: [categoryId, divisionId] });
if (dbBest?.id !== Number(chainBest)) {
  // 以链上为准，重算该榜单并告警
}
```

链上是权威。索引器算出来的第一名和 `bestRecordId` 不一致，就是 bug，不要"以数据库为准"糊过去。

### 4.6 榜单排序（唯一正确实现）

```
1. 只取 status == Verified(2) 的成绩
2. direction == 1 (HigherIsBetter) → value DESC
   direction == 2 (LowerIsBetter) → value ASC
3. 同值 → submittedAt 更早者优先
4. 仍相同 → recordId 更小者优先
```

**方向读 `Record.direction`（提交时固化的快照），不要读分类当前的方向**。分类方向虽然不可改，但成绩快照才是权威，历史数据不受规则变更影响。

`RecordRevoked` 一到，立刻把该成绩从榜单查询里排除（软删 `status=3` 即可，不要物理删除，要留历史）。

---

## 5. REST API 契约

路径沿用你现有的 `/api/*`，语义按 V2 改。所有 `uint256` 用**字符串**返回，时间用 ISO 字符串 + 原始秒数都给。

### 5.1 分类与榜单

```
GET /api/categories
→ [{ categoryId, name, descriptionURI, unit, decimals, direction, ruleVersion, baseStake, active, divisions: [{ divisionId, name, active }] }]

GET /api/leaderboard?categoryId=4&divisionId=1&limit=50&offset=0
→ {
    categoryId: 4, divisionId: 1, unit: "ms", decimals: 0, direction: 2,
    chainBest: { recordId: 1, value: "1152345" },
    entries: [
      { rank: 1, recordId: 1, player: "0x…", value: "1152345", displayValue: "19:12.345",
        status: "Verified", submittedAt: 1763..., txHash: "0x…" },
      …
    ]
  }
```

`displayValue` 由后端按 `unit` + `decimals` 格式化（例：`1152345` + `ms` → `19:12.345`；`1432` + `cps`/2 → `14.32`）。**不要在前端重复实现单位换算**，两端各写一遍必然不一致。

### 5.2 成绩

```
GET  /api/records?categoryId=&divisionId=&status=&player=&limit=&offset=
GET  /api/records/:recordId
POST /api/records        // 只做"链下暂存 + 校验"，真正的写入必须由前端钱包签名发交易
```

`POST /api/records` 的职责边界：校验参数、算 `requiredPayment`（读合约）、返回未签名交易参数。**私钥永远不进服务端**。

### 5.3 挑战与投票

```
GET  /api/challenges?recordId=&status=
GET  /api/challenges/:challengeId        // 含两轮 round 状态
GET  /api/voting?status=VOTING
GET  /api/voting/:challengeId            // 当前轮、commitEnd、revealEnd、已提交/已揭示人数
```

前端要用这些字段决定按钮显示，必须给：

- `currentRound`（0 或 1）
- `commitEnd` / `revealEnd`（Unix 秒）
- `committedVoters` / `revealedVoters` / `minVoters`
- `confirmPower` / `denyPower` / `quorumPower`
- `finalized`

### 5.4 用户

```
GET /api/users/:address            // 概览：成绩数、挑战数、可提取余额
GET /api/users/:address/records
GET /api/users/:address/votes
GET /api/users/:address/rewards
GET /api/users/:address/stakes
GET /api/users/:address/nfts
GET /api/users/:address/claimable  // 直接读链上 claimable(address)
```

`claimable` **必须实时读合约**，不能只信数据库：提现会改变它，而提现事件未必同一秒进库。

### 5.5 其他

```
GET /api/nfts?ownerAddress=&status=
GET /api/nfts/:tokenId
GET /api/reasons                   // 挑战理由列表（V1 的 /api/cheats 换成这个）
GET /api/health                    // 返回：最新已索引区块、落后块数、最近对账结果
```

`/api/health` 的"落后块数"和"对账结果"是给自己排障用的，务必做。

---

## 6. 枚举值（照抄，别自己编）

```
RecordStatus:    0 None, 1 Provisional, 2 Verified, 3 Revoked
ChallengeStatus: 0 None, 1 Voting, 2 EvidenceVoting, 3 Confirmed, 4 Denied, 5 Inconclusive
Choice:          0 None, 1 Confirm, 2 Deny
RankingDirection:0 None, 1 HigherIsBetter, 2 LowerIsBetter
StakeKind:       0 PlayerStake, 1 ChallengeBond, 2 VoterStake
SlashKind:       0 PlayerStake, 1 ChallengeBond, 2 VoterStake
RewardKind:      0 ChallengerReward, 1 PlayerCompensation, 2 VoterReward
ProposalStatus:  0 None, 1 Voting, 2 Approved, 3 Rejected, 4 Inconclusive
```

---

## 7. 常见 revert 文案映射（给前端提示用）

| revert | 含义 | 前端提示 |
|---|---|---|
| `division inactive` | 分类或 division 未开放 | 该榜暂不接受提交 |
| `evidence already used` | 证据哈希已提交过 | 这份证明已被使用 |
| `insufficient payment` | 付款不足 | 请刷新提交费用后重试 |
| `unknown reason` | 挑战理由不存在 | 理由无效 |
| `duplicate challenge` | 同成绩同理由已有未结挑战 | 已有进行中的挑战 |
| `pool cannot fund reward` | 特殊挑战奖励池不足 | 协议池暂不支持特殊挑战 |
| `stake out of range` | 投票质押超出范围 | 质押需在 0.05–5 MON |
| `commitment mismatch` | commitment 与 reveal 不一致 | 投票数据不匹配 |
| `not reveal phase` / `commit phase over` | 阶段错误 | 已过提交/揭示时间 |
| `window open` / `open challenges` | 还不能认证 | 挑战期未结束 |

---

## 8. 验收标准（做完自查）

1. `curl /api/leaderboard?categoryId=4&divisionId=1` 的第一名 `recordId` **等于** 链上 `bestRecordId(4,1)`
2. 分类 4 的 Java 榜按 `value` 升序（越低越好），分类 5 按降序（越高越好）
3. 同值成绩按 `submittedAt` 再按 `recordId` 排序，结果稳定
4. 重启索引器后不产生重复记录（幂等键生效）
5. 手动把索引游标回退 500 块重跑，数据最终一致
6. 任意时刻 `/api/users/:address/claimable` 与链上 `claimable(address)` 返回一致
7. `/api/health` 落后块数在 10 以内
8. 成绩被撤销后，`/api/leaderboard` 下一次请求就不再包含它，且榜首自动换成下一条 Verified

---

## 9. 优先级（建议排期）

**P0（必须先有，没这些演示和联调都做不了）**
- 分类 / division 索引 + `GET /api/categories`
- 成绩索引 + `GET /api/records`、`GET /api/records/:id`
- 榜单查询 + 与 `bestRecordId` 对账
- `GET /api/leaderboard`

**P1（对外可用性）**
- 挑战 / 两轮投票 / 证据索引
- `GET /api/challenges*`、`GET /api/voting*`
- 用户维度接口 + `claimable` 实时读

**P2（可信度）**
- 奖励 / 罚没 / 提现流水
- NFT 状态（`verificationStatus` 实时读，撤销后仍保留）
- 重组回滚 + `/api/health`

---

## 10. 不要做的事

- ❌ 不要保留任何 V1 的 `game` / `cheat` 字段或 ABI，混着用会写出错的榜单
- ❌ 不要用 `number` 表示链上金额或成绩值
- ❌ 不要相信"数据库里第一名"而不和 `bestRecordId` 对账
- ❌ 不要物理删除被撤销的成绩，状态改成 Revoked，历史要留
- ❌ 不要在服务端保存私钥或代签交易
- ❌ 不要遍历链上排行榜堆，合约只暴露 `bestRecordId`，完整榜单只能从事件构建

---

## 11. 联调起步命令

```bash
# 当前榜一
cast call 0x1eb96bf618151adA2F7174CE9b8c41F45486084F "bestRecordId(uint256,uint256)(uint256)" 4 1 \
  --rpc-url https://testnet-rpc.monad.xyz

# 某条成绩
cast call 0x1eb96bf618151adA2F7174CE9b8c41F45486084F \
  "getRecord(uint256)((address,uint256,uint256,uint256,uint8,bytes32,string,uint256,uint64,uint64,uint32,uint8,bool,uint32))" 1 \
  --rpc-url https://testnet-rpc.monad.xyz

# 全部参数（周期、押金、阈值）
cast call 0x1eb96bf618151adA2F7174CE9b8c41F45486084F \
  "params()((uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint32,uint64,uint64,uint64,uint64,uint16,uint16,uint16,uint16,uint16,uint16))" \
  --rpc-url https://testnet-rpc.monad.xyz
```

ABI 和对接流程细节见 `docs/INTEGRATION.md`，本文件只讲后端该做什么。
