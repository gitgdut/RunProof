import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Coins,
  ExternalLink,
  FileCheck2,
  Gavel,
  LayoutDashboard,
  Layers,
  Plus,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Trophy,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { ChallengeVoteDrawer } from './components/ChallengeVoteDrawer';
import { ProtocolDrawer } from './components/ProtocolDrawer';
import { SubmitRecordDrawer } from './components/SubmitRecordDrawer';
import {
  DashboardView,
  ReasonRegistryView,
  UserProfileView,
} from './components/WorkspaceViews';
import {
  MONAD_CHAIN_ID,
  challengeStatusLabel,
  directionLabel,
  explorerAddressUrl,
  explorerTxUrl,
  formatContractError,
  recordStatusLabel,
} from './config/contracts';
import {
  fetchApiCategories,
  fetchApiHealth,
  fetchApiLeaderboard,
  fetchApiReasons,
} from './lib/api';
import {
  connectWallet,
  ensureMonadTestnet,
  fetchChainBestRecordId,
  fetchChainCategories,
  fetchChainChallenges,
  fetchChainCoreParams,
  fetchChainReasons,
  fetchChainRecords,
  fetchDualClaimable,
  fetchReasonRegistryData,
  fetchRecordNftStatus,
  fetchUserVotesForChallenges,
  finalizeRecordOnChain,
  formatCountdown,
  formatMon,
  formatRecordValue,
  formatUnixTime,
  getInjectedProvider,
  getWalletSnapshot,
  hashFileKeccak256,
  mintRecordNftOnChain,
  shortenAddress,
  sortVerifiedRecords,
  withdrawCoreOnChain,
} from './lib/chain';
import {
  DEMO_CATEGORIES,
  DEMO_PROPOSALS,
  DEMO_REASONS,
  buildDemoChallenges,
  buildDemoRecords,
} from './lib/demoData';
import {
  ChallengeStatus,
  RecordStatus,
  type Address,
  type BackendHealth,
  type CategoryInfo,
  type ChallengeItem,
  type ChallengeReasonInfo,
  type CoreParams,
  type ReasonProposalInfo,
  type ReasonRegistryConfig,
  type RecordItem,
  type RecordNftStatus,
  type UserVoteState,
} from './lib/types';
import { usePrismaticLight } from './lib/usePrismaticLight';

type ActiveSection =
  | 'dashboard'
  | 'leaderboard'
  | 'voting'
  | 'reasons'
  | 'profile';
type MobilePane = 'board' | 'inspector';

function statusBadgeClass(status: RecordStatus): string {
  if (status === RecordStatus.Verified) return 'ok';
  if (status === RecordStatus.Provisional) return 'warn';
  if (status === RecordStatus.Revoked) return 'danger';
  return '';
}

function challengeBadgeClass(status: ChallengeStatus): string {
  if (status === ChallengeStatus.Confirmed) return 'danger';
  if (status === ChallengeStatus.Denied) return 'ok';
  if (
    status === ChallengeStatus.Voting ||
    status === ChallengeStatus.EvidenceVoting
  ) {
    return 'monad';
  }
  return 'warn';
}

