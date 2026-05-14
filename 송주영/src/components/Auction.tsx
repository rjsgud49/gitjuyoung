import { useState, useEffect, useCallback } from 'react';
import type { CollectedItem } from '../types';
import {
  fetchAuctions, fetchMyAuctions, postCreateAuction, deleteAuction, postBuyAuction,
} from '../api/gameApi';
import type { AuctionEntry } from '../api/gameApi';
import { getRarityColor } from '../utils/gachaUtils';
import { photoUrlForDisplay, handlePhotoImgErrorThenHide } from '../utils/photoUrl';
import styles from '../styles/Auction.module.css';

interface Props {
  githubToken: string | undefined;
  githubLogin: string | undefined;
  backendConnected: boolean;
  collectedItems: Map<string, CollectedItem>;
  coins: number;
  onCoinsChange: (n: number) => void;
  onCollectedItemsChange: (map: Map<string, CollectedItem>) => void;
}

type Tab = 'market' | 'mine';
type RarityFilter = 'all' | 'legendary' | 'epic' | 'rare' | 'common';
type SortKey = 'price_asc' | 'price_desc' | 'rarity' | 'new';

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'common'] as const;
const RARITY_LABEL: Record<string, string> = {
  legendary: '전설', epic: '에픽', rare: '레어', common: '일반',
};
const RARITY_SORT_ORDER: Record<string, number> = {
  legendary: 0, epic: 1, rare: 2, common: 3,
};

const PRICE_PRESETS = [50, 100, 200, 500, 1000, 2000, 5000];

