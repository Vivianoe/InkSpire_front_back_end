-- Supabase database table structure SQL
-- Can be executed in Supabase Dashboard SQL Editor

-- Create scaffold_annotations table
CREATE TABLE IF NOT EXISTS scaffold_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    reading_id UUID NOT NULL,
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_scaffold_annotations_session_id ON scaffold_annotations(session_id);
CREATE INDEX IF NOT EXISTS idx_scaffold_annotations_reading_id ON scaffold_annotations(reading_id);
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_scaffold_annotation_versions_annotation_id ON scaffold_annotation_versions(annotation_id);
CREATE INDEX IF NOT EXISTS idx_scaffold_annotation_versions_version_number ON scaffold_annotation_versions(annotation_id, version_number);

-- Create trigger function for automatic updated_at column update
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

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supabase_user_id UUID UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'instructor',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id ON users(supabase_user_id);

-- Create courses table
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    course_code TEXT,
    perusall_course_id TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for courses
CREATE INDEX IF NOT EXISTS idx_courses_instructor_id ON courses(instructor_id);
CREATE INDEX IF NOT EXISTS idx_courses_title ON courses(title);
CREATE INDEX IF NOT EXISTS idx_courses_course_code ON courses(course_code);

-- Create course_basic_info table
CREATE TABLE IF NOT EXISTS course_basic_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    discipline_info_json JSONB,
    course_info_json JSONB,
    class_info_json JSONB,
    current_version_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for course_basic_info
CREATE INDEX IF NOT EXISTS idx_course_basic_info_course_id ON course_basic_info(course_id);
CREATE INDEX IF NOT EXISTS idx_course_basic_info_current_version_id ON course_basic_info(current_version_id);

-- Create course_basic_info_versions table
CREATE TABLE IF NOT EXISTS course_basic_info_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    basic_info_id UUID NOT NULL REFERENCES course_basic_info(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    discipline_json JSONB,
    course_info_json JSONB,
    class_info_json JSONB,
    change_type VARCHAR(50) NOT NULL,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for course_basic_info_versions
CREATE INDEX IF NOT EXISTS idx_course_basic_info_versions_basic_info_id ON course_basic_info_versions(basic_info_id);
CREATE INDEX IF NOT EXISTS idx_course_basic_info_versions_version_number ON course_basic_info_versions(basic_info_id, version_number);

-- Create trigger for courses table
DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for course_basic_info table
DROP TRIGGER IF EXISTS update_course_basic_info_updated_at ON course_basic_info;
CREATE TRIGGER update_course_basic_info_updated_at
    BEFORE UPDATE ON course_basic_info
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create class_profiles table
CREATE TABLE IF NOT EXISTS class_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata_json JSONB,
    current_version_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for class_profiles
CREATE INDEX IF NOT EXISTS idx_class_profiles_instructor_id ON class_profiles(instructor_id);
CREATE INDEX IF NOT EXISTS idx_class_profiles_course_id ON class_profiles(course_id);
CREATE INDEX IF NOT EXISTS idx_class_profiles_current_version_id ON class_profiles(current_version_id);

-- Create class_profile_versions table
CREATE TABLE IF NOT EXISTS class_profile_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_profile_id UUID NOT NULL REFERENCES class_profiles(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    metadata_json JSONB,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for class_profile_versions
CREATE INDEX IF NOT EXISTS idx_class_profile_versions_class_profile_id ON class_profile_versions(class_profile_id);
CREATE INDEX IF NOT EXISTS idx_class_profile_versions_version_number ON class_profile_versions(class_profile_id, version_number);

-- Create trigger for class_profiles table
DROP TRIGGER IF EXISTS update_class_profiles_updated_at ON class_profiles;
CREATE TRIGGER update_class_profiles_updated_at
    BEFORE UPDATE ON class_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create readings table
CREATE TABLE IF NOT EXISTS readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create reading_chunks table
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

-- Create indexes for readings
CREATE INDEX IF NOT EXISTS idx_readings_instructor_id ON readings(instructor_id);
CREATE INDEX IF NOT EXISTS idx_readings_course_id ON readings(course_id);
CREATE INDEX IF NOT EXISTS idx_readings_source_type ON readings(source_type);

-- Create indexes for reading_chunks
CREATE INDEX IF NOT EXISTS idx_reading_chunks_reading_id ON reading_chunks(reading_id);
CREATE INDEX IF NOT EXISTS idx_reading_chunks_reading_id_index ON reading_chunks(reading_id, chunk_index);

-- Create sessions table
-- Stores session identity information
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL,
    title TEXT,
    current_version_id UUID,  -- Points to the current active version in session_versions (FK added after table creation)
    status VARCHAR(50) NOT NULL DEFAULT 'draft',  -- draft, active, archived, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_course_id ON sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_week_number ON sessions(course_id, week_number);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_current_version_id ON sessions(current_version_id);

-- Create session_versions table
-- Stores immutable version snapshots of session data
CREATE TABLE IF NOT EXISTS session_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    session_info_json JSONB,  -- This week's teaching information (user filled)
    assignment_info_json JSONB,  -- This week's assignment info
    assignment_goals_json JSONB,  -- Assignment/task goals
    reading_ids JSONB,  -- Array of reading IDs for this version
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_session_version UNIQUE (session_id, version_number)
);

-- Create indexes for session_versions
CREATE INDEX IF NOT EXISTS idx_session_versions_session_id ON session_versions(session_id);
CREATE INDEX IF NOT EXISTS idx_session_versions_version_number ON session_versions(session_id, version_number);

-- Add foreign key constraint for current_version_id (after session_versions table is created)
-- This allows sessions.current_version_id to reference session_versions.id
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

-- Create session_readings table (Many-to-Many)
CREATE TABLE IF NOT EXISTS session_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    reading_id UUID NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    order_index INTEGER
);

