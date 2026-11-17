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

test('tap toggles a target-1 goal', async () => {
  const { tap } = await import('../goals.js');
  assert.equal(tap(goal({ target: 1, count: 0 })).count, 1);
  assert.equal(tap(goal({ target: 1, count: 1 })).count, 0);
});

test('tap adds one on a counted goal and resets to 0 once the target is reached', async () => {
  const { tap } = await import('../goals.js');
  assert.equal(tap(goal({ target: 3, count: 0 })).count, 1);
  assert.equal(tap(goal({ target: 3, count: 2 })).count, 3);
  assert.equal(tap(goal({ target: 3, count: 3 })).count, 0);
  assert.equal(tap(goal({ target: 3, count: 5 })).count, 0);
});

test('tap does not mutate its input', async () => {
  const { tap } = await import('../goals.js');
  const g = goal({ target: 3, count: 1 });
  tap(g);
  assert.equal(g.count, 1);
});

test('fraction is count/target clamped to 0..1', async () => {
  const { fraction } = await import('../goals.js');
  assert.equal(fraction(goal({ target: 4, count: 1 })), 0.25);
  assert.equal(fraction(goal({ target: 3, count: 3 })), 1);
  assert.equal(fraction(goal({ target: 3, count: 7 })), 1);
  assert.equal(fraction(goal({ target: 1, count: 0 })), 0);
});

test('orderByIds reorders to match the id list', async () => {
  const { orderByIds } = await import('../goals.js');
  const list = [goal({ id: 'a' }), goal({ id: 'b' }), goal({ id: 'c' })];
  assert.deepEqual(orderByIds(list, ['c', 'a', 'b']).map(g => g.id), ['c', 'a', 'b']);
});

test('orderByIds keeps goals missing from the id list (at the end) and ignores unknown or repeated ids', async () => {
  const { orderByIds } = await import('../goals.js');
  const list = [goal({ id: 'a' }), goal({ id: 'b' }), goal({ id: 'c' })];
  assert.deepEqual(orderByIds(list, ['b']).map(g => g.id), ['b', 'a', 'c']);
  assert.deepEqual(orderByIds(list, ['zzz', 'c', 'c', 'a']).map(g => g.id), ['c', 'a', 'b']);
  assert.deepEqual(orderByIds(list, []).map(g => g.id), ['a', 'b', 'c']);
});

test('orderByIds does not mutate the input or change goal contents', async () => {
  const { orderByIds } = await import('../goals.js');
  const list = [goal({ id: 'a', count: 2 }), goal({ id: 'b' })];
  const out = orderByIds(list, ['b', 'a']);
  assert.deepEqual(list.map(g => g.id), ['a', 'b']);
  assert.equal(out[1], list[0]);
});

test('normalizeDays keeps unique integers 0-6, sorted, and tolerates junk', async () => {
  const { normalizeDays } = await import('../goals.js');
  assert.deepEqual(normalizeDays([4, 0, 2, 2]), [0, 2, 4]);
  assert.deepEqual(normalizeDays([7, -1, 1.5, '2', 3]), [3]);
  assert.deepEqual(normalizeDays(undefined), []);
  assert.deepEqual(normalizeDays('x'), []);
});

test('scheduleDay adds a day once and keeps days sorted', async () => {
  const { scheduleDay } = await import('../goals.js');
  const g = goal({ days: [4] });
  assert.deepEqual(scheduleDay(g, 0).days, [0, 4]);
  assert.deepEqual(scheduleDay(scheduleDay(g, 0), 0).days, [0, 4]);
  assert.deepEqual(scheduleDay(goal(), 2).days, [2]); // goals saved before days existed
  assert.equal(g.days.length, 1); // input not mutated
});

test('tickDay marks a scheduled day done and adds one to the weekly count; ticking again undoes it', async () => {
  const { tickDay } = await import('../goals.js');
  const g = goal({ target: 3, count: 0, days: [0, 2, 4], doneDays: [] });
  const once = tickDay(g, 2);
  assert.deepEqual([once.count, once.doneDays], [1, [2]]);
  const twice = tickDay(once, 0);
  assert.deepEqual([twice.count, twice.doneDays], [2, [0, 2]]);
  const undone = tickDay(twice, 2);
  assert.deepEqual([undone.count, undone.doneDays], [1, [0]]);
});

test('tickDay ignores a day the goal is not scheduled on, and works on goals without doneDays', async () => {
  const { tickDay } = await import('../goals.js');
  const g = goal({ target: 3, days: [1] });
  assert.equal(tickDay(g, 5), g);
  assert.deepEqual(tickDay(g, 1).doneDays, [1]);
});

