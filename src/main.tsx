import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Difficulty = 'easy' | 'normal' | 'hard';
type VehicleKind = 'sedan' | 'hatch' | 'van' | 'truck' | 'taxi' | 'bus' | 'ioniq-like' | 'target';
type PropKind = 'cone' | 'person' | 'charger' | 'sign' | 'cart' | 'tree' | 'crosswalk';
type ZoneName = 'charging' | 'market' | 'avenue' | 'parking' | 'alley' | 'intersection';

type DifficultyConfig = {
  label: string;
  hint: string;
  cars: number;
  nearMisses: number;
  clutter: number;
  targetScale: number;
  missPenalty: number;
  hintPenalty: number;
};

type Vehicle = {
  id: string;
  kind: VehicleKind;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  color: string;
  roof: string;
  mirror: boolean;
  zone: ZoneName;
  occluded: boolean;
};

type SceneProp = {
  id: string;
  kind: PropKind;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  label?: string;
};

type Board = { vehicles: Vehicle[]; props: SceneProp[]; target: Vehicle };
type Score = { name: string; timeMs: number; difficulty: Difficulty; date: string; seed: number; misses: number; hintsUsed: number };

type Zone = {
  name: ZoneName;
  x: [number, number];
  y: [number, number];
  rotation: [number, number];
  weight: number;
  lane?: boolean;
};

const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  easy: { label: 'Easy', cars: 86, nearMisses: 3, clutter: 34, targetScale: 1.1, missPenalty: 350, hintPenalty: 2200, hint: '유사차 적음' },
  normal: { label: 'Normal', cars: 165, nearMisses: 9, clutter: 62, targetScale: 1.0, missPenalty: 450, hintPenalty: 3200, hint: '도시 혼잡도' },
  hard: { label: 'Hard', cars: 255, nearMisses: 22, clutter: 95, targetScale: 0.92, missPenalty: 650, hintPenalty: 4800, hint: '왈도급 유사차' },
};

const ZONES: Zone[] = [
  { name: 'charging', x: [4, 31], y: [7, 34], rotation: [-8, 10], weight: 1.05 },
  { name: 'market', x: [5, 36], y: [56, 91], rotation: [-21, -7], weight: 1.0 },
  { name: 'avenue', x: [35, 74], y: [12, 86], rotation: [3, 8], weight: 1.7, lane: true },
  { name: 'parking', x: [70, 96], y: [8, 53], rotation: [14, 28], weight: 1.15 },
  { name: 'alley', x: [62, 95], y: [61, 91], rotation: [-18, 17], weight: 0.95 },
  { name: 'intersection', x: [38, 66], y: [39, 61], rotation: [-32, 32], weight: 0.65 },
];

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#64748b', '#111827', '#f8fafc', '#facc15', '#fb7185', '#2dd4bf', '#a3e635', '#38bdf8', '#cbd5e1', '#d1d5db'];
const TARGET_COLORS = ['#e5e7eb', '#f8fafc', '#d6d3d1', '#cbd5e1', '#d8c9a5'];
const PROP_LABELS = ['EV', 'P3', 'ION', '5', 'TAXI', 'BUS', 'EXIT', 'NO 5'];

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function between([min, max]: [number, number], rand: () => number) {
  return min + (max - min) * rand();
}

function weightedZone(rand: () => number) {
  const total = ZONES.reduce((sum, zone) => sum + zone.weight, 0);
  let cursor = rand() * total;
  for (const zone of ZONES) {
    cursor -= zone.weight;
    if (cursor <= 0) return zone;
  }
  return ZONES[0];
}

function regionName(x: number, y: number) {
  const vertical = y < 38 ? '위쪽' : y > 64 ? '아래쪽' : '중앙';
  const horizontal = x < 34 ? '왼쪽' : x > 66 ? '오른쪽' : '가운데';
  return `${vertical} ${horizontal}`;
}

