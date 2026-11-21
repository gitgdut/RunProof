import {
  bytesToHex,
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  http,
  keccak256,
  parseEventLogs,
  type WalletClient,
} from 'viem';
import {
  ABIS,
  CONTRACTS,
  MONAD_CHAIN_ID,
  MONAD_RPC_URL,
  monadTestnet,
} from '../config/contracts';
import {
  ChallengeStatus,
  Choice,
  ProposalStatus,
  RankingDirection,
  RecordStatus,
  type Address,
  type CategoryInfo,
  type ChallengeItem,
  type ChallengeReasonInfo,
  type CoreParams,
  type DivisionInfo,
  type Hex,
  type LocalVoteSalt,
  type ReasonProposalInfo,
  type ReasonRegistryConfig,
  type RecordItem,
  type RecordNftStatus,
  type RoundInfo,
  type UserVoteState,
} from './types';

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(MONAD_RPC_URL, {
    // The public Monad RPC rate-limits bursts with HTTP 429; batch + retry keeps cold loads alive.
    batch: true,
    retryCount: 3,
    retryDelay: 500,
    timeout: 25_000,
  }),
});

/**
 * Concurrency-limited wrapper around readContract.
 * A cold dashboard load fans out to dozens of eth_calls; the public RPC rejects that burst with 429,
 * which used to abort the whole Promise.all and leave every panel at zero. Cap the parallelism and
 * retry rate-limited calls with backoff instead.
 */
const MAX_CONCURRENT_CALLS = 4;
let activeCalls = 0;
const waiting: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeCalls < MAX_CONCURRENT_CALLS) {
    activeCalls += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiting.push(() => {
      activeCalls += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeCalls -= 1;
  waiting.shift()?.();
}

async function rpcCall<T>(params: Parameters<typeof publicClient.readContract>[0]): Promise<T> {
  const delays = [400, 1200, 3000];
  for (let attempt = 0; ; attempt += 1) {
    await acquireSlot();
    try {
      return (await publicClient.readContract(params as never)) as T;
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      const rateLimited = /429|too many requests|rate limit/i.test(message);
      if (!rateLimited || attempt >= delays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    } finally {
      releaseSlot();
    }
  }
}

export function getInjectedProvider(): EthereumProvider | null {
  return typeof window !== 'undefined' && window.ethereum ? window.ethereum : null;
}

export async function connectWallet(): Promise<{ address: Address; chainId: number }> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error('未检测到 EVM 钱包插件（请安装 MetaMask / Rabby / OKX）');
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts.length) throw new Error('钱包未授权任何账户');
  const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
  return { address: accounts[0] as Address, chainId: parseInt(chainHex, 16) };
}

export async function getWalletSnapshot(): Promise<{ address: Address | null; chainId: number | null }> {
  const provider = getInjectedProvider();
  if (!provider) return { address: null, chainId: null };
  try {
    const [accounts, chainHex] = await Promise.all([
      provider.request({ method: 'eth_accounts' }) as Promise<string[]>,
      provider.request({ method: 'eth_chainId' }) as Promise<string>,
    ]);
    return {
      address: accounts[0] ? (accounts[0] as Address) : null,
      chainId: chainHex ? parseInt(chainHex, 16) : null,
    };
  } catch {
    return { address: null, chainId: null };
  }
}

export async function ensureMonadTestnet(): Promise<WalletClient> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error('请先安装或连接浏览器钱包');
  const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
  const currentChainId = parseInt(chainHex, 16);
  if (currentChainId !== MONAD_CHAIN_ID) {
    const targetHex = `0x${MONAD_CHAIN_ID.toString(16)}`;
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetHex }] });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: targetHex,
              chainName: 'Monad Testnet',
              nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
              rpcUrls: [MONAD_RPC_URL],
              blockExplorerUrls: ['https://testnet.monadexplorer.com'],
            },
          ],
        });
      } else {
        throw new Error(`请先将钱包切换至 Monad Testnet (Chain ID ${MONAD_CHAIN_ID})`);
      }
    }
  }
  return createWalletClient({ chain: monadTestnet, transport: custom(provider) });
}

async function getActiveAccount(walletClient: WalletClient): Promise<Address> {
  const [account] = await walletClient.getAddresses();
  if (!account) throw new Error('未能读取当前签名账户');
  return account;
}

