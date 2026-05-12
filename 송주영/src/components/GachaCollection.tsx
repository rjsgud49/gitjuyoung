import { useMemo } from 'react';
import type { CollectedItem } from '../types';
import { getRarityColor, getRarityLabel } from '../utils/gachaUtils';
import styles from '../styles/GachaCollection.module.css';

interface GachaCollectionProps {
  collectedItems: Map<string, CollectedItem>;
  totalItems: number;
}

export const GachaCollection: React.FC<GachaCollectionProps> = ({
  collectedItems,
  totalItems,
}) => {
  // 희귀도별로 정렬된 아이템
  const sortedItems = useMemo(() => {
    const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
    return Array.from(collectedItems.values()).sort((a, b) => {
      const rarityDiff =
        rarityOrder[a.rarity as keyof typeof rarityOrder] -
        rarityOrder[b.rarity as keyof typeof rarityOrder];
      if (rarityDiff !== 0) return rarityDiff;
      return a.name.localeCompare(b.name);
    });
  }, [collectedItems]);

  const completionRate = totalItems > 0 ? (collectedItems.size / totalItems) * 100 : 0;

  // 희귀도별 통계
  const stats = useMemo(() => {
    const stat = {
      legendary: 0,
      epic: 0,
      rare: 0,
      common: 0,
    };
    collectedItems.forEach((item) => {
      stat[item.rarity]++;
    });
    return stat;
  }, [collectedItems]);

  return (
    <div className={styles.collectionContainer}>
      <div className={styles.header}>
        <h1>📖 도감</h1>
        <div className={styles.progressInfo}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${completionRate}%` }}
            ></div>
          </div>
          <div className={styles.progressText}>
            {collectedItems.size} / {totalItems} ({completionRate.toFixed(1)}%)
          </div>
        </div>
      </div>

      {/* 통계 섹션 */}
      <div className={styles.statsSection}>
        <div className={styles.statItem}>
          <div
            className={styles.statColor}
            style={{ backgroundColor: getRarityColor('legendary') }}
          ></div>
          <div className={styles.statLabel}>{getRarityLabel('legendary')}</div>
          <div className={styles.statCount}>{stats.legendary}</div>
        </div>
        <div className={styles.statItem}>
          <div
            className={styles.statColor}
            style={{ backgroundColor: getRarityColor('epic') }}
          ></div>
          <div className={styles.statLabel}>{getRarityLabel('epic')}</div>
          <div className={styles.statCount}>{stats.epic}</div>
        </div>
        <div className={styles.statItem}>
          <div
            className={styles.statColor}
            style={{ backgroundColor: getRarityColor('rare') }}
          ></div>
          <div className={styles.statLabel}>{getRarityLabel('rare')}</div>
          <div className={styles.statCount}>{stats.rare}</div>
        </div>
        <div className={styles.statItem}>
          <div
            className={styles.statColor}
            style={{ backgroundColor: getRarityColor('common') }}
          ></div>
          <div className={styles.statLabel}>{getRarityLabel('common')}</div>
          <div className={styles.statCount}>{stats.common}</div>
        </div>
      </div>

      {/* 아이템 그리드 */}
      <div className={styles.itemsGrid}>
        {sortedItems.length > 0 ? (
          sortedItems.map((item) => (
            <div
              key={item.id}
              className={styles.collectionItem}
              style={{
                borderColor: getRarityColor(item.rarity),
              }}
            >
              <div className={styles.itemImageContainer}>
                <img
                  src={item.image}
                  alt={item.name}
                  className={styles.itemImage}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="150" height="150"%3E%3Crect fill="%23ddd" width="150" height="150"/%3E%3C/svg%3E';
                  }}
                />
              </div>

              <div className={styles.itemDetails}>
                <h3 className={styles.itemName}>{item.name}</h3>
                <div
                  className={styles.rarityTag}
                  style={{
                    backgroundColor: getRarityColor(item.rarity),
                  }}
                >
                  {getRarityLabel(item.rarity)}
                </div>
                <div className={styles.itemStats}>
                  <div className={styles.stat}>
                    <span className={styles.label}>보유:</span>
                    <span className={styles.value}>{item.count}</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.label}>획득:</span>
                    <span className={styles.value}>
                      {item.firstAcquiredAt.toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🎮</div>
            <p>아직 수집한 아이템이 없습니다.</p>
            <p>가챠를 뽑아보세요!</p>
          </div>
        )}
      </div>
    </div>
  );
};
