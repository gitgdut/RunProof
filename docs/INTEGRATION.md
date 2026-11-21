# RunProof 合约对接文档（前端 / 后端）

> 由 `abi/*.json` 自动生成函数与事件签名，以 ABI 为准。ABI 重新生成：`script/exportAbi.sh`。

## 网络与地址

- Monad Testnet，Chain ID `10143`，RPC `https://testnet-rpc.monad.xyz`，原生币 MON
- 当前部署为**演示参数**：挑战期 10 分钟、Commit 2 分钟、Reveal 2 分钟、延期 2 分钟。正式参数（30 天 / 3 天 / 1 天 / 2 天）需要重新部署，**重新部署后地址会变**。

| 合约 | 地址 | ABI |
|---|---|---|
| RunProofCore | `0x606717FC7055B81C4290b34F9cA1E8123416b0Ab` | `abi/RunProofCore.json` |
| CheatRegistry | `0xc0df0A2342557D42D35F34913EDB28E0792Ff400` | `abi/CheatRegistry.json` |
| GameRegistry | `0x9906867e359F1C7d609f89f39beD4b15023601B0` | `abi/GameRegistry.json` |
| RecordNFT | `0x2bFb2e522e51A458b6317343ea6Ef8A5E454c6EE` | `abi/RecordNFT.json` |

## 枚举（数值即链上返回值）

- `RecordStatus`：0 None，1 Provisional，2 Verified，3 Revoked
- `ChallengeStatus`：0 None，1 Voting，2 EvidenceVoting，3 Confirmed，4 Denied，5 Inconclusive
- `Choice`：0 None，1 Confirm，2 Deny。证据充分性轮（round=1）中：1 = Evidence Sufficient，2 = Evidence Required
- `StakeKind`：0 PlayerStake，1 ChallengeBond，2 VoterStake；`SlashKind` 同序；`RewardKind`：0 ChallengerReward，1 PlayerCompensation，2 VoterReward
- Cheat ID 是数字：1=C001 Automated Input，2=C002 RNG Manipulation，3=C003 Memory Modification，4=C004 Replay Injection，5=C005 Modified Game Files。`CheatRegistry.getCheat(id).code` 取字符串编号
- Game：gameId=1 Tetris；modeId 1 Classic，2 Sprint，3 Marathon

## 关键流程与注意事项

1. **提交成绩前**先调 `requiredPayment(gameId, mode, score)`，把返回值作为 `msg.value`。多付的部分会进入 `claimable`，可提取。
2. **所有资金返还/奖励都不是自动转账**，而是记入 `claimable[地址]`，用户需调用 `withdraw()` 提取。前端要展示 `claimable` 并提供提取按钮。
3. **投票是两步**：`commitVote(challengeId, hash)`（附带质押 MON，0.05–5 MON）→ 到 `commitEnd` 后 `revealVote(challengeId, choice, salt)`。hash 必须用链上视图 `hashVote(challengeId, round, choice, salt, voter)` 计算，`round` 取 `getChallenge(id).round`。**salt 由前端本地保存**，丢了就无法揭示，会被罚没部分质押。
4. 窗口到期后，**任何人**可调用：`finalizeRecord`（无挑战且超过挑战期）、`finalizeVoting`（Reveal 结束后）。前端可以提供按钮或由后端定时触发。
5. 投票结算：`finalizeVoting` 之后，每个投票者对每个 round 各调一次 `claimVote(challengeId, round)`，再 `withdraw()`。
6. NFT：`RecordNFT.mint(recordId)` 仅 Verified 的成绩可铸，铸给玩家，tokenId == recordId。认证状态用 `verificationStatus(tokenId)`，**不要缓存**，撤销后 NFT 仍在，状态变 Revoked。
7. 挑战 30 天后的成绩仍可挑战（特殊挑战）：保证金 ×5，需要新的证据哈希。奖励池余额不足会 revert `pool cannot fund reward`。
8. 同一 (recordId, cheatId) 只能有一个有效挑战；上一个结果为 Inconclusive 时可用**新证据哈希**重新挑战。同一证据哈希不能重复使用。
9. 常见 revert 文案：`window open`、`open challenges`、`duplicate challenge`、`evidence already used`、`stake out of range`、`commitment mismatch`、`not reveal phase`、`commit phase over`。

## RunProofCore 函数

**写入：**

- `challengeRecord(uint256 recordId,uint256 cheatId,bytes32 evidenceHash,string evidenceURI)` → uint256 **payable**
- `claimVote(uint256 challengeId,uint8 round)`
- `commitVote(uint256 challengeId,bytes32 commitment)` **payable**
- `finalizeRecord(uint256 recordId)`
- `finalizeVoting(uint256 challengeId)`
- `fundPool()` **payable**
- `renounceOwnership()`
- `revealVote(uint256 challengeId,uint8 choice,bytes32 salt)`
- `setParams((uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint32,uint64,uint64,uint64,uint64,uint16,uint16,uint16,uint16,uint16,uint16) p)`
- `setStakeTiers(uint256[] thresholds,uint256[] stakes)`
- `submitEvidence(uint256 challengeId,bytes32 evidenceHash,string evidenceURI)`
- `submitRecord(uint256 gameId,uint256 gameMode,uint256 score,bytes32 evidenceHash,string evidenceURI)` → uint256 **payable**
- `transferOwnership(address newOwner)`
- `withdraw()`
- `withdrawPool(address to,uint256 amount)`

