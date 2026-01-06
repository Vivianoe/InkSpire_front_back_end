-- Migration script: Migrate from session_items to session_versions structure
-- This migration:
-- 1. Creates session_versions table
-- 2. Updates sessions table to add current_version_id and status
-- 3. Migrates data from session_items to session_versions (if needed)
-- 4. Drops session_items table

-- Step 1: Create session_versions table
CREATE TABLE IF NOT EXISTS session_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    session_info_json JSONB,
    assignment_info_json JSONB,
    assignment_goals_json JSONB,
    reading_ids JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_session_version UNIQUE (session_id, version_number)
);

-- Create indexes for session_versions
CREATE INDEX IF NOT EXISTS idx_session_versions_session_id ON session_versions(session_id);
CREATE INDEX IF NOT EXISTS idx_session_versions_version_number ON session_versions(session_id, version_number);

-- Step 2: Add new columns to sessions table
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS current_version_id UUID,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'draft';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_current_version_id ON sessions(current_version_id);

-- Step 3: Add foreign key constraint for current_version_id
-- Note: This will fail if there are existing current_version_id values that don't exist in session_versions
-- In that case, set current_version_id to NULL first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_sessions_current_version'
    ) THEN
        ALTER TABLE sessions 
        ADD CONSTRAINT fk_sessions_current_version 
        FOREIGN KEY (current_version_id) 
        REFERENCES session_versions(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- Step 4: Migrate data from session_items to session_versions (if session_items table exists)
-- This creates one version per session based on the latest session_item for each session
DO $$
DECLARE
    session_record RECORD;
    latest_item RECORD;
    new_version_id UUID;
    reading_ids_array JSONB;
BEGIN
    -- Check if session_items table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'session_items'
    ) THEN
        -- For each session, create a version from the latest session_item
        FOR session_record IN SELECT DISTINCT session_id FROM session_items LOOP
            -- Get the latest session_item for this session (highest version)
            SELECT * INTO latest_item
            FROM session_items
            WHERE session_id = session_record.session_id
            ORDER BY version DESC
            LIMIT 1;
            
            -- Get reading IDs for this session from session_readings
            SELECT COALESCE(jsonb_agg(reading_id::text ORDER BY order_index NULLS LAST), '[]'::jsonb) INTO reading_ids_array
            FROM session_readings
            WHERE session_id = session_record.session_id;
            
            -- Create a new version
            INSERT INTO session_versions (
                session_id,
                version_number,
                session_info_json,
                assignment_info_json,
                assignment_goals_json,
                reading_ids,
                created_at
            ) VALUES (
                session_record.session_id,
                COALESCE(latest_item.version, 1),
                latest_item.session_info_json,
                latest_item.assignment_info_json,
                latest_item.assignment_goals_json,
                reading_ids_array,
                COALESCE(latest_item.created_at, NOW())
            )
            RETURNING id INTO new_version_id;
            
            -- Update session's current_version_id
            UPDATE sessions
            SET current_version_id = new_version_id
            WHERE id = session_record.session_id;
        END LOOP;
        
        RAISE NOTICE 'Migrated data from session_items to session_versions';
    ELSE
        RAISE NOTICE 'session_items table does not exist, skipping data migration';
    END IF;
END $$;

-- Step 5: Remove old columns from sessions table (if they exist)
-- These columns are now in session_versions
ALTER TABLE sessions 
DROP COLUMN IF EXISTS session_info_json,
DROP COLUMN IF EXISTS assignment_info_json,
DROP COLUMN IF EXISTS assignment_goals_json;

-- Step 6: Drop session_items table (optional - comment out if you want to keep it for reference)
-- DROP TABLE IF EXISTS session_items CASCADE;

-- Note: After running this migration, you may want to:
-- 1. Verify that all sessions have a current_version_id set
-- 2. Update any application code that references session_items
-- 3. Test the application thoroughly before dropping session_items table

