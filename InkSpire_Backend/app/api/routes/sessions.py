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
    get_sessions_by_course,
    get_session_readings,
    session_to_dict,
    session_reading_to_dict,
    create_session_version,
    get_session_version_by_id,
    get_latest_session_version,
    get_session_versions,
    get_next_version_number,
    set_current_version,
    session_version_to_dict,
)
from app.services.course_service import get_course_by_id
from app.services.reading_service import get_reading_by_id
from app.services.perusall_assignment_service import get_perusall_assignment_by_ids
from app.services.session_reading_service import get_expected_session_readings
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

router = APIRouter()


class CreateSessionRequest(BaseModel):
    week_number: int = 1
    title: Optional[str] = None
    reading_ids: List[str]  # List of reading IDs to add to the session
    session_description: Optional[str] = None  # Session description
    assignment_description: Optional[str] = None  # Assignment description
    assignment_goal: Optional[str] = None  # Assignment goal
    perusall_assignment_id: Optional[str] = None  # Perusall assignment ID


class CreateSessionResponse(BaseModel):
    session_id: str
    course_id: str
    week_number: int
    title: Optional[str] = None
    reading_ids: List[str]


class SessionVersionResponse(BaseModel):
    id: str
    session_id: str
    version_number: int
    session_info_json: Optional[Dict[str, Any]] = None
    assignment_info_json: Optional[Dict[str, Any]] = None
    assignment_goals_json: Optional[Dict[str, Any]] = None
    reading_ids: List[str] = []
    created_at: Optional[str] = None


class SessionResponse(BaseModel):
    id: str
    course_id: str
    week_number: int
    title: Optional[str] = None
    perusall_assignment_id: Optional[str] = None  # Perusall assignment ID string (not UUID)
    current_version_id: Optional[str] = None
    status: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    current_version: Optional[SessionVersionResponse] = None
    reading_ids: List[str] = []
    expected_readings: List[Dict[str, Any]] = []


class SessionListResponse(BaseModel):
    sessions: List[SessionResponse]
    total: int


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
    
    # Require a Perusall assignment for structural session_readings
    if not payload.perusall_assignment_id:
        raise HTTPException(
            status_code=400,
            detail="perusall_assignment_id is required. session_readings is assignment-derived structural data.",
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
    
    # Resolve perusall_assignment_id
    perusall_assignment_uuid = None
    # payload.perusall_assignment_id is the Perusall assignment ID string
    # We need to find the corresponding perusall_assignments record
    if not course.perusall_course_id:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot link Perusall assignment: course {course_id} does not have perusall_course_id configured"
        )
    
    perusall_assignment = get_perusall_assignment_by_ids(
        db=db,
        perusall_course_id=course.perusall_course_id,
        perusall_assignment_id=payload.perusall_assignment_id,
    )
    
    if not perusall_assignment:
        raise HTTPException(
            status_code=404,
            detail=f"Perusall assignment {payload.perusall_assignment_id} not found. Please fetch assignments first via /api/courses/{course_id}/perusall/assignments"
        )
    
    # Check if this assignment is already linked to a session
    if perusall_assignment.session:
        raise HTTPException(
            status_code=400,
            detail=f"Perusall assignment {payload.perusall_assignment_id} is already linked to session {perusall_assignment.session.id}"
        )
    
    perusall_assignment_uuid = perusall_assignment.id
    
    # Create session (identity only)
    session = create_session(
        db=db,
        course_id=course_uuid,
        week_number=payload.week_number,
        title=payload.title or "Reading Session",
        status="draft",
        perusall_assignment_id=perusall_assignment_uuid,
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
    
    # Create initial version (version 1) with session data
    session_info_json = {"description": payload.session_description} if payload.session_description else None
    assignment_info_json = {"description": payload.assignment_description} if payload.assignment_description else None
    assignment_goals_json = {"goal": payload.assignment_goal} if payload.assignment_goal else None
    
    version = create_session_version(
        db=db,
        session_id=session.id,
        version_number=1,
        session_info_json=session_info_json,
        assignment_info_json=assignment_info_json,
        assignment_goals_json=assignment_goals_json,
        reading_ids=added_reading_ids,
    )
    
    # Set current version
    session = set_current_version(db, session.id, version.id)
    
    return CreateSessionResponse(
        session_id=str(session.id),
        course_id=str(session.course_id),
        week_number=session.week_number,
        title=session.title,
        reading_ids=added_reading_ids,
    )


@router.get("/courses/{course_id}/sessions", response_model=SessionListResponse)
def get_sessions_list(
    course_id: str,
    db: Session = Depends(get_db)
):
    """
    Get all sessions for a course.
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
    
    # Get sessions
    sessions = get_sessions_by_course(db, course_uuid)
    
    # Convert to response format
    sessions_data = []
    for session in sessions:
        session_dict = session_to_dict(session)
        # reading_ids must come from structural session_readings (assignment-derived)
        reading_ids = []
        current_version_data = None
        
        if session.current_version_id:
            current_version = get_session_version_by_id(db, session.current_version_id)
            if current_version:
                version_dict = session_version_to_dict(current_version)
                current_version_data = SessionVersionResponse(**version_dict)

        session_readings = get_session_readings(db, session.id)
        reading_ids = [str(sr.reading_id) for sr in session_readings]

        expected_readings = []
        try:
            expected_readings = get_expected_session_readings(db, session.id)
        except Exception:
            expected_readings = []
        
        sessions_data.append(SessionResponse(
            id=session_dict["id"],
            course_id=session_dict["course_id"],
            week_number=session_dict["week_number"],
            title=session_dict["title"],
            perusall_assignment_id=session_dict.get("perusall_assignment_id"),
            current_version_id=session_dict["current_version_id"],
            status=session_dict["status"],
            created_at=session_dict["created_at"],
            updated_at=session_dict["updated_at"],
            current_version=current_version_data,
            reading_ids=reading_ids,
            expected_readings=expected_readings,
        ))
    
    return SessionListResponse(
        sessions=sessions_data,
        total=len(sessions_data),
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
def get_session_detail(
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a session by ID with its readings.
    """
    # Validate session_id
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid session_id format: {session_id}"
        )
    
    # Get session
    session = get_session_by_id(db, session_uuid)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_id} not found"
        )
    
    # Convert to response format
    session_dict = session_to_dict(session)
    # reading_ids must come from structural session_readings (assignment-derived)
    reading_ids = []
    current_version_data = None
    
    if session.current_version_id:
        current_version = get_session_version_by_id(db, session.current_version_id)
        if current_version:
            version_dict = session_version_to_dict(current_version)
            current_version_data = SessionVersionResponse(**version_dict)

    session_readings = get_session_readings(db, session.id)
    reading_ids = [str(sr.reading_id) for sr in session_readings]

    expected_readings = []
    try:
        expected_readings = get_expected_session_readings(db, session.id)
    except Exception:
        expected_readings = []
    
    return SessionResponse(
        id=session_dict["id"],
        course_id=session_dict["course_id"],
        week_number=session_dict["week_number"],
        title=session_dict["title"],
        perusall_assignment_id=session_dict.get("perusall_assignment_id"),
        current_version_id=session_dict["current_version_id"],
        status=session_dict["status"],
        created_at=session_dict["created_at"],
        updated_at=session_dict["updated_at"],
        current_version=current_version_data,
        reading_ids=reading_ids,
        expected_readings=expected_readings,
    )


