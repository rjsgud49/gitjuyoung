import { pool } from './db';
import type { GachaItem } from '../src/types/index';
import type { GachaEvent, Announcement } from '../src/types/admin';

export interface UserGitHubData {
  username: string;
  totalCommits: number;
  fetchedAt: string;
}

export interface CollectedItemJson {
  id: string;
  name: string;
  rarity: GachaItem['rarity'];
  image: string;
  probability: number;
  count: number;
  firstAcquiredAt: string;
  individualValue: number;
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

export interface UserSummary {
  id: number;
  githubLogin: string;
  githubId: number;
  coins: number;
  totalPulls: number;
  lastCheckinDate: string | null;
  createdAt: string;
}

// ─── Farm types ───────────────────────────────────────────────────────────────

export interface FarmPlacedItem {
  itemId: string;
  itemName: string;
  itemRarity: 'common' | 'rare' | 'epic' | 'legendary';
  itemImage: string;
  individualValue: number;
  placedAt: string;
}

export interface FarmState {
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

async function loadFarmConfig(conn: Awaited<ReturnType<typeof pool.getConnection>>): Promise<FarmConfig> {
  const [rows] = await conn.query('SELECT * FROM farm_config WHERE id = 1') as any[];
  const r = (rows as any[])[0];
  if (!r) return { commonMin: 1, commonMax: 3, rareMin: 3, rareMax: 7, epicMin: 7, epicMax: 15, legendaryMin: 15, legendaryMax: 30 };
  return {
    commonMin: parseFloat(r.common_min), commonMax: parseFloat(r.common_max),
    rareMin: parseFloat(r.rare_min),     rareMax: parseFloat(r.rare_max),
    epicMin: parseFloat(r.epic_min),     epicMax: parseFloat(r.epic_max),
    legendaryMin: parseFloat(r.legendary_min), legendaryMax: parseFloat(r.legendary_max),
  };
}

export async function getFarmConfig(): Promise<FarmConfig> {
  const conn = await pool.getConnection();
  try { return await loadFarmConfig(conn); }
  finally { conn.release(); }
}

export async function saveFarmConfig(cfg: FarmConfig): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `INSERT INTO farm_config (id,common_min,common_max,rare_min,rare_max,epic_min,epic_max,legendary_min,legendary_max)
       VALUES (1,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         common_min=VALUES(common_min), common_max=VALUES(common_max),
         rare_min=VALUES(rare_min),     rare_max=VALUES(rare_max),
         epic_min=VALUES(epic_min),     epic_max=VALUES(epic_max),
         legendary_min=VALUES(legendary_min), legendary_max=VALUES(legendary_max)`,
      [cfg.commonMin, cfg.commonMax, cfg.rareMin, cfg.rareMax, cfg.epicMin, cfg.epicMax, cfg.legendaryMin, cfg.legendaryMax]
    );
  } finally { conn.release(); }
}

// ─── DB auto-init ────────────────────────────────────────────────────────────

export async function initDb(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS card_auctions (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        seller_login     VARCHAR(255) NOT NULL,
        item_id          VARCHAR(255) NOT NULL,
        item_name        VARCHAR(255) NOT NULL,
        item_rarity      VARCHAR(50)  NOT NULL,
        item_image       VARCHAR(2048) NOT NULL DEFAULT '',
        individual_value DECIMAL(10,2) NOT NULL DEFAULT 1.00,
        price            INT          NOT NULL,
        status           ENUM('active','sold','cancelled') NOT NULL DEFAULT 'active',
        buyer_login      VARCHAR(255) NULL,
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sold_at          DATETIME     NULL,
        INDEX idx_status (status),
        INDEX idx_seller (seller_login)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[db] card_auctions table OK');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS farm_config (
        id            INT PRIMARY KEY DEFAULT 1,
        common_min    DECIMAL(10,2) NOT NULL DEFAULT 1.00,
        common_max    DECIMAL(10,2) NOT NULL DEFAULT 3.00,
        rare_min      DECIMAL(10,2) NOT NULL DEFAULT 3.00,
        rare_max      DECIMAL(10,2) NOT NULL DEFAULT 7.00,
        epic_min      DECIMAL(10,2) NOT NULL DEFAULT 7.00,
        epic_max      DECIMAL(10,2) NOT NULL DEFAULT 15.00,
        legendary_min DECIMAL(10,2) NOT NULL DEFAULT 15.00,
        legendary_max DECIMAL(10,2) NOT NULL DEFAULT 30.00
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.query(`
      INSERT IGNORE INTO farm_config
        (id, common_min, common_max, rare_min, rare_max, epic_min, epic_max, legendary_min, legendary_max)
      VALUES (1, 1.00, 3.00, 3.00, 7.00, 7.00, 15.00, 15.00, 30.00)
    `);
    console.log('[db] farm_config table OK');
  } catch (e) {
    console.error('[db] initDb error:', e);
  } finally { conn.release(); }
}

