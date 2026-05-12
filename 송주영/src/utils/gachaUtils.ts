import type { GachaItem, GachaResult, CollectedItem } from '../types';

/**
 * 가중치에 따라 아이템을 선택합니다
 */
export function getRandomItemByProbability(items: GachaItem[]): GachaItem {
  const totalProbability = items.reduce((sum, item) => sum + item.probability, 0);
  let random = Math.random() * totalProbability;

  for (const item of items) {
    random -= item.probability;
    if (random <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
}

/**
 * 가챠 뽑기를 시뮬레이션합니다
 */
export function simulateGacha(
  items: GachaItem[],
  collectionMap: Map<string, CollectedItem>
): GachaResult {
  const selectedItem = getRandomItemByProbability(items);
  const isNew = !collectionMap.has(selectedItem.id);

  return {
    item: selectedItem,
    isNew,
    timestamp: new Date(),
  };
}

/**
 * 도감에 아이템을 추가하거나 업데이트합니다
 */
export function addItemToCollection(
  item: GachaItem,
  collectionMap: Map<string, CollectedItem>
): Map<string, CollectedItem> {
  const newCollection = new Map(collectionMap);
  const existingItem = newCollection.get(item.id);

  if (existingItem) {
    existingItem.count++;
  } else {
    newCollection.set(item.id, {
      ...item,
      count: 1,
      firstAcquiredAt: new Date(),
    });
  }

  return newCollection;
}

/**
 * 희귀도에 따른 색상을 반환합니다
 */
export function getRarityColor(rarity: string): string {
  const colors: { [key: string]: string } = {
    common: '#808080',
    rare: '#4169E1',
    epic: '#9932CC',
    legendary: '#FFD700',
  };
  return colors[rarity] || '#808080';
}

/**
 * 희귀도에 따른 라벨을 반환합니다
 */
export function getRarityLabel(rarity: string): string {
  const labels: { [key: string]: string } = {
    common: '일반',
    rare: '레어',
    epic: '에픽',
    legendary: '전설',
  };
  return labels[rarity] || '일반';
}

/**
 * 랜덤 지연을 생성합니다 (밀리초)
 */
export function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
