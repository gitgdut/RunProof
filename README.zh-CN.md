# RunProof — 通用的链上成绩排名

[English](README.md) · **简体中文**

**任何可以被量化的成绩，都能在链上排名；排名本身由合约计算，争议由加权质押投票裁决。** 这不是又一个游戏排行榜：Minecraft 速通、点击速度、引体向上、考试成绩——只要能用整数表达，就能上榜。

状态：已部署在 **Monad Testnet（chain `10143`）**，源码在 MonadVision 上 **4/4 完全匹配**，**32/32 测试通过**。

**在线入口**

- 排行榜（浏览器内直接读链）：https://gitgdut.github.io/RunProof/
- 4 分钟演示（无声、带字幕分镜）：https://gitgdut.github.io/RunProof/record.html
- 演示视频：_待补_
- 合约：见下表（均已在 `testnet.monadexplorer.com` 上验证）

> **中文简介**
> RunProof 把「成绩 + 证据 + 判定过程」全部放到链上：管理员只开分类（定单位、定越高越好还是越低越好），
> 任何人都能提交成绩并质押 MON，过了挑战期自动认证；有人质疑就进入 Commit-Reveal 匿名投票。
> 榜首由合约维护（`bestRecordId`），成绩被撤销时**同一笔交易内**自动回退到下一名 Verified，
> 不需要管理员改榜。已跑通：一条伪造成绩登顶后被社区 80% 投票撤销，榜首自动回退。

---

## 为什么要做

今天每一个排行榜都归平台所有，而平台既是裁判又是利益相关方。成绩可以被删掉，作弊可以被毫无证据地指控，两个平台之间也互不承认彼此的成绩。RunProof 把排名规则、证据和裁决一起搬到链上，让结果任何人都能复核。

## 工作方式

1. **只有管理员能创建分类** —— 单位、`HigherIsBetter` / `LowerIsBetter`、小数位、基准质押、规则版本。方向、单位和精度一旦创建就不可修改。
2. **任何人都能提交** —— 成绩被归一化成整数（19:12.345 → `1152345` ms），同时给出证据哈希与 URI，并质押 MON。要顶掉当前榜首需要更高的质押额（`leaderMultiplierBps`）。
3. **挑战窗口** —— 窗口内无人质疑，任何人都可以调 `finalizeRecord`，成绩转为 Verified。
4. **争议** —— `challengeRecord` 开启 Commit-Reveal 投票（先交哈希、后揭示，没人能跟票）。确认作弊则撤销成绩并结算罚没与奖励。
5. **权威榜首** —— `bestRecordId(categoryId, divisionId)` 由一个惰性清理的堆维护。榜首被撤销时，下一条 Verified 成绩会在**同一笔交易里**成为榜首。
6. **凭证** —— Verified 成绩可以铸 NFT（`tokenId == recordId`），永远铸给提交者。撤销不会销毁它，只是状态变为 `Revoked`。

## 现场演示

完整的 V2 界面支持钱包连接、成绩提交、投票、个人主页，并直接读 Monad Testnet：

```bash
cd frontend
npm install
npm run dev
```

仓库里还带一个免构建的只读版本：

```bash
python3 -m http.server 8787        # 在仓库根目录执行
# 打开 http://127.0.0.1:8787/web/demo.html
```

单文件、免构建（viem + 公共 RPC）。它用 `RecordSubmitted` 日志重建榜单、按分类规则排序，并在每次刷新时告诉你本地第一名是否仍等于链上的 `bestRecordId`。

### 链上已经有什么

| 分类 | Division | 榜首 | 规则 |
|---|---|---|---|
| `Minecraft Any%` | Java | 19:12.345（`1152345` ms） | 越低越好 |
| `Minecraft Any%` | Bedrock | 20:00.345（`1200345` ms） | 越低越好 |
| `Click Speed` | All | 14.32（`1432` cps） | 越高越好，2 位小数 |

- `recordId` 1–8 均为 Verified
- `recordId` 9 —— 一条伪造的 `18:59.999` —— 曾冲到榜首，被挑战后以确认权值 **400 对反对 100（80%）** 投票撤销；`bestRecordId(4,1)` 在同一笔交易里回退到 `recordId` 1
- 站对边的投票者：`0.1` → `0.2075` MON；投错票的人只拿回 `0.007`；挑战者：`0.42` → `1.31` MON
- `RecordNFT` #1 为 `Verified`；#9 仍归提交者所有，但状态为 `Revoked`

演示期在链上被压缩，整套流程约 2.5 分钟跑完（窗口 60s / commit 30s / reveal 30s / 延期 30s）。

## 合约（Monad Testnet，`10143`）