export function Auction({
  githubToken, githubLogin, backendConnected, collectedItems, coins, onCoinsChange, onCollectedItemsChange,
}: Props) {
  const [tab, setTab] = useState<Tab>('market');
  const [market, setMarket] = useState<AuctionEntry[]>([]);
  const [myListings, setMyListings] = useState<AuctionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [buying, setBuying] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('new');

  // List modal
  const [modalOpen, setModalOpen] = useState(false);
  const [sellItemId, setSellItemId] = useState('');
  const [sellPrice, setSellPrice] = useState(100);
  const [selling, setSelling] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadMarket = useCallback(async () => {
    if (!backendConnected) return;
    setLoading(true);
    try {
      const data = await fetchAuctions();
      setMarket(data);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '로드 실패'}`);
    } finally { setLoading(false); }
  }, [backendConnected, showToast]);

  const loadMine = useCallback(async () => {
    if (!githubToken || !backendConnected) return;
    try {
      const data = await fetchMyAuctions(githubToken);
      setMyListings(data);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '로드 실패'}`);
    }
  }, [githubToken, backendConnected, showToast]);

  useEffect(() => {
    if (backendConnected) {
      loadMarket();
      if (githubToken) loadMine();
    }
  }, [backendConnected, githubToken, loadMarket, loadMine]);

  // 30초마다 시장 자동 갱신
  useEffect(() => {
    if (!backendConnected) return;
    const t = setInterval(loadMarket, 30000);
    return () => clearInterval(t);
  }, [backendConnected, loadMarket]);

  const handleBuy = async (auction: AuctionEntry) => {
    if (!githubToken || buying) return;
    if (!confirm(`🪙 ${auction.price.toLocaleString()} 코인으로 "${auction.itemName}" 구매?`)) return;
    setBuying(auction.id);
    try {
      const { coinsSpent } = await postBuyAuction(githubToken, auction.id);
      onCoinsChange(coins - coinsSpent);
      const existing = collectedItems.get(auction.itemId);
      const updated = new Map(collectedItems);
      if (existing) {
        updated.set(auction.itemId, { ...existing, count: existing.count + 1 });
      } else {
        updated.set(auction.itemId, {
          id: auction.itemId, name: auction.itemName, rarity: auction.itemRarity,
          image: auction.itemImage, probability: 0, count: 1,
          firstAcquiredAt: new Date(), individualValue: auction.individualValue,
        });
      }
      onCollectedItemsChange(updated);
      setMarket(prev => prev.filter(a => a.id !== auction.id));
      showToast(`✅ ${auction.itemName} 구매! (-${coinsSpent.toLocaleString()} 🪙)`);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '구매 실패'}`);
    } finally { setBuying(null); }
  };

  const handleCancel = async (auctionId: number, itemName: string) => {
    if (!githubToken || cancelling) return;
    if (!confirm(`"${itemName}" 경매를 취소할까요? 카드가 도감에 반환됩니다.`)) return;
    setCancelling(auctionId);
    try {
      await deleteAuction(githubToken, auctionId);
      setMyListings(prev => prev.map(a => a.id === auctionId ? { ...a, status: 'cancelled' } : a));
      loadMarket();
      showToast('🔄 경매 취소 — 카드가 도감에 반환됩니다');
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '취소 실패'}`);
    } finally { setCancelling(null); }
  };

  const handleSell = async () => {
    if (!githubToken || selling || !sellItemId) return;
    const item = collectedItems.get(sellItemId);
    if (!item) { showToast('카드를 선택해주세요'); return; }
    if (sellPrice < 1) { showToast('가격을 1 이상으로 설정해주세요'); return; }
    setSelling(true);
    try {
      await postCreateAuction(
        githubToken,
        { itemId: item.id, itemName: item.name, itemRarity: item.rarity, itemImage: item.image || '', individualValue: item.individualValue },
        sellPrice
      );
      const updated = new Map(collectedItems);
      if (item.count <= 1) updated.delete(item.id);
      else updated.set(item.id, { ...item, count: item.count - 1 });
      onCollectedItemsChange(updated);
      setSellItemId('');
      setModalOpen(false);
      loadMarket();
      loadMine();
      setTab('mine');
      showToast(`📦 ${item.name} 등록 완료! (${sellPrice.toLocaleString()} 🪙)`);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '등록 실패'}`);
    } finally { setSelling(false); }
  };

  if (!githubToken) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyCenter}>
          <div className={styles.emptyIcon}>🏪</div>
          <div>GitHub 로그인 후 경매를 이용할 수 있습니다</div>
        </div>
      </div>
    );
  }

  // Filtered & sorted market
  const activeMarket = market
    .filter(a => a.status === 'active')
    .filter(a => rarityFilter === 'all' || a.itemRarity === rarityFilter)
    .sort((a, b) => {
      if (sortKey === 'price_asc')  return a.price - b.price;
      if (sortKey === 'price_desc') return b.price - a.price;
      if (sortKey === 'rarity')     return (RARITY_SORT_ORDER[a.itemRarity] ?? 4) - (RARITY_SORT_ORDER[b.itemRarity] ?? 4);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // new
    });

  const ownedItems = Array.from(collectedItems.values())
    .filter(i => i.count >= 1)
    .sort((a, b) => (RARITY_SORT_ORDER[a.rarity] ?? 4) - (RARITY_SORT_ORDER[b.rarity] ?? 4) || a.name.localeCompare(b.name, 'ko'));

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>🏪 카드 경매장</div>
        <div className={styles.sub}>카드를 올리면 다른 유저가 구매합니다 · 자동 30초 갱신</div>
      </div>

      {/* Tab + 등록 버튼 */}
      <div className={styles.topBar}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'market' ? styles.tabActive : ''}`}
            onClick={() => { setTab('market'); loadMarket(); }}
          >
            🏪 시장 <span className={styles.tabCount}>{activeMarket.length}</span>
          </button>
          <button
            className={`${styles.tab} ${tab === 'mine' ? styles.tabActive : ''}`}
            onClick={() => { setTab('mine'); loadMine(); }}
          >
            📦 내 경매 <span className={styles.tabCount}>{myListings.filter(a => a.status === 'active').length}</span>
          </button>
        </div>
        <button className={styles.listBtn} onClick={() => { setSellItemId(''); setModalOpen(true); }}>
          + 카드 등록
        </button>
      </div>

      {/* Market filters */}
      {tab === 'market' && (
        <div className={styles.filterBar}>
          <div className={styles.rarityFilters}>
            {(['all', ...RARITY_ORDER] as const).map(r => {
              const color = r === 'all' ? '#aaa' : getRarityColor(r);
              return (
                <button
                  key={r}
                  className={`${styles.rarityBtn} ${rarityFilter === r ? styles.rarityBtnActive : ''}`}
                  style={rarityFilter === r ? { borderColor: color, color, background: color + '22' } : {}}
                  onClick={() => setRarityFilter(r)}
                >
                  {r === 'all' ? '전체' : RARITY_LABEL[r]}
                </button>
              );
            })}
          </div>
          <select
            className={styles.sortSelect}
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
          >
            <option value="new">최신순</option>
            <option value="price_asc">낮은 가격순</option>
            <option value="price_desc">높은 가격순</option>
            <option value="rarity">희귀도순</option>
          </select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      ) : (
        <>
          {/* Market */}
          {tab === 'market' && (
            activeMarket.length === 0 ? (
              <div className={styles.emptyCenter}>
                <div className={styles.emptyIcon}>🏪</div>
                <div>등록된 카드가 없습니다</div>
              </div>
            ) : (
              <div className={styles.grid}>
                {activeMarket.map((a, idx) => {
                  const color = getRarityColor(a.itemRarity);
                  const isSelf = a.sellerLogin === (githubLogin ?? '').toLowerCase();
                  const canAfford = coins >= a.price;
                  const spinDuration = 4 + (idx % 6) * 0.6;
                  const timeAgo = (() => {
                    const d = Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 60000);
                    if (d < 1) return '방금 전';
                    if (d < 60) return `${d}분 전`;
                    return `${Math.floor(d / 60)}시간 전`;
                  })();
                  return (
                    <div key={a.id} className={styles.card} style={{ '--rarity-color': color } as React.CSSProperties}>
                      <div className={styles.cardGlow} style={{ background: `radial-gradient(circle, ${color}33 0%, transparent 70%)` }} />
                      <div className={styles.cardRarityBar} style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
                      <div className={styles.cardImgWrap} style={{ '--spin-dur': `${spinDuration}s` } as React.CSSProperties}>
                        <img
                          src={photoUrlForDisplay(a.itemImage)}
                          alt={a.itemName}
                          className={styles.cardImgSpin}
                          onError={(e) => { handlePhotoImgErrorThenHide(e, a.itemImage); }}
                        />
                      </div>
                      <div className={styles.cardInfo}>
                        <div className={styles.cardName}>{a.itemName}</div>
                        <div className={styles.cardRarity} style={{ color }}>{RARITY_LABEL[a.itemRarity]}</div>
                        <div className={styles.cardMeta}>
                          <span className={styles.metaItem}>⚡ {a.individualValue}</span>
                          <span className={styles.metaSep}>·</span>
                          <span className={styles.metaItem}>{timeAgo}</span>
                        </div>
                        <div className={styles.cardSeller}>👤 {a.sellerLogin}</div>
                        <div className={styles.cardPrice} style={{ color: '#ffd740' }}>
                          🪙 {a.price.toLocaleString()}
                        </div>
                      </div>
                      {isSelf ? (
                        <div className={styles.selfTag}>내 카드</div>
                      ) : (
                        <button
                          className={styles.buyBtn}
                          style={canAfford ? { borderColor: color + '66', color } : {}}
                          onClick={() => handleBuy(a)}
                          disabled={!!buying || !canAfford}
                        >
                          {buying === a.id ? '구매 중…' : canAfford ? '구매' : '코인 부족'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* My listings */}
          {tab === 'mine' && (
            myListings.length === 0 ? (
              <div className={styles.emptyCenter}>
                <div className={styles.emptyIcon}>📦</div>
                <div>등록한 경매가 없습니다</div>
                <button className={styles.listBtnSmall} onClick={() => setModalOpen(true)}>카드 등록하기</button>
              </div>
            ) : (
              <div className={styles.mineList}>
                {myListings.map(a => {
                  const color = getRarityColor(a.itemRarity);
                  const statusMap = { active: '판매중', sold: '판매완료', cancelled: '취소됨' } as const;
                  const statusColorMap = { active: '#81c784', sold: '#4fc3f7', cancelled: '#ef5350' };
                  const sc = statusColorMap[a.status] ?? '#aaa';
                  return (
                    <div key={a.id} className={styles.mineCard} style={{ borderColor: color + '44' }}>
                      <div className={styles.mineLeft}>
                        <div className={styles.mineImgWrap}>
                          <img src={photoUrlForDisplay(a.itemImage)} alt={a.itemName} className={styles.mineImg}
                            onError={(e) => { handlePhotoImgErrorThenHide(e, a.itemImage); }} />
                          <div className={styles.mineRarityDot} style={{ background: color }} />
                        </div>
                        <div>
                          <div className={styles.mineName}>{a.itemName}</div>
                          <div className={styles.mineRarity} style={{ color }}>{RARITY_LABEL[a.itemRarity]}</div>
                          <div className={styles.mineValue}>생산량 {a.individualValue}</div>
                        </div>
                      </div>
                      <div className={styles.mineRight}>
                        <div className={styles.minePrice}>🪙 {a.price.toLocaleString()}</div>
                        <div className={styles.mineStatus} style={{ color: sc, borderColor: sc + '55' }}>
                          {statusMap[a.status]}
                        </div>
                        {a.status === 'sold' && a.buyerLogin && (
                          <div className={styles.mineBuyer}>→ {a.buyerLogin}</div>
                        )}
                        {a.status === 'active' && (
                          <button
                            className={styles.cancelBtn}
                            onClick={() => handleCancel(a.id, a.itemName)}
                            disabled={cancelling === a.id}
                          >
                            {cancelling === a.id ? '취소 중…' : '취소'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </>
      )}

      {/* List modal */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={() => setModalOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>📦 카드 등록</span>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <p className={styles.modalDesc}>카드 1장이 도감에서 차감됩니다.</p>

            {/* Card grid picker */}
            <div className={styles.modalPickerLabel}>등록할 카드 선택</div>
            <div className={styles.modalPickerScroll}>
              {RARITY_ORDER.map(rarity => {
                const items = ownedItems.filter(i => i.rarity === rarity);
                if (items.length === 0) return null;
                const color = getRarityColor(rarity);
                return (
                  <div key={rarity} className={styles.pickerGroup}>
                    <div className={styles.pickerGroupLabel} style={{ color }}>{RARITY_LABEL[rarity]}</div>
                    <div className={styles.pickerRow}>
                      {items.map(item => {
                        const selected = sellItemId === item.id;
                        return (
                          <button
                            key={item.id}
                            className={`${styles.pickerChip} ${selected ? styles.pickerChipSelected : ''}`}
                            style={selected ? { borderColor: color, boxShadow: `0 0 10px ${color}66` } : { borderColor: color + '44' }}
                            onClick={() => setSellItemId(item.id)}
                          >
                            <img src={photoUrlForDisplay(item.image)} alt={item.name} className={styles.chipImg}
                              onError={(e) => { handlePhotoImgErrorThenHide(e, item.image); }} />
                            <div className={styles.chipName}>{item.name}</div>
                            <div className={styles.chipCount} style={{ color }}>×{item.count}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {ownedItems.length === 0 && (
                <div className={styles.modalEmpty}>보유한 카드가 없습니다</div>
              )}
            </div>

            {/* Selected card preview */}
            {sellItemId && (() => {
              const item = collectedItems.get(sellItemId)!;
              const color = getRarityColor(item.rarity);
              return (
                <div className={styles.previewBar} style={{ borderColor: color + '55' }}>
                  <img src={photoUrlForDisplay(item.image)} alt={item.name} className={styles.previewImg}
                    onError={(e) => { handlePhotoImgErrorThenHide(e, item.image); }} />
                  <div>
                    <div className={styles.previewName}>{item.name}</div>
                    <div style={{ color, fontSize: 11 }}>{RARITY_LABEL[item.rarity]} · 생산량 {item.individualValue}</div>
                    <div className={styles.previewCount}>보유 {item.count}장</div>
                  </div>
                </div>
              );
            })()}

            {/* Price */}
            <div className={styles.modalPickerLabel} style={{ marginTop: 16 }}>판매 가격</div>
            <div className={styles.pricePresets}>
              {PRICE_PRESETS.map(p => (
                <button
                  key={p}
                  className={`${styles.pricePreset} ${sellPrice === p ? styles.pricePresetActive : ''}`}
                  onClick={() => setSellPrice(p)}
                >
                  {p.toLocaleString()}
                </button>
              ))}
            </div>
            <div className={styles.priceInputRow}>
              <span className={styles.priceIcon}>🪙</span>
              <input
                type="number" min={1} value={sellPrice}
                onChange={e => setSellPrice(Math.max(1, parseInt(e.target.value) || 1))}
                className={styles.priceInput}
              />
              <span className={styles.priceUnit}>코인</span>
            </div>

            <button
              className={styles.submitBtn}
              onClick={handleSell}
              disabled={selling || !sellItemId}
            >
              {selling ? '등록 중…' : `🏪 ${sellPrice.toLocaleString()} 코인에 등록`}
            </button>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
