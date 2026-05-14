import { useMemo, useState } from 'react';
import type { GachaItem, CollectedItem, Rarity } from '../types';
import { getRarityColor, getRarityLabel } from '../utils/gachaUtils';
import styles from '../styles/GachaCollection.module.css';

type FilterType = 'all' | 'legendary' | 'epic' | 'rare' | 'common' | 'special' | 'collected' | 'uncollected';

interface GachaCollectionProps {
  collectedItems: Map<string, CollectedItem>;
  gachaItems: GachaItem[];
}

const RARITY_ORDER: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3, special: 4 };

const FILTER_LABELS: Record<FilterType, string> = {
  all: '전체',
  legendary: '전설',
  epic: '에픽',
  rare: '레어',
  common: '일반',
  special: '✨스페셜',
  collected: '수집됨',
  uncollected: '미수집',
};

export const GachaCollection: React.FC<GachaCollectionProps> = ({
  collectedItems,
  gachaItems,
}) => {
  const [filter, setFilter] = useState<FilterType>('all');

  // 스페셜 카드 (gacha pool에 없는 수집 카드 — 합성 결과)
  const specialItems = useMemo(() => {
    const gachaIds = new Set(gachaItems.map(i => i.id));
    const result: GachaItem[] = [];
    collectedItems.forEach((it, id) => {
      if (!gachaIds.has(id)) {
        result.push({ id: it.id, name: it.name, rarity: it.rarity, image: it.image, probability: 0 });
      }
    });
    return result;
  }, [collectedItems, gachaItems]);

  const allItems = useMemo(() => {
    return [...gachaItems, ...specialItems].sort((a, b) =>
      (RARITY_ORDER[a.rarity] ?? 5) - (RARITY_ORDER[b.rarity] ?? 5) ||
      a.name.localeCompare(b.name, 'ko')
    );
  }, [gachaItems, specialItems]);

  const filtered = useMemo(() => {
    return allItems.filter(item => {
      const has = collectedItems.has(item.id);
      if (filter === 'collected')   return has;
      if (filter === 'uncollected') return !has;
      if (filter === 'all')         return true;
      return item.rarity === filter;
    });
  }, [allItems, collectedItems, filter]);

  const stats = useMemo(() => {
    const s: Record<string, number> = { legendary: 0, epic: 0, rare: 0, common: 0, special: 0 };
    collectedItems.forEach(it => { s[it.rarity] = (s[it.rarity] ?? 0) + 1; });
    return s;
  }, [collectedItems]);

  const total = allItems.length;
  const collected = collectedItems.size;
  const pct = total > 0 ? (collected / total) * 100 : 0;
  const hasSpecial = specialItems.length > 0;

  return (
    <div className={styles.bookPage}>
      {/* Book cover header */}
      <div className={styles.bookCover}>
        <div className={styles.bookOrnamentTop}>✦ ── ✦ ── ✦</div>
        <h1 className={styles.bookTitle}>주영 도감</h1>
        <div className={styles.bookSubtitle}>Codex Juyoung</div>
        <div className={styles.bookOrnamentBot}>✦ ── ✦ ── ✦</div>

        <div className={styles.scrollContainer}>
          <div className={styles.scrollTrack}>
            <div className={styles.scrollFill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.scrollText}>
            {collected} / {total} 수집 ({pct.toFixed(1)}%)
          </div>
        </div>

        <div className={styles.statsRow}>
          {(['legendary', 'epic', 'rare', 'common'] as Rarity[]).map(r => (
            <div key={r} className={styles.statChip} style={{ borderColor: getRarityColor(r) + '66' }}>
              <span className={styles.statDot} style={{ background: getRarityColor(r) }} />
              <span className={styles.statLabel}>{getRarityLabel(r)}</span>
              <span className={styles.statCount} style={{ color: getRarityColor(r) }}>
                {stats[r] ?? 0}
              </span>
            </div>
          ))}
          {stats.special > 0 && (
            <div className={styles.statChip} style={{ borderColor: getRarityColor('special') + '66' }}>
              <span className={styles.statDot} style={{ background: getRarityColor('special') }} />
              <span className={styles.statLabel}>스페셜</span>
              <span className={styles.statCount} style={{ color: getRarityColor('special') }}>
                {stats.special}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className={styles.filterRow}>
        {(Object.keys(FILTER_LABELS) as FilterType[])
          .filter(f => f !== 'special' || hasSpecial)
          .map(f => (
            <button
              key={f}
              className={`${styles.filterTab} ${filter === f ? styles.filterTabActive : ''}`}
              style={filter === f && ['legendary','epic','rare','common','special'].includes(f)
                ? { color: getRarityColor(f), borderColor: getRarityColor(f) + '88' }
                : {}}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
      </div>

      {/* Item grid */}
      <div className={styles.grid}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyGlyph}>⊕</div>
            <div>해당 항목이 없습니다</div>
          </div>
        ) : (
          filtered.map(item => {
            const owned = collectedItems.get(item.id);
            const color = getRarityColor(item.rarity);
            if (owned) {
              const isSpecial = item.rarity === 'special';
              return (
                <div
                  key={item.id}
                  className={`${styles.card} ${isSpecial ? styles.cardSpecial : ''}`}
                  style={{ '--rarity-color': color } as React.CSSProperties}
                >
                  <div className={styles.cardCornerTL} />
                  <div className={styles.cardCornerTR} />
                  {isSpecial && <div className={styles.specialGlow} />}
                  <div className={styles.cardImageWrap}>
                    <img
                      src={owned.image}
                      alt={owned.name}
                      className={styles.cardImage}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="120"%3E%3Crect fill="%23221500" width="120" height="120"/%3E%3C/svg%3E';
                      }}
                    />
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardName}>{owned.name}</div>
                    <div className={styles.cardRarityTag} style={{ color, borderColor: color + '55' }}>
                      {isSpecial && '✨ '}{getRarityLabel(owned.rarity)}
                    </div>
                    <div className={styles.cardStats}>
                      <div className={styles.cardStat}>
                        <span className={styles.cardStatLabel}>보유</span>
                        <span className={styles.cardStatValue}>{owned.count}</span>
                      </div>
                      <div className={styles.cardStat}>
                        <span className={styles.cardStatLabel}>생산량</span>
                        <span className={styles.cardStatValue} style={{ color }}>{owned.individualValue.toFixed(2)}</span>
                      </div>
                      <div className={styles.cardStat}>
                        <span className={styles.cardStatLabel}>획득일</span>
                        <span className={styles.cardStatValue}>
                          {owned.firstAcquiredAt.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.cardCornerBL} />
                  <div className={styles.cardCornerBR} />
                </div>
              );
            }

            // Uncollected (special은 미수집 표시 안 함)
            if (item.rarity === 'special') return null;
            return (
              <div key={item.id} className={`${styles.card} ${styles.cardUnknown}`} style={{ '--rarity-color': color } as React.CSSProperties}>
                <div className={styles.cardCornerTL} />
                <div className={styles.cardCornerTR} />
                <div className={styles.cardImageWrap}>
                  <div className={styles.unknownSilhouette}>?</div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardName} style={{ color: 'rgba(200,160,80,0.25)' }}>???</div>
                  <div className={styles.cardRarityTag} style={{ color: color + '55', borderColor: color + '33' }}>
                    {getRarityLabel(item.rarity)}
                  </div>
                  <div className={styles.unknownText}>미수집</div>
                </div>
                <div className={styles.cardCornerBL} />
                <div className={styles.cardCornerBR} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
