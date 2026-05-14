import { useState, useEffect } from 'react';
import type { GachaItem, GachaResult, CollectedItem } from '../types';
import { simulateGacha, getRarityColor, getRarityLabel } from '../utils/gachaUtils';
import { photoUrlForDisplay, handlePhotoImgError } from '../utils/photoUrl';
import styles from '../styles/GachaMachine.module.css';

const GACHA_NO_IMG_100 =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ccc" width="100" height="100"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%23999"%3ENo Image%3C/text%3E%3C/svg%3E';
const GACHA_NO_IMG_200 =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ccc" width="200" height="200"/%3E%3Ctext x="100" y="100" text-anchor="middle" dy=".3em" fill="%23999"%3ENo Image%3C/text%3E%3C/svg%3E';

interface GachaMachineProps {
  items: GachaItem[];
  onGachaPull: (result: GachaResult) => void;
  collectedItems: Map<string, CollectedItem>;
}

export const GachaMachine: React.FC<GachaMachineProps> = ({
  items,
  onGachaPull,
  collectedItems,
}) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [displayItems, setDisplayItems] = useState<GachaItem[]>(items);
  const [resultItem, setResultItem] = useState<GachaResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  // 초기 아이템 배열 설정
  useEffect(() => {
    // 드럼에 보여줄 아이템 생성 (현실감을 위해 반복)
    const expanded = [];
    for (let i = 0; i < 3; i++) {
      expanded.push(...items);
    }
    setDisplayItems(expanded);
  }, [items]);

  const handlePull = async () => {
    if (isSpinning) return;

    setIsSpinning(true);
    setShowResult(false);

    // 뽑기 시뮬레이션
    const result = simulateGacha(items, collectedItems);
    setResultItem(result);

    // 회전 애니메이션 시간 (약 3초)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    setIsSpinning(false);
    setShowResult(true);

    // 결과를 부모 컴포넌트에 전달
    onGachaPull(result);

    // 5초 후 결과 숨기기
    await new Promise((resolve) => setTimeout(resolve, 5000));
    setShowResult(false);
  };

  const pullCost = 100; // 뽑기 비용 (재화)

  return (
    <div className={styles.machineContainer}>
      {/* 가챠 기계 본체 */}
      <div className={styles.gachaMachine}>
        {/* 상단 장식 */}
        <div className={styles.topDecoration}>
          <div className={styles.logo}>GACHA</div>
        </div>

        {/* 회전 드럼 */}
        <div className={styles.drumContainer}>
          <div className={styles.drumGlass}>
            <div
              className={styles.drum}
              style={{
                animation: isSpinning
                  ? 'spin 0.3s linear infinite'
                  : 'none',
              }}
            >
              {displayItems.map((item, index) => (
                <div
                  key={index}
                  className={styles.drumItem}
                  style={{
                    transform: `rotateX(${(index * 360) / displayItems.length}deg) translateZ(180px)`,
                  }}
                >
                  <img
                    src={photoUrlForDisplay(item.image)}
                    alt={item.name}
                    className={styles.itemImage}
                    onError={e => handlePhotoImgError(e, item.image, GACHA_NO_IMG_100)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 선택 포인터 */}
          <div className={styles.pointer}></div>
        </div>

        {/* 정보 표시 */}
        <div className={styles.infoPanel}>
          <div className={styles.infoRow}>
            <span className={styles.label}>뽑기 비용:</span>
            <span className={styles.value}>{pullCost}원</span>
          </div>
        </div>

        {/* 버튼 */}
        <button
          className={`${styles.pullButton} ${isSpinning ? styles.disabled : ''}`}
          onClick={handlePull}
          disabled={isSpinning}
        >
          {isSpinning ? '뽑는 중...' : '뽑기'}
        </button>
      </div>

      {/* 결과 모달 */}
      {showResult && resultItem && (
        <div className={styles.resultModal}>
          <div 
            className={styles.resultContainer}
            style={resultItem.item.resultCardImage ? {
              backgroundImage: `url('${resultItem.item.resultCardImage}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            } : {}}
          >
            <div className={styles.resultContent}>
              {resultItem.isNew && (
                <div className={styles.newItemBadge}>🎉 신규 획득! 🎉</div>
              )}

              <div className={styles.resultImage}>
                <img
                  src={photoUrlForDisplay(resultItem.item.image)}
                  alt={resultItem.item.name}
                  onError={e => handlePhotoImgError(e, resultItem.item.image, GACHA_NO_IMG_200)}
                />
              </div>

              <div className={styles.resultInfo}>
                <h2>{resultItem.item.name}</h2>
                <div
                  className={styles.rarityBadge}
                  style={{
                    backgroundColor: getRarityColor(resultItem.item.rarity),
                  }}
                >
                  {getRarityLabel(resultItem.item.rarity)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 반사 효과 */}
      <style>{`
        @keyframes spin {
          from {
            transform: rotateX(0deg);
          }
          to {
            transform: rotateX(360deg);
          }
        }
      `}</style>
    </div>
  );
};
