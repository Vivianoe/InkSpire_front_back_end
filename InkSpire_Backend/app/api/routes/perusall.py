"""
Perusall integration endpoints
"""
import os
import uuid
import requests
import hashlib
import json
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError
from app.core.database import get_db
from app.models.models import (
    AnnotationHighlightCoords,
    ScaffoldAnnotation,
    ScaffoldAnnotationVersion,
    PerusallMapping,
    PerusallCourseUser,
    PerusallAnnotationPost,
    Reading,
    User,
)
from app.services.course_service import get_course_by_id
from app.services.reading_service import get_reading_by_id, get_readings_by_course
from app.services.session_service import (
    get_session_by_id,
)
from app.services.perusall_service import (
    save_user_perusall_credentials,
    get_user_perusall_credentials,
    validate_perusall_credentials,
    fetch_perusall_courses,
    import_perusall_courses,
)
from app.services.perusall_assignment_service import (
    upsert_perusall_assignment,
    get_perusall_assignments_by_course,
    get_perusall_assignment_by_id,
)
from app.models.models import Session
from auth.dependencies import get_current_user
from app.api.models import (
    PerusallAnnotationRequest,
    PerusallAnnotationResponse,
    PerusallAnnotationItem,
    PerusallMappingRequest,
    PerusallMappingResponse,
    PerusallAuthRequest,
    PerusallAuthResponse,
    PerusallCoursesResponse,
    PerusallCourseItem,
    PerusallImportRequest,
    PerusallImportResponse,
    PerusallLibraryResponse,
    PerusallLibraryReadingStatus,
    PerusallAssignmentsResponse,
    PerusallAssignmentItem,
    AssignmentReadingsResponse,
    AssignmentReadingStatus,
    PerusallUsersResponse,
    PerusallUserItem,
)

router = APIRouter()

# Perusall environment variables
PERUSALL_BASE_URL = "https://app.perusall.com/legacy-api"

X_INSTITUTION = os.getenv("PERUSALL_INSTITUTION")
X_API_TOKEN = os.getenv("PERUSALL_API_TOKEN")
#USER_ID = os.getenv("PERUSALL_USER_ID")
PERUSALL_POST_USER_ID = os.getenv("PERUSALL_POST_USER_ID")


def normalize_name(name: str) -> str:
    """
    Normalize name for flexible matching: lowercase, remove all spaces.
    This helps match names like "reading02" with "reading 02".
    """
    if not name:
        return ""
    # Convert to lowercase, remove all whitespace (spaces, tabs, newlines)
    normalized = "".join(name.lower().split())
    return normalized


def _get_perusall_headers(
    course: "Course",
    current_user: User,
    db: Session,
) -> Dict[str, str]:
    env_institution = os.getenv("PERUSALL_INSTITUTION")
    env_api_token = os.getenv("PERUSALL_API_TOKEN")

    if env_institution and env_api_token:
        institution_id = env_institution
        api_token = env_api_token
    else:
        credentials = get_user_perusall_credentials(db, current_user.id)
        if not credentials or not credentials.is_validated:
            raise HTTPException(
                status_code=401,
                detail=(
                    "Perusall credentials not found or not validated. "
                    "Please authenticate first at /api/perusall/authenticate, "
                    "or set PERUSALL_INSTITUTION and PERUSALL_API_TOKEN in environment variables."
                )
            )
        institution_id = credentials.institution_id
        api_token = credentials.api_token

    return {
        "X-Institution": institution_id,
        "X-API-Token": api_token,
    }


def _fetch_perusall_users_for_course(
    course: "Course",
    headers: Dict[str, str],
) -> PerusallUsersResponse:
    try:
        course_resp = requests.get(
            f"{PERUSALL_BASE_URL}/courses/{course.perusall_course_id}",
            headers=headers,
            timeout=30,
        )
        course_resp.raise_for_status()
        course_payload = course_resp.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Perusall course users: {str(e)}")

    instructor_ids = course_payload.get("instructorIds") or []
    student_ids = course_payload.get("studentIds") or []
    unique_ids: Dict[str, str] = {}
    for user_id in instructor_ids:
        unique_ids[str(user_id)] = "instructor"
    for user_id in student_ids:
        unique_ids.setdefault(str(user_id), "student")

    users: List[PerusallUserItem] = []
    for user_id, role in unique_ids.items():
        try:
            user_resp = requests.get(
                f"{PERUSALL_BASE_URL}/users/{user_id}",
                headers=headers,
                timeout=30,
            )
            user_resp.raise_for_status()
            user_payload = user_resp.json()
            first_name = user_payload.get("firstname") or user_payload.get("firstName")
            last_name = user_payload.get("lastname") or user_payload.get("lastName")
            display = user_payload.get("display")
            if not display:
                display = " ".join(part for part in [first_name, last_name] if part)
            users.append(
                PerusallUserItem(
                    id=str(user_id),
                    role=role,
                    first_name=first_name,
                    last_name=last_name,
                    display=display,
                )
            )
        except requests.exceptions.RequestException:
            users.append(PerusallUserItem(id=str(user_id), role=role))

    default_user_id = PERUSALL_POST_USER_ID if PERUSALL_POST_USER_ID in unique_ids else None
    return PerusallUsersResponse(users=users, default_user_id=default_user_id)


def _build_perusall_idempotency_source(
    course_id: str,
    reading_id: str,
    session_id: str,
    perusall_user_id: str,
    req: PerusallAnnotationRequest,
) -> str:
    payload: Dict[str, Any] = {
        "course_id": course_id,
        "reading_id": reading_id,
        "session_id": session_id,
        "perusall_user_id": perusall_user_id,
    }
    if req.annotation_ids:
        payload["annotation_ids"] = sorted(req.annotation_ids)
    elif req.annotations:
        payload["annotations"] = [item.model_dump() for item in req.annotations]
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


