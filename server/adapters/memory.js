import { ValidationError } from '../domain/hub.js';

// Explicit development/test adapter. Data is lost when the process exits.
export function createMemoryRepository() {
  const data = { notes: new Map(), events: new Map(), groceries: new Map(), members: new Map() };
  return {
    async list(kind) {
      return [...data[kind].values()].map((item) => structuredClone(item));
    },
    async get(kind, id) {
      return structuredClone(data[kind].get(id));
    },
    async save(kind, item) {
      if (
        kind === 'members' &&
        [...data.members.values()].some(
          (member) => member.id !== item.id && member.color === item.color,
        )
      ) {
        throw new ValidationError('That color is already assigned to another family member.');
      }
      data[kind].set(item.id, structuredClone(item));
    },
    async remove(kind, id) {
      return data[kind].delete(id);
    },
    async restore(kind, item) {
      if (data[kind].has(item.id)) throw new ValidationError('This item already exists.');
      data[kind].set(item.id, structuredClone(item));
    },
  };
}
