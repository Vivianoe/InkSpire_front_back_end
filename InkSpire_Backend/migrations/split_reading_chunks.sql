-- Migration: Split reading_chunks from readings table into separate reading_chunks table
-- Run this in Supabase SQL Editor to migrate existing data

-- Step 1: Create the new reading_chunks table
CREATE TABLE IF NOT EXISTS reading_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_id UUID NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS idx_reading_chunks_reading_id ON reading_chunks(reading_id);
CREATE INDEX IF NOT EXISTS idx_reading_chunks_reading_id_index ON reading_chunks(reading_id, chunk_index);

-- Step 3: Migrate existing data from readings.reading_chunks JSONB to reading_chunks table
-- This will convert existing JSONB chunks array to individual rows
DO $$
DECLARE
    reading_record RECORD;
    chunk_item JSONB;
    chunk_index_val INTEGER;
BEGIN
    FOR reading_record IN 
        SELECT id, reading_chunks 
        FROM readings 
        WHERE reading_chunks IS NOT NULL 
        AND jsonb_typeof(reading_chunks) = 'array'
    LOOP
        chunk_index_val := 0;
        FOR chunk_item IN SELECT * FROM jsonb_array_elements(reading_record.reading_chunks)
        LOOP
            INSERT INTO reading_chunks (
                id,
                reading_id,
                chunk_index,
                content,
                metadata,
                created_at
            ) VALUES (
                gen_random_uuid(),
                reading_record.id,
                COALESCE((chunk_item->>'chunk_index')::INTEGER, chunk_index_val),
                COALESCE(chunk_item->>'content', ''),
                jsonb_build_object(
                    'document_id', chunk_item->>'document_id',
                    'token_count', (chunk_item->>'token_count')::INTEGER
                ),
                NOW()
            );
            chunk_index_val := chunk_index_val + 1;
        END LOOP;
    END LOOP;
END $$;

-- Step 4: Remove the reading_chunks column from readings table
-- WARNING: Only run this after verifying the migration was successful!
-- ALTER TABLE readings DROP COLUMN IF EXISTS reading_chunks;

-- Note: The DROP COLUMN command is commented out for safety.
-- Uncomment and run it separately after verifying the migration.