@router.post("/courses/{course_id}/sessions/{session_id}/perusall/assignment/sync")
def sync_session_assignment_to_db(
    course_id: str,
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        course_uuid = uuid.UUID(course_id)
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course_id or session_id format")

    course = get_course_by_id(db, course_uuid)
    if not course:
        raise HTTPException(status_code=404, detail=f"Course {course_id} not found")

    session = get_session_by_id(db, session_uuid)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    if session.course_id != course_uuid:
        raise HTTPException(status_code=400, detail=f"Session {session_id} does not belong to course {course_id}")

    if not course.perusall_course_id:
        raise HTTPException(status_code=400, detail=f"Course {course_id} does not have perusall_course_id")
    if not session.perusall_assignment_id:
        raise HTTPException(status_code=400, detail=f"Session {session_id} does not have perusall_assignment_id linked")
    
    # Get the perusall_assignment record
    perusall_assignment = get_perusall_assignment_by_id(db, session.perusall_assignment_id)
    if not perusall_assignment:
        raise HTTPException(status_code=404, detail=f"Perusall assignment record not found for session {session_id}")
    
    perusall_assignment_id_str = perusall_assignment.perusall_assignment_id

    env_institution = os.getenv("PERUSALL_INSTITUTION")
    env_api_token = os.getenv("PERUSALL_API_TOKEN")

    institution_id = None
    api_token = None

    if env_institution and env_api_token:
        institution_id = env_institution
        api_token = env_api_token
    else:
        credentials = get_user_perusall_credentials(db, current_user.id)
        if not credentials or not credentials.is_validated:
            raise HTTPException(
                status_code=401,
                detail=(
                    "Perusall credentials not found or not validated. "
                    "Please authenticate first at /api/perusall/authenticate, "
                    "or set PERUSALL_INSTITUTION and PERUSALL_API_TOKEN in environment variables."
                ),
            )
        institution_id = credentials.institution_id
        api_token = credentials.api_token

    mock_mode = os.getenv("PERUSALL_MOCK_MODE", "false").lower() == "true"

    perusall_course_id = course.perusall_course_id

    if mock_mode:
        from app.mocks.perusall_mock_data import get_mock_assignments_for_course, get_mock_library_for_course

        all_assignments = get_mock_assignments_for_course(perusall_course_id)
        assignment_data = next(
            (a for a in all_assignments if (a.get("_id") or a.get("id")) == perusall_assignment_id_str),
            None,
        )
        if not assignment_data:
            raise HTTPException(status_code=404, detail=f"Assignment {perusall_assignment_id} not found in Perusall")
        library_readings = get_mock_library_for_course(perusall_course_id)
    else:
        assignments_url = f"{PERUSALL_BASE_URL}/courses/{perusall_course_id}/assignments"
        headers = {
            "X-Institution": institution_id,
            "X-API-Token": api_token,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        assignments_response = requests.get(assignments_url, headers=headers, timeout=30)
        try:
            assignments_response.raise_for_status()
        except requests.exceptions.HTTPError:
            status_code = assignments_response.status_code
            response_text = (assignments_response.text or "")[:500]
            raise HTTPException(
                status_code=status_code,
                detail=f"Perusall assignments API request failed. Status: {status_code}. Response: {response_text}",
            )
        all_assignments = assignments_response.json()
        if not isinstance(all_assignments, list):
            raise HTTPException(status_code=500, detail="Unexpected response format from Perusall assignments API")

        assignment_data = next(
            (a for a in all_assignments if (a.get("_id") or a.get("id")) == perusall_assignment_id_str),
            None,
        )
        if not assignment_data:
            raise HTTPException(status_code=404, detail=f"Assignment {perusall_assignment_id_str} not found in Perusall")

        library_url = f"{PERUSALL_BASE_URL}/courses/{perusall_course_id}/library"
        library_response = requests.get(library_url, headers=headers, timeout=30)
        library_response.raise_for_status()
        library_readings = library_response.json()
        if not isinstance(library_readings, list):
            library_readings = []

    assignment_name = assignment_data.get("name") or assignment_data.get("title") or "Untitled"
    parts = assignment_data.get("parts") or []

    document_pages: Dict[str, Dict[str, Any]] = {}
    for part in parts:
        if not isinstance(part, dict):
            continue
        doc_id = part.get("documentId")
        if not doc_id:
            continue
        if str(doc_id) not in document_pages:
            document_pages[str(doc_id)] = {
                "startPage": part.get("startPage"),
                "endPage": part.get("endPage"),
            }

    document_ids = list(document_pages.keys())
    if not document_ids:
        document_ids = [str(x) for x in (assignment_data.get("documentIds") or [])]

    document_names: Dict[str, str] = {}
    for reading_item in library_readings:
        if not isinstance(reading_item, dict):
            continue
        doc_id = reading_item.get("_id") or reading_item.get("id")
        doc_name = reading_item.get("name") or reading_item.get("title")
        if doc_id:
            document_names[str(doc_id)] = doc_name

    try:
        local_readings = db.query(Reading).filter(
            Reading.course_id == course_uuid,
            Reading.perusall_reading_id.in_(document_ids),
            Reading.deleted_at.is_(None),
        ).all()
    except ProgrammingError as e:
        if "deleted_at" in str(e):
            local_readings = db.query(Reading).filter(
                Reading.course_id == course_uuid,
                Reading.perusall_reading_id.in_(document_ids),
            ).all()
        else:
            raise
    local_reading_by_doc_id = {str(r.perusall_reading_id): r for r in local_readings if r.perusall_reading_id}

    readings_payload: List[Dict[str, Any]] = []
    for doc_id in document_ids:
        pages = document_pages.get(str(doc_id), {})
        local_reading = local_reading_by_doc_id.get(str(doc_id))
        readings_payload.append(
            {
                "perusall_document_id": str(doc_id),
                "perusall_document_name": document_names.get(str(doc_id)),
                "start_page": pages.get("startPage"),
                "end_page": pages.get("endPage"),
                "local_reading_id": str(local_reading.id) if local_reading else None,
                "local_reading_title": local_reading.title if local_reading else None,
            }
        )

    # Extract document_ids and parts from assignment data
    document_ids_list = list(document_pages.keys())
    if not document_ids_list:
        document_ids_list = [str(x) for x in (assignment_data.get("documentIds") or [])]
    
    # Build parts list
    parts_list = []
    for part in parts:
        if isinstance(part, dict):
            parts_list.append({
                "documentId": part.get("documentId") or "",
                "startPage": part.get("startPage"),
                "endPage": part.get("endPage"),
            })
    
    # Update the perusall_assignment record with latest data
    upsert_perusall_assignment(
        db=db,
        perusall_course_id=perusall_course_id,
        perusall_assignment_id=perusall_assignment_id_str,
        name=assignment_name,
        document_ids=[str(d) for d in document_ids_list] if document_ids_list else None,
        parts=parts_list if parts_list else None,
    )

    return {
        "success": True,
        "session_id": str(session_uuid),
        "perusall_assignment_id": str(perusall_assignment_id_str),
        "perusall_assignment_name": assignment_name,
        "readings": readings_payload,
    }


@router.post("/courses/{course_id}/readings/{reading_id}/perusall/annotations", response_model=PerusallAnnotationResponse)
def post_annotations_to_perusall(
    course_id: str,
    reading_id: str,
    req: PerusallAnnotationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    idempotency_header: str = Header(None, alias="Idempotency-Key"),
):
    """
    Upload multiple annotations into Perusall.
    If annotation_ids are provided, fetch highlight_coords from database.
    Otherwise, use provided annotations directly.
    Each annotation corresponds to one POST request to:
    POST /courses/{courseId}/assignments/{assignmentId}/annotations
    """
    # Validate course_id and reading_id from path
    try:
        course_uuid = uuid.UUID(course_id)
        reading_uuid = uuid.UUID(reading_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid course_id or reading_id format: course_id={course_id}, reading_id={reading_id}"
        )
    
    # Verify course and reading exist
    course = get_course_by_id(db, course_uuid)
    if not course:
        raise HTTPException(
            status_code=404,
            detail=f"Course {course_id} not found"
        )
    
    reading = get_reading_by_id(db, reading_uuid)
    if not reading:
        raise HTTPException(
            status_code=404,
            detail=f"Reading {reading_id} not found"
        )
    
    # Verify reading belongs to course
    if reading.course_id != course_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Reading {reading_id} does not belong to course {course_id}"
        )
    
    # Perusall IDs will be fetched from database based on course and reading
    perusall_course_id = None
    perusall_assignment_id = None
    perusall_document_id = None

    # Check for mock mode
    import os
    mock_mode = os.getenv("PERUSALL_MOCK_MODE", "false").lower() == "true"

    # Resolve Perusall credentials
    env_institution = os.getenv("PERUSALL_INSTITUTION")
    env_api_token = os.getenv("PERUSALL_API_TOKEN")

    institution_id = None
    api_token = None

    if env_institution and env_api_token:
        institution_id = env_institution
        api_token = env_api_token
    else:
        credentials = get_user_perusall_credentials(db, current_user.id)
        if not credentials or not credentials.is_validated:
            raise HTTPException(
                status_code=401,
                detail=(
                    "Perusall credentials not found or not validated. "
                    "Please authenticate first at /api/perusall/authenticate, "
                    "or set PERUSALL_INSTITUTION and PERUSALL_API_TOKEN in environment variables."
                )
            )
        institution_id = credentials.institution_id
        api_token = credentials.api_token

    # If annotation_ids provided, fetch highlight_coords from database
    annotations_to_post = []
    first_annotation = None  # Store first annotation to verify it belongs to the course/reading
    if req.annotation_ids:
        print(f"[post_annotations_to_perusall] Fetching highlight_coords for {len(req.annotation_ids)} annotation(s)")
        for annotation_id_str in req.annotation_ids:
            try:
                annotation_id = uuid.UUID(annotation_id_str)
                # Get annotation to find current_version_id
                annotation = db.query(ScaffoldAnnotation).filter(
                    ScaffoldAnnotation.id == annotation_id
                ).first()
                
                if not annotation:
                    print(f"[post_annotations_to_perusall] Annotation {annotation_id_str} not found")
                    continue
                
                # Verify annotation belongs to the specified reading.
                # Note: scaffold_annotations table does NOT store course_id; course ownership is implied by reading_id.
                if annotation.reading_id != reading_uuid:
                    print(f"[post_annotations_to_perusall] Annotation {annotation_id_str} does not belong to reading {reading_id}")
                    continue

                print(
                    f"[post_annotations_to_perusall] Using annotation {annotation_id_str} with current_version_id={annotation.current_version_id}"
                )
                
                # Store first annotation for Perusall mapping lookup
                if first_annotation is None:
                    first_annotation = annotation
                
                if not annotation.current_version_id:
                    print(f"[post_annotations_to_perusall] Annotation {annotation_id_str} has no current_version_id")
                    continue
                
                # Get all highlight_coords for this annotation version
                coords_list = db.query(AnnotationHighlightCoords).filter(
                    AnnotationHighlightCoords.annotation_version_id == annotation.current_version_id,
                    AnnotationHighlightCoords.valid == True
                ).all()

                # Fallback: if current_version_id has no coords (e.g., after approve/edit/llm-refine creates new version),
                # try older versions and use the most recent version that has coords.
                if (not coords_list) and getattr(annotation, 'versions', None):
                    try:
                        versions_sorted = sorted(
                            list(annotation.versions),
                            key=lambda v: getattr(v, 'version_number', 0),
                            reverse=True,
                        )
                        for v in versions_sorted:
                            v_id = getattr(v, 'id', None)
                            if not v_id:
                                continue
                            coords_list = db.query(AnnotationHighlightCoords).filter(
                                AnnotationHighlightCoords.annotation_version_id == v_id,
                                AnnotationHighlightCoords.valid == True
                            ).all()
                            if coords_list:
                                print(
                                    f"[post_annotations_to_perusall] Fallback: using highlight_coords from older version for annotation {annotation_id_str} (version_number={getattr(v, 'version_number', None)})"
                                )
                                break
                    except Exception as e:
                        print(f"[post_annotations_to_perusall] Fallback version scan failed for annotation {annotation_id_str}: {e}")
                
                if not coords_list:
                    print(f"[post_annotations_to_perusall] No highlight_coords found for annotation {annotation_id_str}")
                    continue

                version_ids = list({coord.annotation_version_id for coord in coords_list if coord.annotation_version_id})
                version_content_by_id: Dict[str, str] = {}
                if version_ids:
                    try:
                        versions = (
                            db.query(ScaffoldAnnotationVersion)
                            .filter(ScaffoldAnnotationVersion.id.in_(version_ids))
                            .all()
                        )
                        version_content_by_id = {
                            str(v.id): (v.content or "") for v in versions
                        }
                    except Exception as e:
                        print(f"[post_annotations_to_perusall] Failed to load scaffold content for annotation {annotation_id_str}: {e}")

                # Convert each coord to PerusallAnnotationItem
                for coord in coords_list:
                    scaffold_text = version_content_by_id.get(str(coord.annotation_version_id), "")
                    annotations_to_post.append(PerusallAnnotationItem(
                        positionStartX=coord.position_start_x,
                        positionStartY=coord.position_start_y,
                        positionEndX=coord.position_end_x,
                        positionEndY=coord.position_end_y,
                        rangeType=coord.range_type,
                        rangePage=coord.range_page,
                        rangeStart=coord.range_start,
                        rangeEnd=coord.range_end,
                        fragment=coord.fragment,
                        text=scaffold_text,
                    ))
                
                print(f"[post_annotations_to_perusall] Found {len(coords_list)} highlight_coords for annotation {annotation_id_str}")
            except ValueError as e:
                print(f"[post_annotations_to_perusall] Invalid annotation_id format: {annotation_id_str}, error: {e}")
                continue
            except Exception as e:
                print(f"[post_annotations_to_perusall] Error fetching coords for annotation {annotation_id_str}: {e}")
                import traceback
                traceback.print_exc()
                continue
    elif req.annotations:
        # Use provided annotations directly
        annotations_to_post = req.annotations
    else:
        raise HTTPException(
            status_code=400,
            detail="Either annotation_ids or annotations must be provided"
        )
    
    if not annotations_to_post:
        raise HTTPException(
            status_code=400,
            detail="No annotations found to post. Please ensure annotation_ids exist and have highlight_coords, or provide annotations directly."
        )

    # Resolve Perusall IDs from the current DB design:
    # - courses.perusall_course_id
    # - sessions.perusall_assignment_id
    # - readings.perusall_reading_id
    from app.services.session_service import get_session_by_id

    session_uuid = None
    if first_annotation is not None:
        session_uuid = first_annotation.session_id
    elif req.session_id:
        try:
            session_uuid = uuid.UUID(req.session_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid session_id format: {req.session_id}"
            )
    else:
        raise HTTPException(
            status_code=400,
            detail="session_id is required when providing annotations directly (without annotation_ids)."
        )

    session = get_session_by_id(db, session_uuid)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_uuid} not found"
        )

    # Verify session belongs to course
    if session.course_id != course_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Session {session.id} does not belong to course {course_id}"
        )

    # course and reading were already validated from path
    if not course.perusall_course_id:
        raise HTTPException(
            status_code=400,
            detail=f"Course {course_id} does not have perusall_course_id configured."
        )

    if not session.perusall_assignment_id:
        raise HTTPException(
            status_code=400,
            detail=f"Session {session.id} does not have perusall_assignment_id configured."
        )
    
    # Get the perusall_assignment record to get the Perusall assignment ID string
    perusall_assignment = get_perusall_assignment_by_id(db, session.perusall_assignment_id)
    if not perusall_assignment:
        raise HTTPException(
            status_code=404,
            detail=f"Perusall assignment record not found for session {session.id}"
        )

    if not reading.perusall_reading_id:
        raise HTTPException(
            status_code=400,
            detail=f"Reading {reading_id} does not have perusall_reading_id configured."
        )

    perusall_course_id = course.perusall_course_id
    perusall_assignment_id = perusall_assignment.perusall_assignment_id  # Get the Perusall assignment ID string
    perusall_document_id = reading.perusall_reading_id

    print(
        f"[post_annotations_to_perusall] Resolved perusall IDs from DB: course_id={perusall_course_id}, assignment_id={perusall_assignment_id}, document_id={perusall_document_id}"
    )
    
    print(f"[post_annotations_to_perusall] Posting {len(annotations_to_post)} annotation(s) to Perusall")

    created_ids = []
    errors = []
    try:
        with requests.Session() as session:
            headers = {
                "X-Institution": institution_id,
                "X-API-Token": api_token,
            }

            post_user_id = req.perusall_user_id or PERUSALL_POST_USER_ID
            if not post_user_id:
                raise HTTPException(
                    status_code=500,
                    detail="Perusall post user ID is not configured. Set PERUSALL_POST_USER_ID (or PERUSALL_USER_ID).",
                )

            idempotency_key = (
                req.idempotency_key
                or idempotency_header
                or hashlib.sha256(
                    _build_perusall_idempotency_source(
                        course_id=str(course_uuid),
                        reading_id=str(reading_uuid),
                        session_id=str(session_uuid),
                        perusall_user_id=str(post_user_id),
                        req=req,
                    ).encode("utf-8")
                ).hexdigest()
            )

            existing = (
                db.query(PerusallAnnotationPost)
                .filter(PerusallAnnotationPost.idempotency_key == idempotency_key)
                .first()
            )
            if existing:
                if existing.status == "pending":
                    raise HTTPException(status_code=409, detail="Perusall post is already in progress for this idempotency key.")
                cached = existing.response_payload or {}
                return PerusallAnnotationResponse(
                    success=bool(cached.get("success", False)),
                    created_ids=list(cached.get("created_ids") or []),
                    errors=list(cached.get("errors") or []),
                )

            post_record = PerusallAnnotationPost(
                idempotency_key=idempotency_key,
                course_id=course_uuid,
                reading_id=reading_uuid,
                session_id=session_uuid,
                perusall_user_id=str(post_user_id),
                status="pending",
                request_payload={
                    "annotation_ids": req.annotation_ids,
                    "annotations": [item.model_dump() for item in req.annotations] if req.annotations else None,
                },
            )
            db.add(post_record)
            db.commit()

            for idx, item in enumerate(annotations_to_post):
                if not post_user_id:
                    raise HTTPException(
                        status_code=500,
                        detail="Perusall post user ID is not configured. Set PERUSALL_POST_USER_ID (or PERUSALL_USER_ID).",
                    )
                payload = {
                    "documentId": perusall_document_id,
                    "userId": post_user_id,
                    "positionStartX": item.positionStartX,
                    "positionStartY": item.positionStartY,
                    "positionEndX": item.positionEndX,
                    "positionEndY": item.positionEndY,
                    "rangeType": item.rangeType,
                    "rangePage": item.rangePage,
                    "rangeStart": item.rangeStart,
                    "rangeEnd": item.rangeEnd,
                    "fragment": item.fragment,
                    "text": f"<p>{(item.text or item.fragment)}</p>"
                }

                try:
                    if mock_mode:
                        from app.mocks.perusall_mock_data import get_mock_annotation_post_response
                        data = get_mock_annotation_post_response(idx)
                        ann_id = data.get("_id")
                        print(f"[post_annotations_to_perusall] MOCK MODE: Simulated annotation post {idx + 1}/{len(annotations_to_post)}, mock ID: {ann_id}")
                        created_ids.append(str(ann_id))
                    else:
                        url = f"{PERUSALL_BASE_URL}/courses/{perusall_course_id}/assignments/{perusall_assignment_id}/annotations"

                        print(f"[post_annotations_to_perusall] Posting annotation {idx + 1}/{len(annotations_to_post)} to: {url}")
                        print(f"[post_annotations_to_perusall] Payload: {payload}")

                        # Try form-encoded first (as Perusall API typically expects this)
                        response = session.post(url, data=payload, headers=headers, timeout=30)

                        print(f"[post_annotations_to_perusall] Response status: {response.status_code}")
                        print(f"[post_annotations_to_perusall] Response headers: {dict(response.headers)}")

                        response.raise_for_status()

                        data = response.json()
                        ann_id = None

                        # Handle different response formats from Perusall API
                        if isinstance(data, dict):
                            # Response is a dictionary: {'_id': '...'} or {'id': '...'}
                            ann_id = data.get("_id") or data.get("id")
                        elif isinstance(data, list) and len(data) > 0:
                            # Response is a list: [{'id': '...'}] or [{'_id': '...'}]
                            first_item = data[0]
                            if isinstance(first_item, dict):
                                ann_id = first_item.get("_id") or first_item.get("id")

                        if ann_id:
                            created_ids.append(str(ann_id))
                            print(f"[post_annotations_to_perusall] Successfully posted annotation {idx + 1}, got ID: {ann_id}")
                        else:
                            errors.append({
                                "index": idx,
                                "error": f"Unexpected response format: {data}. Expected dict with '_id' or 'id', or list of dicts.",
                                "payload": payload
                            })
                            print(f"[post_annotations_to_perusall] Unexpected response format for annotation {idx + 1}: {data}")

                except requests.exceptions.RequestException as e:
                    error_msg = str(e)
                    response_text = None
                    response_status = None
                    if hasattr(e, "response") and e.response is not None:
                        try:
                            response_status = e.response.status_code
                            response_text = e.response.text
                            print(f"[post_annotations_to_perusall] Error response status: {response_status}")
                            print(f"[post_annotations_to_perusall] Error response text: {response_text}")
                            print(f"[post_annotations_to_perusall] Error response headers: {dict(e.response.headers)}")
                        except Exception as parse_error:
                            print(f"[post_annotations_to_perusall] Failed to parse error response: {parse_error}")
                        if response_status:
                            error_msg = f"HTTP {response_status}: {error_msg}"
                    
                    errors.append({
                        "index": idx,
                        "error": error_msg,
                        "response": response_text,
                        "status_code": response_status,
                        "payload": payload
                    })
                    print(f"[post_annotations_to_perusall] Error posting annotation {idx + 1}: {error_msg}")
                    if response_text:
                        print(f"[post_annotations_to_perusall] Full error response: {response_text}")
                except Exception as e:
                    import traceback
                    error_trace = traceback.format_exc()
                    print(f"[post_annotations_to_perusall] Unexpected error for annotation {idx}: {e}")
                    print(f"[post_annotations_to_perusall] Traceback: {error_trace}")
                    errors.append({
                        "index": idx,
                        "error": str(e),
                        "payload": payload
                    })

        response_payload = {
            "success": len(errors) == 0,
            "created_ids": created_ids,
            "errors": errors,
        }
        try:
            post_record.status = "succeeded" if len(errors) == 0 else "failed"
            post_record.response_payload = response_payload
            post_record.created_ids = created_ids
            post_record.errors = errors
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[post_annotations_to_perusall] Failed to update post record: {e}")

        return PerusallAnnotationResponse(
            success=len(errors) == 0,
            created_ids=created_ids,
            errors=errors,
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[post_annotations_to_perusall] Fatal error: {e}")
        print(f"[post_annotations_to_perusall] Traceback: {error_trace}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to post annotations to Perusall: {str(e)}"
        )


@router.post("/courses/{course_id}/perusall/users/sync", response_model=PerusallUsersResponse)
def sync_perusall_users_for_course(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch Perusall users and cache them in the database for a course.
    """
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course_id format")

    course = get_course_by_id(db, course_uuid)
    if not course:
        raise HTTPException(status_code=404, detail=f"Course {course_id} not found")
    if not course.perusall_course_id:
        raise HTTPException(status_code=400, detail=f"Course {course_id} does not have perusall_course_id")

    headers = _get_perusall_headers(course, current_user, db)
    response = _fetch_perusall_users_for_course(course, headers)

    try:
        db.query(PerusallCourseUser).filter(
            PerusallCourseUser.course_id == course_uuid
        ).delete(synchronize_session=False)

        records = [
            PerusallCourseUser(
                course_id=course_uuid,
                perusall_user_id=user.id,
                role=user.role,
                first_name=user.first_name,
                last_name=user.last_name,
                display=user.display,
            )
            for user in response.users
        ]
        if records:
            db.add_all(records)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to cache Perusall users: {str(e)}")

    return response


@router.get("/courses/{course_id}/perusall/users", response_model=PerusallUsersResponse)
def get_perusall_users_for_course(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch cached Perusall users for a course.
    """
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid course_id format")

    course = get_course_by_id(db, course_uuid)
    if not course:
        raise HTTPException(status_code=404, detail=f"Course {course_id} not found")
    if not course.perusall_course_id:
        raise HTTPException(status_code=400, detail=f"Course {course_id} does not have perusall_course_id")

    rows = db.query(PerusallCourseUser).filter(
        PerusallCourseUser.course_id == course_uuid
    ).all()

    users = [
        PerusallUserItem(
            id=row.perusall_user_id,
            role=row.role,
            first_name=row.first_name,
            last_name=row.last_name,
            display=row.display,
        )
        for row in rows
    ]

    default_user_id = None
    if PERUSALL_POST_USER_ID and any(u.id == PERUSALL_POST_USER_ID for u in users):
        default_user_id = PERUSALL_POST_USER_ID

    return PerusallUsersResponse(users=users, default_user_id=default_user_id)


# ======================================================
# Perusall Mapping Management Endpoints
# ======================================================


@router.post("/courses/{course_id}/readings/{reading_id}/perusall/mapping", response_model=PerusallMappingResponse)
def create_or_update_perusall_mapping(
    course_id: str,
    reading_id: str,
    req: PerusallMappingRequest,
    db: Session = Depends(get_db)
):
    """
    Create or update Perusall mapping for a course-reading pair.
    Maps course_id and reading_id to Perusall course_id, assignment_id, and document_id.
    """
    # Validate course_id and reading_id from request
    try:
        course_uuid = uuid.UUID(req.course_id)
        reading_uuid = uuid.UUID(req.reading_id)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid UUID format: {str(e)}"
        )
    
    # Verify course and reading exist
    course = get_course_by_id(db, course_uuid)
    if not course:
        raise HTTPException(
            status_code=404,
            detail=f"Course {req.course_id} not found"
        )
    
    reading = get_reading_by_id(db, reading_uuid)
    if not reading:
        raise HTTPException(
            status_code=404,
            detail=f"Reading {req.reading_id} not found"
        )
    
    # Verify reading belongs to course
    if reading.course_id != course_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Reading {req.reading_id} does not belong to course {req.course_id}"
        )
    
    # Check if mapping already exists
    existing_mapping = db.query(PerusallMapping).filter(
        PerusallMapping.course_id == course_uuid,
        PerusallMapping.reading_id == reading_uuid
    ).first()
    
    if existing_mapping:
        # Update existing mapping
        existing_mapping.perusall_course_id = req.perusall_course_id
        existing_mapping.perusall_assignment_id = req.perusall_assignment_id
        existing_mapping.perusall_document_id = req.perusall_document_id
        db.commit()
        db.refresh(existing_mapping)
        print(f"[create_or_update_perusall_mapping] Updated mapping for course '{course.title}' and reading '{reading.title}'")
        return PerusallMappingResponse(
            success=True,
            mapping_id=str(existing_mapping.id),
            course_title=course.title,
            reading_title=reading.title,
            perusall_course_id=existing_mapping.perusall_course_id,
            perusall_assignment_id=existing_mapping.perusall_assignment_id,
            perusall_document_id=existing_mapping.perusall_document_id,
        )
    else:
        # Create new mapping
        new_mapping = PerusallMapping(
            course_id=course_uuid,
            reading_id=reading_uuid,
            perusall_course_id=req.perusall_course_id,
            perusall_assignment_id=req.perusall_assignment_id,
            perusall_document_id=req.perusall_document_id,
        )
        db.add(new_mapping)
        db.commit()
        db.refresh(new_mapping)
        print(f"[create_or_update_perusall_mapping] Created mapping for course '{course.title}' and reading '{reading.title}'")
        return PerusallMappingResponse(
            success=True,
            mapping_id=str(new_mapping.id),
            course_title=course.title,
            reading_title=reading.title,
            perusall_course_id=new_mapping.perusall_course_id,
            perusall_assignment_id=new_mapping.perusall_assignment_id,
            perusall_document_id=new_mapping.perusall_document_id,
        )