function generateVehicles(seed: number, difficulty: Difficulty): Board {
  const rand = mulberry32(seed);
  const config = DIFFICULTY[difficulty];
  const vehicles: Vehicle[] = [];
  const kinds: VehicleKind[] = ['sedan', 'hatch', 'van', 'truck', 'taxi', 'bus'];
  const targetIndex = Math.floor(rand() * config.cars);
  const nearMissSlots = new Set<number>();

  while (nearMissSlots.size < config.nearMisses) {
    const slot = Math.floor(rand() * config.cars);
    if (slot !== targetIndex) nearMissSlots.add(slot);
  }

  for (let i = 0; i < config.cars; i += 1) {
    const zone = weightedZone(rand);
    const isTarget = i === targetIndex;
    const nearMiss = nearMissSlots.has(i);
    const laneOffset = zone.lane ? Math.floor(rand() * 8) * 8.6 : 0;
    const x = Math.min(97, Math.max(3, between(zone.x, rand) + (zone.lane ? (rand() - 0.5) * 4.2 : 0)));
    const y = Math.min(94, Math.max(5, zone.lane ? 13 + laneOffset + (rand() - 0.5) * 3.5 : between(zone.y, rand)));
    const rot = zone.lane ? between(zone.rotation, rand) + (rand() > 0.5 ? 0 : 180) : between(zone.rotation, rand);
    const neutral = rand() > 0.45;

    vehicles.push({
      id: isTarget ? 'ioniq5-target' : `car-${i}`,
      kind: isTarget ? 'target' : nearMiss ? 'ioniq-like' : pick(kinds, rand),
      x,
      y,
      rotation: rot,
      scale: isTarget ? config.targetScale : nearMiss ? 0.86 + rand() * 0.38 : 0.66 + rand() * 0.55,
      color: isTarget ? pick(TARGET_COLORS, rand) : nearMiss ? pick(TARGET_COLORS, rand) : pick(COLORS, rand),
      roof: nearMiss ? pick(['#94a3b8', '#cbd5e1', '#475569'], rand) : pick(['#0f172a', '#1f2937', '#e2e8f0', '#93c5fd', '#fde68a'], rand),
      mirror: rand() > 0.5,
      zone: zone.name,
      occluded: !isTarget && (nearMiss ? rand() < 0.24 : rand() < (difficulty === 'hard' ? 0.18 : 0.08)) && neutral,
    });
  }

  const props: SceneProp[] = Array.from({ length: config.clutter }, (_, i) => {
    const zone = weightedZone(rand);
    const kind = pick<PropKind>(['cone', 'person', 'charger', 'sign', 'cart', 'tree', 'crosswalk'], rand);
    return {
      id: `prop-${i}`,
      kind,
      x: Math.min(97, Math.max(3, between(zone.x, rand))),
      y: Math.min(94, Math.max(5, between(zone.y, rand))),
      rotation: between(zone.rotation, rand),
      scale: 0.7 + rand() * 0.75,
      label: kind === 'sign' ? pick(PROP_LABELS, rand) : undefined,
    };
  });

  const sortedVehicles = vehicles.sort((a, b) => a.y - b.y);
  const target = sortedVehicles.find((car) => car.kind === 'target')!;
  return { vehicles: sortedVehicles, props: props.sort((a, b) => a.y - b.y), target };
}

function formatTime(ms: number) {
  const sec = ms / 1000;
  return `${sec.toFixed(2)}s`;
}

function loadScores(): Score[] {
  try {
    return JSON.parse(localStorage.getItem('ioniq5-waldo-scores') || '[]') as Score[];
  } catch {
    return [];
  }
}

function saveScore(score: Score) {
  const next = [...loadScores(), score].sort((a, b) => a.timeMs - b.timeMs).slice(0, 20);
  localStorage.setItem('ioniq5-waldo-scores', JSON.stringify(next));
  return next;
}

