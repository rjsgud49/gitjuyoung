import { useState, useEffect, useCallback, useRef } from 'react';
import type { GachaItem } from '../types';
import type { CollectedItem } from '../types';
import {
  fetchFarm, putFarmPlace, deleteFarmSlot,
  postFarmCollect, postFarmUpgrade,
} from '../api/gameApi';
import type { FarmStateData, FarmSlot } from '../api/gameApi';
import { getRarityColor } from '../utils/gachaUtils';
import styles from '../styles/Farm.module.css';

interface Props {
  githubToken: string | undefined;
  backendConnected: boolean;
  collectedItems: Map<string, CollectedItem>;
  gachaItems: GachaItem[];
  coins: number;
  onCoinsChange: (newCoins: number) => void;
}

function calcAccumulated(farm: FarmStateData): number {
  if (!farm.lastCollect) return 0;
  const totalRate = farm.slots.reduce((s, sl) => s + (sl.productionRate ?? 0), 0);
  if (totalRate === 0) return 0;
  const elapsedHours = Math.min((Date.now() - new Date(farm.lastCollect).getTime()) / 3600000, 24);
  return Math.floor(totalRate * elapsedHours);
}

const RARITY_ORDER: GachaItem['rarity'][] = ['legendary', 'epic', 'rare', 'common'];
const RARITY_LABEL: Record<GachaItem['rarity'], string> = {
  legendary: '전설', epic: '에픽', rare: '레어', common: '일반',
};