export function formatRecordValue(value: bigint, unit: string, decimals: number): string {
  if (unit === 'ms' && decimals === 0) {
    const totalMs = Number(value);
    if (!Number.isFinite(totalMs)) return `${value.toString()} ms`;
    if (totalMs >= 60_000) {
      const mins = Math.floor(totalMs / 60_000);
      const secs = Math.floor((totalMs % 60_000) / 1000);
      const ms = totalMs % 1000;
      return `${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    }
    return `${Math.floor(totalMs / 1000)}.${String(totalMs % 1000).padStart(3, '0')} s`;
  }
  if (decimals > 0) {
    const base = 10n ** BigInt(decimals);
    const whole = value / base;
    const frac = (value % base).toString().padStart(decimals, '0');
    return `${whole.toString()}.${frac} ${unit}`;
  }
  return `${value.toLocaleString()} ${unit}`;
}

export function formatMon(wei: bigint, maxDecimals = 4): string {
  const [head, tail] = formatEther(wei).split('.');
  if (!tail) return `${head} MON`;
  const trimmed = tail.slice(0, maxDecimals).replace(/0+$/, '');
  return `${trimmed ? `${head}.${trimmed}` : head} MON`;
}

export function shortenAddress(address?: string | null): string {
  if (!address) return '-';
  return address.length < 12 ? address : `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatUnixTime(unixSec: bigint | number): string {
  const n = typeof unixSec === 'bigint' ? Number(unixSec) : unixSec;
  if (!n) return '-';
  return new Date(n * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatCountdown(targetSec: bigint, nowSec: number): string {
  const diff = Number(targetSec) - nowSec;
  if (diff <= 0) return '已到期';
  const days = Math.floor(diff / 86400);
  if (days > 0) return `${days}d ${Math.floor((diff % 86400) / 3600)}h`;
  const hrs = Math.floor(diff / 3600);
  if (hrs > 0) return `${hrs}h ${Math.floor((diff % 3600) / 60)}m`;
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export async function hashFileKeccak256(file: File): Promise<Hex> {
  return keccak256(new Uint8Array(await file.arrayBuffer()));
}

const readCat = (fn: string, args?: unknown[]) =>
  rpcCall({
    address: CONTRACTS.CategoryRegistry,
    abi: ABIS.CategoryRegistry,
    functionName: fn,
    args,
  });

const readReason = (fn: string, args?: unknown[]) =>
  rpcCall({
    address: CONTRACTS.ChallengeReasonRegistry,
    abi: ABIS.ChallengeReasonRegistry,
    functionName: fn,
    args,
  });

const readCore = (fn: string, args?: unknown[]) =>
  rpcCall({
    address: CONTRACTS.RunProofCore,
    abi: ABIS.RunProofCore,
    functionName: fn,
    args,
  });

export async function fetchChainCategories(): Promise<CategoryInfo[]> {
  const count = (await readCat('categoryCount')) as bigint;
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  return Promise.all(
    ids.map(async (categoryId) => {
      const [rawCat, divCount] = (await Promise.all([
        readCat('getCategory', [categoryId]),
        readCat('divisionCount', [categoryId]),
      ])) as [
        {
          name: string;
          descriptionURI: string;
          unit: string;
          decimals: number;
          direction: number;
          ruleVersion: number;
          baseStake: bigint;
          active: boolean;
        },
        bigint,
      ];
      const divIds = Array.from({ length: Number(divCount) }, (_, i) => BigInt(i + 1));
      const divisions: DivisionInfo[] = await Promise.all(
        divIds.map(async (divisionId) => {
          const [name, active] = (await Promise.all([
            readCat('divisionNames', [categoryId, divisionId]),
            readCat('divisionActive', [categoryId, divisionId]),
          ])) as [string, boolean];
          return { divisionId, name, active };
        }),
      );
      return {
        categoryId,
        name: rawCat.name,
        descriptionURI: rawCat.descriptionURI,
        unit: rawCat.unit,
        decimals: Number(rawCat.decimals),
        direction: Number(rawCat.direction) as RankingDirection,
        ruleVersion: Number(rawCat.ruleVersion),
        baseStake: rawCat.baseStake,
        active: rawCat.active,
        divisions,
      };
    }),
  );
}

export async function fetchChainReasons(): Promise<ChallengeReasonInfo[]> {
  const count = (await readReason('reasonCount')) as bigint;
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  return Promise.all(
    ids.map(async (reasonId) => {
      const r = (await readReason('getReason', [reasonId])) as {
        code: string;
        name: string;
        description: string;
        discoverer: Address;
        registeredAt: bigint;
        registered: boolean;
      };
      return { reasonId, ...r };
    }),
  );
}

export async function fetchReasonRegistryData(): Promise<{
  config: ReasonRegistryConfig;
  proposals: ReasonProposalInfo[];
}> {
  const [
    proposalBond,
    proposerReward,
    votingPeriod,
    minVoteStake,
    maxVoteStake,
    quorumPower,
    minVoters,
    approvalBps,
    rewardBalance,
    proposalCount,
  ] = (await Promise.all([
    readReason('proposalBond'),
    readReason('proposerReward'),
    readReason('votingPeriod'),
    readReason('minVoteStake'),
    readReason('maxVoteStake'),
    readReason('quorumPower'),
    readReason('minVoters'),
    readReason('approvalBps'),
    readReason('rewardBalance'),
    readReason('proposalCount'),
  ])) as [bigint, bigint, bigint, bigint, bigint, bigint, number, number, bigint, bigint];

  const total = Number(proposalCount);
  const start = Math.max(1, total - 19);
  const ids: bigint[] = [];
  for (let i = total; i >= start; i--) ids.push(BigInt(i));

  const proposals = await Promise.all(
    ids.map(async (proposalId) => {
      const p = (await readReason('proposals', [proposalId])) as readonly unknown[];
      return {
        proposalId,
        proposer: p[0] as Address,
        name: String(p[1]),
        description: String(p[2]),
        evidenceURI: String(p[3]),
        bond: p[4] as bigint,
        endTime: p[5] as bigint,
        forPower: p[6] as bigint,
        againstPower: p[7] as bigint,
        voters: Number(p[8]),
        status: Number(p[9]) as ProposalStatus,
        reasonId: p[10] as bigint,
      };
    }),
  );

  return {
    config: {
      proposalBond,
      proposerReward,
      votingPeriod,
      minVoteStake,
      maxVoteStake,
      quorumPower,
      minVoters: Number(minVoters),
      approvalBps: Number(approvalBps),
      rewardBalance,
    },
    proposals,
  };
}

export async function fetchChainCoreParams(): Promise<{
  params: CoreParams;
  recordCount: bigint;
  challengeCount: bigint;
  poolBalance: bigint;
  reservedPool: bigint;
}> {
  const [rawParams, recordCount, challengeCount, poolBalance, reservedPool] = (await Promise.all([
    readCore('params'),
    readCore('recordCount'),
    readCore('challengeCount'),
    readCore('poolBalance'),
    readCore('reservedPool'),
  ])) as [readonly unknown[], bigint, bigint, bigint, bigint];

  return {
    params: {
      submissionFee: rawParams[0] as bigint,
      challengeBond: rawParams[1] as bigint,
      specialBondMultiplier: rawParams[2] as bigint,
      specialReward: rawParams[3] as bigint,
      minVoteStake: rawParams[4] as bigint,
      maxVoteStake: rawParams[5] as bigint,
      quorumPower: rawParams[6] as bigint,
      leaderMultiplierBps: rawParams[7] as bigint,
      minVoters: Number(rawParams[8]),
      challengeWindow: rawParams[9] as bigint,
      commitPeriod: rawParams[10] as bigint,
      revealPeriod: rawParams[11] as bigint,
      extensionPeriod: rawParams[12] as bigint,
      approvalBps: Number(rawParams[13]),
      nearTieBps: Number(rawParams[14]),
      wrongSlashBps: Number(rawParams[15]),
      challengerRewardBps: Number(rawParams[16]),
      voterRewardBps: Number(rawParams[17]),
      playerCompBps: Number(rawParams[18]),
    },
    recordCount,
    challengeCount,
    poolBalance,
    reservedPool,
  };
}

export async function fetchChainRecords(limitCount?: bigint): Promise<RecordItem[]> {
  const total = limitCount ?? ((await readCore('recordCount')) as bigint);
  const count = Number(total);
  const start = Math.max(1, count - 79);
  const ids: bigint[] = [];
  for (let i = start; i <= count; i++) ids.push(BigInt(i));

  return Promise.all(
    ids.map(async (recordId) => {
      const r = (await readCore('getRecord', [recordId])) as {
        player: Address;
        categoryId: bigint;
        divisionId: bigint;
        value: bigint;
        direction: number;
        evidenceHash: Hex;
        evidenceURI: string;
        stake: bigint;
        submittedAt: bigint;
        deadline: bigint;
        ruleVersion: number;
        status: number;
        stakeSettled: boolean;
        activeChallenges: number;
      };
      return {
        recordId,
        player: r.player,
        categoryId: r.categoryId,
        divisionId: r.divisionId,
        value: r.value,
        direction: Number(r.direction) as RankingDirection,
        evidenceHash: r.evidenceHash,
        evidenceURI: r.evidenceURI,
        stake: r.stake,
        submittedAt: r.submittedAt,
        deadline: r.deadline,
        ruleVersion: Number(r.ruleVersion),
        status: Number(r.status) as RecordStatus,
        stakeSettled: r.stakeSettled,
        activeChallenges: Number(r.activeChallenges),
      };
    }),
  );
}

async function readRound(challengeId: bigint, round: number): Promise<RoundInfo> {
  const raw = (await readCore('rounds', [challengeId, round])) as readonly unknown[];
  return {
    challengeId,
    round,
    commitEnd: raw[0] as bigint,
    revealEnd: raw[1] as bigint,
    confirmPower: raw[2] as bigint,
    denyPower: raw[3] as bigint,
    confirmStake: raw[4] as bigint,
    denyStake: raw[5] as bigint,
    committedStake: raw[6] as bigint,
    committedVoters: Number(raw[7]),
    revealedVoters: Number(raw[8]),
    finalized: Boolean(raw[9]),
    winner: Number(raw[10]) as Choice,
    winnerPower: raw[11] as bigint,
    rewardPool: raw[12] as bigint,
    slashBps: Number(raw[13]),
  };
}

export async function fetchChainChallenges(limitCount?: bigint): Promise<ChallengeItem[]> {
  const total = limitCount ?? ((await readCore('challengeCount')) as bigint);
  const count = Number(total);
  const start = Math.max(1, count - 49);
  const ids: bigint[] = [];
  for (let i = count; i >= start; i--) ids.push(BigInt(i));

  return Promise.all(
    ids.map(async (challengeId) => {
      const [c, round0, round1] = await Promise.all([
        readCore('getChallenge', [challengeId]) as Promise<{
          recordId: bigint;
          reasonId: bigint;
          challenger: Address;
          bond: bigint;
          reserved: bigint;
          evidenceHash: Hex;
          evidenceURI: string;
          createdAt: bigint;
          status: number;
          round: number;
          special: boolean;
          extended: boolean;
          evidenceCount: number;
        }>,
        readRound(challengeId, 0),
        readRound(challengeId, 1),
      ]);
      return {
        challengeId,
        recordId: c.recordId,
        reasonId: c.reasonId,
        challenger: c.challenger,
        bond: c.bond,
        reserved: c.reserved,
        evidenceHash: c.evidenceHash,
        evidenceURI: c.evidenceURI,
        createdAt: c.createdAt,
        status: Number(c.status) as ChallengeStatus,
        round: Number(c.round),
        special: c.special,
        extended: c.extended,
        evidenceCount: Number(c.evidenceCount),
        round0,
        round1: round1.commitEnd > 0n ? round1 : undefined,
      };
    }),
  );
}

export async function fetchChainBestRecordId(catId: bigint, divId: bigint): Promise<bigint> {
  return (await readCore('bestRecordId', [catId, divId])) as bigint;
}

export async function fetchDualClaimable(account: Address): Promise<{
  coreClaimable: bigint;
  reasonClaimable: bigint;
}> {
  const [coreClaimable, reasonClaimable] = (await Promise.all([
    readCore('claimable', [account]),
    readReason('claimable', [account]),
  ])) as [bigint, bigint];
  return { coreClaimable, reasonClaimable };
}

export async function fetchUserVoteOnChain(
  challengeId: bigint,
  round: number,
  voter: Address,
): Promise<UserVoteState> {
  const raw = (await readCore('votes', [challengeId, round, voter])) as readonly [
    Hex,
    bigint,
    number,
    boolean,
    boolean,
  ];
  return {
    commitment: raw[0],
    stake: raw[1],
    choice: Number(raw[2]) as Choice,
    revealed: Boolean(raw[3]),
    claimed: Boolean(raw[4]),
  };
}

export async function fetchUserVotesForChallenges(
  challengeIds: bigint[],
  voter: Address,
): Promise<Array<{ challengeId: bigint; round: number; vote: UserVoteState }>> {
  const queries: Array<Promise<{ challengeId: bigint; round: number; vote: UserVoteState }>> = [];
  for (const cid of challengeIds.slice(0, 20)) {
    for (const round of [0, 1]) {
      queries.push(
        fetchUserVoteOnChain(cid, round, voter).then((vote) => ({ challengeId: cid, round, vote })),
      );
    }
  }
  return (await Promise.all(queries)).filter((item) => item.vote.stake > 0n);
}

export async function fetchRecordNftStatus(recordId: bigint): Promise<RecordNftStatus> {
  try {
    const [owner, status] = (await Promise.all([
      rpcCall({
        address: CONTRACTS.RecordNFT,
        abi: ABIS.RecordNFT,
        functionName: 'ownerOf',
        args: [recordId],
      }),
      rpcCall({
        address: CONTRACTS.RecordNFT,
        abi: ABIS.RecordNFT,
        functionName: 'verificationStatus',
        args: [recordId],
      }),
    ])) as [Address, number];
    return { recordId, minted: true, owner, status: Number(status) as RecordStatus };
  } catch {
    return { recordId, minted: false };
  }
}

export async function readRequiredPayment(
  categoryId: bigint,
  divisionId: bigint,
  value: bigint,
): Promise<{ total: bigint; stake: bigint; gasCostWei: bigint }> {
  const [total, stake, gasPrice] = (await Promise.all([
    readCore('requiredPayment', [categoryId, divisionId, value]),
    readCore('requiredStake', [categoryId, divisionId, value]),
    publicClient.getGasPrice().catch(() => 50_000_000_000n),
  ])) as [bigint, bigint, bigint];
  return { total, stake, gasCostWei: gasPrice * 180_000n };
}

export function voteSaltKey(challengeId: bigint, round: number, voter: Address): string {
  return `runproof:${MONAD_CHAIN_ID}:${CONTRACTS.RunProofCore.toLowerCase()}:${challengeId.toString()}:${round}:${voter.toLowerCase()}`;
}

export function saveVoteSalt(entry: LocalVoteSalt): void {
  localStorage.setItem(
    voteSaltKey(BigInt(entry.challengeId), entry.round, entry.voter),
    JSON.stringify(entry),
  );
}

export function loadVoteSalt(challengeId: bigint, round: number, voter: Address): LocalVoteSalt | null {
  const raw = localStorage.getItem(voteSaltKey(challengeId, round, voter));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalVoteSalt;
  } catch {
    return null;
  }
}

async function sendCoreTx(fn: string, args: unknown[], value?: bigint): Promise<Hex> {
  const wc = await ensureMonadTestnet();
  const account = await getActiveAccount(wc);
  const hash = await wc.writeContract({
    account,
    chain: monadTestnet,
    address: CONTRACTS.RunProofCore,
    abi: ABIS.RunProofCore,
    functionName: fn,
    args,
    value,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function submitRecordOnChain(input: {
  categoryId: bigint;
  divisionId: bigint;
  value: bigint;
  evidenceHash: Hex;
  evidenceURI: string;
}): Promise<{ txHash: Hex; recordId: bigint | null }> {
  const wc = await ensureMonadTestnet();
  const account = await getActiveAccount(wc);
  const payment = (await readCore('requiredPayment', [
    input.categoryId,
    input.divisionId,
    input.value,
  ])) as bigint;
  const txHash = await wc.writeContract({
    account,
    chain: monadTestnet,
    address: CONTRACTS.RunProofCore,
    abi: ABIS.RunProofCore,
    functionName: 'submitRecord',
    args: [input.categoryId, input.divisionId, input.value, input.evidenceHash, input.evidenceURI],
    value: payment,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const logs = parseEventLogs({ abi: ABIS.RunProofCore, logs: receipt.logs, eventName: 'RecordSubmitted' });
  return { txHash, recordId: (logs[0]?.args as { recordId?: bigint } | undefined)?.recordId ?? null };
}

export const finalizeRecordOnChain = (recordId: bigint) => sendCoreTx('finalizeRecord', [recordId]);

export async function challengeRecordOnChain(input: {
  recordId: bigint;
  reasonId: bigint;
  evidenceHash: Hex;
  evidenceURI: string;
  bondWei: bigint;
}): Promise<{ txHash: Hex; challengeId: bigint | null }> {
  const wc = await ensureMonadTestnet();
  const account = await getActiveAccount(wc);
  const txHash = await wc.writeContract({
    account,
    chain: monadTestnet,
    address: CONTRACTS.RunProofCore,
    abi: ABIS.RunProofCore,
    functionName: 'challengeRecord',
    args: [input.recordId, input.reasonId, input.evidenceHash, input.evidenceURI],
    value: input.bondWei,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const logs = parseEventLogs({ abi: ABIS.RunProofCore, logs: receipt.logs, eventName: 'ChallengeCreated' });
  return {
    txHash,
    challengeId: (logs[0]?.args as { challengeId?: bigint } | undefined)?.challengeId ?? null,
  };
}

export const submitEvidenceOnChain = (cid: bigint, hash: Hex, uri: string) =>
  sendCoreTx('submitEvidence', [cid, hash, uri]);

export async function commitVoteOnChain(
  challengeId: bigint,
  round: number,
  choice: Choice,
  stakeWei: bigint,
): Promise<{ txHash: Hex; savedSalt: LocalVoteSalt }> {
  const wc = await ensureMonadTestnet();
  const account = await getActiveAccount(wc);
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(32))) as Hex;
  const commitment = (await readCore('hashVote', [
    challengeId,
    round,
    choice,
    salt,
    account,
  ])) as Hex;
  const savedSalt: LocalVoteSalt = {
    chainId: MONAD_CHAIN_ID,
    core: CONTRACTS.RunProofCore,
    challengeId: challengeId.toString(),
    round,
    choice,
    salt,
    voter: account,
    stakeWei: stakeWei.toString(),
    savedAt: Date.now(),
  };
  saveVoteSalt(savedSalt);
  const txHash = await wc.writeContract({
    account,
    chain: monadTestnet,
    address: CONTRACTS.RunProofCore,
    abi: ABIS.RunProofCore,
    functionName: 'commitVote',
    args: [challengeId, commitment],
    value: stakeWei,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, savedSalt };
}

export const revealVoteOnChain = (cid: bigint, choice: Choice, salt: Hex) =>
  sendCoreTx('revealVote', [cid, choice, salt]);
export const finalizeVotingOnChain = (cid: bigint) => sendCoreTx('finalizeVoting', [cid]);
export const claimVoteOnChain = (cid: bigint, round: number) => sendCoreTx('claimVote', [cid, round]);
export const withdrawCoreOnChain = () => sendCoreTx('withdraw', []);

export async function mintRecordNftOnChain(recordId: bigint): Promise<Hex> {
  const wc = await ensureMonadTestnet();
  const account = await getActiveAccount(wc);
  const hash = await wc.writeContract({
    account,
    chain: monadTestnet,
    address: CONTRACTS.RecordNFT,
    abi: ABIS.RecordNFT,
    functionName: 'mint',
    args: [recordId],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function sendReasonTx(fn: string, args: unknown[], value?: bigint): Promise<Hex> {
  const wc = await ensureMonadTestnet();
  const account = await getActiveAccount(wc);
  const hash = await wc.writeContract({
    account,
    chain: monadTestnet,
    address: CONTRACTS.ChallengeReasonRegistry,
    abi: ABIS.ChallengeReasonRegistry,
    functionName: fn,
    args,
    value,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export const proposeReasonOnChain = (i: {
  name: string;
  description: string;
  evidenceURI: string;
  bondWei: bigint;
}) => sendReasonTx('proposeReason', [i.name, i.description, i.evidenceURI], i.bondWei);

export const voteReasonProposalOnChain = (pid: bigint, support: boolean, stakeWei: bigint) =>
  sendReasonTx('voteOnProposal', [pid, support], stakeWei);

export const finalizeReasonProposalOnChain = (pid: bigint) => sendReasonTx('finalizeProposal', [pid]);
export const withdrawReasonClaimableOnChain = () => sendReasonTx('withdraw', []);

export function sortVerifiedRecords(records: RecordItem[]): RecordItem[] {
  return [...records].sort((a, b) => {
    if (a.value !== b.value) {
      if (a.direction === RankingDirection.HigherIsBetter) return a.value > b.value ? -1 : 1;
      return a.value < b.value ? -1 : 1;
    }
    if (a.submittedAt !== b.submittedAt) return a.submittedAt < b.submittedAt ? -1 : 1;
    return a.recordId < b.recordId ? -1 : 1;
  });
}
