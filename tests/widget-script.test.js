import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCRIPTABLE_SCRIPT } from '../widget-script.js';
import { widgetPayload } from '../widget.js';
import { dayIndex } from '../weeks.js';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const FILE = '/docs/weekly-goals-today.json';

// Runs the Scriptable script against a small imitation of the Scriptable app.
async function run({ queryParameters, widgetParameter, family, runsInWidget = true, files = {} }) {
  const result = { widget: null, set: null, presented: false, completed: false, alerts: [] };
  class ListWidget {
    constructor() { this.items = []; result.widget = this; }
    addText(text) {
      const item = { text, centerAlignText() { this.centered = true; } };
      this.items.push(item);
      return item;
    }
    async presentMedium() { result.presented = true; }
  }
  class Alert {
    constructor() { this.actions = []; result.alerts.push(this); }
    addAction(label) { this.actions.push(label); }
    async presentAlert() { this.shown = true; }
  }
  const globals = {
    FileManager: {
      local: () => ({
        documentsDirectory: () => '/docs',
        joinPath: (a, b) => `${a}/${b}`,
        fileExists: p => p in files,
        readString: p => files[p],
        writeString: (p, s) => { files[p] = s; },
      }),
    },
    ListWidget,
    Alert,
    Font: { boldSystemFont: n => ({ bold: n }), systemFont: n => ({ size: n }) },
    Script: { setWidget: w => { result.set = w; }, complete: () => { result.completed = true; } },
    config: { runsInWidget, widgetFamily: family },
    args: { queryParameters, widgetParameter },
  };
  await new AsyncFunction(...Object.keys(globals), SCRIPTABLE_SCRIPT)(...Object.values(globals));
  result.files = files;
  result.lines = result.widget ? result.widget.items.map(i => i.text) : [];
  return result;
}

const today = new Date();
const goal = (over = {}) => ({ id: 'g', text: 'x', target: 1, count: 0, fromTemplate: false, days: [dayIndex(today)], doneDays: [], ...over });
const payloadFor = goals => widgetPayload(goals, today);
const twoGoals = () => payloadFor([
  goal({ text: 'Gym', target: 3, count: 1, doneDays: [dayIndex(today)] }),
  goal({ text: 'Journal' }),
]);

test('saving from the app writes the goals to a file and confirms with an alert', async () => {
  const payload = twoGoals();
  const r = await run({ queryParameters: { data: JSON.stringify(payload) } });
  assert.deepEqual(JSON.parse(r.files[FILE]), payload);
  assert.equal(r.alerts[0].title, 'Widget updated');
  assert.equal(r.alerts[0].message, '1 of 2 goals done today.');
  assert.ok(r.alerts[0].shown);
  assert.equal(r.set, null);
  assert.ok(r.completed);
});

test('saving when nothing is planned says so', async () => {
  const r = await run({ queryParameters: { data: JSON.stringify(payloadFor([])) } });
  assert.equal(r.alerts[0].message, 'Nothing is planned for today.');
});

test('unreadable data from the app is rejected and the previous file is left alone', async () => {
  const files = { [FILE]: 'previous' };
  for (const bad of ['not json', '{"v":1}', 'null']) {
    const r = await run({ queryParameters: { data: bad }, files });
    assert.equal(r.alerts[0].title, 'Could not read the goals');
    assert.equal(files[FILE], 'previous');
  }
});

test('rectangular lock screen widget shows today with ticks, weekly progress, and opens the app when tapped', async () => {
  const r = await run({ family: 'accessoryRectangular', files: { [FILE]: JSON.stringify(twoGoals()) } });
  assert.deepEqual(r.lines, [`${twoGoals().day}  1/2`, '✓ Gym 1/3', '○ Journal']);
  assert.ok(r.widget.url.startsWith('https://'));
  assert.ok(r.widget.refreshAfterDate.getTime() > Date.now());
  assert.equal(r.set, r.widget);
  assert.ok(r.completed);
  assert.ok(r.widget.items.slice(1).every(i => i.lineLimit === 1));
});

test('rectangular widget shows three goals and counts the rest', async () => {
  const many = payloadFor(['A', 'B', 'C', 'D', 'E'].map(text => goal({ text })));
  const r = await run({ family: 'accessoryRectangular', files: { [FILE]: JSON.stringify(many) } });
  assert.equal(r.lines.length, 5); // title + 3 goals + "+2 more"
  assert.deepEqual(r.lines.slice(1), ['○ A', '○ B', '○ C', '+2 more']);
});

