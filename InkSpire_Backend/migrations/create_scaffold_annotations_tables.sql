-- Migration: Create scaffold_annotations, scaffold_annotation_versions, and annotation_highlight_coords tables
-- Run this if these tables don't exist in your database

-- Create scaffold_annotations table
CREATE TABLE IF NOT EXISTS scaffold_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    reading_id UUID NOT NULL,
    generation_id UUID,
    highlight_text TEXT NOT NULL,
    start_offset INTEGER,
    end_offset INTEGER,
    page_number INTEGER,
    current_content TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    current_version_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for scaffold_annotations
CREATE INDEX IF NOT EXISTS idx_scaffold_annotations_session_id ON scaffold_annotations(session_id);
CREATE INDEX IF NOT EXISTS idx_scaffold_annotations_reading_id ON scaffold_annotations(reading_id);
CREATE INDEX IF NOT EXISTS idx_scaffold_annotations_generation_id ON scaffold_annotations(generation_id);
CREATE INDEX IF NOT EXISTS idx_scaffold_annotations_status ON scaffold_annotations(status);

-- Create scaffold_annotation_versions table
CREATE TABLE IF NOT EXISTS scaffold_annotation_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annotation_id UUID NOT NULL REFERENCES scaffold_annotations(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    change_type VARCHAR(50) NOT NULL,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for scaffold_annotation_versions
CREATE INDEX IF NOT EXISTS idx_scaffold_annotation_versions_annotation_id ON scaffold_annotation_versions(annotation_id);
CREATE INDEX IF NOT EXISTS idx_scaffold_annotation_versions_version_number ON scaffold_annotation_versions(annotation_id, version_number);

-- Create trigger function for automatic updated_at column update (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for scaffold_annotations table
DROP TRIGGER IF EXISTS update_scaffold_annotations_updated_at ON scaffold_annotations;
CREATE TRIGGER update_scaffold_annotations_updated_at
    BEFORE UPDATE ON scaffold_annotations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create annotation_highlight_coords table
CREATE TABLE IF NOT EXISTS annotation_highlight_coords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annotation_version_id UUID NOT NULL REFERENCES scaffold_annotation_versions(id) ON DELETE CASCADE,
    range_type VARCHAR(50) NOT NULL,
    range_page INTEGER NOT NULL,
    range_start INTEGER NOT NULL,
    range_end INTEGER NOT NULL,
    fragment TEXT NOT NULL,
    position_start_x DOUBLE PRECISION NOT NULL,
    position_start_y DOUBLE PRECISION NOT NULL,
    position_end_x DOUBLE PRECISION NOT NULL,
    position_end_y DOUBLE PRECISION NOT NULL,
    valid BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for annotation_highlight_coords
CREATE INDEX IF NOT EXISTS idx_annotation_highlight_coords_annotation_version_id ON annotation_highlight_coords(annotation_version_id);
CREATE INDEX IF NOT EXISTS idx_annotation_highlight_coords_valid ON annotation_highlight_coords(valid);

-- Add comments
COMMENT ON TABLE scaffold_annotations IS 'Each annotation corresponds to a text fragment in a reading';
COMMENT ON TABLE scaffold_annotation_versions IS 'Each automatic generation, manual edit, LLM rewrite, accept/reject creates a record';
COMMENT ON TABLE annotation_highlight_coords IS 'Stores coordinate information for annotation highlights, one record per annotation version';
