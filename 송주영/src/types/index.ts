export interface GachaItem {
  id: string;
  name: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  image: string;
  probability: number;
}

export interface CollectedItem extends GachaItem {
  count: number;
  firstAcquiredAt: Date;
}

export interface GachaResult {
  item: GachaItem;
  isNew: boolean;
  timestamp: Date;
}

export interface CollectionState {
  items: Map<string, CollectedItem>;
  totalPulls: number;
  totalItems: number;
}

export interface CoinState {
  balance: number;
  totalEarned: number;
  totalSpent: number;
}
