import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { verifyGithubToken, isAdminLogin } from './auth';
import {
  initDb,
  getGlobalState,
  saveGlobalState,
  getOrCreateUser,
  saveUser,
  checkAndDoCheckin,
  listUsers,
  adminUpdateUser,
  adminDeleteUser,
  getUserFarmState,
  placeFarmCard,
  removeFarmCardByItemId,
  collectFarmCoins,
  upgradeFarmSlots,
  enhanceFarmCard,
  dismantleDuplicates,
  getFarmConfig,
  saveFarmConfig,
  rerollAllIndividualValues,
  listAuctions,
  listMyAuctions,
  createAuction,
  cancelAuction,
  buyAuction,
  type GlobalState,
  type UserState,
} from './store';

// ─── In-memory activity feed ──────────────────────────────────────────────────

interface ActivityEntry {
  login: string;
  itemName: string;
  itemRarity: string;
  timestamp: string;
}
const activityLog: ActivityEntry[] = [];
const MAX_ACTIVITY = 60;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '8787', 10);

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '8mb' }));

function ghToken(req: express.Request): string | undefined {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return undefined;
  return h.slice(7).trim();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/global', async (_req, res) => {
  try {
    res.json(await getGlobalState());
  } catch (err) {
    console.error('[/api/global] ERROR:', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/github-token', async (req, res) => {
  const code        = typeof req.query.code         === 'string' ? req.query.code         : '';
  const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : '';
  if (!code) { res.status(400).json({ error: 'missing code' }); return; }

  const client_id     = process.env.VITE_GITHUB_CLIENT_ID;
  const client_secret = process.env.GITHUB_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    res.status(500).json({ error: 'server_missing_oauth_env' }); return;
  }
  try {
    const body: Record<string, string> = { client_id, client_secret, code };
    if (redirectUri) body.redirect_uri = redirectUri;
    const ghRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    res.json(await ghRes.json());
  } catch {
    res.status(500).json({ error: 'token_exchange_failed' });
  }
});

app.get('/api/me', async (req, res) => {
  const token = ghToken(req);
  const user = await verifyGithubToken(token);
  if (!user) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    const row = await getOrCreateUser(user.login, user.id);
    res.json({
      login: row.githubLogin,
      coins: row.coins,
      totalPulls: row.totalPulls,
      collectedItems: row.collectedItems,
      githubData: row.githubData,
    });
  } catch (err) {
    console.error('[/api/me GET] ERROR:', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.put('/api/me', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }

  const body = req.body as Partial<{
    coins: number;
    totalPulls: number;
    collectedItems: UserState['collectedItems'];
    githubData: UserState['githubData'];
  }>;
  try {
    const row = await getOrCreateUser(authUser.login, authUser.id);
    if (typeof body.coins === 'number' && Number.isFinite(body.coins) && body.coins >= 0)
      row.coins = Math.floor(body.coins);
    if (typeof body.totalPulls === 'number' && Number.isFinite(body.totalPulls) && body.totalPulls >= 0)
      row.totalPulls = Math.floor(body.totalPulls);
    if (Array.isArray(body.collectedItems))
      row.collectedItems = body.collectedItems;
    if (body.githubData === null) {
      row.githubData = null;
    } else if (body.githubData && typeof body.githubData === 'object') {
      const g = body.githubData as { username?: string; totalCommits?: number; fetchedAt?: string };
      if (typeof g.username === 'string' && typeof g.totalCommits === 'number' && typeof g.fetchedAt === 'string')
        row.githubData = { username: g.username, totalCommits: g.totalCommits, fetchedAt: g.fetchedAt };
    }
    await saveUser(row);
    res.json({ ok: true });
  } catch (err) {
    console.error('[/api/me PUT] ERROR:', err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.put('/api/admin/global', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser || !isAdminLogin(authUser.login)) {
    res.status(403).json({ error: 'forbidden' }); return;
  }
  const body = req.body as Partial<GlobalState>;
  try {
    const g = await getGlobalState();
    if (Array.isArray(body.gachaItems)) g.gachaItems = body.gachaItems;
    if (typeof body.gachaItemsVersion === 'string') g.gachaItemsVersion = body.gachaItemsVersion;
    if (typeof body.gachaPullCost === 'number' && body.gachaPullCost >= 1)
      g.gachaPullCost = Math.floor(body.gachaPullCost);
    if (typeof body.startingCoins === 'number' && body.startingCoins >= 0)
      g.startingCoins = Math.floor(body.startingCoins);
    if (Array.isArray(body.events)) g.events = body.events;
    if (Array.isArray(body.announcements)) g.announcements = body.announcements;
    await saveGlobalState(g);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/checkin', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    const result = await checkAndDoCheckin(authUser.login, authUser.id);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser || !isAdminLogin(authUser.login)) {
    res.status(403).json({ error: 'forbidden' }); return;
  }
  try {
    res.json(await listUsers());
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.put('/api/admin/users/:login', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser || !isAdminLogin(authUser.login)) {
    res.status(403).json({ error: 'forbidden' }); return;
  }
  const body = req.body as { coins?: number; totalPulls?: number };
  try {
    await adminUpdateUser(req.params.login, {
      coins: typeof body.coins === 'number' && body.coins >= 0 ? Math.floor(body.coins) : undefined,
      totalPulls: typeof body.totalPulls === 'number' && body.totalPulls >= 0 ? Math.floor(body.totalPulls) : undefined,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

app.delete('/api/admin/users/:login', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser || !isAdminLogin(authUser.login)) {
    res.status(403).json({ error: 'forbidden' }); return;
  }
  try {
    await adminDeleteUser(req.params.login);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'db_error' });
  }
});

// ─── Farm routes ─────────────────────────────────────────────────────────────

app.get('/api/farm', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  try { res.json(await getUserFarmState(authUser.login, authUser.id)); }
  catch { res.status(500).json({ error: 'db_error' }); }
});

app.put('/api/farm/place', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  const { id, name, rarity, image } = req.body as { id: string; name: string; rarity: string; image: string };
  if (!id || !name || !rarity || !image) { res.status(400).json({ error: 'bad_request' }); return; }
  try { await placeFarmCard(authUser.login, { id, name, rarity, image }); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'error' }); }
});

app.delete('/api/farm/item/:itemId', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  try { await removeFarmCardByItemId(authUser.login, req.params.itemId); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'db_error' }); }
});

