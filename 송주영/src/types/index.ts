export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'special';

export interface GachaItem {
  id: string;
  name: string;
  rarity: Rarity;
  image: string;
  resultCardImage?: string;
  probability: number;
}

export interface SynthesisIngredient {
  itemId: string;
  itemName: string;
  count: number;
}

export interface SynthesisRecipe {
  id: string;
  name: string;
  resultItemId: string;
  resultItemName: string;
  resultItemRarity: Rarity;
  resultItemImage: string;
  ingredients: SynthesisIngredient[];
}

export interface CollectedItem extends GachaItem {
  count: number;
  firstAcquiredAt: Date;
  individualValue: number; // 생산량 — 카드 고유 생산력 수치
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
