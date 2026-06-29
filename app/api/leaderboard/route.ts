import { NextRequest, NextResponse } from 'next/server';
import { list, put } from '@vercel/blob';

type Leader = {
  name: string;
  timeMs: number;
  moves: number;
  seed: number;
  createdAt: string;
};

const KEY = 'leaderboard/ioniq5-leaders.json';
const memoryLeaders: Leader[] = [];

function cleanEntry(input: Partial<Leader>): Leader | null {
  const name = String(input.name ?? 'Anonymous').trim().slice(0, 20) || 'Anonymous';
  const timeMs = Number(input.timeMs);
  const moves = Number(input.moves);
  const seed = Number(input.seed);
  const createdAt = String(input.createdAt ?? new Date().toISOString());
  if (!Number.isFinite(timeMs) || timeMs < 100 || timeMs > 10 * 60 * 1000) return null;
  if (!Number.isFinite(moves) || moves < 1 || moves > 500) return null;
  return { name, timeMs: Math.round(timeMs), moves: Math.round(moves), seed: Number.isFinite(seed) ? Math.round(seed) : 0, createdAt };
}

function rank(entries: Leader[]) {
  return entries
    .filter((entry) => Number.isFinite(entry.timeMs))
    .sort((a, b) => a.timeMs - b.timeMs || a.moves - b.moves)
    .slice(0, 10);
}

async function readBlobLeaders(): Promise<Leader[] | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const found = await list({ prefix: KEY, limit: 1 });
  const blob = found.blobs.find((item) => item.pathname === KEY);
  if (!blob) return [];
  const res = await fetch(`${blob.url}?ts=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.leaders) ? rank(data.leaders) : [];
}

async function writeBlobLeaders(leaders: Leader[]) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return false;
  await put(KEY, JSON.stringify({ leaders, updatedAt: new Date().toISOString() }, null, 2), {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
  });
  return true;
}

export async function GET() {
  try {
    const blobLeaders = await readBlobLeaders();
    return NextResponse.json({ leaders: blobLeaders ?? rank(memoryLeaders), persistent: Boolean(blobLeaders) });
  } catch (error) {
    return NextResponse.json({ leaders: rank(memoryLeaders), persistent: false, error: 'blob-fallback' });
  }
}

export async function POST(request: NextRequest) {
  const entry = cleanEntry(await request.json().catch(() => ({})));
  if (!entry) return NextResponse.json({ error: 'invalid score' }, { status: 400 });

  try {
    const current = (await readBlobLeaders()) ?? rank(memoryLeaders);
    const leaders = rank([...current, entry]);
    const persisted = await writeBlobLeaders(leaders);
    if (!persisted) {
      memoryLeaders.length = 0;
      memoryLeaders.push(...leaders);
    }
    return NextResponse.json({ leaders, persistent: persisted });
  } catch (error) {
    const leaders = rank([...memoryLeaders, entry]);
    memoryLeaders.length = 0;
    memoryLeaders.push(...leaders);
    return NextResponse.json({ leaders, persistent: false, error: 'memory-fallback' });
  }
}
