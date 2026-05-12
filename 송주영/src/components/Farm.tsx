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
  legendary: '전설', epic: '에픽', rare: '레어', common: '일반',
};
const DISMANTLE_RATE: Record<string, number> = {
  common: 3, rare: 8, epic: 20, legendary: 50,
};

function calcAccumulated(farm: FarmStateData): number {
  if (!farm.lastCollect || farm.placedItems.length === 0) return 0;
  const totalRate = farm.placedItems.reduce((s, it) => s + it.individualValue, 0);
  if (totalRate === 0) return 0;
  const elapsed = Math.min((Date.now() - new Date(farm.lastCollect).getTime()) / 3600000, 24);
  return Math.floor(totalRate * elapsed);
}

// ── Bouncing animation hook ───────────────────────────────────────────────────

interface BounceState {
  x: number; y: number; vx: number; vy: number;
}

function useBounceAnimation(
  containerRef: React.RefObject<HTMLDivElement | null>,
  elemRefs: React.MutableRefObject<Map<string, HTMLElement>>,
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

  const containerRef = useRef<HTMLDivElement>(null);
  const elemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const placedItems = farm?.placedItems ?? [];
  useBounceAnimation(containerRef, elemRefs, placedItems);

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

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setFarm(prev => { if (prev) setAccumulated(calcAccumulated(prev)); return prev; });
    }, 10000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

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
      showToast(`✅ ${item.name} 배치 완료! (계체값 ${newItem.individualValue})`);
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
      showToast(`⬆️ 강화 완료! 계체값 ${newValue}`);
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
        <div className={styles.farmSub}>카드 고유 계체값으로 코인을 생산합니다</div>
      </div>

      {/* Earnings */}
      <div className={styles.earningsPanel}>
        <div className={styles.earningsLeft}>
          <div className={styles.earningsLabel}>현재 적립</div>
          <div className={styles.earningsValue}>🪙 {accumulated.toLocaleString()}</div>
          <div className={styles.earningsRate}>시간당 {totalRate.toFixed(1)} · 최대 24시간 저장</div>
        </div>
        <button
          className={styles.harvestBtn}
          onClick={handleCollect}
          disabled={collecting || accumulated === 0}
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
              return (
                <div
                  key={item.itemId}
                  className={styles.bouncingCard}
                  ref={(el) => { if (el) elemRefs.current.set(item.itemId, el); else elemRefs.current.delete(item.itemId); }}
                  onClick={() => setSelectedItem(item)}
                  title={`${item.itemName} (계체값 ${item.individualValue})`}
                  style={{ filter: `drop-shadow(0 0 6px ${color}99)` }}
                >
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
                  <div className={styles.cardListValue}>계체값 {item.individualValue}</div>
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
            <div className={styles.detailValue}>계체값: <strong style={{ color }}>{item.individualValue}</strong></div>
            <div className={styles.detailOwned}>보유: {owned?.count ?? '?'}장 (복제 {dupes}장)</div>
          </div>
        </div>

        <div className={styles.detailSection}>
          <div className={styles.detailSectionTitle}>⬆️ 강화 (복제 카드 소모 → 계체값 증가)</div>
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
              {enhancing ? '강화 중…' : `강화하기`}
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
                                {collected.individualValue}
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