**只读：**

- `POWER_UNIT()` → uint256
- `challengeCount()` → uint256
- `challengeEvidenceUsed(bytes32 )` → bool
- `challengeOf(uint256 ,uint256 )` → uint256
- `cheats()` → address
- `claimable(address )` → uint256
- `evidenceUsed(bytes32 )` → bool
- `games()` → address
- `getChallenge(uint256 challengeId)` → (uint256,uint256,address,uint256,uint256,bytes32,string,uint64,uint8,uint8,bool,bool,uint32)
- `getRecord(uint256 recordId)` → (address,uint256,uint256,uint256,bytes32,string,uint256,uint64,uint64,uint32,uint32,uint8,bool,uint32)
- `hashVote(uint256 challengeId,uint8 round,uint8 choice,bytes32 salt,address voter)` → bytes32
- `owner()` → address
- `params()` → uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint32,uint64,uint64,uint64,uint64,uint16,uint16,uint16,uint16,uint16,uint16
- `poolBalance()` → uint256
- `recordCount()` → uint256
- `recordSummary(uint256 recordId)` → address,uint256,uint256,uint256,bytes32,uint8
- `requiredPayment(uint256 gameId,uint256 gameMode,uint256 score)` → uint256
- `requiredStake(uint256 gameId,uint256 gameMode,uint256 score)` → uint256
- `reservedPool()` → uint256
- `rounds(uint256 ,uint8 )` → uint64,uint64,uint256,uint256,uint256,uint256,uint256,uint32,uint32,bool,uint8,uint256,uint256,uint16
- `tierStakes(uint256 )` → uint256
- `tierThresholds(uint256 )` → uint256
- `verifiedTop(uint256 ,uint256 )` → uint256
- `votes(uint256 ,uint8 ,address )` → bytes32,uint256,uint8,bool,bool
- `votingPower(uint256 stake)` → uint256

## RunProofCore 事件

- `ChallengeCreated(indexed uint256 recordId, indexed uint256 cheatId, indexed address challenger, uint256 challengeId, uint256 bond, bool special, bytes32 evidenceHash, string evidenceURI, uint64 commitEnd)`
- `EvidenceSubmitted(indexed uint256 recordId, indexed uint256 cheatId, indexed address submitter, uint256 challengeId, uint8 round, bytes32 evidenceHash, string evidenceURI)`
- `EvidenceVotingStarted(indexed uint256 recordId, indexed uint256 cheatId, uint256 challengeId, uint64 commitEnd, uint64 revealEnd)`
- `OwnershipTransferred(indexed address previousOwner, indexed address newOwner)`
- `ParamsUpdated()`
- `PoolFunded(indexed address from, uint256 amount)`
- `PoolWithdrawn(indexed address to, uint256 amount)`
- `RecordRevoked(indexed uint256 recordId, indexed address player, indexed uint256 cheatId, uint256 challengeId)`
- `RecordSubmitted(indexed uint256 recordId, indexed address player, indexed uint256 gameId, uint256 gameMode, uint256 score, uint256 stake, bytes32 evidenceHash, string evidenceURI, uint64 deadline)`
- `RecordVerified(indexed uint256 recordId, indexed address player, indexed uint256 gameId, uint256 score)`
- `RewardDistributed(indexed uint256 recordId, indexed uint256 cheatId, indexed address account, uint256 amount, uint8 kind, uint256 challengeId)`
- `StakeReturned(indexed uint256 recordId, indexed uint256 cheatId, indexed address account, uint256 amount, uint8 kind)`
- `StakeSlashed(indexed uint256 recordId, indexed uint256 cheatId, indexed address account, uint256 amount, uint8 kind, uint256 challengeId)`
- `VoteCommitted(indexed uint256 recordId, indexed uint256 cheatId, indexed address voter, uint256 challengeId, uint8 round, uint256 stake)`
- `VoteRevealed(indexed uint256 recordId, indexed uint256 cheatId, indexed address voter, uint256 challengeId, uint8 round, uint8 choice, uint256 power)`
- `VotingExtended(indexed uint256 recordId, indexed uint256 cheatId, uint256 challengeId, uint64 newCommitEnd, uint64 newRevealEnd)`
- `VotingFinalized(indexed uint256 recordId, indexed uint256 cheatId, uint256 challengeId, uint8 outcome, uint8 round, uint256 confirmPower, uint256 denyPower)`
- `Withdrawn(indexed address account, uint256 amount)`

## RecordNFT 函数

**写入：**

- `approve(address to,uint256 tokenId)`
- `mint(uint256 recordId)` → uint256
- `safeTransferFrom(address from,address to,uint256 tokenId)`
- `safeTransferFrom(address from,address to,uint256 tokenId,bytes data)`
- `setApprovalForAll(address operator,bool approved)`
- `transferFrom(address from,address to,uint256 tokenId)`

