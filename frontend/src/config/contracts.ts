import { defineChain, type Abi } from 'viem';
import deployment from './monad-testnet-v2.json';
import categoryRegistryAbiJson from '../abi/CategoryRegistry.json';
import challengeReasonRegistryAbiJson from '../abi/ChallengeReasonRegistry.json';
import runProofCoreAbiJson from '../abi/RunProofCore.json';
import recordNftAbiJson from '../abi/RecordNFT.json';
import {
  ChallengeStatus,
  Choice,
  ProposalStatus,
  RankingDirection,
  RecordStatus,
  type Address,
} from '../lib/types';

export const MONAD_RPC_URL =
  import.meta.env.VITE_MONAD_RPC_URL?.trim() || 'https://testnet-rpc.monad.xyz';

export const MONAD_CHAIN_ID = deployment.chainId;
export const DEPLOYMENT_BLOCK = BigInt(deployment.deploymentBlock);
export const EXPLORER_BASE = deployment.sourceVerification.explorerBase;
export const EXPLORER_TX_BASE = 'https://testnet.monadexplorer.com/tx/';

export const CONTRACTS = {
  CategoryRegistry: deployment.contracts.CategoryRegistry as Address,
  ChallengeReasonRegistry: deployment.contracts.ChallengeReasonRegistry as Address,
  RunProofCore: deployment.contracts.RunProofCore as Address,
  RecordNFT: deployment.contracts.RecordNFT as Address,
} as const;

export const ABIS = {
  CategoryRegistry: categoryRegistryAbiJson as unknown as Abi,
  ChallengeReasonRegistry: challengeReasonRegistryAbiJson as unknown as Abi,
  RunProofCore: runProofCoreAbiJson as unknown as Abi,
  RecordNFT: recordNftAbiJson as unknown as Abi,
} as const;

export const monadTestnet = defineChain({
  id: MONAD_CHAIN_ID,
  name: 'Monad Testnet',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [MONAD_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: 'MonadExplorer',
      url: 'https://testnet.monadexplorer.com',
    },
  },
  testnet: true,
});

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_BASE}${address}`;
}

export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER_TX_BASE}${txHash}`;
}

export function recordStatusLabel(status: RecordStatus): string {
  switch (status) {
    case RecordStatus.Provisional:
      return 'Provisional · 挑战期';
    case RecordStatus.Verified:
      return 'Verified · 已认证';
    case RecordStatus.Revoked:
      return 'Revoked · 已撤销';
    default:
      return 'None';
  }
}

export function challengeStatusLabel(status: ChallengeStatus): string {
  switch (status) {
    case ChallengeStatus.Voting:
      return 'Round 0 · 有效性投票';
    case ChallengeStatus.EvidenceVoting:
      return 'Round 1 · 证据充分性';
    case ChallengeStatus.Confirmed:
      return 'Confirmed · 挑战成立';
    case ChallengeStatus.Denied:
      return 'Denied · 挑战驳回';
    case ChallengeStatus.Inconclusive:
      return 'Inconclusive · 无定论';
    default:
      return 'None';
  }
}

export function proposalStatusLabel(status: ProposalStatus): string {
  switch (status) {
    case ProposalStatus.Voting:
      return 'Voting · 提案投票中';
    case ProposalStatus.Approved:
      return 'Approved · 已批准注册';
    case ProposalStatus.Rejected:
      return 'Rejected · 已驳回';
    case ProposalStatus.Inconclusive:
      return 'Inconclusive · 未达法定票数';
    default:
      return 'None';
  }
}

export function directionLabel(direction: RankingDirection): string {
  if (direction === RankingDirection.LowerIsBetter) return '越低越好 (LowerIsBetter)';
  if (direction === RankingDirection.HigherIsBetter) return '越高越好 (HigherIsBetter)';
  return '未指定';
}

export function choiceLabel(choice: Choice, round: number): string {
  if (round === 1) {
    if (choice === Choice.Confirm) return '证据充分 (Confirm)';
    if (choice === Choice.Deny) return '仍需证据 (Deny)';
  } else {
    if (choice === Choice.Confirm) return '认定违规 (Confirm Invalid)';
    if (choice === Choice.Deny) return '驳回质疑 (Deny Invalid)';
  }
  return 'None';
}

const REVERT_HINTS: Array<[RegExp, string]> = [
  [/division inactive/i, '该分类或赛区暂不接受提交'],
  [/evidence already used/i, '该证据摘要已在链上提交过，请更换原文件'],
  [/insufficient payment/i, '支付金额不足，请刷新 requiredPayment 后重试'],
  [/insufficient bond|bond too low/i, '保证金不足，请确认参数要求'],
  [/unknown reason/i, '挑战理由未注册或无效'],
  [/duplicate challenge/i, '同一成绩与相同理由已存在未结或已定论挑战'],
  [/pool cannot fund reward/i, '协议奖励池余额不足，暂不支持特殊挑战'],
  [/stake out of range/i, '投票质押超出 params 允许范围'],
  [/commitment mismatch/i, 'Commitment 与当前轮次 / 选项 / Salt / 地址不匹配'],
  [/not reveal phase/i, '当前不在 Reveal 揭示阶段'],
  [/commit phase over/i, '已超过本轮 Commit 截止时间'],
  [/reveal phase open/i, 'Reveal 阶段尚未结束，暂不可结算'],
  [/window open|open challenges/i, '挑战窗口未结束或仍有进行中挑战，暂不可认证'],
  [/party cannot vote|proposer cannot vote/i, '提交者与挑战/提案当事人不得参与投票'],
  [/own record/i, '不能挑战自己提交的成绩'],
  [/name taken/i, '该理由名称已注册或正在提案投票中'],
  [/user rejected|rejected the request/i, '已在钱包中取消签名'],
];

export function formatContractError(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.message} ${String((error as { shortMessage?: string }).shortMessage || '')}`
      : String(error);
  for (const [pattern, message] of REVERT_HINTS) {
    if (pattern.test(raw)) return `${message}`;
  }
  if (raw.length > 160) return `${raw.slice(0, 157)}...`;
  return raw;
}