test('unscheduleDay removes the day, and an already-ticked day also takes its tick back', async () => {
  const { unscheduleDay } = await import('../goals.js');
  const g = goal({ target: 3, count: 2, days: [0, 2], doneDays: [2] });
  const out = unscheduleDay(g, 2);
  assert.deepEqual([out.days, out.doneDays, out.count], [[0], [], 1]);
  const notDone = unscheduleDay(g, 0);
  assert.deepEqual([notDone.days, notDone.doneDays, notDone.count], [[2], [2], 2]);
});

test('tap and decrement keep day ticks consistent with the weekly count', async () => {
  const { tap, decrement } = await import('../goals.js');
  const g = goal({ target: 3, count: 3, days: [0, 2, 4], doneDays: [0, 2, 4] });
  assert.deepEqual([tap(g).count, tap(g).doneDays], [0, []]);            // completed goal wraps to 0
  assert.deepEqual([decrement(g).count, decrement(g).doneDays], [2, [0, 2]]);
  const extra = goal({ target: 3, count: 1, days: [0], doneDays: [] });
  assert.deepEqual([tap(extra).count, tap(extra).doneDays], [2, []]);     // plain taps don't invent day ticks
});

test('goalsOnDay and unscheduledGoals filter by schedule', async () => {
  const { goalsOnDay, unscheduledGoals } = await import('../goals.js');
  const list = [goal({ id: 'a', days: [0, 2] }), goal({ id: 'b', days: [2] }), goal({ id: 'c' }), goal({ id: 'd', days: [] })];
  assert.deepEqual(goalsOnDay(list, 2).map(g => g.id), ['a', 'b']);
  assert.deepEqual(goalsOnDay(list, 5).map(g => g.id), []);
  assert.deepEqual(unscheduledGoals(list).map(g => g.id), ['c', 'd']);
});

test('createWeekFromTemplate copies each template goal\'s days and links back with templateId', async () => {
  const template = [{ id: 't1', text: 'Gym', target: 3, days: [0, 2, 4] }, { id: 't2', text: 'Read', target: 1 }];
  const week = createWeekFromTemplate(template);
  assert.deepEqual(week.goals.map(g => [g.templateId, g.days, g.doneDays]), [['t1', [0, 2, 4], []], ['t2', [], []]]);
  template[0].days.push(6);
  assert.deepEqual(week.goals[0].days, [0, 2, 4]); // not aliased to the template
});

test('addTemplateGoal and editGoal accept days; omitting days leaves them alone', async () => {
  const { addTemplateGoal: addT, editGoal: edit } = await import('../goals.js');
  const out = addT([], 'Gym', 3, [4, 0]);
  assert.deepEqual(out[0].days, [0, 4]);
  const edited = edit(out, out[0].id, { text: 'Gym', target: 3, days: [1] });
  assert.deepEqual(edited[0].days, [1]);
  assert.deepEqual(edit(edited, out[0].id, { text: 'Gym 2', target: 3 })[0].days, [1]);
});

test('saveLayoutToTemplate copies this week\'s days for recurring goals into the template', async () => {
  const { saveLayoutToTemplate } = await import('../goals.js');
  const data = {
    version: 1,
    template: [{ id: 't1', text: 'Gym', target: 3, days: [0] }, { id: 't2', text: 'Read', target: 1 }, { id: 't3', text: 'Untouched', target: 1, days: [6] }],
    weeks: { '2026-10-19': { notes: '', goals: [
      goal({ id: 'g1', text: 'Gym', fromTemplate: true, templateId: 't1', days: [1, 3] }),
      goal({ id: 'g2', text: 'read', fromTemplate: true, days: [5] }),          // saved before templateId existed: matched by name
      goal({ id: 'g3', text: 'One-off', fromTemplate: false, days: [2] }),        // one-off goals are never saved
    ] } },
  };
  const out = saveLayoutToTemplate(data, '2026-10-19');
  assert.deepEqual(out.template.map(t => t.days), [[1, 3], [5], [6]]);
  assert.equal(out.template.length, 3);
  assert.equal(saveLayoutToTemplate(data, '2099-01-01'), data); // unknown week: nothing to save
  assert.deepEqual(data.template[0].days, [0]); // input not mutated
});

const tmpl = (over = {}) => ({ id: 't1', text: 'Gym', target: 3, days: [0, 2, 4], ...over });
const dataWith = (template, goals) => ({ version: 1, template, weeks: { '2026-11-16': { notes: 'keep me', goals } } });
const KEY = '2026-11-16';

