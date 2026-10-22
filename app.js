import { toISODate, weekKey, addWeeks, weekLabel } from './weeks.js';
import {
  ensureWeek, addGoal, addTemplateGoal, editGoal, deleteGoal, moveGoal, orderByIds,
  decrement, tap, fraction, isDone, progress, cleanText,
} from './goals.js';
import { load, save, exportJSON, importJSON, STORAGE_KEY, BACKUP_KEY } from './storage.js';

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

// focusKey lets render() put keyboard focus back on the same control after the list is rebuilt.
function button(label, ariaLabel, onClick, className = 'small', focusKey = '') {
  const b = el('button', className, label);
  b.type = 'button';
  if (focusKey) b.dataset.focus = focusKey;
  b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', onClick);
  return b;
}

function goalRow(goal) {
  const done = isDone(goal);
  const li = el('li', 'goal tappable' + (done ? ' done' : ''));
  li.dataset.id = goal.id;
  li.style.setProperty('--fill', `${Math.round(fraction(goal) * 100)}%`);
  const mapGoal = fn => updateGoals(gs => gs.map(g => (g.id === goal.id ? fn(g) : g)));

  // Tapping anywhere on the card (except its small buttons) counts the goal. The inner button gives keyboard and
  // screen-reader access; its click bubbles up to this single handler.
  li.addEventListener('click', e => {
    if (!e.target.closest('.controls')) mapGoal(tap);
  });

  const main = el('button', 'main');
  main.type = 'button';
  main.dataset.focus = `${goal.id}:tap`;
  if (goal.target === 1) {
    main.setAttribute('aria-pressed', String(done));
    main.setAttribute('aria-label', goal.text);
  } else {
    main.setAttribute('aria-label', `${goal.text}, ${goal.count} of ${goal.target} done`);
  }
  main.append(el('span', 'text', goal.text));
  if (goal.fromTemplate) {
    const tag = el('span', 'tag', '↻');
    tag.title = 'Recurring goal';
    tag.setAttribute('role', 'img');
    tag.setAttribute('aria-label', 'Recurring goal');
    main.append(tag);
  }
  if (goal.target > 1) main.append(el('span', 'count', `${goal.count} / ${goal.target}`));
  li.append(main);

  const controls = el('div', 'controls');
  if (goal.target > 1) {
    const minus = button('−', `Remove one from "${goal.text}"`, () => mapGoal(decrement), 'small', `${goal.id}:dec`);
    minus.disabled = goal.count === 0;
    controls.append(minus);
  }
  controls.append(
    button('✎', `Edit "${goal.text}"`, () => openGoalDialog({ kind: 'week', id: goal.id }), 'small', `${goal.id}:edit`),
    button('✕', `Delete "${goal.text}"`, () => {
      if (confirm(`Delete "${goal.text}" from this week?`)) updateGoals(gs => deleteGoal(gs, goal.id));
    }, 'small danger', `${goal.id}:del`),
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
    button('↑', `Move "${goal.text}" up`, () => commitTemplate(t => moveGoal(t, goal.id, -1)), 'small', `${goal.id}:up`),
    button('↓', `Move "${goal.text}" down`, () => commitTemplate(t => moveGoal(t, goal.id, 1)), 'small', `${goal.id}:down`),
    button('✎', `Edit "${goal.text}"`, () => openGoalDialog({ kind: 'template', id: goal.id }), 'small', `${goal.id}:edit`),
    button('✕', `Delete "${goal.text}"`, () => {
      if (confirm(`Remove "${goal.text}" from your recurring goals? Existing weeks are not changed.`)) {
        commitTemplate(t => deleteGoal(t, goal.id));
      }
    }, 'small danger', `${goal.id}:del`),
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
  // Rebuilding the lists destroys the focused control; restore focus so keyboard and switch users keep their place.
  const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.focus : '';
  if (onWeek) renderWeek(); else renderTemplate();
  if (focusKey) {
    const next = document.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
    if (next) next.focus();
  }
}

// ---------- press and hold a goal, then drag it into a new order ----------
const HOLD_MS = 400;  // how long to hold before the card lifts
const HOLD_SLOP = 10; // px the pointer may wander during the hold before it counts as a scroll instead
const EDGE = 70;      // px from the top/bottom of the screen where dragging auto-scrolls
const goalList = $('goalList');
let drag = null;             // { li, startX, startY, lastY, grab, timer, raf, active }
let suppressClickUntil = 0;  // a drag ends with a click event that must not count the goal
let lastTouchAt = 0;         // used to ignore the mouse events browsers emulate after a touch

function holdTarget(e) {
  const li = e.target.closest('.goal.tappable');
  return li && !e.target.closest('.controls') ? li : null;
}

function startHold(li, x, y) {
  cancelDrag();
  drag = { li, startX: x, startY: y, lastY: y, grab: 0, timer: setTimeout(activateDrag, HOLD_MS), raf: 0, active: false };
}

function activateDrag() {
  if (!drag) return;
  if (!drag.li.isConnected) { cancelDrag(); return; }
  drag.active = true;
  drag.grab = drag.lastY - drag.li.getBoundingClientRect().top; // where on the card the finger is holding it
  drag.li.classList.add('dragging');
  goalList.classList.add('is-dragging');
  try { if (navigator.vibrate) navigator.vibrate(15); } catch { /* vibration isn't available on every device */ }
  drag.raf = requestAnimationFrame(dragLoop);
}

// Runs every frame while a card is lifted: auto-scrolls near the screen edges and keeps the card under the finger.
function dragLoop() {
  if (!drag || !drag.active) return;
  if (!drag.li.isConnected) { cancelDrag(); return; }
  if (drag.lastY < EDGE) window.scrollBy(0, -12);
  else if (drag.lastY > window.innerHeight - EDGE) window.scrollBy(0, 12);
  placeDragged();
  drag.raf = requestAnimationFrame(dragLoop);
}

function placeDragged() {
  const { li, lastY, grab } = drag;
  li.style.transform = '';
  const height = li.getBoundingClientRect().height;
  const center = lastY - grab + height / 2;
  let before = null; // the first other card whose middle is below the dragged card's centre
  for (const other of goalList.children) {
    if (other === li) continue;
    const r = other.getBoundingClientRect();
    if (center < r.top + r.height / 2) { before = other; break; }
  }
  if (before !== li.nextElementSibling) goalList.insertBefore(li, before);
  const top = li.getBoundingClientRect().top;
  li.style.transform = `translateY(${lastY - grab - top}px) scale(1.02)`;
}

function endDrag(save) {
  const d = drag;
  if (!d) return;
  clearTimeout(d.timer);
  cancelAnimationFrame(d.raf);
  drag = null;
  if (!d.active) return;
  suppressClickUntil = Date.now() + 400;
  d.li.classList.remove('dragging');
  d.li.style.transform = '';
  goalList.classList.remove('is-dragging');
  const ids = [...goalList.children].map(li => li.dataset.id);
  const week = state.data.weeks[state.key];
  const changed = save && d.li.isConnected && ids.join() !== week.goals.map(g => g.id).join();
  if (changed) updateGoals(gs => orderByIds(gs, ids));
  else render(); // put the list back as it was (cancelled, or dropped where it started)
}

function cancelDrag() { endDrag(false); }

function wander(x, y) {
  return Math.hypot(x - drag.startX, y - drag.startY) > HOLD_SLOP;
}

goalList.addEventListener('touchstart', e => {
  lastTouchAt = Date.now();
  if (e.touches.length !== 1) { cancelDrag(); return; }
  const li = holdTarget(e);
  if (li) startHold(li, e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

// Not passive: once a card is lifted, moving the finger must drag it instead of scrolling the page.
goalList.addEventListener('touchmove', e => {
  if (!drag) return;
  const t = e.touches[0];
  if (drag.active) {
    e.preventDefault();
    drag.lastY = t.clientY;
  } else if (wander(t.clientX, t.clientY)) {
    cancelDrag(); // the finger moved before the hold finished: it's a normal scroll
  }
}, { passive: false });

goalList.addEventListener('touchend', () => { lastTouchAt = Date.now(); endDrag(true); });
goalList.addEventListener('touchcancel', cancelDrag);

// Mouse, so it also works on a computer.
goalList.addEventListener('mousedown', e => {
  if (e.button !== 0 || Date.now() - lastTouchAt < 700) return;
  const li = holdTarget(e);
  if (li) startHold(li, e.clientX, e.clientY);
});
window.addEventListener('mousemove', e => {
  if (!drag) return;
  if (drag.active) drag.lastY = e.clientY;
  else if (wander(e.clientX, e.clientY)) cancelDrag();
});
window.addEventListener('mouseup', () => endDrag(true));

// Stop the browser's long-press menu from interrupting the hold.
goalList.addEventListener('contextmenu', e => {
  if (drag || Date.now() - lastTouchAt < 1500) e.preventDefault();
});

// The click that follows a drop or a hold must not count the goal.
goalList.addEventListener('click', e => {
  if (Date.now() < suppressClickUntil) {
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

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
function downloadFile(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Raw text of saved data the app couldn't read: the backup copy, or the untouched original when no backup could be made.
function unreadableRaw() {
  try {
    return storage.getItem(saveBlocked ? STORAGE_KEY : BACKUP_KEY);
  } catch {
    return null;
  }
}

$('navData').addEventListener('click', () => {
  $('backupBtn').hidden = unreadableRaw() === null;
  $('dataDialog').showModal();
});
$('dataClose').addEventListener('click', () => $('dataDialog').close());

$('exportBtn').addEventListener('click', () => {
  flushNotes();
  downloadFile(`weekly-goals-${toISODate(new Date())}.json`, exportJSON(state.data), 'application/json');
});

$('backupBtn').addEventListener('click', () => {
  const raw = unreadableRaw();
  if (raw !== null) downloadFile('weekly-goals-unreadable-data.txt', raw, 'text/plain');
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