| 合约 | 地址 | 职责 |
|---|---|---|
| `CategoryRegistry` | `0x8D3aEdd92fA2151F61877D0e844a556E4eAB91A7` | 分类、division、单位、规则版本、基准质押、方向 |
| `ChallengeReasonRegistry` | `0x522d2883FA6ac437F414874B9B7cEEAfAE4caC0b` | 通用挑战理由，支持社区提案 |
| `RunProofCore` | `0x1eb96bf618151adA2F7174CE9b8c41F45486084F` | 提交、榜首、挑战、Commit-Reveal 投票、MON 结算 |
| `RecordNFT` | `0x967D0B53cb05BC9D6c85BEB087444e6f5a3e1360` | ERC-721 凭证；认证状态实时读取 |

四个合约都在 **Sourcify / MonadVision 上验证通过（完全匹配）**——在 `testnet.monadexplorer.com` 打开任意地址即可看到源码。部署区块 `81509823`；地址、交易、构造参数与演示证据都记录在 [`deployments/monad-testnet-v2.json`](deployments/monad-testnet-v2.json)。上一版游戏专用的部署保留在 `monad-testnet-v1.json`，**不能**与 V2 ABI 混用。

## 排名模型

- 每次提交都会把分类、division、归一化整数值、证据哈希、证据 URI、规则版本、状态与质押写到链上。
- 每个分类声明 `HigherIsBetter` 或 `LowerIsBetter`。数值相同则按提交时间更早优先，再按 `recordId` 更小优先。
- `bestRecordId(categoryId, divisionId)` 是权威榜首，由惰性清理的堆维护。
- 完整排名由事件派生；只有 `Verified` 属于正式榜单。`Provisional` 可以单独展示，但不能混进去。
- 每个分类的排序方向、单位与精度不可变，历史成绩的含义因此不会被改写；规则内容变化只提升 `ruleVersion`。

## 生命周期

1. `submitRecord` 支付提交费与分类基准质押；如果可能成为新榜首，质押按倍数计算。
2. 窗口内无人挑战 → 任何人调 `finalizeRecord`，状态转为 Verified，质押进入可提取余额。
3. `challengeRecord(recordId, reasonId, …)` 每个「成绩 + 理由」组合只能开一个挑战。
4. 投票者带 MON `commitVote`，`commitEnd` 之后 `revealVote`。未揭示或站错边都会被罚没。
5. 确认作弊 → 撤销成绩并分配罚没；驳回 → 提交者与正确投票者获得补偿；结果不明 → 退还保证金，成绩保留。
6. 票数接近或参与度不足时延长一次，之后可能进入「证据充分性」轮次。
7. Verified 成绩之后仍可被挑战，需要按倍数支付保证金，奖励由协议池出资。
8. 所有收益都先进 `claimable`，用户自己调 `withdraw()` 提取。
9. `RecordNFT.mint(recordId)` 对 Verified 成绩是无需许可的，但永远铸给提交者。

## 构建与测试

```bash
git submodule update --init --recursive
forge build
forge test -vv
```

31 个功能测试加一套不变量测试（偿付能力、reserved ≤ pool、`activeChallenges` 一致性）——**32/32 通过**，120 轮不变量、9,600 次 handler 调用、0 次 revert。

```bash
script/exportAbi.sh     # 任何对外接口变更后重新导出 abi/*.json
```

## 部署

```bash
cp .env.example .env
source .env
POOL_SEED=2000000000000000000 DEMO_PERIODS=1 \
forge script script/Deploy.s.sol --rpc-url "$MONAD_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast
```

`DEMO_PERIODS=1` 使用 10 分钟窗口与 2 分钟的 commit/reveal/延期；不加则默认 30 天 / 3 天 / 1 天 / 2 天。`PRIVATE_KEY` 带不带 `0x` 前缀都可以。

## 文档

| 文件 | 内容 |
|---|---|
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | ABI 用法、枚举、结构体布局、用户流程、前端按钮条件 |
| [`docs/BACKEND-HANDOFF.md`](docs/BACKEND-HANDOFF.md) | 索引器规范、事件清单、API 契约、V1→V2 迁移表 |
| [`docs/DEMO.md`](docs/DEMO.md) | 录屏清单与演示数据 |
| [`docs/DEMO-VOICEOVER.md`](docs/DEMO-VOICEOVER.md) | 5 分钟逐字讲稿 |
| [`docs/SUBMISSION.md`](docs/SUBMISSION.md) | 一页纸项目摘要 |

## 路线图

1. **索引器 + 公开 API** —— 从事件重建完整榜单，提供分类、成绩、挑战、投票与用户余额接口，每轮与 `bestRecordId` 对账。
2. **前端** —— 钱包连接、提交、挑战、Commit-Reveal 投票（刷新后仍能恢复 salt）、排行榜、个人面板。
3. **治理** —— 分类创建与参数修改先交给多签，再过渡到按质押加权的治理。
4. **主网** —— Monad 主网，接入真实赛事与健身数据。

## 已知限制

- 完整排名需要事件索引器；合约只暴露当前的权威榜首。
- 当前版本的分类创建与配置由 owner 管理——生产环境应换成多签。
- 防女巫靠经济手段：投票权是线性的，且单钱包的投票质押有上限。
- 挑战理由的提案投票按质押加权，但不是 Commit-Reveal。
- 合约尚未经过外部审计。
