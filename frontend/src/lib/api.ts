import {
  RankingDirection,
  RecordStatus,
  type Address,
  type BackendHealth,
  type CategoryInfo,
  type ChallengeReasonInfo,
  type Hex,
  type RecordItem,
} from './types';

function normalizedBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  return raw ? raw.replace(/\/$/, '') : '';
}

function buildUrl(path: string): string {
  return `${normalizedBase()}${path}`;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(buildUrl(path), {
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      signal: controller.signal,
      ...init,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

function toUnixSec(input: string | number | undefined): bigint {
  if (typeof input === 'number') return BigInt(Math.floor(input));
  if (typeof input === 'string') {
    if (/^\d+$/.test(input)) return BigInt(input);
    const parsed = Date.parse(input);
    if (!Number.isNaN(parsed)) return BigInt(Math.floor(parsed / 1000));
  }
  return 0n;
}

function parseRecordStatus(input: number | string | undefined): RecordStatus {
  if (typeof input === 'number') return input as RecordStatus;
  if (input === 'Provisional') return RecordStatus.Provisional;
  if (input === 'Verified') return RecordStatus.Verified;
  if (input === 'Revoked') return RecordStatus.Revoked;
  return RecordStatus.None;
}

interface RawCategory {
  categoryId?: number | string;
  id?: number | string;
  name?: string;
  descriptionURI?: string;
  unit?: string;
  decimals?: number;
  direction?: number;
  ruleVersion?: number;
  baseStake?: string;
  active?: boolean;
  divisions?: Array<{ divisionId?: number | string; id?: number | string; name?: string; active?: boolean }>;
}

export async function fetchApiCategories(): Promise<CategoryInfo[] | null> {
  try {
    const data = await fetchJson<RawCategory[]>('/api/categories');
    if (!Array.isArray(data) || data.length === 0) return null;
    // Reject V1 schemas that lack V2 unit/direction fields
    if (!data[0].unit || data[0].direction === undefined) return null;
    return data.map((c) => ({
      categoryId: BigInt(c.categoryId ?? c.id ?? 0),
      name: String(c.name ?? ''),
      descriptionURI: String(c.descriptionURI ?? ''),
      unit: String(c.unit ?? ''),
      decimals: Number(c.decimals ?? 0),
      direction: Number(c.direction) as RankingDirection,
      ruleVersion: Number(c.ruleVersion ?? 1),
      baseStake: BigInt(c.baseStake ?? '0'),
      active: Boolean(c.active),
      divisions: (c.divisions ?? []).map((d) => ({
        divisionId: BigInt(d.divisionId ?? d.id ?? 0),
        name: String(d.name ?? ''),
        active: Boolean(d.active ?? true),
      })),
    }));
  } catch {
    return null;
  }
}

interface RawLeaderboardEntry {
  rank?: number;
  recordId: number | string;
  player: Address;
  value: string;
  displayValue?: string;
  status: number | string;
  submittedAt?: string | number;
  txHash?: Hex;
}

interface RawLeaderboardResponse {
  categoryId: number | string;
  divisionId: number | string;
  direction: number;
  chainBest?: { recordId: number | string; value: string };
  entries: RawLeaderboardEntry[];
}

export async function fetchApiLeaderboard(
  categoryId: bigint,
  divisionId: bigint,
): Promise<{ chainBestId?: bigint; entries: RecordItem[] } | null> {
  try {
    const res = await fetchJson<RawLeaderboardResponse>(
      `/api/leaderboard?categoryId=${categoryId.toString()}&divisionId=${divisionId.toString()}&limit=50&offset=0`,
    );
    if (!res || !Array.isArray(res.entries)) return null;
    return {
      chainBestId: res.chainBest?.recordId !== undefined ? BigInt(res.chainBest.recordId) : undefined,
      entries: res.entries.map((e) => ({
        recordId: BigInt(e.recordId),
        player: e.player,
        categoryId,
        divisionId,
        value: BigInt(e.value),
        displayValue: e.displayValue,
        direction: Number(res.direction) as RankingDirection,
        evidenceHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        evidenceURI: '',
        stake: 0n,
        submittedAt: toUnixSec(e.submittedAt),
        deadline: 0n,
        ruleVersion: 1,
        status: parseRecordStatus(e.status),
        stakeSettled: false,
        activeChallenges: 0,
        txHash: e.txHash,
      })),
    };
  } catch {
    return null;
  }
}

export async function fetchApiReasons(): Promise<ChallengeReasonInfo[] | null> {
  try {
    const data = await fetchJson<
      Array<{
        reasonId?: number | string;
        id?: number | string;
        code?: string;
        name?: string;
        description?: string;
        discoverer?: Address;
        registeredAt?: number | string;
        registered?: boolean;
      }>
    >('/api/reasons');
    if (!Array.isArray(data) || data.length === 0) return null;
    if (!data[0].code) return null;
    return data.map((r) => ({
      reasonId: BigInt(r.reasonId ?? r.id ?? 0),
      code: String(r.code ?? ''),
      name: String(r.name ?? ''),
      description: String(r.description ?? ''),
      discoverer: (r.discoverer ?? '0x0000000000000000000000000000000000000000') as Address,
      registeredAt: toUnixSec(r.registeredAt),
      registered: r.registered ?? true,
    }));
  } catch {
    return null;
  }
}

export async function precheckApiRecord(payload: {
  categoryId: string;
  divisionId: string;
  value: string;
  evidenceHash: Hex;
  evidenceURI: string;
  player: Address;
}): Promise<boolean> {
  try {
    await fetchJson('/api/records', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return true;
  } catch {
    return false;
  }
}

export async function fetchApiHealth(): Promise<BackendHealth> {
  try {
    const res = await fetchJson<Record<string, unknown>>('/api/health');
    return {
      online: true,
      latestIndexedBlock:
        res.latestIndexedBlock !== undefined ? String(res.latestIndexedBlock) : undefined,
      lagBlocks: typeof res.lagBlocks === 'number' ? res.lagBlocks : undefined,
      reconciled: typeof res.reconciled === 'boolean' ? res.reconciled : undefined,
      version: res.version !== undefined ? String(res.version) : undefined,
      message: '已连接 V2 索引后端',
    };
  } catch {
    return {
      online: false,
      message: '后端未启动或使用直连链上模式（Monad Testnet 10143）',
    };
  }
}