export function Farm({ githubToken, backendConnected, collectedItems, gachaItems, coins, onCoinsChange }: Props) {
  const [farm, setFarm] = useState<FarmStateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accumulated, setAccumulated] = useState(0);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // tick every 10s to update accumulated display
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setFarm(prev => {
        if (prev) setAccumulated(calcAccumulated(prev));
        return prev;
      });
    }, 10000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const handlePlace = async (slotIndex: number, item: GachaItem) => {
    if (!githubToken) return;
    setPickerSlot(null);
    try {
      const result = await putFarmPlace(githubToken, slotIndex, {
        id: item.id, name: item.name, rarity: item.rarity, image: item.image,
      });
      setFarm(prev => {
        if (!prev) return prev;
        const slots = prev.slots.map(s =>
          s.index === slotIndex
            ? { ...s, itemId: item.id, itemName: item.name, itemRarity: item.rarity, itemImage: item.image, productionRate: result.productionRate, placedAt: new Date().toISOString() }
            : s
        );
        return { ...prev, slots };
      });
      showToast(`✅ ${item.name} 배치 완료! (${result.productionRate} 코인/시간)`);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '배치 실패'}`);
    }
  };

  const handleRemove = async (slotIndex: number) => {
    if (!githubToken) return;
    try {
      await deleteFarmSlot(githubToken, slotIndex);
      setFarm(prev => {
        if (!prev) return prev;
        const slots = prev.slots.map(s =>
          s.index === slotIndex
            ? { index: slotIndex, itemId: null, itemName: null, itemRarity: null, itemImage: null, productionRate: null, placedAt: null }
            : s
        );
        return { ...prev, slots };
      });
      showToast('🗑️ 카드를 회수했습니다');
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
      const { newMaxSlots, cost } = await postFarmUpgrade(githubToken);
      onCoinsChange(coins - cost);
      await loadFarm();
      showToast(`✅ 슬롯 ${newMaxSlots}개로 업그레이드!`);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '업그레이드 실패'}`);
    } finally {
      setUpgrading(false);
    }
  };

  if (!githubToken) {
    return (
      <div className={styles.farmContainer}>
        <div className={styles.loginPrompt}>
          <div className={styles.loginPromptIcon}>🌾</div>
          <div className={styles.loginPromptText}>GitHub 로그인 후 농장을 이용할 수 있습니다</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.farmContainer}>
        <div className={styles.loginPrompt}><div className={styles.spinner} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.farmContainer}>
        <div className={styles.loginPrompt}>
          <div style={{ color: '#ff6b6b' }}>⚠️ {error}</div>
          <button className={styles.harvestBtn} onClick={loadFarm} style={{ marginTop: 12 }}>다시 시도</button>
        </div>
      </div>
    );
  }

  if (!farm) return null;

  const totalRate = farm.slots.reduce((s, sl) => s + (sl.productionRate ?? 0), 0);

  return (
    <div className={styles.farmContainer}>
      {/* Header */}
      <div className={styles.farmHeader}>
        <div className={styles.farmTitle}>
          <span className={styles.farmTitleIcon}>🌾</span>
          <span>주영 농장</span>
        </div>
        <div className={styles.farmHeaderSub}>카드를 배치하면 코인을 생산합니다</div>
      </div>

      {/* Coin accumulation panel */}
      <div className={styles.farmEarnings}>
        <div className={styles.earningsMain}>
          <div className={styles.earningsLabel}>현재 적립 코인</div>
          <div className={styles.earningsValue}>🪙 {accumulated.toLocaleString()}</div>
          <div className={styles.earningsRate}>
            시간당 {totalRate.toFixed(1)} 코인 · 최대 24시간 저장
          </div>
        </div>
        <button
          className={styles.harvestBtn}
          onClick={handleCollect}
          disabled={collecting || accumulated === 0}
        >
          {collecting ? '수확 중…' : '수확하기'}
        </button>
      </div>

      {/* Slots */}
      <div className={styles.slotsSection}>
        <div className={styles.slotsSectionTitle}>
          농장 슬롯 ({farm.slots.length}/{farm.maxSlots})
        </div>
        <div className={styles.slotsGrid}>
          {farm.slots.map(slot => (
            <SlotCard
              key={slot.index}
              slot={slot}
              onPickOpen={() => setPickerSlot(slot.index)}
              onRemove={() => handleRemove(slot.index)}
            />
          ))}
        </div>

        <div className={styles.upgradeRow}>
          <div className={styles.upgradeInfo}>
            다음 슬롯 업그레이드: <strong>{farm.nextUpgradeCost.toLocaleString()} 코인</strong>
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

      {/* Picker modal */}
      {pickerSlot !== null && (
        <CardPicker
          slotIndex={pickerSlot}
          gachaItems={gachaItems}
          collectedItems={collectedItems}
          onSelect={item => handlePlace(pickerSlot, item)}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* Toast */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}

// ── Slot Card ─────────────────────────────────────────────────────────────────

interface SlotCardProps {
  slot: FarmSlot;
  onPickOpen: () => void;
  onRemove: () => void;
}

function SlotCard({ slot, onPickOpen, onRemove }: SlotCardProps) {
  if (slot.itemId) {
    const color = getRarityColor((slot.itemRarity as GachaItem['rarity']) ?? 'common');
    return (
      <div className={styles.slotCard} style={{ borderColor: color + '66' }}>
        <div className={styles.slotCardRarity} style={{ color }}>
          {RARITY_LABEL[(slot.itemRarity as GachaItem['rarity']) ?? 'common']}
        </div>
        <img
          src={slot.itemImage ?? ''}
          alt={slot.itemName ?? ''}
          className={styles.slotCardImg}
          onError={e => { (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%23333" width="80" height="80"/%3E%3C/svg%3E'; }}
        />
        <div className={styles.slotCardName}>{slot.itemName}</div>
        <div className={styles.slotCardRate} style={{ color }}>
          ⚡ {slot.productionRate} 코인/시간
        </div>
        <button className={styles.slotRemoveBtn} onClick={onRemove} title="회수">✕</button>
      </div>
    );
  }

  return (
    <div className={styles.slotCardEmpty} onClick={onPickOpen}>
      <div className={styles.emptySlotQuestion}>?</div>
      <div className={styles.emptySlotLabel}>카드 배치</div>
    </div>
  );
}

// ── Card Picker ───────────────────────────────────────────────────────────────

interface CardPickerProps {
  slotIndex: number;
  gachaItems: GachaItem[];
  collectedItems: Map<string, CollectedItem>;
  onSelect: (item: GachaItem) => void;
  onClose: () => void;
}

function CardPicker({ gachaItems, collectedItems, onSelect, onClose }: CardPickerProps) {
  return (
    <div className={styles.pickerOverlay} onClick={onClose}>
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.pickerHeader}>
          <span>카드 선택</span>
          <button className={styles.pickerClose} onClick={onClose}>✕</button>
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
                    const collected = collectedItems.has(item.id);
                    return (
                      <button
                        key={item.id}
                        className={`${styles.pickerItem} ${!collected ? styles.pickerItemLocked : ''}`}
                        style={collected ? { borderColor: color + '55' } : {}}
                        onClick={() => collected && onSelect(item)}
                        disabled={!collected}
                        title={collected ? item.name : '미수집'}
                      >
                        {collected ? (
                          <>
                            <img src={item.image} alt={item.name} className={styles.pickerItemImg}
                              onError={e => { (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="60"%3E%3Crect fill="%23333" width="60" height="60"/%3E%3C/svg%3E'; }}
                            />
                            <div className={styles.pickerItemName}>{item.name}</div>
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
