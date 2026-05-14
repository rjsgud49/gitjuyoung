import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { GachaItem } from '../types';
import type { GachaEvent, Announcement } from '../types/admin';
import { getRarityColor, getRarityLabel, setFarmProductionRanges } from '../utils/gachaUtils';
import { fetchGitHubFullStats } from '../utils/githubUtils';
import type { GitHubStats } from '../utils/githubUtils';
import { fetchAdminUsers, putAdminUser, deleteAdminUser, fetchAdminFarmConfig, putAdminFarmConfig, postAdminRerollValues, fetchSynthesisRecipes, postAdminSynthesisRecipe, deleteAdminSynthesisRecipe, postAdminUploadCard, postAdminUploadSynthesisRecipeImage } from '../api/gameApi';
import type { SynthesisRecipeApi } from '../api/gameApi';
import type { UserSummary, FarmConfig } from '../api/gameApi';
import styles from '../styles/AdminPanel.module.css';
import { photoUrlForDisplay } from '../utils/photoUrl';

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
  legendary: '⭐', epic: '💜', rare: '💙', common: '⬜', special: '✨',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'items' | 'coins' | 'comms' | 'users' | 'farm' | 'synthesis' | 'upload';

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
  // Synthesis
  const [recipes, setRecipes] = useState<SynthesisRecipeApi[]>([]);
  const [recipesLoaded, setRecipesLoaded] = useState(false);
  const [editRecipe, setEditRecipe] = useState<SynthesisRecipeApi | null>(null);
  const synthesisResultImageInputRef = useRef<HTMLInputElement>(null);
  const [synthesisImgUploading, setSynthesisImgUploading] = useState(false);
  const [ingredientPickerIndex, setIngredientPickerIndex] = useState<number | null>(null);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const ingredientPickerRef = useRef<HTMLDivElement | null>(null);
  // Upload
  const [uploadFiles, setUploadFiles] = useState<Array<{
    file: File;
    preview: string;
    name: string;
    rarity: 'common'|'rare'|'epic'|'legendary';
    prob: string;
    resultCardImage?: File;
    resultCardPreview?: string;
    uploading?: boolean;
    error?: string;
  }>>([]);
  const [rarityWeights, setRarityWeights] = useState<Record<GachaItem['rarity'], number>>({
    legendary: 1, epic: 3, rare: 8, common: 15, special: 0,
  });
  const [isDragActive, setIsDragActive] = useState(false);
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

  const filteredGachaForIngredient = useMemo(() => {
    const s = ingredientSearch.trim().toLowerCase();
    if (!s) return gachaItems;
    return gachaItems.filter(
      c => c.name.toLowerCase().includes(s) || c.id.toLowerCase().includes(s)
    );
  }, [gachaItems, ingredientSearch]);

  useEffect(() => {
    setIngredientPickerIndex(null);
    setIngredientSearch('');
  }, [editRecipe?.id]);

  useEffect(() => {
    if (ingredientPickerIndex === null) return;
    const onDown = (e: MouseEvent) => {
      const node = ingredientPickerRef.current;
      if (node && !node.contains(e.target as Node)) {
        setIngredientPickerIndex(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ingredientPickerIndex]);

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

  // ── Synthesis ────────────────────────────────────────────────────────────────

  const loadRecipes = useCallback(async () => {
    try {
      const data = await fetchSynthesisRecipes();
      setRecipes(data);
      setRecipesLoaded(true);
    } catch { showToast('❌ 레시피 로드 실패'); }
  }, [showToast]);

  useEffect(() => {
    if (tab === 'synthesis' && !recipesLoaded) loadRecipes();
  }, [tab, recipesLoaded, loadRecipes]);

  const newRecipe = (): SynthesisRecipeApi => ({
    id: `recipe_${Date.now()}`,
    name: '',
    resultItemId: `sp-${Date.now()}`,
    resultItemName: '',
    resultItemRarity: 'special',
    resultItemImage: '',
    ingredients: [{ itemId: '', itemName: '', count: 1 }],
  });

  const handleSaveRecipe = async () => {
    if (!githubToken || !editRecipe) return;
    if (!editRecipe.name || !editRecipe.resultItemName || editRecipe.ingredients.some(i => !i.itemId)) {
      showToast('❌ 모든 필드를 입력하세요'); return;
    }
    try {
      await postAdminSynthesisRecipe(githubToken, editRecipe);
      showToast('✅ 레시피 저장 완료');
      setEditRecipe(null);
      await loadRecipes();
    } catch (e) { showToast(`❌ 저장 실패: ${e instanceof Error ? e.message : e}`); }
  };

  const handleDeleteRecipe = async (id: string) => {
    if (!githubToken || !confirm('레시피를 삭제할까요?')) return;
    try {
      await deleteAdminSynthesisRecipe(githubToken, id);
      showToast('🗑️ 레시피 삭제 완료');
      setRecipes(prev => prev.filter(r => r.id !== id));
    } catch (e) { showToast(`❌ 삭제 실패: ${e instanceof Error ? e.message : e}`); }
  };

  const handleSynthesisResultImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    if (!githubToken) { showToast('❌ GitHub 관리자 로그인이 필요합니다'); return; }
    if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(file.name)) {
      showToast('⚠️ PNG, JPG, GIF, WEBP만 업로드할 수 있습니다');
      return;
    }
    setSynthesisImgUploading(true);
    try {
      const { imageUrl } = await postAdminUploadSynthesisRecipeImage(githubToken, file);
      setEditRecipe(p => p && ({ ...p, resultItemImage: imageUrl }));
      showToast('✅ 이미지 업로드 완료');
    } catch (err) {
      showToast(`❌ 업로드 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSynthesisImgUploading(false);
    }
  };

  // ── Card upload ───────────────────────────────────────────────────────────────

  const handleUploadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files) return;
    addUploadFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const files = e.dataTransfer.files;
    if (files) addUploadFiles(files);
  };

  const addUploadFiles = (files: FileList) => {
    const newItems: typeof uploadFiles = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(file.name)) {
        showToast(`⚠️ ${file.name}은(는) 이미지 파일이 아닙니다`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        newItems.push({
          file,
          preview: event.target?.result as string,
          name: file.name.replace(/\.[^.]+$/, ''),
          rarity: 'common',
          prob: '15',
        });
        if (newItems.length + uploadFiles.length >= files.length) {
          setUploadFiles(prev => [...prev, ...newItems]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const updateUploadCard = (idx: number, field: string, value: any) => {
    setUploadFiles(prev => {
      const arr = [...prev];
      (arr[idx] as any)[field] = value;
      return arr;
    });
  };

  const removeUploadCard = (idx: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUploadCard = async (idx: number) => {
    const card = uploadFiles[idx];
    if (!githubToken || !card.name) {
      showToast('❌ 파일과 이름을 입력하세요'); return;
    }

    const autoId = `card_${card.file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}_${Date.now()}_${idx}`;
    
    try {
      updateUploadCard(idx, 'uploading', true);
      await postAdminUploadCard(githubToken, card.file, {
        id: autoId, name: card.name, rarity: card.rarity,
        probability: parseFloat(card.prob) || 15,
        resultCardImage: card.resultCardImage,
      });
      showToast(`✅ "${card.name}" 카드 업로드 완료`);
      removeUploadCard(idx);
    } catch (e) {
      updateUploadCard(idx, 'error', e instanceof Error ? e.message : '업로드 실패');
      updateUploadCard(idx, 'uploading', false);
    }
  };

  const handleUploadAllCards = async () => {
    if (!githubToken || uploadFiles.length === 0) {
      showToast('❌ 업로드할 카드가 없습니다'); return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < uploadFiles.length; i++) {
      try {
        updateUploadCard(i, 'uploading', true);
        const card = uploadFiles[i];
        const autoId = `card_${card.file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}_${Date.now()}_${i}`;
        await postAdminUploadCard(githubToken, card.file, {
          id: autoId, name: card.name, rarity: card.rarity,
          probability: parseFloat(card.prob) || 15,
          resultCardImage: card.resultCardImage,
        });
        successCount++;
        removeUploadCard(i);
        i--;
      } catch (e) {
        failCount++;
        updateUploadCard(i, 'error', e instanceof Error ? e.message : '업로드 실패');
        updateUploadCard(i, 'uploading', false);
      }
    }

    showToast(`✅ ${successCount}개 업로드 완료${failCount > 0 ? `, ❌ ${failCount}개 실패` : ''}`);
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
          ['synthesis', '⚗️', '합성 관리'],
          ['upload',    '📤', '카드 업로드'],
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
                          <img src={photoUrlForDisplay(item.image)} alt={item.name} className={styles.itemCardImg}
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
                  ['special',   '✨ 스페셜', 'specialMin',  'specialMax'],
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

        {/* ── 합성 관리 탭 ──────────────────────────────────────────────────── */}
        {tab === 'synthesis' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}><span>⚗️</span> 합성 레시피 관리</div>
            <button className={styles.fetchBtn} onClick={() => { setRecipesLoaded(false); loadRecipes(); }} style={{ marginBottom: 12 }}>
              🔄 새로고침
            </button>
            <button className={styles.formSubmitBtn} onClick={() => setEditRecipe(newRecipe())} style={{ marginBottom: 16 }}>
              ➕ 새 레시피 추가
            </button>

            {recipes.length === 0 && <div className={styles.emptyMsg}>등록된 레시피 없음</div>}
            {recipes.map(r => (
              <div key={r.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12, marginBottom: 10, border: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,200,100,0.2)' }}>
                  {r.resultItemImage ? (
                    <img src={photoUrlForDisplay(r.resultItemImage)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, opacity: 0.35 }}>🖼</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                    결과: {r.resultItemName} ({getRarityLabel(r.resultItemRarity as any)})
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                    재료: {r.ingredients.map(i => `${i.itemName} ×${i.count}`).join(', ')}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className={styles.fetchBtn} onClick={() => setEditRecipe({ ...r })}>✏️ 편집</button>
                    <button type="button" className={styles.dangerBtn} onClick={() => handleDeleteRecipe(r.id)}>🗑 삭제</button>
                  </div>
                </div>
              </div>
            ))}

            {editRecipe && (
              <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,200,100,0.2)' }}>
                <div style={{ fontWeight: 800, marginBottom: 12, color: '#e8c870' }}>레시피 편집</div>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>레시피 이름</label>
                  <input className={styles.formInput} value={editRecipe.name}
                    onChange={e => setEditRecipe(p => p && ({ ...p, name: e.target.value }))} />
                </div>
                <div style={{ marginTop: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>결과 카드</div>
                <div className={styles.formGrid2}>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>카드 ID</label>
                    <input className={styles.formInput} value={editRecipe.resultItemId}
                      onChange={e => setEditRecipe(p => p && ({ ...p, resultItemId: e.target.value }))} />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>카드 이름</label>
                    <input className={styles.formInput} value={editRecipe.resultItemName}
                      onChange={e => setEditRecipe(p => p && ({ ...p, resultItemName: e.target.value }))} />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>등급</label>
                    <select className={styles.formInput} value={editRecipe.resultItemRarity}
                      onChange={e => setEditRecipe(p => p && ({ ...p, resultItemRarity: e.target.value }))}>
                      <option value="special">✨ 스페셜</option>
                      <option value="legendary">⭐ 전설</option>
                      <option value="epic">💜 에픽</option>
                      <option value="rare">💙 레어</option>
                      <option value="common">⬜ 일반</option>
                    </select>
                  </div>
                  <div className={styles.formRow} style={{ gridColumn: '1 / -1' }}>
                    <label className={styles.formLabel}>결과 카드 이미지</label>
                    <div className={styles.synthesisImageBlock}>
                      <div className={styles.synthesisResultPreviewBox}>
                        {editRecipe.resultItemImage ? (
                          <img src={photoUrlForDisplay(editRecipe.resultItemImage)} alt="결과 카드 미리보기" />
                        ) : (
                          <div className={styles.synthesisResultPreviewPlaceholder}>
                            업로드 또는 아래 URL 입력 시<br />
                            카드 이미지가 여기 표시됩니다
                          </div>
                        )}
                      </div>
                      <div className={styles.synthesisImageActions}>
                        <input
                          ref={synthesisResultImageInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          className={styles.programmaticFileInput}
                          onChange={handleSynthesisResultImageFile}
                          disabled={synthesisImgUploading}
                          tabIndex={-1}
                          aria-hidden
                        />
                        <button
                          type="button"
                          className={styles.fetchBtn}
                          style={{ alignSelf: 'flex-start' }}
                          disabled={!githubToken || synthesisImgUploading}
                          onClick={() => synthesisResultImageInputRef.current?.click()}
                        >
                          {synthesisImgUploading ? '업로드 중…' : '📎 사진 업로드'}
                        </button>
                        <input
                          className={styles.formInput}
                          placeholder="/사진/카드이름.png (직접 입력)"
                          value={editRecipe.resultItemImage}
                          onChange={e => setEditRecipe(p => p && ({ ...p, resultItemImage: e.target.value }))}
                        />
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', margin: 0, lineHeight: 1.45 }}>
                          서버 <code style={{ color: 'rgba(232,200,112,0.85)' }}>/사진</code>에 저장됩니다. 가챠 풀에는 자동으로 넣지 않습니다.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                  재료 ({editRecipe.ingredients.length}개)
                  <button className={styles.fetchBtn} style={{ marginLeft: 8 }}
                    onClick={() => setEditRecipe(p => p && ({ ...p, ingredients: [...p.ingredients, { itemId: '', itemName: '', count: 1 }] }))}>
                    ➕ 재료 추가
                  </button>
                </div>
                {editRecipe.ingredients.map((ing, idx) => {
                  const selCard = gachaItems.find(c => c.id === ing.itemId);
                  const pickerOpen = ingredientPickerIndex === idx;
                  return (
                    <div key={idx} className={styles.ingredientRow}>
                      <div
                        ref={pickerOpen ? ingredientPickerRef : null}
                        className={styles.ingredientPickerWrap}
                      >
                        <button
                          type="button"
                          className={styles.ingredientPickerTrigger}
                          onClick={() => {
                            setIngredientPickerIndex(v => (v === idx ? null : idx));
                            setIngredientSearch('');
                          }}
                        >
                          {selCard ? (
                            <img className={styles.ingredientPickerTriggerThumb} src={photoUrlForDisplay(selCard.image)} alt="" />
                          ) : (
                            <div className={styles.ingredientPickerTriggerThumb} aria-hidden />
                          )}
                          <span className={styles.ingredientPickerTriggerText}>
                            {selCard
                              ? `${(RARITY_EMOJI as Record<string, string>)[selCard.rarity] ?? '•'} ${selCard.name}`
                              : '카드 선택 — 썸네일에서 고르기'}
                          </span>
                          <span style={{ color: 'rgba(255,200,100,0.65)', fontSize: 11, flexShrink: 0 }} aria-hidden>
                            {pickerOpen ? '▲' : '▼'}
                          </span>
                        </button>
                        {pickerOpen && (
                          <div className={styles.ingredientPickerPanel} role="listbox" aria-label="재료 카드 목록">
                            <input
                              type="text"
                              className={styles.ingredientPickerSearch}
                              placeholder="이름 또는 ID 검색…"
                              value={ingredientSearch}
                              onChange={e => setIngredientSearch(e.target.value)}
                              autoFocus
                            />
                            <div className={styles.ingredientPickerGrid}>
                              {filteredGachaForIngredient.map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className={styles.ingredientPickerCard}
                                  onClick={() => {
                                    setEditRecipe(p => {
                                      if (!p) return p;
                                      const arr = [...p.ingredients];
                                      arr[idx] = { ...arr[idx], itemId: c.id, itemName: c.name };
                                      return { ...p, ingredients: arr };
                                    });
                                    setIngredientPickerIndex(null);
                                    setIngredientSearch('');
                                  }}
                                >
                                  <img src={photoUrlForDisplay(c.image)} alt="" loading="lazy" />
                                  <span className={styles.ingredientPickerCardName}>
                                    {(RARITY_EMOJI as Record<string, string>)[c.rarity] ?? '•'} {c.name}
                                  </span>
                                </button>
                              ))}
                            </div>
                            {filteredGachaForIngredient.length === 0 && (
                              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: 10 }}>
                                검색 결과 없음
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <input
                        className={styles.formInput}
                        type="number"
                        min={1}
                        value={ing.count}
                        style={{ width: 56, flexShrink: 0 }}
                        onChange={e => setEditRecipe(p => {
                          if (!p) return p;
                          const arr = [...p.ingredients];
                          arr[idx] = { ...arr[idx], count: parseInt(e.target.value) || 1 };
                          return { ...p, ingredients: arr };
                        })}
                      />
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={() => {
                          setIngredientPickerIndex(null);
                          setEditRecipe(p => p && ({ ...p, ingredients: p.ingredients.filter((_, i) => i !== idx) }));
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  );
                })}

                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button className={styles.formSubmitBtn} onClick={handleSaveRecipe}>💾 저장</button>
                  <button className={styles.fetchBtn} onClick={() => setEditRecipe(null)}>취소</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 카드 업로드 탭 ────────────────────────────────────────────────── */}
        {tab === 'upload' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}><span>📤</span> 카드 업로드</div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px' }}>
              이미지를 업로드하면 즉시 가챠 풀에 추가됩니다 (서버 재시작 불필요)
            </p>

            {/* 드래그 앤 드롭 영역 */}
            <div
              className={`${styles.uploadDropZone} ${isDragActive ? styles.uploadDropZoneActive : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className={styles.uploadDropContent}>
                <div className={styles.uploadDropIcon}>📤</div>
                <div className={styles.uploadDropText}>
                  이미지를 드래그하거나 클릭하여 추가
                </div>
                <div className={styles.uploadDropSubtext}>
                  PNG, JPG, GIF, WebP 파일 지원 (최대 10MB)
                </div>
              </div>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleUploadFileChange}
                className={styles.uploadFileInput}
              />
            </div>

            {/* 선택된 카드 목록 */}
            {uploadFiles.length > 0 && (
              <>
                <div style={{ marginTop: 20, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>
                    선택된 카드: <span style={{ color: '#e8c870' }}>{uploadFiles.length}</span>개
                  </div>
                  <button className={styles.formSubmitBtn} onClick={handleUploadAllCards}
                    style={{ marginLeft: 'auto', width: 'auto' }}>
                    🚀 모두 업로드
                  </button>
                </div>

                <div className={styles.uploadCardsGrid}>
                  {uploadFiles.map((card, idx) => (
                    <div key={idx} className={styles.uploadCardItem}>
                      {/* 미리보기 */}
                      <div className={styles.uploadCardPreview}>
                        <img src={card.preview} alt={card.name} />
                        {card.uploading && (
                          <div className={styles.uploadCardOverlay}>
                            <div className={styles.spinner} style={{ width: 24, height: 24 }} />
                          </div>
                        )}
                        {card.error && (
                          <div className={styles.uploadCardError}>
                            <span style={{ fontSize: 12 }}>❌</span>
                          </div>
                        )}
                      </div>

                      {/* 메타데이터 */}
                      <div className={styles.uploadCardInfo}>
                        <input
                          className={styles.uploadCardName}
                          placeholder="카드 이름"
                          value={card.name}
                          onChange={e => updateUploadCard(idx, 'name', e.target.value)}
                          disabled={card.uploading}
                        />
                        <div className={styles.uploadCardMetaRow}>
                          <select
                            className={styles.uploadCardSelect}
                            value={card.rarity}
                            onChange={e => updateUploadCard(idx, 'rarity', e.target.value)}
                            disabled={card.uploading}
                          >
                            <option value="legendary">⭐ 전설</option>
                            <option value="epic">💜 에픽</option>
                            <option value="rare">💙 레어</option>
                            <option value="common">⬜ 일반</option>
                          </select>
                          <input
                            type="number"
                            min="1"
                            className={styles.uploadCardProb}
                            value={card.prob}
                            onChange={e => updateUploadCard(idx, 'prob', e.target.value)}
                            disabled={card.uploading}
                            placeholder="가중치"
                          />
                        </div>
                        
                        {/* 결과카드 이미지 선택 */}
                        <div style={{ marginTop: 8 }}>
                          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>
                            결과카드 배경 이미지 (선택사항)
                          </label>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                if (e.currentTarget.files?.[0]) {
                                  const file = e.currentTarget.files[0];
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    updateUploadCard(idx, 'resultCardImage', file);
                                    updateUploadCard(idx, 'resultCardPreview', event.target?.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              disabled={card.uploading}
                              style={{ display: 'none' }}
                              id={`resultCardInput_${idx}`}
                            />
                            <label 
                              htmlFor={`resultCardInput_${idx}`}
                              style={{
                                fontSize: 11,
                                padding: '4px 8px',
                                backgroundColor: 'rgba(232, 200, 112, 0.2)',
                                border: '1px solid rgba(232, 200, 112, 0.4)',
                                borderRadius: 4,
                                cursor: card.uploading ? 'not-allowed' : 'pointer',
                                opacity: card.uploading ? 0.5 : 1,
                              }}
                            >
                              📸 선택
                            </label>
                            {card.resultCardPreview && (
                              <>
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>✓ 설정됨</span>
                                <button
                                  onClick={() => {
                                    updateUploadCard(idx, 'resultCardImage', undefined);
                                    updateUploadCard(idx, 'resultCardPreview', undefined);
                                  }}
                                  disabled={card.uploading}
                                  style={{
                                    fontSize: 10,
                                    padding: '2px 6px',
                                    backgroundColor: 'rgba(255, 107, 107, 0.2)',
                                    border: 'none',
                                    borderRadius: 3,
                                    color: '#ff6b6b',
                                    cursor: 'pointer',
                                  }}
                                >
                                  ✕
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        
                        {card.error && (
                          <div style={{ fontSize: 11, color: '#ff6b6b', marginTop: 6 }}>
                            {card.error}
                          </div>
                        )}
                      </div>

                      {/* 액션 버튼 */}
                      <div className={styles.uploadCardActions}>
                        {!card.uploading ? (
                          <>
                            <button
                              className={styles.uploadCardBtn}
                              onClick={() => handleUploadCard(idx)}
                              title="이 카드 업로드"
                            >
                              📤
                            </button>
                            <button
                              className={styles.uploadCardBtnDel}
                              onClick={() => removeUploadCard(idx)}
                              title="제거"
                            >
                              🗑
                            </button>
                          </>
                        ) : (
                          <div style={{ fontSize: 12, color: '#e8c870', fontWeight: 700 }}>업로드 중…</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {uploadFiles.length === 0 && (
              <div className={styles.emptyMsg} style={{ marginTop: 24 }}>
                📁 여기에 이미지를 드래그하거나 위의 영역을 클릭하세요
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <div className={styles.toast}>✅ {toast}</div>}
    </div>
  );
};
