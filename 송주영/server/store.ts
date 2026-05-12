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
           (user_id, item_id, item_name, item_rarity, item_image, item_probability, count, first_acquired_at)
         VALUES ?`,
        [user.collectedItems.map(i => [
          userId, i.id, i.name, i.rarity, i.image, i.probability, i.count,
          new Date(i.firstAcquiredAt),
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
