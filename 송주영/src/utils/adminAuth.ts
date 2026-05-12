/** 클라이언트 관리자 버튼 표시용 (서버는 별도 ADMIN_GITHUB_LOGINS 로 검증) */
export function isAdminGitHubLogin(login: string | undefined | null): boolean {
  if (!login) return false;
  const raw =
    import.meta.env.VITE_ADMIN_GITHUB_LOGINS ??
    import.meta.env.VITE_ADMIN_GITHUB_LOGIN ??
    'rjsgud49';
  const set = new Set(
    String(raw).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  );
  return set.has(login.toLowerCase());
}
