# RunProof — 提交用项目简介（可直接粘到表单）

## 项目名

RunProof

## 一句话

任何可量化成绩的链上排行榜：速通时间、点击手速、体能数据都能上榜，排名和真伪由合约与社区判定，不由平台。

## 问题

现在每个成绩榜单都是平台私有的：速通在 speedrun.com，手速在别的网站，健身记录在某个 App。
平台既是裁判又是当事人——**说你作弊你就下榜，删你记录你拿不出证据**，跨平台也无法互认。

## 方案

RunProof 把"成绩 + 证据 + 判定过程"全部放到链上：

1. **管理员只开分类**：定单位（ms / cps / reps）、定排序方向（越高越好 / 越低越好）、定精度。
   分类创建后方向与单位不可改，历史成绩语义不会被篡改。
2. **任何人都能提交**：成绩按精度归一化成整数（19:12.345 → `1152345` ms），附证据哈希与 URI，质押 MON。
   成绩优于当前榜首时自动要求更高质押。
3. **挑战期 + 社区投票**：过了挑战期无人质疑即自动认证；有人质疑则进入 **Commit-Reveal 匿名投票**
   （先承诺后揭示，防跟票），达标即撤销或维持，奖惩自动结算。
4. **链上权威榜首**：`bestRecordId(categoryId, divisionId)` 由合约维护，榜首被撤销时**在同一交易内**
   自动回退到下一名 Verified，不存在"榜没人管"的空窗。
5. **认证 NFT**：Verified 成绩可铸 NFT，永远铸给成绩本人；撤销后不销毁，状态变为 Revoked，链上留痕。

## 为什么是链上

- 排名规则写在合约里，平台无法暗中改榜
- 投票匿名且可验证，判罚有据可查
- 成绩、证据、质押、奖惩全部可追溯
- 任何人都能基于事件建自己的榜单前端，不依赖单一平台

## 技术实现

- Solidity 0.8.28 + Foundry，via-IR，优化 200 次
- 4 个合约：`CategoryRegistry`、`ChallengeReasonRegistry`、`RunProofCore`、`RecordNFT`
- 排行榜用 lazy-cleaned heap，O(log n) 维护榜首，撤销时惰性清理
- 测试：31 个功能测试 + 3 个不变量（资金偿付能力、预留不超池、进行中挑战一致性），
  实测 32/32 通过，随机 9600 次 handler 调用 0 revert
- 前端演示：单文件 HTML + viem，直接从链上事件重建榜单并与 `bestRecordId` 每轮对账

## 部署（Monad Testnet，chain 10143）

| 合约 | 地址 |
|---|---|
| CategoryRegistry | `0x8D3aEdd92fA2151F61877D0e844a556E4eAB91A7` |
| ChallengeReasonRegistry | `0x522d2883FA6ac437F414874B9B7cEEAfAE4caC0b` |
| RunProofCore | `0x1eb96bf618151adA2F7174CE9b8c41F45486084F` |
| RecordNFT | `0x967D0B53cb05BC9D6c85BEB087444e6f5a3e1360` |

四个合约源码已在 MonadVision（Sourcify）**全部验证通过（perfect match）**。

## 已跑通的演示链路

- 分类 `Minecraft Any%`（ms，越低越好，Java / Bedrock 两个 division）
- 分类 `Click Speed`（cps，精度 2，越高越好）
- 8 条成绩已认证进榜
- 一条伪造成绩（18:59.999）登顶后被 5 人投票（80% 确认）撤销，榜首自动回退到 19:12.345
- 投票者收益：投对 0.1 → 0.2075 MON，投错罚没只剩 0.007 MON；挑战者 0.42 → 1.31 MON
- 认证 NFT：#1 Verified，#9 Revoked（保留）

## 代码

GitHub：`github.com/gitgdut/RunProof`（分支 `contracts/core`）

- `docs/INTEGRATION.md` — 前后端对接与 ABI 用法
- `docs/BACKEND-HANDOFF.md` — 索引器与 API 规格
- `docs/DEMO.md` — 5 分钟演示脚本
- `web/demo.html` — 演示用榜单页

## 路线图

1. **索引器 + 公共 API**：从事件构建完整榜单，提供分类、成绩、挑战、投票、用户资产接口，
   每轮与链上 `bestRecordId` 对账
2. **前端**：提交、挑战、投票、榜单、NFT 完整交互
3. **多签与治理**：分类创建与参数调整移交多签/社区
4. **主网**：Monad 主网部署，接入真实赛事与健身数据

## 一句话收尾

**成绩这件事，应该有一个中立的地方存着。**
