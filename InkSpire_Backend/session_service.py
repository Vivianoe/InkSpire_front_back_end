"""
Session service layer for session and session-reading management
Handles session creation, updates, and reading associations
"""
import uuid
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_
from models import Session, SessionReading, Reading, SessionItem


def create_session(
    db: Session,
    course_id: uuid.UUID,
    week_number: int,
    title: Optional[str] = None,
    session_info_json: Optional[Dict[str, Any]] = None,
    assignment_info_json: Optional[Dict[str, Any]] = None,
    assignment_goals_json: Optional[Dict[str, Any]] = None,
) -> Session:
    """
    Create a new session
    """
    session = Session(
        id=uuid.uuid4(),
        course_id=course_id,
        week_number=week_number,
        title=title.strip() if title else None,
        session_info_json=session_info_json,
        assignment_info_json=assignment_info_json,
        assignment_goals_json=assignment_goals_json,
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
    session_info_json: Optional[Dict[str, Any]] = None,
    assignment_info_json: Optional[Dict[str, Any]] = None,
    assignment_goals_json: Optional[Dict[str, Any]] = None,
) -> Session:
    """
    Update session information
    """
    session = get_session_by_id(db, session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")
    
    if week_number is not None:
        session.week_number = week_number
    if title is not None:
        session.title = title.strip() if title else None
    if session_info_json is not None:
        session.session_info_json = session_info_json
    if assignment_info_json is not None:
        session.assignment_info_json = assignment_info_json
    if assignment_goals_json is not None:
        session.assignment_goals_json = assignment_goals_json
    
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
        "session_info_json": session.session_info_json,
        "assignment_info_json": session.assignment_info_json,
        "assignment_goals_json": session.assignment_goals_json,
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
# Session Item Management
# ======================================================

def create_session_item(
    db: Session,
    session_id: uuid.UUID,
    reading_id: uuid.UUID,
    instructor_id: uuid.UUID,
    session_info_json: Optional[Dict[str, Any]] = None,
    assignment_info_json: Optional[Dict[str, Any]] = None,
    assignment_goals_json: Optional[Dict[str, Any]] = None,
    version: int = 1,
) -> SessionItem:
    """
    Create a new session item (or new version of existing item)
    """
    session_item = SessionItem(
        id=uuid.uuid4(),
        session_id=session_id,
        reading_id=reading_id,
        instructor_id=instructor_id,
        session_info_json=session_info_json,
        assignment_info_json=assignment_info_json,
        assignment_goals_json=assignment_goals_json,
        version=version,
    )
    
    db.add(session_item)
    db.commit()
    db.refresh(session_item)
    
    return session_item


def get_session_item_by_id(db: Session, item_id: uuid.UUID) -> Optional[SessionItem]:
    """
    Get session item by ID
    """
    return db.query(SessionItem).filter(SessionItem.id == item_id).first()


def get_session_item_by_session_and_reading(
    db: Session,
    session_id: uuid.UUID,
    reading_id: uuid.UUID,
) -> Optional[SessionItem]:
    """
    Get the latest version of session item for a specific session and reading
    """
    return db.query(SessionItem).filter(
        and_(
            SessionItem.session_id == session_id,
            SessionItem.reading_id == reading_id
        )
    ).order_by(desc(SessionItem.version)).first()


def get_session_items_by_session(
    db: Session,
    session_id: uuid.UUID,
) -> List[SessionItem]:
    """
    Get all session items for a session (latest version of each reading)
    """
    # Get the latest version for each reading in the session
    subquery = db.query(
        SessionItem.reading_id,
        db.func.max(SessionItem.version).label('max_version')
    ).filter(
        SessionItem.session_id == session_id
    ).group_by(SessionItem.reading_id).subquery()
    
    return db.query(SessionItem).join(
        subquery,
        and_(
            SessionItem.reading_id == subquery.c.reading_id,
            SessionItem.version == subquery.c.max_version
        )
    ).filter(
        SessionItem.session_id == session_id
    ).all()


def get_session_item_versions(
    db: Session,
    session_id: uuid.UUID,
    reading_id: uuid.UUID,
) -> List[SessionItem]:
    """
    Get all versions of a session item for a specific session and reading
    """
    return db.query(SessionItem).filter(
        and_(
            SessionItem.session_id == session_id,
            SessionItem.reading_id == reading_id
        )
    ).order_by(desc(SessionItem.version)).all()


def save_session_item(
    db: Session,
    session_id: uuid.UUID,
    reading_id: uuid.UUID,
    instructor_id: uuid.UUID,
    session_info_json: Optional[Dict[str, Any]] = None,
    assignment_info_json: Optional[Dict[str, Any]] = None,
    assignment_goals_json: Optional[Dict[str, Any]] = None,
) -> SessionItem:
    """
    Save a new version of session item (increments version number)
    """
    # Get the latest version
    latest = get_session_item_by_session_and_reading(db, session_id, reading_id)
    
    if latest:
        # Increment version
        next_version = latest.version + 1
    else:
        # First version
        next_version = 1
    
    return create_session_item(
        db=db,
        session_id=session_id,
        reading_id=reading_id,
        instructor_id=instructor_id,
        session_info_json=session_info_json,
        assignment_info_json=assignment_info_json,
        assignment_goals_json=assignment_goals_json,
        version=next_version,
    )


def update_session_item(
    db: Session,
    item_id: uuid.UUID,
    session_info_json: Optional[Dict[str, Any]] = None,
    assignment_info_json: Optional[Dict[str, Any]] = None,
    assignment_goals_json: Optional[Dict[str, Any]] = None,
) -> SessionItem:
    """
    Update the latest version of a session item
    Note: This updates the existing record. For versioning, use save_session_item instead.
    """
    item = get_session_item_by_id(db, item_id)
    if not item:
        raise ValueError(f"Session item {item_id} not found")
    
    if session_info_json is not None:
        item.session_info_json = session_info_json
    if assignment_info_json is not None:
        item.assignment_info_json = assignment_info_json
    if assignment_goals_json is not None:
        item.assignment_goals_json = assignment_goals_json
    
    db.commit()
    db.refresh(item)
    
    return item


def delete_session_item(db: Session, item_id: uuid.UUID) -> bool:
    """
    Delete a session item
    """
    item = get_session_item_by_id(db, item_id)
    if not item:
        raise ValueError(f"Session item {item_id} not found")
    
    db.delete(item)
    db.commit()
    
    return True


def session_item_to_dict(session_item: SessionItem) -> Dict[str, Any]:
    """
    Convert SessionItem model to dictionary
    """
    return {
        "id": str(session_item.id),
        "session_id": str(session_item.session_id),
        "reading_id": str(session_item.reading_id),
        "instructor_id": str(session_item.instructor_id),
        "session_info_json": session_item.session_info_json,
        "assignment_info_json": session_item.assignment_info_json,
        "assignment_goals_json": session_item.assignment_goals_json,
        "version": session_item.version,
        "created_at": session_item.created_at.isoformat() if session_item.created_at else None,
        "updated_at": session_item.updated_at.isoformat() if session_item.updated_at else None,
    }