// ─── Individual value helpers ─────────────────────────────────────────────────

const RARITY_RANGES: Record<string, [number, number]> = {
  common: [1.0, 3.0], rare: [3.0, 7.0], epic: [7.0, 15.0], legendary: [15.0, 30.0],
};

function randomInRange(rarity: string): number {
  const [min, max] = RARITY_RANGES[rarity] ?? [1.0, 3.0];
  return parseFloat((min + Math.random() * (max - min)).toFixed(2));
}

function isStaleValue(val: number, rarity: string): boolean {
  const [min] = RARITY_RANGES[rarity] ?? [1.0, 3.0];
  return val < min * 0.95; // below the rarity minimum → stale default
}

// ─── Farm CRUD ────────────────────────────────────────────────────────────────

export async function getUserFarmState(login: string, githubId: number): Promise<FarmState> {
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    const [cfgs] = await conn.query('SELECT starting_coins FROM global_config WHERE id = 1') as any[];
    const startingCoins = (cfgs as any[])[0]?.starting_coins ?? 30;
    await conn.query(
      `INSERT INTO users (github_login, github_id, coins) VALUES (?,?,?) ON DUPLICATE KEY UPDATE github_id=VALUES(github_id)`,
      [key, githubId, startingCoins]
    );
    const [rows] = await conn.query(
      'SELECT id, farm_slots, farm_last_collect FROM users WHERE github_login = ?', [key]
    ) as any[];
    const u = (rows as any[])[0];
    if (!u) throw new Error('user not found');

    const maxCards = u.farm_slots ?? 3;

    const [farmRows] = await conn.query(
      `SELECT uf.item_id, uf.item_name, uf.item_rarity, uf.item_image, uf.placed_at,
              COALESCE(uci.individual_value, 1.00) AS individual_value
       FROM user_farm uf
       LEFT JOIN user_collected_items uci
         ON uci.user_id = uf.user_id AND uci.item_id = uf.item_id
       WHERE uf.user_id = ?
       ORDER BY uf.placed_at`,
      [u.id]
    ) as any[];

    // Auto-fix stale individual_value (items collected before the system was added)
    for (const r of farmRows as any[]) {
      const val = parseFloat(r.individual_value);
      if (isStaleValue(val, r.item_rarity)) {
        const newVal = randomInRange(r.item_rarity);
        await conn.query(
          'UPDATE user_collected_items SET individual_value = ? WHERE user_id = ? AND item_id = ?',
          [newVal, u.id, r.item_id]
        );
        r.individual_value = newVal;
      }
    }

    const placedItems: FarmPlacedItem[] = (farmRows as any[]).map(r => ({
      itemId: r.item_id,
      itemName: r.item_name,
      itemRarity: r.item_rarity,
      itemImage: r.item_image,
      individualValue: parseFloat(r.individual_value),
      placedAt: new Date(r.placed_at).toISOString(),
    }));

    const extraCards = Math.max(0, maxCards - 3);
    return {
      placedItems,
      maxCards,
      lastCollect: u.farm_last_collect ? new Date(u.farm_last_collect).toISOString() : null,
      nextUpgradeCost: (extraCards + 1) * 200,
    };
  } finally { conn.release(); }
}

