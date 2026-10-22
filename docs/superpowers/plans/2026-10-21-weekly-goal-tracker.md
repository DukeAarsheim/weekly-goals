# Weekly Goal Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user, phone-friendly, offline-capable PWA for weekly goals (with per-goal target counts, a recurring template, and weekly notes).

**Architecture:** Vanilla ES modules, no build step. Pure logic modules (`weeks.js`, `goals.js`, `storage.js`) are unit-tested with Node's built-in test runner; `app.js` is a thin DOM layer over them. All data is one JSON object in `localStorage`. A cache-first service worker + manifest make it installable and offline.

**Tech Stack:** HTML/CSS/JS (ES modules), Node ≥ 18 (`node:test`) for tests and a zero-dependency dev server, Web App Manifest, Service Worker.

**Spec:** `docs/superpowers/specs/2026-10-21-weekly-goal-tracker-design.md`

## Global Constraints

- Weeks run Monday–Sunday; a week is keyed by its Monday as ISO `YYYY-MM-DD` (local time).
- Goal shape: `{ id, text, target, count, fromTemplate }`; template goal shape: `{ id, text, target }`; done = `count >= target`; target is an integer ≥ 1 (default 1); count never below 0.
- Storage: single `localStorage` object `{ version: 1, template: [], weeks: { "<monday>": { goals: [], notes: "" } } }`.
- No accounts, sync, reminders, categories, streaks/stats, week-start setting, or per-day completion log.
- Opening a week that doesn't exist creates it from the current template (count 0) and stores it; template edits never modify existing weeks; past weeks stay editable.
- Storage failures show a visible banner; corrupt stored JSON is backed up under a separate key and the app starts fresh with a notice.
- Import validates version and shape and requires confirmation before replacing data.
- Service worker is cache-first with a versioned cache name; offline load must work.
- User-entered text must only ever be inserted with `textContent` (never `innerHTML`).

## Review Focus

1. Blank or whitespace-only goal text → rejected, never stored (Task 2 tests, Task 4 dialog).
2. Garbage target input (0, negative, decimal, empty, non-numeric) → normalized to a valid integer ≥ 1 (Task 2 tests).
3. Goal text containing HTML/quotes (e.g. `<img onerror=…>`, `"`) → displayed literally, never executed (Task 2 test, Task 4 manual check).
4. Importing a non-JSON, wrong-shape, or wrong-version file → existing data left untouched, clear error shown (Task 3 tests, Task 5).
5. Sunday, month-end and year-end dates → land in the correct Monday-based week (Task 1 tests).

---

## File Structure

```
package.json            scripts: test, start
weeks.js                pure date/week helpers
goals.js                pure goal/template/week operations
storage.js              localStorage load/save, validation, import/export
app.js                  DOM layer: state, rendering, events, SW registration
index.html              markup (week view, template view, dialogs)
styles.css              mobile-first styles, light/dark
manifest.webmanifest    PWA manifest
sw.js                   service worker (cache-first)
icons/icon-192.png      generated
icons/icon-512.png      generated
scripts/make-icons.js   generates the PNG icons (no dependencies)
scripts/serve.js        zero-dependency static dev server
tests/weeks.test.js
tests/goals.test.js
tests/storage.test.js
```

---

### Task 1: Project setup and week helpers

**Files:**
- Create: `package.json`, `.gitignore`, `weeks.js`, `tests/weeks.test.js`

**Interfaces:**
- Consumes: nothing
- Produces (all exported from `weeks.js`):
  - `toISODate(d: Date): string` — local `YYYY-MM-DD`
  - `parseISODate(s: string): Date` — local midnight; throws `Error` on malformed or impossible dates
  - `mondayOf(d: Date): Date` — local midnight of that week's Monday
  - `weekKey(d: Date): string` — `toISODate(mondayOf(d))`
  - `addWeeks(key: string, n: number): string` — key shifted by n weeks
  - `weekLabel(key: string, now?: Date): string` — e.g. `Oct 19 – 25`, `Oct 26 – Nov 1`, with `, YYYY` (end-date year) appended when the start or end year differs from `now`'s year

- [ ] **Step 1: Initialize the project**

```bash
git init
```

Create `package.json`:

```json
{
  "name": "weekly-goals",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "start": "node scripts/serve.js"
  }
}
```

Create `.gitignore`:

```
node_modules/
```

- [ ] **Step 2: Write the failing tests**

Create `tests/weeks.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toISODate, parseISODate, mondayOf, weekKey, addWeeks, weekLabel } from '../weeks.js';

test('toISODate pads month and day', () => {
  assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05');
});

test('parseISODate round-trips and returns local midnight', () => {
  const d = parseISODate('2026-10-19');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 19);
  assert.equal(d.getHours(), 0);
});

test('parseISODate rejects malformed and impossible dates', () => {
  assert.throws(() => parseISODate('nope'));
  assert.throws(() => parseISODate('2026-2-3'));
  assert.throws(() => parseISODate('2026-02-31'));
});

test('mondayOf: midweek date maps to that week\'s Monday', () => {
  // 2026-10-21 is a Wednesday
  assert.equal(toISODate(mondayOf(new Date(2026, 9, 21, 15, 30))), '2026-10-19');
});

test('mondayOf: Monday maps to itself', () => {
  assert.equal(toISODate(mondayOf(new Date(2026, 9, 19))), '2026-10-19');
});

test('mondayOf: Sunday belongs to the week that started the previous Monday', () => {
  assert.equal(toISODate(mondayOf(new Date(2026, 9, 25, 23, 59))), '2026-10-19');
});

test('weekKey crosses year boundary (Fri 2027-01-01 -> Mon 2026-12-28)', () => {
  assert.equal(weekKey(new Date(2027, 0, 1)), '2026-12-28');
});

test('weekKey crosses month boundary', () => {
  assert.equal(weekKey(new Date(2026, 10, 1)), '2026-10-26'); // Sun Nov 1
});

test('addWeeks moves forward and back', () => {
  assert.equal(addWeeks('2026-10-19', 1), '2026-10-26');
  assert.equal(addWeeks('2026-10-19', -1), '2026-10-12');
  assert.equal(addWeeks('2026-10-19', 0), '2026-10-19');
});

test('addWeeks is stable across DST change and year end', () => {
  assert.equal(addWeeks('2026-10-26', 1), '2026-11-02'); // US DST ends Nov 1
  assert.equal(addWeeks('2026-03-02', 2), '2026-03-16'); // US DST starts Mar 8
  assert.equal(addWeeks('2026-12-28', 1), '2027-01-04');
});

test('weekLabel: same month', () => {
  assert.equal(weekLabel('2026-10-19', new Date(2026, 9, 21)), 'Oct 19 – 25');
});

test('weekLabel: spans months', () => {
  assert.equal(weekLabel('2026-10-26', new Date(2026, 9, 21)), 'Oct 26 – Nov 1');
});

test('weekLabel: adds year when it differs from now', () => {
  assert.equal(weekLabel('2026-12-28', new Date(2026, 9, 21)), 'Dec 28 – Jan 3, 2027');
  assert.equal(weekLabel('2025-10-20', new Date(2026, 9, 21)), 'Oct 20 – 26, 2025');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `../weeks.js`.

- [ ] **Step 4: Implement `weeks.js`**

```js
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toISODate(d) {
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) throw new Error(`Invalid date: ${s}`);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (toISODate(d) !== s) throw new Error(`Invalid date: ${s}`);
  return d;
}

