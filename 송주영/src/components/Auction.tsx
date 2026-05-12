import { useState, useEffect, useCallback } from 'react';
import type { CollectedItem } from '../types';
import {
  fetchAuctions, fetchMyAuctions, postCreateAuction, deleteAuction, postBuyAuction,
} from '../api/gameApi';
import type { AuctionEntry } from '../api/gameApi';
import { getRarityColor, getRarityLabel } from '../utils/gachaUtils';
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

type Tab = 'market' | 'mine' | 'sell';

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'common'] as const;
const RARITY_LABEL: Record<string, string> = {
  legendary: '전설', epic: '에픽', rare: '레어', common: '일반',
};

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

  // Sell form state
  const [sellItemId, setSellItemId] = useState('');
  const [sellPrice, setSellPrice] = useState(100);
  const [selling, setSelling] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadMarket = useCallback(async () => {
    if (!backendConnected) return;
    setLoading(true);
    try {
      const data = await fetchAuctions();
      setMarket(data);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '로드 실패'}`);
    } finally { setLoading(false); }
  }, [backendConnected]);

  const loadMine = useCallback(async () => {
    if (!githubToken || !backendConnected) return;
    setLoading(true);
    try {
      const data = await fetchMyAuctions(githubToken);
      setMyListings(data);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '로드 실패'}`);
    } finally { setLoading(false); }
  }, [githubToken, backendConnected]);

  useEffect(() => {
    if (backendConnected) {
      loadMarket();
      if (githubToken) loadMine();
    }
  }, [backendConnected, githubToken, loadMarket, loadMine]);

  const handleBuy = async (auction: AuctionEntry) => {
    if (!githubToken || buying) return;
    if (!confirm(`🪙 ${auction.price.toLocaleString()} 코인으로 "${auction.itemName}" 구매?`)) return;
    setBuying(auction.id);
    try {
      const { coinsSpent } = await postBuyAuction(githubToken, auction.id);
      onCoinsChange(coins - coinsSpent);
      // Add card to local collection
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
      showToast(`✅ ${auction.itemName} 구매 완료! (-${coinsSpent.toLocaleString()} 코인)`);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '구매 실패'}`);
    } finally { setBuying(null); }
  };

  const handleCancel = async (auctionId: number) => {
    if (!githubToken || cancelling) return;
    if (!confirm('경매를 취소하면 카드가 반환됩니다. 취소하시겠어요?')) return;
    setCancelling(auctionId);
    try {
      await deleteAuction(githubToken, auctionId);
      setMyListings(prev => prev.map(a => a.id === auctionId ? { ...a, status: 'cancelled' } : a));
      // Re-fetch market list too
      loadMarket();
      showToast('🔄 경매 취소됨 — 카드가 도감에 반환됩니다');
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '취소 실패'}`);
    } finally { setCancelling(null); }
  };

  const handleSell = async () => {
    if (!githubToken || selling || !sellItemId) return;
    const item = collectedItems.get(sellItemId);
    if (!item) { showToast('카드를 선택해주세요'); return; }
    if (sellPrice < 1) { showToast('가격을 1 이상으로 설정해주세요'); return; }
    if (!confirm(`"${item.name}"을(를) ${sellPrice.toLocaleString()} 코인에 올리겠습니까?\n카드 1장이 도감에서 차감됩니다.`)) return;
    setSelling(true);
    try {
      await postCreateAuction(
        githubToken,
        { itemId: item.id, itemName: item.name, itemRarity: item.rarity, itemImage: item.image, individualValue: item.individualValue },
        sellPrice
      );
      // Deduct from local collection
      const updated = new Map(collectedItems);
      if (item.count <= 1) {
        updated.delete(item.id);
      } else {
        updated.set(item.id, { ...item, count: item.count - 1 });
      }
      onCollectedItemsChange(updated);
      setSellItemId('');
      loadMarket();
      loadMine();
      setTab('mine');
      showToast(`📦 ${item.name} 등록 완료!`);
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : '등록 실패'}`);
    } finally { setSelling(false); }
  };

  if (!githubToken) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🏪</div>
          <div>GitHub 로그인 후 경매를 이용할 수 있습니다</div>
        </div>
      </div>
    );
  }

  // Owned items with at least 1 copy (can list)
  const ownedItems = Array.from(collectedItems.values())
    .sort((a, b) => {
      const ro = { legendary: 0, epic: 1, rare: 2, common: 3 };
      return (ro[a.rarity] ?? 4) - (ro[b.rarity] ?? 4) || a.name.localeCompare(b.name, 'ko');
    });

  const activeMarket = market.filter(a => a.status === 'active');

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>🏪 카드 경매장</div>
        <div className={styles.sub}>카드를 올리면 다른 유저가 구매합니다</div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'market' ? styles.tabActive : ''}`} onClick={() => { setTab('market'); loadMarket(); }}>
          시장 ({activeMarket.length})
        </button>
        <button className={`${styles.tab} ${tab === 'mine' ? styles.tabActive : ''}`} onClick={() => { setTab('mine'); loadMine(); }}>
          내 경매
        </button>
        <button className={`${styles.tab} ${tab === 'sell' ? styles.tabActive : ''}`} onClick={() => setTab('sell')}>
          + 등록하기
        </button>
      </div>

      {/* Content */}
      {loading && tab !== 'sell' && (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      )}

      {/* Market tab */}
      {tab === 'market' && !loading && (
        <div className={styles.grid}>
          {activeMarket.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>🏪</div>
              <div>등록된 카드가 없습니다</div>
            </div>
          ) : (
            activeMarket.map(a => {
              const color = getRarityColor(a.itemRarity);
              const isSelf = a.sellerLogin === githubLogin?.toLowerCase();
              const canAfford = coins >= a.price;
              return (
                <div key={a.id} className={styles.card} style={{ '--rarity-color': color } as React.CSSProperties}>
                  <div className={styles.cardRarityBar} style={{ background: color }} />
                  <img src={a.itemImage} alt={a.itemName} className={styles.cardImg}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }} />
                  <div className={styles.cardName}>{a.itemName}</div>
                  <div className={styles.cardRarity} style={{ color }}>{RARITY_LABEL[a.itemRarity]}</div>
                  <div className={styles.cardProduction}>생산량 {a.individualValue}</div>
                  <div className={styles.cardSeller}>판매자: {a.sellerLogin}</div>
                  <div className={styles.cardPrice}>🪙 {a.price.toLocaleString()}</div>
                  {isSelf ? (
                    <div className={styles.cardSelfTag}>내 카드</div>
                  ) : (
                    <button
                      className={`${styles.buyBtn} ${!canAfford ? styles.buyBtnDisabled : ''}`}
                      onClick={() => handleBuy(a)}
                      disabled={!!buying || !canAfford}
                    >
                      {buying === a.id ? '구매 중…' : canAfford ? '구매하기' : '코인 부족'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* My listings tab */}
      {tab === 'mine' && !loading && (
        <div className={styles.grid}>
          {myListings.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>📦</div>
              <div>등록한 경매가 없습니다</div>
            </div>
          ) : (
            myListings.map(a => {
              const color = getRarityColor(a.itemRarity);
              const statusLabel = { active: '판매중', sold: '판매완료', cancelled: '취소됨' }[a.status] ?? '';
              const statusColor = { active: '#81c784', sold: '#4fc3f7', cancelled: '#ef5350' }[a.status] ?? '#aaa';
              return (
                <div key={a.id} className={styles.card} style={{ '--rarity-color': color } as React.CSSProperties}>
                  <div className={styles.cardRarityBar} style={{ background: color }} />
                  <img src={a.itemImage} alt={a.itemName} className={styles.cardImg}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }} />
                  <div className={styles.cardName}>{a.itemName}</div>
                  <div className={styles.cardRarity} style={{ color }}>{RARITY_LABEL[a.itemRarity]}</div>
                  <div className={styles.cardProduction}>생산량 {a.individualValue}</div>
                  <div className={styles.cardPrice}>🪙 {a.price.toLocaleString()}</div>
                  <div className={styles.statusBadge} style={{ color: statusColor, borderColor: statusColor + '44' }}>
                    {statusLabel}
                  </div>
                  {a.status === 'active' && (
                    <button
                      className={styles.cancelBtn}
                      onClick={() => handleCancel(a.id)}
                      disabled={cancelling === a.id}
                    >
                      {cancelling === a.id ? '취소 중…' : '취소하기'}
                    </button>
                  )}
                  {a.status === 'sold' && a.buyerLogin && (
                    <div className={styles.buyerTag}>구매자: {a.buyerLogin}</div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Sell tab */}
      {tab === 'sell' && (
        <div className={styles.sellForm}>
          <div className={styles.sellTitle}>📦 카드 등록</div>
          <p className={styles.sellDesc}>카드 1장이 도감에서 차감되어 경매에 올라갑니다.</p>

          <div className={styles.sellSection}>
            <label className={styles.sellLabel}>등록할 카드 선택</label>
            <div className={styles.itemGrid}>
              {RARITY_ORDER.map(rarity => {
                const items = ownedItems.filter(i => i.rarity === rarity);
                if (items.length === 0) return null;
                const color = getRarityColor(rarity);
                return (
                  <div key={rarity} className={styles.itemGroup}>
                    <div className={styles.itemGroupLabel} style={{ color }}>{getRarityLabel(rarity)}</div>
                    <div className={styles.itemRow}>
                      {items.map(item => (
                        <button
                          key={item.id}
                          className={`${styles.itemChip} ${sellItemId === item.id ? styles.itemChipSelected : ''}`}
                          style={sellItemId === item.id ? { borderColor: color, background: color + '22' } : { borderColor: color + '44' }}
                          onClick={() => setSellItemId(item.id)}
                        >
                          <img src={item.image} alt={item.name} className={styles.itemChipImg}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }} />
                          <span className={styles.itemChipName}>{item.name}</span>
                          <span className={styles.itemChipCount}>×{item.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {sellItemId && (() => {
            const item = collectedItems.get(sellItemId);
            if (!item) return null;
            const color = getRarityColor(item.rarity);
            return (
              <div className={styles.sellPreview} style={{ borderColor: color + '55' }}>
                <img src={item.image} alt={item.name} className={styles.previewImg}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }} />
                <div>
                  <div className={styles.previewName}>{item.name}</div>
                  <div style={{ color, fontSize: 12 }}>{getRarityLabel(item.rarity)}</div>
                  <div className={styles.previewValue}>생산량 {item.individualValue}</div>
                  <div className={styles.previewCount}>보유 {item.count}장</div>
                </div>
              </div>
            );
          })()}

          <div className={styles.sellSection}>
            <label className={styles.sellLabel}>판매 가격 (코인)</label>
            <div className={styles.priceRow}>
              {[50, 100, 200, 500, 1000, 2000].map(p => (
                <button
                  key={p}
                  className={`${styles.pricePreset} ${sellPrice === p ? styles.pricePresetActive : ''}`}
                  onClick={() => setSellPrice(p)}
                >
                  {p.toLocaleString()}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              value={sellPrice}
              onChange={e => setSellPrice(Math.max(1, parseInt(e.target.value) || 1))}
              className={styles.priceInput}
            />
          </div>

          <button
            className={styles.submitBtn}
            onClick={handleSell}
            disabled={selling || !sellItemId}
          >
            {selling ? '등록 중…' : `🪙 ${sellPrice.toLocaleString()} 코인에 등록하기`}
          </button>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
