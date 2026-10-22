# Weekly Goal Tracker — Design

Date: 2026-10-21

## Purpose
A personal, single-user, phone-friendly web app (PWA) for planning each week: a list of goals to accomplish, checkable, plus free-form notes per week. Used at the start of the week to set goals, during the week to tick them off and jot notes, and later to look back at past weeks.

## Decisions (from discussion)
- Platform: installable, offline-capable PWA; data stored on-device.
- Weeks run Monday–Sunday.
- New weeks are populated from a **recurring template** of goals; one-off goals can be added per week.
- Goals can need multiple completions per week via a target count (e.g. 3×/week); no per-day record of which days.
- Out of scope: accounts, cross-device sync, reminders, categories, streaks/stats, week-start setting, per-day completion log.

## Approach
Single-file vanilla PWA, no build step: `index.html` (markup, CSS, JS), `manifest.webmanifest`, `sw.js`, icons. Date/week logic lives in a small pure module (`weeks.js`) so it can be unit-tested in Node.

## UI
**Week view (main screen)**
- Header: week range (e.g. "Oct 19 – 25"), prev/next arrows, "This week" button.
- Progress bar: "N of M done".
- Goal list: template-derived goals show a small marker; one-off goals can be added inline; any goal can be edited (text, target) or deleted for that week.
- Each goal has a **target count** (integer ≥ 1, default 1). Target 1 renders as a plain tappable checkbox. Target ≥ 2 renders as "count / target" with a tap-to-increment button and an undo (decrement). A goal is done when count ≥ target; count never goes below 0.
- Progress bar counts a goal as done only when its target is reached.
- Weekly notes textarea at the bottom, autosaved on input (debounced).

**Template screen**
- Add, edit (text, target count), reorder, remove recurring goals.
- Changes affect only weeks created afterwards.

**Data tools**
- Export JSON / Import JSON buttons (manual backup and cross-device transfer).

## Behavior
- Opening a week that does not exist creates it from the current template (count 0, target copied from the template) and stores it. Viewing a future/past week with no record follows the same rule.
- Existing weeks are never modified by template edits.
- Past weeks stay fully editable.

## Data model
One JSON object under a single `localStorage` key:
```
{
  version: 1,
  template: [{ id, text, target }],
  weeks: {
    "2026-10-19": {            // Monday date, ISO
      goals: [{ id, text, target, count, fromTemplate }],   // done = count >= target
      notes: "..."
    }
  }
}
```
Import validates `version` and shape before replacing data, and asks for confirmation first.

## PWA
- Service worker caches the app shell (cache-first) for offline use; cache name is versioned.
- Manifest with name, icons (192/512), `display: standalone`, theme colors.

## Error handling
- If `localStorage` is unavailable or a write fails, show a visible banner; do not silently drop data.
- Corrupt stored JSON: keep the raw value under a backup key, start fresh, and tell the user.

## Testing
- Node unit tests for `weeks.js`: Monday-of-week for any date (incl. Sunday, year boundaries, DST), prev/next week, week range label, week creation from template, count increment/decrement bounds, done/progress calculation with targets > 1.
- Manual browser check: add/check/edit/delete goals, notes persistence across reload, template flow, export/import round trip, offline load, phone-width layout.

## Known limitation
Data is per device; phone and computer do not share goals except via manual Export/Import.