function IoniqShape({ car, preview = false }: { car: Vehicle; preview?: boolean }) {
  const shineId = `shine-${car.id}`;
  const isNearMiss = car.kind === 'ioniq-like';
  return (
    <svg viewBox="0 0 92 44" width="92" height="44" role="img" aria-hidden="true">
      <defs>
        <linearGradient id={shineId} x1="0" x2="1">
          <stop offset="0" stopColor="rgba(255,255,255,.72)" />
          <stop offset=".5" stopColor="rgba(255,255,255,.16)" />
          <stop offset="1" stopColor="rgba(0,0,0,.18)" />
        </linearGradient>
      </defs>
      <path d="M7 29 L18 13 L43 7 L70 10 L84 25 L80 34 L13 36 Z" fill={car.color} stroke="#0f172a" strokeWidth="2.1" />
      <path d="M23 14 L43 9 L63 12 L71 23 L17 24 Z" fill={car.roof} opacity=".9" stroke="#0f172a" strokeWidth="1.35" />
      <path d="M11 29 L82 25 L80 34 L13 36 Z" fill={`url(#${shineId})`} />
      <path d="M21 26 L49 18 L72 23" fill="none" stroke="#334155" strokeWidth="1.7" opacity=".65" />
      <g fill={isNearMiss ? '#fecaca' : '#fef3c7'}>
        <rect x="10" y="24" width="4" height="4" />
        <rect x="15" y="24" width="4" height="4" />
        <rect x="73" y="23" width="4" height="4" />
        <rect x="78" y="23" width="4" height="4" />
      </g>
      <g fill="#0f172a"><circle cx="25" cy="34" r="6" /><circle cx="66" cy="34" r="6" /></g>
      <g fill="#e5e7eb"><circle cx="25" cy="34" r="2.55" /><circle cx="66" cy="34" r="2.55" /></g>
      {!isNearMiss && <text x="35" y="32" fontSize="5.7" fontWeight="900" fill="#111827" letterSpacing=".65">IONIQ 5</text>}
      {isNearMiss && <text x="38" y="32" fontSize="5.5" fontWeight="900" fill="#111827" letterSpacing=".65">EV</text>}
      {preview && <circle cx="83" cy="10" r="4" fill="#22c55e" />}
    </svg>
  );
}

function CarSvg({ car, found, onPick, preview = false }: { car: Vehicle; found: boolean; onPick: (car: Vehicle) => void; preview?: boolean }) {
  const isTarget = car.kind === 'target';
  const isNearMiss = car.kind === 'ioniq-like';
  const width = car.kind === 'bus' ? 88 : car.kind === 'truck' ? 82 : 72;
  const height = car.kind === 'bus' ? 40 : 36;
  const label = isTarget ? 'Hyundai IONIQ 5 target' : isNearMiss ? 'IONIQ-like distractor' : `${car.kind} car`;

  return (
    <button
      className={`car car-${car.kind} ${isTarget ? 'target-car' : ''} ${isNearMiss ? 'near-miss' : ''} ${car.occluded ? 'occluded' : ''} ${found && isTarget ? 'found' : ''}`}
      aria-label={label}
      title={found && isTarget ? 'IONIQ 5!' : undefined}
      onClick={() => onPick(car)}
      style={{
        left: `${car.x}%`,
        top: `${car.y}%`,
        transform: `translate(-50%, -50%) rotate(${car.rotation}deg) scale(${car.scale}) ${car.mirror ? 'scaleX(-1)' : ''}`,
        zIndex: Math.round(car.y * 10) + 20,
      }}
    >
      {isTarget || isNearMiss ? <IoniqShape car={car} preview={preview} /> : (
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-hidden="true">
          <defs>
            <linearGradient id={`shine-${car.id}`} x1="0" x2="1">
              <stop offset="0" stopColor="rgba(255,255,255,.72)" />
              <stop offset=".5" stopColor="rgba(255,255,255,.15)" />
              <stop offset="1" stopColor="rgba(0,0,0,.18)" />
            </linearGradient>
          </defs>
          {car.kind === 'bus' ? (
            <path d="M6 9 Q6 5 10 5 L76 5 Q82 5 82 11 L82 28 L7 30 Z" fill={car.color} stroke="#172033" strokeWidth="1.8" />
          ) : car.kind === 'truck' ? (
            <path d="M5 19 L13 9 L47 9 L47 16 L72 16 L78 28 L10 30 Z" fill={car.color} stroke="#172033" strokeWidth="1.8" />
          ) : (
            <path d="M5 24 L14 12 L31 7 L55 11 L65 23 L61 29 L9 30 Z" fill={car.color} stroke="#172033" strokeWidth="1.8" />
          )}
          <path d={car.kind === 'bus' ? 'M13 9 H70 V19 H13 Z' : 'M18 13 L32 9 L50 13 L56 22 L13 22 Z'} fill={car.roof} opacity=".78" />
          {car.kind === 'taxi' && <rect x="29" y="5" width="15" height="5" rx="2" fill="#fef08a" stroke="#111827" />}
          <path d={car.kind === 'bus' ? 'M6 22 H82 V29 H7 Z' : 'M5 24 L65 23 L61 29 L9 30 Z'} fill={`url(#shine-${car.id})`} />
          <circle cx={car.kind === 'bus' ? 20 : 19} cy={car.kind === 'bus' ? 29 : 29} r="5.2" fill="#0f172a" />
          <circle cx={car.kind === 'bus' ? 68 : 53} cy={car.kind === 'bus' ? 29 : 29} r="5.2" fill="#0f172a" />
          <circle cx={car.kind === 'bus' ? 20 : 19} cy={car.kind === 'bus' ? 29 : 29} r="2.1" fill="#e2e8f0" />
          <circle cx={car.kind === 'bus' ? 68 : 53} cy={car.kind === 'bus' ? 29 : 29} r="2.1" fill="#e2e8f0" />
          <rect x="8" y="22" width="4" height="3" fill="#fde68a" />
          <rect x={car.kind === 'bus' ? 77 : 60} y="22" width="4" height="3" fill="#fca5a5" />
        </svg>
      )}
    </button>
  );
}

