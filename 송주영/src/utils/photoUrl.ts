/**
 * `/사진/...` 경로를 img src에 안전하게 쓰기 위해
 * 파일명에 한글 등이 들어가 있고 URL 인코딩이 안 된 경우에만 인코딩합니다.
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
  return prefix + encoded.join('/');
}
