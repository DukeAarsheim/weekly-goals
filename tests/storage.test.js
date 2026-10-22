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

test('load: corrupt data whose backup cannot be written reports corrupt-nobackup', () => {
  const raw = '{not json';
  const s = {
    getItem: k => (k === STORAGE_KEY ? raw : null),
    setItem() { throw new Error('quota'); },
  };
  const result = load(s);
  assert.equal(result.warning, 'corrupt-nobackup');
  assert.deepEqual(result.data, emptyData());
});
