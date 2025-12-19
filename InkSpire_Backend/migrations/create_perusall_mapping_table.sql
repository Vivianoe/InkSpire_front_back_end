-- Migration: Create perusall_mappings table
-- Stores mapping between course/reading names and Perusall IDs

CREATE TABLE IF NOT EXISTS perusall_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    reading_id UUID NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
    perusall_course_id TEXT NOT NULL,  -- Perusall course ID
    perusall_assignment_id TEXT NOT NULL,  -- Perusall assignment ID
    perusall_document_id TEXT NOT NULL,  -- Perusall document ID
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure one mapping per course-reading pair
    CONSTRAINT unique_course_reading_mapping UNIQUE (course_id, reading_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_perusall_mappings_course_id ON perusall_mappings(course_id);
CREATE INDEX IF NOT EXISTS idx_perusall_mappings_reading_id ON perusall_mappings(reading_id);
CREATE INDEX IF NOT EXISTS idx_perusall_mappings_course_reading ON perusall_mappings(course_id, reading_id);

-- Add comments
COMMENT ON TABLE perusall_mappings IS 'Maps courses and readings to Perusall course_id, assignment_id, and document_id';

