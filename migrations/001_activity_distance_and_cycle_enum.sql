-- Migration: add distance_km to activities and rename activity_type 'bike' to 'cycle'.
-- Safe to run on an existing database created before this change.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'activity_type' AND e.enumlabel = 'bike'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'activity_type' AND e.enumlabel = 'cycle'
  ) THEN
    ALTER TYPE activity_type RENAME VALUE 'bike' TO 'cycle';
  END IF;
END
$$;

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC(10,3) CHECK (distance_km >= 0);
