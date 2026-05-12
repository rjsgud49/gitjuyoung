import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { verifyGithubToken, isAdminLogin } from './auth';
import {
  loadAppData,
  saveAppData,
  getOrCreateUser,
  type GlobalState,
  type UserState,
} from './store';

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

app.get('/api/global', (_req, res) => {
  const data = loadAppData();
  res.json(data.global);
});

app.get('/api/github-token', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) {
    res.status(400).json({ error: 'missing code' });
    return;
  }
  const client_id = process.env.VITE_GITHUB_CLIENT_ID;
  const client_secret = process.env.GITHUB_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    res.status(500).json({ error: 'server_missing_oauth_env' });
    return;
  }
  try {
    const ghRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ client_id, client_secret, code }),
    });
    const payload = (await ghRes.json()) as Record<string, unknown>;
    res.json(payload);
  } catch {
    res.status(500).json({ error: 'token_exchange_failed' });
  }
});

app.get('/api/me', async (req, res) => {
  const token = ghToken(req);
  const user = await verifyGithubToken(token);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const data = loadAppData();
  const row = getOrCreateUser(data, user.login, user.id);
  saveAppData(data);
  res.json({
    login: row.githubLogin,
    coins: row.coins,
    totalPulls: row.totalPulls,
    collectedItems: row.collectedItems,
    githubData: row.githubData,
  });
});

app.put('/api/me', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const body = req.body as Partial<{
    coins: number;
    totalPulls: number;
    collectedItems: UserState['collectedItems'];
    githubData: UserState['githubData'];
  }>;
  const data = loadAppData();
  const row = getOrCreateUser(data, authUser.login, authUser.id);
  if (typeof body.coins === 'number' && Number.isFinite(body.coins) && body.coins >= 0) {
    row.coins = Math.floor(body.coins);
  }
  if (typeof body.totalPulls === 'number' && Number.isFinite(body.totalPulls) && body.totalPulls >= 0) {
    row.totalPulls = Math.floor(body.totalPulls);
  }
  if (Array.isArray(body.collectedItems)) {
    row.collectedItems = body.collectedItems;
  }
  if (body.githubData === null) {
    row.githubData = null;
  } else if (body.githubData && typeof body.githubData === 'object') {
    const g = body.githubData as { username?: string; totalCommits?: number; fetchedAt?: string };
    if (typeof g.username === 'string' && typeof g.totalCommits === 'number' && typeof g.fetchedAt === 'string') {
      row.githubData = { username: g.username, totalCommits: g.totalCommits, fetchedAt: g.fetchedAt };
    }
  }
  saveAppData(data);
  res.json({ ok: true });
});

app.put('/api/admin/global', async (req, res) => {
  const token = ghToken(req);
  const authUser = await verifyGithubToken(token);
  if (!authUser || !isAdminLogin(authUser.login)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const body = req.body as Partial<GlobalState>;
  const data = loadAppData();
  const g = data.global;
  if (Array.isArray(body.gachaItems)) g.gachaItems = body.gachaItems;
  if (typeof body.gachaItemsVersion === 'string') g.gachaItemsVersion = body.gachaItemsVersion;
  if (typeof body.gachaPullCost === 'number' && body.gachaPullCost >= 1) {
    g.gachaPullCost = Math.floor(body.gachaPullCost);
  }
  if (typeof body.startingCoins === 'number' && body.startingCoins >= 0) {
    g.startingCoins = Math.floor(body.startingCoins);
  }
  if (Array.isArray(body.events)) g.events = body.events;
  if (Array.isArray(body.announcements)) g.announcements = body.announcements;
  saveAppData(data);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[server] http://127.0.0.1:${PORT}  (GET /api/health)`);
});
