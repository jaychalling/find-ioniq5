# Find the IONIQ 5

A browser game inspired by *Where's Waldo?*: find the hidden Hyundai IONIQ 5 among hundreds of colorful generated cars.

## Features

- Randomized city-lot layout every round
- Generated SVG/CSS vehicles, not a single static image
- Distinct IONIQ 5 target with pixel lamps and angular EV shape
- Timer and local leaderboard saved in `localStorage`
- Difficulty levels controlling crowd density
- Responsive playfield for desktop and mobile

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Notes

The leaderboard is local-device based. A shared global leaderboard can be added later with a database-backed API such as Vercel Postgres, Supabase, or Upstash Redis.
