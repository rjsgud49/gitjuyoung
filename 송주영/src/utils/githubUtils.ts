export interface GitHubCommitData {
  username: string;
  totalCommits: number;
  fetchedAt: string;
}

export interface GitHubProfile {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
  html_url: string;
  created_at: string;
}

export interface GitHubRepo {
  name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  html_url: string;
  updated_at: string;
}

export interface ActivityItem {
  type: string;
  repo: string;
  commits?: number;
  createdAt: string;
}

export interface GitHubStats {
  profile: GitHubProfile;
  repos: GitHubRepo[];
  totalStars: number;
  languageMap: Record<string, number>;
  totalCommits: number;
  recentActivity: ActivityItem[];
}

// ── Auth storage ──────────────────────────────────────────────────────────────

const AUTH_KEY    = 'github_token';
const PROFILE_KEY = 'github_profile';
const COIN_KEY    = 'githubData';
const STATE_KEY   = 'github_oauth_state';

export function saveToken(token: string): void {
  localStorage.setItem(AUTH_KEY, token);
}

export function loadToken(): string | null {
  return localStorage.getItem(AUTH_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

export function saveProfile(profile: GitHubProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadProfile(): GitHubProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as GitHubProfile) : null;
  } catch { return null; }
}

// ── OAuth helpers ─────────────────────────────────────────────────────────────

export function generateOAuthUrl(): string {
  const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
  sessionStorage.setItem(STATE_KEY, state);
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID as string;
  return (
    'https://github.com/login/oauth/authorize' +
    `?client_id=${clientId}` +
    `&scope=read:user` +
    `&state=${state}`
  );
}

export function getStoredState(): string | null {
  return sessionStorage.getItem(STATE_KEY);
}

export function clearOAuthState(): void {
  sessionStorage.removeItem(STATE_KEY);
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch(`/api/github-token?code=${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error('토큰 교환 실패');
  const data = await res.json() as { access_token?: string; error?: string; error_description?: string };
  if (!data.access_token) {
    throw new Error(data.error_description ?? data.error ?? '토큰을 받지 못했습니다');
  }
  return data.access_token;
}

// ── GitHub API ────────────────────────────────────────────────────────────────

export async function fetchProfileByToken(token: string): Promise<GitHubProfile> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? '인증이 만료되었습니다' : 'GitHub API 오류');
  }
  return res.json() as Promise<GitHubProfile>;
}

function authHeader(token?: string | null): Record<string, string> {
  return token ? { Authorization: `token ${token}` } : {};
}

export async function fetchGitHubCommitCount(
  username: string,
  token?: string | null
): Promise<number> {
  const enc = encodeURIComponent(username.trim());
  const base = { Accept: 'application/vnd.github.cloak-preview+json', ...authHeader(token) };

  try {
    const res = await fetch(
      `https://api.github.com/search/commits?q=author:${enc}&per_page=1`,
      { headers: base }
    );
    if (res.ok) {
      const data = await res.json();
      if (typeof data.total_count === 'number') return data.total_count;
    }
  } catch { /* fall through */ }

  try {
    let count = 0;
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(
        `https://api.github.com/users/${enc}/events/public?per_page=100&page=${page}`,
        { headers: { Accept: 'application/vnd.github.v3+json', ...authHeader(token) } }
      );
      if (!res.ok) break;
      const events: Array<{ type: string; payload: { commits?: unknown[] } }> = await res.json();
      if (!events || events.length === 0) break;
      events.forEach(e => {
        if (e.type === 'PushEvent' && Array.isArray(e.payload.commits)) {
          count += e.payload.commits.length;
        }
      });
      if (events.length < 100) break;
    }
    return count;
  } catch { /* fall through */ }

  return 0;
}

// ── Full stats ────────────────────────────────────────────────────────────────

export async function fetchGitHubFullStats(
  username: string,
  token?: string | null
): Promise<GitHubStats> {
  const enc = encodeURIComponent(username.trim());
  const headers = { Accept: 'application/vnd.github.v3+json', ...authHeader(token) };

  const [profileRes, reposRes, eventsRes] = await Promise.all([
    fetch(`https://api.github.com/users/${enc}`, { headers }),
    fetch(`https://api.github.com/users/${enc}/repos?sort=stars&direction=desc&per_page=10`, { headers }),
    fetch(`https://api.github.com/users/${enc}/events/public?per_page=30`, { headers }),
  ]);

  if (!profileRes.ok) throw new Error(`GitHub 사용자를 찾을 수 없습니다: ${username}`);

  const profile: GitHubProfile = await profileRes.json();
  const repos: GitHubRepo[]    = reposRes.ok  ? await reposRes.json()  : [];
  const events: Array<{
    type: string;
    created_at: string;
    repo: { name: string };
    payload: { commits?: unknown[] };
  }> = eventsRes.ok ? await eventsRes.json() : [];

  const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0);

  const languageMap: Record<string, number> = {};
  repos.forEach(r => {
    if (r.language) languageMap[r.language] = (languageMap[r.language] ?? 0) + 1;
  });

  const recentActivity: ActivityItem[] = events
    .filter(e => ['PushEvent', 'CreateEvent', 'PullRequestEvent'].includes(e.type))
    .slice(0, 10)
    .map(e => ({
      type: e.type,
      repo: e.repo.name.split('/')[1] ?? e.repo.name,
      commits: e.type === 'PushEvent' && Array.isArray(e.payload.commits)
        ? e.payload.commits.length : undefined,
      createdAt: e.created_at,
    }));

  let totalCommits = 0;
  try { totalCommits = await fetchGitHubCommitCount(username, token); } catch { /* keep 0 */ }

  return { profile, repos, totalStars, languageMap, totalCommits, recentActivity };
}

// ── Coin data storage ─────────────────────────────────────────────────────────

export function saveGitHubData(data: GitHubCommitData): void {
  localStorage.setItem(COIN_KEY, JSON.stringify(data));
}

export function loadGitHubData(): GitHubCommitData | null {
  const raw = localStorage.getItem(COIN_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
