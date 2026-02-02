-- Migration: add order_index to perusall_assignments and backfill deterministic order

ALTER TABLE perusall_assignments
    ADD COLUMN IF NOT EXISTS order_index INTEGER;

-- Backfill existing rows by stable order inside each course.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY perusall_course_id
            ORDER BY created_at ASC, perusall_assignment_id ASC
        ) - 1 AS rn
    FROM perusall_assignments
)
UPDATE perusall_assignments pa
SET order_index = ranked.rn
FROM ranked
WHERE pa.id = ranked.id
  AND pa.order_index IS NULL;

CREATE INDEX IF NOT EXISTS idx_perusall_assignments_course_order
    ON perusall_assignments(perusall_course_id, order_index);
