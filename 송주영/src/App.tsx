import { useState, useEffect, useRef } from 'react';
import type { GachaItem, GachaResult, CollectedItem } from './types';
import type { GachaEvent, Announcement } from './types/admin';
import type { GitHubProfile } from './utils/githubUtils';
import { CapsuleMachine } from './components/CapsuleMachine';
import { GachaCollection } from './components/GachaCollection';
import { AdminPanel } from './components/AdminPanel';
import { GitHubModal } from './components/GitHubModal';
import { Farm } from './components/Farm';
import { Auction } from './components/Auction';
import { ActivityFeed, AnnouncementsPanel } from './components/GachaSidePanel';
import { addItemToCollection, setFarmProductionRanges } from './utils/gachaUtils';
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
  postActivity,
  fetchFarmConfigPublic,
} from './api/gameApi';
import type { MeApiPayload } from './api/gameApi';
import './App.css';

// ─── localStorage: 페이지 로드마다 게임 데이터 삭제 ──────────────────────────

const LS_KEEP = new Set([
  'github_token',
  'github_profile',
  'lastCheckinDate',
  'adminGithubUsername',
  'githubData',
]);

function clearStaleLocalStorage() {
  for (const k of Object.keys(localStorage)) {
    if (!LS_KEEP.has(k)) localStorage.removeItem(k);
  }
}

// ─── 컬렉션 직렬화 ────────────────────────────────────────────────────────────

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

type View = 'machine' | 'collection' | 'farm' | 'auction' | 'admin';

