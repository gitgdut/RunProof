import { useEffect, useState } from 'react';
import { FileUp, Hash, ShieldCheck, X } from 'lucide-react';
import { formatContractError } from '../config/contracts';
import { precheckApiRecord } from '../lib/api';
import {
  formatCountdown,
  formatMon,
  formatRecordValue,
  hashFileKeccak256,
  readRequiredPayment,
  submitRecordOnChain,
} from '../lib/chain';
import {
  RankingDirection,
  type Address,
  type CategoryInfo,
  type CoreParams,
  type Hex,
} from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  demoMode: boolean;
  categories: CategoryInfo[];
  initialCategoryId: bigint;
  initialDivisionId: bigint;
  account: Address | null;
  params: CoreParams | null;
  nowSec: number;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export function SubmitRecordDrawer({
  open,
  onClose,
  demoMode,
  categories,
  initialCategoryId,
  initialDivisionId,
  account,
  params,
  nowSec,
  onSuccess,
  onError,
}: Props) {
  const [categoryId, setCategoryId] = useState<string>(initialCategoryId.toString());
  const [divisionId, setDivisionId] = useState<string>(initialDivisionId.toString());
  const [rawValue, setRawValue] = useState('12500');
  const [clientVersion, setClientVersion] = useState('1.21.4');
  const [evidenceURI, setEvidenceURI] = useState('');
  const [evidenceHash, setEvidenceHash] = useState('');
  const [fileName, setFileName] = useState('');
  const [payment, setPayment] = useState<{
    total: bigint;
    stake: bigint;
    gasCostWei: bigint;
  } | null>(null);
  const [loadingPay, setLoadingPay] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCategoryId(initialCategoryId.toString());
      setDivisionId(initialDivisionId.toString());
    }
  }, [open, initialCategoryId, initialDivisionId]);

  const selectedCategory =
    categories.find((c) => c.categoryId.toString() === categoryId) ?? categories[0];

  useEffect(() => {
    if (!selectedCategory) return;
    const validDiv = selectedCategory.divisions.some(
      (d) => d.divisionId.toString() === divisionId && d.active,
    );
    if (!validDiv && selectedCategory.divisions.length > 0) {
      const firstActive =
        selectedCategory.divisions.find((d) => d.active) ?? selectedCategory.divisions[0];
      setDivisionId(firstActive.divisionId.toString());
    }
  }, [selectedCategory, divisionId]);

  const parsedValue = (() => {
    const trimmed = rawValue.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const v = BigInt(trimmed);
    return v > 0n ? v : null;
  })();

  useEffect(() => {
    if (!open || demoMode || !selectedCategory || !parsedValue || !/^\d+$/.test(divisionId)) {
      setPayment(null);
      return;
    }
    let cancelled = false;
    setLoadingPay(true);
    readRequiredPayment(selectedCategory.categoryId, BigInt(divisionId), parsedValue)
      .then((res) => {
        if (!cancelled) setPayment(res);
      })
      .catch(() => {
        if (!cancelled) setPayment(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPay(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, demoMode, selectedCategory, divisionId, parsedValue]);

  if (!open) return null;

  async function handleFileSelect(file: File | undefined) {
    if (!file) return;
    try {
      const digest = await hashFileKeccak256(file);
      setEvidenceHash(digest);
      setFileName(file.name);
      if (!evidenceURI.trim()) {
        setEvidenceURI(
          `ipfs://runproof-evidence/${file.name}?v=${encodeURIComponent(clientVersion.trim() || '1.0')}`,
        );
      }
    } catch (err) {
      onError(formatContractError(err));
    }
  }

  async function handleSubmit() {
    if (demoMode) {
      onError('当前为 Demo Mode，请先切回 Live Monad Testnet 模式再提交真实链上交易');
      return;
    }
    if (!selectedCategory || !parsedValue) {
      onError('请输入大于 0 的整数归一化成绩');
      return;
    }
    const cleanHash = evidenceHash.trim();
    if (!BYTES32_RE.test(cleanHash)) {
      onError('evidenceHash 必须是 32 字节 0x 十六进制 keccak256 摘要');
      return;
    }
    const cleanUri = evidenceURI.trim();
    if (!cleanUri) {
      onError('请填写视频或 Replay 存证 URI（如 ipfs://... / https://...）');
      return;
    }
    setSubmitting(true);
    try {
      if (account) {
        await precheckApiRecord({
          categoryId: selectedCategory.categoryId.toString(),
          divisionId,
          value: parsedValue.toString(),
          evidenceHash: cleanHash as Hex,
          evidenceURI: cleanUri,
          player: account,
        });
      }
      const res = await submitRecordOnChain({
        categoryId: selectedCategory.categoryId,
        divisionId: BigInt(divisionId),
        value: parsedValue,
        evidenceHash: cleanHash as Hex,
        evidenceURI: cleanUri,
      });
      onSuccess(
        res.recordId !== null
          ? `成绩 #${res.recordId.toString()} 已上链（交易 ${res.txHash.slice(0, 10)}...）`
          : `成绩提交交易已确认（${res.txHash.slice(0, 10)}...）`,
      );
      setEvidenceHash('');
      setEvidenceURI('');
      setFileName('');
      onClose();
    } catch (err) {
      onError(formatContractError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const isLeaderBoosted =
    payment && selectedCategory && payment.stake > selectedCategory.baseStake;
  const expectedDeadline = params ? BigInt(nowSec) + params.challengeWindow : 0n;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span className="eyebrow">RunProofCore · submitRecord</span>
            <h3 className="title-slim" style={{ fontSize: 17, marginTop: 2 }}>
              提交成绩并质押上链
            </h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="drawer-body">
          {demoMode && (
            <div className="notice-box warn" style={{ marginTop: 0 }}>
              当前为 <strong>Demo Mode</strong>：可测试本地文件 <span className="mono">keccak256</span> 哈希与参数预览，发送交易前请切换为 <strong>Live Monad Testnet</strong>。
            </div>
          )}

          <div className="grid-2">
            <div className="field">
              <label>排行榜分类 (CategoryRegistry)</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option
                    key={c.categoryId.toString()}
                    value={c.categoryId.toString()}
                    disabled={!c.active}
                  >
                    #{c.categoryId.toString()} {c.name} ({c.unit})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>组别 / 游戏模式 (Division)</label>
              <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
                {(selectedCategory?.divisions ?? []).map((d) => (
                  <option
                    key={d.divisionId.toString()}
                    value={d.divisionId.toString()}
                    disabled={!d.active}
                  >
                    #{d.divisionId.toString()} {d.name} {d.active ? '' : '(已关闭)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>
                归一化整数成绩 ({selectedCategory?.unit || '-'} /{' '}
                {selectedCategory?.direction === RankingDirection.LowerIsBetter
                  ? '越低越好'
                  : '越高越好'}
                )
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={rawValue}
                onChange={(e) => setRawValue(e.target.value)}
                placeholder="例如 1152345 (ms) 或 984200 (points)"
              />
              {parsedValue !== null && selectedCategory && (
                <span className="sub-muted">
                  换算展示：{formatRecordValue(parsedValue, selectedCategory.unit, selectedCategory.decimals)}
                </span>
              )}
            </div>
            <div className="field">
              <label>客户端 / 游戏版本（写入 URI 元数据）</label>
              <input
                value={clientVersion}
                onChange={(e) => setClientVersion(e.target.value)}
                placeholder="如 1.21.4 / Classic-v2"
              />
              {selectedCategory && (
                <span className="sub-muted">合约规则版本：Rule v{selectedCategory.ruleVersion}</span>
              )}
            </div>
          </div>

          <div className="clear-card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <span className="eyebrow">Replay / 原始录屏本地 Hash 计算</span>
                <p className="sub-muted" style={{ marginTop: 3 }}>
                  上传 Replay 或视频片段在浏览器生成 <span className="mono">keccak256</span>，原始文件不上中心化库
                </p>
              </div>
              <label className="mini-btn" style={{ cursor: 'pointer', flexShrink: 0 }}>
                <FileUp size={13} />
                {fileName ? '重选 Replay' : '选择文件'}
                <input
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelect(e.target.files?.[0])}
                />
              </label>
            </div>
            {fileName && (
              <div style={{ marginTop: 8, fontSize: 11 }}>
                已计算文件：<span className="mono">{fileName}</span>
              </div>
            )}
          </div>

          <div className="field">
            <label>
              <Hash size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Evidence Hash (bytes32)
            </label>
            <input
              className="mono"
              value={evidenceHash}
              onChange={(e) => setEvidenceHash(e.target.value)}
              placeholder="0x..."
            />
          </div>

          <div className="field">
            <label>视频链接 / Replay evidenceURI (IPFS / URL)</label>
            <input
              value={evidenceURI}
              onChange={(e) => setEvidenceURI(e.target.value)}
              placeholder="ipfs://... 或 https://..."
            />
          </div>

          <div className="clear-card" style={{ marginTop: 14, marginBottom: 16 }}>
            <span className="eyebrow">动态费用与挑战窗口核算 · requiredPayment</span>
            {loadingPay ? (
              <p className="sub-muted" style={{ marginTop: 6 }}>读取合约实时质押参数中...</p>
            ) : (
              <div style={{ marginTop: 8 }}>
                <div className="kv-row">
                  <span>动态质押金额 (requiredStake)</span>
                  <span className="mono">
                    {payment
                      ? formatMon(payment.stake)
                      : selectedCategory
                        ? formatMon(selectedCategory.baseStake)
                        : '-'}
                  </span>
                </div>
                <div className="kv-row">
                  <span>协议提交手续费 (submissionFee)</span>
                  <span className="mono">{params ? formatMon(params.submissionFee) : '-'}</span>
                </div>
                <div className="kv-row">
                  <span>预估网络 Gas (~180k gas)</span>
                  <span className="mono">
                    {payment ? `~${formatMon(payment.gasCostWei, 5)}` : '~0.009 MON'}
                  </span>
                </div>
                <div className="kv-row">
                  <span>挑战期限 (challengeWindow)</span>
                  <span>
                    {params ? `${params.challengeWindow.toString()}s (${formatCountdown(expectedDeadline, nowSec)})` : '-'}
                  </span>
                </div>
                <div className="kv-row">
                  <span>合约应付总额 (msg.value)</span>
                  <strong className="mono">{payment ? formatMon(payment.total) : '-'}</strong>
                </div>
              </div>
            )}
            {isLeaderBoosted && (
              <div className="notice-box warn" style={{ marginBottom: 0 }}>
                该成绩优于当前榜首，触发合约 <span className="mono">leaderMultiplierBps</span> 榜首加倍质押（通过窗口后全额退回 <span className="mono">claimable</span>）。
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="pill-btn" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="pill-btn primary"
              disabled={demoMode || submitting || !parsedValue || !BYTES32_RE.test(evidenceHash.trim())}
              onClick={handleSubmit}
            >
              <ShieldCheck size={14} />
              {submitting ? '交易确认中...' : '签名调用 submitRecord'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