export default function App() {
  const [contrast, setContrast] = useState(false);
  usePrismaticLight(!contrast);

  const [demoMode, setDemoMode] = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>('dashboard');
  const [showUnverifiedRows, setShowUnverifiedRows] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePane>('board');

  const [account, setAccount] = useState<Address | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [coreClaimable, setCoreClaimable] = useState<bigint>(0n);
  const [reasonClaimable, setReasonClaimable] = useState<bigint>(0n);

  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<bigint>(3n);
  const [selectedDivisionId, setSelectedDivisionId] = useState<bigint>(1n);

  const [reasons, setReasons] = useState<ChallengeReasonInfo[]>([]);
  const [reasonProposals, setReasonProposals] = useState<ReasonProposalInfo[]>([]);
  const [reasonConfig, setReasonConfig] = useState<ReasonRegistryConfig | null>(null);

  const [params, setParams] = useState<CoreParams | null>(null);
  const [poolBalance, setPoolBalance] = useState<bigint>(0n);
  const [reservedPool, setReservedPool] = useState<bigint>(0n);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [apiBoardEntries, setApiBoardEntries] = useState<RecordItem[] | null>(null);
  const [chainBestId, setChainBestId] = useState<bigint>(0n);
  const [dataSource, setDataSource] = useState<'api' | 'rpc'>('rpc');
  const [health, setHealth] = useState<BackendHealth>({ online: false });

  const [selectedRecordId, setSelectedRecordId] = useState<bigint | null>(null);
  const [nftStatus, setNftStatus] = useState<RecordNftStatus | null>(null);
  const [nftStatusMap, setNftStatusMap] = useState<Record<string, RecordNftStatus>>({});
  const [userVotes, setUserVotes] = useState<
    Array<{ challengeId: bigint; round: number; vote: UserVoteState }>
  >([]);
  const [userNfts, setUserNfts] = useState<RecordNftStatus[]>([]);

  const [verifyMatch, setVerifyMatch] = useState<'idle' | 'match' | 'mismatch'>('idle');
  const [verifyFileName, setVerifyFileName] = useState('');

  const [submitOpen, setSubmitOpen] = useState(false);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const [challengeDrawer, setChallengeDrawer] = useState<{
    open: boolean;
    mode: 'create' | 'manage';
    challenge: ChallengeItem | null;
  }>({ open: false, mode: 'create', challenge: null });

  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    document.body.classList.toggle('contrast', contrast);
  }, [contrast]);

  useEffect(() => {
    const id = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    getWalletSnapshot().then((snap) => {
      setAccount(snap.address);
      setWalletChainId(snap.chainId);
    });
    const provider = getInjectedProvider();
    if (!provider?.on || !provider.removeListener) return;
    const onAccounts = (accs: unknown) => {
      const list = Array.isArray(accs) ? (accs as string[]) : [];
      setAccount(list[0] ? (list[0] as Address) : null);
    };
    const onChain = (hex: unknown) => {
      if (typeof hex === 'string') setWalletChainId(parseInt(hex, 16));
    };
    provider.on('accountsChanged', onAccounts);
    provider.on('chainChanged', onChain);
    return () => {
      provider.removeListener?.('accountsChanged', onAccounts);
      provider.removeListener?.('chainChanged', onChain);
    };
  }, []);

  const refreshProtocol = useCallback(async () => {
    setLoading(true);
    if (demoMode) {
      const baseNow = Math.floor(Date.now() / 1000);
      setCategories(DEMO_CATEGORIES);
      setReasons(DEMO_REASONS);
      setReasonProposals(DEMO_PROPOSALS);
      setRecords(buildDemoRecords(baseNow));
      setChallenges(buildDemoChallenges(baseNow));
      setPoolBalance(1_290_000_000_000_000_000n);
      setReservedPool(0n);
      setChainBestId(101n);
      setSelectedCategoryId((prev) =>
        DEMO_CATEGORIES.some((c) => c.categoryId === prev) ? prev : 3n,
      );
      setLoading(false);
      return;
    }

    try {
      const [healthRes, apiCats, apiReasons, coreSummary, reasonReg] = await Promise.all([
        fetchApiHealth(),
        fetchApiCategories(),
        fetchApiReasons(),
        fetchChainCoreParams(),
        fetchReasonRegistryData(),
      ]);
      setHealth(healthRes);
      setParams(coreSummary.params);
      setPoolBalance(coreSummary.poolBalance);
      setReservedPool(coreSummary.reservedPool);
      setReasonConfig(reasonReg.config);
      setReasonProposals(reasonReg.proposals);

      const [cats, reasonList, allRecords, allChallenges] = await Promise.all([
        apiCats ? Promise.resolve(apiCats) : fetchChainCategories(),
        apiReasons ? Promise.resolve(apiReasons) : fetchChainReasons(),
        fetchChainRecords(coreSummary.recordCount),
        fetchChainChallenges(coreSummary.challengeCount),
      ]);

      setCategories(cats);
      setReasons(reasonList);
      setRecords(allRecords);
      setChallenges(allChallenges);
      setDataSource(apiCats && healthRes.online ? 'api' : 'rpc');

      if (cats.length > 0) {
        setSelectedCategoryId((prev) => {
          if (cats.some((c) => c.categoryId === prev)) return prev;
          const preferred = cats.find((c) => c.categoryId === 4n) ?? cats[0];
          setSelectedDivisionId(preferred.divisions[0]?.divisionId ?? 1n);
          return preferred.categoryId;
        });
      }
    } catch (err) {
      showToast(`读取 Monad Testnet 失败，可切换右上 Demo Mode 演示：${formatContractError(err)}`, true);
    } finally {
      setLoading(false);
    }
  }, [demoMode, showToast]);

  useEffect(() => {
    refreshProtocol();
  }, [refreshProtocol]);

  useEffect(() => {
    if (demoMode) {
      setChainBestId(selectedCategoryId === 3n && selectedDivisionId === 1n ? 101n : 0n);
      setApiBoardEntries(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchChainBestRecordId(selectedCategoryId, selectedDivisionId),
      fetchApiLeaderboard(selectedCategoryId, selectedDivisionId),
    ])
      .then(([onChainBest, apiBoard]) => {
        if (cancelled) return;
        setChainBestId(onChainBest);
        setApiBoardEntries(apiBoard?.entries ?? null);
      })
      .catch(() => {
        if (!cancelled) setApiBoardEntries(null);
      });
    return () => {
      cancelled = true;
    };
  }, [demoMode, selectedCategoryId, selectedDivisionId, records]);

  // Batch check NFT status for records + dual claimable + user votes
  useEffect(() => {
    if (demoMode || records.length === 0) {
      setNftStatusMap({});
      setUserNfts([]);
      return;
    }
    let cancelled = false;
    Promise.all(records.map((r) => fetchRecordNftStatus(r.recordId)))
      .then((statuses) => {
        if (cancelled) return;
        const map: Record<string, RecordNftStatus> = {};
        const owned: RecordNftStatus[] = [];
        for (const s of statuses) {
          map[s.recordId.toString()] = s;
          if (
            s.minted &&
            account &&
            s.owner?.toLowerCase() === account.toLowerCase()
          ) {
            owned.push(s);
          }
        }
        setNftStatusMap(map);
        setUserNfts(owned);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [demoMode, records, account]);

  const refreshAccountAssets = useCallback(async () => {
    if (demoMode || !account) {
      setCoreClaimable(0n);
      setReasonClaimable(0n);
      setUserVotes([]);
      return;
    }
    try {
      const [bal, votes] = await Promise.all([
        fetchDualClaimable(account),
        fetchUserVotesForChallenges(
          challenges.map((c) => c.challengeId),
          account,
        ),
      ]);
      setCoreClaimable(bal.coreClaimable);
      setReasonClaimable(bal.reasonClaimable);
      setUserVotes(votes);
    } catch {
      // ignore transient rpc error
    }
  }, [demoMode, account, challenges]);

  useEffect(() => {
    refreshAccountAssets();
  }, [refreshAccountAssets]);

  const activeCategory = useMemo(
    () => categories.find((c) => c.categoryId === selectedCategoryId) ?? categories[0] ?? null,
    [categories, selectedCategoryId],
  );

  const activeDivision = useMemo(
    () =>
      activeCategory?.divisions.find((d) => d.divisionId === selectedDivisionId) ??
      activeCategory?.divisions[0] ??
      null,
    [activeCategory, selectedDivisionId],
  );

  const boardRecords = useMemo(
    () =>
      records.filter(
        (r) => r.categoryId === selectedCategoryId && r.divisionId === selectedDivisionId,
      ),
    [records, selectedCategoryId, selectedDivisionId],
  );

  const verifiedLeaderboard = useMemo(() => {
    if (apiBoardEntries && apiBoardEntries.length > 0 && !demoMode) {
      return apiBoardEntries.map((entry) => {
        const chainFull = records.find((r) => r.recordId === entry.recordId);
        return chainFull ? { ...chainFull, displayValue: entry.displayValue } : entry;
      });
    }
    return sortVerifiedRecords(boardRecords.filter((r) => r.status === RecordStatus.Verified));
  }, [apiBoardEntries, demoMode, boardRecords, records]);

  const displayedBoardRows = useMemo(() => {
    if (showUnverifiedRows) return boardRecords;
    return verifiedLeaderboard;
  }, [showUnverifiedRows, boardRecords, verifiedLeaderboard]);

  useEffect(() => {
    if (selectedRecordId !== null && records.some((r) => r.recordId === selectedRecordId)) {
      return;
    }
    if (chainBestId > 0n && records.some((r) => r.recordId === chainBestId)) {
      setSelectedRecordId(chainBestId);
      return;
    }
    if (verifiedLeaderboard.length > 0) {
      setSelectedRecordId(verifiedLeaderboard[0].recordId);
    } else if (boardRecords.length > 0) {
      setSelectedRecordId(boardRecords[0].recordId);
    } else if (records.length > 0) {
      setSelectedRecordId(records[0].recordId);
    }
  }, [selectedRecordId, chainBestId, verifiedLeaderboard, boardRecords, records]);

  const selectedRecord = useMemo(
    () => records.find((r) => r.recordId === selectedRecordId) ?? null,
    [records, selectedRecordId],
  );

  const selectedRecordCategory = useMemo(
    () =>
      selectedRecord
        ? categories.find((c) => c.categoryId === selectedRecord.categoryId) ?? activeCategory
        : activeCategory,
    [selectedRecord, categories, activeCategory],
  );

  const selectedRecordChallenges = useMemo(
    () =>
      selectedRecord
        ? challenges.filter((c) => c.recordId === selectedRecord.recordId)
        : [],
    [selectedRecord, challenges],
  );

  useEffect(() => {
    setVerifyMatch('idle');
    setVerifyFileName('');
    if (!selectedRecord || demoMode) {
      setNftStatus(selectedRecord ? nftStatusMap[selectedRecord.recordId.toString()] ?? { recordId: selectedRecord.recordId, minted: false } : null);
      return;
    }
    let cancelled = false;
    fetchRecordNftStatus(selectedRecord.recordId)
      .then((res) => {
        if (!cancelled) setNftStatus(res);
      })
      .catch(() => {
        if (!cancelled) setNftStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRecord, demoMode, nftStatusMap]);

  async function handleConnectWallet() {
    try {
      const res = await connectWallet();
      setAccount(res.address);
      setWalletChainId(res.chainId);
      if (res.chainId !== MONAD_CHAIN_ID) {
        await ensureMonadTestnet();
        setWalletChainId(MONAD_CHAIN_ID);
      }
      showToast(`已连接钱包 ${shortenAddress(res.address)}`);
    } catch (err) {
      showToast(formatContractError(err), true);
    }
  }

  async function handleSwitchChain() {
    try {
      await ensureMonadTestnet();
      setWalletChainId(MONAD_CHAIN_ID);
      showToast('已切换至 Monad Testnet (10143)');
    } catch (err) {
      showToast(formatContractError(err), true);
    }
  }

  async function handleWithdrawCore() {
    if (demoMode) return;
    setActionBusy(true);
    try {
      const tx = await withdrawCoreOnChain();
      showToast(`提现成功 (${tx.slice(0, 10)}...)`);
      await refreshAccountAssets();
    } catch (err) {
      showToast(formatContractError(err), true);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleFinalizeRecord(recordId: bigint) {
    if (demoMode) return;
    setActionBusy(true);
    try {
      const tx = await finalizeRecordOnChain(recordId);
      showToast(`成绩 #${recordId.toString()} 已自动认证入榜 (${tx.slice(0, 10)}...)`);
      await refreshProtocol();
    } catch (err) {
      showToast(formatContractError(err), true);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleMintNft(recordId: bigint) {
    if (demoMode) return;
    setActionBusy(true);
    try {
      const tx = await mintRecordNftOnChain(recordId);
      showToast(`RecordNFT #${recordId.toString()} 已铸造给成绩提交者 (${tx.slice(0, 10)}...)`);
      const fresh = await fetchRecordNftStatus(recordId);
      setNftStatus(fresh);
    } catch (err) {
      showToast(formatContractError(err), true);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleVerifyEvidenceFile(file: File | undefined) {
    if (!file || !selectedRecord) return;
    try {
      const digest = await hashFileKeccak256(file);
      setVerifyFileName(file.name);
      setVerifyMatch(
        digest.toLowerCase() === selectedRecord.evidenceHash.toLowerCase()
          ? 'match'
          : 'mismatch',
      );
    } catch (err) {
      showToast(formatContractError(err), true);
    }
  }

  const wrongChain =
    account !== null && walletChainId !== null && walletChainId !== MONAD_CHAIN_ID;
  const canFinalizeSelected =
    selectedRecord !== null &&
    selectedRecord.status === RecordStatus.Provisional &&
    BigInt(nowSec) > selectedRecord.deadline &&
    selectedRecord.activeChallenges === 0;

  const sectionTitleMap: Record<ActiveSection, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Protocol Dashboard',
      subtitle: `${categories.length} 个通用赛道 · ${records.length} 条链上成绩`,
    },
    leaderboard: {
      title: `${activeCategory ? activeCategory.name : 'Global Leaderboard'} · ${activeDivision ? activeDivision.name : 'All'}`,
      subtitle: `${activeCategory ? directionLabel(activeCategory.direction) : '排行'} · 链上 bestRecordId ${chainBestId > 0n ? `#${chainBestId.toString()}` : '暂无'}`,
    },
    voting: {
      title: 'Community Voting & Challenges',
      subtitle: '两轮 Commit-Reveal 投票 · 75% 法定通过门槛',
    },
    reasons: {
      title: 'Challenge Reason Registry',
      subtitle: 'R001–R005 标准违规库与社区新理由提案投票',
    },
    profile: {
      title: 'Player & Voter Profile',
      subtitle: '个人提交记录、投票历史、双合约 claimable 与 RecordNFT 资产',
    },
  };

  return (
    <div className="world">
      <div className="app-shell">
        <div className="workspace-grid">
          {/* Left Navigation Sidebar */}
          <aside className="sidebar pane glass">
            <div className="brand">
              <div className="brand-mark">
                <img src="/assets/runproof-mark.svg" alt="RunProof" />
                <div>
                  <span className="brand-name">RunProof V2</span>
                  <span className="brand-sub">Monad Testnet · 10143</span>
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                title="合约参数与池余额"
                onClick={() => setProtocolOpen(true)}
              >
                <SlidersHorizontal size={14} />
              </button>
            </div>

            <div className="nav-section">
              <span className="eyebrow" style={{ padding: '0 8px 4px' }}>
                协议工作台
              </span>
              <button
                type="button"
                className={`nav-item ${activeSection === 'dashboard' ? 'active' : ''}`}
                onClick={() => {
                  setActiveSection('dashboard');
                  setMobilePane('board');
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LayoutDashboard size={14} /> Dashboard
                </span>
              </button>
              <button
                type="button"
                className={`nav-item ${activeSection === 'leaderboard' ? 'active' : ''}`}
                onClick={() => {
                  setActiveSection('leaderboard');
                  setMobilePane('board');
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Trophy size={14} /> Leaderboard
                </span>
                <span className="rp-tag">{records.length}</span>
              </button>
              <button
                type="button"
                className={`nav-item ${activeSection === 'voting' ? 'active' : ''}`}
                onClick={() => {
                  setActiveSection('voting');
                  setMobilePane('board');
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Gavel size={14} /> Community Voting
                </span>
                <span className="rp-tag">{challenges.length}</span>
              </button>
              <button
                type="button"
                className={`nav-item ${activeSection === 'reasons' ? 'active' : ''}`}
                onClick={() => {
                  setActiveSection('reasons');
                  setMobilePane('board');
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldAlert size={14} /> Reason Registry
                </span>
                <span className="rp-tag">{reasons.length}</span>
              </button>
              <button
                type="button"
                className={`nav-item ${activeSection === 'profile' ? 'active' : ''}`}
                onClick={() => {
                  setActiveSection('profile');
                  setMobilePane('board');
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UserCheck size={14} /> User Profile
                </span>
              </button>

              <span className="eyebrow" style={{ padding: '12px 8px 4px' }}>
                快速切换榜单
              </span>
              {categories.map((cat) => (
                <button
                  key={cat.categoryId.toString()}
                  type="button"
                  className={`nav-item ${
                    activeSection === 'leaderboard' && cat.categoryId === selectedCategoryId
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => {
                    setSelectedCategoryId(cat.categoryId);
                    setSelectedDivisionId(cat.divisions[0]?.divisionId ?? 1n);
                    setActiveSection('leaderboard');
                    setMobilePane('board');
                  }}
                >
                  <span>{cat.name}</span>
                  <span className="rp-tag">{cat.unit}</span>
                </button>
              ))}

              <div style={{ marginTop: 12, padding: '0 2px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => setProtocolOpen(true)}
                >
                  <Layers size={12} />
                  合约地址与实时参数
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => setContrast((v) => !v)}
                >
                  {contrast ? '恢复冷调棱镜玻璃' : '高对比度简洁模式'}
                </button>
              </div>
            </div>

            <div className="user-footer">
              {account ? (
                <div className="clear-card" style={{ padding: '10px 11px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="avatar">{account.slice(2, 4).toUpperCase()}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="mono" style={{ fontSize: 11 }}>{shortenAddress(account)}</div>
                      <span className="sub-muted">
                        {wrongChain ? '非 10143 网络' : 'Monad Testnet'}
                      </span>
                    </div>
                  </div>
                  {wrongChain ? (
                    <button
                      type="button"
                      className="pill-btn warn"
                      style={{ width: '100%', marginTop: 8 }}
                      onClick={handleSwitchChain}
                    >
                      切换至 Monad 10143
                    </button>
                  ) : (
                    <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div>
                        <span className="eyebrow">claimable</span>
                        <div className="mono" style={{ fontSize: 11.5 }}>{formatMon(coreClaimable)}</div>
                      </div>
                      <button
                        type="button"
                        className="mini-btn"
                        disabled={demoMode || actionBusy || coreClaimable === 0n}
                        onClick={handleWithdrawCore}
                      >
                        <Coins size={12} />
                        提取
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button type="button" className="pill-btn primary" onClick={handleConnectWallet}>
                  <Wallet size={13} />
                  连接 EVM 钱包
                </button>
              )}
            </div>
          </aside>

          {/* Center Workspace Pane */}
          <main className={`center-pane pane glass ${mobilePane !== 'board' ? 'mobile-hidden' : ''}`}>
            <header className="center-header">
              <div className="header-title">
                <div className="record-mini" aria-hidden="true">
                  <span>MONAD V2</span>
                  <div className="metric-grid">
                    <i />
                    <i />
                    <i />
                  </div>
                  <small>10143</small>
                </div>
                <div>
                  <h2>{sectionTitleMap[activeSection].title}</h2>
                  <p className="sub-muted">{sectionTitleMap[activeSection].subtitle}</p>
                </div>
              </div>

              <div className="header-actions">
                <button
                  type="button"
                  className={`rp-tag ${demoMode ? 'warn' : dataSource === 'api' ? 'ok' : 'monad'}`}
                  title="在真实链上数据与本地 Demo 演示数据间切换"
                  onClick={() => setDemoMode((v) => !v)}
                >
                  {demoMode
                    ? 'Demo Mode (点击切回 Live)'
                    : dataSource === 'api'
                      ? 'Live · API + 链上'
                      : 'Live · Monad RPC (10143)'}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="刷新状态"
                  onClick={refreshProtocol}
                >
                  <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>
                <button
                  type="button"
                  className="pill-btn primary"
                  disabled={wrongChain}
                  onClick={() => setSubmitOpen(true)}
                >
                  <Plus size={14} />
                  Submit Record
                </button>
              </div>
            </header>

            {activeSection === 'leaderboard' && activeCategory && (
              <div className="tab-strip">
                <div className="tab-group">
                  {activeCategory.divisions.map((div) => (
                    <button
                      key={div.divisionId.toString()}
                      type="button"
                      className={`tab-btn ${div.divisionId === selectedDivisionId ? 'active' : ''}`}
                      onClick={() => setSelectedDivisionId(div.divisionId)}
                    >
                      {div.name}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => setShowUnverifiedRows((v) => !v)}
                >
                  {showUnverifiedRows ? '仅看 Verified 正式榜' : '含 Provisional / Revoked'}
                </button>
              </div>
            )}

            <div className="center-scroll">
              {activeSection === 'dashboard' && (
                <DashboardView
                  demoMode={demoMode}
                  categories={categories}
                  records={records}
                  challenges={challenges}
                  poolBalance={poolBalance}
                  reservedPool={reservedPool}
                  onSelectBoard={(catId, divId) => {
                    setSelectedCategoryId(catId);
                    setSelectedDivisionId(divId);
                    setActiveSection('leaderboard');
                  }}
                  onOpenSubmit={() => setSubmitOpen(true)}
                  onOpenVoting={() => setActiveSection('voting')}
                />
              )}

              {activeSection === 'leaderboard' && (
                <div className="board-table-wrap">
                  <table className="board-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Record</th>
                        <th>玩家钱包</th>
                        <th>成绩</th>
                        <th>质押</th>
                        <th>认证状态</th>
                        <th>RecordNFT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedBoardRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: 28 }}>
                            {showUnverifiedRows
                              ? '当前模式暂无任何提交记录，点击右上 Submit Record 率先冲击榜首'
                              : '当前模式暂无 Verified 正式成绩（可在 Minecraft Any% / Click Speed 或开启 Demo Mode 查看样例）'}
                          </td>
                        </tr>
                      ) : (
                        displayedBoardRows.map((rec, idx) => {
                          const isLeader = rec.recordId === chainBestId;
                          const isSelected = rec.recordId === selectedRecordId;
                          const nft = nftStatusMap[rec.recordId.toString()];
                          return (
                            <tr
                              key={rec.recordId.toString()}
                              className={`${isLeader ? 'leader' : ''} ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                setSelectedRecordId(rec.recordId);
                                setMobilePane('inspector');
                              }}
                            >
                              <td>{rec.status === RecordStatus.Verified ? idx + 1 : '-'}</td>
                              <td className="mono">
                                #{rec.recordId.toString()}
                                {isLeader && (
                                  <span className="rp-tag monad" style={{ marginLeft: 6 }}>
                                    bestRecordId
                                  </span>
                                )}
                              </td>
                              <td className="mono">{shortenAddress(rec.player)}</td>
                              <td className="val-cell mono">
                                {rec.displayValue ||
                                  (activeCategory
                                    ? formatRecordValue(
                                        rec.value,
                                        activeCategory.unit,
                                        activeCategory.decimals,
                                      )
                                    : rec.value.toString())}
                              </td>
                              <td className="mono">{formatMon(rec.stake)}</td>
                              <td>
                                <span className={`rp-tag ${statusBadgeClass(rec.status)}`}>
                                  {recordStatusLabel(rec.status)}
                                </span>
                              </td>
                              <td>
                                {nft?.minted ? (
                                  <span className={`rp-tag ${statusBadgeClass(nft.status ?? rec.status)}`}>
                                    NFT 已铸造
                                  </span>
                                ) : (
                                  <span className="sub-muted">未铸造</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeSection === 'voting' && (
                <div className="flow-list">
                  {challenges.length === 0 ? (
                    <div className="clear-card" style={{ textAlign: 'center', padding: 28 }}>
                      当前无进行中的社区挑战
                    </div>
                  ) : (
                    challenges.map((ch) => {
                      const reason = reasons.find((r) => r.reasonId === ch.reasonId);
                      const rec = records.find((r) => r.recordId === ch.recordId);
                      const r = ch.round === 1 && ch.round1 ? ch.round1 : ch.round0;
                      const totalPower = r ? r.confirmPower + r.denyPower : 0n;
                      const confirmPct =
                        totalPower > 0n
                          ? Number((r!.confirmPower * 10000n) / totalPower) / 100
                          : 0;
                      const thresholdPct = params ? params.approvalBps / 100 : 75;
                      return (
                        <button
                          key={ch.challengeId.toString()}
                          type="button"
                          className="flow-card"
                          onClick={() => {
                            if (rec) setSelectedRecordId(rec.recordId);
                            setChallengeDrawer({ open: true, mode: 'manage', challenge: ch });
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontWeight: 500 }}>
                              Challenge #{ch.challengeId.toString()} · Record #{ch.recordId.toString()} ·{' '}
                              {reason ? `${reason.code} ${reason.name}` : `Reason #${ch.reasonId.toString()}`}
                            </span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {ch.special && <span className="rp-tag warn">Special</span>}
                              <span className={`rp-tag ${challengeBadgeClass(ch.status)}`}>
                                {challengeStatusLabel(ch.status)}
                              </span>
                            </div>
                          </div>

                          <div className="sub-muted" style={{ marginTop: 6 }}>
                            证据 URI：<span className="mono">{ch.evidenceURI}</span>
                          </div>

                          {r && (
                            <div style={{ marginTop: 10 }}>
                              <div className="threshold-track">
                                <div className="threshold-confirm" style={{ width: `${confirmPct}%` }} />
                                <div
                                  className="threshold-marker"
                                  style={{ left: `${thresholdPct}%` }}
                                />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
                                <span>
                                  Confirm {confirmPct.toFixed(1)}% (门槛 {thresholdPct}%) · 总质押{' '}
                                  {formatMon(r.committedStake + ch.bond)}
                                </span>
                                <span className="mono">
                                  {BigInt(nowSec) < r.commitEnd
                                    ? `Commit 剩 ${formatCountdown(r.commitEnd, nowSec)}`
                                    : BigInt(nowSec) < r.revealEnd
                                      ? `Reveal 剩 ${formatCountdown(r.revealEnd, nowSec)}`
                                      : r.finalized
                                        ? `已结算 (${r.revealedVoters} voters)`
                                        : '待 finalizeVoting'}
                                </span>
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {activeSection === 'reasons' && (
                <ReasonRegistryView
                  demoMode={demoMode}
                  reasons={reasons}
                  proposals={reasonProposals}
                  config={reasonConfig}
                  account={account}
                  nowSec={nowSec}
                  onSuccess={(msg) => {
                    showToast(msg);
                    refreshProtocol();
                  }}
                  onError={(msg) => showToast(msg, true)}
                />
              )}

              {activeSection === 'profile' && (
                <UserProfileView
                  demoMode={demoMode}
                  account={account}
                  categories={categories}
                  records={records}
                  coreClaimable={coreClaimable}
                  reasonClaimable={reasonClaimable}
                  userVotes={userVotes}
                  userNfts={userNfts}
                  onSelectRecord={(rid) => {
                    setSelectedRecordId(rid);
                    setMobilePane('inspector');
                  }}
                  onSuccess={(msg) => {
                    showToast(msg);
                    refreshAccountAssets();
                  }}
                  onError={(msg) => showToast(msg, true)}
                />
              )}
            </div>
          </main>

          {/* Right Inspector Pane: Record Details & Settlement Actions */}
          <aside className={`flow-pane pane glass ${mobilePane !== 'inspector' ? 'mobile-hidden' : ''}`}>
            <div className="flow-scroll">
              {selectedRecord && selectedRecordCategory ? (
                <>
                  <div className="hero-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span className="rp-tag">Record #{selectedRecord.recordId.toString()}</span>
                      <span className={`rp-tag ${statusBadgeClass(selectedRecord.status)}`}>
                        {recordStatusLabel(selectedRecord.status)}
                      </span>
                    </div>
                    <h3 className="mono">
                      {formatRecordValue(
                        selectedRecord.value,
                        selectedRecordCategory.unit,
                        selectedRecordCategory.decimals,
                      )}
                    </h3>
                    <p>
                      {selectedRecordCategory.name} ·{' '}
                      <a
                        href={explorerAddressUrl(selectedRecord.player)}
                        target="_blank"
                        rel="noreferrer"
                        className="mono"
                        style={{ textDecoration: 'underline' }}
                      >
                        {shortenAddress(selectedRecord.player)}
                      </a>
                    </p>
                    {selectedRecord.recordId === chainBestId && (
                      <div style={{ marginTop: 10 }}>
                        <span className="rp-tag monad">当前链上权威榜首 (bestRecordId)</span>
                      </div>
                    )}
                  </div>

                  <div className="flow-heading">
                    <span>Record Details · 链上详情</span>
                    <span className="eyebrow">Rule v{selectedRecord.ruleVersion}</span>
                  </div>

                  <div className="clear-card" style={{ marginBottom: 12 }}>
                    <div className="kv-row">
                      <span>提交质押 (stake)</span>
                      <span className="mono">
                        {formatMon(selectedRecord.stake)}{' '}
                        {selectedRecord.stakeSettled ? '(已结算)' : '(托管中)'}
                      </span>
                    </div>
                    <div className="kv-row">
                      <span>提交时间</span>
                      <span>{formatUnixTime(selectedRecord.submittedAt)}</span>
                    </div>
                    <div className="kv-row">
                      <span>挑战窗口截止</span>
                      <span>
                        {formatUnixTime(selectedRecord.deadline)} ·{' '}
                        {formatCountdown(selectedRecord.deadline, nowSec)}
                      </span>
                    </div>
                    <div className="kv-row">
                      <span>进行中挑战数</span>
                      <span className="mono">{selectedRecord.activeChallenges}</span>
                    </div>
                  </div>

                  <div className="hash-box" style={{ marginBottom: 10 }}>
                    <span>evidenceHash (bytes32)</span>
                    <div className="mono">{selectedRecord.evidenceHash}</div>
                  </div>
                  <div className="hash-box" style={{ marginBottom: 12 }}>
                    <span>evidenceURI</span>
                    <div className="mono">{selectedRecord.evidenceURI || '-'}</div>
                    {selectedRecord.txHash && (
                      <a
                        href={explorerTxUrl(selectedRecord.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 10.5 }}
                      >
                        在 MonadExplorer 查看交易 <ExternalLink size={11} />
                      </a>
                    )}
                  </div>

                  <div className="clear-card" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div>
                        <span className="eyebrow">本地原始证据校验</span>
                        <p className="sub-muted">选择本地文件对比链上 keccak256</p>
                      </div>
                      <label className="mini-btn" style={{ cursor: 'pointer' }}>
                        <FileCheck2 size={12} />
                        校验文件
                        <input
                          type="file"
                          style={{ display: 'none' }}
                          onChange={(e) => handleVerifyEvidenceFile(e.target.files?.[0])}
                        />
                      </label>
                    </div>
                    {verifyMatch !== 'idle' && (
                      <div className={`notice-box ${verifyMatch === 'match' ? 'ok' : 'danger'}`} style={{ marginBottom: 0 }}>
                        {verifyMatch === 'match'
                          ? `${verifyFileName} keccak256 与链上摘要 100% 一致`
                          : `${verifyFileName} 摘要与链上 evidenceHash 不一致`}
                      </div>
                    )}
                  </div>

                  <div className="flow-heading">
                    <span>可执行的合约动作</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {canFinalizeSelected && (
                      <button
                        type="button"
                        className="pill-btn primary"
                        disabled={demoMode || actionBusy || wrongChain}
                        onClick={() => handleFinalizeRecord(selectedRecord.recordId)}
                      >
                        <CheckCircle2 size={14} />
                        窗口已过，调用 finalizeRecord 认证入榜
                      </button>
                    )}

                    {(selectedRecord.status === RecordStatus.Provisional ||
                      selectedRecord.status === RecordStatus.Verified) && (
                      <button
                        type="button"
                        className="pill-btn warn"
                        disabled={wrongChain}
                        onClick={() =>
                          setChallengeDrawer({ open: true, mode: 'create', challenge: null })
                        }
                      >
                        <Gavel size={14} />
                        {selectedRecord.status === RecordStatus.Verified
                          ? '发起 Special 特殊挑战 (Verified 后置纠错)'
                          : '发起挑战 (challengeRecord)'}
                      </button>
                    )}

                    {nftStatus?.minted ? (
                      <div className="clear-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                            <Award size={14} />
                            RecordNFT #{selectedRecord.recordId.toString()}
                          </span>
                          <span
                            className={`rp-tag ${statusBadgeClass(
                              nftStatus.status ?? selectedRecord.status,
                            )}`}
                          >
                            {recordStatusLabel(nftStatus.status ?? selectedRecord.status)}
                          </span>
                        </div>
                        <p className="sub-muted" style={{ marginTop: 5 }}>
                          持有人：<span className="mono">{shortenAddress(nftStatus.owner)}</span> · 实时读取 Core 状态
                        </p>
                      </div>
                    ) : (
                      selectedRecord.status === RecordStatus.Verified && (
                        <button
                          type="button"
                          className="pill-btn primary"
                          disabled={demoMode || actionBusy || wrongChain}
                          onClick={() => handleMintNft(selectedRecord.recordId)}
                        >
                          <Award size={14} />
                          铸造 RecordNFT (归属提交玩家)
                        </button>
                      )
                    )}
                  </div>

                  <div className="flow-heading">
                    <span>关联挑战与投票记录 ({selectedRecordChallenges.length})</span>
                  </div>
                  {selectedRecordChallenges.length === 0 ? (
                    <p className="sub-muted">该成绩暂未被发起挑战。</p>
                  ) : (
                    <div className="flow-list">
                      {selectedRecordChallenges.map((ch) => {
                        const reason = reasons.find((r) => r.reasonId === ch.reasonId);
                        return (
                          <button
                            key={ch.challengeId.toString()}
                            type="button"
                            className="flow-card"
                            onClick={() =>
                              setChallengeDrawer({ open: true, mode: 'manage', challenge: ch })
                            }
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 500 }}>
                                #{ch.challengeId.toString()} {reason ? reason.code : ''}
                              </span>
                              <span className={`rp-tag ${challengeBadgeClass(ch.status)}`}>
                                {challengeStatusLabel(ch.status)}
                              </span>
                            </div>
                            <div className="sub-muted" style={{ marginTop: 4 }}>
                              {reason?.name || `Reason #${ch.reasonId.toString()}`} · Round {ch.round}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="clear-card" style={{ textAlign: 'center', padding: 28 }}>
                  <ShieldAlert size={20} style={{ opacity: 0.6, marginBottom: 8 }} />
                  <p className="sub-muted">在中间榜单点击任意成绩，查看完整链上存证详情、挑战历史与 NFT 操作。</p>
                </div>
              )}
            </div>
          </aside>
        </div>

        <nav className="mobile-nav">
          <button
            type="button"
            className={mobilePane === 'board' ? 'selected' : ''}
            onClick={() => setMobilePane('board')}
          >
            <Trophy size={14} /> 工作台
          </button>
          <button
            type="button"
            className={mobilePane === 'inspector' ? 'selected' : ''}
            onClick={() => setMobilePane('inspector')}
          >
            <FileCheck2 size={14} /> 成绩详情
          </button>
        </nav>
      </div>

      <SubmitRecordDrawer
        open={submitOpen}
        demoMode={demoMode}
        onClose={() => setSubmitOpen(false)}
        categories={categories}
        initialCategoryId={selectedCategoryId}
        initialDivisionId={selectedDivisionId}
        account={account}
        params={params}
        nowSec={nowSec}
        onSuccess={(msg) => {
          showToast(msg);
          refreshProtocol();
        }}
        onError={(msg) => showToast(msg, true)}
      />

      <ChallengeVoteDrawer
        open={challengeDrawer.open}
        mode={challengeDrawer.mode}
        demoMode={demoMode}
        onClose={() => setChallengeDrawer((prev) => ({ ...prev, open: false }))}
        record={selectedRecord}
        challenge={challengeDrawer.challenge}
        reasons={reasons}
        params={params}
        poolBalance={poolBalance}
        reservedPool={reservedPool}
        account={account}
        nowSec={nowSec}
        onSuccess={(msg) => {
          showToast(msg);
          refreshProtocol();
        }}
        onError={(msg) => showToast(msg, true)}
      />

      <ProtocolDrawer
        open={protocolOpen}
        onClose={() => setProtocolOpen(false)}
        params={params}
        poolBalance={poolBalance}
        reservedPool={reservedPool}
        health={health}
        dataSource={dataSource}
      />

      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>
      )}
    </div>
  );
}
