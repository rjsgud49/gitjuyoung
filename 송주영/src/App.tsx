import { useState, useEffect, useRef } from 'react';
import type { GachaItem, GachaResult, CollectedItem } from './types';
import type { GachaEvent, Announcement } from './types/admin';
import type { GitHubProfile } from './utils/githubUtils';
import { CapsuleMachine } from './components/CapsuleMachine';
import { GachaCollection } from './components/GachaCollection';
import { AdminPanel } from './components/AdminPanel';
import { GitHubModal } from './components/GitHubModal';
import { addItemToCollection } from './utils/gachaUtils';
import {
  loadToken,
  loadProfile,
  clearToken,
  saveToken,
  saveProfile,
  fetchProfileByToken,
  exchangeCodeForToken,
  getStoredState,
  clearOAuthState,
  loadGitHubData,
  saveGitHubData,
} from './utils/githubUtils';
import { isAdminGitHubLogin } from './utils/adminAuth';
import {
  checkApiHealth,
  fetchApiGlobal,
  fetchApiMe,
  putApiMe,
  putApiAdminGlobal,
  postCheckin,
} from './api/gameApi';
import type { MeApiPayload } from './api/gameApi';
import { DEFAULT_ITEMS, ITEMS_VERSION } from './data/defaultItems';
import './App.css';

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadItems(): GachaItem[] {
  try {
    const version = localStorage.getItem('gachaItemsVersion');
    if (version === ITEMS_VERSION) {
      const raw = localStorage.getItem('gachaItems');
      if (raw) return JSON.parse(raw) as GachaItem[];
    }
  } catch { /* fall through */ }
  // First load or new version — stamp version, return defaults
  localStorage.setItem('gachaItemsVersion', ITEMS_VERSION);
  return DEFAULT_ITEMS;
}

function loadCollection(): Map<string, CollectedItem> {
  try {
    const raw = localStorage.getItem('collectedItems');
    if (raw) {
      const parsed = JSON.parse(raw) as CollectedItem[];
      const map = new Map<string, CollectedItem>();
      parsed.forEach(item => {
        map.set(item.id, { ...item, firstAcquiredAt: new Date(item.firstAcquiredAt) });
      });
      return map;
    }
  } catch { /* fall through */ }
  return new Map();
}

function loadNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return parseInt(raw, 10) || fallback;
  } catch { /* fall through */ }
  return fallback;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* fall through */ }
  return fallback;
}

function loadStartingCoinsFromLS(): number {
  try {
    const raw = localStorage.getItem('startingCoins');
    if (raw) return JSON.parse(raw) as number;
  } catch { /* fall through */ }
  return 30;
}

function collectionRowsToMap(rows: MeApiPayload['collectedItems']): Map<string, CollectedItem> {
  const map = new Map<string, CollectedItem>();
  for (const item of rows) {
    map.set(item.id, { ...item, firstAcquiredAt: new Date(item.firstAcquiredAt) });
  }
  return map;
}

function mapToCollectedRows(map: Map<string, CollectedItem>): MeApiPayload['collectedItems'] {
  return Array.from(map.values()).map(i => ({
    ...i,
    firstAcquiredAt: i.firstAcquiredAt instanceof Date
      ? i.firstAcquiredAt.toISOString()
      : String(i.firstAcquiredAt),
  }));
}

// ─── App ──────────────────────────────────────────────────────────────────────

type View = 'machine' | 'collection' | 'admin';

