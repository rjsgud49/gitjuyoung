import { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { GachaItem, GachaResult, CollectedItem } from '../types';
import type { GachaEvent } from '../types/admin';
import { simulateGacha, getRarityColor, getRarityLabel } from '../utils/gachaUtils';
import styles from '../styles/CapsuleMachine.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type AnimPhase =
  | 'idle'
  | 'coin-insert'
  | 'knob-turn'
  | 'capsule-drop'
  | 'waiting-tap'
  | 'capsule-open'
  | 'white-flash'
  | 'card-reveal'
  | 'card-shown'
  | 'multi-reveal';

interface Particle {
  id: number; size: number; color: string;
  tx: number; ty: number; speed: number; delay: number; isStar: boolean;
}

interface PhysicsBall {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  color: string;
  ejecting?: boolean; // skips boundary, extra gravity — exits via canvas clip
}

interface Props {
  items: GachaItem[];
  onGachaPull: (result: GachaResult) => void;
  onGachaPullMulti?: (results: GachaResult[]) => void;
  collectedItems: Map<string, CollectedItem>;
  coins: number;
  onCoinSpend: (amount: number) => void;
  activeEvent?: GachaEvent | null;
  /** 관리자 패널에서 설정 (기본 10) */
  basePullCost?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const BALL_RADIUS    = 10;
const WINDOW_R       = 105;
const BALL_COUNT     = 22;
const CANVAS_SIZE    = 244;
const CANVAS_CX      = CANVAS_SIZE / 2;
const CANVAS_CY      = CANVAS_SIZE / 2;

const CAPSULE_COLORS = [
  '#FF3333','#3366FF','#FFCC00','#33BB44','#AA33FF',
  '#FF8833','#33AAFF','#FF3388','#77CC22','#FF33CC',
  '#FF5555','#5577FF','#FFD033','#55BB55','#BB55FF',
  '#FFAA55','#55CCFF','#FF55AA','#AACC33','#FF55CC',
  '#FF2266','#2288FF','#FFAA22','#22CC77','#7722FF',
  '#FF6600','#0088FF','#FF0066','#00BBAA','#9900FF',
];

const RARITY_PARTICLE_COLORS: Record<string, string[]> = {
  legendary: ['#FFD700','#FFA500','#FF8C00','#FFEC00','#FFFAAA','#FFFFFF'],
  epic:      ['#CC44FF','#FF44CC','#AA00FF','#FF00AA','#EE88FF','#FFFFFF'],
  rare:      ['#3399FF','#33CCFF','#0066DD','#66BBFF','#88DDFF','#FFFFFF'],
  common:    ['#BBBBBB','#DDDDDD','#EEEEEE'],
};

// ─── Physics helpers ──────────────────────────────────────────────────────────

function initBalls(): PhysicsBall[] {
  const balls: PhysicsBall[] = [];
  const maxDist = (WINDOW_R - BALL_RADIUS) * 0.88;
  const shuffled = [...CAPSULE_COLORS].sort(() => Math.random() - 0.5);
  let attempt = 0;

  while (balls.length < BALL_COUNT && attempt < BALL_COUNT * 60) {
    attempt++;
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.sqrt(Math.random()) * maxDist;
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;

    const overlaps = balls.some(b => {
      const dx = b.x - x, dy = b.y - y;
      return dx * dx + dy * dy < (BALL_RADIUS * 2.15) ** 2;
    });

    if (!overlaps) {
      balls.push({
        x, y,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.5) * 18,
        r: BALL_RADIUS,
        color: shuffled[balls.length % shuffled.length],
      });
    }
  }
  return balls;
}

function stepPhysics(balls: PhysicsBall[], dt: number): void {
  const GRAVITY     = 260;
  const DAMPING     = 0.9945;
  const RESTITUTION = 0.50;

  for (const b of balls) {
    if (b.ejecting) {
      // No damping, no boundary — ball accelerates straight down and exits via canvas clip
      b.vy += GRAVITY * dt * 2.8;
      b.x  += b.vx * dt;
      b.y  += b.vy * dt;
      continue;
    }

    b.vy += GRAVITY * dt;
    b.vx *= DAMPING;
    b.vy *= DAMPING;
    b.x  += b.vx * dt;
    b.y  += b.vy * dt;

    const dist  = Math.sqrt(b.x * b.x + b.y * b.y);
    const limit = WINDOW_R - b.r;
    if (dist > limit) {
      const nx = b.x / dist, ny = b.y / dist;
      b.x = nx * limit;
      b.y = ny * limit;
      const dot = b.vx * nx + b.vy * ny;
      if (dot > 0) {
        b.vx -= (1 + RESTITUTION) * dot * nx;
        b.vy -= (1 + RESTITUTION) * dot * ny;
      }
    }
  }

  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], bb = balls[j];
      if (a.ejecting || bb.ejecting) continue;
      const dx = bb.x - a.x, dy = bb.y - a.y;
      const distSq = dx * dx + dy * dy;
      const minD   = a.r + bb.r;
      if (distSq < minD * minD && distSq > 0.0001) {
        const d    = Math.sqrt(distSq);
        const nx   = dx / d, ny = dy / d;
        const sep  = (minD - d) * 0.5;
        a.x  -= nx * sep; a.y  -= ny * sep;
        bb.x += nx * sep; bb.y += ny * sep;
        const rvx = bb.vx - a.vx, rvy = bb.vy - a.vy;
        const dot = rvx * nx + rvy * ny;
        if (dot < 0) {
          const imp = dot * RESTITUTION;
          a.vx  += imp * nx; a.vy  += imp * ny;
          bb.vx -= imp * nx; bb.vy -= imp * ny;
        }
      }
    }
  }
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  // Outer drop shadow (no clip)
  ctx.save();
  ctx.shadowColor    = 'rgba(0,0,0,0.52)';
  ctx.shadowBlur     = 8;
  ctx.shadowOffsetY  = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();

  // All gradient layers clipped to ball
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  // Bottom-right depth shadow
  const shadow = ctx.createRadialGradient(x + r * 0.22, y + r * 0.26, 0, x + r * 0.22, y + r * 0.26, r * 0.65);
  shadow.addColorStop(0, 'rgba(0,0,0,0.30)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  // Rim darkening
  const rim = ctx.createRadialGradient(x, y, r * 0.54, x, y, r);
  rim.addColorStop(0,    'rgba(0,0,0,0)');
  rim.addColorStop(0.75, 'rgba(0,0,0,0.22)');
  rim.addColorStop(1,    'rgba(0,0,0,0.44)');
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  // Main specular highlight top-left
  const spec1 = ctx.createRadialGradient(x - r * 0.20, y - r * 0.26, 0, x - r * 0.20, y - r * 0.26, r * 0.60);
  spec1.addColorStop(0,    'rgba(255,255,255,0.78)');
  spec1.addColorStop(0.48, 'rgba(255,255,255,0.18)');
  spec1.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = spec1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  // Secondary small highlight bottom-right
  const spec2 = ctx.createRadialGradient(x + r * 0.35, y + r * 0.28, 0, x + r * 0.35, y + r * 0.28, r * 0.20);
  spec2.addColorStop(0, 'rgba(255,255,255,0.30)');
  spec2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ─── Other helpers ────────────────────────────────────────────────────────────

function generateParticles(rarity: string, count: number): Particle[] {
  const colors = RARITY_PARTICLE_COLORS[rarity] ?? RARITY_PARTICLE_COLORS.common;
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
    const dist  = 100 + Math.random() * 160;
    return {
      id: i,
      size:  rarity === 'legendary' ? 6 + Math.random() * 10 : 5 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      tx: Math.cos(angle) * dist, ty: Math.sin(angle) * dist,
      speed: 0.6 + Math.random() * 0.8, delay: Math.random() * 0.25,
      isStar: rarity === 'legendary' && Math.random() > 0.5,
    };
  });
}

