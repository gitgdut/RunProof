# RunProof V2 对接文档（前端 / 后端）

> V2 是通用成绩排名协议，不限定游戏。公开函数和事件的最终签名以 `abi/*.json` 为准。

## 当前部署状态

- 网络：Monad Testnet
- Chain ID：`10143`
- RPC：`https://testnet-rpc.monad.xyz`
- 原生资产：MON
- V2：**尚未部署**，不得把 V1 地址与 V2 ABI 混用
- V1 历史地址：仅保存在 `deployments/monad-testnet-v1.json`
- V2 部署后地址：写入 `deployments/monad-testnet-v2.json`

## 数据约定

- TypeScript 中所有 `uint*` 均使用 `bigint`；不要把成绩或金额转换成 `number`。
- MON 金额均为 wei。展示用 `formatEther`，输入用 `parseEther`。
- `uint64` 时间是 Unix 秒：`new Date(Number(timestamp) * 1000)`。
- `value` 是按分类精度归一化后的非零整数。例如 10.253 秒可使用单位 `ms`、精度 0、值 `10253`。
- `evidenceHash` 推荐对原始文件字节做 `keccak256`；`evidenceURI` 保存 IPFS 或对象存储 URI。
- 写交易返回的 ID 从事件解析，不从交易回执的函数返回值读取。

## 分类与排序

`CategoryRegistry.getCategory(categoryId)` 返回：

| 字段 | 含义 |
|---|---|
| `name` | 分类名称 |
| `descriptionURI` | 规则和说明地址 |
| `unit` | 单位，如 `ms`、`reps`、`points` |
| `decimals` | 展示精度 |
| `direction` | 0=None，1=HigherIsBetter，2=LowerIsBetter |
| `ruleVersion` | 当前规则版本 |
| `baseStake` | 基础提交质押（wei） |
| `active` | 分类是否开放 |

分类下还有一个或多个 division。提交前必须确认：

```text
CategoryRegistry.isDivisionActive(categoryId, divisionId) == true
```

排名规则：

1. 只把 `RecordStatus.Verified` 放入正式榜单。
2. 按分类的 `direction` 比较 `value`。
3. 值相等时，`submittedAt` 更早者优先。
4. 时间仍相等时，`recordId` 更小者优先。
5. `bestRecordId(categoryId, divisionId)` 是链上权威榜首。
6. 完整榜单由事件索引器生成；撤销记录必须立即从榜单移除。

排名方向、单位和精度创建后不可修改，避免历史成绩语义改变。规则内容变化应增加
`ruleVersion`，成绩会保存提交时的版本。

## 枚举

- `RecordStatus`：0 None，1 Provisional，2 Verified，3 Revoked
- `ChallengeStatus`：0 None，1 Voting，2 EvidenceVoting，3 Confirmed，4 Denied，5 Inconclusive
- `Choice`：0 None，1 Confirm，2 Deny
- Evidence Sufficiency 轮：1=Evidence Sufficient，2=Evidence Required
- `RankingDirection`：0 None，1 HigherIsBetter，2 LowerIsBetter
- `StakeKind` / `SlashKind`：0 PlayerStake，1 ChallengeBond，2 VoterStake
- `RewardKind`：0 ChallengerReward，1 PlayerCompensation，2 VoterReward
- `ProposalStatus`：0 None，1 Voting，2 Approved，3 Rejected，4 Inconclusive

## 核心结构

`RunProofCore.getRecord(recordId)`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `player` | address | 提交者 |
| `categoryId` / `divisionId` | uint256 | 所属榜单 |
| `value` | uint256 | 归一化成绩 |
| `direction` | uint8 | 提交时固化的排序方向 |
| `evidenceHash` / `evidenceURI` | bytes32 / string | 证明材料 |
| `stake` | uint256 | 提交质押 |
| `submittedAt` / `deadline` | uint64 | 提交和普通挑战截止时间 |
| `ruleVersion` | uint32 | 提交时规则版本 |
| `status` | uint8 | `RecordStatus` |
| `stakeSettled` | bool | 提交质押是否已结算 |
| `activeChallenges` | uint32 | 当前进行中的挑战数 |

`RunProofCore.getChallenge(challengeId)`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `recordId` / `reasonId` | uint256 | 被挑战成绩和原因 |
| `challenger` | address | 挑战者 |
| `bond` / `reserved` | uint256 | 保证金和特殊挑战预留奖励 |
| `evidenceHash` / `evidenceURI` | bytes32 / string | 挑战证据 |
| `createdAt` | uint64 | 创建时间 |
| `status` | uint8 | `ChallengeStatus` |
| `round` | uint8 | 0=有效性判断，1=证据充分性 |
| `special` / `extended` | bool | 特殊挑战 / 已延期 |
| `evidenceCount` | uint32 | 证据数量 |

## 用户流程

### 1. 提交成绩

1. 上传证据并计算 `evidenceHash`。
2. 调用 `requiredPayment(categoryId, divisionId, value)`。
3. 用返回值作为 `msg.value` 调用 `submitRecord`。
4. 从 `RecordSubmitted` 事件获取 `recordId`。

```ts
const payment = await publicClient.readContract({
  address: CORE,
  abi: coreAbi,
  functionName: 'requiredPayment',
  args: [categoryId, divisionId, value],
})

const hash = await walletClient.writeContract({
  account,
  address: CORE,
  abi: coreAbi,
  functionName: 'submitRecord',
  args: [categoryId, divisionId, value, evidenceHash, evidenceURI],
  value: payment,
})
```

