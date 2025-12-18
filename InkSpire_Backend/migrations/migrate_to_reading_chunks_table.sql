-- =====================================================
-- Migration: Split reading_chunks from readings table
-- =====================================================
-- This migration creates a separate reading_chunks table and migrates data
-- Run this in Supabase SQL Editor
--
-- Migration Steps:
-- 1. Create reading_chunks table
-- 2. Create indexes
-- 3. Migrate existing data (if any)
-- 4. Remove old column (optional, after verification)
-- =====================================================

-- Step 1: Create the new reading_chunks table
CREATE TABLE IF NOT EXISTS reading_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_id UUID NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    chunk_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure unique chunk_index per reading
    CONSTRAINT unique_reading_chunk_index UNIQUE (reading_id, chunk_index)
);

-- Step 2: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_reading_chunks_reading_id ON reading_chunks(reading_id);
CREATE INDEX IF NOT EXISTS idx_reading_chunks_reading_id_index ON reading_chunks(reading_id, chunk_index);

-- Step 3: Migrate existing data from readings.reading_chunks JSONB to reading_chunks table
-- This will convert existing JSONB chunks array to individual rows
-- Only runs if the reading_chunks column exists and has data
DO $$
DECLARE
    reading_record RECORD;
    chunk_item JSONB;
    chunk_index_val INTEGER;
    column_exists BOOLEAN;
    migrated_count INTEGER := 0;
BEGIN
    -- Check if reading_chunks column exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'readings' 
        AND column_name = 'reading_chunks'
    ) INTO column_exists;
    
    IF column_exists THEN
        -- Migrate data from JSONB column to new table
        FOR reading_record IN 
            SELECT id, reading_chunks 
            FROM readings 
            WHERE reading_chunks IS NOT NULL 
            AND jsonb_typeof(reading_chunks) = 'array'
            AND jsonb_array_length(reading_chunks) > 0
        LOOP
            chunk_index_val := 0;
            FOR chunk_item IN SELECT * FROM jsonb_array_elements(reading_record.reading_chunks)
            LOOP
                -- Skip if chunk already exists (idempotent migration)
                IF NOT EXISTS (
                    SELECT 1 FROM reading_chunks 
                    WHERE reading_id = reading_record.id 
                    AND chunk_index = COALESCE((chunk_item->>'chunk_index')::INTEGER, chunk_index_val)
                ) THEN
                    INSERT INTO reading_chunks (
                        id,
                        reading_id,
                        chunk_index,
                        content,
                        chunk_metadata,
                        created_at
                    ) VALUES (
                        gen_random_uuid(),
                        reading_record.id,
                        COALESCE((chunk_item->>'chunk_index')::INTEGER, chunk_index_val),
                        COALESCE(chunk_item->>'content', ''),
                        jsonb_build_object(
                            'document_id', chunk_item->>'document_id',
                            'token_count', CASE 
                                WHEN chunk_item->>'token_count' ~ '^[0-9]+$' 
                                THEN (chunk_item->>'token_count')::INTEGER 
                                ELSE NULL 
                            END
                        ),
                        NOW()
                    );
                    migrated_count := migrated_count + 1;
                END IF;
                chunk_index_val := chunk_index_val + 1;
            END LOOP;
        END LOOP;
        
        RAISE NOTICE 'Migrated % chunks from readings.reading_chunks to reading_chunks table', migrated_count;
    ELSE
        RAISE NOTICE 'reading_chunks column does not exist in readings table. Skipping data migration.';
    END IF;
END $$;

-- Step 4: Add comment to document the table
COMMENT ON TABLE reading_chunks IS 'Stores individual chunks extracted from PDF readings. Each chunk represents a portion of the reading text.';
COMMENT ON COLUMN reading_chunks.reading_id IS 'Foreign key to readings table';
COMMENT ON COLUMN reading_chunks.chunk_index IS 'Sequential order of chunks (0-based)';
COMMENT ON COLUMN reading_chunks.content IS 'The actual text content of the chunk';
COMMENT ON COLUMN reading_chunks.chunk_metadata IS 'Additional metadata: document_id, token_count, page, section, etc.';

-- =====================================================
-- Step 5: Remove the old reading_chunks column (OPTIONAL)
-- =====================================================
-- WARNING: Only run this after verifying the migration was successful!
-- 
-- To verify migration:
-- 1. Check that all chunks were migrated:
--    SELECT 
--        (SELECT COUNT(*) FROM readings WHERE reading_chunks IS NOT NULL) as readings_with_chunks,
--        (SELECT COUNT(*) FROM reading_chunks) as total_chunks;
--
-- 2. Compare chunk counts for each reading:
--    SELECT 
--        r.id,
--        r.title,
--        jsonb_array_length(r.reading_chunks) as old_chunk_count,
--        COUNT(rc.id) as new_chunk_count
--    FROM readings r
--    LEFT JOIN reading_chunks rc ON r.id = rc.reading_id
--    WHERE r.reading_chunks IS NOT NULL
--    GROUP BY r.id, r.title, r.reading_chunks;
--
-- 3. If everything looks good, uncomment and run:
-- ALTER TABLE readings DROP COLUMN IF EXISTS reading_chunks;
-- =====================================================

