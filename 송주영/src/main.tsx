import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { setRuntimeApiOrigin, relativeApiHealthPath } from './config/apiBase';

async function bootstrap() {
  try {
    const r = await fetch(relativeApiHealthPath(), { method: 'GET' });
    if (r.ok) {
      const j = (await r.json()) as { ok?: boolean; publicApiOrigin?: string };
      if (typeof j.publicApiOrigin === 'string' && j.publicApiOrigin.trim()) {
        setRuntimeApiOrigin(j.publicApiOrigin);
      }
    }
  } catch {
    /* 오프라인 등 — 그대로 앱 기동 */
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