export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sinceMonday = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - sinceMonday);
  return d;
}

export function weekKey(date) {
  return toISODate(mondayOf(date));
}

export function addWeeks(key, n) {
  const d = parseISODate(key);
  d.setDate(d.getDate() + 7 * n);
  return toISODate(d);
}

export function weekLabel(key, now = new Date()) {
  const start = parseISODate(key);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const from = `${MONTHS[start.getMonth()]} ${start.getDate()}`;
  const to = start.getMonth() === end.getMonth()
    ? `${end.getDate()}`
    : `${MONTHS[end.getMonth()]} ${end.getDate()}`;
  const yearDiffers = start.getFullYear() !== now.getFullYear() || end.getFullYear() !== now.getFullYear();
  return `${from} – ${to}${yearDiffers ? `, ${end.getFullYear()}` : ''}`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all `weeks.test.js` tests green.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore weeks.js tests/weeks.test.js docs
git commit -m "feat: project setup and Monday-based week helpers"
```

---

### Task 2: Goal and template logic

**Files:**
- Create: `goals.js`, `tests/goals.test.js`

**Interfaces:**
- Consumes: nothing (pure; no imports)
- Produces (all exported from `goals.js`). `data` means the storage object `{version, template, weeks}`; `goals` is an array of week goals; `template` is an array of `{id,text,target}`:
  - `newId(): string`
  - `normalizeTarget(value: any): number` — integer ≥ 1, else 1
  - `cleanText(text: any): string` — trimmed string
  - `isDone(goal): boolean`
  - `increment(goal): goal`, `decrement(goal): goal` (floor 0), `toggle(goal): goal` (done → count 0, else count = target)
  - `progress(goals): { done: number, total: number }`
  - `createWeekFromTemplate(template): { goals, notes: '' }`
  - `ensureWeek(data, key: string): data` — returns the same `data` reference if the week exists, else a new object with the week added
  - `addGoal(goals, text, target): goals` — appends `{id,text,target,count:0,fromTemplate:false}`; returns the same array if text is blank
  - `addTemplateGoal(template, text, target): template` — same, shape `{id,text,target}`
  - `editGoal(list, id, { text, target }): list` — works for both lists; blank text → same list returned unchanged; keeps `count`
  - `deleteGoal(list, id): list`
  - `moveGoal(list, id, delta: number): list` — swaps with neighbor; out-of-range → same list

- [ ] **Step 1: Write the failing tests**

Create `tests/goals.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newId, normalizeTarget, cleanText, isDone, increment, decrement, toggle, progress,
  createWeekFromTemplate, ensureWeek, addGoal, addTemplateGoal, editGoal, deleteGoal, moveGoal,
} from '../goals.js';

const goal = (over = {}) => ({ id: 'g', text: 'x', target: 1, count: 0, fromTemplate: false, ...over });

test('newId returns distinct non-empty strings', () => {
  const a = newId(); const b = newId();
  assert.ok(a && b && a !== b);
});

test('normalizeTarget coerces garbage to a valid integer >= 1', () => {
  const cases = [[1, 1], [3, 3], ['4', 4], [2.9, 2], [0, 1], [-5, 1], ['', 1], ['abc', 1], [null, 1], [undefined, 1], [Infinity, 1], [NaN, 1]];
  for (const [input, expected] of cases) assert.equal(normalizeTarget(input), expected, String(input));
});

test('cleanText trims and tolerates non-strings', () => {
  assert.equal(cleanText('  hi  '), 'hi');
  assert.equal(cleanText(null), '');
  assert.equal(cleanText(undefined), '');
});

test('isDone is count >= target', () => {
  assert.equal(isDone(goal({ target: 3, count: 2 })), false);
  assert.equal(isDone(goal({ target: 3, count: 3 })), true);
  assert.equal(isDone(goal({ target: 3, count: 4 })), true);
});

test('increment/decrement; decrement never goes below 0', () => {
  assert.equal(increment(goal({ count: 1 })).count, 2);
  assert.equal(decrement(goal({ count: 2 })).count, 1);
  assert.equal(decrement(goal({ count: 0 })).count, 0);
});

test('increment/decrement do not mutate the input', () => {
  const g = goal({ count: 1 });
  increment(g); decrement(g);
  assert.equal(g.count, 1);
});

test('toggle flips a target-1 goal between 0 and 1', () => {
  assert.equal(toggle(goal({ target: 1, count: 0 })).count, 1);
  assert.equal(toggle(goal({ target: 1, count: 1 })).count, 0);
});

test('progress counts only goals that reached their target', () => {
  const goals = [goal({ id: 'a', target: 3, count: 2 }), goal({ id: 'b', target: 3, count: 3 }), goal({ id: 'c', target: 1, count: 1 })];
  assert.deepEqual(progress(goals), { done: 2, total: 3 });
  assert.deepEqual(progress([]), { done: 0, total: 0 });
});

