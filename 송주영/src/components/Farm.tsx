import { useState, useEffect, useCallback, useRef } from 'react';
import type { GachaItem, CollectedItem } from '../types';
import {
  fetchFarm, putFarmPlace, deleteFarmItem,
  postFarmCollect, postFarmUpgrade,
  postFarmEnhance, postFarmDismantle,
} from '../api/gameApi';
import type { FarmStateData, FarmPlacedItem } from '../api/gameApi';
import { getRarityColor } from '../utils/gachaUtils';
import styles from '../styles/Farm.module.css';

interface Props {
  githubToken: string | undefined;
  backendConnected: boolean;
  collectedItems: Map<string, CollectedItem>;
  gachaItems: GachaItem[];
  coins: number;
  onCoinsChange: (newCoins: number) => void;
  onCollectedItemsChange: (map: Map<string, CollectedItem>) => void;
}

const CARD_SIZE = 72;
const SPEED_BASE = 45;

const RARITY_ORDER: GachaItem['rarity'][] = ['legendary', 'epic', 'rare', 'common'];
const RARITY_LABEL: Record<GachaItem['rarity'], string> = {
  legendary: '전설', epic: '에픽', rare: '레어', common: '일반', special: '스페셜',
};
const DISMANTLE_RATE: Record<string, number> = {
  common: 3, rare: 8, epic: 20, legendary: 50, special: 100,
};

