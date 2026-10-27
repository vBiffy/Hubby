// Use the start of the clicked half-hour cell, never the nearest boundary.
// Build the string directly so selecting a date never shifts it through UTC.
export function hubStartAt(day, position, height) {
  const minute = Math.min(1410, Math.max(0, Math.floor(((position / height) * 1440) / 30) * 30));
  return `${day}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
