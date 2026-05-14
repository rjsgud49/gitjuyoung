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
    individualValue: number;
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

export interface FarmPlacedItem {
  itemId: string;
  itemName: string;
  itemRarity: 'common' | 'rare' | 'epic' | 'legendary';
  itemImage: string;
  individualValue: number;
  placedAt: string;
}

export interface FarmStateData {
  placedItems: FarmPlacedItem[];
  maxCards: number;
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

export async function putFarmPlace(token: string, item: { id: string; name: string; rarity: string; image: string }): Promise<void> {
  const r = await fetch('/api/farm/place', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function deleteFarmItem(token: string, itemId: string): Promise<void> {
  const r = await fetch(`/api/farm/item/${encodeURIComponent(itemId)}`, {
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

export async function postFarmUpgrade(token: string): Promise<{ newMaxCards: number; cost: number }> {
  const r = await fetch('/api/farm/upgrade', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ newMaxCards: number; cost: number }>;
}

export async function postFarmEnhance(
  token: string, itemId: string, copies: number
): Promise<{ newValue: number }> {
  const r = await fetch('/api/farm/enhance', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, copies }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ newValue: number }>;
}

export async function postFarmDismantle(
  token: string, itemId: string, copies: number
): Promise<{ coinsGained: number }> {
  const r = await fetch('/api/farm/dismantle', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, copies }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ coinsGained: number }>;
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

export async function postAdminRerollValues(token: string): Promise<{ updated: number }> {
  const r = await fetch('/api/admin/reroll-values', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ updated: number }>;
}

// ─── Activity feed ────────────────────────────────────────────────────────────

export interface ActivityEntry {
  login: string;
  itemName: string;
  itemRarity: string;
  timestamp: string;
}

export async function fetchActivity(): Promise<ActivityEntry[]> {
  const r = await fetch('/api/activity');
  if (!r.ok) return [];
  return r.json() as Promise<ActivityEntry[]>;
}

export async function postActivity(token: string, itemName: string, itemRarity: string): Promise<void> {
  await fetch('/api/activity', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemName, itemRarity }),
  }).catch(() => {});
}

// ─── Public farm config ───────────────────────────────────────────────────────

export async function fetchFarmConfigPublic(): Promise<FarmConfig> {
  const r = await fetch('/api/farm-config');
  if (!r.ok) throw new Error('farm-config unavailable');
  return r.json() as Promise<FarmConfig>;
}

// ─── Auction API ──────────────────────────────────────────────────────────────

export interface AuctionEntry {
  id: number;
  sellerLogin: string;
  itemId: string;
  itemName: string;
  itemRarity: 'common' | 'rare' | 'epic' | 'legendary';
  itemImage: string;
  individualValue: number;
  price: number;
  status: 'active' | 'sold' | 'cancelled';
  buyerLogin: string | null;
  createdAt: string;
  soldAt: string | null;
}

export async function fetchAuctions(): Promise<AuctionEntry[]> {
  const r = await fetch('/api/auction');
  if (!r.ok) throw new Error(`auction ${r.status}`);
  return r.json() as Promise<AuctionEntry[]>;
}

export async function fetchMyAuctions(token: string): Promise<AuctionEntry[]> {
  const r = await fetch('/api/auction/mine', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`auction/mine ${r.status}`);
  return r.json() as Promise<AuctionEntry[]>;
}

export async function postCreateAuction(
  token: string,
  item: { itemId: string; itemName: string; itemRarity: string; itemImage: string; individualValue: number },
  price: number
): Promise<{ auctionId: number }> {
  const r = await fetch('/api/auction', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...item, price }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ auctionId: number }>;
}

export async function deleteAuction(token: string, auctionId: number): Promise<void> {
  const r = await fetch(`/api/auction/${auctionId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function postBuyAuction(token: string, auctionId: number): Promise<{ coinsSpent: number }> {
  const r = await fetch(`/api/auction/${auctionId}/buy`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ coinsSpent: number }>;
}

// ─── Synthesis API ────────────────────────────────────────────────────────────

export interface SynthesisRecipeApi {
  id: string;
  name: string;
  resultItemId: string;
  resultItemName: string;
  resultItemRarity: string;
  resultItemImage: string;
  ingredients: { itemId: string; itemName: string; count: number }[];
}

export async function fetchSynthesisRecipes(): Promise<SynthesisRecipeApi[]> {
  const r = await fetch('/api/synthesis/recipes');
  if (!r.ok) throw new Error(`synthesis/recipes ${r.status}`);
  return r.json() as Promise<SynthesisRecipeApi[]>;
}

export async function postCraftSynthesis(
  token: string, recipeId: string
): Promise<{ resultItemId: string; resultItemName: string; resultItemRarity: string; resultItemImage: string }> {
  const r = await fetch('/api/synthesis/craft', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeId }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function postAdminSynthesisRecipe(token: string, recipe: SynthesisRecipeApi): Promise<void> {
  const r = await fetch('/api/admin/synthesis/recipes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function deleteAdminSynthesisRecipe(token: string, id: string): Promise<void> {
  const r = await fetch(`/api/admin/synthesis/recipes/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function postAdminUploadCard(
  token: string,
  file: File,
  meta: { id: string; name: string; rarity: string; probability: number }
): Promise<{ imageUrl: string }> {
  const form = new FormData();
  form.append('image', file);
  form.append('id', meta.id);
  form.append('name', meta.name);
  form.append('rarity', meta.rarity);
  form.append('probability', String(meta.probability));
  const r = await fetch('/api/admin/upload-card', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ imageUrl: string }>;
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