export async function placeFarmCard(
  login: string,
  item: { id: string; name: string; rarity: string; image: string }
): Promise<void> {
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT id, farm_slots FROM users WHERE github_login = ?', [key]) as any[];
    const u = (rows as any[])[0];
    if (!u) throw new Error('user not found');

    // Check if item is already placed
    const [existing] = await conn.query(
      'SELECT id FROM user_farm WHERE user_id = ? AND item_id = ?', [u.id, item.id]
    ) as any[];
    if ((existing as any[]).length > 0) throw new Error('이미 농장에 배치된 카드입니다');

    // Check max cards limit
    const [countRows] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM user_farm WHERE user_id = ?', [u.id]
    ) as any[];
    const currentCount = (countRows as any[])[0]?.cnt ?? 0;
    if (currentCount >= (u.farm_slots ?? 3)) throw new Error('최대 배치 수에 도달했습니다');

    await conn.query(
      `INSERT INTO user_farm (user_id, item_id, item_name, item_rarity, item_image)
       VALUES (?, ?, ?, ?, ?)`,
      [u.id, item.id, item.name, item.rarity, item.image]
    );
  } finally { conn.release(); }
}

export async function removeFarmCardByItemId(login: string, itemId: string): Promise<void> {
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT id FROM users WHERE github_login = ?', [key]) as any[];
    const u = (rows as any[])[0];
    if (u) await conn.query('DELETE FROM user_farm WHERE user_id = ? AND item_id = ?', [u.id, itemId]);
  } finally { conn.release(); }
}

const ENHANCE_BOOST: Record<string, number> = {
  common: 0.3, rare: 0.6, epic: 1.2, legendary: 2.5,
};