test('larger widgets show more goals', async () => {
  const many = payloadFor(Array.from({ length: 10 }, (_, i) => goal({ text: `G${i}` })));
  const r = await run({ family: 'medium', files: { [FILE]: JSON.stringify(many) } });
  assert.equal(r.lines.length, 10); // title + 8 goals + "+2 more"
  assert.equal(r.lines.at(-1), '+2 more');
});

test('inline and circular widgets show just the count', async () => {
  const files = { [FILE]: JSON.stringify(twoGoals()) };
  assert.deepEqual((await run({ family: 'accessoryInline', files })).lines, ['1/2 goals done']);
  const circular = await run({ family: 'accessoryCircular', files });
  assert.deepEqual(circular.lines, ['1/2']);
  assert.ok(circular.widget.items[0].centered);
});

test('a widget with nothing planned today says so', async () => {
  const empty = JSON.stringify(payloadFor([]));
  const r = await run({ family: 'accessoryRectangular', files: { [FILE]: empty } });
  assert.deepEqual(r.lines.slice(1), ['Nothing planned today']);
  assert.deepEqual((await run({ family: 'accessoryInline', files: { [FILE]: empty } })).lines, ['No goals today']);
});

test('stale or missing data asks you to send again instead of showing yesterday\'s goals', async () => {
  const yesterday = { ...twoGoals(), date: '2000-01-01' };
  for (const files of [{ [FILE]: JSON.stringify(yesterday) }, {}, { [FILE]: 'garbage' }]) {
    const r = await run({ family: 'accessoryRectangular', files });
    assert.deepEqual(r.lines, ['Goals', 'Tap Send in the app to update']);
  }
  const inline = await run({ family: 'accessoryInline', files: {} });
  assert.deepEqual(inline.lines, ['Open Goals app']);
});

test('run from inside Scriptable it previews the widget', async () => {
  const r = await run({ runsInWidget: false, files: { [FILE]: JSON.stringify(twoGoals()) } });
  assert.ok(r.presented);
  assert.equal(r.set, null);
});

test('goal text is shown as plain text and long lists never throw', async () => {
  const weird = payloadFor([goal({ text: '<b>bold</b> "quoted" & 🙂' })]);
  const r = await run({ family: 'medium', files: { [FILE]: JSON.stringify(weird) } });
  assert.equal(r.lines[1], '○ <b>bold</b> "quoted" & 🙂');
});

const names = n => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i)); // A, B, C, ...
const manyFiles = n => ({ [FILE]: JSON.stringify(payloadFor(names(n).map(text => goal({ text })))) });

test('a second rectangular widget (parameter 2) shows the next three goals', async () => {
  const r = await run({ family: 'accessoryRectangular', widgetParameter: '2', files: manyFiles(5) });
  assert.deepEqual(r.lines.slice(1), ['○ D', '○ E']);
  assert.ok(r.lines[0].endsWith('0/5'));
});

test('the first widget stays on goals 1-3 and points to the rest', async () => {
  for (const widgetParameter of [undefined, '', '1', '  1 ']) {
    const r = await run({ family: 'accessoryRectangular', widgetParameter, files: manyFiles(5) });
    assert.deepEqual(r.lines.slice(1), ['○ A', '○ B', '○ C', '+2 more'], String(widgetParameter));
  }
});

test('the second widget lists a full page and counts what is still beyond it', async () => {
  const r = await run({ family: 'accessoryRectangular', widgetParameter: '2', files: manyFiles(7) });
  assert.deepEqual(r.lines.slice(1), ['○ D', '○ E', '○ F', '+1 more']);
});

test('the second widget says so when there is nothing beyond the first three', async () => {
  const r = await run({ family: 'accessoryRectangular', widgetParameter: '2', files: manyFiles(3) });
  assert.deepEqual(r.lines.slice(1), ['Nothing more today']);
});

test('a nonsense widget parameter falls back to the first page', async () => {
  for (const widgetParameter of ['abc', '0', '-2', 'NaN', null]) {
    const r = await run({ family: 'accessoryRectangular', widgetParameter, files: manyFiles(5) });
    assert.deepEqual(r.lines.slice(1, 4), ['○ A', '○ B', '○ C'], String(widgetParameter));
  }
});

test('the widget parameter does not change larger widgets', async () => {
  const r = await run({ family: 'medium', widgetParameter: '2', files: manyFiles(5) });
  assert.deepEqual(r.lines.slice(1), ['○ A', '○ B', '○ C', '○ D', '○ E']);
});

test('the second widget on stale data still asks you to send again', async () => {
  const r = await run({ family: 'accessoryRectangular', widgetParameter: '2', files: {} });
  assert.deepEqual(r.lines, ['Goals', 'Tap Send in the app to update']);
});
