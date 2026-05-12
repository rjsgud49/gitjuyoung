import { useState, useEffect, useCallback } from 'react';
import type { GachaItem } from '../types';
import type { GachaEvent, Announcement } from '../types/admin';
import { getRarityColor, getRarityLabel } from '../utils/gachaUtils';
import { fetchGitHubFullStats } from '../utils/githubUtils';
import type { GitHubStats } from '../utils/githubUtils';
import styles from '../styles/AdminPanel.module.css';

// ─── Lang colors ──────────────────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', 'C++': '#f34b7d',
  C: '#555555', CSS: '#563d7c', HTML: '#e34c26', Vue: '#41b883',
  Svelte: '#ff3e00', Kotlin: '#A97BFF', Swift: '#F05138',
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

const EVENTS_KEY         = 'adminEvents';
const ANNOUNCEMENTS_KEY  = 'adminAnnouncements';
const GITHUB_ADMIN_KEY   = 'adminGithubUsername';

function loadJSON<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
  catch { return fallback; }
}

function saveJSON(key: string, val: unknown) {
  localStorage.setItem(key, JSON.stringify(val));
}

function activityIcon(type: string) {
  return { PushEvent: '📦', CreateEvent: '✨', PullRequestEvent: '🔀' }[type] ?? '📌';
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)  return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'items' | 'coins' | 'comms';

interface Props {
  gachaItems:    GachaItem[];
  onUpdateItems: (items: GachaItem[]) => void;
  coins:         number;
  onGrantCoins:  (amount: number) => void;
  totalPulls:    number;
  events:        GachaEvent[];
  onEventsChange:(events: GachaEvent[]) => void;
  announcements: Announcement[];
  onAnnouncementsChange: (a: Announcement[]) => void;
  gachaPullCost: number;
  onGachaPullCostChange: (n: number) => void;
  /** 시작 코인만 저장했을 때 백엔드 전역 동기화를 트리거 */
  onStartingCoinsPersisted?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AdminPanel = ({
  gachaItems, onUpdateItems, coins, onGrantCoins, totalPulls,
  events, onEventsChange, announcements, onAnnouncementsChange,
  gachaPullCost, onGachaPullCostChange, onStartingCoinsPersisted,
}: Props) => {
  const [tab,         setTab]         = useState<Tab>('dashboard');
  const [ghUser,      setGhUser]      = useState(() => localStorage.getItem(GITHUB_ADMIN_KEY) ?? '');
  const [ghStats,     setGhStats]     = useState<GitHubStats | null>(null);
  const [ghLoading,   setGhLoading]   = useState(false);
  const [ghError,     setGhError]     = useState<string | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);
  const [grantAmt,    setGrantAmt]    = useState('');
  const [startCoins,  setStartCoins]  = useState(() => loadJSON<number>('startingCoins', 30));
  const [pullCostDraft, setPullCostDraft] = useState(() => String(gachaPullCost));

  useEffect(() => {
    setPullCostDraft(String(gachaPullCost));
  }, [gachaPullCost]);

  // Announcement form
  const [aTitle,   setATitle]   = useState('');
  const [aContent, setAContent] = useState('');
  const [aType,    setAType]    = useState<Announcement['type']>('info');
  const [aPinned,  setAPinned]  = useState(false);

  // Event form
  const [eName,    setEName]    = useState('');
  const [eDesc,    setEDesc]    = useState('');
  const [eType,    setEType]    = useState<GachaEvent['type']>('pull_discount');
  const [eValue,   setEValue]   = useState('2');
  const [eExpiry,  setEExpiry]  = useState('');

  // ── Toast ──────────────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }, []);

  // ── GitHub fetch ──────────────────────────────────────────────────────────

  const handleFetchGH = useCallback(async () => {
    if (!ghUser.trim() || ghLoading) return;
    setGhLoading(true); setGhError(null);
    localStorage.setItem(GITHUB_ADMIN_KEY, ghUser.trim());
    try {
      const stats = await fetchGitHubFullStats(ghUser.trim());
      setGhStats(stats);
    } catch (e) {
      setGhError(e instanceof Error ? e.message : 'GitHub 정보를 불러오지 못했습니다.');
    } finally {
      setGhLoading(false);
    }
  }, [ghUser, ghLoading]);

