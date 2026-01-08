"""
Course service layer for course and course basic info management
Handles course creation, updates, and version management
"""
import uuid
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from app.models.models import Course, CourseBasicInfo, CourseBasicInfoVersion


def create_course(
    db: Session,
    instructor_id: uuid.UUID,
    title: str,
    perusall_course_id: Optional[str] = None,
    description: Optional[str] = None,
    course_code: Optional[str] = None,
) -> Course:
    """
    Create a new course
    """
    course = Course(
        id=uuid.uuid4(),
        instructor_id=instructor_id,
        title=title.strip(),
        course_code=course_code.strip() if course_code else None,
        perusall_course_id=perusall_course_id.strip() if perusall_course_id else None,
        description=description.strip() if description else None,
    )
    
    db.add(course)
    db.commit()
    db.refresh(course)
    
    return course


def get_course_by_id(db: Session, course_id: uuid.UUID) -> Optional[Course]:
    """
    Get course by ID
    """
    return db.query(Course).filter(Course.id == course_id).first()


def get_courses_by_instructor(db: Session, instructor_id: uuid.UUID) -> List[Course]:
    """
    Get all courses for an instructor
    """
    return db.query(Course).filter(Course.instructor_id == instructor_id).order_by(desc(Course.created_at)).all()


def update_course(
    db: Session,
    course_id: uuid.UUID,
    title: Optional[str] = None,
    course_code: Optional[str] = None,
    perusall_course_id: Optional[str] = None,
    description: Optional[str] = None,
) -> Course:
    """
    Update course information
    """
    course = get_course_by_id(db, course_id)
    if not course:
        raise ValueError(f"Course {course_id} not found")

    if title is not None:
        course.title = title.strip()
    if course_code is not None:
        course.course_code = course_code.strip() if course_code else None
    if perusall_course_id is not None:
        course.perusall_course_id = perusall_course_id.strip() if perusall_course_id else None
    if description is not None:
        course.description = description.strip() if description else None
    
    db.commit()
    db.refresh(course)
    
    return course


def delete_course(db: Session, course_id: uuid.UUID) -> bool:
    """
    Delete a course and all related data
    """
    course = get_course_by_id(db, course_id)
    if not course:
        raise ValueError(f"Course {course_id} not found")
    
    db.delete(course)
    db.commit()
    
    return True


def create_course_basic_info(
    db: Session,
    course_id: uuid.UUID,
    discipline_info_json: Optional[Dict[str, Any]] = None,
    course_info_json: Optional[Dict[str, Any]] = None,
    class_info_json: Optional[Dict[str, Any]] = None,
) -> CourseBasicInfo:
    """
    Create a new course basic info record
    """
    basic_info = CourseBasicInfo(
        id=uuid.uuid4(),
        course_id=course_id,
        discipline_info_json=discipline_info_json,
        course_info_json=course_info_json,
        class_info_json=class_info_json,
    )
    
    db.add(basic_info)
    db.commit()
    db.refresh(basic_info)
    
    return basic_info


def get_course_basic_info_by_id(db: Session, basic_info_id: uuid.UUID) -> Optional[CourseBasicInfo]:
    """
    Get course basic info by ID
    """
    return db.query(CourseBasicInfo).filter(CourseBasicInfo.id == basic_info_id).first()


def get_course_basic_info_by_course_id(db: Session, course_id: uuid.UUID) -> Optional[CourseBasicInfo]:
    """
    Get course basic info by course ID (returns the first/latest one)
    """
    return db.query(CourseBasicInfo).filter(CourseBasicInfo.course_id == course_id).order_by(desc(CourseBasicInfo.created_at)).first()


