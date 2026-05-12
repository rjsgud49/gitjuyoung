const ADMIN_LOGINS = new Set<string>(['rjsgud49']);

/** 클라이언트 어드민 UI 표시용. 실제 권한 판단은 서버에서만 함. */
export function isAdminGitHubLogin(login: string | undefined | null): boolean {
  if (!login) return false;
  return ADMIN_LOGINS.has(login.trim().toLowerCase());
}