test('createWeekFromTemplate copies text/target, zeroes count, marks fromTemplate, uses new ids', () => {
  const template = [{ id: 't1', text: 'Gym', target: 3 }, { id: 't2', text: 'Read', target: 1 }];
  const week = createWeekFromTemplate(template);
  assert.equal(week.notes, '');
  assert.equal(week.goals.length, 2);
  assert.deepEqual(week.goals.map(g => [g.text, g.target, g.count, g.fromTemplate]), [['Gym', 3, 0, true], ['Read', 1, 0, true]]);
  assert.notEqual(week.goals[0].id, 't1');
  assert.notEqual(week.goals[0].id, week.goals[1].id);
});

test('createWeekFromTemplate with an empty template gives an empty goal list', () => {
  assert.deepEqual(createWeekFromTemplate([]).goals, []);
});

test('ensureWeek creates a missing week once and keeps existing weeks as-is', () => {
  const data = { version: 1, template: [{ id: 't', text: 'Gym', target: 3 }], weeks: {} };
  const withWeek = ensureWeek(data, '2026-10-19');
  assert.equal(withWeek.weeks['2026-10-19'].goals.length, 1);
  assert.deepEqual(data.weeks, {}); // input not mutated
  assert.equal(ensureWeek(withWeek, '2026-10-19'), withWeek); // same reference
});

test('template edits after creation do not change existing weeks', () => {
  const data = ensureWeek({ version: 1, template: [{ id: 't', text: 'Gym', target: 3 }], weeks: {} }, '2026-10-19');
  const edited = { ...data, template: editGoal(data.template, 't', { text: 'Run', target: 5 }) };
  assert.equal(edited.weeks['2026-10-19'].goals[0].text, 'Gym');
  assert.equal(ensureWeek(edited, '2026-10-26').weeks['2026-10-26'].goals[0].text, 'Run');
});

test('addGoal trims text and normalizes target', () => {
  const out = addGoal([], '  Stretch ', '0');
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].text, out[0].target, out[0].count, out[0].fromTemplate], ['Stretch', 1, 0, false]);
});

test('addGoal ignores blank and whitespace-only text', () => {
  const list = [goal()];
  assert.equal(addGoal(list, '', 1), list);
  assert.equal(addGoal(list, '   \t ', 1), list);
});

test('goal text with HTML/quotes is stored verbatim (UI inserts via textContent)', () => {
  const evil = '<img src=x onerror="alert(1)"> & "quotes"';
  assert.equal(addGoal([], evil, 1)[0].text, evil);
});

test('addTemplateGoal has template shape and ignores blank text', () => {
  const out = addTemplateGoal([], 'Gym', 3);
  assert.deepEqual(Object.keys(out[0]).sort(), ['id', 'target', 'text']);
  assert.equal(out[0].target, 3);
  const list = [];
  assert.equal(addTemplateGoal(list, '  ', 1), list);
});

test('editGoal updates text/target, keeps count, rejects blank text', () => {
  const list = [goal({ id: 'a', text: 'Old', target: 2, count: 2 })];
  const out = editGoal(list, 'a', { text: ' New ', target: '5' });
  assert.deepEqual([out[0].text, out[0].target, out[0].count], ['New', 5, 2]);
  assert.equal(editGoal(list, 'a', { text: '  ', target: 5 }), list);
  assert.equal(editGoal(list, 'a', { text: 'ok', target: -3 })[0].target, 1);
});

test('deleteGoal removes by id', () => {
  const list = [goal({ id: 'a' }), goal({ id: 'b' })];
  assert.deepEqual(deleteGoal(list, 'a').map(g => g.id), ['b']);
});

