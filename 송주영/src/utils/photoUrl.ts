import { getApiBaseUrl } from '../config/apiBase';

/**
 * 예전에 `/사진/...` 가 SPA(index.html)로 떨어졌을 때 브라우저가 그걸 같은 URL로 캐시하면,
 * 이후 304 Not Modified로 HTML을 이미지처럼 쓰게 됩니다. URL을 바꿔 캐시를 끊습니다.
 * 필요 시 `.env`에 `VITE_PHOTO_CACHE_BUST=3` 처럼 올리면 됩니다.
 */
const PHOTO_CACHE_BUST = String(import.meta.env.VITE_PHOTO_CACHE_BUST ?? '2').trim() || '2';

/**
 * `/사진/...` 경로를 img src에 안전하게 쓰기 위해
 * 파일명에 한글 등이 들어가 있고 URL 인코딩이 안 된 경우에만 인코딩합니다.
 * `VITE_API_BASE_URL`이 있으면 API 서버 호스트를 붙입니다 (정적 호스팅과 API 분리 배포).
 */
export function photoUrlForDisplay(src: string): string {
  if (!src) return src;
  if (src.startsWith('data:') || /^https?:\/\//i.test(src)) return src;
  const prefix = '/사진/';
  if (!src.startsWith(prefix)) return src;
  const rest = src.slice(prefix.length);
  const segments = rest.split('/').filter(Boolean);
  const encoded = segments.map(seg => {
    try {
      decodeURIComponent(seg);
      if (/[^\u0000-\u007f]/.test(seg)) return encodeURIComponent(seg);
      return seg;
    } catch {
      return encodeURIComponent(seg);
    }
  });
  let path = prefix + encoded.join('/');
  const q = path.includes('?') ? '&' : '?';
  path = `${path}${q}v=${PHOTO_CACHE_BUST}`;
  const base = getApiBaseUrl();
  return base ? `${base}${path}` : path;
}