@router.get("/perusall/mapping/{course_id}/{reading_id}", response_model=PerusallMappingResponse)
def get_perusall_mapping(
    course_id: str,
    reading_id: str,
    db: Session = Depends(get_db)
):
    """
    Get Perusall mapping for a course-reading pair.
    """
    try:
        course_uuid = uuid.UUID(course_id)
        reading_uuid = uuid.UUID(reading_id)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid UUID format: {str(e)}"
        )
    
    mapping = db.query(PerusallMapping).filter(
        PerusallMapping.course_id == course_uuid,
        PerusallMapping.reading_id == reading_uuid
    ).first()
    
    if not mapping:
        raise HTTPException(
            status_code=404,
            detail=f"Perusall mapping not found for course_id={course_id} and reading_id={reading_id}"
        )
    
    course = get_course_by_id(db, course_uuid)
    reading = get_reading_by_id(db, reading_uuid)
    
    return PerusallMappingResponse(
        success=True,
        mapping_id=str(mapping.id),
        course_title=course.title if course else "Unknown",
        reading_title=reading.title if reading else "Unknown",
        perusall_course_id=mapping.perusall_course_id,
        perusall_assignment_id=mapping.perusall_assignment_id,
        perusall_document_id=mapping.perusall_document_id,
    )


# ======================================================
# Perusall User Credentials & Course Import Endpoints
# ======================================================


