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

const ADMIN_LOGINS = new Set<string>(['rjsgud49']);

export function isAdminLogin(login: string): boolean {
  return ADMIN_LOGINS.has(login.trim().toLowerCase());
}
