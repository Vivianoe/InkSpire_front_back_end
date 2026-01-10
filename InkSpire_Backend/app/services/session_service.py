"""
Session service layer for session and session-reading management
Handles session creation, updates, and reading associations
"""
import uuid
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_
from app.models.models import Session, SessionReading, Reading, SessionVersion


def create_session(
    db: Session,
    course_id: uuid.UUID,
    week_number: int,
    title: Optional[str] = None,
    status: str = "draft",
) -> Session:
    """
    Create a new session (identity only, no version data)
    """
    session = Session(
        id=uuid.uuid4(),
        course_id=course_id,
        week_number=week_number,
        title=title.strip() if title else None,
        status=status,
    )
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return session


def get_session_by_id(db: Session, session_id: uuid.UUID) -> Optional[Session]:
    """
    Get session by ID
    """
    return db.query(Session).filter(Session.id == session_id).first()


def get_sessions_by_course(db: Session, course_id: uuid.UUID) -> List[Session]:
    """
    Get all sessions for a course, ordered by week_number
    """
    return db.query(Session).filter(Session.course_id == course_id).order_by(Session.week_number).all()


def update_session(
    db: Session,
    session_id: uuid.UUID,
    week_number: Optional[int] = None,
    title: Optional[str] = None,
    status: Optional[str] = None,
    current_version_id: Optional[uuid.UUID] = None,
) -> Session:
    """
    Update session identity information (not version data)
    """
    session = get_session_by_id(db, session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")
    
    if week_number is not None:
        session.week_number = week_number
    if title is not None:
        session.title = title.strip() if title else None
    if status is not None:
        session.status = status
    if current_version_id is not None:
        session.current_version_id = current_version_id
    
    db.commit()
    db.refresh(session)
    
    return session


def delete_session(db: Session, session_id: uuid.UUID) -> bool:
    """
    Delete a session and all related session_readings
    """
    session = get_session_by_id(db, session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")
    
    db.delete(session)
    db.commit()
    
    return True


def add_reading_to_session(
    db: Session,
    session_id: uuid.UUID,
    reading_id: uuid.UUID,
    order_index: Optional[int] = None,
) -> SessionReading:
    """
    Add a reading to a session (create session_reading relationship)
    """
    # Check if relationship already exists
    existing = db.query(SessionReading).filter(
        and_(
            SessionReading.session_id == session_id,
            SessionReading.reading_id == reading_id
        )
    ).first()
    
    if existing:
        # Update order_index if provided
        if order_index is not None:
            existing.order_index = order_index
            db.commit()
            db.refresh(existing)
        return existing
    
    # If no order_index provided, get the next available index
    if order_index is None:
        max_index = db.query(SessionReading).filter(
            SessionReading.session_id == session_id
        ).order_by(desc(SessionReading.order_index)).first()
        order_index = (max_index.order_index + 1) if max_index and max_index.order_index is not None else 0
    
    session_reading = SessionReading(
        id=uuid.uuid4(),
        session_id=session_id,
        reading_id=reading_id,
        order_index=order_index,
    )
    
    db.add(session_reading)
    db.commit()
    db.refresh(session_reading)
    
    return session_reading


def remove_reading_from_session(
    db: Session,
    session_id: uuid.UUID,
    reading_id: uuid.UUID,
) -> bool:
    """
    Remove a reading from a session
    """
    session_reading = db.query(SessionReading).filter(
        and_(
            SessionReading.session_id == session_id,
            SessionReading.reading_id == reading_id
        )
    ).first()
    
    if not session_reading:
        raise ValueError(f"Reading {reading_id} not found in session {session_id}")
    
    db.delete(session_reading)
    db.commit()
    
    return True


def get_session_readings(
    db: Session,
    session_id: uuid.UUID,
) -> List[SessionReading]:
    """
    Get all readings for a session, ordered by order_index
    """
    return db.query(SessionReading).filter(
        SessionReading.session_id == session_id
    ).order_by(SessionReading.order_index).all()


def get_sessions_by_reading(
    db: Session,
    reading_id: uuid.UUID,
) -> List[Session]:
    """
    Get all sessions that use a specific reading
    """
    session_readings = db.query(SessionReading).filter(
        SessionReading.reading_id == reading_id
    ).all()
    
    session_ids = [sr.session_id for sr in session_readings]
    if not session_ids:
        return []
    
    return db.query(Session).filter(Session.id.in_(session_ids)).all()


def update_reading_order(
    db: Session,
    session_id: uuid.UUID,
    reading_orders: List[Dict[str, Any]],  # [{"reading_id": "...", "order_index": 0}, ...]
) -> bool:
    """
    Update the order of readings in a session
    """
    for item in reading_orders:
        reading_id = uuid.UUID(item["reading_id"])
        order_index = item["order_index"]
        
        session_reading = db.query(SessionReading).filter(
            and_(
                SessionReading.session_id == session_id,
                SessionReading.reading_id == reading_id
            )
        ).first()
        
        if session_reading:
            session_reading.order_index = order_index
    
    db.commit()
    return True


def session_to_dict(session: Session) -> Dict[str, Any]:
    """
    Convert Session model to dictionary
    """
    return {
        "id": str(session.id),
        "course_id": str(session.course_id),
        "week_number": session.week_number,
        "title": session.title,
        "perusall_assignment_id": getattr(session, "perusall_assignment_id", None),
        "current_version_id": str(session.current_version_id) if session.current_version_id else None,
        "status": session.status,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
    }


def session_reading_to_dict(session_reading: SessionReading) -> Dict[str, Any]:
    """
    Convert SessionReading model to dictionary
    """
    return {
        "id": str(session_reading.id),
        "session_id": str(session_reading.session_id),
        "reading_id": str(session_reading.reading_id),
        "added_at": session_reading.added_at.isoformat() if session_reading.added_at else None,
        "order_index": session_reading.order_index,
    }


# ======================================================
# Session Version Management
# ======================================================

def create_session_version(
    db: Session,
    session_id: uuid.UUID,
    version_number: int,
    session_info_json: Optional[Dict[str, Any]] = None,
    assignment_info_json: Optional[Dict[str, Any]] = None,
    assignment_goals_json: Optional[Dict[str, Any]] = None,
    reading_ids: Optional[List[str]] = None,
) -> SessionVersion:
    """
    Create a new session version (immutable snapshot)
    """
    version = SessionVersion(
        id=uuid.uuid4(),
        session_id=session_id,
        version_number=version_number,
        session_info_json=session_info_json,
        assignment_info_json=assignment_info_json,
        assignment_goals_json=assignment_goals_json,
        reading_ids=reading_ids if reading_ids else [],
    )
    
    db.add(version)
    db.commit()
    db.refresh(version)
    
    return version


def get_session_version_by_id(db: Session, version_id: uuid.UUID) -> Optional[SessionVersion]:
    """
    Get session version by ID
    """
    return db.query(SessionVersion).filter(SessionVersion.id == version_id).first()


def get_session_version_by_session_and_number(
    db: Session,
    session_id: uuid.UUID,
    version_number: int,
) -> Optional[SessionVersion]:
    """
    Get a specific version of a session
    """
    return db.query(SessionVersion).filter(
        and_(
            SessionVersion.session_id == session_id,
            SessionVersion.version_number == version_number
        )
    ).first()


def get_latest_session_version(db: Session, session_id: uuid.UUID) -> Optional[SessionVersion]:
    """
    Get the latest version of a session
    """
    return db.query(SessionVersion).filter(
        SessionVersion.session_id == session_id
    ).order_by(desc(SessionVersion.version_number)).first()


def get_session_versions(db: Session, session_id: uuid.UUID) -> List[SessionVersion]:
    """
    Get all versions of a session, ordered by version_number
    """
    return db.query(SessionVersion).filter(
        SessionVersion.session_id == session_id
    ).order_by(SessionVersion.version_number).all()


def get_next_version_number(db: Session, session_id: uuid.UUID) -> int:
    """
    Get the next version number for a session
    """
    latest = get_latest_session_version(db, session_id)
    if latest:
        return latest.version_number + 1
    return 1


def set_current_version(
    db: Session,
    session_id: uuid.UUID,
    version_id: uuid.UUID,
) -> Session:
    """
    Set the current version for a session
    """
    session = get_session_by_id(db, session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")
    
    # Verify version exists and belongs to this session
    version = get_session_version_by_id(db, version_id)
    if not version or version.session_id != session_id:
        raise ValueError(f"Version {version_id} not found or does not belong to session {session_id}")
    
    session.current_version_id = version_id
    db.commit()
    db.refresh(session)
    
    return session


def session_version_to_dict(version: SessionVersion) -> Dict[str, Any]:
    """
    Convert SessionVersion model to dictionary
    """
    return {
        "id": str(version.id),
        "session_id": str(version.session_id),
        "version_number": version.version_number,
        "session_info_json": version.session_info_json,
        "assignment_info_json": version.assignment_info_json,
        "assignment_goals_json": version.assignment_goals_json,
        "reading_ids": version.reading_ids if version.reading_ids else [],
        "created_at": version.created_at.isoformat() if version.created_at else None,
    }


# ======================================================
# Session Item Management (DEPRECATED - removed, use SessionVersion instead)
# ======================================================
# All SessionItem functions have been removed.
# Use SessionVersion functions instead:
# - get_latest_session_version() or get_current_session_version()
# - create_session_version()
# - get_session_version_by_id()

