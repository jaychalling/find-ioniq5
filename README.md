# Find IONIQ 5

A browser game inspired by “Where's Waldo?”: find the Hyundai IONIQ 5 hidden among many colourful car-like SVG/DOM vehicles.

## Features

- Random board every round: position, rotation, scale, colours, and decoys change each time.
- The target is not a static photo; all vehicles are generated as DOM/SVG-like CSS drawings.
- Timer-based scoring.
- Leaderboard API with Vercel Blob persistence when `BLOB_READ_WRITE_TOKEN` is configured.
- Local/in-memory fallback for development.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy

This app is optimized for Vercel.

For persistent global leaderboard, create a Vercel Blob store and set `BLOB_READ_WRITE_TOKEN` in the Vercel project environment variables. Without it, the game still works but leaderboard persistence depends on local/session fallback.
