import { useEffect, useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { AlertTriangle, CheckCircle2, FileUp, Gavel, Lock, Unlock, X } from 'lucide-react';
import {
  challengeStatusLabel,
  choiceLabel,
  formatContractError,
} from '../config/contracts';
import {
  challengeRecordOnChain,
  claimVoteOnChain,
  commitVoteOnChain,
  fetchUserVoteOnChain,
  finalizeVotingOnChain,
  formatCountdown,
  formatMon,
  formatUnixTime,
  hashFileKeccak256,
  loadVoteSalt,
  revealVoteOnChain,
  shortenAddress,
  submitEvidenceOnChain,
} from '../lib/chain';
import {
  ChallengeStatus,
  Choice,
  RecordStatus,
  type Address,
  type ChallengeItem,
  type ChallengeReasonInfo,
  type CoreParams,
  type Hex,
  type RecordItem,
  type UserVoteState,
} from '../lib/types';

interface Props {
  open: boolean;
  mode: 'create' | 'manage';
  demoMode: boolean;
  onClose: () => void;
  record: RecordItem | null;
  challenge: ChallengeItem | null;
  reasons: ChallengeReasonInfo[];
  params: CoreParams | null;
  poolBalance: bigint;
  reservedPool: bigint;
  account: Address | null;
  nowSec: number;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export function ChallengeVoteDrawer({
  open,
  mode,
  demoMode,
  onClose,
  record,
  challenge,
  reasons,
  params,
  poolBalance,
  reservedPool,
  account,
  nowSec,
  onSuccess,
  onError,
}: Props) {
  const [reasonId, setReasonId] = useState<string>('1');
  const [evidenceHash, setEvidenceHash] = useState('');
  const [evidenceURI, setEvidenceURI] = useState('');
  const [voteChoice, setVoteChoice] = useState<Choice>(Choice.Confirm);
  const [voteStakeInput, setVoteStakeInput] = useState('0.1');
  const [manualChoice, setManualChoice] = useState<Choice>(Choice.Confirm);
  const [manualSalt, setManualSalt] = useState('');
  const [userVote, setUserVote] = useState<UserVoteState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || mode !== 'manage' || !challenge || !account || demoMode) {
      setUserVote(null);
      return;
    }
    let cancelled = false;
    fetchUserVoteOnChain(challenge.challengeId, challenge.round, account)
      .then((res) => {
        if (!cancelled) setUserVote(res);
      })
      .catch(() => {
        if (!cancelled) setUserVote(null);
      });
    const cached = loadVoteSalt(challenge.challengeId, challenge.round, account);
    if (cached) {
      setManualChoice(cached.choice);
      setManualSalt(cached.salt);
    } else {
      setManualSalt('');
    }
    return () => {
      cancelled = true;
    };
  }, [open, mode, demoMode, challenge, account]);

  if (!open) return null;

  async function handleHashFile(file: File | undefined) {
    if (!file) return;
    try {
      const digest = await hashFileKeccak256(file);
      setEvidenceHash(digest);
      if (!evidenceURI.trim()) {
        setEvidenceURI(`ipfs://runproof-challenge/${file.name}`);
      }
    } catch (err) {
      onError(formatContractError(err));
    }
  }

  async function handleCreateChallenge() {
    if (demoMode) {
      onError('Demo Mode 下仅展示交互界面，请切换为 Live Monad Testnet 后签名提交');
      return;
    }
    if (!record || !params) return;
    const cleanHash = evidenceHash.trim();
    const cleanUri = evidenceURI.trim();
    if (!BYTES32_RE.test(cleanHash) || !cleanUri) {
      onError('请提供合法的 32 字节 evidenceHash 和 evidenceURI');
      return;
    }
    const isSpecial =
      record.status === RecordStatus.Verified ||
      (BigInt(nowSec) > record.deadline && record.activeChallenges === 0);
    const bondWei = isSpecial
      ? params.challengeBond * params.specialBondMultiplier
      : params.challengeBond;

    setBusy(true);
    try {
      const res = await challengeRecordOnChain({
        recordId: record.recordId,
        reasonId: BigInt(reasonId),
        evidenceHash: cleanHash as Hex,
        evidenceURI: cleanUri,
        bondWei,
      });
      onSuccess(
        res.challengeId !== null
          ? `挑战 #${res.challengeId.toString()} 已创建，已进入 Round 0 Commit 阶段`
          : `挑战交易已确认 (${res.txHash.slice(0, 10)}...)`,
      );
      setEvidenceHash('');
      setEvidenceURI('');
      onClose();
    } catch (err) {
      onError(formatContractError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitEvidence() {
    if (demoMode) {
      onError('Demo Mode 不发送真实上链交易');
      return;
    }
    if (!challenge) return;
    const cleanHash = evidenceHash.trim();
    const cleanUri = evidenceURI.trim();
    if (!BYTES32_RE.test(cleanHash) || !cleanUri) {
      onError('请填写 32 字节 evidenceHash 与 evidenceURI');
      return;
    }
    setBusy(true);
    try {
      const tx = await submitEvidenceOnChain(
        challenge.challengeId,
        cleanHash as Hex,
        cleanUri,
      );
      onSuccess(`补充证据已提交至当前轮次 (${tx.slice(0, 10)}...)`);
      setEvidenceHash('');
      setEvidenceURI('');
      onClose();
    } catch (err) {
      onError(formatContractError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCommitVote() {
    if (demoMode) {
      onError('Demo Mode 不发送真实上链交易，请切回 Live 模式');
      return;
    }
    if (!challenge) return;
    let stakeWei: bigint;
    try {
      stakeWei = parseEther(voteStakeInput.trim());
    } catch {
      onError('请输入合法的 MON 质押数额');
      return;
    }
    setBusy(true);
    try {
      const res = await commitVoteOnChain(
        challenge.challengeId,
        challenge.round,
        voteChoice,
        stakeWei,
      );
      onSuccess(
        `Commit 已上链，盐值已保存至 localStorage (${res.txHash.slice(0, 10)}...)`,
      );
      onClose();
    } catch (err) {
      onError(formatContractError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevealVote() {
    if (demoMode) {
      onError('Demo Mode 不发送真实上链交易');
      return;
    }
    if (!challenge) return;
    if (!BYTES32_RE.test(manualSalt.trim())) {
      onError('未找到本地盐值记录，请手动填入完整的 32 字节 salt');
      return;
    }
    setBusy(true);
    try {
      const tx = await revealVoteOnChain(
        challenge.challengeId,
        manualChoice,
        manualSalt.trim() as Hex,
      );
      onSuccess(`Reveal 揭示成功 (${tx.slice(0, 10)}...)`);
      onClose();
    } catch (err) {
      onError(formatContractError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalizeVoting() {
    if (demoMode) {
      onError('Demo Mode 不发送真实上链交易');
      return;
    }
    if (!challenge) return;
    setBusy(true);
    try {
      const tx = await finalizeVotingOnChain(challenge.challengeId);
      onSuccess(`本轮投票结算交易已确认 (${tx.slice(0, 10)}...)`);
      onClose();
    } catch (err) {
      onError(formatContractError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClaimVote(roundIdx: number) {
    if (demoMode) {
      onError('Demo Mode 不发送真实上链交易');
      return;
    }
    if (!challenge) return;
    setBusy(true);
    try {
      const tx = await claimVoteOnChain(challenge.challengeId, roundIdx);
      onSuccess(`Round ${roundIdx} 投票本金/奖励已划入 claimable (${tx.slice(0, 10)}...)`);
      onClose();
    } catch (err) {
      onError(formatContractError(err));
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'create' && record) {
    const isSpecial =
      record.status === RecordStatus.Verified ||
      (BigInt(nowSec) > record.deadline && record.activeChallenges === 0);
    const bondWei = params
      ? isSpecial
        ? params.challengeBond * params.specialBondMultiplier
        : params.challengeBond
      : 0n;
    const freePool = poolBalance > reservedPool ? poolBalance - reservedPool : 0n;
    const poolSufficient = !isSpecial || !params || freePool >= params.specialReward;

    return (
      <div className="drawer-backdrop" onClick={onClose}>
        <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head">
            <div>
              <span className="eyebrow">RunProofCore · challengeRecord</span>
              <h3 className="title-slim" style={{ fontSize: 17, marginTop: 2 }}>
                对成绩 #{record.recordId.toString()} 发起链上挑战
              </h3>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
              <X size={16} />
            </button>
          </div>
          <div className="drawer-body">
            <div className={`notice-box ${isSpecial ? 'warn' : ''}`}>
              {isSpecial ? (
                <>
                  <strong>特殊挑战 (Verified 后置纠错)</strong>：需缴纳{' '}
                  <span className="mono">{params ? formatMon(bondWei) : '-'}</span>{' '}
                  保证金（{params?.specialBondMultiplier.toString()}x 倍率），奖励由协议池预留（当前可用池{' '}
                  <span className="mono">{formatMon(freePool)}</span>）。
                </>
              ) : (
                <>
                  <strong>窗口期普通挑战</strong>：需缴纳{' '}
                  <span className="mono">{params ? formatMon(bondWei) : '-'}</span>{' '}
                  保证金；挑战成立则从被挑战玩家质押分配奖励。
                </>
              )}
            </div>

            {!poolSufficient && (
              <div className="notice-box danger">
                协议自由资金池低于 specialReward ({params ? formatMon(params.specialReward) : '-'})，特殊挑战将被合约拒绝。
              </div>
            )}

            <div className="field">
              <label>挑战理由 (ChallengeReasonRegistry)</label>
              <select value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
                {reasons.map((r) => (
                  <option key={r.reasonId.toString()} value={r.reasonId.toString()}>
                    {r.code} · {r.name}
                  </option>
                ))}
              </select>
              {reasons.find((r) => r.reasonId.toString() === reasonId)?.description && (
                <span className="sub-muted">
                  {reasons.find((r) => r.reasonId.toString() === reasonId)?.description}
                </span>
              )}
            </div>

            <div className="clear-card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span className="eyebrow">挑战反证材料</span>
                  <p className="sub-muted">本地计算反证文件 keccak256 或输入已有摘要</p>
                </div>
                <label className="mini-btn" style={{ cursor: 'pointer' }}>
                  <FileUp size={13} />
                  计算哈希
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => handleHashFile(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            <div className="field">
              <label>反证 evidenceHash (bytes32)</label>
              <input
                className="mono"
                value={evidenceHash}
                onChange={(e) => setEvidenceHash(e.target.value)}
                placeholder="0x..."
              />
            </div>

            <div className="field">
              <label>反证 evidenceURI</label>
              <input
                value={evidenceURI}
                onChange={(e) => setEvidenceURI(e.target.value)}
                placeholder="ipfs://..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="pill-btn" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="pill-btn warn"
                disabled={demoMode || busy || !poolSufficient || !BYTES32_RE.test(evidenceHash.trim())}
                onClick={handleCreateChallenge}
              >
                <Gavel size={14} />
                {busy ? '交易确认中...' : `支付 ${params ? formatMon(bondWei) : ''} 发起挑战`}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!challenge) return null;
  const activeRound =
    challenge.round === 1 && challenge.round1 ? challenge.round1 : challenge.round0;
  const commitEnd = activeRound?.commitEnd ?? 0n;
  const revealEnd = activeRound?.revealEnd ?? 0n;
  const isVotableStatus =
    challenge.status === ChallengeStatus.Voting ||
    challenge.status === ChallengeStatus.EvidenceVoting;
  const inCommitPhase = isVotableStatus && BigInt(nowSec) < commitEnd;
  const inRevealPhase =
    isVotableStatus && BigInt(nowSec) >= commitEnd && BigInt(nowSec) < revealEnd;
  const readyFinalize =
    isVotableStatus && BigInt(nowSec) >= revealEnd && activeRound && !activeRound.finalized;
  const isParty =
    !!account &&
    (account.toLowerCase() === challenge.challenger.toLowerCase() ||
      (!!record && account.toLowerCase() === record.player.toLowerCase()));
  const reasonInfo = reasons.find((r) => r.reasonId === challenge.reasonId);

  const totalPower = activeRound ? activeRound.confirmPower + activeRound.denyPower : 0n;
  const confirmPct =
    totalPower > 0n ? Number((activeRound!.confirmPower * 10000n) / totalPower) / 100 : 0;
  const denyPct = totalPower > 0n ? Math.max(0, 100 - confirmPct) : 0;
  const thresholdPct = params ? params.approvalBps / 100 : 75;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span className="eyebrow">
              Challenge #{challenge.challengeId.toString()} · Record #{challenge.recordId.toString()}
            </span>
            <h3 className="title-slim" style={{ fontSize: 17, marginTop: 2 }}>
              {reasonInfo
                ? `${reasonInfo.code} · ${reasonInfo.name}`
                : `Reason #${challenge.reasonId.toString()}`}
            </h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="drawer-body">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="rp-tag monad">{challengeStatusLabel(challenge.status)}</span>
            {challenge.special && <span className="rp-tag warn">Special 特殊挑战</span>}
            {challenge.extended && <span className="rp-tag">已触发近半数/未达法定人数延期</span>}
            <span className="rp-tag">证据数 {challenge.evidenceCount}</span>
          </div>

          {/* 75% Passing Threshold Visualizer */}
          {activeRound && (
            <div className="clear-card" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                <span>
                  Confirm {confirmPct.toFixed(1)}% ({activeRound.confirmPower.toString()} power)
                </span>
                <span className="mono">通过门槛 {thresholdPct}%</span>
                <span>
                  Deny {denyPct.toFixed(1)}% ({activeRound.denyPower.toString()} power)
                </span>
              </div>
              <div className="threshold-track">
                <div className="threshold-confirm" style={{ width: `${confirmPct}%` }} />
                <div className="threshold-deny" style={{ width: `${denyPct}%` }} />
                <div
                  className="threshold-marker"
                  style={{ left: `${thresholdPct}%` }}
                  title={`${thresholdPct}% Passing Threshold`}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10.5 }} className="sub-muted">
                <span>总质押：{formatMon(activeRound.committedStake)}</span>
                <span>
                  Quorum: {totalPower.toString()} / {params?.quorumPower.toString() ?? '300'} · Voters:{' '}
                  {activeRound.revealedVoters} / {params?.minVoters ?? 3}
                </span>
              </div>
            </div>
          )}

          <div className="clear-card" style={{ marginBottom: 14 }}>
            <div className="kv-row">
              <span>挑战者</span>
              <span className="mono">{shortenAddress(challenge.challenger)}</span>
            </div>
            <div className="kv-row">
              <span>挑战保证金 (bond)</span>
              <span className="mono">{formatMon(challenge.bond)}</span>
            </div>
            <div className="kv-row">
              <span>反证 URI</span>
              <span className="mono" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {challenge.evidenceURI}
              </span>
            </div>
            <div className="kv-row">
              <span>Commit 截止</span>
              <span>
                {formatUnixTime(commitEnd)} · {formatCountdown(commitEnd, nowSec)}
              </span>
            </div>
            <div className="kv-row">
              <span>Reveal 截止</span>
              <span>
                {formatUnixTime(revealEnd)} · {formatCountdown(revealEnd, nowSec)}
              </span>
            </div>
          </div>

          {inCommitPhase && isParty && (
            <div className="clear-card" style={{ marginBottom: 14 }}>
              <span className="eyebrow">当事人补充证据 · submitEvidence</span>
              <p className="sub-muted" style={{ margin: '4px 0 10px' }}>
                提交者与挑战者可在 Commit 截止前追加反证或自证材料。
              </p>
              <div className="field">
                <label>补充 evidenceHash (bytes32)</label>
                <input
                  className="mono"
                  value={evidenceHash}
                  onChange={(e) => setEvidenceHash(e.target.value)}
                  placeholder="0x..."
                />
              </div>
              <div className="field">
                <label>补充 evidenceURI</label>
                <input
                  value={evidenceURI}
                  onChange={(e) => setEvidenceURI(e.target.value)}
                  placeholder="ipfs://..."
                />
              </div>
              <button
                type="button"
                className="mini-btn"
                disabled={demoMode || busy}
                onClick={handleSubmitEvidence}
              >
                提交补充证据
              </button>
            </div>
          )}

          {inCommitPhase && !isParty && (
            <div className="clear-card" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Lock size={14} />
                <span className="eyebrow">Commit-Reveal 密封投票 · Round {challenge.round}</span>
              </div>
              {userVote && userVote.stake > 0n ? (
                <div className="notice-box ok" style={{ marginBottom: 0 }}>
                  你已在本轮 Commit 质押 <span className="mono">{formatMon(userVote.stake)}</span>，请于{' '}
                  {formatUnixTime(commitEnd)} 后执行 Reveal。
                </div>
              ) : (
                <>
                  <div className="grid-2" style={{ marginTop: 8, marginBottom: 10 }}>
                    <button
                      type="button"
                      className={`pill-btn ${voteChoice === Choice.Confirm ? 'primary' : ''}`}
                      onClick={() => setVoteChoice(Choice.Confirm)}
                    >
                      {choiceLabel(Choice.Confirm, challenge.round)}
                    </button>
                    <button
                      type="button"
                      className={`pill-btn ${voteChoice === Choice.Deny ? 'primary' : ''}`}
                      onClick={() => setVoteChoice(Choice.Deny)}
                    >
                      {choiceLabel(Choice.Deny, challenge.round)}
                    </button>
                  </div>
                  <div className="field">
                    <label>
                      投票质押 MON（范围{' '}
                      {params
                        ? `${formatEther(params.minVoteStake)} ~ ${formatEther(params.maxVoteStake)}`
                        : '0.05 ~ 5'}
                      ）
                    </label>
                    <input
                      value={voteStakeInput}
                      onChange={(e) => setVoteStakeInput(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="pill-btn primary"
                    disabled={demoMode || busy || !account}
                    onClick={handleCommitVote}
                  >
                    <Lock size={13} />
                    {busy ? '等待钱包确认...' : '提交密封投票 (commitVote)'}
                  </button>
                </>
              )}
            </div>
          )}

          {inRevealPhase && userVote && userVote.stake > 0n && !userVote.revealed && (
            <div className="clear-card" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Unlock size={14} />
                <span className="eyebrow">Reveal 阶段 · 揭示投票</span>
              </div>
              <p className="sub-muted" style={{ marginBottom: 8 }}>
                已提交质押 <span className="mono">{formatMon(userVote.stake)}</span>，未揭示或投错将触发部分罚没。
              </p>
              <div className="grid-2" style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className={`pill-btn ${manualChoice === Choice.Confirm ? 'primary' : ''}`}
                  onClick={() => setManualChoice(Choice.Confirm)}
                >
                  {choiceLabel(Choice.Confirm, challenge.round)}
                </button>
                <button
                  type="button"
                  className={`pill-btn ${manualChoice === Choice.Deny ? 'primary' : ''}`}
                  onClick={() => setManualChoice(Choice.Deny)}
                >
                  {choiceLabel(Choice.Deny, challenge.round)}
                </button>
              </div>
              <div className="field">
                <label>自动恢复或手动填入 Salt (bytes32)</label>
                <input
                  className="mono"
                  value={manualSalt}
                  onChange={(e) => setManualSalt(e.target.value)}
                  placeholder="0x..."
                />
              </div>
              <button
                type="button"
                className="pill-btn primary"
                disabled={demoMode || busy}
                onClick={handleRevealVote}
              >
                <Unlock size={13} />
                {busy ? '交易确认中...' : '揭示投票 (revealVote)'}
              </button>
            </div>
          )}

          {readyFinalize && (
            <div className="notice-box warn">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span>Reveal 阶段已结束，任何人均可触发投票结算 (finalizeVoting)。</span>
                <button
                  type="button"
                  className="pill-btn warn"
                  disabled={demoMode || busy}
                  onClick={handleFinalizeVoting}
                >
                  <AlertTriangle size={13} />
                  执行 finalizeVoting
                </button>
              </div>
            </div>
          )}

          {activeRound?.finalized && userVote && userVote.stake > 0n && !userVote.claimed && (
            <div className="notice-box ok">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span>Round {challenge.round} 已结算，可领取本金与胜方奖励。</span>
                <button
                  type="button"
                  className="pill-btn ok"
                  disabled={demoMode || busy}
                  onClick={() => handleClaimVote(challenge.round)}
                >
                  <CheckCircle2 size={13} />
                  领取 claimVote
                </button>
              </div>
            </div>
          )}

          {challenge.round === 1 && challenge.round0?.finalized && (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="mini-btn"
                disabled={demoMode || busy || !account}
                onClick={() => handleClaimVote(0)}
              >
                检查并领取 Round 0 结算 (claimVote round 0)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
