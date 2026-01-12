"""
Supabase database model definitions
Uses PostgreSQL/Supabase compatible data types
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Integer, ForeignKey, func, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base

# Scaffold Annotation Model
class ScaffoldAnnotation(Base):
    """
    scaffold_annotations table
    Each annotation corresponds to a text fragment in a reading
    """
    __tablename__ = "scaffold_annotations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    reading_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    highlight_text = Column(Text, nullable=False)
    start_offset = Column(Integer, nullable=True)
    end_offset = Column(Integer, nullable=True)
    page_number = Column(Integer, nullable=True)
    current_content = Column(Text, nullable=False)
    status = Column(String(50), nullable=False, default="draft")  # draft / accepted / rejected
    current_version_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc))

    # Relationship: one annotation can have multiple versions
    versions = relationship(
        "ScaffoldAnnotationVersion",
        back_populates="annotation",
        cascade="all, delete-orphan",
        order_by="ScaffoldAnnotationVersion.version_number"
    )

    def __repr__(self):
        return f"<ScaffoldAnnotation(id={self.id}, status={self.status})>"


class ScaffoldAnnotationVersion(Base):
    """
    scaffold_annotation_versions table
    Each automatic generation, manual edit, LLM rewrite, accept/reject creates a record
    """
    __tablename__ = "scaffold_annotation_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    annotation_id = Column(UUID(as_uuid=True), ForeignKey("scaffold_annotations.id"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    change_type = Column(String(50), nullable=False)  # pipeline / manual_edit / llm_edit / accept / reject / revert
    created_by = Column(String(255), nullable=True)  # uuid or 'pipeline'
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Relationship: version belongs to an annotation
    annotation = relationship("ScaffoldAnnotation", back_populates="versions")

    def __repr__(self):
        return f"<ScaffoldAnnotationVersion(id={self.id}, version={self.version_number}, change_type={self.change_type})>"


class User(Base):
    """
    users table
    Stores user authentication and profile information
    Password authentication is handled by Supabase Auth
    """
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supabase_user_id = Column(UUID(as_uuid=True), nullable=True, unique=True, index=True)  # Can be null for legacy users
    email = Column(Text, nullable=False, unique=True, index=True)
    name = Column(Text, nullable=False)
    role = Column(String(50), nullable=False, default="instructor")  # instructor / admin
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"

# Course Model
class Course(Base):
    """
    courses table
    Stores course basic information
    """
    __tablename__ = "courses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instructor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(Text, nullable=False)
    course_code = Column(Text, nullable=True)
    perusall_course_id = Column(Text, nullable=True)  # Perusall course ID for integration
    description = Column(Text, nullable=True)  # 课程简介
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    instructor = relationship("User", foreign_keys=[instructor_id])
    basic_infos = relationship(
        "CourseBasicInfo",
        back_populates="course",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Course(id={self.id}, title={self.title}, instructor_id={self.instructor_id})>"


class CourseBasicInfo(Base):
    """
    course_basic_info table
    Stores detailed course information with versioning support
    """
    __tablename__ = "course_basic_info"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)
    discipline_info_json = Column(JSONB, nullable=True)  # discipline background
    course_info_json = Column(JSONB, nullable=True)  # course basic info
    class_info_json = Column(JSONB, nullable=True)  # class basic indo
    current_version_id = Column(UUID(as_uuid=True), nullable=True)  # point to the current version
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    course = relationship("Course", back_populates="basic_infos")
    versions = relationship(
        "CourseBasicInfoVersion",
        back_populates="basic_info",
        cascade="all, delete-orphan",
        order_by="CourseBasicInfoVersion.version_number"
    )

    def __repr__(self):
        return f"<CourseBasicInfo(id={self.id}, course_id={self.course_id})>"


class CourseBasicInfoVersion(Base):
    """
    course_basic_info_versions table
    Stores version history of course basic information
    """
    __tablename__ = "course_basic_info_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    basic_info_id = Column(UUID(as_uuid=True), ForeignKey("course_basic_info.id"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    discipline_json = Column(JSONB, nullable=True)
    course_info_json = Column(JSONB, nullable=True)
    class_info_json = Column(JSONB, nullable=True)
    change_type = Column(String(50), nullable=False)  # manual_edit / pipeline
    created_by = Column(String(255), nullable=True)  # uuid or 'pipeline'
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    basic_info = relationship("CourseBasicInfo", back_populates="versions")

    def __repr__(self):
        return f"<CourseBasicInfoVersion(id={self.id}, basic_info_id={self.basic_info_id}, version={self.version_number})>"


class ClassProfile(Base):
    """
    class_profiles table
    Stores active current version of class profile
    """
    __tablename__ = "class_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instructor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)
    title = Column(Text, nullable=False)  # Class name
    description = Column(Text, nullable=False)  # Full class profile text (current version)
    metadata_json = Column(JSONB, nullable=True)  # Structured profile info (student background, goals, etc.)
    current_version_id = Column(UUID(as_uuid=True), nullable=True)  # The currently active version
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    instructor = relationship("User", foreign_keys=[instructor_id])
    course = relationship("Course", foreign_keys=[course_id])
    versions = relationship(
        "ClassProfileVersion",
        back_populates="class_profile",
        cascade="all, delete-orphan",
        order_by="ClassProfileVersion.version_number"
    )

    def __repr__(self):
        return f"<ClassProfile(id={self.id}, title={self.title}, instructor_id={self.instructor_id}, course_id={self.course_id})>"


class ClassProfileVersion(Base):
    """
    class_profile_versions table
    One entry per auto-generation or manual edit
    """
    __tablename__ = "class_profile_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    class_profile_id = Column(UUID(as_uuid=True), ForeignKey("class_profiles.id"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)  # e.g., 1, 2, 3
    content = Column(Text, nullable=False)  # Full profile text
    metadata_json = Column(JSONB, nullable=True)  # Structured profile info
    created_by = Column(String(255), nullable=True)  # User uuid or "pipeline"
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    class_profile = relationship("ClassProfile", back_populates="versions")

    def __repr__(self):
        return f"<ClassProfileVersion(id={self.id}, class_profile_id={self.class_profile_id}, version={self.version_number})>"


class Reading(Base):
    """
    readings table
    Stores reading materials information
    """
    __tablename__ = "readings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instructor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)
    title = Column(Text, nullable=False)
    file_path = Column(Text, nullable=False)  # Supabase Storage path
    source_type = Column(String(50), nullable=False)  # uploaded / reused
    perusall_reading_id = Column(Text, nullable=True)  # Perusall document/reading ID for integration
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    instructor = relationship("User", foreign_keys=[instructor_id])
    course = relationship("Course", foreign_keys=[course_id])
    chunks = relationship(
        "ReadingChunk",
        back_populates="reading",
        cascade="all, delete-orphan",
        order_by="ReadingChunk.chunk_index"
    )

    def __repr__(self):
        return f"<Reading(id={self.id}, title={self.title}, course_id={self.course_id})>"


class ReadingChunk(Base):
    """
    reading_chunks table
    Stores individual chunks extracted from PDF readings
    """
    __tablename__ = "reading_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reading_id = Column(UUID(as_uuid=True), ForeignKey("readings.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)  # Sequential order of chunks
    content = Column(Text, nullable=False)  # Chunk text content
    chunk_metadata = Column(JSONB, nullable=True)  # Additional metadata: page, section, token_count, document_id, etc.
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    reading = relationship("Reading", back_populates="chunks")

    def __repr__(self):
        return f"<ReadingChunk(id={self.id}, reading_id={self.reading_id}, chunk_index={self.chunk_index})>"


class Session(Base):
    """
    sessions table
    Stores session identity information for courses
    """
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)
    week_number = Column(Integer, nullable=False)  # Week number (1, 2, 3...)
    title = Column(Text, nullable=True)  # Session title (optional)
    perusall_assignment_id = Column(Text, nullable=True)  # Perusall assignment ID for integration
    current_version_id = Column(UUID(as_uuid=True), ForeignKey("session_versions.id"), nullable=True, index=True)  # Current active version
    status = Column(String(50), nullable=False, default="draft")  # draft, active, archived, etc.
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    course = relationship("Course", foreign_keys=[course_id])
    current_version = relationship("SessionVersion", foreign_keys=[current_version_id], post_update=True)
    versions = relationship(
        "SessionVersion",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SessionVersion.version_number",
        foreign_keys="SessionVersion.session_id"
    )
    session_readings = relationship(
        "SessionReading",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SessionReading.order_index"
    )

    def __repr__(self):
        return f"<Session(id={self.id}, course_id={self.course_id}, week_number={self.week_number}, status={self.status})>"


class SessionReading(Base):
    """
    session_readings table
    Many-to-Many relationship between sessions and readings
    Each session can have many readings, each reading can be reused in multiple sessions
    """
    __tablename__ = "session_readings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False, index=True)
    reading_id = Column(UUID(as_uuid=True), ForeignKey("readings.id"), nullable=False, index=True)
    added_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    order_index = Column(Integer, nullable=True)  # For frontend sorting (optional)

    # Relationships
    session = relationship("Session", back_populates="session_readings")
    reading = relationship("Reading", foreign_keys=[reading_id])

    def __repr__(self):
        return f"<SessionReading(id={self.id}, session_id={self.session_id}, reading_id={self.reading_id})>"


class SessionVersion(Base):
    """
    session_versions table
    Stores immutable version snapshots of session data
    """
    __tablename__ = "session_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)  # Version number (1, 2, 3...)
    session_info_json = Column(JSONB, nullable=True)  # This week's teaching information (user filled)
    assignment_info_json = Column(JSONB, nullable=True)  # This week's assignment info
    assignment_goals_json = Column(JSONB, nullable=True)  # Assignment/task goals
    reading_ids = Column(JSONB, nullable=True)  # Array of reading IDs for this version
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    session = relationship("Session", back_populates="versions", foreign_keys=[session_id])

    def __repr__(self):
        return f"<SessionVersion(id={self.id}, session_id={self.session_id}, version_number={self.version_number})>"


class AnnotationHighlightCoords(Base):
    """
    annotation_highlight_coords table
    Stores coordinate information for annotation highlights
    Each annotation version corresponds to one coordinate record
    """
    __tablename__ = "annotation_highlight_coords"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    annotation_version_id = Column(UUID(as_uuid=True), ForeignKey("scaffold_annotation_versions.id"), nullable=False, index=True)
    range_type = Column(String(50), nullable=False)
    range_page = Column(Integer, nullable=False)
    range_start = Column(Integer, nullable=False)
    range_end = Column(Integer, nullable=False)
    fragment = Column(Text, nullable=False)
    position_start_x = Column(Float, nullable=False)
    position_start_y = Column(Float, nullable=False)
    position_end_x = Column(Float, nullable=False)
    position_end_y = Column(Float, nullable=False)
    valid = Column(Boolean, nullable=False, default=True)  # If version is replaced, set to False
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Relationship: coordinate belongs to an annotation version
    annotation_version = relationship("ScaffoldAnnotationVersion", foreign_keys=[annotation_version_id])

    def __repr__(self):
        return f"<AnnotationHighlightCoords(id={self.id}, annotation_version_id={self.annotation_version_id}, valid={self.valid})>"


class PerusallMapping(Base):
    """
    perusall_mappings table
    Stores mapping between courses/readings and Perusall IDs
    """
    __tablename__ = "perusall_mappings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)
    reading_id = Column(UUID(as_uuid=True), ForeignKey("readings.id"), nullable=False, index=True)
    perusall_course_id = Column(Text, nullable=False)  # Perusall course ID
    perusall_assignment_id = Column(Text, nullable=False)  # Perusall assignment ID
    perusall_document_id = Column(Text, nullable=False)  # Perusall document ID
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    course = relationship("Course", foreign_keys=[course_id])
    reading = relationship("Reading", foreign_keys=[reading_id])

    def __repr__(self):
        return f"<PerusallMapping(id={self.id}, course_id={self.course_id}, reading_id={self.reading_id}, perusall_course_id={self.perusall_course_id})>"


class UserPerusallCredentials(Base):
    """
    user_perusall_credentials table
    Stores per-user Perusall API credentials for integration
    """
    __tablename__ = "user_perusall_credentials"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True, index=True)
    institution_id = Column(Text, nullable=False)
    api_token = Column(Text, nullable=False)  # TODO: need to encrypt
    is_validated = Column(Boolean, nullable=False, default=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", foreign_keys=[user_id])

    def __repr__(self):
        return f"<UserPerusallCredentials(id={self.id}, user_id={self.user_id}, is_validated={self.is_validated})>"