  // Auto-fetch if saved username
  useEffect(() => {
    if (ghUser.trim() && !ghStats && !ghLoading) {
      handleFetchGH();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Probability ──────────────────────────────────────────────────────────

  const handleProbChange = (id: string, val: number) => {
    onUpdateItems(gachaItems.map(item => item.id === id ? { ...item, probability: val } : item));
  };

  const handleNormalize = () => {
    const total = gachaItems.reduce((s, i) => s + i.probability, 0);
    if (total === 0) return;
    onUpdateItems(gachaItems.map(i => ({ ...i, probability: parseFloat((i.probability / total).toFixed(4)) })));
    showToast('✅ 확률이 정규화 되었습니다');
  };

  const handleDeleteItem = (id: string) => {
    if (!confirm('이 아이템을 가챠 풀에서 제거할까요?')) return;
    onUpdateItems(gachaItems.filter(i => i.id !== id));
    showToast('🗑️ 아이템이 제거되었습니다');
  };

  const probTotal = gachaItems.reduce((s, i) => s + i.probability, 0);
  const parsedPullCostDraft = parseInt(pullCostDraft, 10);
  const pullCostDraftOk = !isNaN(parsedPullCostDraft) && parsedPullCostDraft >= 1;

  // ── Coins ────────────────────────────────────────────────────────────────

  const handleGrant = () => {
    const n = parseInt(grantAmt, 10);
    if (isNaN(n) || n <= 0) return;
    onGrantCoins(n);
    setGrantAmt('');
    showToast(`💰 ${n.toLocaleString()} 코인이 지급되었습니다`);
  };

  const handleSaveStartCoins = () => {
    const n = parseInt(String(startCoins), 10);
    if (isNaN(n) || n < 0) return;
    saveJSON('startingCoins', n);
    onStartingCoinsPersisted?.();
    showToast('✅ 시작 코인이 저장되었습니다');
  };

  const handleSavePullCost = () => {
    const n = parseInt(pullCostDraft, 10);
    if (isNaN(n) || n < 1) return;
    onGachaPullCostChange(n);
    showToast('✅ 1회 뽑기 코인이 저장되었습니다');
  };

  // ── Announcements ──────────────────────────────────────────────────────

  const addAnnouncement = () => {
    if (!aTitle.trim() || !aContent.trim()) return;
    const newA: Announcement = {
      id: `a-${Date.now()}`, title: aTitle, content: aContent,
      type: aType, createdAt: new Date().toISOString(), isPinned: aPinned,
    };
    const updated = [newA, ...announcements];
    onAnnouncementsChange(updated);
    saveJSON(ANNOUNCEMENTS_KEY, updated);
    setATitle(''); setAContent(''); setAPinned(false);
    showToast('📢 공지가 등록되었습니다');
  };

  const deleteAnnouncement = (id: string) => {
    const updated = announcements.filter(a => a.id !== id);
    onAnnouncementsChange(updated);
    saveJSON(ANNOUNCEMENTS_KEY, updated);
  };

  // ── Events ───────────────────────────────────────────────────────────────

  const addEvent = () => {
    if (!eName.trim() || !eDesc.trim() || !eExpiry) return;
    const val = parseFloat(eValue);
    if (isNaN(val) || val <= 0) return;
    const newE: GachaEvent = {
      id: `e-${Date.now()}`, name: eName, description: eDesc,
      type: eType, value: val, expiresAt: new Date(eExpiry).toISOString(),
      isActive: false, createdAt: new Date().toISOString(),
    };
    const updated = [newE, ...events];
    onEventsChange(updated);
    saveJSON(EVENTS_KEY, updated);
    setEName(''); setEDesc(''); setEValue('2'); setEExpiry('');
    showToast('🎉 이벤트가 추가되었습니다');
  };

  const toggleEvent = (id: string) => {
    const updated = events.map(e => e.id === id ? { ...e, isActive: !e.isActive } : e);
    onEventsChange(updated);
    saveJSON(EVENTS_KEY, updated);
  };

  const deleteEvent = (id: string) => {
    const updated = events.filter(e => e.id !== id);
    onEventsChange(updated);
    saveJSON(EVENTS_KEY, updated);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const uniqueItems    = gachaItems.length;
  const collectedTotal = 0; // pass from parent if needed

  return (
    <div className={styles.adminContainer}>
      {/* Top bar */}
      <div className={styles.adminTopBar}>
        <div className={styles.adminTopTitle}>
          <span>⚙️</span>
          <span>관리자 패널</span>
        </div>
        <span className={styles.adminTopSub}>ADMIN · CONTROL PANEL</span>
      </div>

      {/* Tab nav */}
      <div className={styles.tabNav}>
        {([
          ['dashboard', '📊', '대시보드'],
          ['items',     '🎮', '아이템'],
          ['coins',     '💰', '코인'],
          ['comms',     '📢', '공지/이벤트'],
        ] as [Tab, string, string][]).map(([id, icon, label]) => (
          <button key={id}
            className={`${styles.tabBtn} ${tab === id ? styles.tabBtnActive : ''}`}
            onClick={() => setTab(id)}
          >
            <span className={styles.tabIcon}>{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={styles.tabContent}>

        {/* ── DASHBOARD ─────────────────────────────────────────────── */}
        {tab === 'dashboard' && (
          <>
            {/* Quick stats */}
            <div className={styles.statGrid}>
              {[
                { icon: '🎰', label: '총 뽑기 횟수', value: totalPulls.toLocaleString(), sub: '누적' },
                { icon: '💸', label: '1회 뽑기', value: `${gachaPullCost.toLocaleString()} 코인`, sub: '설정값' },
                { icon: '🎮', label: '가챠 아이템', value: uniqueItems.toLocaleString(), sub: '종류' },
                { icon: '🪙', label: '현재 코인', value: coins.toLocaleString(), sub: '잔액' },
                { icon: '📢', label: '활성 이벤트', value: events.filter(e => e.isActive).length.toString(), sub: '개' },
                { icon: '📌', label: '등록 공지', value: announcements.length.toString(), sub: '건' },
                { icon: '⭐', label: '전설 아이템', value: gachaItems.filter(i => i.rarity === 'legendary').length.toString(), sub: '종류' },
              ].map(s => (
                <div key={s.label} className={styles.statCard}>
                  <div className={styles.statCardIcon}>{s.icon}</div>
                  <div className={styles.statCardLabel}>{s.label}</div>
                  <div className={styles.statCardValue}>{s.value}</div>
                  <div className={styles.statCardSub}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* GitHub Stats */}
            <div className={styles.card}>
              <div className={styles.cardTitle}><span>🐙</span> GitHub 통계</div>

              <div className={styles.githubSearchRow}>
                <input
                  className={styles.githubInput}
                  type="text"
                  placeholder="GitHub 사용자 이름"
                  value={ghUser}
                  onChange={e => setGhUser(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFetchGH()}
                />
                <button className={styles.fetchBtn} onClick={handleFetchGH} disabled={!ghUser.trim() || ghLoading}>
                  {ghLoading ? '조회 중…' : '조회'}
                </button>
              </div>

              {ghLoading && (
                <div className={styles.loadingRow}><div className={styles.spinner} /><span>GitHub 데이터를 불러오는 중…</span></div>
              )}
              {ghError && <div className={styles.errorMsg}>⚠️ {ghError}</div>}

              {ghStats && !ghLoading && (
                <>
                  {/* Profile */}
                  <div className={styles.githubProfile}>
                    <img src={ghStats.profile.avatar_url} alt={ghStats.profile.login} className={styles.githubAvatar} />
                    <div className={styles.githubProfileInfo}>
                      <div className={styles.githubName}>{ghStats.profile.name || ghStats.profile.login}</div>
                      <div className={styles.githubLogin}>@{ghStats.profile.login}</div>
                      {ghStats.profile.bio && <div className={styles.githubBio}>{ghStats.profile.bio}</div>}
                    </div>
                    <div className={styles.githubMetaRow}>
                      <div className={styles.githubMeta}><strong>{ghStats.profile.public_repos}</strong> 저장소</div>
                      <div className={styles.githubMeta}><strong>{ghStats.profile.followers}</strong> 팔로워</div>
                      <div className={styles.githubMeta}><strong>{ghStats.totalStars}</strong> ⭐</div>
                    </div>
                  </div>

                  {/* Commit count */}
                  <div className={styles.commitSection}>
                    <div className={styles.commitLabel}>총 커밋 수 (추정)</div>
                    <div className={styles.commitValue}>{ghStats.totalCommits.toLocaleString()}</div>
                    <div className={styles.commitSub}>= {ghStats.totalCommits.toLocaleString()} 코인 획득 가능</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {/* Top repos */}
                    <div>
                      <div className={styles.commitLabel}>인기 저장소</div>
                      <div className={styles.repoList}>
                        {ghStats.repos.slice(0, 5).map(r => (
                          <div key={r.name} className={styles.repoItem}>
                            <span className={styles.repoName}>{r.name}</span>
                            {r.language && <span className={styles.repoLang}>{r.language}</span>}
                            <span className={styles.repoStars}>⭐ {r.stargazers_count}</span>
                          </div>
                        ))}
                        {ghStats.repos.length === 0 && <div className={styles.emptyMsg}>저장소 없음</div>}
                      </div>
                    </div>

                    {/* Recent activity */}
                    <div>
                      <div className={styles.commitLabel}>최근 활동</div>
                      <div className={styles.activityList}>
                        {ghStats.recentActivity.map((a, i) => (
                          <div key={i} className={styles.activityItem}>
                            <span className={styles.activityIcon}>{activityIcon(a.type)}</span>
                            <span className={styles.activityText}>
                              <strong>{a.repo}</strong>
                              {a.commits !== undefined && ` (+${a.commits} commits)`}
                            </span>
                            <span className={styles.activityTime}>{timeAgo(a.createdAt)}</span>
                          </div>
                        ))}
                        {ghStats.recentActivity.length === 0 && <div className={styles.emptyMsg}>활동 없음</div>}
                      </div>
                    </div>
                  </div>

                  {/* Languages */}
                  {Object.keys(ghStats.languageMap).length > 0 && (
                    <div className={styles.langSection}>
                      <div className={styles.commitLabel}>주요 언어</div>
                      <div className={styles.langBar}>
                        {Object.entries(ghStats.languageMap)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 8)
                          .map(([lang, count]) => (
                            <div key={lang} className={styles.langChip}>
                              <span className={styles.langDot} style={{ backgroundColor: LANG_COLORS[lang] ?? '#888' }} />
                              {lang}
                              <span className={styles.langCount}>{count}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* ── ITEMS ─────────────────────────────────────────────────── */}
        {tab === 'items' && (
          <>
            <div className={styles.card}>
              <div className={styles.cardTitle}>
                <span>🎮</span> 가챠 아이템 관리
                <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 12 }}>
                  합계:{' '}
                  <span className={Math.abs(probTotal - 1) < 0.01 ? styles.probTotalGood : styles.probTotalBad}>
                    {(probTotal * 100).toFixed(1)}%
                  </span>
                </span>
                <button className={styles.normalizeBtn} onClick={handleNormalize}>⚖️ 정규화</button>
              </div>
              <div className={styles.itemsGrid}>
                {gachaItems.map(item => (
                  <div key={item.id} className={styles.itemCard} style={{ borderColor: getRarityColor(item.rarity) + '44' }}>
                    <img src={item.image} alt={item.name} className={styles.itemCardImg}
                      onError={e => { (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="60"%3E%3Crect fill="%23333" width="60" height="60"/%3E%3C/svg%3E'; }}
                    />
                    <div className={styles.itemCardInfo}>
                      <div className={styles.itemCardName} title={item.name}>{item.name}</div>
                      <div className={styles.itemCardRarity} style={{ backgroundColor: getRarityColor(item.rarity) }}>
                        {getRarityLabel(item.rarity)}
                      </div>
                      <div className={styles.probRow}>
                        <input type="range" className={styles.probSlider}
                          min={0} max={1} step={0.01}
                          value={item.probability}
                          onChange={e => handleProbChange(item.id, parseFloat(e.target.value))}
                        />
                        <span className={styles.probValue}>{(item.probability * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className={styles.itemCardActions}>
                      <button className={styles.dangerBtn} onClick={() => handleDeleteItem(item.id)} title="삭제">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
              {gachaItems.length === 0 && <div className={styles.emptyMsg}>등록된 아이템이 없습니다. 아이템을 추가해주세요.</div>}
            </div>
          </>
        )}

        {/* ── COINS ─────────────────────────────────────────────────── */}
        {tab === 'coins' && (
          <>
            <div className={styles.coinBalanceDisplay}>
              <div className={styles.coinBalIcon}>🪙</div>
              <div>
                <div className={styles.coinBalLabel}>현재 코인 잔액</div>
                <div className={styles.coinBalValue}>{coins.toLocaleString()}</div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}><span>➕</span> 코인 직접 지급</div>
              <div className={styles.coinGrantForm}>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>지급 코인 수</label>
                  <input className={styles.formInput} type="number" min={1}
                    placeholder="예: 100" value={grantAmt}
                    onChange={e => setGrantAmt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleGrant()}
                  />
                </div>
                <button className={styles.formSubmitBtn} onClick={handleGrant} disabled={!grantAmt || parseInt(grantAmt) <= 0}>
                  💰 코인 지급
                </button>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}><span>🎁</span> 신규 사용자 시작 코인</div>
              <div className={styles.coinGrantForm}>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>시작 코인 수</label>
                  <input className={styles.formInput} type="number" min={0}
                    value={startCoins}
                    onChange={e => setStartCoins(parseInt(e.target.value) || 0)}
                  />
                </div>
                <button className={styles.formSubmitBtn} onClick={handleSaveStartCoins}>
                  ✅ 저장
                </button>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}><span>🎰</span> 뽑기 가격</div>
              <div className={styles.coinGrantForm}>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>1회 뽑기에 필요한 코인</label>
                  <input className={styles.formInput} type="number" min={1}
                    value={pullCostDraft}
                    onChange={e => setPullCostDraft(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSavePullCost()}
                  />
                </div>
                <p style={{ margin: '0 0 8px', fontSize: 13, opacity: 0.85 }}>
                  뽑기 할인 이벤트 시 실제 비용은 이 값을 기준으로 계산됩니다.
                </p>
                <button className={styles.formSubmitBtn} onClick={handleSavePullCost} disabled={!pullCostDraftOk}>
                  ✅ 저장
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── COMMS ─────────────────────────────────────────────────── */}
        {tab === 'comms' && (
          <>
            {/* Announcements */}
            <div className={styles.card}>
              <div className={styles.cardTitle}><span>📢</span> 공지사항</div>

              <div className={styles.announceList}>
                {announcements.length === 0
                  ? <div className={styles.emptyMsg}>등록된 공지가 없습니다.</div>
                  : announcements.map(a => (
                    <div key={a.id} className={styles.announceItem}>
                      <div className={`${styles.announceBadge} ${styles[`badge${a.type.charAt(0).toUpperCase() + a.type.slice(1)}` as keyof typeof styles]}`}>
                        {a.type}
                      </div>
                      <div className={styles.announceBody}>
                        <div className={styles.announceTitle}>{a.title}</div>
                        <div className={styles.announceContent}>{a.content}</div>
                        <div className={styles.announceDate}>{new Date(a.createdAt).toLocaleString('ko-KR')}</div>
                      </div>
                      {a.isPinned && <span className={styles.pinnedBadge}>📌</span>}
                      <button className={styles.deleteBtn} onClick={() => deleteAnnouncement(a.id)}>✕</button>
                    </div>
                  ))
                }
              </div>

              <div className={styles.newForm}>
                <div className={styles.cardTitle} style={{ marginBottom: 10 }}><span>✏️</span> 새 공지 작성</div>
                <div className={styles.formGrid2}>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>제목</label>
                    <input className={styles.formInput} type="text" placeholder="공지 제목" value={aTitle} onChange={e => setATitle(e.target.value)} />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>유형</label>
                    <select className={styles.formSelect} value={aType} onChange={e => setAType(e.target.value as Announcement['type'])}>
                      <option value="info">일반 (info)</option>
                      <option value="event">이벤트 (event)</option>
                      <option value="warning">주의 (warning)</option>
                      <option value="update">업데이트 (update)</option>
                    </select>
                  </div>
                </div>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>내용</label>
                  <input className={styles.formInput} type="text" placeholder="공지 내용" value={aContent} onChange={e => setAContent(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                    <input type="checkbox" checked={aPinned} onChange={e => setAPinned(e.target.checked)} />
                    📌 상단 고정
                  </label>
                  <button className={styles.formSubmitBtn} onClick={addAnnouncement} disabled={!aTitle.trim() || !aContent.trim()}>
                    📢 등록
                  </button>
                </div>
              </div>
            </div>

            {/* Events */}
            <div className={styles.card}>
              <div className={styles.cardTitle}><span>🎉</span> 이벤트 관리</div>

              <div className={styles.eventList}>
                {events.length === 0
                  ? <div className={styles.emptyMsg}>등록된 이벤트가 없습니다.</div>
                  : events.map(e => (
                    <div key={e.id} className={styles.eventItem}>
                      <div className={styles.eventItemInfo}>
                        <div className={styles.eventItemName}>{e.name}</div>
                        <div className={styles.eventItemDesc}>{e.description}</div>
                        <div className={styles.eventItemMeta}>
                          {e.type === 'pull_discount' ? `뽑기 비용 ÷ ${e.value}` : `코인 획득 × ${e.value}`}
                          {' · '}
                          만료: {new Date(e.expiresAt).toLocaleDateString('ko-KR')}
                        </div>
                      </div>
                      <label className={`${styles.toggleSwitch} ${e.isActive ? styles.toggleActive : ''}`}>
                        <input type="checkbox" checked={e.isActive} onChange={() => toggleEvent(e.id)} />
                        <div className={styles.toggleTrack} />
                      </label>
                      <button className={styles.deleteBtn} onClick={() => deleteEvent(e.id)}>✕</button>
                    </div>
                  ))
                }
              </div>

              <div className={styles.newForm}>
                <div className={styles.cardTitle} style={{ marginBottom: 10 }}><span>➕</span> 새 이벤트</div>
                <div className={styles.formGrid2}>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>이벤트 이름</label>
                    <input className={styles.formInput} type="text" placeholder="예: 주말 스페셜" value={eName} onChange={e => setEName(e.target.value)} />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>이벤트 유형</label>
                    <select className={styles.formSelect} value={eType} onChange={e => setEType(e.target.value as GachaEvent['type'])}>
                      <option value="pull_discount">뽑기 할인</option>
                      <option value="coin_multiplier">코인 배율</option>
                    </select>
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>{eType === 'pull_discount' ? '할인 분모 (÷N)' : '배율 (×N)'}</label>
                    <input className={styles.formInput} type="number" min={1} step={0.1} placeholder="2" value={eValue} onChange={e => setEValue(e.target.value)} />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>만료일</label>
                    <input className={styles.formInput} type="datetime-local" value={eExpiry} onChange={e => setEExpiry(e.target.value)} style={{ colorScheme: 'dark' }} />
                  </div>
                </div>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>설명 (사용자에게 표시)</label>
                  <input className={styles.formInput} type="text" placeholder="예: 이번 주말 뽑기 비용 50% 할인!" value={eDesc} onChange={e => setEDesc(e.target.value)} />
                </div>
                <button className={styles.formSubmitBtn} onClick={addEvent}
                  disabled={!eName.trim() || !eDesc.trim() || !eExpiry || parseFloat(eValue) <= 0}>
                  🎉 이벤트 추가
                </button>
              </div>
            </div>

            {/* Unused variable suppressor */}
            <div style={{ display: 'none' }}>{collectedTotal}</div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && <div className={styles.toast}>✅ {toast}</div>}
    </div>
  );
};
