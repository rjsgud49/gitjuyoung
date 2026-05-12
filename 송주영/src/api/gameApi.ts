import type { GachaItem } from '../types';
import type { GachaEvent, Announcement } from '../types/admin';

export interface GlobalApiPayload {
  gachaItems: GachaItem[];
  gachaItemsVersion: string;
  gachaPullCost: number;
  startingCoins: number;
  events: GachaEvent[];
  announcements: Announcement[];
}

export interface MeApiPayload {
  login: string;
  coins: number;
  totalPulls: number;
  collectedItems: Array<{
    id: string;
    name: string;
    rarity: GachaItem['rarity'];
    image: string;
    probability: number;
    count: number;
    firstAcquiredAt: string;
  }>;
  githubData: { username: string; totalCommits: number; fetchedAt: string } | null;
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const r = await fetch('/api/health', { method: 'GET' });
    return r.ok;
  } catch {
    return false;
  }
}

export async function fetchApiGlobal(): Promise<GlobalApiPayload> {
  const r = await fetch('/api/global');
  if (!r.ok) throw new Error(`global ${r.status}`);
  return r.json() as Promise<GlobalApiPayload>;
}

export async function fetchApiMe(token: string): Promise<MeApiPayload | null> {
  const r = await fetch('/api/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error(`me ${r.status}`);
  return r.json() as Promise<MeApiPayload>;
}

export async function putApiMe(
  token: string,
  body: {
    coins: number;
    totalPulls: number;
    collectedItems: MeApiPayload['collectedItems'];
    githubData: MeApiPayload['githubData'];
  }
): Promise<void> {
  const r = await fetch('/api/me', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function postCheckin(token: string): Promise<{ alreadyDone: boolean; coinsAdded: number }> {
  const r = await fetch('/api/checkin', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`checkin ${r.status}`);
  return r.json() as Promise<{ alreadyDone: boolean; coinsAdded: number }>;
}

export interface UserSummary {
  id: number;
  githubLogin: string;
  githubId: number;
  coins: number;
  totalPulls: number;
  lastCheckinDate: string | null;
  createdAt: string;
}

export async function fetchAdminUsers(token: string): Promise<UserSummary[]> {
  const r = await fetch('/api/admin/users', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`admin/users ${r.status}`);
  return r.json() as Promise<UserSummary[]>;
}

export async function putAdminUser(
  token: string, login: string, data: { coins?: number; totalPulls?: number }
): Promise<void> {
  const r = await fetch(`/api/admin/users/${encodeURIComponent(login)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function deleteAdminUser(token: string, login: string): Promise<void> {
  const r = await fetch(`/api/admin/users/${encodeURIComponent(login)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
}

// ─── Farm API ────────────────────────────────────────────────────────────────

export interface FarmSlot {
  index: number;
  itemId: string | null;
  itemName: string | null;
  itemRarity: string | null;
  itemImage: string | null;
  productionRate: number | null;
  placedAt: string | null;
}

export interface FarmStateData {
  slots: FarmSlot[];
  maxSlots: number;
  lastCollect: string | null;
  nextUpgradeCost: number;
}

export interface FarmConfig {
  commonMin: number; commonMax: number;
  rareMin: number;   rareMax: number;
  epicMin: number;   epicMax: number;
  legendaryMin: number; legendaryMax: number;
}

export async function fetchFarm(token: string): Promise<FarmStateData> {
  const r = await fetch('/api/farm', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`farm ${r.status}`);
  return r.json() as Promise<FarmStateData>;
}

export async function putFarmPlace(token: string, slotIndex: number, item: { id: string; name: string; rarity: string; image: string }): Promise<{ productionRate: number }> {
  const r = await fetch('/api/farm/place', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slotIndex, ...item }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ productionRate: number }>;
}

export async function deleteFarmSlot(token: string, slotIndex: number): Promise<void> {
  const r = await fetch(`/api/farm/slot/${slotIndex}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function postFarmCollect(token: string): Promise<{ coinsCollected: number }> {
  const r = await fetch('/api/farm/collect', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ coinsCollected: number }>;
}

export async function postFarmUpgrade(token: string): Promise<{ newMaxSlots: number; cost: number }> {
  const r = await fetch('/api/farm/upgrade', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ newMaxSlots: number; cost: number }>;
}

export async function fetchAdminFarmConfig(token: string): Promise<FarmConfig> {
  const r = await fetch('/api/admin/farm-config', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`farm-config ${r.status}`);
  return r.json() as Promise<FarmConfig>;
}

export async function putAdminFarmConfig(token: string, cfg: FarmConfig): Promise<void> {
  const r = await fetch('/api/admin/farm-config', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function putApiAdminGlobal(
  token: string,
  body: GlobalApiPayload
): Promise<void> {
  const r = await fetch('/api/admin/global', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}
