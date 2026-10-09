// Pure calendar helpers shared by the browser and tests. Recurrences use local
// calendar arithmetic so an 8 AM weekly event stays at 8 AM across DST changes.
export const repeatOptions = ['none', 'daily', 'weekly', 'custom', 'monthly', 'yearly'];
export const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function dateKey(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
    .join('-');
}

export function toHour24(hour, period) {
  return (hour % 12) + (period === 'PM' ? 12 : 0);
}

export function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && dateKey(date) === value;
}

export function onDay(startsAt, day) {
  if (!validDay(day)) throw new Error('Choose a valid calendar day.');
  const original = new Date(startsAt);
  const date = new Date(`${day}T12:00:00`);
  date.setHours(
    original.getHours(),
    original.getMinutes(),
    original.getSeconds(),
    original.getMilliseconds(),
  );
  // Some wall times do not exist during the spring daylight-saving transition.
  if (date.getHours() !== original.getHours() || date.getMinutes() !== original.getMinutes()) {
    throw new Error('That time does not exist on this day due to daylight saving.');
  }
  return date.toISOString();
}

export function moveOccurrence(series, occurrence, day) {
  if (!series) throw new Error('This plan no longer exists.');
  if (!series.repeat || series.repeat === 'none') {
    return { ...series, startsAt: onDay(series.startsAt, day) };
  }
  const originalDay = occurrence.occurrenceDate;
  const occurrenceMoves = { ...series.occurrenceMoves };
  if (day === originalDay) delete occurrenceMoves[originalDay];
  else occurrenceMoves[originalDay] = day;
  return { ...series, occurrenceMoves };
}

export function eventStyle(member) {
  if (!member) return undefined;
  const channels = member.color
    .slice(1)
    .match(/../g)
    .map((value) => parseInt(value, 16));
  // Relative luminance selects readable text even for saturated custom colors.
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return { backgroundColor: member.color, color: luminance > 0.179 ? '#000000' : '#ffffff' };
}

function nextOccurrence(start, repeat, index) {
  const date = new Date(start);
  if (repeat === 'daily' || repeat === 'weekly' || repeat === 'custom') {
    date.setDate(start.getDate() + index * (repeat === 'weekly' ? 7 : 1));
  } else {
    // Skip invalid dates (e.g. Feb 31), rather than silently moving into March.
    date.setDate(1);
    if (repeat === 'monthly') date.setMonth(start.getMonth() + index);
    else date.setFullYear(start.getFullYear() + index);
    const targetMonth = date.getMonth();
    date.setDate(start.getDate());
    if (date.getMonth() !== targetMonth) return null;
  }
  return date;
}

export function occurrences(items, from, through) {
  const result = [];
  for (const item of items) {
    const start = new Date(item.startsAt);
    const repeat = item.repeat || 'none';
    if (repeat === 'none') {
      if (start >= from && start <= through) result.push({ ...item, occurrenceKey: item.id });
      continue;
    }
    // Generate moved entries independently: their original dates may be outside
    // the visible range. Keep original identity for completion and future moves.
    for (const [originalDay, targetDay] of Object.entries(item.occurrenceMoves || {})) {
      const moved = new Date(onDay(start, targetDay));
      if (moved < from || moved > through) continue;
      result.push({
        ...item,
        startsAt: moved.toISOString(),
        occurrenceDate: originalDay,
        occurrenceKey: `${item.id}:${originalDay}`,
        done: (item.completedDates || []).includes(originalDay),
      });
    }
    // Jump near the requested range so older series do not require an unbounded scan.
    const elapsedDays = (from - start) / 86400000;
    let index = 0;
    if (repeat === 'daily' || repeat === 'custom') {
      index = Math.max(0, Math.floor(elapsedDays) - 2);
    }
    if (repeat === 'weekly') index = Math.max(0, Math.floor(elapsedDays / 7) - 2);
    if (repeat === 'monthly') {
      index = Math.max(
        0,
        (from.getFullYear() - start.getFullYear()) * 12 + from.getMonth() - start.getMonth() - 1,
      );
    }
    if (repeat === 'yearly') index = Math.max(0, from.getFullYear() - start.getFullYear() - 1);

    while (true) {
      const date = nextOccurrence(start, repeat, index++);
      if (!date) continue;
      const key = dateKey(date);
      if (date > through || (item.repeatUntil && key > item.repeatUntil)) break;
      if (date < from) continue;
      // Start date is a lower bound; emit only the chosen weekdays from then on.
      if (repeat === 'custom' && !(item.repeatDays || []).includes(date.getDay())) continue;
      if (item.occurrenceMoves?.[key]) continue;
      result.push({
        ...item,
        startsAt: date.toISOString(),
        occurrenceDate: key,
        occurrenceKey: `${item.id}:${key}`,
        done: (item.completedDates || []).includes(key),
      });
    }
  }
  return result.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
