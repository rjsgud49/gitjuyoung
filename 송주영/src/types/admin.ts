export interface GachaEvent {
  id: string;
  name: string;
  type: 'pull_discount' | 'coin_multiplier';
  value: number;
  description: string;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'event' | 'warning' | 'update';
  createdAt: string;
  isPinned: boolean;
}