// 200+ 말풍선 문구
const SPEECH_BUBBLES = [
  '똥마려', '쉬마려', '화장실 가고싶다', '응가하고싶어', '방귀 뀔것 같아',
  '집가고싶다', '집에 보내줘', '엄마보고싶어', '아빠 보고싶다', '집이 최고야',
  '살려주세요', '살려줘', '도와줘', '구해줘', '누가 좀 도와줘',
  '여기 어디야', '나 어디있어', '길 잃었어', '이게 어딘지 모르겠어', '여기서 어떻게 나가',
  '배고파', '밥 먹고싶다', '삼겹살 먹고싶다', '치킨 먹고싶다', '라면 끓여줘',
  '피곤해', '졸려', '자고싶다', '쉬고싶어', '힘들어요',
  '심심해', '놀아줘', '친구 어딨어', '혼자다', '외로워',
  '추워', '더워', '날씨 왜이래', '에어컨 틀어줘', '히터 켜줘',
  '주영이 최고', '주영 좋아', '주영쨩', '주영아 사랑해', '주영이 귀여워',
  '왜나만 이래', '억울해', '불공평해', '내 탓 아냐', '난 아무것도 안했어',
  '코딩 싫어', '개발 힘들다', '버그 왜이래', '에러 왜나와', 'git push 하기싫어',
  '야근하기싫어', '퇴근하고싶다', '주말이면 좋겠다', '오늘 월요일이야?', '금요일 어디갔어',
  '아이스크림 먹고싶다', '떡볶이 먹고싶다', '순대 먹고싶다', '붕어빵 먹고싶어', '컵라면 먹자',
  '이거 언제끝나', '조금만 더', '힘내자', '할 수 있어', '파이팅',
  '왜 날 뽑았어', '돌려줘', '이건 아니야', '뽑지 마세요', '살고싶다',
  '뭐야 이게', '어이없어', '진짜?', '농담이지?', '설마',
  '졌다', '이겼다', '대박', '실화야', '헐',
  '맛있겠다', '먹고싶다', '배불러', '소화 안돼', '체했어',
  '아파', '머리 아파', '배 아파', '다리 아파', '온몸이 아파',
  '무서워', '귀신 있어', '발소리 들려', '뒤에 누가 있어', '살려',
  '웃기다', '재밌다', '신나', '행복해', '즐거워',
  '슬퍼', '눈물날것같아', '울고싶다', '힘들다', '지쳤어',
  '화났어', '짜증나', '신경꺼', '건드리지마', '방해하지마',
  '고마워', '감사합니다', '도와줘서 고마워', '잘했어', '최고야',
  '미안해', '잘못했어', '용서해줘', '다신 안그럴게', '약속할게',
  '사랑해', '좋아해', '귀여워', '예뻐', '잘생겼어',
  '어디가', '뭐해', '뭐봐', '왜봐', '누구야',
  '나야', '나임', '나잖아', '뭔소리야', '모르겠어',
  '이제 뭐해', '다음엔 뭐해', '그다음엔', '끝났어', '아직이야',
  '빨리해줘', '천천히해도돼', '서두르지마', '여유있어', '시간있어',
  '오늘 뭐먹지', '점심메뉴 추천해', '저녁은 뭐야', '야식 시킬까', '배달 시켜줘',
  '운동해야하는데', '살쪘어', '다이어트 중이야', '오늘만 먹자', '내일부터 할게',
  '유튜브 보고싶다', '넷플릭스 틀어줘', '게임하고싶다', '방콕하고싶다', '칙칙폭폭',
  '카페가고싶다', '커피 마시고싶어', '아메리카노 한잔', '라떼 주세요', '카페인 충전',
  '책 읽어야하는데', '공부해야하는데', '시험 있어', '벼락치기할게', '밤새야겠다',
  '잠깐만', '조금만', '일분만', '오분만', '십분만',
  '아직이야?', '얼마나 더', '다 됐어?', '빨리빨리', '기다려줘',
  '어떡해', '어떡하지', '방법이 없어', '막막해', '포기하고싶어',
  '할게', '했어', '다했어', '완료', '끝',
  '맞아', '그거야', '바로그거야', '딱이야', '완벽해',
  '아니야', '아닌데', '틀렸어', '그게 아니라', '다시해줘',
  '잘했어', '잘하네', '신기하다', '대단해', '멋있어',
  '못했어', '실패했어', '다시할게', '연습해야겠어', '노력할게',
  '왜이렇게 더워', '땀 엄청나', '물 마시고싶어', '얼음 넣어줘', '시원해',
  '겨울옷 입고싶어', '눈 오면 좋겠다', '봄이 오면 좋겠어', '가을이 좋아', '여름 싫어',
  '산책하고싶다', '공원 가고싶어', '자연이 그리워', '바다 가고싶어', '여행 가고싶다',
  '아무것도 하기싫어', '그냥 눕고싶어', '멍때리고싶어', '뇌 비우고싶어', '생각하기싫어',
  '청소해야하는데', '방이 더러워', '빨래해야해', '설거지해야해', '집안일 싫어',
  '왜 이렇게 힘들어', '다 귀찮아', '의욕 없어', '무기력해', '그냥 쉬고싶어',
  '머리 식히고싶어', '스트레스 풀고싶어', '소리지르고싶어', '울고싶어', '터질것같아',
  '누가 안아줘', '위로해줘', '그냥 있어줘', '옆에 있어줘', '혼자 있고싶어',
  '오늘 좋은날이야', '기분좋아', '설레', '두근두근', '신난다',
  '오늘 나쁜날이야', '기분나빠', '재수없어', '오늘 망했어', '오늘은 포기',
  '뭔가 잘될것같아', '느낌이 좋아', '오늘 운좋을것같아', '직감이야', '믿어봐',
  '다 될거야', '잘될거야', '걱정마', '괜찮아', '다 잘될거야',
  '모르겠다', '생각해볼게', '어떻게할지모르겠어', '결정못하겠어', '고민이야',
  '결정했어', '이렇게 할게', '그렇게하자', '오케이', '좋아',
  '싫어', '안해', '못해', '안할래', '하기싫어',
  '해야해', '해야지', '해볼게', '노력할게', '최선다할게',
  '뿡', '방귀뀌었어', '실수했어', '죄송합니다', '실례했습니다',
  '졸리다 진짜', '눈 감겨', '잠깐 눈감을게', '조용히해줘', '쉿',
  '깜짝이야', '놀랐잖아', '무슨소리야', '갑자기 왜', '예고없이 왜',
  '뭐가 맛있을까', '초밥 먹고싶다', '피자 먹고싶다', '햄버거 먹자', '돈까스 먹자',
  '나 예뻐?', '나 잘생겼어?', '어때보여', '이거 어울려?', '패션 어때',
  '나만 힘든거야', '다들 힘든거야?', '세상이 왜이래', '이게 맞아?', '뭔가 이상해',
  '으아아아', '꺄아아', '살기싫다', '아무도 날 몰라줘', '관심받고싶어',
  '코코코', '두근두근', '흠흠', '음음', '아아아',
  '진짜루', '왜그래', '어쩌라고', '그래서?', '그러니까',
  '응응', '맞아맞아', '그러게', '알아알아', '맞지?',
];

