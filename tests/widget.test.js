import { test } from 'node:test';
import assert from 'node:assert/strict';
import { widgetPayload, scriptableUrl, SCRIPT_NAME } from '../widget.js';

const goal = (over = {}) => ({ id: 'g', text: 'x', target: 1, count: 0, fromTemplate: false, days: [], doneDays: [], ...over });

test('widgetPayload lists only goals scheduled today, with done state and weekly progress for counted goals', () => {
  const goals = [
    goal({ id: 'a', text: 'Gym', target: 3, count: 1, days: [0, 2, 4], doneDays: [2] }),
    goal({ id: 'b', text: 'Journal', days: [0, 1, 2, 3, 4, 5, 6] }),
    goal({ id: 'c', text: 'Call grandma', days: [5] }), // Saturday only
    goal({ id: 'd', text: 'Unscheduled' }),
  ];
  const payload = widgetPayload(goals, new Date(2026, 10, 18, 9, 30)); // Wednesday
  assert.equal(payload.v, 1);
  assert.equal(payload.date, '2026-11-18');
  assert.equal(payload.day, 'Wednesday');
  assert.deepEqual(payload.goals, [
    { text: 'Gym', done: true, progress: '1/3' },
    { text: 'Journal', done: false },
  ]);
});

test('widgetPayload is empty when nothing is planned today, and uses the local date late in the evening', () => {
  const payload = widgetPayload([goal({ days: [5] })], new Date(2026, 10, 18, 23, 59));
  assert.deepEqual(payload.goals, []);
  assert.equal(payload.date, '2026-11-18');
});

test('widgetPayload copes with goals saved before days existed', () => {
  const old = { id: 'o', text: 'Old goal', target: 1, count: 0, fromTemplate: false };
  assert.deepEqual(widgetPayload([old], new Date(2026, 10, 18)).goals, []);
});

test('scriptableUrl opens the named script and carries the payload intact, including awkward characters', () => {
  const payload = widgetPayload(
    [goal({ text: 'Read "20" pages & rest #1 100% 🙂 ünï', days: [2] })],
    new Date(2026, 10, 18),
  );
  const url = scriptableUrl(payload);
  assert.ok(url.startsWith('scriptable:///run/Goals%20Widget?data='));
  assert.equal(SCRIPT_NAME, 'Goals Widget');
  const raw = url.slice(url.indexOf('?data=') + '?data='.length);
  assert.deepEqual(JSON.parse(decodeURIComponent(raw)), payload);
  assert.ok(!/[ "#&]/.test(raw)); // nothing that could break the query string
});
