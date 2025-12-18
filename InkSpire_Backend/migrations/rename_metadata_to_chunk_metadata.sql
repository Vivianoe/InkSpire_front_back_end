-- =====================================================
-- Migration: Rename metadata to chunk_metadata in reading_chunks table
-- =====================================================
-- This migration renames the metadata column to chunk_metadata
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Rename the column
ALTER TABLE reading_chunks 
RENAME COLUMN metadata TO chunk_metadata;

-- Step 2: Update comment
COMMENT ON COLUMN reading_chunks.chunk_metadata IS 'Additional metadata: document_id, token_count, page, section, etc.';

-- Verification query (run after migration):
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'reading_chunks' 
-- AND column_name IN ('metadata', 'chunk_metadata');