function ScenePropView({ prop }: { prop: SceneProp }) {
  return <div className={`scene-prop prop-${prop.kind}`} style={{ left: `${prop.x}%`, top: `${prop.y}%`, transform: `translate(-50%, -50%) rotate(${prop.rotation}deg) scale(${prop.scale})`, zIndex: Math.round(prop.y * 10) + 10 }}>{prop.label}</div>;
}

function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [seed, setSeed] = useState(() => Date.now() % 1_000_000);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [foundMs, setFoundMs] = useState<number | null>(null);
  const [misses, setMisses] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintText, setHintText] = useState('');
  const [scores, setScores] = useState<Score[]>([]);
  const [toast, setToast] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);

  const board = useMemo(() => generateVehicles(seed, difficulty), [seed, difficulty]);
  const config = DIFFICULTY[difficulty];

  useEffect(() => setScores(loadScores()), []);
  useEffect(() => {
    if (!startedAt || foundMs !== null) return;
    const id = window.setInterval(() => setElapsed(performance.now() - startedAt), 37);
    return () => window.clearInterval(id);
  }, [startedAt, foundMs]);

  function startNew(nextDifficulty = difficulty) {
    setDifficulty(nextDifficulty);
    setSeed(Math.floor(Math.random() * 1_000_000_000));
    setStartedAt(performance.now());
    setElapsed(0);
    setFoundMs(null);
    setMisses(0);
    setHintsUsed(0);
    setHintText('');
    setToast('새 도시 장면 생성 완료');
    window.setTimeout(() => setToast(''), 800);
  }

  function requestHint() {
    if (!startedAt || foundMs !== null) {
      setToast('게임 시작 후 힌트를 쓸 수 있어요');
      window.setTimeout(() => setToast(''), 900);
      return;
    }
    const next = hintsUsed + 1;
    setHintsUsed(next);
    const region = regionName(board.target.x, board.target.y);
    const hints = [
      `구역 힌트: ${region}을 먼저 훑어보세요`,
      `차량 힌트: ${board.target.color === '#d8c9a5' ? '골드/실버' : '화이트·실버'} 계열 각진 EV예요`,
      `디테일 힌트: 픽셀 램프 4개와 작은 IONIQ 5 글자를 찾으세요`,
    ];
    setHintText(hints[Math.min(next - 1, hints.length - 1)]);
  }

  function handlePick(car: Vehicle) {
    if (!startedAt) {
      setToast('먼저 START를 누르세요');
      return;
    }
    if (foundMs !== null) return;
    if (car.kind === 'target') {
      const final = performance.now() - startedAt + misses * config.missPenalty + hintsUsed * config.hintPenalty;
      setFoundMs(final);
      setElapsed(final);
      setToast(`찾았다! 오답 ${misses}개 · 힌트 ${hintsUsed}개 반영`);
      window.setTimeout(() => nameInput.current?.focus(), 120);
    } else {
      setMisses((m) => m + 1);
      setToast(car.kind === 'ioniq-like' ? '아깝지만 더미 EV! IONIQ 5 글자까지 확인 👀' : '아님! 각진 EV와 픽셀 램프를 찾으세요');
      window.setTimeout(() => setToast(''), 1000);
    }
  }

  function submitScore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (foundMs === null) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || 'Guest').trim().slice(0, 16) || 'Guest';
    const next = saveScore({ name, timeMs: foundMs, difficulty, date: new Date().toISOString(), seed, misses, hintsUsed });
    setScores(next);
    setToast('리더보드 저장 완료');
    event.currentTarget.reset();
  }

  const currentTime = foundMs ?? elapsed;
  const targetPreview: Vehicle = { id: 'preview', kind: 'target', x: 50, y: 50, rotation: 0, scale: 1, color: '#e5e7eb', roof: '#94a3b8', mirror: false, zone: 'charging', occluded: false };

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Game status">
        <div className="brand-lockup">
          <p className="eyebrow">Where's IONIQ 5?</p>
          <h1>도시 속 진짜 아이오닉 5를 찾아라</h1>
        </div>
        <div className="hud-strip">
          <div><span>TIME</span><strong>{formatTime(currentTime)}</strong></div>
          <div><span>MISS</span><strong>{misses}</strong></div>
          <div><span>HINT</span><strong>{hintsUsed}</strong></div>
          <button className="hint-button" onClick={requestHint}>힌트 쓰기</button>
        </div>
      </section>

      <section className="toolbar" aria-label="Game controls">
        <div className="difficulty-tabs">
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((key) => (
            <button key={key} className={difficulty === key ? 'active' : ''} onClick={() => startNew(key)}>
              {DIFFICULTY[key].label}<small>{DIFFICULTY[key].nearMisses} fake EV · {DIFFICULTY[key].hint}</small>
            </button>
          ))}
        </div>
        <button className="start-button" onClick={() => startNew()}>START / RANDOMIZE</button>
      </section>

      <section className="game-layout">
        <div className="playfield-wrap">
          <div className={`playfield ${foundMs !== null ? 'game-found' : ''}`} data-seed={seed}>
            <div className="road road-main" />
            <div className="road road-cross" />
            <div className="road road-diagonal" />
            <div className="zone charging-zone"><b>EV CHARGE</b></div>
            <div className="zone market-zone"><b>MARKET</b></div>
            <div className="zone parking-zone"><b>P3</b></div>
            {board.props.map((prop) => <ScenePropView key={prop.id} prop={prop} />)}
            {board.vehicles.map((car) => <CarSvg key={car.id} car={car} found={foundMs !== null} onPick={handlePick} />)}
            <div className="crowd-note">Fake EVs share color + silhouette. Real one has pixel lamps and “IONIQ 5”.</div>
            {hintText && <div className="hint-ribbon">{hintText} <small>+{formatTime(config.hintPenalty)} penalty</small></div>}
          </div>
          {toast && <div className="toast" role="status">{toast}</div>}
        </div>

        <aside className="side-panel">
          <div className="target-card">
            <h2>Target Card</h2>
            <div className="mini-target"><CarSvg car={targetPreview} found={false} onPick={() => {}} preview /></div>
            <ul>
              <li>픽셀 램프 4개</li>
              <li>각진 EV 실루엣</li>
              <li><b>IONIQ 5</b> 작은 글자</li>
            </ul>
          </div>

          <div className="round-card">
            <h2>Round</h2>
            <p><b>{config.cars}</b> cars · <b>{config.nearMisses}</b> fake EVs · seed <code>{seed}</code></p>
            <p>오답 +{formatTime(config.missPenalty)} · 힌트 +{formatTime(config.hintPenalty)}</p>
          </div>

          {foundMs !== null && (
            <form className="score-form" onSubmit={submitScore}>
              <label htmlFor="name">리더보드 이름</label>
              <input ref={nameInput} id="name" name="name" maxLength={16} placeholder="HAN" />
              <button type="submit">기록 저장</button>
            </form>
          )}

          <div className="leaderboard">
            <h2>Leaderboard</h2>
            <ol>
              {scores.length === 0 && <li className="empty">아직 기록 없음</li>}
              {scores.slice(0, 10).map((score, index) => (
                <li key={`${score.name}-${score.date}-${index}`}>
                  <span className="rank">#{index + 1}</span>
                  <span>{score.name}<small>{DIFFICULTY[score.difficulty].label} · miss {score.misses ?? 0} · hint {score.hintsUsed ?? 0}</small></span>
                  <b>{formatTime(score.timeMs)}</b>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
