-- Add missing columns to readings table
-- This migration adds perusall_reading_id and deleted_at columns for Perusall integration and soft deletes

ALTER TABLE readings 
ADD COLUMN IF NOT EXISTS perusall_reading_id TEXT,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_readings_deleted_at ON readings(deleted_at);
CREATE INDEX IF NOT EXISTS idx_readings_perusall_reading_id ON readings(perusall_reading_id);

-- Add comments to document the columns
COMMENT ON COLUMN readings.perusall_reading_id IS 'Perusall document/reading ID for integration with Perusall platform.';
COMMENT ON COLUMN readings.deleted_at IS 'Timestamp for soft deletion. NULL means the reading is active.';