function App() {
  const [gachaItems,      setGachaItems]      = useState<GachaItem[]>([]);
  const [collectedItems,  setCollectedItems]  = useState<Map<string, CollectedItem>>(new Map());
  const [totalPulls,      setTotalPulls]      = useState(0);
  const [coins,           setCoins]           = useState(0);
  const [gachaPullCost,   setGachaPullCost]   = useState(10);
  const [startingCoins,   setStartingCoins]   = useState(30);
  const [gachaItemsVersion, setGachaItemsVersion] = useState('v1');
  const [events,          setEvents]          = useState<GachaEvent[]>([]);
  const [announcements,   setAnnouncements]   = useState<Announcement[]>([]);
  const [backendConnected, setBackendConnected] = useState(false);
  const [checkinToast,    setCheckinToast]    = useState<number | null>(null);
  const [currentView,     setCurrentView]     = useState<View>('machine');
  const [githubOpen,      setGithubOpen]      = useState(false);

  const [githubToken,   setGithubToken]   = useState<string | null>(() => loadToken());
  const [githubUser,    setGithubUser]    = useState<GitHubProfile | null>(loadProfile);
  const [githubLoading, setGithubLoading] = useState(
    () => new URLSearchParams(window.location.search).has('code')
  );

  const ignoreNextUserPersist   = useRef(false);
  const ignoreNextGlobalPersist = useRef(false);

  useEffect(() => { clearStaleLocalStorage(); }, []);

  // OAuth 콜백 처리 / 저장된 토큰 검증
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const state  = params.get('state');

    if (code && state) {
      window.history.replaceState({}, '', window.location.pathname);
      const savedState = getStoredState();
      clearOAuthState();

      if (state !== savedState) {
        Promise.resolve().then(() => setGithubLoading(false));
        return;
      }

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
                setStartingCoins(g.startingCoins);
                ignoreNextUserPersist.current = true;
                const me = await fetchApiMe(token);
                if (me) {
                  setCoins(me.coins);
                  setTotalPulls(me.totalPulls);
                  setCollectedItems(collectionRowsToMap(me.collectedItems));
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

    const token = loadToken();
    if (token && !loadProfile()) {
      fetchProfileByToken(token)
        .then(profile => { saveProfile(profile); setGithubUser(profile); })
        .catch(() => { clearToken(); setGithubToken(null); });
    }
  }, []); // mount only

  // 부트스트랩
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
        setStartingCoins(g.startingCoins);

        // 농장 생산량 범위를 서버 설정으로 동기화
        try {
          const cfg = await fetchFarmConfigPublic();
          setFarmProductionRanges(cfg);
        } catch {}

        const token = loadToken();
        if (!token) return;
        const me = await fetchApiMe(token);
        if (cancelled || !me) return;
        ignoreNextUserPersist.current = true;
        setCoins(me.coins);
        setTotalPulls(me.totalPulls);
        setCollectedItems(collectionRowsToMap(me.collectedItems));
        if (me.githubData) saveGitHubData(me.githubData);
      } catch (e) {
        console.warn('[backend] 부트스트랩 실패 — 서버 연결을 확인하세요.', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeEvent = events.find(e =>
    e.isActive && new Date(e.expiresAt) > new Date()
  ) ?? null;

  // 사용자 데이터 백엔드 동기화
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

  // 전역 설정 동기화 (어드민 전용)
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
        startingCoins,
        events,
        announcements,
      }).catch(err => console.warn('[backend] 전역 설정 저장 실패', err));
    }, 650);
    return () => clearTimeout(t);
  }, [
    backendConnected, githubToken, githubUser,
    gachaItems, gachaItemsVersion, gachaPullCost, startingCoins, events, announcements,
  ]);

  // 일일 출석
  useEffect(() => {
    if (!githubToken || !backendConnected) return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('lastCheckinDate') === today) return;
    postCheckin(githubToken)
      .then(({ alreadyDone, coinsAdded }) => {
        localStorage.setItem('lastCheckinDate', today);
        if (!alreadyDone && coinsAdded > 0) {
          setCoins(prev => prev + coinsAdded);
          setCheckinToast(coinsAdded);
          setTimeout(() => setCheckinToast(null), 4000);
        }
      })
      .catch(err => console.warn('[checkin] 실패', err));
  }, [githubToken, backendConnected]);

  // ── 핸들러 ────────────────────────────────────────────────────────────────

  const handleGachaPull = (result: GachaResult) => {
    setCollectedItems(prev => addItemToCollection(result.item, prev));
    setTotalPulls(prev => prev + 1);
    // 활동 피드에 전송
    if (githubToken) {
      void postActivity(githubToken, result.item.name, result.item.rarity);
    }
  };

  const handleGachaPullMulti = (results: GachaResult[]) => {
    setCollectedItems(prev => {
      let map = prev;
      for (const r of results) map = addItemToCollection(r.item, map);
      return map;
    });
    setTotalPulls(prev => prev + results.length);
    // 마지막 뽑기 결과만 피드에 전송
    const last = results[results.length - 1];
    if (githubToken && last) {
      void postActivity(githubToken, last.item.name, last.item.rarity);
    }
  };

  const handleCoinSpend  = (amount: number) => setCoins(prev => Math.max(0, prev - amount));
  const handleCoinsAdded = (amount: number) => setCoins(prev => prev + amount);
  const handleLogout     = () => { setGithubToken(null); setGithubUser(null); };

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      {/* Navigation */}
      <nav className="navbar">
        <div className="nav-brand">
          <svg className="nav-brand-icon" viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span className="nav-brand-text">git주영</span>
        </div>

        <div className="nav-buttons">
          <button className={`nav-button ${currentView === 'machine' ? 'active' : ''}`} onClick={() => setCurrentView('machine')}>
            🎰 뽑기
          </button>
          <button className={`nav-button ${currentView === 'collection' ? 'active' : ''}`} onClick={() => setCurrentView('collection')}>
            📖 도감 ({collectedItems.size})
          </button>
          <button className={`nav-button ${currentView === 'farm' ? 'active' : ''}`} onClick={() => setCurrentView('farm')}>
            🌾 농장
          </button>
          <button className={`nav-button ${currentView === 'auction' ? 'active' : ''}`} onClick={() => setCurrentView('auction')}>
            🏪 경매
          </button>
        </div>

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

          <div className="nav-stats">총 뽑기: <strong>{totalPulls}</strong></div>

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
          <div className="machine-layout">
            <ActivityFeed githubToken={githubToken} />
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
            <AnnouncementsPanel announcements={announcements} />
          </div>
        )}
        {currentView === 'collection' && (
          <GachaCollection
            collectedItems={collectedItems}
            gachaItems={gachaItems}
          />
        )}
        {currentView === 'farm' && (
          <Farm
            githubToken={githubToken ?? undefined}
            backendConnected={backendConnected}
            collectedItems={collectedItems}
            gachaItems={gachaItems}
            coins={coins}
            onCoinsChange={setCoins}
            onCollectedItemsChange={setCollectedItems}
          />
        )}
        {currentView === 'auction' && (
          <Auction
            githubToken={githubToken ?? undefined}
            githubLogin={githubUser?.login}
            backendConnected={backendConnected}
            collectedItems={collectedItems}
            coins={coins}
            onCoinsChange={setCoins}
            onCollectedItemsChange={setCollectedItems}
          />
        )}
        {currentView === 'admin' && isAdminGitHubLogin(githubUser?.login) && (
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
            startingCoins={startingCoins}
            onStartingCoinsChange={setStartingCoins}
            githubToken={githubToken ?? undefined}
          />
        )}
      </main>

      {/* 출석 토스트 */}
      {checkinToast !== null && (
        <div className="checkin-toast">
          <span className="checkin-toast-icon">📅</span>
          <div>
            <div className="checkin-toast-title">출석 체크!</div>
            <div className="checkin-toast-sub">+{checkinToast} 코인 지급되었습니다</div>
          </div>
        </div>
      )}

      {/* GitHub 모달 */}
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