def update_course_basic_info(
    db: Session,
    basic_info_id: uuid.UUID,
    discipline_info_json: Optional[Dict[str, Any]] = None,
    course_info_json: Optional[Dict[str, Any]] = None,
    class_info_json: Optional[Dict[str, Any]] = None,
    change_type: str = "manual_edit",
    created_by: Optional[str] = None,
) -> CourseBasicInfo:
    """
    Update course basic info and create a version record
    """
    basic_info = get_course_basic_info_by_id(db, basic_info_id)
    if not basic_info:
        raise ValueError(f"Course basic info {basic_info_id} not found")
    
    # Get current version number
    max_version = db.query(CourseBasicInfoVersion).filter(
        CourseBasicInfoVersion.basic_info_id == basic_info_id
    ).order_by(desc(CourseBasicInfoVersion.version_number)).first()
    
    next_version = (max_version.version_number + 1) if max_version else 1
    
    # Create version record with old values
    version = CourseBasicInfoVersion(
        id=uuid.uuid4(),
        basic_info_id=basic_info_id,
        version_number=next_version,
        discipline_json=basic_info.discipline_info_json,
        course_info_json=basic_info.course_info_json,
        class_info_json=basic_info.class_info_json,
        change_type=change_type,
        created_by=created_by or "pipeline",
    )
    
    db.add(version)
    
    # Update basic info
    if discipline_info_json is not None:
        basic_info.discipline_info_json = discipline_info_json
    if course_info_json is not None:
        basic_info.course_info_json = course_info_json
    if class_info_json is not None:
        basic_info.class_info_json = class_info_json
    
    basic_info.current_version_id = version.id
    
    db.commit()
    db.refresh(basic_info)
    
    return basic_info


def get_course_basic_info_versions(
    db: Session,
    basic_info_id: uuid.UUID,
) -> List[CourseBasicInfoVersion]:
    """
    Get all versions for a course basic info
    """
    return db.query(CourseBasicInfoVersion).filter(
        CourseBasicInfoVersion.basic_info_id == basic_info_id
    ).order_by(desc(CourseBasicInfoVersion.version_number)).all()


def get_course_basic_info_version_by_id(
    db: Session,
    version_id: uuid.UUID,
) -> Optional[CourseBasicInfoVersion]:
    """
    Get a specific version by ID
    """
    return db.query(CourseBasicInfoVersion).filter(CourseBasicInfoVersion.id == version_id).first()


def course_to_dict(course: Course) -> Dict[str, Any]:
    """
    Convert Course model to dictionary
    """
    return {
        "id": str(course.id),
        "instructor_id": str(course.instructor_id),
        "title": course.title,
        "course_code": course.course_code,
        "perusall_course_id": course.perusall_course_id,
        "description": course.description,
        "created_at": course.created_at.isoformat() if course.created_at else None,
        "updated_at": course.updated_at.isoformat() if course.updated_at else None,
    }


def course_basic_info_to_dict(basic_info: CourseBasicInfo) -> Dict[str, Any]:
    """
    Convert CourseBasicInfo model to dictionary
    """
    return {
        "id": str(basic_info.id),
        "course_id": str(basic_info.course_id),
        "discipline_info_json": basic_info.discipline_info_json,
        "course_info_json": basic_info.course_info_json,
        "class_info_json": basic_info.class_info_json,
        "current_version_id": str(basic_info.current_version_id) if basic_info.current_version_id else None,
        "created_at": basic_info.created_at.isoformat() if basic_info.created_at else None,
        "updated_at": basic_info.updated_at.isoformat() if basic_info.updated_at else None,
    }


def course_basic_info_version_to_dict(version: CourseBasicInfoVersion) -> Dict[str, Any]:
    """
    Convert CourseBasicInfoVersion model to dictionary
    """
    return {
        "id": str(version.id),
        "basic_info_id": str(version.basic_info_id),
        "version_number": version.version_number,
        "discipline_json": version.discipline_json,
        "course_info_json": version.course_info_json,
        "class_info_json": version.class_info_json,
        "change_type": version.change_type,
        "created_by": version.created_by,
        "created_at": version.created_at.isoformat() if version.created_at else None,
    }

