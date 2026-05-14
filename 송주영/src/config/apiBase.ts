/**
 * 프론트(정적)와 API가 다른 도메인/포트일 때 빌드 시 설정합니다.
 * 예: VITE_API_BASE_URL=https://game-api.example.com
 * 비우면 같은 출처에서 `/api`, `/사진` 요청 (nginx 등으로 한 호스트에 묶인 경우).
 */
export function getApiBaseUrl(): string {
  const v = import.meta.env.VITE_API_BASE_URL;
  if (v == null || String(v).trim() === '') return '';
  return String(v).trim().replace(/\/$/, '');
}

/** `/api/...` 같은 경로를 API 서버 절대 URL로 바꿉니다. */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
