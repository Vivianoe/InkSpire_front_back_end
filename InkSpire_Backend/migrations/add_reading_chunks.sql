-- Migration: Add reading_chunks column to readings table
-- Run this in Supabase SQL Editor if the column doesn't exist yet

ALTER TABLE readings 
ADD COLUMN IF NOT EXISTS reading_chunks JSONB;

-- Add comment to document the column
COMMENT ON COLUMN readings.reading_chunks IS 'PDF chunks in JSON format: [{"document_id": "...", "chunk_index": 0, "content": "...", "token_count": 512}, ...]';


