const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toISODate(d) {
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) throw new Error(`Invalid date: ${s}`);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (toISODate(d) !== s) throw new Error(`Invalid date: ${s}`);
  return d;
}

export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sinceMonday = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - sinceMonday);
  return d;
}

export function weekKey(date) {
  return toISODate(mondayOf(date));
}

export function addWeeks(key, n) {
  const d = parseISODate(key);
  d.setDate(d.getDate() + 7 * n);
  return toISODate(d);
}

export function weekLabel(key, now = new Date()) {
  const start = parseISODate(key);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const from = `${MONTHS[start.getMonth()]} ${start.getDate()}`;
  const to = start.getMonth() === end.getMonth()
    ? `${end.getDate()}`
    : `${MONTHS[end.getMonth()]} ${end.getDate()}`;
  const yearDiffers = start.getFullYear() !== now.getFullYear() || end.getFullYear() !== now.getFullYear();
  return `${from} – ${to}${yearDiffers ? `, ${end.getFullYear()}` : ''}`;
}