export async function enhanceFarmCard(
  login: string, itemId: string, copies: number
): Promise<{ newValue: number }> {
  if (copies < 1) throw new Error('copies must be >= 1');
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [userRows] = await conn.query('SELECT id FROM users WHERE github_login = ? FOR UPDATE', [key]) as any[];
    const u = (userRows as any[])[0];
    if (!u) { await conn.rollback(); throw new Error('user not found'); }

    const [itemRows] = await conn.query(
      'SELECT `count`, item_rarity, individual_value FROM user_collected_items WHERE user_id = ? AND item_id = ?',
      [u.id, itemId]
    ) as any[];
    const it = (itemRows as any[])[0];
    if (!it) { await conn.rollback(); throw new Error('아이템을 소유하지 않습니다'); }
    if (it.count <= copies) { await conn.rollback(); throw new Error('복제 카드가 부족합니다 (최소 1개 보유 필요)'); }

    const boost = ENHANCE_BOOST[it.item_rarity] ?? 0.3;
    const newValue = parseFloat((parseFloat(it.individual_value) + boost * copies).toFixed(2));

    await conn.query(
      'UPDATE user_collected_items SET `count` = `count` - ?, individual_value = ? WHERE user_id = ? AND item_id = ?',
      [copies, newValue, u.id, itemId]
    );
    await conn.commit();
    return { newValue };
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

const DISMANTLE_COINS: Record<string, number> = {
  common: 3, rare: 8, epic: 20, legendary: 50,
};

export async function dismantleDuplicates(
  login: string, itemId: string, copies: number
): Promise<{ coinsGained: number }> {
  if (copies < 1) throw new Error('copies must be >= 1');
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [userRows] = await conn.query('SELECT id FROM users WHERE github_login = ? FOR UPDATE', [key]) as any[];
    const u = (userRows as any[])[0];
    if (!u) { await conn.rollback(); throw new Error('user not found'); }

    const [itemRows] = await conn.query(
      'SELECT `count`, item_rarity FROM user_collected_items WHERE user_id = ? AND item_id = ?',
      [u.id, itemId]
    ) as any[];
    const it = (itemRows as any[])[0];
    if (!it) { await conn.rollback(); throw new Error('아이템을 소유하지 않습니다'); }
    if (it.count <= copies) { await conn.rollback(); throw new Error('복제 카드가 부족합니다 (최소 1개 보유 필요)'); }

    const coinsPerCopy = DISMANTLE_COINS[it.item_rarity] ?? 3;
    const coinsGained = coinsPerCopy * copies;

    await conn.query(
      'UPDATE user_collected_items SET `count` = `count` - ? WHERE user_id = ? AND item_id = ?',
      [copies, u.id, itemId]
    );
    await conn.query('UPDATE users SET coins = coins + ? WHERE id = ?', [coinsGained, u.id]);
    await conn.commit();
    return { coinsGained };
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

export async function collectFarmCoins(login: string): Promise<{ coinsCollected: number }> {
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, farm_last_collect FROM users WHERE github_login = ? FOR UPDATE', [key]) as any[];
    const u = (rows as any[])[0];
    if (!u) { await conn.rollback(); return { coinsCollected: 0 }; }

    const [farmRows] = await conn.query(
      `SELECT COALESCE(uci.individual_value, 1.00) AS rate
       FROM user_farm uf
       LEFT JOIN user_collected_items uci
         ON uci.user_id = uf.user_id AND uci.item_id = uf.item_id
       WHERE uf.user_id = ?`,
      [u.id]
    ) as any[];

    const totalRate = (farmRows as any[]).reduce((s: number, r: any) => s + parseFloat(r.rate), 0);
    const lastCollect = u.farm_last_collect ? new Date(u.farm_last_collect) : new Date(Date.now() - 3600000);
    const elapsedHours = Math.min((Date.now() - lastCollect.getTime()) / 3600000, 24);
    const coins = totalRate > 0 ? Math.floor(totalRate * elapsedHours) : 0;

    await conn.query('UPDATE users SET coins = coins + ?, farm_last_collect = NOW() WHERE id = ?', [coins, u.id]);
    await conn.commit();
    return { coinsCollected: coins };
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

export async function upgradeFarmSlots(login: string): Promise<{ newMaxCards: number; cost: number }> {
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, coins, farm_slots FROM users WHERE github_login = ? FOR UPDATE', [key]) as any[];
    const u = (rows as any[])[0];
    if (!u) { await conn.rollback(); throw new Error('user not found'); }
    const currentCards = u.farm_slots ?? 3;
    const cost = (Math.max(0, currentCards - 3) + 1) * 200;
    if (u.coins < cost) { await conn.rollback(); throw new Error('코인 부족'); }
    const newCards = currentCards + 1;
    await conn.query('UPDATE users SET coins = coins - ?, farm_slots = ? WHERE id = ?', [cost, newCards, u.id]);
    await conn.commit();
    return { newMaxCards: newCards, cost };
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

// ─── Global / User ────────────────────────────────────────────────────────────

export async function getGlobalState(): Promise<GlobalState> {
  const conn = await pool.getConnection();
  try {
    const [configs] = await conn.query('SELECT * FROM global_config WHERE id = 1') as any[];
    const [items] = await conn.query('SELECT * FROM gacha_items') as any[];
    const [events] = await conn.query('SELECT * FROM events') as any[];
    const [announcements] = await conn.query(
      'SELECT * FROM announcements ORDER BY is_pinned DESC, created_at DESC'
    ) as any[];

    const cfg = (configs as any[])[0];
    return {
      gachaItemsVersion: cfg?.gacha_items_version ?? 'v1',
      gachaPullCost:     cfg?.gacha_pull_cost     ?? 10,
      startingCoins:     cfg?.starting_coins      ?? 30,
      gachaItems: (items as any[]).map((r): GachaItem => ({
        id: r.id, name: r.name, rarity: r.rarity,
        probability: r.probability, image: r.image,
      })),
      events: (events as any[]).map((r): GachaEvent => ({
        id: r.id, name: r.name, type: r.type, value: r.value,
        description: r.description ?? '',
        expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : '',
        isActive: r.is_active === 1,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      announcements: (announcements as any[]).map((r): Announcement => ({
        id: r.id, title: r.title, content: r.content, type: r.type,
        isPinned: r.is_pinned === 1,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    };
  } finally {
    conn.release();
  }
}

export async function saveGlobalState(g: GlobalState): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO global_config (id, gacha_items_version, gacha_pull_cost, starting_coins)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         gacha_items_version = VALUES(gacha_items_version),
         gacha_pull_cost     = VALUES(gacha_pull_cost),
         starting_coins      = VALUES(starting_coins)`,
      [g.gachaItemsVersion, g.gachaPullCost, g.startingCoins]
    );

    await conn.query('DELETE FROM gacha_items');
    if (g.gachaItems.length > 0) {
      await conn.query(
        'INSERT INTO gacha_items (id, name, rarity, probability, image) VALUES ?',
        [g.gachaItems.map(i => [i.id, i.name, i.rarity, i.probability, i.image])]
      );
    }

    await conn.query('DELETE FROM events');
    if (g.events.length > 0) {
      await conn.query(
        'INSERT INTO events (id, name, type, value, description, expires_at, is_active, created_at) VALUES ?',
        [g.events.map(e => [
          e.id, e.name, e.type, e.value, e.description,
          e.expiresAt ? new Date(e.expiresAt) : null,
          e.isActive ? 1 : 0,
          new Date(e.createdAt),
        ])]
      );
    }

    await conn.query('DELETE FROM announcements');
    if (g.announcements.length > 0) {
      await conn.query(
        'INSERT INTO announcements (id, title, content, type, is_pinned, created_at) VALUES ?',
        [g.announcements.map(a => [
          a.id, a.title, a.content, a.type, a.isPinned ? 1 : 0, new Date(a.createdAt),
        ])]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getOrCreateUser(login: string, githubId: number): Promise<UserState> {
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    const [cfgs] = await conn.query('SELECT starting_coins FROM global_config WHERE id = 1') as any[];
    const startingCoins = (cfgs as any[])[0]?.starting_coins ?? 30;

    await conn.query(
      `INSERT INTO users (github_login, github_id, coins)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE github_id = VALUES(github_id)`,
      [key, githubId, startingCoins]
    );

    const [rows] = await conn.query('SELECT * FROM users WHERE github_login = ?', [key]) as any[];
    const u = (rows as any[])[0];

    const [items] = await conn.query(
      'SELECT * FROM user_collected_items WHERE user_id = ?', [u.id]
    ) as any[];

    // Auto-fix stale individual_value for collected items
    for (const r of items as any[]) {
      const val = parseFloat(r.individual_value ?? '0');
      if (isStaleValue(val, r.item_rarity)) {
        const newVal = randomInRange(r.item_rarity);
        await conn.query(
          'UPDATE user_collected_items SET individual_value = ? WHERE user_id = ? AND item_id = ?',
          [newVal, u.id, r.item_id]
        );
        r.individual_value = newVal;
      }
    }

    return {
      githubLogin: u.github_login,
      githubId:    u.github_id,
      coins:       u.coins,
      totalPulls:  u.total_pulls,
      collectedItems: (items as any[]).map((r): CollectedItemJson => ({
        id: r.item_id, name: r.item_name, rarity: r.item_rarity,
        image: r.item_image, probability: r.item_probability,
        count: r.count,
        firstAcquiredAt: new Date(r.first_acquired_at).toISOString(),
        individualValue: parseFloat(r.individual_value ?? '1.00'),
      })),
      githubData: u.github_username
        ? { username: u.github_username, totalCommits: u.github_total_commits,
            fetchedAt: new Date(u.github_fetched_at).toISOString() }
        : null,
    };
  } finally {
    conn.release();
  }
}

function localDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dbDateToStr(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`;
  }
  return String(raw).slice(0, 10);
}

export async function checkAndDoCheckin(login: string, githubId: number): Promise<{ alreadyDone: boolean; coinsAdded: number }> {
  const key = login.trim().toLowerCase();
  const today = localDateStr();
  const conn = await pool.getConnection();
  try {
    const [cfgs] = await conn.query('SELECT starting_coins FROM global_config WHERE id = 1') as any[];
    const startingCoins = (cfgs as any[])[0]?.starting_coins ?? 30;
    await conn.query(
      `INSERT INTO users (github_login, github_id, coins) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE github_id = VALUES(github_id)`,
      [key, githubId, startingCoins]
    );

    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT last_checkin_date FROM users WHERE github_login = ? FOR UPDATE', [key]
    ) as any[];
    const u = (rows as any[])[0];
    if (!u) { await conn.rollback(); return { alreadyDone: false, coinsAdded: 0 }; }

    const lastCheckin = dbDateToStr(u.last_checkin_date);
    if (lastCheckin === today) {
      await conn.rollback();
      return { alreadyDone: true, coinsAdded: 0 };
    }

    await conn.query(
      'UPDATE users SET coins = coins + 20, last_checkin_date = ? WHERE github_login = ?',
      [today, key]
    );
    await conn.commit();
    return { alreadyDone: false, coinsAdded: 20 };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function listUsers(): Promise<UserSummary[]> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT id, github_login, github_id, coins, total_pulls, last_checkin_date, created_at FROM users ORDER BY created_at DESC'
    ) as any[];
    return (rows as any[]).map(r => ({
      id: r.id,
      githubLogin: r.github_login,
      githubId: r.github_id,
      coins: r.coins,
      totalPulls: r.total_pulls,
      lastCheckinDate: dbDateToStr(r.last_checkin_date),
      createdAt: new Date(r.created_at).toISOString(),
    }));
  } finally {
    conn.release();
  }
}

export async function adminUpdateUser(
  login: string, data: { coins?: number; totalPulls?: number }
): Promise<void> {
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (typeof data.coins === 'number') { sets.push('coins = ?'); vals.push(data.coins); }
    if (typeof data.totalPulls === 'number') { sets.push('total_pulls = ?'); vals.push(data.totalPulls); }
    if (sets.length === 0) return;
    vals.push(key);
    await conn.query(`UPDATE users SET ${sets.join(', ')} WHERE github_login = ?`, vals);
  } finally {
    conn.release();
  }
}

export async function adminDeleteUser(login: string): Promise<void> {
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM users WHERE github_login = ?', [key]);
  } finally {
    conn.release();
  }
}

// ─── Auction types ────────────────────────────────────────────────────────────

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

function rowToAuction(r: any): AuctionEntry {
  return {
    id: r.id,
    sellerLogin: r.seller_login,
    itemId: r.item_id,
    itemName: r.item_name,
    itemRarity: r.item_rarity,
    itemImage: r.item_image,
    individualValue: parseFloat(r.individual_value),
    price: r.price,
    status: r.status,
    buyerLogin: r.buyer_login ?? null,
    createdAt: new Date(r.created_at).toISOString(),
    soldAt: r.sold_at ? new Date(r.sold_at).toISOString() : null,
  };
}

export async function listAuctions(): Promise<AuctionEntry[]> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      "SELECT * FROM card_auctions WHERE status = 'active' ORDER BY created_at DESC LIMIT 100"
    ) as any[];
    return (rows as any[]).map(rowToAuction);
  } finally { conn.release(); }
}

export async function listMyAuctions(login: string): Promise<AuctionEntry[]> {
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT * FROM card_auctions WHERE seller_login = ? ORDER BY created_at DESC LIMIT 50', [key]
    ) as any[];
    return (rows as any[]).map(rowToAuction);
  } finally { conn.release(); }
}

