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
