"""
Session management endpoints
"""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.session_service import (
    create_session,
    add_reading_to_session,
    get_session_by_id,
    session_to_dict,
)
from app.services.course_service import get_course_by_id
from app.services.reading_service import get_reading_by_id
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class CreateSessionRequest(BaseModel):
    week_number: int = 1
    title: Optional[str] = None
    reading_ids: List[str]  # List of reading IDs to add to the session


class CreateSessionResponse(BaseModel):
    session_id: str
    course_id: str
    week_number: int
    title: Optional[str] = None
    reading_ids: List[str]


@router.post("/courses/{course_id}/sessions", response_model=CreateSessionResponse)
def create_session_with_readings(
    course_id: str,
    payload: CreateSessionRequest,
    db: Session = Depends(get_db)
):
    """
    Create a new session and add selected readings to it.
    """
    # Validate course_id
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid course_id format: {course_id}"
        )
    
    # Verify course exists
    course = get_course_by_id(db, course_uuid)
    if not course:
        raise HTTPException(
            status_code=404,
            detail=f"Course {course_id} not found"
        )
    
    # Validate reading_ids
    reading_uuids = []
    for reading_id_str in payload.reading_ids:
        try:
            reading_uuid = uuid.UUID(reading_id_str)
            # Verify reading exists
            reading = get_reading_by_id(db, reading_uuid)
            if not reading:
                raise HTTPException(
                    status_code=404,
                    detail=f"Reading {reading_id_str} not found"
                )
            # Verify reading belongs to course
            if reading.course_id != course_uuid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Reading {reading_id_str} does not belong to course {course_id}"
                )
            reading_uuids.append(reading_uuid)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid reading_id format: {reading_id_str}"
            )
    
    # Create session
    session = create_session(
        db=db,
        course_id=course_uuid,
        week_number=payload.week_number,
        title=payload.title or "Reading Session",
    )
    
    # Add readings to session
    added_reading_ids = []
    for index, reading_uuid in enumerate(reading_uuids):
        add_reading_to_session(
            db=db,
            session_id=session.id,
            reading_id=reading_uuid,
            order_index=index,
        )
        added_reading_ids.append(str(reading_uuid))
    
    return CreateSessionResponse(
        session_id=str(session.id),
        course_id=str(session.course_id),
        week_number=session.week_number,
        title=session.title,
        reading_ids=added_reading_ids,
    )

