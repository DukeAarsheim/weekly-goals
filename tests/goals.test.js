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
