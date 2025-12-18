"""
Supabase database initialization script
Creates database table structures
"""
from app.core.database import engine, Base
from app.models.models import (
    ScaffoldAnnotation,
    ScaffoldAnnotationVersion,
    User,
    Course,
    CourseBasicInfo,
    CourseBasicInfoVersion,
    ClassProfile,
    ClassProfileVersion,
    Reading,
    Session,
    SessionReading,
    SessionItem,
)


def init_db():
    """
    Create all database tables
    Note: In Supabase, you can also create tables directly via SQL Editor
    """
    print("Creating Supabase database tables...")
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully!")
        print("\nCreated tables:")
        print("  - scaffold_annotations")
        print("  - scaffold_annotation_versions")
        print("  - users")
        print("  - courses")
        print("  - course_basic_info")
        print("  - course_basic_info_versions")
        print("  - class_profiles")
        print("  - class_profile_versions")
        print("  - readings")
        print("  - sessions")
        print("  - session_readings")
        print("  - session_items")
    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        print("\nTips:")
        print("1. Make sure DATABASE_URL or SUPABASE_DB_URL environment variable is set correctly")
        print("2. Connection string format: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres")
        print("3. Or use Supabase Dashboard SQL Editor to create tables manually")


if __name__ == "__main__":
    init_db()

