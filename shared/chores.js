// Chores are date-based tasks, independent of calendar occurrences and reminders.
export function choreDay(now = Date.now()) {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/Detroit' });
}

export function choreOccursOn(item, day) {
  if (day < item.startsOn || (item.repeatUntil && day > item.repeatUntil)) return false;
  const date = new Date(`${day}T12:00Z`);
  const start = new Date(`${item.startsOn}T12:00Z`);
  switch (item.repeat) {
    case 'daily':
      return true;
    case 'weekly':
      return date.getUTCDay() === start.getUTCDay();
    case 'custom':
      return (item.repeatDays || []).includes(date.getUTCDay());
    case 'monthly':
      return date.getUTCDate() === start.getUTCDate();
    case 'yearly':
      return date.getUTCMonth() === start.getUTCMonth() && date.getUTCDate() === start.getUTCDate();
    default:
      return false;
  }
}

export function choreDatesThrough(item, day) {
  const dates = [];
  const cursor = new Date(`${item.startsOn}T12:00Z`);
  const end = new Date(
    `${item.repeatUntil && item.repeatUntil < day ? item.repeatUntil : day}T12:00Z`,
  );
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    if (choreOccursOn(item, date)) dates.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function choreOccurrence(item, day) {
  return {
    ...item,
    occurrenceDate: day,
    dueOn: day,
    done: (item.completedDates || []).includes(day),
    reminderStatus: item.reminderStatuses?.[day] || null,
  };
}

export function activeChores(items, day) {
  return items
    .flatMap((item) => {
      if (!item.repeat || item.repeat === 'none')
        return !item.done && item.startsOn <= day ? [item] : [];
      const dates =
        item.missedPolicy === 'skip'
          ? choreOccursOn(item, day)
            ? [day]
            : []
          : choreDatesThrough(item, day);
      return dates
        .filter((date) => !(item.completedDates || []).includes(date))
        .map((date) => choreOccurrence(item, date));
    })
    .sort(
      (a, b) =>
        (a.dueOn || '9999').localeCompare(b.dueOn || '9999') || a.title.localeCompare(b.title),
    );
}

// Viewing a future day changes visibility, never the real overdue deadline.
export function isChoreOverdue(item, today = choreDay()) {
  return Boolean(!item.done && item.dueOn && item.dueOn < today);
}

export function choreStatus(item, day = choreDay()) {
  if (item.done) return item.occurrenceDate ? `Completed ${item.occurrenceDate}` : 'Completed';
  if (item.occurrenceDate) {
    const [hour, minute] = (item.timeOfDay || '17:00').split(':').map(Number);
    const time = `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
    return isChoreOverdue(item, day)
      ? `Overdue since ${item.dueOn} at ${time}`
      : `Due ${item.dueOn === day ? 'today' : item.dueOn} at ${time}`;
  }
  if (item.startsOn > day) return `Starts ${item.startsOn}`;
  if (!item.dueOn) return 'Until completed';
  return isChoreOverdue(item, day)
    ? `Overdue since ${item.dueOn}`
    : item.dueOn === day
      ? 'Due today'
      : `Due ${item.dueOn}`;
}

export const chorePresets = [
  'Take out the trash',
  'Wash the dishes',
  'Put away laundry',
  'Tidy your room',
  'Vacuum',
  'Feed the pets',
  'Scoop litter',
];