function getRarityLabelFull(rarity: string): string {
  return ({ legendary: '★ LEGENDARY ★', epic: '◆ EPIC ◆', rare: '● RARE ●', common: '○ COMMON ○' })[rarity] ?? '○ COMMON ○';
}

function getParticleCount(rarity: string): number {
  return ({ legendary: 50, epic: 38, rare: 26, common: 14 })[rarity] ?? 14;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const CapsuleMachine = ({
  items, onGachaPull, onGachaPullMulti, collectedItems, coins, onCoinSpend, activeEvent,
  basePullCost = 10,
}: Props) => {
  const [phase,           setPhase]          = useState<AnimPhase>('idle');
  const [result,          setResult]         = useState<GachaResult | null>(null);
  const [capsuleColor,    setCapsuleColor]   = useState('#FF3333');
  const [particles,       setParticles]      = useState<Particle[]>([]);
  const [machineShaking,  setMachineShaking] = useState(false);
  const [rollingBallColor, setRollingBallColor] = useState<string | null>(null);
  // 3x pull state
  const [multiResults,   setMultiResults]   = useState<GachaResult[]>([]);
  const [multiRevealIdx, setMultiRevealIdx] = useState(0); // 0=none revealed, 1/2/3=cards revealed

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const ballsRef    = useRef<PhysicsBall[]>([]);
  const lastTimeRef = useRef<number>(0);
  const timeouts    = useRef<ReturnType<typeof setTimeout>[]>([]);

  const pullCost = activeEvent?.type === 'pull_discount'
    ? Math.max(1, Math.floor(basePullCost / activeEvent.value))
    : basePullCost;

  // ── Physics init ──────────────────────────────────────────────────────────────

  useEffect(() => {
    ballsRef.current = initBalls();
  }, []);

  // ── Physics animation loop ────────────────────────────────────────────────────

  useEffect(() => {
    let rafId: number;

    function loop(time: number) {
      const dt  = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;

      const canvas = canvasRef.current;
      const ctx    = canvas?.getContext('2d');
      if (ctx && canvas) {
        // Occasional gentle stir so settled balls stay alive
        if (Math.random() < 0.007) {
          const b = ballsRef.current[Math.floor(Math.random() * ballsRef.current.length)];
          if (b) { b.vx += (Math.random() - 0.5) * 45; b.vy += (Math.random() - 0.5) * 28; }
        }

        stepPhysics(ballsRef.current, dt);

        // Remove ejecting balls that have fully exited the window circle
        ballsRef.current = ballsRef.current.filter(
          b => !b.ejecting || b.y < WINDOW_R + 20
        );

        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        for (const b of ballsRef.current) {
          drawBall(ctx, CANVAS_CX + b.x, CANVAS_CY + b.y, b.r, b.color);
        }
      }

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => () => { timeouts.current.forEach(clearTimeout); }, []);

  const addTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeouts.current.push(id);
  }, []);

  const clearAll = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  // ── Pull ──────────────────────────────────────────────────────────────────────

  const handlePull = useCallback(() => {
    if (phase !== 'idle' || coins < pullCost || items.length === 0) return;
    onCoinSpend(pullCost);

    const color = CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)];
    const gacha = simulateGacha(items, collectedItems);
    setCapsuleColor(color);
    setResult(gacha);
    onGachaPull(gacha);

    // Pick a ball near the bottom of the window and mark it as ejecting.
    // The physics will push it out the bottom; the canvas clip hides it cleanly.
    const bottomBall = ballsRef.current.reduce((best, b) =>
      b.y > best.y ? b : best, ballsRef.current[0]);
    const rollingColor = bottomBall?.color ?? color;
    if (bottomBall) {
      bottomBall.ejecting = true;
      bottomBall.vx = 0;
      bottomBall.vy = 220; // initial downward kick
    }

    setPhase('coin-insert');

    addTimeout(() => {
      setPhase('knob-turn');
      setMachineShaking(true);
      setRollingBallColor(rollingColor);
      addTimeout(() => setMachineShaking(false), 750);
    }, 650);

    addTimeout(() => {
      setPhase('capsule-drop');
      setRollingBallColor(null);
      // Drop a replacement ball from the top of the window
      const newColor = CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)];
      ballsRef.current.push({
        x:  (Math.random() - 0.5) * 20,
        y:  -(WINDOW_R - BALL_RADIUS - 2),
        vx: (Math.random() - 0.5) * 15,
        vy: 10,
        r:  BALL_RADIUS,
        color: newColor,
      });
    }, 1500);

    addTimeout(() => setPhase('waiting-tap'), 2650);
  }, [phase, coins, pullCost, items, collectedItems, onCoinSpend, onGachaPull, addTimeout]);

  // ── 3x Pull ───────────────────────────────────────────────────────────────────

  const handlePull3x = useCallback(() => {
    if (phase !== 'idle' || coins < pullCost * 3 || items.length === 0) return;
    onCoinSpend(pullCost * 3);

    const results = [
      simulateGacha(items, collectedItems),
      simulateGacha(items, collectedItems),
      simulateGacha(items, collectedItems),
    ];
    setMultiResults(results);
    setMultiRevealIdx(0);
    if (onGachaPullMulti) onGachaPullMulti(results);

    const color = CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)];
    setCapsuleColor(color);

    const bottomBall = ballsRef.current.reduce((best, b) =>
      b.y > best.y ? b : best, ballsRef.current[0]);
    const rollingColor = bottomBall?.color ?? color;
    if (bottomBall) {
      bottomBall.ejecting = true;
      bottomBall.vx = 0;
      bottomBall.vy = 220;
    }

    setPhase('coin-insert');

    addTimeout(() => {
      setPhase('knob-turn');
      setMachineShaking(true);
      setRollingBallColor(rollingColor);
      addTimeout(() => setMachineShaking(false), 750);
    }, 650);

    addTimeout(() => {
      setPhase('capsule-drop');
      setRollingBallColor(null);
      const newColor = CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)];
      ballsRef.current.push({
        x: (Math.random() - 0.5) * 20, y: -(WINDOW_R - BALL_RADIUS - 2),
        vx: (Math.random() - 0.5) * 15, vy: 10,
        r: BALL_RADIUS, color: newColor,
      });
    }, 1500);

    // Skip waiting-tap → go straight to multi-reveal with sequential flips
    addTimeout(() => {
      setPhase('multi-reveal');
      addTimeout(() => setMultiRevealIdx(1), 500);
      addTimeout(() => setMultiRevealIdx(2), 1900);
      addTimeout(() => setMultiRevealIdx(3), 3300);
    }, 2650);
  }, [phase, coins, pullCost, items, collectedItems, onCoinSpend, onGachaPullMulti, addTimeout]);

  // ── Tap capsule ───────────────────────────────────────────────────────────────

  const handleTap = useCallback(() => {
    if (phase !== 'waiting-tap') return;
    setPhase('capsule-open');
    addTimeout(() => setPhase('white-flash'), 920);
    addTimeout(() => {
      setPhase('card-reveal');
      if (result) setParticles(generateParticles(result.item.rarity, getParticleCount(result.item.rarity)));
    }, 1230);
    addTimeout(() => setPhase('card-shown'), 1870);
  }, [phase, result, addTimeout]);

  // ── Close ─────────────────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    clearAll();
    setPhase('idle');
    setResult(null);
    setParticles([]);
    setMultiResults([]);
    setMultiRevealIdx(0);
  }, [clearAll]);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const canPull      = phase === 'idle' && coins >= pullCost && items.length > 0;
  const canPull3x    = phase === 'idle' && coins >= pullCost * 3 && items.length > 0;
  const showOverlay  = phase === 'white-flash' || phase === 'card-reveal' || phase === 'card-shown';
  const overlayClass = phase === 'white-flash' ? styles.flashPhase
                     : phase === 'card-reveal'  ? styles.revealPhase
                     : styles.shownPhase;

  const rarityCardClass: Record<string, string> = {
    common: styles.cardCommon, rare: styles.cardRare, epic: styles.cardEpic, legendary: styles.cardLegendary,
  };

  const btnLabel = () => {
    if (phase === 'waiting-tap') return '캡슐을 탭하여 열어보세요! ✨';
    if (phase !== 'idle')        return '진행 중...';
    if (coins < pullCost)        return `코인 부족 (${pullCost}코인 필요)`;
    return `1회 뽑기 (${pullCost}코인)`;
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.pageContainer}>

      {/* Event banner */}
      {activeEvent && (
        <div className={styles.eventBanner}>
          <span className={styles.eventBannerIcon}>🎉</span>
          <span className={styles.eventBannerText}>{activeEvent.description}</span>
          <span className={styles.eventBannerBadge}>EVENT</span>
        </div>
      )}

      {/* Machine */}
      <div className={styles.machineWrapper}>
        <div className={`${styles.machineBody} ${machineShaking ? styles.machineShake : ''}`}>

          {/* Header */}
          <div className={styles.machineHeader}>
            <div className={styles.headerBrand}>BANDAI · GASHAPON</div>
            <div className={styles.machineTitleRow}>
              <span className={styles.machineTitleIcon}>🎱</span>
              <div className={styles.machineTitleText}>
                <span className={styles.titleMain}>CAPSULE</span>
                <span className={styles.titleSub}>G A C H A</span>
              </div>
              <span className={styles.machineTitleIcon}>🎱</span>
            </div>
          </div>

          {/* Capsule window — canvas physics */}
          <div className={styles.windowSection}>
            <div className={styles.capsuleWindowOuter}>
              <div className={styles.windowRingOuter} />
              <div className={styles.windowRingInner} />
              <div className={styles.capsuleWindow}>
                <div className={styles.windowReflection} />
                <div className={styles.windowReflection2} />
                <canvas
                  ref={canvasRef}
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  className={styles.physicsCanvas}
                />
              </div>
            </div>
          </div>

          {/* Rolling ball – animates from window bottom to tray */}
          {rollingBallColor && (
            <div className={styles.rollingBallTrack}>
              <div
                className={styles.rollingBall}
                style={{ backgroundColor: rollingBallColor }}
              />
            </div>
          )}

          {/* Price */}
          <div className={styles.priceSection}>
            <div className={styles.priceTag}>
              <span className={styles.priceLabel}>1회 뽑기</span>
              <span className={styles.priceSeparator}>|</span>
              {activeEvent?.type === 'pull_discount' && (
                <span className={styles.priceDiscount}>{basePullCost}</span>
              )}
              <span className={styles.priceValue}>💰 {pullCost} 코인</span>
            </div>
          </div>

          {/* Controls */}
          <div className={styles.controlSection}>
            <div className={styles.coinDisplay}>
              <div className={styles.coinIcon}>🪙</div>
              <div className={styles.coinTextGroup}>
                <span className={styles.coinLabel}>보유 코인</span>
                <span className={styles.coinValue}>{coins.toLocaleString()}</span>
              </div>
            </div>
            <div className={`${styles.knobWrapper} ${phase === 'knob-turn' ? styles.knobTurning : ''}`}>
              <div className={styles.knobOuter}>
                <div className={styles.knobInner}>
                  <div className={styles.knobHandle} />
                </div>
              </div>
              <div className={styles.knobLabel}>TURN</div>
            </div>
          </div>

          {/* Coin slot */}
          <div className={styles.coinSlotSection}>
            <span className={styles.coinSlotLabel}>코인 투입구</span>
            <div className={`${styles.coinSlot} ${phase === 'coin-insert' ? styles.coinSlotActive : ''}`}>
              <div className={styles.coinSlotOpening} />
              {phase === 'coin-insert' && (
                <div className={styles.coinFlyWrapper}>
                  <span className={styles.coinFly}>🪙</span>
                </div>
              )}
            </div>
          </div>

          {/* Tray */}
          <div className={styles.traySection}>
            <div className={styles.trayFunnel} />
            <div className={styles.tray}>
              {(phase === 'capsule-drop' || phase === 'waiting-tap') && (
                <div
                  className={`${styles.trayCapsule} ${phase === 'capsule-drop' ? styles.capsuleDropAnim : ''} ${phase === 'waiting-tap' ? styles.capsuleWaitAnim : ''}`}
                  style={{ backgroundColor: capsuleColor }}
                  onClick={handleTap}
                  role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && handleTap()}
                  aria-label="캡슐 열기"
                >
                  {phase === 'waiting-tap' && <div className={styles.tapHint}>TAP!</div>}
                </div>
              )}
              {phase === 'capsule-open' && (
                <div className={styles.capsuleOpenContainer}>
                  <div className={styles.capsuleOpenTop}    style={{ backgroundColor: capsuleColor }} />
                  <div className={styles.capsuleOpenBottom} style={{ backgroundColor: capsuleColor }} />
                  <div className={styles.capsuleInnerGlow} />
                </div>
              )}
            </div>
          </div>

          {/* Pull buttons */}
          <div className={styles.pullButtonWrapper}>
            <div className={styles.pullButtonRow}>
              <button
                className={`${styles.pullButton} ${!canPull ? styles.pullButtonDisabled : ''}`}
                onClick={handlePull}
                disabled={!canPull}
              >
                {btnLabel()}
              </button>
              <button
                className={`${styles.pullButton} ${styles.pullButton3x} ${!canPull3x ? styles.pullButtonDisabled : ''}`}
                onClick={handlePull3x}
                disabled={!canPull3x}
              >
                {phase !== 'idle' ? '진행 중...' : `3회 뽑기 (${pullCost * 3}코인)`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3x Multi-reveal overlay */}
      {phase === 'multi-reveal' && multiResults.length === 3 && (
        <div className={`${styles.flashOverlay} ${styles.shownPhase}`}>
          <div className={styles.multiRevealTitle}>✨ 3연속 뽑기 결과 ✨</div>
          <div className={styles.multiCardRow}>
            {multiResults.map((r, idx) => {
              const revealed = multiRevealIdx > idx;
              const cardClass = rarityCardClass[r.item.rarity] ?? styles.cardCommon;
              return (
                <div key={idx} className={styles.multiCardWrapper}>
                  <div className={`${styles.multiCardInner} ${revealed ? styles.multiCardFlipped : ''}`}>
                    {/* Back face */}
                    <div className={styles.multiCardBack}>
                      <div className={styles.multiCardBackPattern}>
                        <span className={styles.multiCardBackIcon}>🎱</span>
                        <div className={styles.multiCardBackLabel}>CAPSULE</div>
                      </div>
                    </div>
                    {/* Front face */}
                    <div className={`${styles.multiCardFront} ${cardClass}`}
                      style={{ '--rarity-color': getRarityColor(r.item.rarity) } as React.CSSProperties}>
                      <div className={styles.cardBg} />
                      {r.item.rarity !== 'common' && <div className={styles.cardHolo} />}
                      {r.item.rarity === 'legendary' && <div className={styles.cardLegendaryRays} />}
                      <div className={styles.multiCardContent}>
                        <div className={styles.multiCardRarityLabel}>{getRarityLabelFull(r.item.rarity)}</div>
                        {r.isNew && <div className={styles.newBadge}>NEW!</div>}
                        <div className={styles.multiCardImageFrame}>
                          <img src={r.item.image} alt={r.item.name} className={styles.cardImage}
                            onError={e => {
                              (e.currentTarget as HTMLImageElement).src =
                                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%23333" width="80" height="80"/%3E%3C/svg%3E';
                            }}
                          />
                        </div>
                        <div className={styles.multiCardName}>{r.item.name}</div>
                        <div className={styles.cardRarityBadge} style={{ backgroundColor: getRarityColor(r.item.rarity) }}>
                          {getRarityLabel(r.item.rarity)}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Rarity glow under card */}
                  {revealed && (
                    <div className={styles.multiCardGlow}
                      style={{ boxShadow: `0 0 24px ${getRarityColor(r.item.rarity)}` }} />
                  )}
                </div>
              );
            })}
          </div>
          {multiRevealIdx >= 3 && (
            <button className={styles.closeButton} onClick={handleClose}>계속하기</button>
          )}
        </div>
      )}

      {/* Flash + Card overlay */}
      {showOverlay && (
        <div className={`${styles.flashOverlay} ${overlayClass}`}>
          {(phase === 'card-reveal' || phase === 'card-shown') && result && (
            <div className={styles.cardContainer}>
              <div className={styles.particleContainer}>
                {particles.map(p => (
                  <div
                    key={p.id}
                    className={`${styles.particle} ${p.isStar ? styles.particleStar : ''}`}
                    style={{
                      width: p.size, height: p.size, backgroundColor: p.color,
                      boxShadow: `0 0 ${p.size}px ${p.color}`,
                      '--tx': `${p.tx}px`, '--ty': `${p.ty}px`,
                      '--speed': `${p.speed}s`, '--delay': `${p.delay}s`,
                    } as CSSProperties}
                  />
                ))}
              </div>

              <div
                className={`${styles.gachaCard} ${rarityCardClass[result.item.rarity] ?? styles.cardCommon}`}
                style={{ '--rarity-color': getRarityColor(result.item.rarity) } as CSSProperties}
              >
                <div className={styles.cardBg} />
                {result.item.rarity !== 'common' && <div className={styles.cardHolo} />}
                {result.item.rarity === 'legendary' && <div className={styles.cardLegendaryRays} />}

                <div className={styles.cardInner}>
                  <div className={styles.cardRarityLabel}>{getRarityLabelFull(result.item.rarity)}</div>
                  {result.isNew && <div className={styles.newBadge}>NEW!</div>}
                  <div className={styles.cardImageFrame}>
                    <img
                      src={result.item.image}
                      alt={result.item.name}
                      className={styles.cardImage}
                      onError={e => {
                        (e.currentTarget as HTMLImageElement).src =
                          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23333" width="200" height="200"/%3E%3C/svg%3E';
                      }}
                    />
                  </div>
                  <div className={styles.cardName}>{result.item.name}</div>
                  <div className={styles.cardDivider} />
                  <div className={styles.cardRarityBadge} style={{ backgroundColor: getRarityColor(result.item.rarity) }}>
                    {getRarityLabel(result.item.rarity)}
                  </div>
                </div>
              </div>

              {phase === 'card-shown' && (
                <button className={styles.closeButton} onClick={handleClose}>계속하기</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
