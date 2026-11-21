import { useEffect, useState } from 'react';
import { formatEther, parseEther } from 'viem';
import {
  ArrowRight,
  Award,
  Coins,
  Plus,
  ShieldAlert,
  Trophy,
  UserCheck,
  Vote,
} from 'lucide-react';
import {
  formatContractError,
  proposalStatusLabel,
  recordStatusLabel,
} from '../config/contracts';
import {
  finalizeReasonProposalOnChain,
  formatCountdown,
  formatMon,
  formatRecordValue,
  formatUnixTime,
  proposeReasonOnChain,
  shortenAddress,
  voteReasonProposalOnChain,
  withdrawCoreOnChain,
  withdrawReasonClaimableOnChain,
} from '../lib/chain';
import {
  ChallengeStatus,
  ProposalStatus,
  RecordStatus,
  type Address,
  type CategoryInfo,
  type ChallengeItem,
  type ChallengeReasonInfo,
  type ReasonProposalInfo,
  type ReasonRegistryConfig,
  type RecordItem,
  type RecordNftStatus,
  type UserVoteState,
} from '../lib/types';

export function DashboardView({
  demoMode,
  categories,
  records,
  challenges,
  poolBalance,
  reservedPool,
  onSelectBoard,
  onOpenSubmit,
  onOpenVoting,
}: {
  demoMode: boolean;
  categories: CategoryInfo[];
  records: RecordItem[];
  challenges: ChallengeItem[];
  poolBalance: bigint;
  reservedPool: bigint;
  onSelectBoard: (categoryId: bigint, divisionId: bigint) => void;
  onOpenSubmit: () => void;
  onOpenVoting: () => void;
}) {
  const verifiedCount = records.filter((r) => r.status === RecordStatus.Verified).length;
  const activeChallenges = challenges.filter(
    (c) =>
      c.status === ChallengeStatus.Voting ||
      c.status === ChallengeStatus.EvidenceVoting,
  ).length;
  const totalRecordStakes = records.reduce((acc, r) => acc + r.stake, 0n);
  const totalChallengeStakes = challenges.reduce(
    (acc, c) =>
      acc +
      c.bond +
      (c.round0?.committedStake ?? 0n) +
      (c.round1?.committedStake ?? 0n),
    0n,
  );
  const totalStaked = totalRecordStakes + totalChallengeStakes + poolBalance;
  const voterCount = challenges.reduce(
    (acc, c) => acc + (c.round0?.committedVoters ?? 0) + (c.round1?.committedVoters ?? 0),
    0,
  );
  const totalRewardsReserve = poolBalance + reservedPool;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="clear-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <span className="rp-tag monad">
            {demoMode ? 'Demo Mode · 本地模拟数据' : 'Live Monad Testnet · 10143'}
          </span>
          <h3 className="title-slim" style={{ fontSize: 19, marginTop: 8 }}>
            RunProof 去中心化成绩与游戏纪录认证协议 (V2)
          </h3>
          <p className="sub-muted" style={{ marginTop: 4 }}>
            玩家质押 MON 提交原始证据哈希，社区通过两轮 Commit-Reveal 投票仲裁争议与榜单权重。
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="pill-btn primary" onClick={onOpenSubmit}>
            <Plus size={14} /> Submit Record
          </button>
          <button
            type="button"
            className="pill-btn"
            onClick={() => {
              const cat = categories[0];
              if (cat) onSelectBoard(cat.categoryId, cat.divisions[0]?.divisionId ?? 1n);
            }}
          >
            <Trophy size={14} /> Explore Leaderboard
          </button>
        </div>
      </div>

      {/* 6 Infra KPI Glass Cards */}
      <div className="grid-3">
        <div className="stat-box">
          <span className="eyebrow">Total Records</span>
          <strong>{records.length}</strong>
        </div>
        <div className="stat-box">
          <span className="eyebrow">Verified Records</span>
          <strong>{verifiedCount}</strong>
        </div>
        <div className="stat-box">
          <span className="eyebrow">Active Challenges</span>
          <strong>{activeChallenges}</strong>
        </div>
        <div className="stat-box">
          <span className="eyebrow">Total MON Staked</span>
          <strong className="mono">{formatMon(totalStaked, 2)}</strong>
        </div>
        <div className="stat-box">
          <span className="eyebrow">Community Voters</span>
          <strong>{voterCount}</strong>
        </div>
        <div className="stat-box">
          <span className="eyebrow">Protocol Rewards Pool</span>
          <strong className="mono">{formatMon(totalRewardsReserve, 2)}</strong>
        </div>
      </div>

      {/* Categories & Divisions Matrix (Tetris Classic/Sprint/Marathon + Minecraft + Click Speed) */}
      <div>
        <div className="flow-heading" style={{ marginTop: 4 }}>
          <span>链上已注册赛道分类 (CategoryRegistry)</span>
          <button type="button" className="mini-btn" onClick={onOpenVoting}>
            前往社区投票队列 <ArrowRight size={12} />
          </button>
        </div>
        <div className="grid-2">
          {categories.map((cat) => {
            const catRecs = records.filter((r) => r.categoryId === cat.categoryId);
            return (
              <div key={cat.categoryId.toString()} className="flow-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500, fontSize: 13.5 }}>{cat.name}</span>
                  <span className="rp-tag monad">{cat.unit}</span>
                </div>
                <p className="sub-muted" style={{ marginTop: 4 }}>
                  基础质押 {formatMon(cat.baseStake)} · {catRecs.length} 条提交 · 规则 v{cat.ruleVersion}
                </p>
                <div className="division-pills" style={{ paddingLeft: 0, paddingBottom: 0, marginTop: 8 }}>
                  {cat.divisions.map((div) => (
                    <button
                      key={div.divisionId.toString()}
                      type="button"
                      className="div-chip"
                      onClick={() => onSelectBoard(cat.categoryId, div.divisionId)}
                    >
                      {div.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ReasonRegistryView({
  demoMode,
  reasons,
  proposals,
  config,
  account,
  nowSec,
  onSuccess,
  onError,
}: {
  demoMode: boolean;
  reasons: ChallengeReasonInfo[];
  proposals: ReasonProposalInfo[];
  config: ReasonRegistryConfig | null;
  account: Address | null;
  nowSec: number;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceURI, setEvidenceURI] = useState('');
  const [voteStake, setVoteStake] = useState('0.05');
  const [busy, setBusy] = useState(false);

  async function handlePropose() {
    if (demoMode) {
      onError('Demo Mode 不发送真实链上提案，请切换为 Live Monad Testnet');
      return;
    }
    if (!name.trim() || !description.trim()) {
      onError('请填写提案理由名称和详细描述');
      return;
    }
    setBusy(true);
    try {
      const bond = config?.proposalBond ?? parseEther('0.1');
      const tx = await proposeReasonOnChain({
        name: name.trim(),
        description: description.trim(),
        evidenceURI: evidenceURI.trim() || 'ipfs://runproof-reason-proposal',
        bondWei: bond,
      });
      setName('');
      setDescription('');
      setEvidenceURI('');
      onSuccess(`挑战理由提案已上链 (${tx.slice(0, 10)}...)`);
    } catch (err) {
      onError(formatContractError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVoteProposal(proposalId: bigint, support: boolean) {
    if (demoMode) {
      onError('Demo Mode 不发送链上投票');
      return;
    }
    setBusy(true);
    try {
      const tx = await voteReasonProposalOnChain(
        proposalId,
        support,
        parseEther(voteStake.trim() || '0.05'),
      );
      onSuccess(`提案 #${proposalId.toString()} 投票成功 (${tx.slice(0, 10)}...)`);
    } catch (err) {
      onError(formatContractError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalizeProposal(proposalId: bigint) {
    if (demoMode) return;
    setBusy(true);
    try {
      const tx = await finalizeReasonProposalOnChain(proposalId);
      onSuccess(`提案 #${proposalId.toString()} 已结算 (${tx.slice(0, 10)}...)`);
    } catch (err) {
      onError(formatContractError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="notice-box" style={{ margin: 0 }}>
        <strong>V2 ChallengeReasonRegistry 升级对齐说明：</strong> 原 V1 作弊码 <span className="mono">C001–C005</span> 已抽象为通用挑战理由 <span className="mono">R001–R005</span>，支持社区质押提案并奖励新发现者。
      </div>

      <div className="board-table-wrap">
        <table className="board-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>名称 (Name)</th>
              <th>判定描述</th>
              <th>发现者 / 来源</th>
            </tr>
          </thead>
          <tbody>
            {reasons.map((r) => (
              <tr key={r.reasonId.toString()}>
                <td className="mono">{r.code}</td>
                <td style={{ fontWeight: 500 }}>{r.name}</td>
                <td className="sub-muted">{r.description}</td>
                <td className="mono">
                  {r.discoverer === '0x0000000000000000000000000000000000000000'
                    ? 'Genesis Core'
                    : shortenAddress(r.discoverer)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="clear-card">
        <span className="eyebrow">提交新挑战理由提案 · proposeReason</span>
        <p className="sub-muted" style={{ margin: '4px 0 10px' }}>
          提案押金：{config ? formatMon(config.proposalBond) : '0.1 MON'} · 投票通过奖励发现者：
          {config ? formatMon(config.proposerReward) : '0.1 MON'}
        </p>
        <div className="grid-2">
          <div className="field">
            <label>新理由名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如 Sub-frame TAS Splicing"
            />
          </div>
          <div className="field">
            <label>案例材料 evidenceURI</label>
            <input
              value={evidenceURI}
              onChange={(e) => setEvidenceURI(e.target.value)}
              placeholder="ipfs://..."
            />
          </div>
        </div>
        <div className="field">
          <label>判定规则说明</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述该违规/作弊行为的核验方法"
          />
        </div>
        <button
          type="button"
          className="pill-btn primary"
          disabled={demoMode || busy || !account}
          onClick={handlePropose}
        >
          <ShieldAlert size={13} />
          质押 {config ? formatMon(config.proposalBond) : '0.1 MON'} 提交提案
        </button>
      </div>

      {proposals.length > 0 && (
        <div className="flow-list">
          {proposals.map((p) => (
            <div key={p.proposalId.toString()} className="flow-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 500 }}>
                  Proposal #{p.proposalId.toString()} · {p.name}
                </span>
                <span className="rp-tag monad">{proposalStatusLabel(p.status)}</span>
              </div>
              <p className="sub-muted" style={{ marginTop: 4 }}>{p.description}</p>
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span className="mono" style={{ fontSize: 11 }}>
                  For {p.forPower.toString()} / Against {p.againstPower.toString()} · Voters {p.voters} ·{' '}
                  {formatCountdown(p.endTime, nowSec)}
                </span>
                {p.status === ProposalStatus.Voting && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      style={{ width: 74, padding: '4px 8px', fontSize: 11 }}
                      value={voteStake}
                      onChange={(e) => setVoteStake(e.target.value)}
                    />
                    <button
                      type="button"
                      className="mini-btn"
                      disabled={demoMode || busy}
                      onClick={() => handleVoteProposal(p.proposalId, true)}
                    >
                      <Vote size={12} /> 赞成
                    </button>
                    <button
                      type="button"
                      className="mini-btn"
                      disabled={demoMode || busy}
                      onClick={() => handleVoteProposal(p.proposalId, false)}
                    >
                      反对
                    </button>
                    {BigInt(nowSec) >= p.endTime && (
                      <button
                        type="button"
                        className="mini-btn"
                        disabled={demoMode || busy}
                        onClick={() => handleFinalizeProposal(p.proposalId)}
                      >
                        结算
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UserProfileView({
  demoMode,
  account,
  categories,
  records,
  coreClaimable,
  reasonClaimable,
  userVotes,
  userNfts,
  onSelectRecord,
  onSuccess,
  onError,
}: {
  demoMode: boolean;
  account: Address | null;
  categories: CategoryInfo[];
  records: RecordItem[];
  coreClaimable: bigint;
  reasonClaimable: bigint;
  userVotes: Array<{ challengeId: bigint; round: number; vote: UserVoteState }>;
  userNfts: RecordNftStatus[];
  onSelectRecord: (recordId: bigint) => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [inspectAddr, setInspectAddr] = useState('');
  const [busy, setBusy] = useState(false);

  const activeAddr =
    (/^0x[0-9a-fA-F]{40}$/.test(inspectAddr.trim())
      ? (inspectAddr.trim() as Address)
      : account) ?? null;

  const userRecords = activeAddr
    ? records.filter((r) => r.player.toLowerCase() === activeAddr.toLowerCase())
    : [];

  async function handleWithdrawCore() {
    if (demoMode) return;
    setBusy(true);
    try {
      const tx = await withdrawCoreOnChain();
      onSuccess(`RunProofCore 可提取余额已到账 (${tx.slice(0, 10)}...)`);
    } catch (err) {
      onError(formatContractError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdrawReason() {
    if (demoMode) return;
    setBusy(true);
    try {
      const tx = await withdrawReasonClaimableOnChain();
      onSuccess(`ReasonRegistry 可提取余额已到账 (${tx.slice(0, 10)}...)`);
    } catch (err) {
      onError(formatContractError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="clear-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserCheck size={16} />
            <div>
              <span className="eyebrow">账户资产与链上档案</span>
              <div className="mono" style={{ fontSize: 12.5 }}>
                {activeAddr || '未连接钱包（可粘贴任意 EVM 地址查询记录）'}
              </div>
            </div>
          </div>
          <input
            style={{ width: 280 }}
            className="mono"
            placeholder="输入 0x... 地址检索其他玩家记录"
            value={inspectAddr}
            onChange={(e) => setInspectAddr(e.target.value)}
          />
        </div>
      </div>

      {/* Dual Contract Claimable Panel */}
      <div className="grid-2">
        <div className="stat-box">
          <span className="eyebrow">RunProofCore.claimable</span>
          <strong className="mono">{formatEther(coreClaimable)} MON</strong>
          <button
            type="button"
            className="mini-btn"
            style={{ marginTop: 8 }}
            disabled={demoMode || busy || coreClaimable === 0n}
            onClick={handleWithdrawCore}
          >
            <Coins size={12} /> 提取 Core 奖励/退押
          </button>
        </div>
        <div className="stat-box">
          <span className="eyebrow">ChallengeReasonRegistry.claimable</span>
          <strong className="mono">{formatEther(reasonClaimable)} MON</strong>
          <button
            type="button"
            className="mini-btn"
            style={{ marginTop: 8 }}
            disabled={demoMode || busy || reasonClaimable === 0n}
            onClick={handleWithdrawReason}
          >
            <Coins size={12} /> 提取提案奖励
          </button>
        </div>
      </div>

      <div>
        <div className="flow-heading" style={{ marginTop: 4 }}>
          <span>提交的成绩记录 ({userRecords.length})</span>
        </div>
        {userRecords.length === 0 ? (
          <p className="sub-muted">当前地址暂无链上提交记录。</p>
        ) : (
          <div className="flow-list">
            {userRecords.map((rec) => {
              const cat = categories.find((c) => c.categoryId === rec.categoryId);
              return (
                <button
                  key={rec.recordId.toString()}
                  type="button"
                  className="flow-card"
                  onClick={() => onSelectRecord(rec.recordId)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono">
                      Record #{rec.recordId.toString()} · {cat?.name ?? `Cat #${rec.categoryId.toString()}`}
                    </span>
                    <span className="rp-tag">{recordStatusLabel(rec.status)}</span>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                    <span className="mono">
                      {cat ? formatRecordValue(rec.value, cat.unit, cat.decimals) : rec.value.toString()}
                    </span>
                    <span className="sub-muted">
                      质押 {formatMon(rec.stake)} · {formatUnixTime(rec.submittedAt)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="clear-card">
          <span className="eyebrow">参与的投票历史 ({userVotes.length})</span>
          {userVotes.length === 0 ? (
            <p className="sub-muted" style={{ marginTop: 6 }}>当前钱包在最近挑战中暂无投票。</p>
          ) : (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {userVotes.map((item) => (
                <div key={`${item.challengeId.toString()}-${item.round}`} className="kv-row">
                  <span className="mono">
                    Challenge #{item.challengeId.toString()} · R{item.round}
                  </span>
                  <span className="mono">
                    {formatMon(item.vote.stake)} ·{' '}
                    {item.vote.claimed ? '已领取' : item.vote.revealed ? '已揭示' : '未揭示'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="clear-card">
          <span className="eyebrow">持有的 RecordNFT 证书 ({userNfts.length})</span>
          {userNfts.length === 0 ? (
            <p className="sub-muted" style={{ marginTop: 6 }}>
              当前地址暂未铸造或持有 RecordNFT（Verified 成绩可零门槛为提交者铸造）。
            </p>
          ) : (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {userNfts.map((nft) => (
                <div key={nft.recordId.toString()} className="kv-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Award size={12} /> Token #{nft.recordId.toString()}
                  </span>
                  <span className={`rp-tag ${nft.status === RecordStatus.Revoked ? 'danger' : 'ok'}`}>
                    {nft.status !== undefined ? recordStatusLabel(nft.status) : 'Verified'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
