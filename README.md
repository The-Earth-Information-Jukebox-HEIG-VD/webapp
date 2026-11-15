# EarthChestra – Webapp

Web interface of **EarthChestra**, the app of the Earth Information Jukebox project (NASA Space Apps Challenge 2026, HEIG-VD). Pick a zone on a 3D globe, choose datasets, and listen to them played by an orchestra. The music is composed by the [sonification backend](https://github.com/The-Earth-Information-Jukebox-HEIG-VD/sonification). While it plays, the globe draws the zone's data as coloured dots, one colour per dataset.

Full technical documentation: <https://the-earth-information-jukebox-heig-vd.github.io/documentation>

## Features

- 3D globe ([react-globe.gl](https://github.com/vasturiano/react-globe.gl) / three.js) and an accessible list view to select a continent, country, ocean or sea
- Sounds panel ("What do you want to hear?"): one dataset per instrument; the music arrives from the backend in chunks played back to back (Web Audio API)
- Zone series chart: the Graph toggle shows the zone's values over time, full width, with a data table for screen readers
- Date picker ("Go to a date") to jump to any month of the timeline
- Big zones are sent to the backend as a compact `mask` (a few kB instead of megabytes of points, `src/utils/zoneMask.ts`)
- iOS silent-switch handling: playback stays audible when the ringer switch is on silent (`src/audio/iosAudioUnlock.ts`)
- In development: a vinyl experience mode, where one month of data plays as a record whose grooves cross the globe. The backend endpoint exists (`POST /api/zones/groove`, API v2.6); the webapp side is not merged yet
- During playback, the zone's values from the datasets volume are drawn on the globe, in step with the music
- English, French and German (i18next)
- Built for WCAG 2.1 AA: keyboard shortcuts (Space, ←/→, Home/End, M, Escape), screen reader announcements, data tables for the globe

## Getting started

Requirements: Node.js and npm (the Docker image builds with Node 22).

```bash
npm install
npm run dev        # http://localhost:5173
```

The app needs two things to be fully usable:

1. **The sonification backend** for the music. By default the dev build calls `http://localhost:8000/api` (set in `.env.development`). Start it from the root of the [`sonification`](https://github.com/The-Earth-Information-Jukebox-HEIG-VD/sonification) repository, cloned next to this one:
   ```bash
   cd ../sonification && uvicorn backend.app:app --reload --port 8000
   ```
2. **The datasets** for the globe. The dev server serves `../datasets/data` (the [`datasets`](https://github.com/The-Earth-Information-Jukebox-HEIG-VD/datasets) repository cloned next to this one) at `/data/`. Use another folder with:
   ```bash
   JUKEBOX_DATA_DIR=/path/to/datasets/data npm run dev
   ```
   `JUKEBOX_DATA_DIR` must be set in the shell: the dev server does not read it from `.env` files.

## Configuration

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `VITE_API_URL` | app (build time) | `/api` | Base URL of the sonification API. `.env.development` sets `http://localhost:8000/api`; the Docker image **requires** it as a build argument. |
| `VITE_DATA_URL` | app (build time) | `/data` | Optional. Base URL of the datasets (monthly `.npy` maps, read with HTTP Range requests). The Docker build does not pass it, so the image always uses `/data`. |
| `JUKEBOX_DATA_DIR` | dev server | `../datasets/data` | Folder served at `/data/` by `npm run dev`. |

Put local overrides of the `VITE_*` variables in `.env.development.local` (git-ignored). See `.env.example`.

When `VITE_API_URL` is relative (e.g. `/api`), the dev server proxies `/api` to `http://localhost:8000`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload (port 5173) |
| `npm run build` | Type-check (`tsc`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint, including `jsx-a11y` accessibility rules (no warnings allowed) |
| `npm run test` | Vitest (jsdom, Testing Library, jest-axe) |
| `npm run test:audio` | Only tests whose name contains `audio` (case-sensitive) |
| `npm run test:a11y` | Only tests whose name contains `accessibility` (case-sensitive) |

## Docker

The image builds the app with Node and serves it with nginx on port 80. `VITE_API_URL` is required:

```bash
docker build --build-arg VITE_API_URL=/api -t earthchestra-webapp .
```

nginx (`nginx.conf`):

- `/` – the app (single-page fallback to `index.html`)
- `/api/` – proxied to `http://backend:8000/api/`
- `/data/` – the datasets volume, mounted at `/usr/share/nginx/data` (JSON directory listings, Range requests)
- `/health` – returns `healthy` (the image's own `HEALTHCHECK` probes `/`)

To run the whole stack (webapp, backend, datasets), use the [`deployment`](https://github.com/The-Earth-Information-Jukebox-HEIG-VD/deployment) repository: `docker compose up -d` with the published images, or `./scripts/run-local.sh` to build from the sibling repositories.

## Project structure

```
src/
├── main.tsx, App.tsx   entry point and app shell
├── components/         UI: about, controls, layout, moments, player, visualization (globe, list)
│                       (the root files AudioPlayer, DataSelector, DataVisualizer, InfoPanel, KeyboardShortcuts and AudioTranscript are legacy and unused)
├── hooks/              useSonification, useInstruments, useZoneDataFrames, useHashRoute, …
├── services/           sonificationApi.ts (backend client), volumeData.ts (datasets reader)
├── audio/              ChunkPlayer.ts (plays the backend's audio chunks), iosAudioUnlock.ts (iOS silent switch)
├── data/               dataset registry (colours, units), key moments, zone outlines (Natural Earth)
├── utils/              .npy parser, geometry, zone grid cells, zone mask, formatting
├── i18n/               translations (en, fr, de)
├── contexts/           accessibility and view mode
├── styles/             CSS variables, accessibility, animations
├── types/              shared TypeScript types
└── test/               test setup and fixtures
```

## Accessibility

Accessibility is a requirement: every UI change should keep keyboard navigation, visible focus, screen reader support and colour contrast. `npm run lint` checks the `jsx-a11y` rules, component tests run axe (jest-axe), and in development `@axe-core/react` checks the first page render and logs violations to the browser console. That package does not support React 18 and later, so views rendered afterwards are not re-checked: use a browser extension such as axe DevTools for those.
