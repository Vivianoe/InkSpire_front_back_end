"""
Reading service layer for reading material management
Handles reading creation, updates, and retrieval
"""
import uuid
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.models import Reading


def create_reading(
    db: Session,
    instructor_id: uuid.UUID,
    course_id: uuid.UUID,
    title: str,
    file_path: str,
    source_type: str = "uploaded",
    perusall_reading_id: Optional[str] = None,
) -> Reading:
    """
    Create a new reading
    """
    # Validate source_type
    if source_type not in ["uploaded", "reused"]:
        raise ValueError(f"Invalid source_type: {source_type}. Must be 'uploaded' or 'reused'")
    
    reading = Reading(
        id=uuid.uuid4(),
        instructor_id=instructor_id,
        course_id=course_id,
        title=title.strip(),
        file_path=file_path.strip(),
        source_type=source_type,
        perusall_reading_id=perusall_reading_id.strip() if isinstance(perusall_reading_id, str) and perusall_reading_id.strip() else None,
    )
    
    db.add(reading)
    db.commit()
    db.refresh(reading)
    
    return reading


def get_reading_by_id(db: Session, reading_id: uuid.UUID) -> Optional[Reading]:
    """
    Get reading by ID
    """
    return db.query(Reading).filter(Reading.id == reading_id).first()


def get_readings_by_course(db: Session, course_id: uuid.UUID) -> List[Reading]:
    """
    Get all readings for a course
    """
    return db.query(Reading).filter(Reading.course_id == course_id).order_by(desc(Reading.created_at)).all()


def get_readings_by_instructor(db: Session, instructor_id: uuid.UUID) -> List[Reading]:
    """
    Get all readings for an instructor
    """
    return db.query(Reading).filter(Reading.instructor_id == instructor_id).order_by(desc(Reading.created_at)).all()


def get_readings_by_course_and_instructor(
    db: Session,
    course_id: uuid.UUID,
    instructor_id: uuid.UUID,
) -> List[Reading]:
    """
    Get all readings for a specific course and instructor
    """
    return db.query(Reading).filter(
        Reading.course_id == course_id,
        Reading.instructor_id == instructor_id
    ).order_by(desc(Reading.created_at)).all()


def update_reading(
    db: Session,
    reading_id: uuid.UUID,
    title: Optional[str] = None,
    file_path: Optional[str] = None,
    source_type: Optional[str] = None,
) -> Reading:
    """
    Update reading information
    """
    reading = get_reading_by_id(db, reading_id)
    if not reading:
        raise ValueError(f"Reading {reading_id} not found")
    
    if title is not None:
        reading.title = title.strip()
    if file_path is not None:
        reading.file_path = file_path.strip()
    if source_type is not None:
        if source_type not in ["uploaded", "reused"]:
            raise ValueError(f"Invalid source_type: {source_type}. Must be 'uploaded' or 'reused'")
        reading.source_type = source_type
    
    db.commit()
    db.refresh(reading)
    
    return reading


def delete_reading(db: Session, reading_id: uuid.UUID) -> bool:
    """
    Delete a reading
    """
    reading = get_reading_by_id(db, reading_id)
    if not reading:
        raise ValueError(f"Reading {reading_id} not found")
    
    db.delete(reading)
    db.commit()
    
    return True


def reading_to_dict(reading: Reading, include_chunks: bool = False) -> dict:
    """
    Convert Reading model to dictionary
    
    Args:
        include_chunks: If True, include chunks data (requires chunks relationship to be loaded)
    """
    result = {
        "id": str(reading.id),
        "instructor_id": str(reading.instructor_id),
        "course_id": str(reading.course_id),
        "title": reading.title,
        "file_path": reading.file_path,
        "source_type": reading.source_type,
        "perusall_reading_id": getattr(reading, "perusall_reading_id", None),
        "created_at": reading.created_at.isoformat() if reading.created_at else None,
    }
    
    if include_chunks and hasattr(reading, 'chunks'):
        from reading_chunk_service import reading_chunk_to_dict
        result["reading_chunks"] = [
            reading_chunk_to_dict(chunk) for chunk in reading.chunks
        ]
    
    return result

