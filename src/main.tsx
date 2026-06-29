import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Difficulty = 'easy' | 'normal' | 'hard';
type VehicleKind = 'sedan' | 'hatch' | 'van' | 'truck' | 'taxi' | 'bus' | 'ioniq-like' | 'target';
type PropKind = 'cone' | 'person' | 'charger' | 'sign' | 'cart' | 'tree' | 'crosswalk';
type ZoneName = 'north-lot' | 'mid-lot' | 'south-lot' | 'entrance' | 'charger-row' | 'market-row';

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
  asset: string;
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

type ParkingSlot = {
  id: string;
  zone: ZoneName;
  x: number;
  y: number;
  rotation: number;
  row: number;
  col: number;
  priority: number;
};

const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  easy: { label: 'Easy', cars: 40, nearMisses: 2, clutter: 8, targetScale: 0.88, missPenalty: 350, hintPenalty: 2200, hint: '깔끔한 입문' },
  normal: { label: 'Normal', cars: 62, nearMisses: 6, clutter: 14, targetScale: 0.78, missPenalty: 450, hintPenalty: 3200, hint: '왈도풍 밀도' },
  hard: { label: 'Hard', cars: 84, nearMisses: 12, clutter: 20, targetScale: 0.72, missPenalty: 650, hintPenalty: 4800, hint: '비슷한 EV 많음' },
};

const ZONES: Zone[] = [
  { name: 'charger-row', x: [5, 31], y: [8, 30], rotation: [-4, 5], weight: 0.9 },
  { name: 'north-lot', x: [34, 95], y: [8, 36], rotation: [-3, 4], weight: 1.35 },
  { name: 'mid-lot', x: [6, 94], y: [38, 64], rotation: [-3, 4], weight: 1.55 },
  { name: 'south-lot', x: [6, 94], y: [66, 91], rotation: [-3, 4], weight: 1.45 },
  { name: 'market-row', x: [5, 31], y: [70, 91], rotation: [-4, 5], weight: 0.8 },
  { name: 'entrance', x: [41, 61], y: [47, 56], rotation: [-10, 10], weight: 0.35, lane: true },
];

const PARKING_ROWS = [
  { zone: 'charger-row' as ZoneName, y: 15, xs: [9, 16, 23, 30], rotation: 0, priority: 0.96 },
  { zone: 'charger-row' as ZoneName, y: 27, xs: [9, 16, 23, 30], rotation: 0, priority: 0.9 },
  { zone: 'north-lot' as ZoneName, y: 12, xs: [42, 49, 56, 63, 70, 77, 84, 91], rotation: 0, priority: 1.0 },
  { zone: 'north-lot' as ZoneName, y: 24, xs: [39, 46, 53, 60, 67, 74, 81, 88, 95], rotation: 0, priority: 0.98 },
  { zone: 'north-lot' as ZoneName, y: 35, xs: [42, 49, 56, 63, 70, 77, 84, 91], rotation: 0, priority: 0.96 },
  { zone: 'mid-lot' as ZoneName, y: 43, xs: [10, 17, 24, 31, 38, 45, 52, 59, 66, 73, 80, 87], rotation: 0, priority: 1.0 },
  { zone: 'mid-lot' as ZoneName, y: 55, xs: [13, 20, 27, 34, 41, 48, 55, 62, 69, 76, 83, 90], rotation: 0, priority: 1.0 },
  { zone: 'south-lot' as ZoneName, y: 69, xs: [10, 17, 24, 31, 38, 45, 52, 59, 66, 73, 80, 87], rotation: 0, priority: 0.99 },
  { zone: 'south-lot' as ZoneName, y: 81, xs: [13, 20, 27, 34, 41, 48, 55, 62, 69, 76, 83, 90], rotation: 0, priority: 0.99 },
  { zone: 'market-row' as ZoneName, y: 91, xs: [8, 15, 22, 29, 36], rotation: 0, priority: 0.86 },
];

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#64748b', '#111827', '#f8fafc', '#facc15', '#fb7185', '#2dd4bf', '#a3e635', '#38bdf8', '#cbd5e1', '#d1d5db'];
const TARGET_COLORS = ['#e5e7eb', '#f8fafc', '#d6d3d1', '#cbd5e1', '#d8c9a5'];
const PROP_LABELS = ['EV', 'P3', 'ION', '5', 'TAXI', 'BUS', 'EXIT', 'NO 5'];