@router.post("/perusall/authenticate", response_model=PerusallAuthResponse)
def authenticate_perusall(
    req: PerusallAuthRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Validate and save user Perusall credentials
    Tests credentials against Perusall API before saving
    """
    try:
        # Validate credentials by testing API access
        is_valid = validate_perusall_credentials(req.institution_id, req.api_token)

        if not is_valid:
            return PerusallAuthResponse(
                success=False,
                message="Invalid Perusall credentials. Please check your institution ID and API token.",
                user_id=None,
            )

        # Save validated credentials
        save_user_perusall_credentials(
            db=db,
            user_id=current_user.id,
            institution_id=req.institution_id,
            api_token=req.api_token,
            is_validated=True,
        )

        return PerusallAuthResponse(
            success=True,
            message="Perusall credentials validated and saved successfully",
            user_id=str(current_user.id),
        )

    except Exception as e:
        print(f"[authenticate_perusall] Error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to validate Perusall credentials: {str(e)}"
        )


@router.get("/perusall/courses", response_model=PerusallCoursesResponse)
def get_perusall_courses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetch list of courses from Perusall for the authenticated user
    Requires user to have validated Perusall credentials
    """
    try:
        # Get user credentials
        credentials = get_user_perusall_credentials(db, current_user.id)

        if not credentials:
            raise HTTPException(
                status_code=404,
                detail="Perusall credentials not found. Please authenticate first at /api/perusall/authenticate"
            )

        if not credentials.is_validated:
            raise HTTPException(
                status_code=400,
                detail="Perusall credentials have not been validated. Please authenticate first at /api/perusall/authenticate"
            )

        # Fetch courses from Perusall API
        courses = fetch_perusall_courses(
            institution_id=credentials.institution_id,
            api_token=credentials.api_token,
        )

        # Convert to Pydantic models
        course_items = [
            PerusallCourseItem(id=course["_id"], name=course["name"])
            for course in courses
        ]

        return PerusallCoursesResponse(
            success=True,
            courses=course_items,
        )

    except HTTPException:
        raise
    except Exception as e:
        error_message = str(e)
        print(f"[get_perusall_courses] Error: {error_message}")

        # Determine appropriate status code based on error type
        if "Invalid Perusall credentials" in error_message or "access forbidden" in error_message:
            status_code = 401
        elif "Invalid credential format" in error_message:
            status_code = 400
        else:
            status_code = 500

        raise HTTPException(
            status_code=status_code,
            detail=error_message  # Pass through the detailed error from service layer
        )


@router.post("/perusall/import-courses", response_model=PerusallImportResponse)
def import_courses_from_perusall(
    req: PerusallImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Import selected Perusall courses as Inkspire Course records
    Fetches full course data from Perusall API and creates Inkspire courses
    """
    try:
        # Validate request
        if not req.course_ids:
            raise HTTPException(
                status_code=400,
                detail="No course IDs provided for import"
            )

        # Get user credentials to fetch course details
        credentials = get_user_perusall_credentials(db, current_user.id)

        if not credentials:
            raise HTTPException(
                status_code=404,
                detail="Perusall credentials not found. Please authenticate first"
            )

        # Fetch all courses from Perusall to get course names
        all_courses = fetch_perusall_courses(
            institution_id=credentials.institution_id,
            api_token=credentials.api_token,
        )

        # Filter to only selected courses
        selected_courses = [
            course for course in all_courses
            if course["_id"] in req.course_ids
        ]

        if not selected_courses:
            raise HTTPException(
                status_code=404,
                detail="None of the provided course IDs were found in your Perusall account"
            )

        # Import courses
        imported_courses = import_perusall_courses(
            db=db,
            user_id=current_user.id,
            perusall_courses=selected_courses,
        )

        return PerusallImportResponse(
            success=True,
            imported_courses=imported_courses,
            message=f"Successfully imported {len(imported_courses)} course(s)",
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[import_courses_from_perusall] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to import courses: {str(e)}"
        )


# ======================================================
# Perusall Readings Integration Endpoints
# ======================================================


@router.get("/courses/{course_id}/perusall/library", response_model=PerusallLibraryResponse)
def get_perusall_course_library(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get Perusall course library (readings) for a course and check upload status.
    Fetches readings from Perusall API and matches them with local database.
    """
    try:
        # Validate course_id
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid course_id format: {course_id}"
            )
        
        # Get course from database
        course = get_course_by_id(db, course_uuid)
        if not course:
            raise HTTPException(
                status_code=404,
                detail=f"Course {course_id} not found"
            )
        
        # Check if course has perusall_course_id
        if not course.perusall_course_id:
            raise HTTPException(
                status_code=400,
                detail=f"Course {course_id} does not have a Perusall course ID configured. Please set perusall_course_id for this course."
            )
        
        perusall_course_id = course.perusall_course_id

        # Resolve Perusall credentials
        env_institution = os.getenv("PERUSALL_INSTITUTION")
        env_api_token = os.getenv("PERUSALL_API_TOKEN")

        institution_id = None
        api_token = None

        if env_institution and env_api_token:
            institution_id = env_institution
            api_token = env_api_token
        else:
            credentials = get_user_perusall_credentials(db, current_user.id)
            if not credentials or not credentials.is_validated:
                raise HTTPException(
                    status_code=401,
                    detail=(
                        "Perusall credentials not found or not validated. "
                        "Please authenticate first at /api/perusall/authenticate, "
                        "or set PERUSALL_INSTITUTION and PERUSALL_API_TOKEN in environment variables."
                    )
                )
            institution_id = credentials.institution_id
            api_token = credentials.api_token
        
        # Check for mock mode
        mock_mode = os.getenv("PERUSALL_MOCK_MODE", "false").lower() == "true"
        
        # Fetch library from Perusall API
        if mock_mode:
            from app.mocks.perusall_mock_data import get_mock_library_for_course
            perusall_readings = get_mock_library_for_course(perusall_course_id)
        else:
            library_url = f"{PERUSALL_BASE_URL}/courses/{perusall_course_id}/library"
            headers = {
                "X-Institution": institution_id,
                "X-API-Token": api_token,
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
            
            library_response = requests.get(library_url, headers=headers, timeout=30)
            try:
                library_response.raise_for_status()
            except requests.exceptions.HTTPError:
                status_code = library_response.status_code
                response_text = (library_response.text or "")[:500]

                if status_code in (401, 403):
                    raise HTTPException(
                        status_code=401,
                        detail=(
                            "Perusall API authentication failed (unauthorized/forbidden). "
                            "Please re-authenticate with a valid Institution ID and API Token via /api/perusall/authenticate, "
                            "and confirm the Perusall course ID belongs to that institution. "
                            f"Perusall response: {response_text}"
                        ),
                    )

                if status_code == 404:
                    raise HTTPException(
                        status_code=404,
                        detail=(
                            "Perusall course library not found. Verify the course's perusall_course_id is correct and accessible. "
                            f"Perusall response: {response_text}"
                        ),
                    )

                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"Perusall library API request failed. Status: {status_code}. "
                        f"Response: {response_text}"
                    ),
                )
            
            try:
                perusall_readings = library_response.json()
            except ValueError:
                response_text = library_response.text[:500]
                raise HTTPException(
                    status_code=500,
                    detail=f"Perusall library API returned invalid JSON. Status: {library_response.status_code}. Response: {response_text}"
                )
            
            if not isinstance(perusall_readings, list):
                raise HTTPException(
                    status_code=500,
                    detail=f"Unexpected response format from Perusall library API: {type(perusall_readings)}. Expected list, got {type(perusall_readings)}"
                )
        
        # Get local readings for this course
        local_readings = get_readings_by_course(db, course_uuid)
        
        # Get Perusall mappings for this course
        perusall_mappings = db.query(PerusallMapping).filter(
            PerusallMapping.course_id == course_uuid
        ).all()
        
        # Create a mapping from perusall_document_id to local reading
        mapping_by_perusall_doc_id = {
            mapping.perusall_document_id: mapping.reading_id
            for mapping in perusall_mappings
        }
        
        # Create a mapping from reading title (normalized) to local reading
        # This helps match readings by name if no mapping exists
        local_readings_by_title = {}
        for reading in local_readings:
            normalized_title = normalize_name(reading.title)
            if normalized_title not in local_readings_by_title:
                local_readings_by_title[normalized_title] = reading
        
        # Build response with upload status
        reading_statuses = []
        for perusall_reading in perusall_readings:
            if not isinstance(perusall_reading, dict):
                continue
            
            perusall_reading_id = perusall_reading.get("_id") or perusall_reading.get("id")
            perusall_reading_name = perusall_reading.get("name") or perusall_reading.get("title") or "Untitled"
            
            if not perusall_reading_id:
                continue
            
            # Check if reading is uploaded via PerusallMapping
            local_reading_id = mapping_by_perusall_doc_id.get(perusall_reading_id)
            local_reading = None
            
            if local_reading_id:
                local_reading = get_reading_by_id(db, local_reading_id)
            
            # If no mapping found, try to match by name
            if not local_reading:
                normalized_perusall_name = normalize_name(perusall_reading_name)
                local_reading = local_readings_by_title.get(normalized_perusall_name)
            
            reading_statuses.append(PerusallLibraryReadingStatus(
                perusall_reading_id=str(perusall_reading_id),
                perusall_reading_name=perusall_reading_name,
                is_uploaded=local_reading is not None,
                local_reading_id=str(local_reading.id) if local_reading else None,
                local_reading_title=local_reading.title if local_reading else None,
            ))
        
        return PerusallLibraryResponse(
            success=True,
            perusall_course_id=perusall_course_id,
            readings=reading_statuses,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[get_perusall_course_library] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch Perusall course library: {str(e)}"
        )

