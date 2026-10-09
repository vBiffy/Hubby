import { ValidationError } from '../domain/hub.js';

// Every value is parameterized. The domain validates kinds; kinds are still
// stored as values, never interpolated as table names or SQL fragments.
export function createPostgresRepository(pool) {
  return {
    async list(kind) {
      const r = await pool.query(
        'SELECT payload FROM hub_items WHERE kind = $1 ORDER BY updated_at DESC',
        [kind],
      );
      return r.rows.map((row) => row.payload);
    },
    async get(kind, id) {
      const r = await pool.query('SELECT payload FROM hub_items WHERE kind = $1 AND id = $2', [
        kind,
        id,
      ]);
      return r.rows[0]?.payload;
    },
    async save(kind, item) {
      try {
        await pool.query(
          `INSERT INTO hub_items (id, kind, payload, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = EXCLUDED.updated_at`,
          [item.id, kind, item, item.updatedAt],
        );
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'hub_members_unique_color') {
          throw new ValidationError('That color is already assigned to another family member.');
        }
        throw error;
      }
    },
    async remove(kind, id) {
      const r = await pool.query('DELETE FROM hub_items WHERE kind = $1 AND id = $2', [kind, id]);
      return r.rowCount > 0;
    },
  };
}