-- Create indexes for session_readings
CREATE INDEX IF NOT EXISTS idx_session_readings_session_id ON session_readings(session_id);
CREATE INDEX IF NOT EXISTS idx_session_readings_reading_id ON session_readings(reading_id);
CREATE INDEX IF NOT EXISTS idx_session_readings_order ON session_readings(session_id, order_index);

-- Create unique constraint to prevent duplicate session-reading pairs
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_readings_unique ON session_readings(session_id, reading_id);

-- Create session_items table
CREATE TABLE IF NOT EXISTS session_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    reading_id UUID NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_info_json JSONB,
    assignment_info_json JSONB,
    assignment_goals_json JSONB,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for session_items
CREATE INDEX IF NOT EXISTS idx_session_items_session_id ON session_items(session_id);
CREATE INDEX IF NOT EXISTS idx_session_items_reading_id ON session_items(reading_id);
CREATE INDEX IF NOT EXISTS idx_session_items_instructor_id ON session_items(instructor_id);
CREATE INDEX IF NOT EXISTS idx_session_items_session_reading ON session_items(session_id, reading_id);
CREATE INDEX IF NOT EXISTS idx_session_items_version ON session_items(session_id, reading_id, version);

-- Create trigger for sessions table
DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
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

-- Create perusall_mappings table
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

-- Create indexes for perusall_mappings
CREATE INDEX IF NOT EXISTS idx_perusall_mappings_course_id ON perusall_mappings(course_id);
CREATE INDEX IF NOT EXISTS idx_perusall_mappings_reading_id ON perusall_mappings(reading_id);
CREATE INDEX IF NOT EXISTS idx_perusall_mappings_course_reading ON perusall_mappings(course_id, reading_id);

-- Create trigger for perusall_mappings table
DROP TRIGGER IF EXISTS update_perusall_mappings_updated_at ON perusall_mappings;
CREATE TRIGGER update_perusall_mappings_updated_at
    BEFORE UPDATE ON perusall_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create user_perusall_credentials table
CREATE TABLE IF NOT EXISTS user_perusall_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id TEXT NOT NULL,
    api_token TEXT NOT NULL,  -- TODO: Encrypt using Supabase Vault in production
    is_validated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_perusall UNIQUE (user_id)
);

-- Create indexes for user_perusall_credentials
CREATE INDEX IF NOT EXISTS idx_user_perusall_credentials_user_id ON user_perusall_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_perusall_credentials_validated ON user_perusall_credentials(is_validated);

-- Create trigger for user_perusall_credentials table
DROP TRIGGER IF EXISTS update_user_perusall_credentials_updated_at ON user_perusall_credentials;
CREATE TRIGGER update_user_perusall_credentials_updated_at
    BEFORE UPDATE ON user_perusall_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add table comments
COMMENT ON TABLE scaffold_annotations IS 'Each annotation corresponds to a text fragment in a reading';
COMMENT ON TABLE scaffold_annotation_versions IS 'Each automatic generation, manual edit, LLM rewrite, accept/reject creates a record';
COMMENT ON TABLE users IS 'User authentication and profile information';
COMMENT ON TABLE courses IS 'Course basic information with Perusall course ID for integration';
COMMENT ON TABLE course_basic_info IS 'Detailed course information with versioning support';
COMMENT ON TABLE course_basic_info_versions IS 'Version history of course basic information';
COMMENT ON TABLE class_profiles IS 'Active current version of class profile';
COMMENT ON TABLE class_profile_versions IS 'One entry per auto-generation or manual edit';
COMMENT ON TABLE readings IS 'Reading materials information';
COMMENT ON TABLE sessions IS 'Session information for courses';
COMMENT ON TABLE session_readings IS 'Many-to-Many relationship between sessions and readings';
COMMENT ON TABLE session_items IS 'Independent content for each reading within a session';
COMMENT ON TABLE annotation_highlight_coords IS 'Stores coordinate information for annotation highlights, one record per annotation version';
COMMENT ON TABLE perusall_mappings IS 'Maps courses and readings to Perusall course_id, assignment_id, and document_id';
COMMENT ON TABLE user_perusall_credentials IS 'Stores per-user Perusall API credentials for integration';