const GPT_ASSET_BASE = '/assets/cars/gpt/';
const TARGET_ASSETS = ['target-ioniq5-gpt-01.png', 'target-ioniq5-gpt-02.png'];
const DISTRACTOR_ASSETS = ['ev-distractor-gpt-01.png', 'ev-distractor-gpt-02.png', 'ev-distractor-gpt-03.png', 'ev-distractor-gpt-04.png', 'ev-distractor-gpt-05.png', 'ev-distractor-gpt-06.png', 'ev-distractor-gpt-07.png', 'ev-distractor-gpt-08.png', 'ev-distractor-gpt-09.png', 'ev-distractor-gpt-10.png', 'ev-distractor-gpt-11.png', 'ev-distractor-gpt-12.png', 'ev-distractor-gpt-13.png', 'ev-distractor-gpt-14.png', 'ev-distractor-gpt-15.png', 'ev-distractor-gpt-16.png'];
const NORMAL_ASSETS = ['car-gpt-01.png', 'car-gpt-02.png', 'car-gpt-03.png', 'car-gpt-04.png', 'car-gpt-05.png', 'car-gpt-06.png', 'car-gpt-07.png', 'car-gpt-08.png', 'car-gpt-09.png', 'car-gpt-10.png', 'car-gpt-11.png', 'car-gpt-12.png', 'car-gpt-13.png'];
const TAXI_ASSETS = ['taxi-gpt-01.png', 'taxi-gpt-02.png'];
const BUS_ASSETS = ['bus-gpt-01.png', 'bus-gpt-02.png'];
const TRUCK_ASSETS = ['truck-gpt-01.png', 'truck-gpt-02.png', 'truck-gpt-03.png'];

function assetUrl(file: string) {
  return `${GPT_ASSET_BASE}${file}`;
}

function vehicleAsset(kind: VehicleKind, rand: () => number) {
  if (kind === 'target') return assetUrl(pick(TARGET_ASSETS, rand));
  if (kind === 'ioniq-like') return assetUrl(pick(DISTRACTOR_ASSETS, rand));
  if (kind === 'taxi') return assetUrl(pick(TAXI_ASSETS, rand));
  if (kind === 'bus') return assetUrl(pick(BUS_ASSETS, rand));
  if (kind === 'truck') return assetUrl(pick(TRUCK_ASSETS, rand));
  return assetUrl(pick(NORMAL_ASSETS, rand));
}

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

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function vehicleFootprint(scale: number, difficulty: Difficulty) {
  const squeeze = difficulty === 'hard' ? 0.92 : difficulty === 'normal' ? 1.0 : 1.08;
  return { x: 4.9 * scale * squeeze, y: 6.5 * scale * squeeze };
}

function vehiclesOverlap(a: { x: number; y: number; scale: number }, b: { x: number; y: number; scale: number }, difficulty: Difficulty) {
  const af = vehicleFootprint(a.scale, difficulty);
  const bf = vehicleFootprint(b.scale, difficulty);
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx < af.x + bf.x && dy < af.y + bf.y;
}

function parkingSlots(rand: () => number, difficulty: Difficulty) {
  const jitterX = difficulty === 'hard' ? 0.9 : difficulty === 'normal' ? 0.65 : 0.45;
  const jitterY = difficulty === 'hard' ? 0.8 : difficulty === 'normal' ? 0.55 : 0.35;
  const slots: ParkingSlot[] = [];

  PARKING_ROWS.forEach((row, rowIndex) => {
    row.xs.forEach((x, col) => {
      const edgePenalty = col === 0 || col === row.xs.length - 1 ? 0.04 : 0;
      slots.push({
        id: `${row.zone}-${rowIndex}-${col}`,
        zone: row.zone,
        x: x + (rand() - 0.5) * jitterX,
        y: row.y + (rand() - 0.5) * jitterY,
        rotation: row.rotation + (rand() - 0.5) * (difficulty === 'hard' ? 3.5 : 2.2),
        row: rowIndex,
        col,
        priority: row.priority - edgePenalty + rand() * 0.08,
      });
    });
  });

  return slots.sort((a, b) => b.priority - a.priority || rand() - 0.5);
}

function pullSlot(slots: ParkingSlot[], vehicles: Vehicle[], rand: () => number, difficulty: Difficulty, protectedTarget: boolean) {
  const windowSize = protectedTarget ? Math.min(28, slots.length) : Math.min(difficulty === 'hard' ? 24 : 18, slots.length);
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < windowSize; i += 1) {
    const slot = slots[i];
    const candidate = { x: slot.x, y: slot.y, scale: protectedTarget ? 0.72 : 0.56 };
    const blockers = vehicles.filter((other) => protectedTarget || other.kind === 'target' || other.kind === 'ioniq-like');
    const collisions = blockers.filter((other) => vehiclesOverlap(candidate, other, difficulty)).length;
    const nearest = blockers.reduce((min, other) => Math.min(min, distance(candidate, other)), Number.POSITIVE_INFINITY);
    const randomness = rand() * 0.35;
    const score = collisions * 100 - nearest * 0.18 + i * 0.18 + randomness;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return slots.splice(bestIndex, 1)[0] ?? { id: 'fallback', zone: 'mid-lot' as ZoneName, x: 50, y: 50, rotation: 0, row: 0, col: 0, priority: 0 };
}

function zoneSlot(zone: Zone, index: number, rand: () => number, difficulty: Difficulty) {
  const width = zone.x[1] - zone.x[0];
  const height = zone.y[1] - zone.y[0];
  const cols = Math.max(3, Math.floor(width / (difficulty === 'hard' ? 8.5 : 10.5)));
  const rows = Math.max(2, Math.floor(height / (difficulty === 'hard' ? 8.2 : 10.2)));
  const col = index % cols;
  const row = Math.floor(index / cols) % rows;
  const cellW = width / cols;
  const cellH = height / rows;
  const jitter = difficulty === 'hard' ? 0.22 : 0.16;

  return {
    x: zone.x[0] + cellW * (col + 0.5) + (rand() - 0.5) * cellW * jitter,
    y: zone.y[0] + cellH * (row + 0.5) + (rand() - 0.5) * cellH * jitter,
  };
}