export async function createAuction(
  login: string,
  item: { itemId: string; itemName: string; itemRarity: string; itemImage: string; individualValue: number },
  price: number
): Promise<{ auctionId: number }> {
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [userRows] = await conn.query('SELECT id FROM users WHERE github_login = ? FOR UPDATE', [key]) as any[];
    const u = (userRows as any[])[0];
    if (!u) { await conn.rollback(); throw new Error('user not found'); }

    const [itemRows] = await conn.query(
      'SELECT `count` FROM user_collected_items WHERE user_id = ? AND item_id = ?',
      [u.id, item.itemId]
    ) as any[];
    const owned = (itemRows as any[])[0];
    if (!owned || owned.count < 1) { await conn.rollback(); throw new Error('카드를 보유하지 않습니다'); }

    if (owned.count === 1) {
      await conn.query('DELETE FROM user_collected_items WHERE user_id = ? AND item_id = ?', [u.id, item.itemId]);
    } else {
      await conn.query(
        'UPDATE user_collected_items SET `count` = `count` - 1 WHERE user_id = ? AND item_id = ?',
        [u.id, item.itemId]
      );
    }

    const [result] = await conn.query(
      `INSERT INTO card_auctions (seller_login, item_id, item_name, item_rarity, item_image, individual_value, price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [key, item.itemId, item.itemName, item.itemRarity, item.itemImage, item.individualValue, price]
    ) as any[];
    await conn.commit();
    return { auctionId: (result as any).insertId };
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

export async function cancelAuction(login: string, auctionId: number): Promise<void> {
  const key = login.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [auctionRows] = await conn.query(
      "SELECT * FROM card_auctions WHERE id = ? AND status = 'active' FOR UPDATE", [auctionId]
    ) as any[];
    const auction = (auctionRows as any[])[0];
    if (!auction) { await conn.rollback(); throw new Error('경매를 찾을 수 없습니다'); }
    if (auction.seller_login !== key) { await conn.rollback(); throw new Error('권한 없음'); }

    const [userRows] = await conn.query('SELECT id FROM users WHERE github_login = ?', [key]) as any[];
    const u = (userRows as any[])[0];
    if (u) {
      await conn.query(
        `INSERT INTO user_collected_items
           (user_id, item_id, item_name, item_rarity, item_image, item_probability, count, first_acquired_at, individual_value)
         VALUES (?, ?, ?, ?, ?, 0, 1, NOW(), ?)
         ON DUPLICATE KEY UPDATE count = count + 1`,
        [u.id, auction.item_id, auction.item_name, auction.item_rarity, auction.item_image, parseFloat(auction.individual_value)]
      );
    }
    await conn.query("UPDATE card_auctions SET status = 'cancelled' WHERE id = ?", [auctionId]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

export async function buyAuction(buyerLogin: string, auctionId: number): Promise<{ coinsSpent: number }> {
  const key = buyerLogin.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [auctionRows] = await conn.query(
      "SELECT * FROM card_auctions WHERE id = ? AND status = 'active' FOR UPDATE", [auctionId]
    ) as any[];
    const auction = (auctionRows as any[])[0];
    if (!auction) { await conn.rollback(); throw new Error('경매를 찾을 수 없습니다'); }
    if (auction.seller_login === key) { await conn.rollback(); throw new Error('자신의 경매를 구매할 수 없습니다'); }

    const [buyerRows] = await conn.query('SELECT id, coins FROM users WHERE github_login = ? FOR UPDATE', [key]) as any[];
    const buyer = (buyerRows as any[])[0];
    if (!buyer) { await conn.rollback(); throw new Error('구매자를 찾을 수 없습니다'); }
    if (buyer.coins < auction.price) { await conn.rollback(); throw new Error('코인 부족'); }

    await conn.query('UPDATE users SET coins = coins - ? WHERE id = ?', [auction.price, buyer.id]);
    await conn.query('UPDATE users SET coins = coins + ? WHERE github_login = ?', [auction.price, auction.seller_login]);
    await conn.query(
      `INSERT INTO user_collected_items
         (user_id, item_id, item_name, item_rarity, item_image, item_probability, count, first_acquired_at, individual_value)
       VALUES (?, ?, ?, ?, ?, 0, 1, NOW(), ?)
       ON DUPLICATE KEY UPDATE count = count + 1`,
      [buyer.id, auction.item_id, auction.item_name, auction.item_rarity, auction.item_image, parseFloat(auction.individual_value)]
    );
    await conn.query(
      "UPDATE card_auctions SET status = 'sold', buyer_login = ?, sold_at = NOW() WHERE id = ?",
      [key, auctionId]
    );
    await conn.commit();
    return { coinsSpent: auction.price };
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

export async function saveUser(user: UserState): Promise<void> {
  const key = user.githubLogin.trim().toLowerCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE users
       SET coins = ?, total_pulls = ?,
           github_username = ?, github_total_commits = ?, github_fetched_at = ?
       WHERE github_login = ?`,
      [
        user.coins, user.totalPulls,
        user.githubData?.username      ?? null,
        user.githubData?.totalCommits  ?? null,
        user.githubData?.fetchedAt ? new Date(user.githubData.fetchedAt) : null,
        key,
      ]
    );

    const [rows] = await conn.query('SELECT id FROM users WHERE github_login = ?', [key]) as any[];
    const userId = (rows as any[])[0].id;

    await conn.query('DELETE FROM user_collected_items WHERE user_id = ?', [userId]);
    if (user.collectedItems.length > 0) {
      await conn.query(
        `INSERT INTO user_collected_items
           (user_id, item_id, item_name, item_rarity, item_image, item_probability, count, first_acquired_at, individual_value)
         VALUES ?`,
        [user.collectedItems.map(i => [
          userId, i.id, i.name, i.rarity, i.image, i.probability, i.count,
          new Date(i.firstAcquiredAt),
          i.individualValue ?? 1.00,
        ])]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
