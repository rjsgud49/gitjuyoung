import { useState, useEffect, useRef } from 'react';
import type { Announcement } from '../types/admin';
import { fetchActivity } from '../api/gameApi';
import type { ActivityEntry } from '../api/gameApi';
import { getRarityColor, getRarityLabel } from '../utils/gachaUtils';
import styles from '../styles/GachaSidePanel.module.css';

// ── Activity feed (left panel) ────────────────────────────────────────────────

interface ActivityFeedProps {
  githubToken: string | null;
}

export function ActivityFeed({ githubToken }: ActivityFeedProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const data = await fetchActivity();
      setEntries(data);
    } catch {}
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const timeAgo = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}초 전`;
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    return `${Math.floor(diff / 3600)}시간 전`;
  };

  return (
    <aside className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelIcon}>🎰</span>
        <span>뽑기 피드</span>
      </div>
      <div className={styles.feedList} ref={listRef}>
        {entries.length === 0 ? (
          <div className={styles.feedEmpty}>아직 활동이 없습니다</div>
        ) : (
          entries.map((e, i) => {
            const color = getRarityColor(e.itemRarity);
            return (
              <div key={i} className={styles.feedEntry}>
                <div
                  className={styles.feedDot}
                  style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                />
                <div className={styles.feedText}>
                  <span className={styles.feedLogin}>{e.login}</span>
                  <span className={styles.feedVerb}>님이</span>
                  <span className={styles.feedItem} style={{ color }}>
                    {e.itemName}
                  </span>
                  <span className={styles.feedRarity} style={{ color }}>
                    ({getRarityLabel(e.itemRarity)})
                  </span>
                  <span className={styles.feedVerb}>획득!</span>
                </div>
                <div className={styles.feedTime}>{timeAgo(e.timestamp)}</div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

// ── Announcements panel (right panel) ────────────────────────────────────────

interface AnnouncementsPanelProps {
  announcements: Announcement[];
}

const TYPE_ICON: Record<string, string> = {
  info: 'ℹ️', event: '🎉', warning: '⚠️', update: '🔄',
};
const TYPE_COLOR: Record<string, string> = {
  info: '#4fc3f7', event: '#ffb74d', warning: '#ef5350', update: '#81c784',
};

export function AnnouncementsPanel({ announcements }: AnnouncementsPanelProps) {
  const pinned   = announcements.filter(a => a.isPinned);
  const regular  = announcements.filter(a => !a.isPinned);
  const displayed = [...pinned, ...regular].slice(0, 20);

  return (
    <aside className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelIcon}>📢</span>
        <span>공지 / 이벤트</span>
      </div>
      <div className={styles.announceList}>
        {displayed.length === 0 ? (
          <div className={styles.feedEmpty}>공지사항이 없습니다</div>
        ) : (
          displayed.map(a => {
            const color = TYPE_COLOR[a.type] ?? '#aaa';
            return (
              <div key={a.id} className={`${styles.announceCard} ${a.isPinned ? styles.announceCardPinned : ''}`}>
                <div className={styles.announceTop}>
                  <span className={styles.announceIcon}>{TYPE_ICON[a.type] ?? '📌'}</span>
                  {a.isPinned && <span className={styles.pinBadge}>고정</span>}
                  <span className={styles.announceType} style={{ color }}>{a.type.toUpperCase()}</span>
                </div>
                <div className={styles.announceTitle}>{a.title}</div>
                <div className={styles.announceContent}>{a.content}</div>
                <div className={styles.announceDate}>
                  {new Date(a.createdAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
