import { toISODate, dayIndex, DAY_FULL } from './weeks.js';
import { goalsOnDay, normalizeDays } from './goals.js';

// The Scriptable script that shows the widget must be saved under this exact name.
export const SCRIPT_NAME = 'Goals Widget';

// What the lock screen widget needs to know about today: the goals planned for today, whether each one is
// ticked for today, and (for goals done several times a week) the weekly progress.
export function widgetPayload(goals, date) {
  const day = dayIndex(date);
  return {
    v: 1,
    date: toISODate(date),
    day: DAY_FULL[day],
    goals: goalsOnDay(goals, day).map(g => {
      const item = { text: g.text, done: normalizeDays(g.doneDays).includes(day) };
      if (g.target > 1) item.progress = `${g.count}/${g.target}`;
      return item;
    }),
  };
}

// A link that opens Scriptable and runs the widget script with the payload.
export function scriptableUrl(payload, scriptName = SCRIPT_NAME) {
  return `scriptable:///run/${encodeURIComponent(scriptName)}?data=${encodeURIComponent(JSON.stringify(payload))}`;
}
