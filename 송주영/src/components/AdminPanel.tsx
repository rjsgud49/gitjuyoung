import { useState, useEffect, useCallback } from 'react';
import type { GachaItem } from '../types';
import type { GachaEvent, Announcement } from '../types/admin';
import { getRarityColor, getRarityLabel, setFarmProductionRanges } from '../utils/gachaUtils';
import { fetchGitHubFullStats } from '../utils/githubUtils';
import type { GitHubStats } from '../utils/githubUtils';
import { fetchAdminUsers, putAdminUser, deleteAdminUser, fetchAdminFarmConfig, putAdminFarmConfig, postAdminRerollValues } from '../api/gameApi';
import type { UserSummary, FarmConfig } from '../api/gameApi';
import styles from '../styles/AdminPanel.module.css';

// ─── Lang colors ──────────────────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', 'C++': '#f34b7d',
  C: '#555555', CSS: '#563d7c', HTML: '#e34c26', Vue: '#41b883',
  Svelte: '#ff3e00', Kotlin: '#A97BFF', Swift: '#F05138',
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

const GITHUB_ADMIN_KEY = 'adminGithubUsername';

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

// ─── Rarity helpers ───────────────────────────────────────────────────────────

const RARITY_ORDER: GachaItem['rarity'][] = ['legendary', 'epic', 'rare', 'common'];
const RARITY_EMOJI: Record<GachaItem['rarity'], string> = {
  legendary: '⭐', epic: '💜', rare: '💙', common: '⬜',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'items' | 'coins' | 'comms' | 'users' | 'farm';

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
  startingCoins: number;
  onStartingCoinsChange: (n: number) => void;
  githubToken?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AdminPanel = ({
  gachaItems, onUpdateItems, coins, onGrantCoins, totalPulls,
  events, onEventsChange, announcements, onAnnouncementsChange,
  gachaPullCost, onGachaPullCostChange, startingCoins, onStartingCoinsChange, githubToken,
}: Props) => {
  const [tab,         setTab]         = useState<Tab>('dashboard');
  // Users tab state
  const [users,       setUsers]       = useState<UserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError,  setUsersError]  = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editCoins,   setEditCoins]   = useState('');
  const [editPulls,   setEditPulls]   = useState('');
  // Farm config tab
  const [farmCfg, setFarmCfg] = useState<FarmConfig | null>(null);
  const [farmCfgLoading, setFarmCfgLoading] = useState(false);
  const [rarityWeights, setRarityWeights] = useState<Record<GachaItem['rarity'], number>>({
    legendary: 1, epic: 3, rare: 8, common: 15,
  });
  const [ghUser,      setGhUser]      = useState(() => localStorage.getItem(GITHUB_ADMIN_KEY) ?? '');
  const [ghStats,     setGhStats]     = useState<GitHubStats | null>(null);
  const [ghLoading,   setGhLoading]   = useState(false);
  const [ghError,     setGhError]     = useState<string | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);
  const [grantAmt,    setGrantAmt]    = useState('');
  const [startCoins,  setStartCoins]  = useState(startingCoins);
  const [pullCostDraft, setPullCostDraft] = useState(() => String(gachaPullCost));

  // prop이 백엔드에서 업데이트되면 로컬 draft 동기화
  useEffect(() => { setStartCoins(startingCoins); }, [startingCoins]);

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
    const safe = Math.max(1, Math.floor(val) || 1);
    onUpdateItems(gachaItems.map(item => item.id === id ? { ...item, probability: safe } : item));
  };

  const handleApplyRarityWeights = () => {
    onUpdateItems(gachaItems.map(i => ({ ...i, probability: rarityWeights[i.rarity] })));
    showToast('✅ 등급별 가중치가 전체 적용되었습니다');
  };

  const handleRarityChange = (id: string, rarity: GachaItem['rarity']) => {
    onUpdateItems(gachaItems.map(item => item.id === id ? { ...item, rarity } : item));
  };

  const handleDeleteItem = (id: string) => {
    if (!confirm('이 아이템을 가챠 풀에서 제거할까요?')) return;
    onUpdateItems(gachaItems.filter(i => i.id !== id));
    showToast('🗑️ 아이템이 제거되었습니다');
  };

  const probTotal = gachaItems.reduce((s, i) => s + i.probability, 0);

  const rarityStats = RARITY_ORDER.map(r => {
    const items = gachaItems.filter(i => i.rarity === r);
    const weightSum = items.reduce((s, i) => s + i.probability, 0);
    const pct = probTotal > 0 ? weightSum / probTotal * 100 : 0;
    return { rarity: r, count: items.length, weightSum, pct };
  });
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
    onStartingCoinsChange(n);
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
    onAnnouncementsChange([newA, ...announcements]);
    setATitle(''); setAContent(''); setAPinned(false);
    showToast('📢 공지가 등록되었습니다');
  };

  const deleteAnnouncement = (id: string) => {
    onAnnouncementsChange(announcements.filter(a => a.id !== id));
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
    onEventsChange([newE, ...events]);
    setEName(''); setEDesc(''); setEValue('2'); setEExpiry('');
    showToast('🎉 이벤트가 추가되었습니다');
  };

  const toggleEvent = (id: string) => {
    onEventsChange(events.map(e => e.id === id ? { ...e, isActive: !e.isActive } : e));
  };

  const deleteEvent = (id: string) => {
    onEventsChange(events.filter(e => e.id !== id));
  };

  // ── Users tab ─────────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    if (!githubToken) return;
    setUsersLoading(true); setUsersError(null);
    try {
      setUsers(await fetchAdminUsers(githubToken));
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : '유저 목록 불러오기 실패');
    } finally {
      setUsersLoading(false);
    }
  }, [githubToken]);

  useEffect(() => {
    if (tab === 'users') loadUsers();
  }, [tab, loadUsers]);

  const loadFarmCfg = useCallback(async () => {
    if (!githubToken) return;
    setFarmCfgLoading(true);
    try {
      setFarmCfg(await fetchAdminFarmConfig(githubToken));
    } catch (e) {
      showToast(`❌ 농장 설정 불러오기 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setFarmCfgLoading(false);
    }
  }, [githubToken, showToast]);

  useEffect(() => {
    if (tab === 'farm' && !farmCfg) loadFarmCfg();
  }, [tab, farmCfg, loadFarmCfg]);

  const handleSaveFarmCfg = async () => {
    if (!githubToken || !farmCfg) return;
    try {
      await putAdminFarmConfig(githubToken, farmCfg);
      setFarmProductionRanges(farmCfg); // 클라이언트 범위 즉시 반영
      showToast('✅ 농장 생산량 설정 저장 완료');
    } catch (e) {
      showToast(`❌ 저장 실패: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleRerollValues = async () => {
    if (!githubToken) return;
    try {
      const { updated } = await postAdminRerollValues(githubToken);
      showToast(`✅ ${updated.toLocaleString()}개 카드 생산량 재배정 완료`);
    } catch (e) {
      showToast(`❌ 재배정 실패: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleEditUser = (u: UserSummary) => {
    setEditingUser(u.githubLogin);
    setEditCoins(String(u.coins));
    setEditPulls(String(u.totalPulls));
  };

  const handleSaveUser = async (login: string) => {
    if (!githubToken) return;
    const coins = parseInt(editCoins, 10);
    const pulls = parseInt(editPulls, 10);
    if (isNaN(coins) || isNaN(pulls) || coins < 0 || pulls < 0) return;
    try {
      await putAdminUser(githubToken, login, { coins, totalPulls: pulls });
      setUsers(prev => prev.map(u => u.githubLogin === login ? { ...u, coins, totalPulls: pulls } : u));
      setEditingUser(null);
      showToast(`✅ ${login} 저장 완료`);
    } catch (e) {
      showToast(`❌ 저장 실패: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleDeleteUser = async (login: string) => {
    if (!githubToken) return;
    if (!confirm(`"${login}" 유저를 삭제할까요? 수집 아이템도 모두 삭제됩니다.`)) return;
    try {
      await deleteAdminUser(githubToken, login);
      setUsers(prev => prev.filter(u => u.githubLogin !== login));
      showToast(`🗑️ ${login} 삭제 완료`);
    } catch (e) {
      showToast(`❌ 삭제 실패: ${e instanceof Error ? e.message : e}`);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const uniqueItems = gachaItems.length;

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
          ['users',     '👥', '유저 관리'],
          ['farm',      '🌾', '농장 설정'],
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
            {/* 등급별 가중치 프리셋 */}
            <div className={styles.card}>
              <div className={styles.cardTitle}><span>⚖️</span> 등급별 가중치 일괄 설정</div>
              <div className={styles.rarityPresetGrid}>
                {RARITY_ORDER.map(r => (
                  <div key={r} className={styles.rarityPresetItem} style={{ borderColor: getRarityColor(r) + '55' }}>
                    <div className={styles.rarityPresetLabel} style={{ color: getRarityColor(r) }}>
                      {RARITY_EMOJI[r]} {getRarityLabel(r)}
                    </div>
                    <input
                      type="number" min={1} step={1}
                      className={styles.rarityWeightInput}
                      value={rarityWeights[r]}
                      onChange={e => setRarityWeights(prev => ({ ...prev, [r]: Math.max(1, parseInt(e.target.value) || 1) }))}
                    />
                  </div>
                ))}
              </div>
              <div className={styles.presetHint}>
                예시: 전설 1 · 에픽 3 · 레어 8 · 일반 15 → 가중치가 클수록 더 자주 뽑힘
              </div>
              <button className={styles.applyRarityBtn} onClick={handleApplyRarityWeights}>
                ✅ 전체 카드에 적용
              </button>
            </div>

            {/* 등급별 확률 분포 */}
            <div className={styles.card}>
              <div className={styles.cardTitle}><span>📊</span> 등급별 확률 분포
                <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  총 가중치 합: <strong style={{ color: '#e8c870' }}>{probTotal.toLocaleString()}</strong>
                </span>
              </div>
              <div className={styles.rarityStatList}>
                {rarityStats.map(({ rarity, count, weightSum, pct }) => (
                  <div key={rarity} className={styles.rarityStatRow}>
                    <div className={styles.rarityStatLabel}>
                      <span style={{ color: getRarityColor(rarity) }}>{RARITY_EMOJI[rarity]} {getRarityLabel(rarity)}</span>
                      <span className={styles.rarityStatCount}>{count}종</span>
                    </div>
                    <div className={styles.rarityStatBar}>
                      <div className={styles.rarityStatBarFill}
                        style={{ width: `${pct}%`, backgroundColor: getRarityColor(rarity) + 'aa' }} />
                    </div>
                    <div className={styles.rarityStatNumbers}>
                      <span className={styles.rarityStatWeight}>가중치 합 {weightSum.toLocaleString()}</span>
                      <span className={styles.rarityStatPct} style={{ color: getRarityColor(rarity) }}>
                        {pct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 카드 목록 (등급별 그룹) */}
            <div className={styles.card}>
              <div className={styles.cardTitle}><span>🎮</span> 카드별 가중치 편집</div>
              {RARITY_ORDER.map(rarity => {
                const items = gachaItems.filter(i => i.rarity === rarity);
                if (items.length === 0) return null;
                return (
                  <div key={rarity} className={styles.rarityGroup}>
                    <div className={styles.rarityGroupHeader} style={{ borderColor: getRarityColor(rarity) + '55', color: getRarityColor(rarity) }}>
                      {RARITY_EMOJI[rarity]} {getRarityLabel(rarity)} <span className={styles.rarityGroupCount}>({items.length}종)</span>
                    </div>
                    <div className={styles.itemsGrid}>
                      {items.map(item => (
                        <div key={item.id} className={styles.itemCard} style={{ borderColor: getRarityColor(item.rarity) + '44' }}>
                          <img src={item.image} alt={item.name} className={styles.itemCardImg}
                            onError={e => { (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="60"%3E%3Crect fill="%23333" width="60" height="60"/%3E%3C/svg%3E'; }}
                          />
                          <div className={styles.itemCardInfo}>
                            <div className={styles.itemCardName} title={item.name}>{item.name}</div>
                            <div className={styles.probRow}>
                              <span className={styles.weightLabel}>등급</span>
                              <select
                                className={styles.raritySelect}
                                value={item.rarity}
                                onChange={e => handleRarityChange(item.id, e.target.value as GachaItem['rarity'])}
                                style={{ color: getRarityColor(item.rarity) }}
                              >
                                <option value="legendary">⭐ 전설</option>
                                <option value="epic">💜 에픽</option>
                                <option value="rare">💙 레어</option>
                                <option value="common">⬜ 일반</option>
                              </select>
                            </div>
                            <div className={styles.probRow}>
                              <span className={styles.weightLabel}>가중치</span>
                              <input
                                type="number" min={1} step={1}
                                className={styles.weightInput}
                                value={item.probability}
                                onChange={e => handleProbChange(item.id, parseInt(e.target.value))}
                              />
                              <span className={styles.probValue} style={{ color: getRarityColor(item.rarity) }}>
                                {probTotal > 0 ? (item.probability / probTotal * 100).toFixed(2) : '0.00'}%
                              </span>
                            </div>
                          </div>
                          <div className={styles.itemCardActions}>
                            <button className={styles.dangerBtn} onClick={() => handleDeleteItem(item.id)} title="삭제">🗑</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {gachaItems.length === 0 && <div className={styles.emptyMsg}>등록된 아이템이 없습니다.</div>}
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

          </>
        )}

        {/* ── USERS ─────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <span>👥</span> 유저 관리
              <button className={styles.fetchBtn} onClick={loadUsers} disabled={usersLoading} style={{ marginLeft: 'auto' }}>
                {usersLoading ? '불러오는 중…' : '새로고침'}
              </button>
            </div>

            {usersError && <div className={styles.errorMsg}>⚠️ {usersError}</div>}

            {!usersLoading && users.length === 0 && !usersError && (
              <div className={styles.emptyMsg}>등록된 유저가 없습니다.</div>
            )}

            <div className={styles.userList}>
              {users.map(u => (
                <div key={u.githubLogin} className={styles.userItem}>
                  <div className={styles.userItemHeader}>
                    <span className={styles.userItemLogin}>@{u.githubLogin}</span>
                    <span className={styles.userItemMeta}>
                      가입: {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                      {u.lastCheckinDate && ` · 출석: ${u.lastCheckinDate}`}
                    </span>
                  </div>

                  {editingUser === u.githubLogin ? (
                    <div className={styles.userEditRow}>
                      <div className={styles.userEditField}>
                        <label className={styles.formLabel}>코인</label>
                        <input className={styles.formInput} type="number" min={0}
                          value={editCoins} onChange={e => setEditCoins(e.target.value)} />
                      </div>
                      <div className={styles.userEditField}>
                        <label className={styles.formLabel}>총 뽑기</label>
                        <input className={styles.formInput} type="number" min={0}
                          value={editPulls} onChange={e => setEditPulls(e.target.value)} />
                      </div>
                      <button className={styles.formSubmitBtn} onClick={() => handleSaveUser(u.githubLogin)}>저장</button>
                      <button className={styles.deleteBtn} onClick={() => setEditingUser(null)}>취소</button>
                    </div>
                  ) : (
                    <div className={styles.userItemStats}>
                      <span className={styles.userStat}>🪙 {u.coins.toLocaleString()} 코인</span>
                      <span className={styles.userStat}>🎰 {u.totalPulls.toLocaleString()} 회</span>
                      <div className={styles.userItemActions}>
                        <button className={styles.fetchBtn} onClick={() => handleEditUser(u)}>수정</button>
                        <button className={styles.dangerBtn} onClick={() => handleDeleteUser(u.githubLogin)}>삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FARM CONFIG ───────────────────────────────────────── */}
        {tab === 'farm' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <span>🌾</span> 농장 생산량 설정
              <button className={styles.fetchBtn} onClick={loadFarmCfg} disabled={farmCfgLoading} style={{ marginLeft: 'auto' }}>
                {farmCfgLoading ? '불러오는 중…' : '새로고침'}
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px' }}>
              각 등급별 카드 배치 시 랜덤 생산 속도 범위 (코인/시간)
            </p>
            {farmCfg ? (
              <>
                {([
                  ['legendary', '⭐ 전설', 'legendaryMin', 'legendaryMax'],
                  ['epic',      '💜 에픽', 'epicMin',      'epicMax'],
                  ['rare',      '💙 레어', 'rareMin',      'rareMax'],
                  ['common',    '⬜ 일반', 'commonMin',    'commonMax'],
                ] as [string, string, keyof FarmConfig, keyof FarmConfig][]).map(([, label, minKey, maxKey]) => (
                  <div key={minKey} className={styles.formGrid2} style={{ marginBottom: 12 }}>
                    <div className={styles.formRow}>
                      <label className={styles.formLabel}>{label} 최소</label>
                      <input className={styles.formInput} type="number" min={0} step={0.5}
                        value={farmCfg[minKey]}
                        onChange={e => setFarmCfg(prev => prev ? { ...prev, [minKey]: parseFloat(e.target.value) || 0 } : prev)}
                      />
                    </div>
                    <div className={styles.formRow}>
                      <label className={styles.formLabel}>{label} 최대</label>
                      <input className={styles.formInput} type="number" min={0} step={0.5}
                        value={farmCfg[maxKey]}
                        onChange={e => setFarmCfg(prev => prev ? { ...prev, [maxKey]: parseFloat(e.target.value) || 0 } : prev)}
                      />
                    </div>
                  </div>
                ))}
                <button className={styles.formSubmitBtn} onClick={handleSaveFarmCfg}>
                  ✅ 저장
                </button>
                <button
                  className={styles.formSubmitBtn}
                  onClick={handleRerollValues}
                  style={{ marginTop: 8, background: '#7c3aed' }}
                  title="현재 설정 범위 기준으로 전체 수집 카드 생산량 재배정"
                >
                  🎲 전체 카드 생산량 재배정
                </button>
              </>
            ) : (
              <div className={styles.emptyMsg}>{farmCfgLoading ? '불러오는 중…' : '설정을 불러오세요'}</div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <div className={styles.toast}>✅ {toast}</div>}
    </div>
  );
};
