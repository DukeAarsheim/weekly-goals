// The Scriptable script that powers the lock screen widget. The app's "Copy widget script" button copies this text.
// It must avoid backticks and ${...} so it can live inside this raw template string.
export const SCRIPTABLE_SCRIPT = String.raw`// Goals Widget: shows today's goals from the Weekly Goals app.
// Save this script in Scriptable with the exact name "Goals Widget", then add a Scriptable widget to your lock screen.
// Tap "Send today's goals to widget" in the app to update it.
const APP_URL = 'https://dukeaarsheim.github.io/weekly-goals/';
const FILE = 'weekly-goals-today.json';
const fm = FileManager.local();
const path = fm.joinPath(fm.documentsDirectory(), FILE);

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function readSaved() {
  try {
    if (!fm.fileExists(path)) return null;
    const data = JSON.parse(fm.readString(path));
    return data && Array.isArray(data.goals) ? data : null;
  } catch (e) {
    return null;
  }
}

// Opened from the app's button: keep the goals it sent.
async function saveFromApp(raw) {
  const alert = new Alert();
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.goals)) throw new Error('bad data');
    fm.writeString(path, JSON.stringify(data));
    const done = data.goals.filter(function (g) { return g.done; }).length;
    alert.title = 'Widget updated';
    alert.message = data.goals.length
      ? done + ' of ' + data.goals.length + ' goals done today.'
      : 'Nothing is planned for today.';
  } catch (e) {
    alert.title = 'Could not read the goals';
    alert.message = 'Open the app and tap Send again.';
  }
  alert.addAction('OK');
  await alert.presentAlert();
}

function buildWidget() {
  const data = readSaved();
  const fresh = !!data && data.date === todayISO();
  const goals = fresh ? data.goals : [];
  const done = goals.filter(function (g) { return g.done; }).length;
  const counter = done + '/' + goals.length;
  const family = config.widgetFamily || 'medium';

  const w = new ListWidget();
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (family === 'accessoryInline') {
    w.addText(fresh ? (goals.length ? counter + ' goals done' : 'No goals today') : 'Open Goals app');
    return w;
  }
  if (family === 'accessoryCircular') {
    const t = w.addText(fresh && goals.length ? counter : '--');
    t.centerAlignText();
    t.font = Font.boldSystemFont(18);
    return w;
  }

  const compact = family === 'accessoryRectangular';
  const title = w.addText(fresh ? (data.day || 'Today') + '  ' + counter : 'Goals');
  title.font = Font.boldSystemFont(compact ? 13 : 16);
  if (!fresh || !goals.length) {
    const hint = w.addText(fresh ? 'Nothing planned today' : 'Tap Send in the app to update');
    hint.font = Font.systemFont(compact ? 11 : 13);
    return w;
  }

  const max = compact ? 3 : 8;
  goals.slice(0, max).forEach(function (g) {
    let line = (g.done ? '✓ ' : '○ ') + g.text;
    if (g.progress) line += ' ' + g.progress;
    const t = w.addText(line);
    t.font = Font.systemFont(compact ? 12 : 14);
    t.lineLimit = 1;
  });
  if (goals.length > max) {
    const more = w.addText('+' + (goals.length - max) + ' more');
    more.font = Font.systemFont(compact ? 11 : 13);
  }
  return w;
}

if (args.queryParameters && args.queryParameters.data) {
  await saveFromApp(args.queryParameters.data);
} else {
  const widget = buildWidget();
  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentMedium();
  }
}
Script.complete();
`;