function generateVehicles(seed: number, difficulty: Difficulty): Board {
  const rand = mulberry32(seed);
  const config = DIFFICULTY[difficulty];
  const vehicles: Vehicle[] = [];
  const kinds: VehicleKind[] = ['sedan', 'hatch', 'van', 'truck', 'taxi', 'bus'];
  const targetIndex = Math.floor(rand() * config.cars);
  const nearMissSlots = new Set<number>();
  const zoneCounts: Record<ZoneName, number> = { 'north-lot': 0, 'mid-lot': 0, 'south-lot': 0, entrance: 0, 'charger-row': 0, 'market-row': 0 };
  const slots = parkingSlots(rand, difficulty);

  while (nearMissSlots.size < config.nearMisses) {
    const slot = Math.floor(rand() * config.cars);
    if (slot !== targetIndex) nearMissSlots.add(slot);
  }

  for (let i = 0; i < config.cars; i += 1) {
    const isTarget = i === targetIndex;
    const nearMiss = nearMissSlots.has(i);
    const kind: VehicleKind = isTarget ? 'target' : nearMiss ? 'ioniq-like' : pick(kinds, rand);
    const scale = isTarget ? config.targetScale : nearMiss ? 0.62 + rand() * 0.08 : 0.5 + rand() * 0.08;
    const slot = pullSlot(slots, vehicles, rand, difficulty, isTarget || nearMiss);
    const rotation = slot.rotation + (isTarget ? 0 : (rand() - 0.5) * 1.8);
    const asset = vehicleAsset(kind, rand);

    vehicles.push({
      id: isTarget ? 'ioniq5-target' : `car-${i}`,
      kind,
      x: slot.x,
      y: slot.y,
      rotation,
      scale,
      color: isTarget ? pick(TARGET_COLORS, rand) : nearMiss ? pick(TARGET_COLORS, rand) : pick(COLORS, rand),
      roof: nearMiss ? pick(['#94a3b8', '#cbd5e1', '#475569'], rand) : pick(['#0f172a', '#1f2937', '#e2e8f0', '#93c5fd', '#fde68a'], rand),
      mirror: rand() > 0.5,
      zone: slot.zone,
      occluded: false,
      asset,
    });
  }

  const props: SceneProp[] = [];
  for (let i = 0; i < config.clutter; i += 1) {
    const zone = weightedZone(rand);
    const kind = pick<PropKind>(['cone', 'person', 'charger', 'sign', 'cart', 'tree', 'crosswalk'], rand);
    const point = zoneSlot(zone, zoneCounts[zone.name]++, rand, difficulty);
    props.push({
      id: `prop-${i}`,
      kind,
      x: Math.min(96, Math.max(4, point.x)),
      y: Math.min(93, Math.max(6, point.y)),
      rotation: between(zone.rotation, rand),
      scale: 0.45 + rand() * 0.28,
      label: kind === 'sign' ? pick(PROP_LABELS, rand) : undefined,
    });
  }

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

function CarSvg({ car, found, onPick }: { car: Vehicle; found: boolean; onPick: (car: Vehicle) => void; preview?: boolean }) {
  const isTarget = car.kind === 'target';
  const isNearMiss = car.kind === 'ioniq-like';
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
      <img className="car-sprite" src={car.asset} alt="" draggable={false} />
    </button>
  );
}

function ScenePropView({ prop }: { prop: SceneProp }) {
  return <div className={`scene-prop prop-${prop.kind}`} style={{ left: `${prop.x}%`, top: `${prop.y}%`, transform: `translate(-50%, -50%) rotate(${prop.rotation}deg) scale(${prop.scale})`, zIndex: Math.round(prop.y * 10) + 10 }}>{prop.label}</div>;
}

function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [seed, setSeed] = useState(() => Date.now() % 1_000_000);
  const [startedAt, setStartedAt] = useState<number | null>(() => performance.now());
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
      `차량 힌트: ${board.target.asset.includes('silver') ? '실버' : '화이트'} 계열 각진 EV예요`,
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
  const targetPreview: Vehicle = { id: 'preview', kind: 'target', x: 50, y: 50, rotation: 0, scale: 1, color: '#e5e7eb', roof: '#94a3b8', mirror: false, zone: 'charger-row', occluded: false, asset: assetUrl('target-ioniq5-gpt-01.png') };

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
            <div className="parking-grid" />
            <div className="drive-aisle aisle-top" />
            <div className="drive-aisle aisle-mid" />
            <div className="drive-aisle aisle-bottom" />
            <div className="zone charging-zone"><b>EV CHARGE</b></div>
            <div className="zone market-zone"><b>MARKET</b></div>
            <div className="zone parking-zone"><b>PARKING P3</b></div>
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