class CreateSessionVersionRequest(BaseModel):
    session_info_json: Optional[Dict[str, Any]] = None
    assignment_info_json: Optional[Dict[str, Any]] = None
    assignment_goals_json: Optional[Dict[str, Any]] = None
    reading_ids: List[str] = []


class CreateSessionVersionResponse(BaseModel):
    id: str
    session_id: str
    version_number: int
    session_info_json: Optional[Dict[str, Any]] = None
    assignment_info_json: Optional[Dict[str, Any]] = None
    assignment_goals_json: Optional[Dict[str, Any]] = None
    reading_ids: List[str] = []
    created_at: Optional[str] = None


@router.post("/courses/{course_id}/sessions/{session_id}/versions", response_model=CreateSessionVersionResponse)
def create_new_session_version(
    course_id: str,
    session_id: str,
    payload: CreateSessionVersionRequest,
    db: Session = Depends(get_db)
):
    """
    Create a new version for an existing session.
    """
    # Validate course_id
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid course_id format: {course_id}"
        )
    
    # Validate session_id
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid session_id format: {session_id}"
        )
    
    # Verify course exists
    course = get_course_by_id(db, course_uuid)
    if not course:
        raise HTTPException(
            status_code=404,
            detail=f"Course {course_id} not found"
        )
    
    # Verify session exists and belongs to course
    session = get_session_by_id(db, session_uuid)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_id} not found"
        )
    
    if session.course_id != course_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Session {session_id} does not belong to course {course_id}"
        )
    
    # Get next version number
    next_version = get_next_version_number(db, session_uuid)
    
    # Validate reading_ids if provided
    reading_uuids = []
    if payload.reading_ids:
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
                # Verify reading belongs to session's course
                if reading.course_id != session.course_id:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Reading {reading_id_str} does not belong to session's course"
                    )
                reading_uuids.append(str(reading_uuid))
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid reading_id format: {reading_id_str}"
                )
    
    # Create new version
    version = create_session_version(
        db=db,
        session_id=session_uuid,
        version_number=next_version,
        session_info_json=payload.session_info_json,
        assignment_info_json=payload.assignment_info_json,
        assignment_goals_json=payload.assignment_goals_json,
        reading_ids=reading_uuids,
    )
    
    # Set as current version
    session = set_current_version(db, session_uuid, version.id)
    
    # Convert to response format
    version_dict = session_version_to_dict(version)
    return CreateSessionVersionResponse(**version_dict)


@router.get("/sessions/{session_id}/versions", response_model=List[SessionVersionResponse])
def get_session_versions_list(
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    Get all versions for a session.
    """
    # Validate session_id
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid session_id format: {session_id}"
        )
    
    # Verify session exists
    session = get_session_by_id(db, session_uuid)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_id} not found"
        )
    
    # Get session versions
    versions = get_session_versions(db, session_uuid)
    
    # Convert to response format
    versions_data = []
    for version in versions:
        version_dict = session_version_to_dict(version)
        versions_data.append(SessionVersionResponse(**version_dict))
    
    return versions_data


@router.get("/sessions/{session_id}/versions/current", response_model=SessionVersionResponse)
def get_current_session_version(
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    Get the current version of a session.
    """
    # Validate session_id
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid session_id format: {session_id}"
        )
    
    # Verify session exists
    session = get_session_by_id(db, session_uuid)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_id} not found"
        )
    
    # Get current version
    if session.current_version_id:
        version = get_session_version_by_id(db, session.current_version_id)
        if version:
            version_dict = session_version_to_dict(version)
            return SessionVersionResponse(**version_dict)
    
    # If no current version, get latest
    latest_version = get_latest_session_version(db, session_uuid)
    if latest_version:
        version_dict = session_version_to_dict(latest_version)
        return SessionVersionResponse(**version_dict)
    
    raise HTTPException(
        status_code=404,
        detail=f"No version found for session {session_id}"
    )

