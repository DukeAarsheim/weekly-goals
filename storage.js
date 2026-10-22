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
