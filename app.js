import { toISODate, weekKey, addWeeks, weekLabel } from './weeks.js';
import {
  ensureWeek, addGoal, addTemplateGoal, editGoal, deleteGoal, moveGoal,
  increment, decrement, toggle, isDone, progress, cleanText,
} from './goals.js';
import { load, save, exportJSON, importJSON, STORAGE_KEY } from './storage.js';

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
let saveBlocked = false; // set when unreadable stored data could not be backed up

function persist(data) {
  state.data = data;
  if (saveBlocked) return;
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

// An installed app can stay open across a week boundary; follow the calendar if the user was on the current week.
let currentKey = weekKey(new Date());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const nowKey = weekKey(new Date());
  if (nowKey === currentKey) return;
  const wasOnCurrent = state.key === currentKey;
  currentKey = nowKey;
  if (wasOnCurrent) openWeek(nowKey); else render();
});

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

  // For a target-1 goal the whole text area is a <label>, so tapping the text toggles the checkbox.
  const main = el(goal.target === 1 ? 'label' : 'div', 'main');
  if (goal.target === 1) {
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = isDone(goal);
    cb.addEventListener('change', () => mapGoal(toggle));
    main.append(cb);
  }
  main.append(el('span', 'text', goal.text));
  if (goal.fromTemplate) {
    const tag = el('span', 'tag', '↻');
    tag.title = 'Recurring goal';
    main.append(tag);
  }
  li.append(main);

  const controls = el('div', 'controls');
  if (goal.target > 1) {
    const counter = el('div', 'counter');
    counter.append(
      button('−', `Decrease count for "${goal.text}"`, () => mapGoal(decrement)),
      el('span', 'count', `${goal.count} / ${goal.target}`),
      button('+', `Increase count for "${goal.text}"`, () => mapGoal(increment)),
    );
    controls.append(counter);
  }

  controls.append(
    button('✎', `Edit "${goal.text}"`, () => openGoalDialog({ kind: 'week', id: goal.id })),
    button('✕', `Delete "${goal.text}"`, () => {
      if (confirm(`Delete "${goal.text}" from this week?`)) updateGoals(gs => deleteGoal(gs, goal.id));
    }, 'small danger'),
  );
  li.append(controls);
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

function templateRow(goal) {
  const li = el('li', 'goal');
  const main = el('div', 'main');
  main.append(el('span', 'text', goal.text));
  if (goal.target > 1) main.append(el('span', 'tag', `×${goal.target}/wk`));
  const controls = el('div', 'controls');
  controls.append(
    button('↑', `Move "${goal.text}" up`, () => commitTemplate(t => moveGoal(t, goal.id, -1))),
    button('↓', `Move "${goal.text}" down`, () => commitTemplate(t => moveGoal(t, goal.id, 1))),
    button('✎', `Edit "${goal.text}"`, () => openGoalDialog({ kind: 'template', id: goal.id })),
    button('✕', `Delete "${goal.text}"`, () => {
      if (confirm(`Remove "${goal.text}" from your recurring goals? Existing weeks are not changed.`)) {
        commitTemplate(t => deleteGoal(t, goal.id));
      }
    }, 'small danger'),
  );
  li.append(main, controls);
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

// ---------- sync with other open copies (e.g. installed app + browser tab) ----------
window.addEventListener('storage', e => {
  if (e.storageArea !== storage || (e.key !== null && e.key !== STORAGE_KEY)) return;
  if (saveBlocked) return;
  const { data, warning } = load(storage);
  if (warning) return;
  // Keep notes typed here that haven't been saved yet; everything else comes from the other copy.
  const pendingNotes = notesTimer !== null ? $('notes').value : null;
  let next = ensureWeek(data, state.key);
  if (pendingNotes !== null) {
    const week = next.weeks[state.key];
    next = { ...next, weeks: { ...next.weeks, [state.key]: { ...week, notes: pendingNotes } } };
  }
  if (next !== data) commit(next);
  else { state.data = data; render(); }
  if (pendingNotes === null) syncNotes();
});

// --- init ---
const loaded = load(storage);
state.data = loaded.data;
if (loaded.warning === 'unavailable') {
  setBanner('startup', "Storage is unavailable in this browser, so your goals won't be saved.");
} else if (loaded.warning === 'corrupt') {
  setBanner('startup', "Your saved data couldn't be read, so the app started fresh. The old data was kept as a backup in this browser.");
} else if (loaded.warning === 'corrupt-nobackup') {
  saveBlocked = true;
  setBanner('startup', "Your saved data couldn't be read and couldn't be backed up, so nothing you enter will be saved this session and the old data is left untouched. Free up browser storage and reload.");
}
state.data = ensureWeek(state.data, state.key);
persist(state.data);
syncNotes();
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