function fmtAcc(v: number): string {
  if (v >= 10000) return v.toFixed(0);
  if (v >= 1000)  return v.toFixed(1);
  if (v >= 1)     return v.toFixed(3);
  return v.toFixed(4);
}

function calcAccumulated(farm: FarmStateData): number {
  if (farm.placedItems.length === 0) return 0;
  const totalRate = farm.placedItems.reduce((s, it) => s + it.individualValue, 0);
  if (totalRate === 0) return 0;
  // lastCollect가 null이면 서버와 동일하게 1시간 전으로 처리
  const baseTime = farm.lastCollect
    ? new Date(farm.lastCollect).getTime()
    : Date.now() - 3_600_000;
  const elapsed = Math.min((Date.now() - baseTime) / 3_600_000, 24);
  return parseFloat((totalRate * elapsed).toFixed(4));
}

// ── Bouncing animation hook ───────────────────────────────────────────────────

interface BounceState {
  x: number; y: number; vx: number; vy: number;
}

function useBounceAnimation(
  containerRef: { readonly current: HTMLDivElement | null },
  elemRefs: { current: Map<string, HTMLElement> },
  items: FarmPlacedItem[]
) {
  const posRef = useRef<Map<string, BounceState>>(new Map());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    for (const item of items) {
      if (!posRef.current.has(item.itemId)) {
        const angle = Math.random() * Math.PI * 2;
        const speed = SPEED_BASE * (0.8 + Math.random() * 0.5);
        posRef.current.set(item.itemId, {
          x: 20 + Math.random() * 180,
          y: 20 + Math.random() * 120,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
        });
      }
    }
    const ids = new Set(items.map(i => i.itemId));
    for (const id of posRef.current.keys()) {
      if (!ids.has(id)) posRef.current.delete(id);
    }

    let last = 0;
    function tick(now: number) {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      const container = containerRef.current;
      if (container) {
        const W = Math.max(0, container.clientWidth - CARD_SIZE);
        const H = Math.max(0, container.clientHeight - CARD_SIZE);
        for (const item of items) {
          const p = posRef.current.get(item.itemId);
          if (!p) continue;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.x < 0)  { p.x = 0;  p.vx =  Math.abs(p.vx); }
          if (p.x > W)  { p.x = W;  p.vx = -Math.abs(p.vx); }
          if (p.y < 0)  { p.y = 0;  p.vy =  Math.abs(p.vy); }
          if (p.y > H)  { p.y = H;  p.vy = -Math.abs(p.vy); }
          const el = elemRefs.current.get(item.itemId);
          if (el) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Main component ────────────────────────────────────────────────────────────

export function Farm({
  githubToken, backendConnected, collectedItems, gachaItems, coins, onCoinsChange, onCollectedItemsChange,
}: Props) {
  const [farm, setFarm] = useState<FarmStateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FarmPlacedItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [dismantling, setDismantling] = useState(false);
  const [speechBubbles, setSpeechBubbles] = useState<Map<string, string>>(new Map());

  const containerRef = useRef<HTMLDivElement>(null);
  const elemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const bubbleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const accDisplayRef = useRef<HTMLSpanElement>(null);

  // 실시간 카운터 — farm이 바뀔 때마다 새로 시작
  useEffect(() => {
    if (!farm) return;
    const f = farm; // null 아님을 TypeScript에 보장

    // rAF: 탭이 활성일 때 60fps 부드러운 갱신
    let rafId: number;
    let lastReactMs = 0;

    function rafTick() {
      const val = calcAccumulated(f);
      if (accDisplayRef.current) {
        accDisplayRef.current.textContent = fmtAcc(val);
      }
      const now = performance.now();
      if (now - lastReactMs > 500) {
        lastReactMs = now;
        setAccumulated(val);
      }
      rafId = requestAnimationFrame(rafTick);
    }
    rafId = requestAnimationFrame(rafTick);

    // setInterval: 백그라운드 탭에서도 React state 갱신 (버튼 활성화용)
    const intervalId = setInterval(() => {
      setAccumulated(calcAccumulated(f));
    }, 1000);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
    };
  }, [farm]);

  const placedItems = farm?.placedItems ?? [];
  useBounceAnimation(containerRef, elemRefs, placedItems);

  // Speech bubble random trigger
  useEffect(() => {
    if (placedItems.length === 0) return;
    const scheduleNext = () => {
      const delay = 30000 + Math.random() * 30000; // 30~60초 랜덤
      return setTimeout(() => {
        const idx = Math.floor(Math.random() * placedItems.length);
        const item = placedItems[idx];
        if (item) {
          const phrase = SPEECH_BUBBLES[Math.floor(Math.random() * SPEECH_BUBBLES.length)];
          setSpeechBubbles(prev => new Map(prev).set(item.itemId, phrase));
          const hide = setTimeout(() => {
            setSpeechBubbles(prev => { const n = new Map(prev); n.delete(item.itemId); return n; });
            bubbleTimers.current.delete(item.itemId);
          }, 3500);
          const old = bubbleTimers.current.get(item.itemId);
          if (old) clearTimeout(old);
          bubbleTimers.current.set(item.itemId, hide);
        }
        outerTimer = scheduleNext();
      }, delay);
    };
    let outerTimer = scheduleNext();

    return () => clearTimeout(outerTimer);
  }, [placedItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadFarm = useCallback(async () => {
    if (!githubToken) return;
    setLoading(true); setError(null);
    try {
      const data = await fetchFarm(githubToken);
      setFarm(data);
      setAccumulated(calcAccumulated(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : '농장 불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [githubToken]);

  useEffect(() => {
    if (backendConnected && githubToken) loadFarm();
  }, [backendConnected, githubToken, loadFarm]);


  const handlePlace = async (item: GachaItem) => {
    if (!githubToken || !farm) return;
    setPickerOpen(false);
    try {
      await putFarmPlace(githubToken, { id: item.id, name: item.name, rarity: item.rarity, image: item.image });
      const collected = collectedItems.get(item.id);
      const newItem: FarmPlacedItem = {
        itemId: item.id, itemName: item.name, itemRarity: item.rarity,
        itemImage: item.image, individualValue: collected?.individualValue ?? 1.0,
        placedAt: new Date().toISOString(),
      };
      setFarm(prev => prev ? { ...prev, placedItems: [...prev.placedItems, newItem] } : prev);
      showToast(`✅ ${item.name} 배치! (생산량 ${newItem.individualValue})`);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '배치 실패'}`);
    }
  };

  const handleRemove = async (itemId: string, itemName: string) => {
    if (!githubToken) return;
    setSelectedItem(null);
    try {
      await deleteFarmItem(githubToken, itemId);
      setFarm(prev => prev ? { ...prev, placedItems: prev.placedItems.filter(i => i.itemId !== itemId) } : prev);
      elemRefs.current.delete(itemId);
      showToast(`🗑️ ${itemName} 회수됨`);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '회수 실패'}`);
    }
  };

  const handleCollect = async () => {
    if (!githubToken || collecting) return;
    setCollecting(true);
    try {
      const { coinsCollected } = await postFarmCollect(githubToken);
      onCoinsChange(coins + coinsCollected);
      setFarm(prev => prev ? { ...prev, lastCollect: new Date().toISOString() } : prev);
      setAccumulated(0);
      showToast(`🪙 ${coinsCollected.toLocaleString()} 코인 수확!`);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '수확 실패'}`);
    } finally {
      setCollecting(false);
    }
  };

  const handleUpgrade = async () => {
    if (!githubToken || upgrading || !farm) return;
    if (!confirm(`슬롯 업그레이드 (${farm.nextUpgradeCost} 코인)?`)) return;
    setUpgrading(true);
    try {
      const { newMaxCards, cost } = await postFarmUpgrade(githubToken);
      onCoinsChange(coins - cost);
      setFarm(prev => prev ? { ...prev, maxCards: newMaxCards, nextUpgradeCost: (Math.max(0, newMaxCards - 3) + 1) * 200 } : prev);
      showToast(`✅ 최대 ${newMaxCards}개로 업그레이드!`);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '업그레이드 실패'}`);
    } finally {
      setUpgrading(false);
    }
  };

  const handleEnhance = async (item: FarmPlacedItem, copies: number) => {
    if (!githubToken || enhancing) return;
    setEnhancing(true);
    try {
      const { newValue } = await postFarmEnhance(githubToken, item.itemId, copies);
      setFarm(prev => prev ? {
        ...prev,
        placedItems: prev.placedItems.map(it =>
          it.itemId === item.itemId ? { ...it, individualValue: newValue } : it
        ),
      } : prev);
      const owned = collectedItems.get(item.itemId);
      if (owned) {
        onCollectedItemsChange(new Map(collectedItems).set(item.itemId, {
          ...owned, count: owned.count - copies, individualValue: newValue,
        }));
      }
      setSelectedItem(prev => prev?.itemId === item.itemId ? { ...prev, individualValue: newValue } : prev);
      showToast(`⬆️ 강화 완료! 생산량 ${newValue}`);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '강화 실패'}`);
    } finally {
      setEnhancing(false);
    }
  };

  const handleDismantle = async (item: FarmPlacedItem, copies: number) => {
    if (!githubToken || dismantling) return;
    setDismantling(true);
    try {
      const { coinsGained } = await postFarmDismantle(githubToken, item.itemId, copies);
      onCoinsChange(coins + coinsGained);
      const owned = collectedItems.get(item.itemId);
      if (owned) {
        onCollectedItemsChange(new Map(collectedItems).set(item.itemId, {
          ...owned, count: owned.count - copies,
        }));
      }
      showToast(`♻️ 분해 완료! +${coinsGained} 코인`);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '분해 실패'}`);
    } finally {
      setDismantling(false);
    }
  };

  if (!githubToken) {
    return (
      <div className={styles.farmPage}>
        <div className={styles.centerMsg}>
          <div className={styles.centerMsgIcon}>🌾</div>
          <div>GitHub 로그인 후 농장을 이용할 수 있습니다</div>
        </div>
      </div>
    );
  }
  if (loading) {
    return <div className={styles.farmPage}><div className={styles.centerMsg}><div className={styles.spinner} /></div></div>;
  }
  if (error) {
    return (
      <div className={styles.farmPage}>
        <div className={styles.centerMsg}>
          <div style={{ color: '#ff7b6b', marginBottom: 12 }}>⚠️ {error}</div>
          <button className={styles.harvestBtn} onClick={loadFarm}>다시 시도</button>
        </div>
      </div>
    );
  }
  if (!farm) return null;

  const totalRate = farm.placedItems.reduce((s, it) => s + it.individualValue, 0);
  const placedIds = new Set(farm.placedItems.map(i => i.itemId));

  return (
    <div className={styles.farmPage}>
      {/* Header */}
      <div className={styles.farmHeader}>
        <div className={styles.farmTitle}>🌾 주영 농장</div>
        <div className={styles.farmSub}>카드 고유 생산량으로 코인을 생산합니다</div>
      </div>

      {/* Earnings */}
      <div className={styles.earningsPanel}>
        <div className={styles.earningsLeft}>
          <div className={styles.earningsLabel}>현재 적립</div>
          <div className={styles.earningsValue}>
            🪙 <span ref={accDisplayRef}>{fmtAcc(accumulated)}</span>
          </div>
          <div className={styles.earningsRate}>
            시간당 +{totalRate.toFixed(2)} · 초당 +{(totalRate / 3600).toFixed(4)} · 최대 24시간
          </div>
        </div>
        <button
          className={styles.harvestBtn}
          onClick={handleCollect}
          disabled={collecting || accumulated < 1}
        >
          {collecting ? '수확 중…' : '수확하기'}
        </button>
      </div>

      {/* Fence */}
      <div className={styles.fenceContainer}>
        <div className={styles.fenceTopRail} />
        <div className={styles.fenceMiddle}>
          <div className={styles.fenceSideRail} />
          <div className={styles.farmField} ref={containerRef}>
            {farm.placedItems.length === 0 && (
              <div className={styles.emptyField}>
                <div className={styles.emptyFieldIcon}>🌱</div>
                <div>아래 버튼으로 카드를 배치해보세요</div>
              </div>
            )}
            {farm.placedItems.map(item => {
              const color = getRarityColor(item.itemRarity);
              const bubble = speechBubbles.get(item.itemId);
              return (
                <div
                  key={item.itemId}
                  className={styles.bouncingCard}
                  ref={(el) => { if (el) elemRefs.current.set(item.itemId, el); else elemRefs.current.delete(item.itemId); }}
                  onClick={() => setSelectedItem(item)}
                  title={`${item.itemName} (생산량 ${item.individualValue})`}
                  style={{ filter: `drop-shadow(0 0 6px ${color}99)` }}
                >
                  {bubble && (
                    <div className={styles.speechBubble}>
                      {bubble}
                    </div>
                  )}
                  <img
                    src={item.itemImage}
                    alt={item.itemName}
                    className={styles.bouncingCardImg}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }}
                  />
                  <div className={styles.bouncingCardBadge} style={{ background: color }}>
                    {item.individualValue}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.fenceSideRail} />
        </div>
        <div className={styles.fenceBottomRail} />
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.controlsLeft}>
          <div className={styles.slotInfo}>
            배치 {farm.placedItems.length} / {farm.maxCards}
          </div>
          <button
            className={styles.addCardBtn}
            onClick={() => setPickerOpen(true)}
            disabled={farm.placedItems.length >= farm.maxCards}
          >
            + 카드 배치
          </button>
        </div>
        <div className={styles.controlsRight}>
          <div className={styles.upgradeInfo}>
            다음 업그레이드: <strong>{farm.nextUpgradeCost.toLocaleString()} 코인</strong>
          </div>
          <button
            className={styles.upgradeBtn}
            onClick={handleUpgrade}
            disabled={upgrading || coins < farm.nextUpgradeCost}
          >
            {upgrading ? '업그레이드 중…' : '+ 슬롯 업그레이드'}
          </button>
        </div>
      </div>

      {/* Placed cards list */}
      {farm.placedItems.length > 0 && (
        <div className={styles.cardList}>
          {farm.placedItems.map(item => {
            const color = getRarityColor(item.itemRarity);
            const owned = collectedItems.get(item.itemId);
            const dupes = (owned?.count ?? 1) - 1;
            return (
              <div
                key={item.itemId}
                className={styles.cardListItem}
                style={{ borderColor: color + '55' }}
                onClick={() => setSelectedItem(item)}
              >
                <img src={item.itemImage} alt={item.itemName} className={styles.cardListImg}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }} />
                <div className={styles.cardListInfo}>
                  <div className={styles.cardListName}>{item.itemName}</div>
                  <div className={styles.cardListRarity} style={{ color }}>{RARITY_LABEL[item.itemRarity]}</div>
                </div>
                <div className={styles.cardListRight}>
                  <div className={styles.cardListValue}>생산량 {item.individualValue}</div>
                  {dupes > 0 && <div className={styles.cardListDupes}>복제 {dupes}장</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Card detail modal */}
      {selectedItem && (
        <CardDetailModal
          item={selectedItem}
          owned={collectedItems.get(selectedItem.itemId)}
          onClose={() => setSelectedItem(null)}
          onRemove={() => handleRemove(selectedItem.itemId, selectedItem.itemName)}
          onEnhance={(copies) => handleEnhance(selectedItem, copies)}
          onDismantle={(copies) => handleDismantle(selectedItem, copies)}
          enhancing={enhancing}
          dismantling={dismantling}
        />
      )}

      {/* Card picker modal */}
      {pickerOpen && (
        <CardPicker
          gachaItems={gachaItems}
          collectedItems={collectedItems}
          placedIds={placedIds}
          onSelect={handlePlace}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}

// ── Card detail modal ─────────────────────────────────────────────────────────

interface CardDetailProps {
  item: FarmPlacedItem;
  owned: CollectedItem | undefined;
  onClose: () => void;
  onRemove: () => void;
  onEnhance: (copies: number) => void;
  onDismantle: (copies: number) => void;
  enhancing: boolean;
  dismantling: boolean;
}

function CardDetailModal({ item, owned, onClose, onRemove, onEnhance, onDismantle, enhancing, dismantling }: CardDetailProps) {
  const [enhanceCopies, setEnhanceCopies] = useState(1);
  const [dismantleCopies, setDismantleCopies] = useState(1);
  const dupes = (owned?.count ?? 1) - 1;
  const color = getRarityColor(item.itemRarity);
  const dismantleCoins = DISMANTLE_RATE[item.itemRarity] ?? 3;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.detailModal} onClick={e => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>
        <div className={styles.detailHeader}>
          <img src={item.itemImage} alt={item.itemName} className={styles.detailImg}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }} />
          <div className={styles.detailInfo}>
            <div className={styles.detailName}>{item.itemName}</div>
            <div className={styles.detailRarity} style={{ color }}>{RARITY_LABEL[item.itemRarity]}</div>
            <div className={styles.detailValue}>생산량: <strong style={{ color }}>{item.individualValue}</strong></div>
            <div className={styles.detailOwned}>보유: {owned?.count ?? '?'}장 (복제 {dupes}장)</div>
          </div>
        </div>

        <div className={styles.detailSection}>
          <div className={styles.detailSectionTitle}>⬆️ 강화 (복제 카드 소모 → 생산량 증가)</div>
          <div className={styles.detailRow}>
            <input
              type="number" min={1} max={Math.max(1, dupes)}
              value={enhanceCopies}
              onChange={e => setEnhanceCopies(Math.max(1, Math.min(dupes, parseInt(e.target.value) || 1)))}
              className={styles.detailInput}
              disabled={dupes === 0}
            />
            <span className={styles.detailHint}>장 소모</span>
            <button
              className={styles.enhanceBtn}
              onClick={() => onEnhance(enhanceCopies)}
              disabled={dupes === 0 || enhancing}
            >
              {enhancing ? '강화 중…' : '강화하기'}
            </button>
          </div>
          {dupes === 0 && <div className={styles.detailWarn}>복제 카드가 없습니다</div>}
        </div>

        <div className={styles.detailSection}>
          <div className={styles.detailSectionTitle}>♻️ 분해 (복제 카드 → 코인)</div>
          <div className={styles.detailRow}>
            <input
              type="number" min={1} max={Math.max(1, dupes)}
              value={dismantleCopies}
              onChange={e => setDismantleCopies(Math.max(1, Math.min(dupes, parseInt(e.target.value) || 1)))}
              className={styles.detailInput}
              disabled={dupes === 0}
            />
            <span className={styles.detailHint}>
              장 → 🪙 {(dismantleCoins * dismantleCopies).toLocaleString()}
            </span>
            <button
              className={styles.dismantleBtn}
              onClick={() => onDismantle(dismantleCopies)}
              disabled={dupes === 0 || dismantling}
            >
              {dismantling ? '분해 중…' : '분해하기'}
            </button>
          </div>
          {dupes === 0 && <div className={styles.detailWarn}>복제 카드가 없습니다</div>}
        </div>

        <button className={styles.removeBtn} onClick={onRemove}>🗑️ 농장에서 회수</button>
      </div>
    </div>
  );
}

// ── Card picker modal ─────────────────────────────────────────────────────────

interface CardPickerProps {
  gachaItems: GachaItem[];
  collectedItems: Map<string, CollectedItem>;
  placedIds: Set<string>;
  onSelect: (item: GachaItem) => void;
  onClose: () => void;
}

function CardPicker({ gachaItems, collectedItems, placedIds, onSelect, onClose }: CardPickerProps) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.pickerHeader}>
          <span>카드 선택</span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.pickerBody}>
          {RARITY_ORDER.map(rarity => {
            const items = gachaItems.filter(i => i.rarity === rarity);
            if (items.length === 0) return null;
            const color = getRarityColor(rarity);
            return (
              <div key={rarity} className={styles.pickerGroup}>
                <div className={styles.pickerGroupLabel} style={{ color }}>
                  {RARITY_LABEL[rarity]}
                </div>
                <div className={styles.pickerGrid}>
                  {items.map(item => {
                    const collected = collectedItems.get(item.id);
                    const isPlaced = placedIds.has(item.id);
                    const canPlace = !!collected && !isPlaced;
                    return (
                      <button
                        key={item.id}
                        className={`${styles.pickerItem} ${!canPlace ? styles.pickerItemLocked : ''}`}
                        style={canPlace ? { borderColor: color + '66' } : {}}
                        onClick={() => canPlace && onSelect(item)}
                        disabled={!canPlace}
                        title={isPlaced ? '이미 배치됨' : !collected ? '미수집' : item.name}
                      >
                        {collected ? (
                          <>
                            <img src={item.image} alt={item.name} className={styles.pickerItemImg}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }} />
                            <div className={styles.pickerItemName}>{item.name}</div>
                            {isPlaced && <div className={styles.pickerItemPlaced}>배치됨</div>}
                            {!isPlaced && (
                              <div className={styles.pickerItemValue} style={{ color }}>
                                생산량 {collected.individualValue}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className={styles.pickerItemQuestion}>?</div>
                            <div className={styles.pickerItemName} style={{ color: 'rgba(255,255,255,0.2)' }}>???</div>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
