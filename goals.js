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

// What tapping a goal's card does: toggle a once-a-week goal; add one to a counted goal, wrapping to 0 once it is complete.
export function tap(goal) {
  if (goal.target === 1) return toggle(goal);
  return { ...goal, count: isDone(goal) ? 0 : goal.count + 1 };
}

// How full a goal's progress bar is, from 0 to 1.
export function fraction(goal) {
  return Math.min(1, goal.count / goal.target);
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
