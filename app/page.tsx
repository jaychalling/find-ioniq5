"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Car = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  width: number;
  color: string;
  target: boolean;
};

type Leader = {
  name: string;
  timeMs: number;
  moves: number;
  seed: number;
  createdAt: string;
};

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#64748b", "#111827", "#ffffff", "#a3e635", "#fb7185", "#2dd4bf"
];

function mulberry32(seed: number) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeed() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0];
  }
  return Math.floor(Math.random() * 2 ** 32);
}

function generateCars(seed: number, count = 142): Car[] {
  const rand = mulberry32(seed);
  const targetIndex = Math.floor(rand() * count);
  return Array.from({ length: count }, (_, index) => {
    const target = index === targetIndex;
    const margin = 6;
    return {
      id: `${seed}-${index}`,
      x: margin + rand() * (100 - margin * 2),
      y: margin + rand() * (100 - margin * 2),
      rotation: -35 + rand() * 70,
      scale: target ? 0.86 + rand() * 0.1 : 0.72 + rand() * 0.42,
      width: target ? 82 : 58 + rand() * 34,
      color: target ? "#5bdcff" : COLORS[Math.floor(rand() * COLORS.length)],
      target,
    };
  }).sort((a, b) => a.y - b.y);
}

function formatTime(ms: number) {
  const seconds = ms / 1000;
  return `${seconds.toFixed(2)}s`;
}

function CarShape({ car }: { car: Car }) {
  return (
    <div className={car.target ? "car target" : "car"} aria-hidden="true">
      <div className="cabin" />
      <div className="body" />
      <div className="stripe" />
      <div className="light back" />
      <div className="light front" />
      {car.target ? (
        <>
          <div className="pixel-lights"><i /><i /><i /><i /></div>
          <div className="nameplate">IONIQ 5</div>
        </>
      ) : null}
      <div className="wheel left" />
      <div className="wheel right" />
    </div>
  );
}

export default function Home() {
  const [seed, setSeed] = useState(() => makeSeed());
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [moves, setMoves] = useState(0);
  const [found, setFound] = useState<{ timeMs: number; x: number; y: number } | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [name, setName] = useState("");
  const [toast, setToast] = useState("");
  const boardRef = useRef<HTMLDivElement | null>(null);

  const cars = useMemo(() => generateCars(seed), [seed]);
  const elapsed = found ? found.timeMs : now - startedAt;

  const loadLeaders = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!res.ok) throw new Error("leaderboard unavailable");
      const data = await res.json();
      setLeaders(data.leaders ?? []);
    } catch {
      const local = localStorage.getItem("ioniq5-leaders");
      setLeaders(local ? JSON.parse(local) : []);
    }
  }, []);

  useEffect(() => { loadLeaders(); }, [loadLeaders]);

  useEffect(() => {
    if (found) return;
    const id = window.setInterval(() => setNow(Date.now()), 47);
    return () => window.clearInterval(id);
  }, [found]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const reset = useCallback(() => {
    setSeed(makeSeed());
    setStartedAt(Date.now());
    setNow(Date.now());
    setMoves(0);
    setFound(null);
    setToast("New board generated");
  }, []);

  const handleCarClick = (car: Car, event: React.MouseEvent<HTMLButtonElement>) => {
    if (found) return;
    setMoves((m) => m + 1);
    if (!car.target) {
      setToast("Not that one — keep hunting");
      return;
    }
    const rect = boardRef.current?.getBoundingClientRect();
    const x = rect ? event.clientX - rect.left : 0;
    const y = rect ? event.clientY - rect.top : 0;
    setFound({ timeMs: Date.now() - startedAt, x, y });
    setToast("IONIQ 5 found!");
  };

  const submitScore = async () => {
    if (!found) return;
    const safeName = name.trim().slice(0, 20) || "Anonymous";
    const entry: Leader = { name: safeName, timeMs: found.timeMs, moves, seed, createdAt: new Date().toISOString() };
    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error("submit failed");
      const data = await res.json();
      setLeaders(data.leaders ?? []);
      setToast("Saved to leaderboard");
    } catch {
      const merged = [...leaders, entry].sort((a, b) => a.timeMs - b.timeMs).slice(0, 10);
      localStorage.setItem("ioniq5-leaders", JSON.stringify(merged));
      setLeaders(merged);
      setToast("Saved locally");
    }
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="title-card">
          <div className="eyebrow">Where's Waldo-style car hunt</div>
          <h1>Find<br />IONIQ 5</h1>
          <p className="subtitle">
            Somewhere inside this traffic swarm is a Hyundai IONIQ 5. It is drawn as a real generated car shape, not a pasted photo. Every round shuffles the board, colours, scale, and position.
          </p>
          <div className="rules">
            <span className="pill">Random board every round</span>
            <span className="pill">142 generated vehicles</span>
            <span className="pill">Fastest time wins</span>
          </div>
        </div>
        <div className="score-card">
          <div className="stat-row">
            <div className="stat"><label>Time</label><b>{formatTime(elapsed)}</b></div>
            <div className="stat"><label>Clicks</label><b>{moves}</b></div>
            <div className="stat"><label>Seed</label><b>#{String(seed).slice(-4)}</b></div>
          </div>
          <div className="actions">
            <button className="primary" onClick={reset}>Shuffle board</button>
            <button className="secondary" onClick={loadLeaders}>Refresh leaderboard</button>
          </div>
        </div>
      </section>

      <section className="game-layout">
        <div className="board-wrap">
          <div className="board" ref={boardRef} aria-label="Find the hidden Hyundai IONIQ 5 on the board">
            {cars.map((car) => (
              <button
                key={car.id}
                className="car-button"
                type="button"
                aria-label={car.target ? "Hidden Hyundai IONIQ 5" : "Colourful decoy car"}
                onClick={(event) => handleCarClick(car, event)}
                style={{
                  "--x": `${car.x}%`,
                  "--y": `${car.y}%`,
                  "--r": `${car.rotation}deg`,
                  "--s": String(car.scale),
                  "--w": `${car.width}px`,
                  "--c": car.color,
                } as React.CSSProperties}
              >
                <CarShape car={car} />
              </button>
            ))}
            {found ? <div className="found-ring" style={{ "--fx": `${found.x}px`, "--fy": `${found.y}px` } as React.CSSProperties} /> : null}
          </div>
        </div>

        <aside className="side">
          {found ? (
            <div className="finish-card">
              <h2>Found in {formatTime(found.timeMs)}</h2>
              <p className="empty">Leave your name and claim a spot on the leaderboard.</p>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={20} />
              <div className="actions">
                <button className="primary" onClick={submitScore}>Save score</button>
                <button className="secondary" onClick={reset}>Play again</button>
              </div>
            </div>
          ) : null}

          <div className="leader-card">
            <h2>Leaderboard</h2>
            {leaders.length ? (
              <ol className="leader-list">
                {leaders.map((leader, index) => (
                  <li className="leader-item" key={`${leader.createdAt}-${index}`}>
                    <span className="rank">{index + 1}</span>
                    <span><span className="player">{leader.name}</span><br /><span className="meta">{leader.moves} clicks · #{String(leader.seed).slice(-4)}</span></span>
                    <span className="time">{formatTime(leader.timeMs)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty">No scores yet. Find the IONIQ 5 first and set the pace.</p>
            )}
          </div>
        </aside>
      </section>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}
