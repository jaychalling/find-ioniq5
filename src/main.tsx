import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Difficulty = 'easy' | 'normal' | 'hard';
type VehicleKind = 'sedan' | 'hatch' | 'van' | 'truck' | 'taxi' | 'bus' | 'target';
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
  lane: number;
};
type Score = { name: string; timeMs: number; difficulty: Difficulty; date: string };

const DIFFICULTY: Record<Difficulty, { label: string; cars: number; hint: string }> = {
  easy: { label: 'Easy', cars: 90, hint: '가볍게 몸풀기' },
  normal: { label: 'Normal', cars: 170, hint: '진짜 주차장 느낌' },
  hard: { label: 'Hard', cars: 280, hint: '왈도급 밀도' },
};

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#64748b', '#111827',
  '#f8fafc', '#facc15', '#fb7185', '#2dd4bf', '#a3e635', '#38bdf8'
];

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

function generateVehicles(seed: number, difficulty: Difficulty): Vehicle[] {
  const rand = mulberry32(seed);
  const total = DIFFICULTY[difficulty].cars;
  const vehicles: Vehicle[] = [];
  const lanes = difficulty === 'hard' ? 18 : difficulty === 'normal' ? 15 : 12;
  const cols = Math.ceil(total / lanes);
  const cellW = 100 / cols;
  const cellH = 100 / lanes;
  const targetIndex = Math.floor(rand() * total);
  const kinds: VehicleKind[] = ['sedan', 'hatch', 'van', 'truck', 'taxi', 'bus'];

  for (let i = 0; i < total; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const isTarget = i === targetIndex;
    const jitterX = (rand() - 0.5) * cellW * 0.65;
    const jitterY = (rand() - 0.5) * cellH * 0.55;
    vehicles.push({
      id: isTarget ? 'ioniq5-target' : `car-${i}`,
      kind: isTarget ? 'target' : pick(kinds, rand),
      x: Math.min(96, Math.max(3, col * cellW + cellW / 2 + jitterX)),
      y: Math.min(94, Math.max(5, row * cellH + cellH / 2 + jitterY)),
      rotation: (rand() - 0.5) * (difficulty === 'hard' ? 24 : 16),
      scale: isTarget ? 1.08 : 0.72 + rand() * 0.52,
      color: isTarget ? '#e5e7eb' : pick(COLORS, rand),
      roof: pick(['#0f172a', '#1f2937', '#e2e8f0', '#93c5fd', '#fde68a'], rand),
      mirror: rand() > 0.5,
      lane: row,
    });
  }
  return vehicles.sort((a, b) => a.y - b.y);
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

function CarSvg({ car, found, onPick }: { car: Vehicle; found: boolean; onPick: (car: Vehicle) => void }) {
  const isTarget = car.kind === 'target';
  const width = isTarget || car.kind === 'bus' ? 88 : car.kind === 'truck' ? 82 : 70;
  const height = isTarget ? 42 : car.kind === 'bus' ? 40 : 36;
  const label = isTarget ? 'Hyundai IONIQ 5' : `${car.kind} car`;
  return (
    <button
      className={`car car-${car.kind} ${isTarget ? 'target-car' : ''} ${found && isTarget ? 'found' : ''}`}
      aria-label={label}
      title={found && isTarget ? 'IONIQ 5!' : undefined}
      onClick={() => onPick(car)}
      style={{
        left: `${car.x}%`,
        top: `${car.y}%`,
        transform: `translate(-50%, -50%) rotate(${car.rotation}deg) scale(${car.scale}) ${car.mirror ? 'scaleX(-1)' : ''}`,
        zIndex: Math.round(car.y * 10),
      }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-hidden="true">
        <defs>
          <linearGradient id={`shine-${car.id}`} x1="0" x2="1">
            <stop offset="0" stopColor="rgba(255,255,255,.72)" />
            <stop offset=".5" stopColor="rgba(255,255,255,.15)" />
            <stop offset="1" stopColor="rgba(0,0,0,.18)" />
          </linearGradient>
        </defs>
        {isTarget ? (
          <>
            <path d="M7 28 L17 13 L42 7 L69 10 L82 25 L79 32 L12 34 Z" fill={car.color} stroke="#0f172a" strokeWidth="2.1" />
            <path d="M22 14 L42 9 L61 12 L69 23 L17 24 Z" fill="#94a3b8" opacity=".9" stroke="#0f172a" strokeWidth="1.4" />
            <path d="M7 28 L82 25 L79 32 L12 34 Z" fill="url(#shine-ioniq5-target)" />
            <g fill="#fef3c7">
              <rect x="10" y="24" width="4" height="4" />
              <rect x="15" y="24" width="4" height="4" />
              <rect x="72" y="23" width="4" height="4" />
              <rect x="77" y="23" width="4" height="4" />
            </g>
            <g fill="#0f172a">
              <circle cx="24" cy="32" r="6" />
              <circle cx="65" cy="32" r="6" />
            </g>
            <g fill="#e5e7eb">
              <circle cx="24" cy="32" r="2.6" />
              <circle cx="65" cy="32" r="2.6" />
            </g>
            <text x="35" y="31" fontSize="5.8" fontWeight="900" fill="#111827" letterSpacing=".7">IONIQ 5</text>
          </>
        ) : (
          <>
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
          </>
        )}
      </svg>
    </button>
  );
}

function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [seed, setSeed] = useState(() => Date.now() % 1_000_000);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [foundMs, setFoundMs] = useState<number | null>(null);
  const [misses, setMisses] = useState(0);
  const [scores, setScores] = useState<Score[]>([]);
  const [toast, setToast] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);

  const vehicles = useMemo(() => generateVehicles(seed, difficulty), [seed, difficulty]);

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
    setToast('');
  }

  function handlePick(car: Vehicle) {
    if (!startedAt) {
      setToast('먼저 START를 누르세요');
      return;
    }
    if (foundMs !== null) return;
    if (car.kind === 'target') {
      const final = performance.now() - startedAt + misses * 350;
      setFoundMs(final);
      setElapsed(final);
      setToast(misses ? `찾았다! 오답 ${misses}개로 ${misses * 0.35}s 패널티 포함` : '찾았다! IONIQ 5 발견');
      window.setTimeout(() => nameInput.current?.focus(), 120);
    } else {
      setMisses((m) => m + 1);
      setToast('아님! IONIQ 5는 픽셀 램프와 각진 EV 실루엣 👀');
      window.setTimeout(() => setToast(''), 900);
    }
  }

  function submitScore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (foundMs === null) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || 'Guest').trim().slice(0, 16) || 'Guest';
    const next = saveScore({ name, timeMs: foundMs, difficulty, date: new Date().toISOString() });
    setScores(next);
    setToast('리더보드 저장 완료');
    event.currentTarget.reset();
  }

  const currentTime = foundMs ?? elapsed;

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Where's IONIQ 5?</p>
          <h1>수많은 컬러 차량 사이<br />현대 아이오닉 5를 찾아라</h1>
          <p className="subcopy">매 라운드 차량 위치와 색상이 랜덤으로 바뀝니다. 단순 이미지가 아니라 SVG 차량 오브젝트들이 주차장처럼 배치돼요.</p>
        </div>
        <div className="hud-card">
          <span>TIME</span>
          <strong>{formatTime(currentTime)}</strong>
          <small>오답 1개당 +0.35초</small>
        </div>
      </section>

      <section className="toolbar" aria-label="Game controls">
        <div className="difficulty-tabs">
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((key) => (
            <button key={key} className={difficulty === key ? 'active' : ''} onClick={() => startNew(key)}>
              {DIFFICULTY[key].label}<small>{DIFFICULTY[key].hint}</small>
            </button>
          ))}
        </div>
        <button className="start-button" onClick={() => startNew()}>START / RANDOMIZE</button>
      </section>

      <section className="game-layout">
        <div className="playfield-wrap">
          <div className={`playfield ${foundMs !== null ? 'game-found' : ''}`}>
            <div className="city-grid" />
            <div className="sign sign-a">EV ZONE</div>
            <div className="sign sign-b">P3</div>
            {vehicles.map((car) => <CarSvg key={car.id} car={car} found={foundMs !== null} onPick={handlePick} />)}
            <div className="crowd-note">Find the angular silver EV with pixel lamps</div>
          </div>
          {toast && <div className="toast" role="status">{toast}</div>}
        </div>

        <aside className="side-panel">
          <div className="target-card">
            <h2>Target</h2>
            <div className="mini-target"><CarSvg car={{ id: 'preview', kind: 'target', x: 50, y: 50, rotation: 0, scale: 1, color: '#e5e7eb', roof: '#94a3b8', mirror: false, lane: 0 }} found={false} onPick={() => {}} /></div>
            <p>픽셀 램프, 각진 차체, <b>IONIQ 5</b> 글자를 찾으세요.</p>
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
                  <span>{score.name}<small>{DIFFICULTY[score.difficulty].label}</small></span>
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
