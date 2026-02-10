"""
Perusall integration endpoints
"""
import os
import uuid
import requests
from typing import List, Dict, Any, Optional, Tuple
from fastapi import APIRouter, HTTPException, Depends
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
    PerusallAssignment,
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
from app.services.reading_chunk_service import get_reading_chunks_by_reading_id
from app.models.models import Session
from auth.dependencies import get_current_user
from app.api.models import (
    PerusallAnnotationRequest,
    PerusallAnnotationResponse,
    PerusallAnnotationStatusRequest,
    PerusallAnnotationStatusResponse,
    PerusallAnnotationStatusItem,
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
    PerusallSessionUpdateRequest,
    PerusallSessionUpdateResponse,
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


def _build_norm_index(text: str) -> Tuple[str, List[int]]:
    """
    Normalize text and return (normalized_text, norm_to_orig_index).
    This is a lightweight version tuned to PDF extraction quirks.
    """
    if not text:
        return "", []
    norm_chars: List[str] = []
    norm_to_orig: List[int] = []
    prev_space = False
    for i, ch in enumerate(text):
        if ch.isspace():
            if not prev_space:
                norm_chars.append(" ")
                norm_to_orig.append(i)
            prev_space = True
            continue
        prev_space = False
        if ch == "\u00ad":
            continue
        if ch == "-" and i > 0 and i + 1 < len(text):
            if text[i - 1].isalpha() and text[i + 1].isalpha():
                # skip hyphenation between letters
                continue
        if ch in "“”«»„":
            ch = '"'
        elif ch in "‘’‚":
            ch = "'"
        elif ch in "–—":
            ch = "-"
        # keep alnum, turn other punctuation into space
        if ch.isalnum() or ch in "-'":
            norm_chars.append(ch.lower())
            norm_to_orig.append(i)
        else:
            if norm_chars and norm_chars[-1] != " ":
                norm_chars.append(" ")
                norm_to_orig.append(i)
    # trim trailing space
    if norm_chars and norm_chars[-1] == " ":
        norm_chars.pop()
        norm_to_orig.pop()
    return "".join(norm_chars), norm_to_orig


def _find_fragment_range(
    page_text: str,
    fragment: str,
    hint_start: Optional[int] = None,
    hint_end: Optional[int] = None,
    hint_pos_ratio: Optional[float] = None,
) -> Optional[Tuple[int, int]]:
    if not page_text or not fragment:
        return None
    norm_page, map_page = _build_norm_index(page_text)
    norm_frag, _ = _build_norm_index(fragment)
    if not norm_frag:
        return None

    def _range_from_norm_idx(idx: int) -> Tuple[int, int]:
        start_orig = map_page[idx]
        end_norm = min(idx + len(norm_frag) - 1, len(map_page) - 1)
        end_orig = map_page[end_norm] + 1
        return start_orig, end_orig

    def _score_range(start_orig: int, end_orig: int) -> int:
        score = 0
        if hint_pos_ratio is not None:
            try:
                target_orig = int(max(0.0, min(0.999, hint_pos_ratio)) * max(1, len(page_text)))
                score += abs(start_orig - target_orig)
            except Exception:
                pass
        if hint_start is not None:
            score += abs(start_orig - hint_start)
        if hint_end is not None:
            score += abs(end_orig - hint_end)
        # If no hints, prefer shorter spans to avoid overly broad matches.
        if hint_start is None and hint_end is None and hint_pos_ratio is None:
            score += (end_orig - start_orig)
        return score

    # 1) Exact normalized match (may have multiple occurrences)
    matches: List[Tuple[int, int]] = []
    idx = norm_page.find(norm_frag)
    while idx >= 0:
        start_orig, end_orig = _range_from_norm_idx(idx)
        matches.append((start_orig, end_orig))
        idx = norm_page.find(norm_frag, idx + 1)
    if matches:
        best = min(matches, key=lambda r: _score_range(r[0], r[1]))
        return best

    # 2) Fallback: anchor by prefix/suffix to tolerate minor extraction drift
    if len(norm_frag) < 20:
        return None
    lens = [120, 80, 60, 40, 30, 20]
    anchor_matches: List[Tuple[int, int]] = []
    for L in lens:
        if len(norm_frag) < L * 2:
            continue
        prefix = norm_frag[:L]
        suffix = norm_frag[-L:]
        start_idx = 0
        while True:
            p_idx = norm_page.find(prefix, start_idx)
            if p_idx < 0:
                break
            s_idx = norm_page.find(suffix, p_idx + L)
            if s_idx >= 0:
                start_orig = map_page[p_idx]
                end_norm = min(s_idx + L - 1, len(map_page) - 1)
                end_orig = map_page[end_norm] + 1
                anchor_matches.append((start_orig, end_orig))
            start_idx = p_idx + 1
        if anchor_matches:
            break
    if anchor_matches:
        best = min(anchor_matches, key=lambda r: _score_range(r[0], r[1]))
        return best

    return None


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
    annotation_version_pairs: Optional[List[Dict[str, str]]] = None,
) -> str:
    payload: Dict[str, Any] = {
        "course_id": course_id,
        "reading_id": reading_id,
        "session_id": session_id,
        "perusall_user_id": perusall_user_id,
    }
    if req.annotation_ids:
        payload["annotation_ids"] = sorted(req.annotation_ids)
        if annotation_version_pairs:
            payload["annotation_version_pairs"] = sorted(
                annotation_version_pairs,
                key=lambda item: (item.get("annotation_id", ""), item.get("annotation_version_id", "")),
            )
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
            raise HTTPException(status_code=404, detail=f"Assignment {perusall_assignment_id_str} not found in Perusall")
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
    annotation_version_map: Dict[str, str] = {}
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

                # Deduplicate: PDF highlighting may save multiple coord rows over time (re-open PDF, re-highlight, code changes).
                # Perusall expects one range per annotation; pick the most reliable coord.
                def _coord_score(c: AnnotationHighlightCoords):
                    try:
                        span = int(getattr(c, "range_end", 0)) - int(getattr(c, "range_start", 0))
                    except Exception:
                        span = 0
                    frag_len = len(getattr(c, "fragment", "") or "")
                    created = getattr(c, "created_at", None)
                    return (span, frag_len, created)

                if len(coords_list) > 1:
                    coords_list_sorted = sorted(coords_list, key=_coord_score, reverse=True)
                    best = coords_list_sorted[0]
                    print(
                        f"[post_annotations_to_perusall] Dedup coords for annotation {annotation_id_str}: "
                        f"{len(coords_list)} -> 1 (picked page={best.range_page}, range=[{best.range_start},{best.range_end}], "
                        f"frag_len={len(best.fragment or '')})"
                    )
                    coords_list = [best]

                if coords_list and coords_list[0].annotation_version_id:
                    annotation_version_map[str(annotation_id_str)] = str(coords_list[0].annotation_version_id)
                elif annotation.current_version_id:
                    annotation_version_map[str(annotation_id_str)] = str(annotation.current_version_id)

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
                
                print(f"[post_annotations_to_perusall] Using {len(coords_list)} highlight_coords for annotation {annotation_id_str}")
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

    # Preload page text (PyPDF2 extraction) for better range alignment with Perusall.
    page_text_by_num: Dict[int, str] = {}
    try:
        chunks = get_reading_chunks_by_reading_id(db, reading_uuid)
        for chunk in chunks or []:
            page_text_by_num[int(chunk.chunk_index) + 1] = chunk.content or ""
    except Exception as e:
        print(f"[post_annotations_to_perusall] Warning: failed to load reading chunks for range match: {e}")

    created_ids = []
    errors = []
    try:
        with requests.Session() as session:
            headers = {
                "X-Institution": institution_id,
                "X-API-Token": api_token,
            }

            if not req.perusall_user_id:
                raise HTTPException(
                    status_code=400,
                    detail="perusall_user_id is required. Please select a Perusall user before publishing.",
                )
            post_user_id = req.perusall_user_id

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
                        annotation_version_pairs=[
                            {
                                "annotation_id": annotation_id,
                                "annotation_version_id": version_id,
                            }
                            for annotation_id, version_id in annotation_version_map.items()
                        ],
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
                    "annotation_version_map": annotation_version_map or None,
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
                page_num = int(item.rangePage or 1)
                frag = (item.fragment or "")
                # Prefer Perusall-like range from PyPDF2 page text when possible.
                hint_start = None
                hint_end = None
                hint_pos_ratio = None
                try:
                    hint_start = int(item.rangeStart)
                    hint_end = int(item.rangeEnd)
                except Exception:
                    hint_start = None
                    hint_end = None
                try:
                    if item.positionStartY is not None:
                        hint_pos_ratio = float(item.positionStartY) - float(page_num)
                except Exception:
                    hint_pos_ratio = None
                matched_range = _find_fragment_range(
                    page_text_by_num.get(page_num, ""),
                    frag,
                    hint_start=hint_start,
                    hint_end=hint_end,
                    hint_pos_ratio=hint_pos_ratio,
                )
                if matched_range:
                    range_start, range_end = matched_range
                    if hint_start is not None and hint_end is not None and hint_end > hint_start:
                        hint_len = hint_end - hint_start
                        # If matched start is close to hint, keep it; otherwise fall back to hint start.
                        if abs(range_start - hint_start) > 5:
                            range_start = hint_start
                        # Clamp end to hint length to avoid extra trailing words.
                        range_end = range_start + hint_len
                        # Ensure we don't exceed page text length when available.
                        page_text = page_text_by_num.get(page_num, "") or ""
                        if page_text:
                            range_end = min(range_end, len(page_text))
                    print(
                        f"[post_annotations_to_perusall] Matched fragment for page {page_num}: "
                        f"range=[{range_start},{range_end}] (hint=[{hint_start},{hint_end}], "
                        f"pos_ratio={hint_pos_ratio})"
                    )
                else:
                    range_start = int(item.rangeStart)
                    range_end = int(item.rangeEnd)
                    print(
                        f"[post_annotations_to_perusall] Using frontend range for page {page_num}: "
                        f"range=[{range_start},{range_end}]"
                    )

                # Micro-adjustments for Perusall indexing drift.
                try:
                    start_offset = int(os.getenv("PERUSALL_RANGE_START_OFFSET", "11"))
                    end_offset = int(os.getenv("PERUSALL_RANGE_END_OFFSET", "11"))
                except Exception:
                    start_offset = 11
                    end_offset = 11
                if start_offset or end_offset:
                    range_start = max(0, range_start + start_offset)
                    range_end = max(range_start, range_end + end_offset)

                payload = {
                    "documentId": perusall_document_id,
                    "userId": post_user_id,
                    "positionStartX": item.positionStartX,
                    "positionStartY": item.positionStartY,
                    "positionEndX": item.positionEndX,
                    "positionEndY": item.positionEndY,
                    "rangeType": item.rangeType,
                    "rangePage": page_num,
                    "rangeStart": range_start,
                    "rangeEnd": range_end,
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
                        print(f"[post_annotations_to_perusall] Payload (position Y converted): {payload}")

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


@router.post(
    "/courses/{course_id}/readings/{reading_id}/perusall/annotation-status",
    response_model=PerusallAnnotationStatusResponse,
)
def get_perusall_annotation_status(
    course_id: str,
    reading_id: str,
    req: PerusallAnnotationStatusRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return posting status for each annotation ID:
    - posted: already posted successfully with matching idempotent record
    - pending: no successful post record found yet
    """
    try:
        course_uuid = uuid.UUID(course_id)
        reading_uuid = uuid.UUID(reading_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid course_id or reading_id format: course_id={course_id}, reading_id={reading_id}",
        )

    course = get_course_by_id(db, course_uuid)
    if not course:
        raise HTTPException(status_code=404, detail=f"Course {course_id} not found")

    reading = get_reading_by_id(db, reading_uuid)
    if not reading:
        raise HTTPException(status_code=404, detail=f"Reading {reading_id} not found")
    if reading.course_id != course_uuid:
        raise HTTPException(status_code=400, detail=f"Reading {reading_id} does not belong to course {course_id}")

    if not req.perusall_user_id:
        raise HTTPException(
            status_code=400,
            detail="perusall_user_id is required to check annotation status.",
        )
    post_user_id = req.perusall_user_id

    records = db.query(PerusallAnnotationPost).filter(
        PerusallAnnotationPost.course_id == course_uuid,
        PerusallAnnotationPost.reading_id == reading_uuid,
        PerusallAnnotationPost.perusall_user_id == str(post_user_id),
    ).all()

    target_version_map: Dict[str, str] = {}
    for annotation_id in req.annotation_ids:
        annotation_id_str = str(annotation_id)
        try:
            annotation_uuid = uuid.UUID(annotation_id_str)
        except ValueError:
            continue
        annotation = db.query(ScaffoldAnnotation).filter(ScaffoldAnnotation.id == annotation_uuid).first()
        if not annotation or annotation.reading_id != reading_uuid or not annotation.current_version_id:
            continue
        target_version_map[annotation_id_str] = str(annotation.current_version_id)

    posted_ids = set()
    pending_ids = set()
    target_ids = {str(annotation_id) for annotation_id in req.annotation_ids}

    for record in records:
        payload = record.request_payload if isinstance(record.request_payload, dict) else {}
        payload_annotation_ids = payload.get("annotation_ids")
        if not isinstance(payload_annotation_ids, list):
            continue
        payload_version_map = payload.get("annotation_version_map")
        record_version_map = payload_version_map if isinstance(payload_version_map, dict) else {}

        matching_ids = set()
        for raw_id in payload_annotation_ids:
            annotation_id = str(raw_id)
            if annotation_id not in target_ids:
                continue
            target_version_id = target_version_map.get(annotation_id)
            record_version_id = (
                str(record_version_map.get(annotation_id))
                if annotation_id in record_version_map and record_version_map.get(annotation_id)
                else None
            )

            if target_version_id:
                # If target version is known, only treat as duplicate when versions match.
                if record_version_id and record_version_id == target_version_id:
                    matching_ids.add(annotation_id)
            else:
                # Fallback for annotations without version info.
                matching_ids.add(annotation_id)
        if not matching_ids:
            continue
        if record.status == "succeeded":
            posted_ids.update(matching_ids)
        elif record.status == "pending":
            pending_ids.update(matching_ids)

    items: List[PerusallAnnotationStatusItem] = []
    for annotation_id in req.annotation_ids:
        annotation_id_str = str(annotation_id)
        status = "posted" if annotation_id_str in posted_ids else "pending"
        # Explicitly keep pending if currently in a pending job and not posted.
        if status != "posted" and annotation_id_str in pending_ids:
            status = "pending"
        items.append(PerusallAnnotationStatusItem(annotation_id=annotation_id_str, status=status))

    return PerusallAnnotationStatusResponse(items=items)


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


@router.get("/courses/{course_id}/perusall/library/debug")
def get_perusall_course_library_debug(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Debug endpoint to inspect Perusall credential source and course configuration.
    """
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid course_id format: {course_id}"
        )

    course = get_course_by_id(db, course_uuid)
    if not course:
        raise HTTPException(
            status_code=404,
            detail=f"Course {course_id} not found"
        )

    perusall_course_id = course.perusall_course_id
    env_institution = os.getenv("PERUSALL_INSTITUTION")
    env_api_token = os.getenv("PERUSALL_API_TOKEN")
    mock_mode = os.getenv("PERUSALL_MOCK_MODE", "false").lower() == "true"

    credentials = get_user_perusall_credentials(db, current_user.id)

    if env_institution and env_api_token:
        credential_source = "env"
        institution_id = env_institution
        api_token = env_api_token
    elif credentials:
        credential_source = "user"
        institution_id = credentials.institution_id
        api_token = credentials.api_token
    else:
        credential_source = "none"
        institution_id = None
        api_token = None

    def mask_token(token: Optional[str]) -> Optional[str]:
        if not token:
            return None
        if len(token) <= 8:
            return f"{token[:2]}…{token[-2:]}"
        return f"{token[:4]}…{token[-4:]}"

    return {
        "course_id": course_id,
        "perusall_course_id": perusall_course_id,
        "credential_source": credential_source,
        "env_institution_present": bool(env_institution),
        "env_api_token_present": bool(env_api_token),
        "user_credentials_present": bool(credentials),
        "user_credentials_validated": bool(credentials.is_validated) if credentials else False,
        "institution_id": institution_id,
        "api_token_masked": mask_token(api_token),
        "api_token_sha256_prefix": hashlib.sha256(api_token.encode("utf-8")).hexdigest()[:12]
        if api_token else None,
        "mock_mode": mock_mode,
    }

# ======================================================
# Perusall Assignments Integration Endpoints
# ======================================================

def _get_perusall_course_assignments_impl(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    sync: bool = False,
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

        # Query assignments that are linked to sessions for this course
        assignments_with_sessions = set()
        cache_available = True
        try:
            assignments_with_sessions_query = db.query(PerusallAssignment.id).join(
                Session, Session.perusall_assignment_id == PerusallAssignment.id
            ).filter(
                PerusallAssignment.perusall_course_id == perusall_course_id,
                Session.course_id == course_uuid
            ).all()
            for (assignment_id,) in assignments_with_sessions_query:
                assignments_with_sessions.add(assignment_id)
        except ProgrammingError as e:
            if "perusall_assignments" in str(e) or "perusall_assignment_id" in str(e):
                cache_available = False
                db.rollback()
            else:
                raise

        # Fast path: read cached assignments from DB unless caller explicitly requests sync.
        if not sync and cache_available:
            cached_assignments = get_perusall_assignments_by_course(db, perusall_course_id)
            if cached_assignments:
                cached_items: List[PerusallAssignmentItem] = []
                for cached in cached_assignments:
                    cached_doc_ids = [str(d) for d in (cached.document_ids or []) if d is not None]
                    cached_parts = cached.parts if isinstance(cached.parts, list) else []
                    response_parts = [
                        {
                            "documentId": part.get("documentId") or "",
                            "startPage": part.get("startPage"),
                            "endPage": part.get("endPage"),
                        }
                        for part in cached_parts
                        if isinstance(part, dict)
                    ]
                    cached_items.append(
                        PerusallAssignmentItem(
                            id=str(cached.perusall_assignment_id),
                            name=cached.name or "Untitled",
                            documentIds=cached_doc_ids or None,
                            parts=response_parts or None,
                            deadline=None,
                            assignTo=None,
                            documents=None,
                            has_session=cached.id in assignments_with_sessions,
                        )
                    )
                return PerusallAssignmentsResponse(
                    success=True,
                    perusall_course_id=perusall_course_id,
                    assignments=cached_items,
                )

        # Resolve Perusall credentials only when syncing from external API.
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

        mock_mode = os.getenv("PERUSALL_MOCK_MODE", "false").lower() == "true"
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

        # Refresh assignment->reading cache together by also loading library names once.
        document_name_by_id: Dict[str, str] = {}
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

        for reading in library_readings:
            if not isinstance(reading, dict):
                continue
            doc_id = reading.get("_id") or reading.get("id")
            doc_name = reading.get("name") or reading.get("title")
            if doc_id and doc_name:
                document_name_by_id[str(doc_id)] = str(doc_name)

        assignment_items: List[PerusallAssignmentItem] = []
        for assignment_order_index, assignment in enumerate(perusall_assignments):
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

            if not document_ids and parts:
                doc_ids_from_parts = []
                for part in parts:
                    if isinstance(part, dict):
                        doc_id = part.get("documentId")
                        if doc_id and doc_id not in doc_ids_from_parts:
                            doc_ids_from_parts.append(str(doc_id))
                if doc_ids_from_parts:
                    document_ids = doc_ids_from_parts

            parts_list = []
            for part in parts:
                if isinstance(part, dict):
                    part_doc_id = str(part.get("documentId") or "")
                    parts_list.append({
                        "documentId": part_doc_id,
                        "startPage": part.get("startPage"),
                        "endPage": part.get("endPage"),
                        "documentName": document_name_by_id.get(part_doc_id),
                    })
            if not parts_list and document_ids:
                for doc_id in [str(d) for d in document_ids if d is not None]:
                    parts_list.append({
                        "documentId": doc_id,
                        "startPage": None,
                        "endPage": None,
                        "documentName": document_name_by_id.get(doc_id),
                    })

            db_assignment = None
            if cache_available:
                try:
                    db_assignment = upsert_perusall_assignment(
                        db=db,
                        perusall_course_id=perusall_course_id,
                        perusall_assignment_id=str(assignment_id),
                        name=assignment_name,
                        document_ids=[str(d) for d in document_ids] if document_ids else None,
                        parts=parts_list if parts_list else None,
                        order_index=assignment_order_index,
                    )
                except ProgrammingError as e:
                    if "perusall_assignments" in str(e):
                        cache_available = False
                        db.rollback()
                    else:
                        raise

            has_session = bool(db_assignment and db_assignment.id in assignments_with_sessions)
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
                documents=documents,
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


@router.get("/courses/{course_id}/perusall/assignments", response_model=PerusallAssignmentsResponse)
def get_perusall_course_assignments(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_perusall_course_assignments_impl(
        course_id=course_id,
        current_user=current_user,
        db=db,
        sync=False,
    )


def _get_assignment_readings_status_impl(
    course_id: str,
    assignment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    sync: bool = False,
):
    """
    Get readings status for a specific Perusall assignment.
    Fetches assignment details from Perusall API, extracts documentIds from parts,
    and checks upload status for each reading.
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

        cache_available = True
        try:
            cached_assignment = (
                db.query(PerusallAssignment)
                .filter(
                    PerusallAssignment.perusall_course_id == perusall_course_id,
                    PerusallAssignment.perusall_assignment_id == str(assignment_id),
                )
                .first()
            )
        except ProgrammingError as e:
            if "perusall_assignments" in str(e):
                cache_available = False
                cached_assignment = None
                db.rollback()
            else:
                raise

        assignment_name = cached_assignment.name if cached_assignment and cached_assignment.name else "Untitled"
        document_ids: List[str] = []
        document_pages: Dict[str, Dict[str, Any]] = {}
        document_names: Dict[str, str] = {}

        # Fast path from DB cache
        if cached_assignment and not sync:
            cached_parts = cached_assignment.parts if isinstance(cached_assignment.parts, list) else []
            for part in cached_parts:
                if not isinstance(part, dict):
                    continue
                doc_id = part.get("documentId")
                if doc_id and doc_id not in document_ids:
                    doc_id_str = str(doc_id)
                    document_ids.append(doc_id_str)
                    document_pages[doc_id_str] = {
                        "startPage": part.get("startPage"),
                        "endPage": part.get("endPage"),
                    }
                    doc_name = part.get("documentName") or part.get("name") or part.get("title")
                    if doc_name:
                        document_names[doc_id_str] = str(doc_name)
            if not document_ids:
                document_ids = [str(d) for d in (cached_assignment.document_ids or []) if d is not None]
        else:
            # Resolve Perusall credentials only when we need to sync from API.
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

            mock_mode = os.getenv("PERUSALL_MOCK_MODE", "false").lower() == "true"
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
                        detail="Unexpected response format from Perusall assignments API"
                    )

                assignment_data = next((a for a in all_assignments if (a.get("_id") or a.get("id")) == assignment_id), None)
                if not assignment_data:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Assignment {assignment_id} not found in Perusall"
                    )

            assignment_name = assignment_data.get("name") or assignment_data.get("title") or "Untitled"
            parts = assignment_data.get("parts") or []
            for part in parts:
                if isinstance(part, dict):
                    doc_id = part.get("documentId")
                    if doc_id and doc_id not in document_ids:
                        doc_id_str = str(doc_id)
                        document_ids.append(doc_id_str)
                        document_pages[doc_id_str] = {
                            "startPage": part.get("startPage"),
                            "endPage": part.get("endPage"),
                        }

            if not document_ids:
                document_ids = [str(d) for d in (assignment_data.get("documentIds") or []) if d is not None]

            # Persist/update assignment cache
            normalized_parts = []
            for part in parts:
                if isinstance(part, dict):
                    normalized_parts.append({
                        "documentId": part.get("documentId") or "",
                        "startPage": part.get("startPage"),
                        "endPage": part.get("endPage"),
                    })
            if cache_available:
                try:
                    upsert_perusall_assignment(
                        db=db,
                        perusall_course_id=perusall_course_id,
                        perusall_assignment_id=str(assignment_id),
                        name=assignment_name,
                        document_ids=document_ids if document_ids else None,
                        parts=normalized_parts if normalized_parts else None,
                    )
                except ProgrammingError as e:
                    if "perusall_assignments" in str(e):
                        cache_available = False
                        db.rollback()
                    else:
                        raise

            # On sync/no-cache path, fetch library once to enrich names.
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

            for reading in library_readings:
                if isinstance(reading, dict):
                    doc_id = reading.get("_id") or reading.get("id")
                    doc_name = reading.get("name") or reading.get("title")
                    if doc_id and doc_name:
                        document_names[str(doc_id)] = doc_name
        
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

        # If no cached Perusall library names are available, use local reading titles as fallback.
        if not document_names:
            for doc_id, local_reading in local_reading_by_doc_id.items():
                if doc_id and local_reading and local_reading.title:
                    document_names[str(doc_id)] = local_reading.title

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


@router.get("/courses/{course_id}/perusall/assignments/{assignment_id}/readings", response_model=AssignmentReadingsResponse)
def get_assignment_readings_status(
    course_id: str,
    assignment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_assignment_readings_status_impl(
        course_id=course_id,
        assignment_id=assignment_id,
        current_user=current_user,
        db=db,
        sync=False,
    )


@router.post("/courses/{course_id}/perusall/session-update", response_model=PerusallSessionUpdateResponse)
def refresh_session_selection_payload(
    course_id: str,
    req: PerusallSessionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Force-refresh assignment/readings metadata for Session Selection page and return
    the refreshed payload in one response so frontend can update from backend result directly.
    """
    assignments_resp = _get_perusall_course_assignments_impl(
        course_id=course_id,
        current_user=current_user,
        db=db,
        sync=True,
    )

    selected_assignment_id = req.assignment_id
    assignment_name: Optional[str] = None
    readings: Optional[List[AssignmentReadingStatus]] = None
    message: Optional[str] = None

    if selected_assignment_id:
        try:
            readings_resp = _get_assignment_readings_status_impl(
                course_id=course_id,
                assignment_id=selected_assignment_id,
                current_user=current_user,
                db=db,
                sync=False,
            )
            assignment_name = readings_resp.assignment_name
            readings = readings_resp.readings
        except HTTPException as exc:
            if exc.status_code == 404:
                selected_assignment_id = None
                readings = []
                message = "Selected assignment no longer exists in Perusall."
            else:
                raise

    return PerusallSessionUpdateResponse(
        success=True,
        perusall_course_id=assignments_resp.perusall_course_id,
        assignments=assignments_resp.assignments,
        assignment_id=selected_assignment_id,
        assignment_name=assignment_name,
        readings=readings,
        message=message,
    )