function App() {
  const [gachaItems,     setGachaItems]     = useState<GachaItem[]>(loadItems);
  const [collectedItems, setCollectedItems] = useState<Map<string, CollectedItem>>(loadCollection);
  const [totalPulls,     setTotalPulls]     = useState(() => loadNumber('totalPulls', 0));
  const [coins,          setCoins]          = useState(() => loadNumber('coins', 30));
  const [gachaPullCost,  setGachaPullCost]  = useState(() => loadNumber('gachaPullCost', 10));
  const [currentView,    setCurrentView]    = useState<View>('machine');
  const [githubOpen,     setGithubOpen]     = useState(false);
  const [events,         setEvents]         = useState<GachaEvent[]>(() => loadJSON('adminEvents', []));
  const [announcements,  setAnnouncements]  = useState<Announcement[]>(() => loadJSON('adminAnnouncements', []));
  const [backendConnected, setBackendConnected] = useState(false);
  const [gachaItemsVersion, setGachaItemsVersion] = useState(ITEMS_VERSION);
  const [startingCoinsBump, setStartingCoinsBump] = useState(0);
  const [checkinToast, setCheckinToast] = useState<number | null>(null);

  // ── GitHub auth state ──────────────────────────────────────────────────────
  const [githubToken,   setGithubToken]   = useState<string | null>(() => loadToken());
  const [githubUser,    setGithubUser]    = useState<GitHubProfile | null>(loadProfile);
  // Start loading immediately if there's an OAuth code in the URL
  const [githubLoading, setGithubLoading] = useState(
    () => new URLSearchParams(window.location.search).has('code')
  );

  const ignoreNextUserPersist = useRef(false);
  const ignoreNextGlobalPersist = useRef(false);

  // Handle OAuth callback or validate saved token on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const state  = params.get('state');

    if (code && state) {
      window.history.replaceState({}, '', window.location.pathname);
      const savedState = getStoredState();
      clearOAuthState();

      if (state !== savedState) { Promise.resolve().then(() => setGithubLoading(false)); return; }

      exchangeCodeForToken(code)
        .then(token =>
          fetchProfileByToken(token).then(async profile => {
            saveToken(token);
            saveProfile(profile);
            setGithubToken(token);
            setGithubUser(profile);
            setGithubOpen(true);
            try {
              if (await checkApiHealth()) {
                setBackendConnected(true);
                ignoreNextGlobalPersist.current = true;
                const g = await fetchApiGlobal();
                setGachaItems(g.gachaItems);
                setGachaItemsVersion(g.gachaItemsVersion);
                setEvents(g.events);
                setAnnouncements(g.announcements);
                setGachaPullCost(g.gachaPullCost);
                localStorage.setItem('gachaItemsVersion', g.gachaItemsVersion);
                localStorage.setItem('gachaItems', JSON.stringify(g.gachaItems));
                localStorage.setItem('adminEvents', JSON.stringify(g.events));
                localStorage.setItem('adminAnnouncements', JSON.stringify(g.announcements));
                localStorage.setItem('gachaPullCost', String(g.gachaPullCost));
                ignoreNextUserPersist.current = true;
                const me = await fetchApiMe(token);
                if (me) {
                  setCoins(me.coins);
                  setTotalPulls(me.totalPulls);
                  setCollectedItems(collectionRowsToMap(me.collectedItems));
                  localStorage.setItem('coins', String(me.coins));
                  localStorage.setItem('totalPulls', String(me.totalPulls));
                  localStorage.setItem('collectedItems', JSON.stringify(me.collectedItems));
                  if (me.githubData) saveGitHubData(me.githubData);
                }
              }
            } catch (e) {
              console.warn('[backend] OAuth 후 동기화 실패', e);
            }
          })
        )
        .catch(err => console.error('GitHub OAuth error:', err))
        .finally(() => setGithubLoading(false));
      return;
    }

    // No OAuth callback — validate any saved token
    const token = loadToken();
    if (token && !loadProfile()) {
      fetchProfileByToken(token)
        .then(profile => { saveProfile(profile); setGithubUser(profile); })
        .catch(() => { clearToken(); setGithubToken(null); });
    }
  }, []); // mount only

  // 백엔드(API 서버)에서 전역 설정 + 로그인 사용자 진행도 불러오기
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await checkApiHealth();
      if (cancelled || !ok) return;
      try {
        const g = await fetchApiGlobal();
        if (cancelled) return;
        ignoreNextGlobalPersist.current = true;
        setBackendConnected(true);
        setGachaItems(g.gachaItems);
        setGachaItemsVersion(g.gachaItemsVersion);
        setEvents(g.events);
        setAnnouncements(g.announcements);
        setGachaPullCost(g.gachaPullCost);
        localStorage.setItem('gachaItemsVersion', g.gachaItemsVersion);
        localStorage.setItem('gachaItems', JSON.stringify(g.gachaItems));
        localStorage.setItem('adminEvents', JSON.stringify(g.events));
        localStorage.setItem('adminAnnouncements', JSON.stringify(g.announcements));
        localStorage.setItem('gachaPullCost', String(g.gachaPullCost));

        const token = loadToken();
        if (!token) return;
        const me = await fetchApiMe(token);
        if (cancelled || !me) return;
        ignoreNextUserPersist.current = true;
        setCoins(me.coins);
        setTotalPulls(me.totalPulls);
        setCollectedItems(collectionRowsToMap(me.collectedItems));
        localStorage.setItem('coins', String(me.coins));
        localStorage.setItem('totalPulls', String(me.totalPulls));
        localStorage.setItem('collectedItems', JSON.stringify(me.collectedItems));
        if (me.githubData) saveGitHubData(me.githubData);
      } catch (e) {
        console.warn('[backend] 부트스트랩 실패 — 로컬 저장소만 사용합니다.', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Active event: first active, non-expired event
  const activeEvent = events.find(e =>
    e.isActive && new Date(e.expiresAt) > new Date()
  ) ?? null;

  // ── Persist ────────────────────────────────────────────────────────────────

  useEffect(() => { localStorage.setItem('gachaItems', JSON.stringify(gachaItems)); }, [gachaItems]);
  useEffect(() => {
    const arr = Array.from(collectedItems.values());
    localStorage.setItem('collectedItems', JSON.stringify(arr));
  }, [collectedItems]);
  useEffect(() => { localStorage.setItem('totalPulls', totalPulls.toString()); }, [totalPulls]);
  useEffect(() => { localStorage.setItem('coins', coins.toString()); }, [coins]);
  useEffect(() => {
    localStorage.setItem('gachaPullCost', gachaPullCost.toString());
  }, [gachaPullCost]);
  useEffect(() => { localStorage.setItem('adminEvents', JSON.stringify(events)); }, [events]);
  useEffect(() => { localStorage.setItem('adminAnnouncements', JSON.stringify(announcements)); }, [announcements]);
  useEffect(() => {
    localStorage.setItem('gachaItemsVersion', gachaItemsVersion);
  }, [gachaItemsVersion]);

  useEffect(() => {
    if (!backendConnected || !githubToken) return;
    if (ignoreNextUserPersist.current) {
      ignoreNextUserPersist.current = false;
      return;
    }
    const t = setTimeout(() => {
      void putApiMe(githubToken, {
        coins,
        totalPulls,
        collectedItems: mapToCollectedRows(collectedItems),
        githubData: loadGitHubData(),
      }).catch(err => console.warn('[backend] 사용자 저장 실패', err));
    }, 550);
    return () => clearTimeout(t);
  }, [backendConnected, githubToken, coins, totalPulls, collectedItems]);

  useEffect(() => {
    if (!backendConnected || !githubToken || !isAdminGitHubLogin(githubUser?.login)) return;
    if (ignoreNextGlobalPersist.current) {
      ignoreNextGlobalPersist.current = false;
      return;
    }
    const t = setTimeout(() => {
      void putApiAdminGlobal(githubToken, {
        gachaItems,
        gachaItemsVersion,
        gachaPullCost,
        startingCoins: loadStartingCoinsFromLS(),
        events,
        announcements,
      }).catch(err => console.warn('[backend] 전역 설정 저장 실패', err));
    }, 650);
    return () => clearTimeout(t);
  }, [
    backendConnected, githubToken, githubUser,
    gachaItems, gachaItemsVersion, gachaPullCost, events, announcements, startingCoinsBump,
  ]);

  // Daily attendance check-in
  useEffect(() => {
    if (!githubToken || !backendConnected) return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('lastCheckinDate') === today) return;
    postCheckin(githubToken)
      .then(({ alreadyDone, coinsAdded }) => {
        if (!alreadyDone && coinsAdded > 0) {
          setCoins(prev => prev + coinsAdded);
          localStorage.setItem('lastCheckinDate', today);
          setCheckinToast(coinsAdded);
          setTimeout(() => setCheckinToast(null), 4000);
        } else if (alreadyDone) {
          localStorage.setItem('lastCheckinDate', today);
        }
      })
      .catch(err => console.warn('[checkin] 실패', err));
  }, [githubToken, backendConnected]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleGachaPull = (result: GachaResult) => {
    setCollectedItems(prev => addItemToCollection(result.item, prev));
    setTotalPulls(prev => prev + 1);
  };

  const handleGachaPullMulti = (results: GachaResult[]) => {
    setCollectedItems(prev => {
      let map = prev;
      for (const r of results) map = addItemToCollection(r.item, map);
      return map;
    });
    setTotalPulls(prev => prev + results.length);
  };

  const handleCoinSpend = (amount: number) => {
    setCoins(prev => Math.max(0, prev - amount));
  };

  const handleCoinsAdded = (amount: number) => {
    setCoins(prev => prev + amount);
  };

  const handleLogout = () => {
    setGithubToken(null);
    setGithubUser(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      {/* Navigation */}
      <nav className="navbar">
        {/* Brand */}
        <div className="nav-brand">
          <svg className="nav-brand-icon" viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span className="nav-brand-text">git주영</span>
        </div>

        {/* User nav – 뽑기 & 도감 only */}
        <div className="nav-buttons">
          <button
            className={`nav-button ${currentView === 'machine' ? 'active' : ''}`}
            onClick={() => setCurrentView('machine')}
          >
            🎰 뽑기
          </button>
          <button
            className={`nav-button ${currentView === 'collection' ? 'active' : ''}`}
            onClick={() => setCurrentView('collection')}
          >
            📖 도감 ({collectedItems.size})
          </button>
        </div>

        {/* Right side: coin + admin */}
        <div className="nav-right">
          <button className="coin-btn" onClick={() => setGithubOpen(true)} title="GitHub 커밋으로 코인 받기">
            <span className="coin-btn-icon">🪙</span>
            <span className="coin-btn-value">{coins.toLocaleString()}</span>
            {githubUser ? (
              <span className="coin-btn-github">
                <img src={githubUser.avatar_url} alt={githubUser.login} className="coin-btn-avatar" />
                <span className="coin-btn-username">{githubUser.login}</span>
              </span>
            ) : (
              <span className="coin-btn-github">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                충전
              </span>
            )}
          </button>

          <div className="nav-stats">
            총 뽑기: <strong>{totalPulls}</strong>
          </div>

          {isAdminGitHubLogin(githubUser?.login) && (
            <button
              className={`nav-admin-btn ${currentView === 'admin' ? 'active' : ''}`}
              onClick={() => setCurrentView(currentView === 'admin' ? 'machine' : 'admin')}
              title="관리자 패널"
            >
              ⚙️
            </button>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="main-content">
        {currentView === 'machine' && (
          <CapsuleMachine
            items={gachaItems}
            onGachaPull={handleGachaPull}
            onGachaPullMulti={handleGachaPullMulti}
            collectedItems={collectedItems}
            coins={coins}
            onCoinSpend={handleCoinSpend}
            activeEvent={activeEvent}
            basePullCost={gachaPullCost}
          />
        )}
        {currentView === 'collection' && (
          <GachaCollection
            collectedItems={collectedItems}
            totalItems={gachaItems.length}
          />
        )}
        {currentView === 'admin' && (
          <AdminPanel
            gachaItems={gachaItems}
            onUpdateItems={setGachaItems}
            coins={coins}
            onGrantCoins={handleCoinsAdded}
            totalPulls={totalPulls}
            events={events}
            onEventsChange={setEvents}
            announcements={announcements}
            onAnnouncementsChange={setAnnouncements}
            gachaPullCost={gachaPullCost}
            onGachaPullCostChange={setGachaPullCost}
            onStartingCoinsPersisted={() => setStartingCoinsBump(n => n + 1)}
            githubToken={githubToken ?? undefined}
          />
        )}
      </main>

      {/* Daily check-in toast */}
      {checkinToast !== null && (
        <div className="checkin-toast">
          <span className="checkin-toast-icon">📅</span>
          <div>
            <div className="checkin-toast-title">출석 체크!</div>
            <div className="checkin-toast-sub">+{checkinToast} 코인 지급되었습니다</div>
          </div>
        </div>
      )}

      {/* GitHub coin modal */}
      <GitHubModal
        isOpen={githubOpen}
        onClose={() => setGithubOpen(false)}
        onCoinsAdded={handleCoinsAdded}
        currentCoins={coins}
        githubToken={githubToken}
        githubUser={githubUser}
        onLogout={handleLogout}
        isLoading={githubLoading}
      />
    </div>
  );
}

export default App;
