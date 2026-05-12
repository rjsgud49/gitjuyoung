import { useState, useEffect, useCallback } from 'react';
import type { GitHubProfile } from '../utils/githubUtils';
import {
  fetchGitHubCommitCount,
  clearToken,
  saveGitHubData,
  loadGitHubData,
  generateOAuthUrl,
} from '../utils/githubUtils';
import styles from '../styles/GitHubModal.module.css';

interface Props {
  isOpen:       boolean;
  onClose:      () => void;
  onCoinsAdded: (amount: number) => void;
  currentCoins: number;
  githubToken:  string | null;
  githubUser:   GitHubProfile | null;
  onLogout:     () => void;
  isLoading:    boolean;
}

type ModalView = 'login' | 'profile';

export const GitHubModal = ({
  isOpen, onClose, onCoinsAdded, currentCoins,
  githubToken, githubUser, onLogout, isLoading,
}: Props) => {
  const view: ModalView = githubToken && githubUser ? 'profile' : 'login';

  const [commitCount,  setCommitCount]  = useState<number | null>(null);
  const [loadingCoins, setLoadingCoins] = useState(false);
  const [alreadyToday, setAlreadyToday] = useState(false);
  const [coinGranted,  setCoinGranted]  = useState(false);

  useEffect(() => {
    if (!isOpen || view !== 'profile' || !githubUser) return;

    setCommitCount(null);
    setCoinGranted(false);

    const saved = loadGitHubData();
    const todayStr = new Date().toDateString();

    if (saved?.username === githubUser.login && new Date(saved.fetchedAt).toDateString() === todayStr) {
      setAlreadyToday(true);
      setCommitCount(saved.totalCommits);
    } else {
      setAlreadyToday(false);
      setLoadingCoins(true);
      fetchGitHubCommitCount(githubUser.login, githubToken)
        .then(n => setCommitCount(n))
        .catch(() => setCommitCount(0))
        .finally(() => setLoadingCoins(false));
    }
  }, [isOpen, view, githubUser, githubToken]);

  const handleReceive = useCallback(() => {
    if (!githubUser || commitCount === null || alreadyToday || coinGranted) return;
    const amount = Math.max(commitCount, 1);
    onCoinsAdded(amount);
    saveGitHubData({ username: githubUser.login, totalCommits: commitCount, fetchedAt: new Date().toISOString() });
    setAlreadyToday(true);
    setCoinGranted(true);
  }, [githubUser, commitCount, alreadyToday, coinGranted, onCoinsAdded]);

  const handleLogout = useCallback(() => {
    clearToken();
    onLogout();
    onClose();
  }, [onLogout, onClose]);

  const handleLogin = useCallback(() => {
    window.location.href = generateOAuthUrl();
  }, []);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        {/* ── LOGIN / LOADING VIEW ─────────────────────────────────────────── */}
        {view === 'login' && (
          <>
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <svg className={styles.ghIcon} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                <span className={styles.headerTitle}>GitHub 로그인</span>
              </div>
              <button className={styles.closeBtn} onClick={onClose}>✕</button>
            </div>

            <div className={styles.body}>
              {isLoading ? (
                <div className={styles.oauthLoading}>
                  <span className={styles.spinnerLg} />
                  <span>GitHub 인증 중…</span>
                </div>
              ) : (
                <>
                  <div className={styles.loginHero}>
                    <svg viewBox="0 0 16 16" width="48" height="48" fill="currentColor" className={styles.heroIcon}>
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    <p className={styles.loginDesc}>
                      GitHub 계정으로 로그인하면<br/>
                      커밋 수만큼 🪙 코인을 받을 수 있어요
                    </p>
                  </div>

                  <button className={styles.oauthBtn} onClick={handleLogin}>
                    <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    GitHub로 로그인
                  </button>
                </>
              )}
            </div>

            {!isLoading && (
              <div className={styles.footer}>
                <button className={styles.cancelBtn} onClick={onClose}>닫기</button>
              </div>
            )}
          </>
        )}

        {/* ── PROFILE VIEW ─────────────────────────────────────────────────── */}
        {view === 'profile' && githubUser && (
          <>
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <span className={styles.connectedDot} />
                <span className={styles.headerTitle}>GitHub 연결됨</span>
              </div>
              <button className={styles.closeBtn} onClick={onClose}>✕</button>
            </div>

            <div className={styles.body}>
              <div className={styles.profileCard}>
                <img src={githubUser.avatar_url} alt={githubUser.login} className={styles.avatar} />
                <div className={styles.profileInfo}>
                  <div className={styles.profileName}>{githubUser.name ?? githubUser.login}</div>
                  <div className={styles.profileLogin}>@{githubUser.login}</div>
                  {githubUser.bio && <div className={styles.profileBio}>{githubUser.bio}</div>}
                  <div className={styles.profileStats}>
                    <span>📁 {githubUser.public_repos} repos</span>
                    <span>👥 {githubUser.followers} followers</span>
                  </div>
                </div>
              </div>

              <div className={styles.coinSection}>
                <div className={styles.coinSectionTitle}>오늘의 코인</div>

                {loadingCoins ? (
                  <div className={styles.loadingRow}>
                    <span className={styles.spinner} />
                    커밋 수 집계 중…
                  </div>
                ) : (
                  <div className={styles.coinDetail}>
                    <div className={styles.coinRow}>
                      <span className={styles.coinRowLabel}>📦 총 커밋 수</span>
                      <span className={styles.coinRowValue}>
                        {commitCount !== null ? commitCount.toLocaleString() : '–'}
                      </span>
                    </div>
                    <div className={styles.coinRow}>
                      <span className={styles.coinRowLabel}>🪙 받을 코인</span>
                      <span className={styles.coinRowValue} style={{ color: '#FFD700' }}>
                        {commitCount !== null ? Math.max(commitCount, 1).toLocaleString() : '–'}
                      </span>
                    </div>
                    <div className={styles.coinRow}>
                      <span className={styles.coinRowLabel}>💼 현재 보유</span>
                      <span className={styles.coinRowValue}>{currentCoins.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                {alreadyToday && !coinGranted && (
                  <div className={styles.receivedMsg}>✅ 오늘 이미 코인을 수령했습니다</div>
                )}
                {coinGranted && (
                  <div className={styles.receivedMsg} style={{ color: '#4ade80' }}>
                    ✅ {Math.max(commitCount ?? 1, 1).toLocaleString()} 코인 지급 완료!
                  </div>
                )}
              </div>
            </div>

            <div className={styles.footer}>
              <button
                className={styles.connectBtn}
                onClick={handleReceive}
                disabled={alreadyToday || coinGranted || loadingCoins || commitCount === null}
              >
                {alreadyToday || coinGranted
                  ? '✅ 오늘 수령 완료'
                  : commitCount !== null
                    ? `💰 ${Math.max(commitCount, 1).toLocaleString()} 코인 받기`
                    : '불러오는 중…'}
              </button>
              <button className={styles.logoutBtn} onClick={handleLogout}>로그아웃</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