test('moveGoal swaps with neighbor and ignores out-of-range moves', () => {
  const list = [goal({ id: 'a' }), goal({ id: 'b' }), goal({ id: 'c' })];
  assert.deepEqual(moveGoal(list, 'b', -1).map(g => g.id), ['b', 'a', 'c']);
  assert.deepEqual(moveGoal(list, 'b', 1).map(g => g.id), ['a', 'c', 'b']);
  assert.equal(moveGoal(list, 'a', -1), list);
  assert.equal(moveGoal(list, 'c', 1), list);
  assert.equal(moveGoal(list, 'zzz', 1), list);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `../goals.js`.

- [ ] **Step 3: Implement `goals.js`**

```js
export function newId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function normalizeTarget(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function cleanText(text) {
  return String(text ?? '').trim();
}

export function isDone(goal) {
  return goal.count >= goal.target;
}

export function increment(goal) {
  return { ...goal, count: goal.count + 1 };
}

export function decrement(goal) {
  return { ...goal, count: Math.max(0, goal.count - 1) };
}

export function toggle(goal) {
  return { ...goal, count: isDone(goal) ? 0 : goal.target };
}

export function progress(goals) {
  return { done: goals.filter(isDone).length, total: goals.length };
}

export function createWeekFromTemplate(template) {
  return {
    goals: template.map(t => ({
      id: newId(),
      text: t.text,
      target: normalizeTarget(t.target),
      count: 0,
      fromTemplate: true,
    })),
    notes: '',
  };
}

export function ensureWeek(data, key) {
  if (data.weeks[key]) return data;
  return { ...data, weeks: { ...data.weeks, [key]: createWeekFromTemplate(data.template) } };
}

export function addGoal(goals, text, target) {
  const clean = cleanText(text);
  if (!clean) return goals;
  return [...goals, { id: newId(), text: clean, target: normalizeTarget(target), count: 0, fromTemplate: false }];
}

export function addTemplateGoal(template, text, target) {
  const clean = cleanText(text);
  if (!clean) return template;
  return [...template, { id: newId(), text: clean, target: normalizeTarget(target) }];
}

export function editGoal(list, id, { text, target }) {
  const clean = cleanText(text);
  if (!clean) return list;
  return list.map(g => (g.id === id ? { ...g, text: clean, target: normalizeTarget(target) } : g));
}

export function deleteGoal(list, id) {
  return list.filter(g => g.id !== id);
}

export function moveGoal(list, id, delta) {
  const from = list.findIndex(g => g.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const out = list.slice();
  [out[from], out[to]] = [out[to], out[from]];
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS for `weeks.test.js` and `goals.test.js`.

- [ ] **Step 5: Commit**

```bash
git add goals.js tests/goals.test.js
git commit -m "feat: goal, target-count and template logic"
```

---

### Task 3: Storage, validation, import/export

**Files:**
- Create: `storage.js`, `tests/storage.test.js`

**Interfaces:**
- Consumes: nothing (pure; takes a `Storage`-like object as a parameter so tests can fake it)
- Produces (all exported from `storage.js`):
  - Constants `STORAGE_KEY = 'weekly-goals:v1'`, `BACKUP_KEY = 'weekly-goals:corrupt-backup'`, `DATA_VERSION = 1`
  - `emptyData(): data`
  - `isValidData(obj: any): boolean`
  - `load(storage): { data, warning: null | 'unavailable' | 'corrupt' }` — `storage` may be `null`
  - `save(storage, data): boolean` — false if writing failed or storage is null
  - `exportJSON(data): string`
  - `importJSON(text: string): data` — throws `Error` with a user-readable message

- [ ] **Step 1: Write the failing tests**

Create `tests/storage.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, BACKUP_KEY, emptyData, isValidData, load, save, exportJSON, importJSON } from '../storage.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

const sample = () => ({
  version: 1,
  template: [{ id: 't1', text: 'Gym', target: 3 }],
  weeks: { '2026-10-19': { goals: [{ id: 'g1', text: 'Gym', target: 3, count: 1, fromTemplate: true }], notes: 'hi' } },
});

test('emptyData is valid', () => {
  assert.equal(isValidData(emptyData()), true);
});

test('isValidData accepts a good object and rejects bad shapes', () => {
  assert.equal(isValidData(sample()), true);
  assert.equal(isValidData(null), false);
  assert.equal(isValidData([]), false);
  assert.equal(isValidData({ ...sample(), version: 2 }), false);
  assert.equal(isValidData({ ...sample(), template: 'x' }), false);
  assert.equal(isValidData({ ...sample(), template: [{ id: 't', text: 'x', target: 0 }] }), false);
  assert.equal(isValidData({ ...sample(), weeks: [] }), false);
  assert.equal(isValidData({ ...sample(), weeks: { 'not-a-date': { goals: [], notes: '' } } }), false);
  assert.equal(isValidData({ ...sample(), weeks: { '2026-10-19': { goals: [], notes: 5 } } }), false);
  assert.equal(isValidData({ ...sample(), weeks: { '2026-10-19': { goals: [{ id: 'g', text: 'x', target: 1, count: -1, fromTemplate: false }], notes: '' } } }), false);
});

test('load: nothing stored -> empty data, no warning', () => {
  assert.deepEqual(load(fakeStorage()), { data: emptyData(), warning: null });
});

test('save then load round-trips', () => {
  const s = fakeStorage();
  assert.equal(save(s, sample()), true);
  assert.deepEqual(load(s), { data: sample(), warning: null });
});

test('load: corrupt JSON is backed up and replaced with empty data + warning', () => {
  const s = fakeStorage({ [STORAGE_KEY]: '{not json' });
  const result = load(s);
  assert.equal(result.warning, 'corrupt');
  assert.deepEqual(result.data, emptyData());
  assert.equal(s.getItem(BACKUP_KEY), '{not json');
});

test('load: valid JSON of wrong shape is treated as corrupt and backed up', () => {
  const raw = JSON.stringify({ version: 99 });
  const s = fakeStorage({ [STORAGE_KEY]: raw });
  assert.equal(load(s).warning, 'corrupt');
  assert.equal(s.getItem(BACKUP_KEY), raw);
});

test('load: storage that throws, or null storage -> unavailable', () => {
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(load(throwing).warning, 'unavailable');
  assert.equal(load(null).warning, 'unavailable');
});

test('save returns false when writing fails or storage is null', () => {
  const full = { getItem: () => null, setItem() { throw new Error('quota'); } };
  assert.equal(save(full, sample()), false);
  assert.equal(save(null, sample()), false);
});

test('exportJSON/importJSON round-trip', () => {
  assert.deepEqual(importJSON(exportJSON(sample())), sample());
});

test('importJSON rejects non-JSON, wrong shape, and wrong version with readable errors', () => {
  assert.throws(() => importJSON('not json at all'), /not valid JSON/);
  assert.throws(() => importJSON('{"hello":1}'), /not a Weekly Goals backup/);
  assert.throws(() => importJSON(JSON.stringify({ ...sample(), version: 2 })), /not a Weekly Goals backup/);
  assert.throws(() => importJSON(''), /not valid JSON/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `../storage.js`.

- [ ] **Step 3: Implement `storage.js`**

```js
export const STORAGE_KEY = 'weekly-goals:v1';
export const BACKUP_KEY = 'weekly-goals:corrupt-backup';
export const DATA_VERSION = 1;

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyData() {
  return { version: DATA_VERSION, template: [], weeks: {} };
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isTarget = n => Number.isInteger(n) && n >= 1;

function isTemplateGoal(g) {
  return isObject(g) && typeof g.id === 'string' && typeof g.text === 'string' && isTarget(g.target);
}

function isGoal(g) {
  return isTemplateGoal(g) && Number.isInteger(g.count) && g.count >= 0 && typeof g.fromTemplate === 'boolean';
}

function isWeek(w) {
  return isObject(w) && typeof w.notes === 'string' && Array.isArray(w.goals) && w.goals.every(isGoal);
}

export function isValidData(d) {
  if (!isObject(d) || d.version !== DATA_VERSION) return false;
  if (!Array.isArray(d.template) || !d.template.every(isTemplateGoal)) return false;
  if (!isObject(d.weeks)) return false;
  return Object.entries(d.weeks).every(([k, w]) => KEY_RE.test(k) && isWeek(w));
}

export function load(storage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { data: emptyData(), warning: 'unavailable' };
  }
  if (raw === null) return { data: emptyData(), warning: null };
  try {
    const parsed = JSON.parse(raw);
    if (isValidData(parsed)) return { data: parsed, warning: null };
  } catch {
    // fall through to the corrupt path
  }
  try { storage.setItem(BACKUP_KEY, raw); } catch { /* backup is best-effort */ }
  return { data: emptyData(), warning: 'corrupt' };
}

export function save(storage, data) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function exportJSON(data) {
  return JSON.stringify(data, null, 2);
}

export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isValidData(parsed)) throw new Error('That file is not a Weekly Goals backup.');
  return parsed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS for all three test files.

- [ ] **Step 5: Commit**

```bash
git add storage.js tests/storage.test.js
git commit -m "feat: storage layer with validation, corrupt-data backup, import/export"
```

---

### Task 4: App shell — week view, goal dialog, notes

**Files:**
- Create: `index.html`, `styles.css`, `app.js`, `scripts/serve.js`

**Interfaces:**
- Consumes: everything exported by `weeks.js`, `goals.js`, `storage.js` (signatures above)
- Produces: a working week view. `app.js` internal structure that Task 5 relies on (do not rename): `state = { data, key, view }`, `storage`, `commit(data)` (persist + render), `persist(data)`, `openWeek(key)`, `syncNotes()`, `flushNotes()`, `setBanner(kind, msg)`, `openGoalDialog(ctx)`, `commitTemplate(fn)`, `render()`, and the marker comment `// --- init ---` that Task 5 inserts code above. `index.html` already contains the template view, bottom nav, and data dialog markup used by Task 5.

There are no automated DOM tests; verification is done in the browser at the end of this task.

- [ ] **Step 1: Create the dev server `scripts/serve.js`**

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};
const port = Number(process.env.PORT) || 8080;

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const rel = normalize(path === '/' ? '/index.html' : path);
  if (rel.includes('..')) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(join(root, rel));
    res.writeHead(200, { 'Content-Type': types[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Serving on http://localhost:${port}`));
```

- [ ] **Step 2: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Weekly Goals</title>
  <meta name="theme-color" content="#2f6f5e">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icons/icon-192.png">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="banner" class="banner" role="alert" hidden></div>

  <header class="topbar" id="topbar">
    <button id="prev" class="icon-btn" aria-label="Previous week">‹</button>
    <div class="week-title">
      <h1 id="weekLabel"></h1>
      <button id="thisWeek" class="link" hidden>Back to this week</button>
    </div>
    <button id="next" class="icon-btn" aria-label="Next week">›</button>
  </header>

  <main id="weekView">
    <div class="progress">
      <div class="bar"><div id="barFill"></div></div>
      <span id="progressText"></span>
    </div>
    <ul id="goalList" class="goals"></ul>
    <p id="emptyState" class="empty" hidden>No goals yet. Add one below, or set up recurring goals under Template.</p>
    <button id="addGoal" class="primary wide">+ Add goal</button>
    <section class="notes">
      <label for="notes">Notes for this week</label>
      <textarea id="notes" rows="6" placeholder="How did the week go?"></textarea>
    </section>
  </main>

  <main id="templateView" hidden>
    <h1>Recurring goals</h1>
    <p class="hint">These are copied into every new week. Changes only affect weeks created afterwards.</p>
    <ul id="templateList" class="goals"></ul>
    <p id="templateEmpty" class="empty" hidden>No recurring goals yet.</p>
    <button id="addTemplate" class="primary wide">+ Add recurring goal</button>
  </main>

  <nav class="bottombar" aria-label="Main">
    <button id="navWeek">Week</button>
    <button id="navTemplate">Template</button>
    <button id="navData">Data</button>
  </nav>

  <dialog id="goalDialog">
    <form id="goalForm">
      <h2 id="goalDialogTitle">Add goal</h2>
      <label>Goal
        <input id="goalText" required pattern=".*\S.*" maxlength="200" autocomplete="off">
      </label>
      <label>Times per week
        <input id="goalTarget" type="number" inputmode="numeric" min="1" step="1" value="1">
      </label>
      <div class="actions">
        <button type="button" id="goalCancel">Cancel</button>
        <button type="submit" class="primary">Save</button>
      </div>
    </form>
  </dialog>

  <dialog id="dataDialog">
    <h2>Your data</h2>
    <p class="hint">Goals are stored only in this browser. Export a backup, or move your data to another device by importing it there.</p>
    <div class="actions column">
      <button id="exportBtn" class="primary">Export backup (JSON)</button>
      <button id="importBtn">Import backup…</button>
      <button id="dataClose">Close</button>
    </div>
  </dialog>
  <input type="file" id="importFile" accept="application/json,.json" hidden>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `styles.css`**

```css
:root {
  --bg: #f6f5f1; --fg: #1f2a26; --muted: #66726c; --card: #ffffff;
  --accent: #2f6f5e; --accent-fg: #ffffff; --border: #dcdad2; --danger: #b3382c;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141a18; --fg: #e8ece9; --muted: #9aa8a1; --card: #1d2623;
    --accent: #4aa88e; --accent-fg: #0b1511; --border: #2e3a36; --danger: #e07a6e;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  padding-bottom: calc(72px + env(safe-area-inset-bottom));
}
main, .topbar, .banner { max-width: 560px; margin-inline: auto; padding-inline: 16px; }
h1 { font-size: 1.25rem; margin: 0; }
h2 { margin-top: 0; }
button, input, textarea { font: inherit; color: inherit; }
button {
  border: 1px solid var(--border); background: var(--card); border-radius: 10px;
  padding: 10px 14px; min-height: 44px; cursor: pointer;
}
button.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
button.wide { width: 100%; margin: 12px 0; }
button.link { border: 0; background: none; color: var(--accent); min-height: 0; padding: 2px 0; font-size: .875rem; }
button.icon-btn { width: 44px; padding: 0; font-size: 1.5rem; line-height: 1; }
button.small { min-height: 36px; min-width: 36px; padding: 4px 8px; }
button.danger { color: var(--danger); }

.banner { background: #fff3cd; color: #5c4400; padding-block: 10px; font-size: .9rem; max-width: none; }
@media (prefers-color-scheme: dark) { .banner { background: #4a3d10; color: #ffe9a8; } }

.topbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-block: 12px; }
.week-title { text-align: center; }

.progress { display: flex; align-items: center; gap: 12px; margin: 4px 0 12px; }
.bar { flex: 1; height: 10px; border-radius: 5px; background: var(--border); overflow: hidden; }
#barFill { height: 100%; width: 0; background: var(--accent); transition: width .2s; }
#progressText { font-size: .875rem; color: var(--muted); white-space: nowrap; }

.goals { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.goal {
  display: flex; align-items: center; gap: 10px; background: var(--card);
  border: 1px solid var(--border); border-radius: 12px; padding: 8px 10px;
}
.goal input[type=checkbox] { width: 24px; height: 24px; accent-color: var(--accent); flex: none; }
.goal .text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.goal.done .text { text-decoration: line-through; color: var(--muted); }
.goal .tag { font-size: .75rem; color: var(--muted); }
.counter { display: flex; align-items: center; gap: 6px; flex: none; }
.counter .count { min-width: 3.2em; text-align: center; font-variant-numeric: tabular-nums; }
.empty, .hint { color: var(--muted); }

.notes { margin-top: 20px; }
.notes label { display: block; font-weight: 600; margin-bottom: 6px; }
textarea {
  width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 10px;
  background: var(--card); resize: vertical;
}

.bottombar {
  position: fixed; inset: auto 0 0 0; display: flex; justify-content: center; gap: 8px;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
  background: var(--card); border-top: 1px solid var(--border);
}
.bottombar button { flex: 1; max-width: 180px; }
.bottombar button[aria-current=page] { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }

dialog {
  border: 1px solid var(--border); border-radius: 14px; background: var(--card); color: var(--fg);
  width: min(92vw, 420px); padding: 18px;
}
dialog::backdrop { background: rgba(0, 0, 0, .45); }
dialog label { display: block; margin-bottom: 12px; font-weight: 600; }
dialog input {
  display: block; width: 100%; margin-top: 4px; padding: 10px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--bg);
}
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.actions.column { flex-direction: column; }
```

- [ ] **Step 4: Create `app.js`**

```js
import { toISODate, weekKey, addWeeks, weekLabel } from './weeks.js';
import {
  ensureWeek, addGoal, addTemplateGoal, editGoal, deleteGoal, moveGoal,
  increment, decrement, toggle, isDone, progress, cleanText,
} from './goals.js';
import { load, save, exportJSON, importJSON } from './storage.js';

const $ = id => document.getElementById(id);

function getStorage() {
  try { return window.localStorage; } catch { return null; }
}
const storage = getStorage();

const state = { data: null, key: weekKey(new Date()), view: 'week' };
let notesTimer = null;
let dialogContext = null; // { kind: 'week' | 'template', id: string | null }
let bannerKind = null;

// ---------- banner ----------
function setBanner(kind, msg) {
  bannerKind = kind;
  $('banner').textContent = msg;
  $('banner').hidden = false;
}
function clearBanner(kind) {
  if (bannerKind !== kind) return;
  bannerKind = null;
  $('banner').hidden = true;
}

// ---------- persistence ----------
function persist(data) {
  state.data = data;
  if (save(storage, data)) clearBanner('save');
  else setBanner('save', "Couldn't save your changes. Storage may be full or blocked in this browser — export a backup if you can.");
}

function commit(data) {
  persist(data);
  render();
}

function updateGoals(fn) {
  const week = state.data.weeks[state.key];
  commit({ ...state.data, weeks: { ...state.data.weeks, [state.key]: { ...week, goals: fn(week.goals) } } });
}

function commitTemplate(fn) {
  commit({ ...state.data, template: fn(state.data.template) });
}

// ---------- notes ----------
function flushNotes() {
  clearTimeout(notesTimer);
  notesTimer = null;
  const text = $('notes').value;
  const week = state.data.weeks[state.key];
  if (!week || week.notes === text) return;
  persist({ ...state.data, weeks: { ...state.data.weeks, [state.key]: { ...week, notes: text } } });
}

function syncNotes() {
  clearTimeout(notesTimer);
  notesTimer = null;
  $('notes').value = state.data.weeks[state.key].notes;
}

$('notes').addEventListener('input', () => {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(flushNotes, 400);
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNotes(); });
window.addEventListener('pagehide', flushNotes);
$('notes').addEventListener('blur', flushNotes);

// ---------- week navigation ----------
function openWeek(key) {
  if (state.data.weeks[state.key]) flushNotes();
  state.key = key;
  commit(ensureWeek(state.data, key));
  syncNotes();
}

$('prev').addEventListener('click', () => openWeek(addWeeks(state.key, -1)));
$('next').addEventListener('click', () => openWeek(addWeeks(state.key, 1)));
$('thisWeek').addEventListener('click', () => openWeek(weekKey(new Date())));

// ---------- rendering ----------
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, ariaLabel, onClick, className = 'small') {
  const b = el('button', className, label);
  b.type = 'button';
  b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', onClick);
  return b;
}

function goalRow(goal) {
  const li = el('li', 'goal' + (isDone(goal) ? ' done' : ''));
  const mapGoal = fn => updateGoals(gs => gs.map(g => (g.id === goal.id ? fn(g) : g)));

  if (goal.target === 1) {
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = isDone(goal);
    cb.setAttribute('aria-label', `Mark "${goal.text}" done`);
    cb.addEventListener('change', () => mapGoal(toggle));
    li.append(cb);
  }

  const text = el('span', 'text', goal.text);
  li.append(text);
  if (goal.fromTemplate) {
    const tag = el('span', 'tag', '↻');
    tag.title = 'Recurring goal';
    li.append(tag);
  }

  if (goal.target > 1) {
    const counter = el('div', 'counter');
    counter.append(
      button('−', `Decrease count for "${goal.text}"`, () => mapGoal(decrement)),
      el('span', 'count', `${goal.count} / ${goal.target}`),
      button('+', `Increase count for "${goal.text}"`, () => mapGoal(increment)),
    );
    li.append(counter);
  }

  li.append(
    button('✎', `Edit "${goal.text}"`, () => openGoalDialog({ kind: 'week', id: goal.id })),
    button('✕', `Delete "${goal.text}"`, () => {
      if (confirm(`Delete "${goal.text}" from this week?`)) updateGoals(gs => deleteGoal(gs, goal.id));
    }, 'small danger'),
  );
  return li;
}

function renderWeek() {
  const week = state.data.weeks[state.key];
  const { done, total } = progress(week.goals);
  $('weekLabel').textContent = weekLabel(state.key);
  $('thisWeek').hidden = state.key === weekKey(new Date());
  $('progressText').textContent = total ? `${done} of ${total} done` : 'No goals';
  $('barFill').style.width = total ? `${(done / total) * 100}%` : '0%';
  $('emptyState').hidden = total > 0;
  $('goalList').replaceChildren(...week.goals.map(goalRow));
}

function render() { renderWeek(); }

// ---------- goal dialog ----------
function openGoalDialog(ctx) {
  dialogContext = ctx;
  const list = ctx.kind === 'week' ? state.data.weeks[state.key].goals : state.data.template;
  const existing = ctx.id ? list.find(g => g.id === ctx.id) : null;
  $('goalDialogTitle').textContent = existing ? 'Edit goal' : (ctx.kind === 'week' ? 'Add goal' : 'Add recurring goal');
  $('goalText').value = existing ? existing.text : '';
  $('goalTarget').value = existing ? existing.target : 1;
  $('goalDialog').showModal();
  $('goalText').focus();
}

$('goalCancel').addEventListener('click', () => $('goalDialog').close());

$('goalForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('goalText').value;
  const target = $('goalTarget').value;
  if (!cleanText(text)) { $('goalText').focus(); return; }
  const { kind, id } = dialogContext;
  if (kind === 'week') {
    updateGoals(gs => (id ? editGoal(gs, id, { text, target }) : addGoal(gs, text, target)));
  } else {
    commitTemplate(t => (id ? editGoal(t, id, { text, target }) : addTemplateGoal(t, text, target)));
  }
  $('goalDialog').close();
});

$('addGoal').addEventListener('click', () => openGoalDialog({ kind: 'week', id: null }));

// --- init ---
const loaded = load(storage);
state.data = loaded.data;
if (loaded.warning === 'unavailable') {
  setBanner('startup', "Storage is unavailable in this browser, so your goals won't be saved.");
} else if (loaded.warning === 'corrupt') {
  setBanner('startup', "Your saved data couldn't be read, so the app started fresh. The old data was kept as a backup in this browser.");
}
state.data = ensureWeek(state.data, state.key);
persist(state.data);
syncNotes();
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
```

Note: `toISODate`, `exportJSON`, `importJSON`, `moveGoal` are imported now but first used in Task 5; unused imports are harmless in browsers.

- [ ] **Step 5: Start the server and verify the week view in the browser**

Run: `npm start` (leave running; use `run_in_background`). Open `http://localhost:8080` in the built-in browser. Use `resize_window` with the mobile preset (375×812) for the phone check, then reset to desktop.

Verify each item:
1. Header shows "Oct 19 – 25" (for the week containing today) and no "Back to this week" link; ‹ / › change the label by a week and show the link; the link returns to the current week.
2. "No goals" progress text and the empty-state message appear. (A service-worker 404 for `sw.js` in the console is expected until Task 6.)
3. + Add goal → type "Gym", set times per week to 3 → Save. Row shows `0 / 3` with − and +; tapping + three times strikes the row through and the progress reads "1 of 1 done"; − steps back; − at 0 stays at 0.
4. Add "Read" with times = 1 → checkbox row; tick/untick works.
5. Add a goal with whitespace-only text → the dialog stays open and nothing is added.
6. Add a goal named `<img src=x onerror="alert(1)"> & "q"` → it displays literally, no alert fires.
7. ✎ edits text and target; ✕ asks for confirmation then deletes.
8. Type notes, reload the page → notes and goals persist. Navigate to another week and back → each week keeps its own notes.
9. No console errors other than the `sw.js` 404 (use `read_console_messages`).

Expected: every item behaves as described.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css app.js scripts/serve.js
git commit -m "feat: week view with target-count goals, goal dialog and autosaved notes"
```

---

### Task 5: Template view and data tools

**Files:**
- Modify: `app.js` (replace `render`, insert code above `// --- init ---`)

**Interfaces:**
- Consumes: `state`, `commit`, `commitTemplate`, `openGoalDialog`, `flushNotes`, `syncNotes`, `persist`, `setBanner`, `el`, `button`, `renderWeek` from Task 4; `moveGoal`, `deleteGoal`, `toISODate`, `exportJSON`, `importJSON`, `ensureWeek` imports already present.
- Produces: bottom-nav view switching, template management UI, Export/Import.

- [ ] **Step 1: Replace the `render` function**

In `app.js`, replace

```js
function render() { renderWeek(); }
```

with

```js
function templateRow(goal) {
  const li = el('li', 'goal');
  li.append(el('span', 'text', goal.text));
  if (goal.target > 1) li.append(el('span', 'tag', `×${goal.target}/wk`));
  li.append(
    button('↑', `Move "${goal.text}" up`, () => commitTemplate(t => moveGoal(t, goal.id, -1))),
    button('↓', `Move "${goal.text}" down`, () => commitTemplate(t => moveGoal(t, goal.id, 1))),
    button('✎', `Edit "${goal.text}"`, () => openGoalDialog({ kind: 'template', id: goal.id })),
    button('✕', `Delete "${goal.text}"`, () => {
      if (confirm(`Remove "${goal.text}" from your recurring goals? Existing weeks are not changed.`)) {
        commitTemplate(t => deleteGoal(t, goal.id));
      }
    }, 'small danger'),
  );
  return li;
}

function renderTemplate() {
  const template = state.data.template;
  $('templateList').replaceChildren(...template.map(templateRow));
  $('templateEmpty').hidden = template.length > 0;
}

function render() {
  const onWeek = state.view === 'week';
  $('weekView').hidden = !onWeek;
  $('topbar').hidden = !onWeek;
  $('templateView').hidden = onWeek;
  $('navWeek').setAttribute('aria-current', onWeek ? 'page' : 'false');
  $('navTemplate').setAttribute('aria-current', onWeek ? 'false' : 'page');
  if (onWeek) renderWeek(); else renderTemplate();
}
```

- [ ] **Step 2: Insert navigation and data-tool code immediately above `// --- init ---`**

```js
// ---------- bottom navigation ----------
$('navWeek').addEventListener('click', () => { state.view = 'week'; render(); });
$('navTemplate').addEventListener('click', () => {
  flushNotes();
  state.view = 'template';
  render();
});
$('addTemplate').addEventListener('click', () => openGoalDialog({ kind: 'template', id: null }));

// ---------- data: export / import ----------
$('navData').addEventListener('click', () => $('dataDialog').showModal());
$('dataClose').addEventListener('click', () => $('dataDialog').close());

$('exportBtn').addEventListener('click', () => {
  flushNotes();
  const blob = new Blob([exportJSON(state.data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `weekly-goals-${toISODate(new Date())}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('importBtn').addEventListener('click', () => $('importFile').click());

$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let imported;
  try {
    imported = importJSON(await file.text());
  } catch (err) {
    alert(err.message);
    return;
  }
  if (!confirm('Replace all current goals and notes with the contents of this file?')) return;
  state.data = imported;
  clearTimeout(notesTimer);
  notesTimer = null;
  commit(ensureWeek(imported, state.key));
  syncNotes();
  $('dataDialog').close();
});
```

- [ ] **Step 3: Verify in the browser** (server from Task 4 still running; reload the page)

1. Tap Template: top week bar hides, "Recurring goals" shows with an empty message. Add "Gym" ×3, "Journal" ×1, "Plan week" ×1. ↑/↓ reorder (top row's ↑ and bottom row's ↓ do nothing). ✎ edits; ✕ asks to confirm.
2. Tap Week, then › to next week: it contains Gym `0 / 3`, Journal, Plan week, each with the ↻ tag, in template order. Tick one, then go back to the template and rename "Gym" → "Run": the next week still shows "Gym"; the week after (›) shows "Run".
3. Template goals added with a blank/whitespace name are rejected (same dialog behavior as Task 4).
4. Data → Export: a `weekly-goals-YYYY-MM-DD.json` file downloads; open it and confirm it has `version`, `template`, `weeks`.
5. Make a change (add a goal), then Data → Import the exported file → confirm dialog → the change is reverted and notes match the file. Cancel on the confirm leaves data as-is.
6. Import a text file renamed `.json` containing `hello` → alert "That file is not valid JSON." Import a file containing `{"version":1}` → alert "That file is not a Weekly Goals backup." In both cases goals/notes are unchanged.
7. At 375px width nothing scrolls horizontally and all buttons are tappable.

Expected: all items behave as described.

- [ ] **Step 4: Run unit tests (regression)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: recurring template view and JSON export/import"
```

---

### Task 6: PWA — manifest, icons, service worker

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `scripts/make-icons.js`, `icons/icon-192.png`, `icons/icon-512.png`

**Interfaces:**
- Consumes: `index.html` already links `manifest.webmanifest` and `icons/icon-192.png`; `app.js` already registers `sw.js`.
- Produces: installable, offline-capable app. The `ASSETS` list in `sw.js` must contain every file the app loads; bump `CACHE` whenever any cached file changes.

- [ ] **Step 1: Create `scripts/make-icons.js`**

```js
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../icons/', import.meta.url));
const BG = [0x2f, 0x6f, 0x5e];
const FG = [0xff, 0xff, 0xff];
// Check mark inside the maskable safe zone (central 80%).
const POINTS = [[0.30, 0.52], [0.44, 0.66], [0.70, 0.36]];
const HALF_WIDTH = 0.06;

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function png(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter type: none
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size, py = (y + 0.5) / size;
      const d = Math.min(distToSegment(px, py, POINTS[0], POINTS[1]), distToSegment(px, py, POINTS[1], POINTS[2]));
      const a = Math.max(0, Math.min(1, (HALF_WIDTH - d) * size + 0.5));
      for (let c = 0; c < 3; c++) row.push(Math.round(BG[c] * (1 - a) + FG[c] * a));
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) writeFileSync(`${outDir}icon-${size}.png`, png(size));
console.log('Wrote icons/icon-192.png and icons/icon-512.png');
```

- [ ] **Step 2: Generate the icons and check them**

Run: `node scripts/make-icons.js`
Expected: prints "Wrote icons/icon-192.png and icons/icon-512.png". Open `icons/icon-512.png` (Read tool) and confirm it is a green square with a white check mark.

- [ ] **Step 3: Create `manifest.webmanifest`**

```json
{
  "name": "Weekly Goals",
  "short_name": "Goals",
  "description": "Plan your week, check off goals, and keep notes.",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f6f5f1",
  "theme_color": "#2f6f5e",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 4: Create `sw.js`**

```js
// Bump CACHE whenever any file in ASSETS changes, or users keep the old copy.
const CACHE = 'weekly-goals-v1';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'weeks.js',
  'goals.js',
  'storage.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(hit => hit || fetch(event.request)),
  );
});
```

- [ ] **Step 5: Verify installability and offline behavior**

Restart/reload `http://localhost:8080` in the browser. Using `javascript_tool`:
1. `await navigator.serviceWorker.getRegistration()` returns a registration; after a reload `navigator.serviceWorker.controller` is non-null.
2. `(await caches.keys())` includes `weekly-goals-v1`, and `(await (await caches.open('weekly-goals-v1')).keys()).length` is 10.
3. `await fetch('manifest.webmanifest').then(r => r.json())` returns the manifest; no console errors.
4. Stop the dev server (`preview_stop` / kill the background process) and reload the page: the app still loads with all goals and notes intact, and adding/ticking a goal still works.
5. Restart `npm start` afterwards.

Expected: all five checks pass.

- [ ] **Step 6: Commit**

```bash
git add manifest.webmanifest sw.js scripts/make-icons.js icons
git commit -m "feat: PWA manifest, generated icons and offline service worker"
```

---

### Task 7: Final verification and README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the finished app
- Produces: usage and install notes

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: all tests in `weeks.test.js`, `goals.test.js`, `storage.test.js` pass, zero failures.

- [ ] **Step 2: Walk the spec end-to-end in the browser**

At 375px width, confirm each spec requirement once more: Monday–Sunday week range and navigation; check-off goals (target 1) and counted goals (target ≥ 2) with undo; one-off add/edit/delete; template creation of new weeks (and no change to old weeks); autosaved weekly notes surviving reload; progress bar counting only completed goals; export/import round trip and rejection of bad files; offline load. Reset the viewport to desktop with `resize_window` preset `desktop` when finished.

Also test the storage-failure banner: in `javascript_tool` run `Storage.prototype.setItem = () => { throw new Error('quota') }` then add a goal — a "Couldn't save your changes" banner must appear. Reload to clear.

- [ ] **Step 3: Write `README.md`**

```markdown
# Weekly Goals

A personal weekly goal tracker: set goals each week (with optional "N times per week" targets), check them off, keep weekly notes, and define recurring goals that fill every new week. Works offline and installs to a phone home screen.

## Run locally

    npm start        # http://localhost:8080
    npm test         # unit tests (Node 18+)

## Install on your phone

Serve the folder over HTTPS (any static host, e.g. GitHub Pages or Netlify), open it on your phone, and use "Add to Home screen". Service workers do not work from `file://`.

## Your data

Everything is stored in this browser's `localStorage` on this device only. Use **Data → Export backup** regularly, and **Import** to move to another device.

## Updating

When you change any cached file, bump `CACHE` in `sw.js` so installed copies refresh.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README with run, install and backup notes"
```
