# Easy Cal v2 — design

A calm, ADHD-friendly day planner that combines a calendar, a "right now" focus card,
a time-blocking strip and a focus timer. It is a rebuild of
`city-time-focus-planner.ascii.chatgpt.site`, styled to match Mission Board
(`asciikat.github.io/todo`).

## Decisions

| Question | Decision |
|---|---|
| What should it do better? | Both: a sharper planner **and** a focus / time-blocking tool |
| ADHD style | Calm and low-pressure. One thing at a time, no guilt screens, nothing turns red |
| Relationship to the todo app | Separate app (e.g. `asciikat.github.io/calendar`), same look, fonts and Firebase project later |
| Main screen | "Right Now" first (approach A) |
| Reminders | None. The user watches the screen; "leave by" is shown as text only |
| Kept from Easy Cal | Day / Week / Month / 2 Month / 3 Month / Year views, Now + Next vs All events filter, events-only by default with a **Show full calendar** toggle, the event types, the multi-day end date |

## Architecture

* Static site, no build step: `index.html` (markup, styles, UI), `core.js` (pure logic, no DOM),
  `sw.js` (offline), `manifest.webmanifest` + `icons/` (installable PWA).
* `core.js` holds everything testable: date maths, the quick-add parser, schedule maths
  (right now / free gaps / slots / lanes), item normalisation, the store and backup merge.
  Tests live in `tests/` and run in a browser (`tests/index.html`).
* Look: Mission Board palette (`--night`, `--asphalt`, `--neon`, `--flare`, `--gold`, `--palm`,
  `--cash`, `--dusk`), Big Shoulders Display / Barlow Condensed / Barlow, cut-corner panels,
  the time-of-day canvas skyline in the hero.

## Data

One record shape for events and tasks:

```
{ id, title, date|null, endDate|null, time|null, durationMin|null, travelMin|null,
  type: personal|appointment|health|task|adventure,
  status: open|done|slipped|dismissed, notes, deleted, createdAt, updatedAt }
```

* No `date` means an open task (lives on the Open tasks shelf).
* `date` + `time` (single day) is a timed block; `date` without time is "any time";
  `endDate` makes it multi-day.
* Deletes are soft (`deleted: true`). `updatedAt` is strictly increasing per record, so a
  later Firebase sync — and the backup merge today — is "newest `updatedAt` wins" per id.
* Saved to `localStorage` (`easycal.v1`). If storage is blocked the app still runs in memory
  and says so.

### Slipping

When a scheduled item's end passes while it is still `open`, it becomes `slipped` and moves
to a quiet, collapsed **Slipped by** list with: *Done it*, *Later today* (next free slot),
*Tomorrow*, *Let go* (`dismissed`), plus *Let them all go*. No counters, no red.

## Screens

1. **HUD** — sticky bar with a big live clock and day, focus-timer and settings buttons.
2. **Hero** — skyline canvas that follows the time of day, date eyebrow, "EASY CAL" title.
3. **Right Now card** — shows one thing, in priority order: on now → user's pick → up next →
   any-time today → clear runway. Shrinking time bar + plain-words countdown
   ("starts in 40 min", "20 min left"). Travel time turns the countdown into "leave in…" and
   then "time to go". Actions: Start focus, Done, Push 15 min / +15 min, Pick for me.
   One small "after that" line.
4. **Quick add** — one field ("dentist 3pm tomorrow"), live preview of what was understood
   before saving, "more options" opens the full form (end date, time, length, travel, type,
   notes).
5. **Today strip** — horizontal timeline with hour marks, a now line, past shaded, events as
   blocks (lanes for overlaps), visible free gaps (tap to add), "free time left today".
   Drag an open task by its grip onto the strip to time-block it; *Slot it* does the same
   without dragging (next free slot).
6. **Open tasks** — the shelf of undated tasks, with Pick for me, focus, slot it, done.
7. **Slipped by** — as above; only appears when something slipped.
8. **Calendar** — prev / Today / next, six views, Now + Next vs All events, Show full calendar
   toggle, "N in range". Events-only shows an agenda of days that have something; full
   calendar shows every day (hour list, week columns, month grids, 12 mini months), empty
   days dimmed. Tapping a day opens it in Day view; tapping an item opens the edit form.
9. **Focus mode** — full-screen, task name, ring countdown, 10/25/45/custom presets,
   pause, "I need a break" (break screen), end. When time is up: soft chime (only if sound
   is on), "nice work", **Mark done** / +10 min / Not done yet. Survives a reload.
10. **Settings** — 12/24-hour clock, week start, sound (off by default), default length,
    default focus length, backup save / merge, install, clear everything. Sync shown as
    "coming later".

## Accessibility

Large tap targets (≥ 44 px), keyboard-reachable everything (drag has a button alternative),
visible focus rings, `prefers-reduced-motion` respected, high-contrast text, no colour-only
meaning, no red for anything late.

## Testing

`core.js` is covered by browser-run unit tests (dates, parser, schedule maths, store, merge).
Screens are checked by hand in the browser at phone and desktop widths, using the
`?now=YYYY-MM-DDTHH:MM` override to pin the clock.

## Out of scope (for now)

Reminders / notifications, Firebase sync (data shape is ready for it), recurring events,
reading the todo app's jobs.
