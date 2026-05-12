/** GitHub access_token 으로 사용자 검증 */

export interface VerifiedUser {
  login: string;
  id: number;
}

export async function verifyGithubToken(token: string | null | undefined): Promise<VerifiedUser | null> {
  if (!token?.trim()) return null;
  const r = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!r.ok) return null;
  const u = (await r.json()) as { login?: string; id?: number };
  if (!u.login || typeof u.id !== 'number') return null;
  return { login: u.login, id: u.id };
}

export function isAdminLogin(login: string): boolean {
  const raw = process.env.ADMIN_GITHUB_LOGINS ?? process.env.ADMIN_GITHUB_LOGIN ?? 'rjsgud49';
  const set = new Set(
    raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  );
  return set.has(login.toLowerCase());
}
