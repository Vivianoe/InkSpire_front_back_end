-- Migration: Create perusall_assignments table and update sessions table
-- This migration enforces a strict 1:1 relationship between Perusall assignments and Inkspire sessions
-- Compatible with both fresh databases and legacy databases with old TEXT columns

-- Step 1: Create perusall_assignments table
CREATE TABLE IF NOT EXISTS perusall_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    perusall_course_id TEXT NOT NULL,
    perusall_assignment_id TEXT NOT NULL,
    name TEXT NOT NULL,
    document_ids JSONB,  -- Array of Perusall reading IDs
    parts JSONB,  -- JSONB with documentId + page ranges
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure unique combination of perusall_course_id and perusall_assignment_id
    CONSTRAINT unique_perusall_assignment UNIQUE (perusall_course_id, perusall_assignment_id)
);

-- Create indexes for perusall_assignments
CREATE INDEX IF NOT EXISTS idx_perusall_assignments_course_id ON perusall_assignments(perusall_course_id);
CREATE INDEX IF NOT EXISTS idx_perusall_assignments_assignment_id ON perusall_assignments(perusall_assignment_id);
CREATE INDEX IF NOT EXISTS idx_perusall_assignments_composite ON perusall_assignments(perusall_course_id, perusall_assignment_id);

-- Step 2: Detect schema type and handle accordingly
DO $$
DECLARE
    has_old_schema BOOLEAN;
BEGIN
    -- Check if old TEXT column exists (legacy schema)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'sessions'
        AND column_name = 'perusall_assignment_id'
        AND data_type = 'text'
    ) INTO has_old_schema;

    IF has_old_schema THEN
        -- LEGACY SCHEMA PATH: Migrate data from old TEXT columns
        RAISE NOTICE 'Detected legacy schema with TEXT perusall_assignment_id column. Migrating data...';

        -- Create temporary UUID column for migration
        ALTER TABLE sessions ADD COLUMN IF NOT EXISTS perusall_assignment_uuid UUID;

        -- Migrate existing data: create perusall_assignments entries for existing sessions
        DECLARE
            session_record RECORD;
            course_record RECORD;
            assignment_uuid UUID;
            assignment_info JSONB;
            document_ids_array JSONB;
            parts_data JSONB;
        BEGIN
            FOR session_record IN
                SELECT s.id, s.perusall_assignment_id, s.perusall_assignment_info, s.course_id
                FROM sessions s
                WHERE s.perusall_assignment_id IS NOT NULL
            LOOP
                -- Get course to find perusall_course_id
                SELECT c.perusall_course_id INTO course_record
                FROM courses c
                WHERE c.id = session_record.course_id;

                IF course_record.perusall_course_id IS NOT NULL THEN
                    -- Extract data from perusall_assignment_info if available
                    assignment_info := session_record.perusall_assignment_info;

                    -- Extract document_ids and parts from assignment_info
                    IF assignment_info IS NOT NULL THEN
                        -- Try to extract document_ids from readings array
                        IF assignment_info ? 'readings' AND jsonb_typeof(assignment_info->'readings') = 'array' THEN
                            SELECT jsonb_agg(elem->>'perusall_document_id') INTO document_ids_array
                            FROM jsonb_array_elements(assignment_info->'readings') elem;
                        END IF;

                        -- Build parts from readings array
                        IF assignment_info ? 'readings' AND jsonb_typeof(assignment_info->'readings') = 'array' THEN
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'documentId', elem->>'perusall_document_id',
                                    'startPage', (elem->>'start_page')::int,
                                    'endPage', (elem->>'end_page')::int
                                )
                            ) INTO parts_data
                            FROM jsonb_array_elements(assignment_info->'readings') elem;
                        END IF;
                    END IF;

                    -- Check if assignment already exists
                    SELECT id INTO assignment_uuid
                    FROM perusall_assignments
                    WHERE perusall_course_id = course_record.perusall_course_id
                      AND perusall_assignment_id = session_record.perusall_assignment_id;

                    -- If not exists, create it
                    IF assignment_uuid IS NULL THEN
                        INSERT INTO perusall_assignments (
                            perusall_course_id,
                            perusall_assignment_id,
                            name,
                            document_ids,
                            parts
                        ) VALUES (
                            course_record.perusall_course_id,
                            session_record.perusall_assignment_id,
                            COALESCE(assignment_info->>'perusall_assignment_name', 'Untitled'),
                            document_ids_array,
                            parts_data
                        )
                        RETURNING id INTO assignment_uuid;
                    END IF;

                    -- Update session with UUID reference
                    UPDATE sessions
                    SET perusall_assignment_uuid = assignment_uuid
                    WHERE id = session_record.id;
                END IF;
            END LOOP;
        END;

        -- Drop old TEXT columns
        ALTER TABLE sessions DROP COLUMN IF EXISTS perusall_assignment_id;
        ALTER TABLE sessions DROP COLUMN IF EXISTS perusall_assignment_info;

        -- Rename temporary column to final name
        ALTER TABLE sessions RENAME COLUMN perusall_assignment_uuid TO perusall_assignment_id;

        RAISE NOTICE 'Legacy data migration completed.';

    ELSE
        -- FRESH SCHEMA PATH: Just add the new UUID column
        RAISE NOTICE 'Detected fresh schema. Adding perusall_assignment_id UUID column...';

        -- Add UUID column if it doesn't exist
        ALTER TABLE sessions ADD COLUMN IF NOT EXISTS perusall_assignment_id UUID;

        RAISE NOTICE 'Fresh schema setup completed.';
    END IF;
END $$;

-- Step 3: Add foreign key constraint (idempotent)
-- Perusall assignments can map to multiple sessions
DO $$
BEGIN
    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
        AND table_name = 'sessions'
        AND constraint_name = 'fk_sessions_perusall_assignment'
    ) THEN
        ALTER TABLE sessions
        ADD CONSTRAINT fk_sessions_perusall_assignment
        FOREIGN KEY (perusall_assignment_id)
        REFERENCES perusall_assignments(id)
        ON DELETE SET NULL;

        RAISE NOTICE 'Foreign key constraint added.';
    ELSE
        RAISE NOTICE 'Foreign key constraint already exists.';
    END IF;
END $$;

-- Create index for the foreign key
CREATE INDEX IF NOT EXISTS idx_sessions_perusall_assignment_id ON sessions(perusall_assignment_id);

-- Step 4: Create trigger to update updated_at for perusall_assignments
CREATE OR REPLACE FUNCTION update_perusall_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_perusall_assignments_updated_at ON perusall_assignments;
CREATE TRIGGER update_perusall_assignments_updated_at
    BEFORE UPDATE ON perusall_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_perusall_assignments_updated_at();