基础质押来自分类配置。若成绩严格优于当前已验证榜首，则使用 `leaderMultiplierBps`。

### 2. 完成认证

当 `now > deadline`、状态为 Provisional 且 `activeChallenges == 0` 时，任何人可调用：

```text
finalizeRecord(recordId)
```

成功后状态变 Verified、进入正式排名，提交质押进入玩家的 `claimable`。

### 3. 发起挑战

先读取 `ChallengeReasonRegistry` 中的通用挑战理由，再调用：

```text
challengeRecord(recordId, reasonId, evidenceHash, evidenceURI)
```

普通保证金读取 `params().challengeBond`。Verified 成绩属于特殊挑战，保证金乘以
`specialBondMultiplier`，并要求协议池有足够的 `specialReward`。

### 4. Commit-Reveal 投票

```ts
import { bytesToHex, parseEther } from 'viem'

const challenge = await publicClient.readContract({
  address: CORE,
  abi: coreAbi,
  functionName: 'getChallenge',
  args: [challengeId],
})

const round = challenge.round
const choice = 1 // Confirm；Deny 为 2
const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
const commitment = await publicClient.readContract({
  address: CORE,
  abi: coreAbi,
  functionName: 'hashVote',
  args: [challengeId, round, choice, salt, account.address],
})

await walletClient.writeContract({
  account,
  address: CORE,
  abi: coreAbi,
  functionName: 'commitVote',
  args: [challengeId, commitment],
  value: parseEther('0.3'),
})
```

commit 成功后持久化 `{chainId, core, challengeId, round, choice, salt, voter}`。建议 key：

```text
runproof:10143:<core>:<challengeId>:<round>:<voter>
```

到 Reveal 阶段使用同一组值：

```ts
await walletClient.writeContract({
  account,
  address: CORE,
  abi: coreAbi,
  functionName: 'revealVote',
  args: [challengeId, choice, salt],
})
```

不要在 reveal 交易确认前删除 salt。未揭示或投错的一部分质押会被罚没。

### 5. 结算与提款

- `now >= revealEnd` 后，任何人调用 `finalizeVoting(challengeId)`。
- 投票者每轮调用一次 `claimVote(challengeId, round)`。
- 所有用户读取 `claimable(address)`，大于 0 时调用 `withdraw()`。
- `finalizeVoting`、`claimVote` 和 `withdraw` 是三个独立步骤。

### 6. NFT

- Verified 成绩可调用 `RecordNFT.mint(recordId)`。
- NFT 永远铸给成绩提交者，不是调用者。
- 展示时实时读取 `verificationStatus(tokenId)`。
- 成绩撤销后 NFT 不销毁，但状态变为 Revoked。

## 前端按钮条件

| 条件 | 动作 |
|---|---|
| Provisional、超过 deadline、无开放挑战 | `finalizeRecord` |
| `now < commitEnd` | `commitVote`；当事人可 `submitEvidence` |
| `commitEnd <= now < revealEnd` | `revealVote` |
| `now >= revealEnd && !finalized` | `finalizeVoting` |
| 该轮已结算且投票未领取 | `claimVote` |
| `claimable(account) > 0` | `withdraw` |
| Verified 且 NFT 不存在 | `RecordNFT.mint` |

## 后端索引

V2 完整榜单依赖事件索引。合约部署并在 Monad 浏览器完成源码验证后，再初始化 Envio
HyperIndex。

必须处理的事件：

- `CategoryCreated`、`CategoryUpdated`、`DivisionCreated`
- `RecordSubmitted`、`RecordVerified`、`RecordRevoked`
- `LeaderboardUpdated`
- `ChallengeCreated`、`EvidenceSubmitted`
- `VoteCommitted`、`VoteRevealed`、`VotingFinalized`
- `StakeReturned`、`StakeSlashed`、`RewardDistributed`、`Withdrawn`

索引要求：

1. 从 V2 部署区块开始同步。
2. 原始日志唯一键使用 `(chainId, transactionHash, logIndex)`。
3. 保存交易 hash，供前端链接浏览器。
4. 处理区块重组并支持回滚重放。
5. 榜单只查询 Verified；收到 `RecordRevoked` 立即移除。
6. 用链上 `direction` 排序，再按 `submittedAt`、`recordId` 处理平分。
7. 定期校验索引第一名是否等于链上 `bestRecordId`。

## 常见错误

- `division inactive`：分类或 division 未开放
- `evidence already used`：证据摘要已提交
- `insufficient payment`：提交费和质押不足
- `unknown reason`：挑战理由不存在
- `duplicate challenge`：同成绩、同理由已有非 Inconclusive 挑战
- `pool cannot fund reward`：特殊挑战奖励池不足
- `stake out of range`：投票质押不在允许范围
- `commitment mismatch`：round、choice、salt 或 voter 不一致
- `not reveal phase` / `commit phase over`：操作阶段错误
- `window open` / `open challenges`：成绩还不能自动认证

## 联调验收

- 钱包不在 Chain ID `10143` 时阻止写入。
- 支持 HigherIsBetter 和 LowerIsBetter 两类榜单。
- 所有金额和成绩值使用 `bigint`。
- 提交金额始终实时读取 `requiredPayment`。
- commit 后刷新页面仍能恢复 salt 并成功 reveal。
- 榜首被撤销后，页面榜首与链上 `bestRecordId` 一致。
- Provisional、Verified、Revoked 不混淆。
- 完成 `finalizeVoting -> claimVote -> withdraw` 全流程。
- NFT 撤销后保留，并显示 Revoked。
