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
