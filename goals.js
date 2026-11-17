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

// Days of the week as numbers: Mon = 0 ... Sun = 6.
export function normalizeDays(days) {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
}

// After the weekly count changes from the Week tab, drop day ticks that the count no longer covers (latest days first).
function settle(goal) {
  const done = normalizeDays(goal.doneDays);
  return done.length <= goal.count ? goal : { ...goal, doneDays: done.slice(0, goal.count) };
}

export function isDone(goal) {
  return goal.count >= goal.target;
}

export function increment(goal) {
  return { ...goal, count: goal.count + 1 };
}

export function decrement(goal) {
  return settle({ ...goal, count: Math.max(0, goal.count - 1) });
}

export function toggle(goal) {
  return { ...goal, count: isDone(goal) ? 0 : goal.target };
}

// What tapping a goal's card does: toggle a once-a-week goal; add one to a counted goal, wrapping to 0 once it is complete.
export function tap(goal) {
  if (goal.target === 1) return toggle(goal);
  return settle({ ...goal, count: isDone(goal) ? 0 : goal.count + 1 });
}

// How full a goal's progress bar is, from 0 to 1.
export function fraction(goal) {
  return Math.min(1, goal.count / goal.target);
}

export function scheduleDay(goal, day) {
  return { ...goal, days: normalizeDays([...normalizeDays(goal.days), day]) };
}

// Removing a day that was already ticked also takes that tick back off the weekly count.
export function unscheduleDay(goal, day) {
  const wasDone = normalizeDays(goal.doneDays).includes(day);
  return {
    ...goal,
    days: normalizeDays(goal.days).filter(d => d !== day),
    doneDays: normalizeDays(goal.doneDays).filter(d => d !== day),
    count: wasDone ? Math.max(0, goal.count - 1) : goal.count,
  };
}

// Ticks (or un-ticks) one scheduled day; each tick counts toward the goal's weekly total.
export function tickDay(goal, day) {
  if (!normalizeDays(goal.days).includes(day)) return goal;
  const done = normalizeDays(goal.doneDays);
  if (done.includes(day)) {
    return { ...goal, doneDays: done.filter(d => d !== day), count: Math.max(0, goal.count - 1) };
  }
  return { ...goal, doneDays: normalizeDays([...done, day]), count: goal.count + 1 };
}

export function goalsOnDay(goals, day) {
  return goals.filter(g => normalizeDays(g.days).includes(day));
}

export function unscheduledGoals(goals) {
  return goals.filter(g => normalizeDays(g.days).length === 0);
}

// Copies this week's days for recurring goals back into the template, so following weeks start with the same layout.
export function saveLayoutToTemplate(data, key) {
  const week = data.weeks[key];
  if (!week) return data;
  const recurring = week.goals.filter(g => g.fromTemplate);
  const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const template = data.template.map(t => {
    const match = recurring.find(g => g.templateId === t.id)
      || recurring.find(g => g.templateId === undefined && sameName(g.text, t.text));
    return match ? { ...t, days: normalizeDays(match.days) } : t;
  });
  return { ...data, template };
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
      templateId: t.id,
      days: normalizeDays(t.days),
      doneDays: [],
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

export function addTemplateGoal(template, text, target, days) {
  const clean = cleanText(text);
  if (!clean) return template;
  const goal = { id: newId(), text: clean, target: normalizeTarget(target) };
  if (days !== undefined) goal.days = normalizeDays(days);
  return [...template, goal];
}

// `days` is optional: leave it out to keep a goal's current days.
export function editGoal(list, id, { text, target, days }) {
  const clean = cleanText(text);
  if (!clean) return list;
  return list.map(g => {
    if (g.id !== id) return g;
    const next = { ...g, text: clean, target: normalizeTarget(target) };
    if (days !== undefined) next.days = normalizeDays(days);
    return next;
  });
}

export function deleteGoal(list, id) {
  return list.filter(g => g.id !== id);
}

// Reorders a list to follow `ids`. Goals missing from `ids` keep their relative order at the end; unknown or repeated ids are ignored.
export function orderByIds(list, ids) {
  const byId = new Map(list.map(g => [g.id, g]));
  const ordered = [];
  for (const id of ids) {
    const g = byId.get(id);
    if (g) {
      ordered.push(g);
      byId.delete(id);
    }
  }
  return [...ordered, ...byId.values()];
}

export function moveGoal(list, id, delta) {
  const from = list.findIndex(g => g.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const out = list.slice();
  [out[from], out[to]] = [out[to], out[from]];
  return out;
}