**只读：**

- `balanceOf(address owner)` → uint256
- `core()` → address
- `getApproved(uint256 tokenId)` → address
- `isApprovedForAll(address owner,address operator)` → bool
- `isRevoked(uint256 tokenId)` → bool
- `name()` → string
- `ownerOf(uint256 tokenId)` → address
- `supportsInterface(bytes4 interfaceId)` → bool
- `symbol()` → string
- `tokenURI(uint256 tokenId)` → string
- `verificationStatus(uint256 tokenId)` → uint8

## RecordNFT 事件

- `Approval(indexed address owner, indexed address approved, indexed uint256 tokenId)`
- `ApprovalForAll(indexed address owner, indexed address operator, bool approved)`
- `NFTMinted(indexed uint256 recordId, indexed address player, indexed uint256 gameId, uint256 score, bytes32 evidenceHash)`
- `Transfer(indexed address from, indexed address to, indexed uint256 tokenId)`

## CheatRegistry 函数

**写入：**

- `claimVoteStake(uint256 id)`
- `finalizeProposal(uint256 id)`
- `fundRewards()` **payable**
- `proposeCheat(string name,string description,string evidenceURI)` → uint256 **payable**
- `registerCheat(string name,string description)` → uint256
- `renounceOwnership()`
- `setParams(uint256 bond,uint256 reward,uint64 period,uint256 minStake,uint256 maxStake,uint256 quorum,uint32 minVoters_,uint16 approval)`
- `transferOwnership(address newOwner)`
- `voteOnProposal(uint256 id,bool support)` **payable**
- `withdraw()`

**只读：**

- `POWER_UNIT()` → uint256
- `approvalBps()` → uint16
- `cheatCount()` → uint256
- `claimable(address )` → uint256
- `getCheat(uint256 cheatId)` → (string,string,string,address,uint64,bool)
- `isRegistered(uint256 cheatId)` → bool
- `maxVoteStake()` → uint256
- `minVoteStake()` → uint256
- `minVoters()` → uint32
- `nameTaken(bytes32 )` → bool
- `owner()` → address
- `proposalBond()` → uint256
- `proposalCount()` → uint256
- `proposals(uint256 )` → address,string,string,string,uint256,uint64,uint256,uint256,uint32,uint8,uint256
- `proposerReward()` → uint256
- `quorumPower()` → uint256
- `rewardBalance()` → uint256
- `votes(uint256 ,address )` → uint256,bool,bool
- `votingPeriod()` → uint64
- `votingPower(uint256 stake)` → uint256

## CheatRegistry 事件

- `CheatProposalFinalized(indexed uint256 proposalId, uint8 status, uint256 cheatId)`
- `CheatProposalVoted(indexed uint256 proposalId, indexed address voter, bool support, uint256 stake, uint256 power)`
- `CheatProposed(indexed uint256 proposalId, indexed address proposer, string name, uint256 bond, uint64 endTime)`
- `CheatRegistered(indexed uint256 cheatId, string code, string name, indexed address discoverer)`
- `DiscovererRewarded(indexed uint256 proposalId, indexed uint256 cheatId, indexed address proposer, uint256 amount)`
- `OwnershipTransferred(indexed address previousOwner, indexed address newOwner)`
- `RewardFunded(indexed address from, uint256 amount)`
- `Withdrawn(indexed address account, uint256 amount)`

## GameRegistry 函数

**写入：**

- `addGame(string name,uint32 gameVersion,uint32 ruleVersion)` → uint256
- `addMode(uint256 gameId,string name)` → uint256
- `renounceOwnership()`
- `setGameActive(uint256 gameId,bool active)`
- `setModeActive(uint256 gameId,uint256 modeId,bool active)`
- `transferOwnership(address newOwner)`
- `updateVersions(uint256 gameId,uint32 gameVersion,uint32 ruleVersion)`

**只读：**

- `CLASSIC()` → uint256
- `MARATHON()` → uint256
- `SPRINT()` → uint256
- `TETRIS()` → uint256
- `gameCount()` → uint256
- `games(uint256 )` → string,uint32,uint32,bool
- `isModeActive(uint256 gameId,uint256 modeId)` → bool
- `modeActive(uint256 ,uint256 )` → bool
- `modeCount(uint256 )` → uint256
- `modeNames(uint256 ,uint256 )` → string
- `owner()` → address
- `versions(uint256 gameId)` → uint32,uint32

## GameRegistry 事件

- `GameActiveSet(indexed uint256 gameId, bool active)`
- `GameRegistered(indexed uint256 gameId, string name, uint32 gameVersion, uint32 ruleVersion)`
- `GameVersionUpdated(indexed uint256 gameId, uint32 gameVersion, uint32 ruleVersion)`
- `ModeActiveSet(indexed uint256 gameId, indexed uint256 modeId, bool active)`
- `ModeRegistered(indexed uint256 gameId, indexed uint256 modeId, string name)`
- `OwnershipTransferred(indexed address previousOwner, indexed address newOwner)`
