# webapp — CLAUDE.md

## Audio playback gotchas (`src/audio/ChunkPlayer.ts`)

- The zone-data response carries no duration: one bar = one month = 3 s (`SECONDS_PER_MONTH`), so a chunk lasts `months(time_period -> next_time_period) * 3 s`. The last chunk runs up to the month after the enabled tracks' last data, capped at the decoded audio.
- Chunk N+1 is scheduled at chunkStart + that length (the ~1.7 s reverb tail overlaps on purpose), prefetched at 20%; `next_time_period: null` = end. Requests are aborted on seek / zone / track change.
- The AudioContext must be created on the first `play()` (browser autoplay policy) — never at module load or mount.
- iOS mutes Web Audio under the silent/ringer switch ("ambient" session): `play()` must, synchronously in the gesture, request `navigator.audioSession.type = 'playback'` or start the silent `<audio>` fallback (`src/audio/iosAudioUnlock.ts`). An `'interrupted'` context (call, Siri, lock screen) pauses the player.
- There is no per-track volume: the backend returns one mixed file.
- API types in `src/services/sonificationApi.ts` mirror `../sonification/backend/FRONTEND_API.md`; update them together.

## Accessibility component rules (WCAG 2.1 AA is mandatory)

- **Forms**: every `<input>` has an associated `<label>` (`htmlFor`/`id` or wrap).
- **Buttons**: semantic `<button>`; `aria-label` when icon-only.
- **Dialogs**: close on Escape and give focus back to the trigger. A true modal (`aria-modal="true"`) also traps focus. The `DatePicker` popover is a non-modal `role="dialog"` (no `aria-modal`, no focus trap): it closes on Escape, outside click or Tab out. Known issue: the global Escape handler in `GlobeView.tsx` only skips when an `aria-modal` is open, so Escape in the date picker also returns to zone selection.
- **Charts/visualizations**: include a hidden `<table>` with the full data.
- **Audio/sonification**: the text alternatives are the `sr-only` data tables and summaries (`SeriesChart.tsx` table + `graph.summary`, `GlobeView.tsx` table) plus `aria-live` announcements. `AudioTranscript` is a legacy, unused component.
- **Dynamic content**: `aria-live` regions for status updates.
- Player controls must keep: Space (play/pause), arrows (seek), Home/End (jump), M (mute), handled in `AudioPlayerEnhanced.tsx`; Escape returns to zone selection (`GlobeView.tsx`). On the timeline slider: arrows 2%, Shift+arrows 1 month, PageUp/PageDown 1 year (`Timeline.tsx`). There is no `?` shortcut: `KeyboardShortcuts` is a legacy, unused component.
- In `npm run dev`, axe-core logs violations to the browser console — check it after UI changes.
