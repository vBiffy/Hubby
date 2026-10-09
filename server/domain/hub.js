import { randomUUID } from 'node:crypto';
import { repeatOptions, validDay, onDay, assignedMemberIds } from '../../shared/calendar.js';
import { maxReminderMinutes } from '../../shared/reminders.js';

export class ValidationError extends Error {}
export class NotFoundError extends Error {}
const text = (value, label, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new ValidationError(`${label} is required (maximum ${max} characters).`);
  return value.trim();
};

// Application port: repositories implement list/get/save/remove. This module
// knows nothing about Express, SQL, or React; alternative adapters can reuse it.
export function createHub(repository) {
  const kinds = ['notes', 'events', 'groceries', 'members'];
  function checkKind(kind) {
    if (!kinds.includes(kind)) throw new ValidationError('Unknown module.');
  }
  return {
    async list(kind) {
      checkKind(kind);
      return repository.list(kind);
    },
    async save(kind, input, id, restoring = false) {
      checkKind(kind);
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new ValidationError('Provide an item object.');
      if (restoring && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id || '')) {
        throw new ValidationError('Choose a valid event ID to restore.');
      }
      const existing = id ? await repository.get(kind, id) : null;
      if (restoring && (kind !== 'events' || existing)) {
        throw new ValidationError('This event cannot be restored over an existing item.');
      }
      if (id && !existing && !restoring) throw new NotFoundError('Item no longer exists.');
      const item = {
        id: id || randomUUID(),
        title: text(input.title, 'Title', 160),
        updatedAt: new Date().toISOString(),
      };
      if (kind === 'members') {
        if (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color)) {
          throw new ValidationError('Choose a required six-digit hex color.');
        }
        item.color = input.color.toLowerCase();
        const members = await repository.list('members');
        if (members.some((member) => member.id !== item.id && member.color === item.color)) {
          throw new ValidationError('That color is already assigned to another family member.');
        }
      } else if (kind === 'notes') {
        if (typeof input.body !== 'string' || input.body.length > 20000)
          throw new ValidationError('Note text must be at most 20,000 characters.');
        item.body = input.body;
      } else if (kind === 'groceries') {
        // Quantity is descriptive ("2 cartons", "500 g"), not tied to a unit system.
        if (typeof input.quantity !== 'string' || input.quantity.length > 80)
          throw new ValidationError('Quantity must be at most 80 characters.');
        if (typeof input.done !== 'boolean') throw new ValidationError('Done must be a boolean.');
        item.quantity = input.quantity.trim();
        item.done = input.done;
      } else {
        if (!['event', 'reminder'].includes(input.type))
          throw new ValidationError('Choose event or reminder.');
        if (typeof input.startsAt !== 'string' || !Number.isFinite(Date.parse(input.startsAt)))
          throw new ValidationError('Choose a valid date and time.');
        if (typeof input.done !== 'boolean') throw new ValidationError('Done must be a boolean.');
        item.type = input.type;
        if (item.type === 'event') {
          const location = input.location ?? '';
          if (typeof location !== 'string' || location.length > 300) {
            throw new ValidationError('Location must be at most 300 characters.');
          }
          item.location = location.trim();
        }
        item.startsAt = new Date(input.startsAt).toISOString();
        item.allDay = input.allDay ?? false;
        if (typeof item.allDay !== 'boolean') throw new ValidationError('Invalid all-day setting.');
        if (
          input.endsAt &&
          (typeof input.endsAt !== 'string' || !Number.isFinite(Date.parse(input.endsAt)))
        ) {
          throw new ValidationError('Choose a valid end date and time.');
        }
        item.endsAt = input.endsAt ? new Date(input.endsAt).toISOString() : null;
        if (item.allDay) {
          const start = new Date(item.startsAt);
          const end = new Date(item.endsAt || item.startsAt);
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          item.startsAt = start.toISOString();
          item.endsAt = end.toISOString();
        }
        if (
          item.endsAt &&
          (Date.parse(item.endsAt) <= Date.parse(item.startsAt) ||
            Date.parse(item.endsAt) - Date.parse(item.startsAt) > 366 * 86400000)
        ) {
          throw new ValidationError('End must follow start and be within 366 days.');
        }
        item.done = input.done;
        if (input.memberId != null && typeof input.memberId !== 'string') {
          throw new ValidationError('Choose an existing family member.');
        }
        if (input.memberId && !(await repository.get('members', input.memberId))) {
          throw new ValidationError('Choose an existing family member.');
        }
        // Older clients may edit only memberId on a previously returned record.
        const legacyChange =
          existing &&
          input.memberId !== existing.memberId &&
          JSON.stringify(input.memberIds) === JSON.stringify(existing.memberIds);
        const memberIds = legacyChange
          ? input.memberId
            ? [input.memberId]
            : []
          : (input.memberIds ?? (input.memberId ? [input.memberId] : []));
        if (
          !Array.isArray(memberIds) ||
          memberIds.length > 100 ||
          memberIds.some((id) => typeof id !== 'string' || !id)
        ) {
          throw new ValidationError('Choose existing family members.');
        }
        item.memberIds = [...new Set(memberIds)];
        item.memberId = item.memberIds.length === 1 ? item.memberIds[0] : null;
        for (const memberId of item.memberIds) {
          if (!(await repository.get('members', memberId))) {
            throw new ValidationError('Choose an existing family member.');
          }
        }
        // Missing fields on legacy plans mean no alert until explicitly enabled.
        item.reminderMinutes = input.reminderMinutes === undefined ? null : input.reminderMinutes;
        if (
          item.reminderMinutes !== null &&
          (!Number.isInteger(item.reminderMinutes) ||
            item.reminderMinutes < 0 ||
            item.reminderMinutes > maxReminderMinutes)
        ) {
          throw new ValidationError('Reminder lead time must be 0–10080 minutes, or disabled.');
        }
        if (item.memberId !== null && typeof item.memberId !== 'string') {
          throw new ValidationError('Choose an existing family member.');
        }
        if (item.memberId && !(await repository.get('members', item.memberId))) {
          throw new ValidationError('Choose an existing family member.');
        }
        item.repeat = input.repeat ?? 'none';
        if (!repeatOptions.includes(item.repeat))
          throw new ValidationError('Choose a valid repeat.');
        item.repeatDays = [];
        if (item.repeat === 'custom') {
          if (
            !Array.isArray(input.repeatDays) ||
            !input.repeatDays.length ||
            input.repeatDays.length > 7 ||
            input.repeatDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
          ) {
            throw new ValidationError('Select at least one valid weekday for a custom repeat.');
          }
          item.repeatDays = [...new Set(input.repeatDays)].sort((a, b) => a - b);
        }
        item.repeatUntil = item.repeat === 'none' ? '' : input.repeatUntil || '';
        if (item.repeatUntil) {
          if (typeof item.repeatUntil !== 'string') {
            throw new ValidationError('Choose a valid repeat end date.');
          }
          const until = new Date(`${item.repeatUntil}T23:59:59`);
          const validDate =
            /^\d{4}-\d{2}-\d{2}$/.test(item.repeatUntil) &&
            Number.isFinite(until.getTime()) &&
            until.getDate() === Number(item.repeatUntil.slice(-2));
          if (!validDate || until < new Date(item.startsAt)) {
            throw new ValidationError('Repeat end date must be valid and after the first event.');
          }
        }
        item.completedDates = input.completedDates ?? [];
        item.occurrenceMoves = input.occurrenceMoves ?? {};
        item.excludedDates = input.excludedDates ?? [];
        if (
          !Array.isArray(item.excludedDates) ||
          item.excludedDates.length > 10000 ||
          item.excludedDates.some((day) => !validDay(day))
        ) {
          throw new ValidationError('Invalid excluded occurrence dates.');
        }
        item.occurrenceOverrides = input.occurrenceOverrides ?? {};
        if (
          !item.occurrenceOverrides ||
          typeof item.occurrenceOverrides !== 'object' ||
          Array.isArray(item.occurrenceOverrides) ||
          Object.keys(item.occurrenceOverrides).length > 1000
        ) {
          throw new ValidationError('Invalid occurrence edits.');
        }
        // Reuse the same event validation without writing nested items to storage.
        const overrides = {};
        for (const [day, patch] of Object.entries(item.occurrenceOverrides)) {
          if (!validDay(day) || !patch || typeof patch !== 'object' || Array.isArray(patch)) {
            throw new ValidationError('Invalid occurrence edit.');
          }
          const validator = createHub({ ...repository, save: async () => {} });
          const checked = await validator.save('events', {
            ...input,
            ...patch,
            memberIds:
              patch.memberIds ??
              (Object.hasOwn(patch, 'memberId')
                ? patch.memberId
                  ? [patch.memberId]
                  : []
                : item.memberIds),
            repeat: 'none',
            occurrenceOverrides: {},
            occurrenceMoves: {},
            excludedDates: [],
          });
          overrides[day] = Object.fromEntries(
            [
              'title',
              'type',
              'startsAt',
              'endsAt',
              'allDay',
              'location',
              'memberId',
              'memberIds',
              'reminderMinutes',
            ].map((key) => [key, checked[key]]),
          );
        }
        item.occurrenceOverrides = overrides;
        if (
          !item.occurrenceMoves ||
          typeof item.occurrenceMoves !== 'object' ||
          Array.isArray(item.occurrenceMoves) ||
          Object.keys(item.occurrenceMoves).length > 10000 ||
          Object.entries(item.occurrenceMoves).some(
            ([original, target]) => !validDay(original) || !validDay(target),
          )
        ) {
          throw new ValidationError('Invalid moved occurrence dates.');
        }
        for (const target of Object.values(item.occurrenceMoves)) {
          try {
            onDay(item.startsAt, target);
          } catch (error) {
            throw new ValidationError(error.message);
          }
        }
        if (
          !Array.isArray(item.completedDates) ||
          item.completedDates.length > 10000 ||
          item.completedDates.some(
            (day) => typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day),
          )
        ) {
          throw new ValidationError('Invalid completed occurrence dates.');
        }
      }
      if (restoring) await repository.restore(kind, item);
      else await repository.save(kind, item);
      return item;
    },
    async remove(kind, id) {
      checkKind(kind);
      if (kind === 'members') {
        const events = await repository.list('events');
        if (
          events.some(
            (event) =>
              assignedMemberIds(event).includes(id) ||
              Object.values(event.occurrenceOverrides || {}).some((patch) =>
                assignedMemberIds(patch).includes(id),
              ),
          )
        ) {
          throw new ValidationError(
            'Reassign this member’s calendar entries before deleting them.',
          );
        }
      }
      if (!(await repository.remove(kind, id))) throw new NotFoundError('Item no longer exists.');
    },
  };
}