app.post('/api/farm/collect', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  try { res.json(await collectFarmCoins(authUser.login)); }
  catch { res.status(500).json({ error: 'db_error' }); }
});

app.post('/api/farm/upgrade', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  try { res.json(await upgradeFarmSlots(authUser.login)); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'error' }); }
});

app.post('/api/farm/enhance', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  const { itemId, copies } = req.body as { itemId: string; copies: number };
  if (!itemId || typeof copies !== 'number' || copies < 1) { res.status(400).json({ error: 'bad_request' }); return; }
  try { res.json(await enhanceFarmCard(authUser.login, itemId, Math.floor(copies))); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'error' }); }
});

app.post('/api/farm/dismantle', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  const { itemId, copies } = req.body as { itemId: string; copies: number };
  if (!itemId || typeof copies !== 'number' || copies < 1) { res.status(400).json({ error: 'bad_request' }); return; }
  try { res.json(await dismantleDuplicates(authUser.login, itemId, Math.floor(copies))); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'error' }); }
});

app.get('/api/admin/farm-config', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser || !isAdminLogin(authUser.login)) { res.status(403).json({ error: 'forbidden' }); return; }
  try { res.json(await getFarmConfig()); }
  catch { res.status(500).json({ error: 'db_error' }); }
});

app.put('/api/admin/farm-config', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser || !isAdminLogin(authUser.login)) { res.status(403).json({ error: 'forbidden' }); return; }
  try { await saveFarmConfig(req.body); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'db_error' }); }
});

app.post('/api/admin/reroll-values', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser || !isAdminLogin(authUser.login)) { res.status(403).json({ error: 'forbidden' }); return; }
  try { res.json(await rerollAllIndividualValues()); }
  catch { res.status(500).json({ error: 'db_error' }); }
});

// ─── Fix all stale individual values for a user ──────────────────────────────

app.post('/api/me/fix-values', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    // getOrCreateUser already contains the fix logic — just call it
    await getOrCreateUser(authUser.login, authUser.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[/api/me/fix-values] ERROR:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// ─── Activity feed ────────────────────────────────────────────────────────────

app.get('/api/activity', (_req, res) => {
  res.json([...activityLog].reverse().slice(0, 30));
});

app.post('/api/activity', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  const { itemName, itemRarity } = req.body as { itemName?: string; itemRarity?: string };
  if (!itemName || !itemRarity) { res.status(400).json({ error: 'bad_request' }); return; }
  activityLog.push({ login: authUser.login, itemName, itemRarity, timestamp: new Date().toISOString() });
  if (activityLog.length > MAX_ACTIVITY) activityLog.splice(0, activityLog.length - MAX_ACTIVITY);
  res.json({ ok: true });
});

// ─── Public farm config ───────────────────────────────────────────────────────

app.get('/api/farm-config', async (_req, res) => {
  try { res.json(await getFarmConfig()); }
  catch { res.status(500).json({ error: 'db_error' }); }
});

// ─── Auction routes ───────────────────────────────────────────────────────────

app.get('/api/auction', async (_req, res) => {
  try { res.json(await listAuctions()); }
  catch { res.status(500).json({ error: 'db_error' }); }
});

app.get('/api/auction/mine', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  try { res.json(await listMyAuctions(authUser.login)); }
  catch { res.status(500).json({ error: 'db_error' }); }
});

app.post('/api/auction', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  const { itemId, itemName, itemRarity, itemImage, individualValue, price } = req.body as {
    itemId?: string; itemName?: string; itemRarity?: string; itemImage?: string;
    individualValue?: number; price?: number;
  };
  if (!itemId || !itemName || !itemRarity || !itemImage || typeof price !== 'number' || price < 1) {
    res.status(400).json({ error: 'bad_request' }); return;
  }
  try {
    const result = await createAuction(authUser.login, {
      itemId, itemName, itemRarity, itemImage,
      individualValue: typeof individualValue === 'number' ? individualValue : 1.0,
    }, Math.floor(price));
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'error' });
  }
});

app.delete('/api/auction/:id', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: 'bad_request' }); return; }
  try { await cancelAuction(authUser.login, id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'error' }); }
});

app.post('/api/auction/:id/buy', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) { res.status(401).json({ error: 'unauthorized' }); return; }
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: 'bad_request' }); return; }
  try { res.json(await buyAuction(authUser.login, id)); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : 'error' }); }
});

// 프로덕션: 빌드된 프론트 정적 파일 서빙
const distPath = join(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[server] http://0.0.0.0:${PORT}  (GET /api/health)`);
  initDb().catch(err => console.error('[db] initDb failed:', err));
});
