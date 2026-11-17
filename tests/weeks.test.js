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

test('DAY_NAMES / DAY_FULL list Monday first, and dayIndex maps a date to Mon=0..Sun=6', async () => {
  const { DAY_NAMES, DAY_FULL, dayIndex } = await import('../weeks.js');
  assert.equal(DAY_NAMES.length, 7); assert.equal(DAY_FULL.length, 7);
  assert.equal(DAY_NAMES[0], 'Mon'); assert.equal(DAY_FULL[6], 'Sunday');
  assert.equal(dayIndex(new Date(2026, 9, 19)), 0); // Monday
  assert.equal(dayIndex(new Date(2026, 9, 21)), 2); // Wednesday
  assert.equal(dayIndex(new Date(2026, 9, 25)), 6); // Sunday
});

test('daysLabel summarizes a list of days', async () => {
  const { daysLabel } = await import('../weeks.js');
  assert.equal(daysLabel([]), '');
  assert.equal(daysLabel(undefined), '');
  assert.equal(daysLabel([4, 0, 2, 2]), 'Mon Wed Fri');
  assert.equal(daysLabel([0, 1, 2, 3, 4, 5, 6]), 'Daily');
  assert.equal(daysLabel([9, -1, 3]), 'Thu');
});
