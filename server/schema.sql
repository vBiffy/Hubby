-- Idempotent initial migration. Future schema changes should get numbered files.
CREATE TABLE IF NOT EXISTS hub_items (
  id text PRIMARY KEY,
  kind text NOT NULL CONSTRAINT hub_items_kind_check
    CHECK (kind IN ('notes', 'events', 'groceries', 'members')),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS hub_items_kind_updated ON hub_items (kind, updated_at DESC);

-- Also upgrade existing installations. Replacing only the kind constraint
-- preserves all notes/events; the transaction avoids a gap in validation.
BEGIN;
ALTER TABLE hub_items DROP CONSTRAINT IF EXISTS hub_items_kind_check;
ALTER TABLE hub_items ADD CONSTRAINT hub_items_kind_check
  CHECK (kind IN ('notes', 'events', 'groceries', 'members'));
COMMIT;

-- Enforce uniqueness even when two screens save members at the same time.
CREATE UNIQUE INDEX IF NOT EXISTS hub_members_unique_color
  ON hub_items (lower(payload->>'color')) WHERE kind = 'members';