test('applyTemplateToWeek adds recurring goals missing from the week, with their default days, and leaves the rest alone', async () => {
  const { applyTemplateToWeek } = await import('../goals.js');
  const progress = goal({ id: 'p', text: 'Read', target: 1, count: 1, fromTemplate: true, templateId: 't2', days: [1], doneDays: [1] });
  const data = dataWith([tmpl(), tmpl({ id: 't2', text: 'Read', target: 1, days: [1] })], [progress]);
  const out = applyTemplateToWeek(data, KEY);
  assert.deepEqual([out.added, out.filled], [1, 0]);
  const goals = out.data.weeks[KEY].goals;
  assert.equal(goals.length, 2);
  assert.equal(goals[0], progress); // existing goal untouched, same object
  assert.deepEqual(
    [goals[1].text, goals[1].target, goals[1].count, goals[1].fromTemplate, goals[1].templateId, goals[1].days, goals[1].doneDays],
    ['Gym', 3, 0, true, 't1', [0, 2, 4], []],
  );
  assert.equal(out.data.weeks[KEY].notes, 'keep me');
});

test('applyTemplateToWeek does not duplicate a goal already here: matched by templateId (even renamed) or by name for older goals', async () => {
  const { applyTemplateToWeek } = await import('../goals.js');
  const renamed = goal({ id: 'a', text: 'Gym session', fromTemplate: true, templateId: 't1', days: [0] });
  const legacy = goal({ id: 'b', text: '  READ ', fromTemplate: true, days: [3] }); // saved before templateId existed
  const data = dataWith([tmpl(), tmpl({ id: 't2', text: 'Read', days: [1] })], [renamed, legacy]);
  const out = applyTemplateToWeek(data, KEY);
  assert.deepEqual([out.added, out.filled], [0, 0]);
  assert.equal(out.data, data);
});

test('applyTemplateToWeek fills in default days only for existing recurring goals that have none', async () => {
  const { applyTemplateToWeek } = await import('../goals.js');
  const noDays = goal({ id: 'a', text: 'Gym', count: 1, fromTemplate: true, templateId: 't1', doneDays: [] });
  const hasDays = goal({ id: 'b', text: 'Read', fromTemplate: true, templateId: 't2', days: [6], doneDays: [6], count: 1 });
  const data = dataWith([tmpl(), tmpl({ id: 't2', text: 'Read', days: [1, 2] })], [noDays, hasDays]);
  const out = applyTemplateToWeek(data, KEY);
  assert.deepEqual([out.added, out.filled], [0, 1]);
  const [a, b] = out.data.weeks[KEY].goals;
  assert.deepEqual([a.days, a.count], [[0, 2, 4], 1]); // days filled in, progress kept
  assert.equal(b, hasDays);                            // days the user chose are never overwritten
});

test('applyTemplateToWeek reports nothing to do when the week is already up to date', async () => {
  const { applyTemplateToWeek } = await import('../goals.js');
  const here = goal({ id: 'a', text: 'Gym', fromTemplate: true, templateId: 't1', days: [0, 2, 4] });
  const data = dataWith([tmpl()], [here]);
  const out = applyTemplateToWeek(data, KEY);
  assert.deepEqual([out.added, out.filled, out.data === data], [0, 0, true]);
  const empty = applyTemplateToWeek(dataWith([], [here]), KEY);
  assert.deepEqual([empty.added, empty.filled], [0, 0]);
});

test('applyTemplateToWeek treats a template goal with no days as "no days", and does not count it as filled', async () => {
  const { applyTemplateToWeek } = await import('../goals.js');
  const t = { id: 't3', text: 'Call grandma', target: 1 };
  const here = goal({ id: 'a', text: 'Call grandma', fromTemplate: true, templateId: 't3' });
  assert.deepEqual([applyTemplateToWeek(dataWith([t], [here]), KEY).filled], [0]);
  const added = applyTemplateToWeek(dataWith([t], []), KEY);
  assert.deepEqual([added.added, added.data.weeks[KEY].goals[0].days], [1, []]);
});

test('applyTemplateToWeek does not match a one-off goal that merely has the same name', async () => {
  const { applyTemplateToWeek } = await import('../goals.js');
  const oneOff = goal({ id: 'a', text: 'Gym', fromTemplate: false });
  const out = applyTemplateToWeek(dataWith([tmpl()], [oneOff]), KEY);
  assert.deepEqual([out.added, out.data.weeks[KEY].goals.length], [1, 2]);
});

test('applyTemplateToWeek leaves an unknown week and its input alone', async () => {
  const { applyTemplateToWeek } = await import('../goals.js');
  const data = dataWith([tmpl()], []);
  const snapshot = JSON.stringify(data);
  assert.deepEqual([applyTemplateToWeek(data, '2099-01-04').added, applyTemplateToWeek(data, '2099-01-04').data === data], [0, true]);
  applyTemplateToWeek(data, KEY);
  assert.equal(JSON.stringify(data), snapshot); // not mutated
});
