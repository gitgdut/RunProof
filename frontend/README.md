# RunProof V2 Frontend

React + TypeScript + Vite + Viem 前端工作台，保留冷调三层棱镜玻璃质感（Prismatic Frosted Infra Glass），全面对齐 **RunProof V2 通用链上成绩认证与排行协议**（`contracts/core` · Monad Testnet `Chain ID: 10143`）。

## 核心功能模块（全部对齐 V2 合约与接口）

1. **Protocol Dashboard**：实时聚合 `Total Records`、`Verified Records`、`Active Challenges`、`Total MON Staked`、`Community Voters`、`Protocol Rewards Pool`，并支持 `Live Monad Testnet (10143)` 与 `Demo Mode` 一键切换。
2. **Global Leaderboard**：动态读取 `CategoryRegistry`（含 `Tetris Score [Classic / Sprint / Marathon]`、`Minecraft Any% [Java / Bedrock]`、`Click Speed`、`100m Sprint`、`Pull-ups`），只以 `Verified` 入正式榜并校验链上 `bestRecordId`。
3. **Submit Record**：支持分类/组别校验、`bigint` 整数成绩预览、客户端本地 `keccak256` 计算 Replay/录屏哈希、实时读取 `requiredPayment` / `requiredStake` / `submissionFee` / 预估 Gas 与挑战期限。
4. **Record Details**：右侧详单展示玩家地址、质押与结算状态、挑战窗口倒计时、浏览器端原始文件 `keccak256` 核验、`finalizeRecord`、`RecordNFT.mint` 与实时 `verificationStatus`。
5. **Challenge Reason Registry**：展示 `R001–R005`（兼容映射 V1 `C001–C005`），并支持社区提交新理由提案 `proposeReason`、投票 `voteOnProposal` 及 `finalizeProposal`。
6. **Community Voting**：展示 Confirm / Deny 投票权比例与 **75% 通过门槛标记**、法定票权及倒计时，内置 `commitVote`（自动持久化 Salt 至 `localStorage`）、`revealVote`、当事人 `submitEvidence`、`finalizeVoting` 与 `claimVote`。
7. **User Profile**：查询任意 EVM 地址或已连接钱包的提交记录、投票历史、双合约可提取余额（`RunProofCore.claimable` + `ChallengeReasonRegistry.claimable`）与持有的 `RecordNFT` 证书。

## 已对齐的 V2 合约部署（Monad Testnet · 10143）

- `CategoryRegistry`: `0x8D3aEdd92fA2151F61877D0e844a556E4eAB91A7`
- `ChallengeReasonRegistry`: `0x522d2883FA6ac437F414874B9B7cEEAfAE4caC0b`
- `RunProofCore`: `0x1eb96bf618151adA2F7174CE9b8c41F45486084F`
- `RecordNFT`: `0x967D0B53cb05BC9D6c85BEB087444e6f5a3e1360`

## 本地开发与构建

```bash
npm install
cp .env.example .env.local
npm run dev
npm run build
```
