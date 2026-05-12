import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GachaItem } from '../src/types/index';
import type { GachaEvent, Announcement } from '../src/types/admin';
import { DEFAULT_ITEMS, ITEMS_VERSION } from '../src/data/defaultItems';

/** GitHub 일일 커밋 코인 캐시 (클라이언트 githubData 와 동일 형태) */
export interface UserGitHubData {
  username: string;
  totalCommits: number;
  fetchedAt: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'app.json');

export interface CollectedItemJson {
  id: string;
  name: string;
  rarity: GachaItem['rarity'];
  image: string;
  probability: number;
  count: number;
  firstAcquiredAt: string;
}

export interface UserState {
  githubLogin: string;
  githubId: number;
  coins: number;
  totalPulls: number;
  collectedItems: CollectedItemJson[];
  githubData: UserGitHubData | null;
}

export interface GlobalState {
  gachaItems: GachaItem[];
  gachaItemsVersion: string;
  gachaPullCost: number;
  startingCoins: number;
  events: GachaEvent[];
  announcements: Announcement[];
}

export interface AppData {
  global: GlobalState;
  users: Record<string, UserState>;
}

function initialGlobal(): GlobalState {
  return {
    gachaItems: DEFAULT_ITEMS,
    gachaItemsVersion: ITEMS_VERSION,
    gachaPullCost: 10,
    startingCoins: 30,
    events: [],
    announcements: [],
  };
}

export function loadAppData(): AppData {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    const data: AppData = { global: initialGlobal(), users: {} };
    saveAppData(data);
    return data;
  }
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    return JSON.parse(raw) as AppData;
  } catch {
    const data: AppData = { global: initialGlobal(), users: {} };
    saveAppData(data);
    return data;
  }
}

export function saveAppData(data: AppData): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${dataFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, dataFile);
}

export function userKey(login: string): string {
  return login.trim().toLowerCase();
}

export function getOrCreateUser(data: AppData, login: string, githubId: number): UserState {
  const key = userKey(login);
  if (!data.users[key]) {
    data.users[key] = {
      githubLogin: login,
      githubId,
      coins: data.global.startingCoins,
      totalPulls: 0,
      collectedItems: [],
      githubData: null,
    };
  }
  return data.users[key];
}
