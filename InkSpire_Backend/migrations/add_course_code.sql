-- Add course_code column to courses table
ALTER TABLE courses ADD COLUMN course_code TEXT;

-- Create index on course_code for better query performance
CREATE INDEX idx_courses_course_code ON courses(course_code);
