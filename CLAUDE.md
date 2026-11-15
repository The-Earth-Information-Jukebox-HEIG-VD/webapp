# webapp — CLAUDE.md

## Audio playback gotchas (`src/audio/ChunkPlayer.ts`)

- The zone-data response carries no duration: one bar = one month = 3 s (`SECONDS_PER_MONTH`), so a chunk lasts `months(time_period -> next_time_period) * 3 s`. The last chunk runs up to the month after the enabled tracks' last data, capped at the decoded audio.
- Chunk N+1 is scheduled at chunkStart + that length (the ~1.7 s reverb tail overlaps on purpose), prefetched at 20%; `next_time_period: null` = end. Requests are aborted on seek / zone / track change.
- The AudioContext must be created on the first `play()` (browser autoplay policy) — never at module load or mount.
- There is no per-track volume: the backend returns one mixed file.
- API types in `src/services/sonificationApi.ts` mirror `../sonification/backend/FRONTEND_API.md`; update them together.

## Accessibility component rules (WCAG 2.1 AA is mandatory)

- **Forms**: every `<input>` has an associated `<label>` (`htmlFor`/`id` or wrap).
- **Buttons**: semantic `<button>`; `aria-label` when icon-only.
- **Modals**: trap focus, close on Escape, `aria-modal="true"`.
- **Charts/visualizations**: include a hidden `<table>` with the full data.
- **Audio/sonification**: provide an `AudioTranscript` explaining the mapping.
- **Dynamic content**: `aria-live` regions for status updates.
- Player controls must keep: Space (play/pause), arrows (seek), Home/End (jump); `?` opens `KeyboardShortcuts`.
- In `npm run dev`, axe-core logs violations to the browser console — check it after UI changes.
