declare global {
  interface Window {
    /** index.html에서 주입: API·/사진 이 있는 절대 URL (끝 슬래시 없음) */
    __API_ORIGIN__?: string;
  }
}

/** Vite BASE_URL을 반영한 상대 `/api/health` 경로 (부트스트랩용) */
export function relativeApiHealthPath(): string {
  const raw = import.meta.env.BASE_URL || '/';
  const base = raw.endsWith('/') ? raw : `${raw}/`;
  return `${base}api/health`.replace(/\/{2,}/g, '/');
}

/** 서버 `/api/health`의 `publicApiOrigin`으로 설정 (런타임) */
let runtimeApiOrigin = '';

export function setRuntimeApiOrigin(origin: string | undefined | null): void {
  if (origin == null || String(origin).trim() === '') {
    runtimeApiOrigin = '';
    return;
  }
  runtimeApiOrigin = String(origin).trim().replace(/\/$/, '');
}

/**
 * 우선순위: 런타임(health) → window.__API_ORIGIN__ → Vite 빌드 변수
 * 비우면 브라우저가 HTML과 같은 호스트로 `/api`, `/사진` 요청.
 */
export function getApiBaseUrl(): string {
  if (runtimeApiOrigin) return runtimeApiOrigin;
  if (typeof window !== 'undefined' && window.__API_ORIGIN__) {
    const w = String(window.__API_ORIGIN__).trim();
    if (w) return w.replace(/\/$/, '');
  }
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
