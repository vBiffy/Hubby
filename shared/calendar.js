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

export function localDateTime(value) {
  const date = new Date(value);
  const time = [date.getHours(), date.getMinutes()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
  return `${dateKey(date)}T${time}`;
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
    const startsAt = onDay(series.startsAt, day);
    return { ...series, startsAt, endsAt: shiftedEnd(series, startsAt) };
  }
  const originalDay = occurrence.occurrenceDate;
  const occurrenceMoves = { ...series.occurrenceMoves };
  if (day === originalDay) delete occurrenceMoves[originalDay];
  else occurrenceMoves[originalDay] = day;
  const occurrenceOverrides = { ...series.occurrenceOverrides };
  if (occurrenceOverrides[originalDay]) {
    const entry = occurrenceOverrides[originalDay];
    const startsAt = onDay(entry.startsAt, day);
    occurrenceOverrides[originalDay] = { ...entry, startsAt, endsAt: shiftedEnd(entry, startsAt) };
  }
  return { ...series, occurrenceMoves, occurrenceOverrides };
}

// Shift the end by local calendar days, preserving wall times across DST.
export function shiftedEnd(item, startsAt) {
  if (!item.endsAt) return null;
  const old = new Date(item.startsAt);
  const next = new Date(startsAt);
  const end = new Date(item.endsAt);
  const dayOffset = Math.round(
    (Date.UTC(next.getFullYear(), next.getMonth(), next.getDate()) -
      Date.UTC(old.getFullYear(), old.getMonth(), old.getDate())) /
      86400000,
  );
  end.setDate(end.getDate() + dayOffset);
  return end.toISOString();
}

export function overlaps(a, b) {
  if (a.type !== 'event' || b.type !== 'event' || a.done || b.done) return false;
  const first = assignedMemberIds(a);
  const second = assignedMemberIds(b);
  if (first.length && second.length && !first.some((id) => second.includes(id))) return false;
  return (
    Date.parse(a.startsAt) < Date.parse(b.endsAt || b.startsAt) &&
    Date.parse(b.startsAt) < Date.parse(a.endsAt || a.startsAt)
  );
}

// Empty assignment explicitly means the household. Old single-member records still work.
export function assignedMemberIds(item) {
  return item.memberIds ?? (item.memberId ? [item.memberId] : []);
}

export function planMembers(item, members) {
  return assignedMemberIds(item)
    .map((id) => members.find((member) => member.id === id))
    .filter(Boolean);
}

export function planMemberLabel(item, members) {
  return (
    planMembers(item, members)
      .map((member) => member.title)
      .join(', ') || 'Whole household'
  );
}

export function planStyle(item, members) {
  const people = planMembers(item, members);
  if (people.length < 2) return eventStyle(people[0]);
  const bands = people.map(
    (person, index) =>
      `${person.color} ${(index * 100) / people.length}% ${((index + 1) * 100) / people.length}%`,
  );
  // A small contrasting text backing remains readable across both light and dark colors.
  return { backgroundImage: `linear-gradient(135deg, ${bands.join(', ')})`, color: '#ffffff' };
}

export function durationMinutes(item) {
  if (item.allDay || !item.endsAt) return null;
  const minutes = (Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60000;
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null;
}

export function durationLabel(item) {
  const minutes = durationMinutes(item);
  if (minutes === null) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} hr` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
}

export function occursOnDay(item, day) {
  // Timed ends are exclusive: an event ending at midnight does not occupy tomorrow.
  const end = item.endsAt ? new Date(Date.parse(item.endsAt) - 1) : new Date(item.startsAt);
  return dateKey(new Date(item.startsAt)) <= day && dateKey(end) >= day;
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

function rawOccurrences(items, from, through) {
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

export function occurrences(items, from, through) {
  // Include starts before the visible range when a multi-day event is still active.
  const scanFrom = new Date(from);
  const span = Math.max(
    0,
    ...items.map((item) => (item.endsAt ? Date.parse(item.endsAt) - Date.parse(item.startsAt) : 0)),
  );
  scanFrom.setTime(scanFrom.getTime() - span);
  const entries = rawOccurrences(items, scanFrom, through);
  const known = new Set(entries.map((entry) => entry.occurrenceKey));
  // An edited occurrence can be outside its source series' visible date range.
  for (const item of items) {
    for (const [day, patch] of Object.entries(item.occurrenceOverrides || {})) {
      const key = `${item.id}:${day}`;
      if (!known.has(key))
        entries.push({
          ...item,
          ...patch,
          occurrenceDate: day,
          occurrenceKey: key,
          done: (item.completedDates || []).includes(day),
        });
    }
  }
  return entries
    .map((entry) => {
      const source = items.find((item) => item.id === entry.id);
      const patch = source.occurrenceOverrides?.[entry.occurrenceDate];
      return { ...entry, endsAt: shiftedEnd(source, entry.startsAt), ...patch };
    })
    .filter(
      (entry) =>
        !(entry.excludedDates || []).includes(entry.occurrenceDate) &&
        new Date(entry.startsAt) <= through &&
        (entry.endsAt ? new Date(entry.endsAt) > from : new Date(entry.startsAt) >= from),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