# ======================================================
# Perusall Assignments Integration Endpoints
# ======================================================

@router.get("/courses/{course_id}/perusall/assignments", response_model=PerusallAssignmentsResponse)
def get_perusall_course_assignments(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get Perusall course assignments for a course.
    Fetches assignments from Perusall API.
    Upsert - return to frontend - return
    """
    try:
        # Validate course_id
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid course_id format: {course_id}"
            )
        
        # Get course from database
        course = get_course_by_id(db, course_uuid)
        if not course:
            raise HTTPException(
                status_code=404,
                detail=f"Course {course_id} not found"
            )
        
        # Check if course has perusall_course_id
        if not course.perusall_course_id:
            raise HTTPException(
                status_code=400,
                detail=f"Course {course_id} does not have a Perusall course ID configured. Please set perusall_course_id for this course."
            )
        
        perusall_course_id = course.perusall_course_id

        # Resolve Perusall credentials
        env_institution = os.getenv("PERUSALL_INSTITUTION")
        env_api_token = os.getenv("PERUSALL_API_TOKEN")

        institution_id = None
        api_token = None

        if env_institution and env_api_token:
            institution_id = env_institution
            api_token = env_api_token
        else:
            credentials = get_user_perusall_credentials(db, current_user.id)
            if not credentials or not credentials.is_validated:
                raise HTTPException(
                    status_code=401,
                    detail=(
                        "Perusall credentials not found or not validated. "
                        "Please authenticate first at /api/perusall/authenticate, "
                        "or set PERUSALL_INSTITUTION and PERUSALL_API_TOKEN in environment variables."
                    )
                )
            institution_id = credentials.institution_id
            api_token = credentials.api_token
        
        # Check for mock mode
        mock_mode = os.getenv("PERUSALL_MOCK_MODE", "false").lower() == "true"
        
        # Fetch assignments from Perusall API
        if mock_mode:
            from app.mocks.perusall_mock_data import get_mock_assignments_for_course
            perusall_assignments = get_mock_assignments_for_course(perusall_course_id)
        else:
            assignments_url = f"{PERUSALL_BASE_URL}/courses/{perusall_course_id}/assignments"
            headers = {
                "X-Institution": institution_id,
                "X-API-Token": api_token,
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
            
            assignments_response = requests.get(assignments_url, headers=headers, timeout=30)
            try:
                assignments_response.raise_for_status()
            except requests.exceptions.HTTPError:
                status_code = assignments_response.status_code
                response_text = (assignments_response.text or "")[:500]

                if status_code in (401, 403):
                    raise HTTPException(
                        status_code=401,
                        detail=(
                            "Perusall API authentication failed (unauthorized/forbidden). "
                            "Please re-authenticate with a valid Institution ID and API Token via /api/perusall/authenticate, "
                            "and confirm the Perusall course ID belongs to that institution. "
                            f"Perusall response: {response_text}"
                        ),
                    )

                if status_code == 404:
                    raise HTTPException(
                        status_code=404,
                        detail=(
                            "Perusall course assignments not found. Verify the course's perusall_course_id is correct and accessible. "
                            f"Perusall response: {response_text}"
                        ),
                    )

                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"Perusall assignments API request failed. Status: {status_code}. "
                        f"Response: {response_text}"
                    ),
                )
            
            try:
                perusall_assignments = assignments_response.json()
            except ValueError:
                response_text = assignments_response.text[:500]
                raise HTTPException(
                    status_code=500,
                    detail=f"Perusall assignments API returned invalid JSON. Status: {assignments_response.status_code}. Response: {response_text}"
                )
            
            if not isinstance(perusall_assignments, list):
                raise HTTPException(
                    status_code=500,
                    detail=f"Unexpected response format from Perusall assignments API: {type(perusall_assignments)}. Expected list, got {type(perusall_assignments)}"
                )
        
        # Upsert assignments to database and get which ones have sessions
        # Query sessions that are linked to assignments for this course
        # Use outerjoin to get all assignments and check which have sessions
        from app.models.models import PerusallAssignment
        assignments_with_sessions = set()
        
        # Get all assignments for this course that have sessions
        assignments_with_sessions_query = db.query(PerusallAssignment.id).join(
            Session, Session.perusall_assignment_id == PerusallAssignment.id
        ).filter(
            PerusallAssignment.perusall_course_id == perusall_course_id,
            Session.course_id == course_uuid
        ).all()
        
        for (assignment_id,) in assignments_with_sessions_query:
            assignments_with_sessions.add(assignment_id)
        
        # Convert to response format and upsert each assignment
        assignment_items = []
        for assignment in perusall_assignments:
            if not isinstance(assignment, dict):
                continue
            
            assignment_id = assignment.get("_id") or assignment.get("id")
            assignment_name = assignment.get("name") or assignment.get("title") or "Untitled"
            documents = assignment.get("documents") or []
            document_ids = assignment.get("documentIds") or []
            parts = assignment.get("parts") or []
            deadline = assignment.get("deadline")
            assign_to = assignment.get("assignTo")
            
            if not assignment_id:
                continue
            
            # Extract document_ids from parts if not in documentIds
            if not document_ids and parts:
                doc_ids_from_parts = []
                for part in parts:
                    if isinstance(part, dict):
                        doc_id = part.get("documentId")
                        if doc_id and doc_id not in doc_ids_from_parts:
                            doc_ids_from_parts.append(str(doc_id))
                if doc_ids_from_parts:
                    document_ids = doc_ids_from_parts
            
            # Convert parts to format for storage
            parts_list = []
            for part in parts:
                if isinstance(part, dict):
                    parts_list.append({
                        "documentId": part.get("documentId") or "",
                        "startPage": part.get("startPage"),
                        "endPage": part.get("endPage"),
                    })
            
            # Upsert assignment to database
            db_assignment = upsert_perusall_assignment(
                db=db,
                perusall_course_id=perusall_course_id,
                perusall_assignment_id=str(assignment_id),
                name=assignment_name,
                document_ids=[str(d) for d in document_ids] if document_ids else None,
                parts=parts_list if parts_list else None,
            )
            
            # Check if this assignment has a session
            has_session = db_assignment.id in assignments_with_sessions
            
            # Convert parts to PerusallAssignmentPart format for response
            response_parts = []
            for part in parts_list:
                response_parts.append({
                    "documentId": part.get("documentId") or "",
                    "startPage": part.get("startPage"),
                    "endPage": part.get("endPage"),
                })
            
            assignment_items.append(PerusallAssignmentItem(
                id=str(assignment_id),
                name=assignment_name,
                documentIds=[str(d) for d in document_ids] if document_ids else None,
                parts=response_parts if response_parts else None,
                deadline=deadline,
                assignTo=assign_to,
                documents=documents,  # Legacy field for backward compatibility
                has_session=has_session,
            ))
        
        return PerusallAssignmentsResponse(
            success=True,
            perusall_course_id=perusall_course_id,
            assignments=assignment_items,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[get_perusall_course_assignments] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch Perusall course assignments: {str(e)}"
        )


@router.get("/courses/{course_id}/perusall/assignments/{assignment_id}/readings", response_model=AssignmentReadingsResponse)
def get_assignment_readings_status(
    course_id: str,
    assignment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get readings status for a specific Perusall assignment.
    Fetches assignment details from Perusall API, extracts documentIds from parts,
    and checks upload status for each reading.
    TODO: can be updated; same as the reading upload page?
    """
    try:
        # Validate course_id
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid course_id format: {course_id}"
            )
        
        # Get course from database
        course = get_course_by_id(db, course_uuid)
        if not course:
            raise HTTPException(
                status_code=404,
                detail=f"Course {course_id} not found"
            )
        
        # Check if course has perusall_course_id
        if not course.perusall_course_id:
            raise HTTPException(
                status_code=400,
                detail=f"Course {course_id} does not have a Perusall course ID configured."
            )
        
        perusall_course_id = course.perusall_course_id

        # Resolve Perusall credentials
        env_institution = os.getenv("PERUSALL_INSTITUTION")
        env_api_token = os.getenv("PERUSALL_API_TOKEN")

        institution_id = None
        api_token = None

        if env_institution and env_api_token:
            institution_id = env_institution
            api_token = env_api_token
        else:
            credentials = get_user_perusall_credentials(db, current_user.id)
            if not credentials or not credentials.is_validated:
                raise HTTPException(
                    status_code=401,
                    detail=(
                        "Perusall credentials not found or not validated. "
                        "Please authenticate first at /api/perusall/authenticate, "
                        "or set PERUSALL_INSTITUTION and PERUSALL_API_TOKEN in environment variables."
                    )
                )
            institution_id = credentials.institution_id
            api_token = credentials.api_token
        
        # Check for mock mode
        mock_mode = os.getenv("PERUSALL_MOCK_MODE", "false").lower() == "true"
        
        # Fetch assignment details from Perusall API
        if mock_mode:
            from app.mocks.perusall_mock_data import get_mock_assignments_for_course
            all_assignments = get_mock_assignments_for_course(perusall_course_id)
            assignment_data = next((a for a in all_assignments if (a.get("_id") or a.get("id")) == assignment_id), None)
            if not assignment_data:
                raise HTTPException(
                    status_code=404,
                    detail=f"Assignment {assignment_id} not found in Perusall"
                )
        else:
            assignments_url = f"{PERUSALL_BASE_URL}/courses/{perusall_course_id}/assignments"
            headers = {
                "X-Institution": institution_id,
                "X-API-Token": api_token,
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
            
            assignments_response = requests.get(assignments_url, headers=headers, timeout=30)
            try:
                assignments_response.raise_for_status()
            except requests.exceptions.HTTPError:
                status_code = assignments_response.status_code
                response_text = (assignments_response.text or "")[:500]
                raise HTTPException(
                    status_code=status_code,
                    detail=f"Perusall assignments API request failed. Status: {status_code}. Response: {response_text}"
                )
            
            all_assignments = assignments_response.json()
            if not isinstance(all_assignments, list):
                raise HTTPException(
                    status_code=500,
                    detail=f"Unexpected response format from Perusall assignments API"
                )
            
            assignment_data = next((a for a in all_assignments if (a.get("_id") or a.get("id")) == assignment_id), None)
            if not assignment_data:
                raise HTTPException(
                    status_code=404,
                    detail=f"Assignment {assignment_id} not found in Perusall"
                )
        
        assignment_name = assignment_data.get("name") or assignment_data.get("title") or "Untitled"
        parts = assignment_data.get("parts") or []
        
        # Extract unique documentIds from parts
        document_ids = []
        document_pages = {}  # Map documentId to (startPage, endPage)
        for part in parts:
            if isinstance(part, dict):
                doc_id = part.get("documentId")
                if doc_id and doc_id not in document_ids:
                    document_ids.append(doc_id)
                    document_pages[doc_id] = {
                        "startPage": part.get("startPage"),
                        "endPage": part.get("endPage"),
                    }
        
        # If no parts, try documentIds field
        if not document_ids:
            document_ids = assignment_data.get("documentIds") or []
        
        # Fetch library to get document names
        if mock_mode:
            from app.mocks.perusall_mock_data import get_mock_library_for_course
            library_readings = get_mock_library_for_course(perusall_course_id)
        else:
            library_url = f"{PERUSALL_BASE_URL}/courses/{perusall_course_id}/library"
            headers = {
                "X-Institution": institution_id,
                "X-API-Token": api_token,
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
            library_response = requests.get(library_url, headers=headers, timeout=30)
            library_response.raise_for_status()
            library_readings = library_response.json()
            if not isinstance(library_readings, list):
                library_readings = []
        
        # Create a map of document_id to document name
        document_names = {}
        for reading in library_readings:
            if isinstance(reading, dict):
                doc_id = reading.get("_id") or reading.get("id")
                doc_name = reading.get("name") or reading.get("title")
                if doc_id:
                    document_names[doc_id] = doc_name
        
        # Determine upload status.
        # Prefer the canonical field persisted during PDF upload: readings.perusall_reading_id == Perusall documentId.
        try:
            local_readings = db.query(Reading).filter(
                Reading.course_id == course_uuid,
                Reading.perusall_reading_id.in_(document_ids),
                Reading.deleted_at.is_(None),
            ).all()
        except ProgrammingError as e:
            if "deleted_at" in str(e):
                local_readings = db.query(Reading).filter(
                    Reading.course_id == course_uuid,
                    Reading.perusall_reading_id.in_(document_ids)
                ).all()
            else:
                raise

        local_reading_by_doc_id = {
            (r.perusall_reading_id or ""): r for r in local_readings if r.perusall_reading_id
        }

        # Fallback (legacy): some older flows may have stored only PerusallMapping without setting perusall_reading_id.
        perusall_mappings = db.query(PerusallMapping).filter(
            PerusallMapping.course_id == course_uuid,
            PerusallMapping.perusall_document_id.in_(document_ids)
        ).all()

        mapping_by_doc_id = {
            mapping.perusall_document_id: mapping.reading_id
            for mapping in perusall_mappings
        }
        
        # Build reading status list
        reading_statuses = []
        for doc_id in document_ids:
            local_reading = local_reading_by_doc_id.get(doc_id)

            # Fallback via mapping if needed
            if not local_reading:
                local_reading_id = mapping_by_doc_id.get(doc_id)
                if local_reading_id:
                    local_reading = get_reading_by_id(db, local_reading_id)
            
            pages = document_pages.get(doc_id, {})
            reading_statuses.append(AssignmentReadingStatus(
                perusall_document_id=str(doc_id),
                perusall_document_name=document_names.get(doc_id),
                is_uploaded=local_reading is not None,
                local_reading_id=str(local_reading.id) if local_reading else None,
                local_reading_title=local_reading.title if local_reading else None,
                start_page=pages.get("startPage"),
                end_page=pages.get("endPage"),
            ))
        
        return AssignmentReadingsResponse(
            success=True,
            assignment_id=assignment_id,
            assignment_name=assignment_name,
            readings=reading_statuses,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[get_assignment_readings_status] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch assignment readings status: {str(e)}"
        )
