import { ExternalLink, Server, X } from 'lucide-react';
import {
  CONTRACTS,
  DEPLOYMENT_BLOCK,
  MONAD_CHAIN_ID,
  MONAD_RPC_URL,
  explorerAddressUrl,
} from '../config/contracts';
import { formatMon } from '../lib/chain';
import type { BackendHealth, CoreParams } from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  params: CoreParams | null;
  poolBalance: bigint;
  reservedPool: bigint;
  health: BackendHealth;
  dataSource: 'api' | 'rpc';
}

export function ProtocolDrawer({
  open,
  onClose,
  params,
  poolBalance,
  reservedPool,
  health,
  dataSource,
}: Props) {
  if (!open) return null;

  const contractEntries = [
    ['RunProofCore (V2 核心托管/排行/投票)', CONTRACTS.RunProofCore],
    ['CategoryRegistry (通用分类与组别)', CONTRACTS.CategoryRegistry],
    ['ChallengeReasonRegistry (挑战理由)', CONTRACTS.ChallengeReasonRegistry],
    ['RecordNFT (实时状态证书 NFT)', CONTRACTS.RecordNFT],
  ] as const;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span className="eyebrow">Protocol & Contracts · V2</span>
            <h3 className="title-slim" style={{ fontSize: 17, marginTop: 2 }}>
              Monad Testnet 部署与协议参数
            </h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="drawer-body">
          <div className={`notice-box ${health.online ? 'ok' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Server size={13} />
              <strong>
                当前数据源：{dataSource === 'api' ? 'V2 索引后端 (/api)' : 'Monad Testnet RPC 直读'}
              </strong>
            </div>
            <div>
              Chain ID <span className="mono">{MONAD_CHAIN_ID}</span> · 起始块{' '}
              <span className="mono">{DEPLOYMENT_BLOCK.toString()}</span> · RPC{' '}
              <span className="mono">{MONAD_RPC_URL}</span>
            </div>
            {health.online && (
              <div style={{ marginTop: 4 }}>
                最新索引块：<span className="mono">{health.latestIndexedBlock ?? '-'}</span> · 落后块数：
                <span className="mono">{health.lagBlocks ?? '-'}</span>
              </div>
            )}
          </div>

          <div className="grid-2" style={{ marginBottom: 14 }}>
            <div className="stat-box">
              <span className="eyebrow">协议总奖励池 (poolBalance)</span>
              <strong className="mono">{formatMon(poolBalance)}</strong>
            </div>
            <div className="stat-box">
              <span className="eyebrow">特殊挑战已预留 (reservedPool)</span>
              <strong className="mono">{formatMon(reservedPool)}</strong>
            </div>
          </div>

          {params && (
            <div className="clear-card" style={{ marginBottom: 14 }}>
              <span className="eyebrow">RunProofCore.params() 实时链上配置</span>
              <div style={{ marginTop: 8 }}>
                <div className="kv-row">
                  <span>提交手续费 / 基础挑战押金</span>
                  <span className="mono">
                    {formatMon(params.submissionFee)} / {formatMon(params.challengeBond)}
                  </span>
                </div>
                <div className="kv-row">
                  <span>特殊挑战倍率 / 协议池悬赏</span>
                  <span className="mono">
                    {params.specialBondMultiplier.toString()}x / {formatMon(params.specialReward)}
                  </span>
                </div>
                <div className="kv-row">
                  <span>投票质押范围 (min - max)</span>
                  <span className="mono">
                    {formatMon(params.minVoteStake)} ~ {formatMon(params.maxVoteStake)}
                  </span>
                </div>
                <div className="kv-row">
                  <span>法定票权 / 最少投票人 / 通过门槛</span>
                  <span className="mono">
                    {params.quorumPower.toString()} power / {params.minVoters} voters /{' '}
                    {(params.approvalBps / 100).toFixed(0)}%
                  </span>
                </div>
                <div className="kv-row">
                  <span>周期 (Window / Commit / Reveal / Ext)</span>
                  <span className="mono">
                    {params.challengeWindow.toString()}s / {params.commitPeriod.toString()}s /{' '}
                    {params.revealPeriod.toString()}s / {params.extensionPeriod.toString()}s
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="clear-card">
            <span className="eyebrow">已验证 V2 合约地址 (MonadExplorer)</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {contractEntries.map(([label, addr]) => (
                <a
                  key={addr}
                  href={explorerAddressUrl(addr)}
                  target="_blank"
                  rel="noreferrer"
                  className="hash-box"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                >
                  <div>
                    <span>{label}</span>
                    <div className="mono">{addr}</div>
                  </div>
                  <ExternalLink size={13} style={{ flexShrink: 0 }} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
