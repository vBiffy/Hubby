import { randomUUID } from 'node:crypto';
import { repeatOptions } from '../../shared/calendar.js';

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
    async save(kind, input, id) {
      checkKind(kind);
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new ValidationError('Provide an item object.');
      const existing = id ? await repository.get(kind, id) : null;
      if (id && !existing) throw new NotFoundError('Item no longer exists.');
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
        item.startsAt = new Date(input.startsAt).toISOString();
        item.done = input.done;
        item.memberId = input.memberId || null;
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
      await repository.save(kind, item);
      return item;
    },
    async remove(kind, id) {
      checkKind(kind);
      if (kind === 'members') {
        const events = await repository.list('events');
        if (events.some((event) => event.memberId === id)) {
          throw new ValidationError(
            'Reassign this member’s calendar entries before deleting them.',
          );
        }
      }
      if (!(await repository.remove(kind, id))) throw new NotFoundError('Item no longer exists.');
    },
  };
}
