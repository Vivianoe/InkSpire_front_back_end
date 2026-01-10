"""
Perusall integration endpoints
"""
import os
import uuid
import requests
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import AnnotationHighlightCoords, ScaffoldAnnotation, PerusallMapping, Course, Reading, User
from app.services.course_service import get_course_by_id
from app.services.reading_service import get_reading_by_id, get_readings_by_course
from app.services.perusall_service import (
    save_user_perusall_credentials,
    get_user_perusall_credentials,
    validate_perusall_credentials,
    fetch_perusall_courses,
    import_perusall_courses,
)
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
)

router = APIRouter()

# Perusall environment variables
PERUSALL_BASE_URL = "https://app.perusall.com/legacy-api"

X_INSTITUTION = os.getenv("PERUSALL_INSTITUTION")
X_API_TOKEN = os.getenv("PERUSALL_API_TOKEN")
COURSE_ID = os.getenv("PERUSALL_COURSE_ID")
ASSIGNMENT_ID = os.getenv("PERUSALL_ASSIGNMENT_ID")
DOCUMENT_ID = os.getenv("PERUSALL_DOCUMENT_ID")
USER_ID = os.getenv("PERUSALL_USER_ID")


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


@router.post("/courses/{course_id}/readings/{reading_id}/perusall/annotations", response_model=PerusallAnnotationResponse)
def post_annotations_to_perusall(
    course_id: str,
    reading_id: str,
    req: PerusallAnnotationRequest,
    db: Session = Depends(get_db)
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
    
    # Check for required environment variables (only API credentials, not IDs)
    missing_vars = []
    if not X_INSTITUTION:
        missing_vars.append("PERUSALL_INSTITUTION")
    if not X_API_TOKEN:
        missing_vars.append("PERUSALL_API_TOKEN")
    if not USER_ID:
        missing_vars.append("PERUSALL_USER_ID")
    
    if missing_vars:
        raise HTTPException(
            status_code=500,
            detail=f"Perusall API environment variables are missing: {', '.join(missing_vars)}. Please configure these in your .env file."
        )
    
    # Perusall IDs will be fetched from database based on course and reading
    perusall_course_id = None
    perusall_assignment_id = None
    perusall_document_id = None

    # Check for mock mode
    import os
    mock_mode = os.getenv("PERUSALL_MOCK_MODE", "false").lower() == "true"

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
                
                # Convert each coord to PerusallAnnotationItem
                for coord in coords_list:
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
    
    # Get Perusall mapping from database based on course_id and reading_id
    if first_annotation:
        # Get course_id from session, then get course and reading
        from app.services.session_service import get_session_by_id
        
        session = get_session_by_id(db, first_annotation.session_id)
        if not session:
            raise HTTPException(
                status_code=404,
                detail=f"Session {first_annotation.session_id} not found"
            )
        
        course = get_course_by_id(db, session.course_id)
        if not course:
            raise HTTPException(
                status_code=404,
                detail=f"Course {session.course_id} not found"
            )
        
        reading = get_reading_by_id(db, first_annotation.reading_id)
        if not reading:
            raise HTTPException(
                status_code=404,
                detail=f"Reading {first_annotation.reading_id} not found"
            )
        
        # First, try to get from database mapping
        perusall_mapping = db.query(PerusallMapping).filter(
            PerusallMapping.course_id == course_uuid,
            PerusallMapping.reading_id == reading_uuid
        ).first()
        
        if perusall_mapping:
            # Use stored mapping
            perusall_course_id = perusall_mapping.perusall_course_id
            perusall_assignment_id = perusall_mapping.perusall_assignment_id
            perusall_document_id = perusall_mapping.perusall_document_id
            print(f"[post_annotations_to_perusall] Using stored mapping: course_id={perusall_course_id}, assignment_id={perusall_assignment_id}, document_id={perusall_document_id}")
        else:
            # Auto-fetch from Perusall API based on course name and reading name
            print(f"[post_annotations_to_perusall] No stored mapping found, fetching from Perusall API for course '{course.title}' and reading '{reading.title}'")
            
            try:
                # Step 1: Get Perusall courses list
                headers = {
                    "X-Institution": X_INSTITUTION,
                    "X-API-Token": X_API_TOKEN,
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                }
                
                if mock_mode:
                    from app.mocks.perusall_mock_data import MOCK_COURSES
                    perusall_courses = MOCK_COURSES.copy()
                    print(f"[post_annotations_to_perusall] MOCK MODE: Using {len(perusall_courses)} mock courses")
                else:
                    courses_url = f"{PERUSALL_BASE_URL}/courses"
                    print(f"[post_annotations_to_perusall] Fetching courses from: {courses_url}")
                    courses_response = requests.get(courses_url, headers=headers, timeout=30)

                    print(f"[post_annotations_to_perusall] Courses API response status: {courses_response.status_code}")
                    print(f"[post_annotations_to_perusall] Courses API response headers: {dict(courses_response.headers)}")

                    courses_response.raise_for_status()

                    # Check if response is valid JSON
                    try:
                        perusall_courses = courses_response.json()
                    except ValueError as json_error:
                        response_text = courses_response.text[:500]  # First 500 chars
                        print(f"[post_annotations_to_perusall] Failed to parse JSON response. Response text (first 500 chars): {response_text}")
                        raise HTTPException(
                            status_code=500,
                            detail=f"Perusall courses API returned invalid JSON. Status: {courses_response.status_code}. Response: {response_text}"
                        )

                    if not isinstance(perusall_courses, list):
                        raise HTTPException(
                            status_code=500,
                            detail=f"Unexpected response format from Perusall courses API: {type(perusall_courses)}. Expected list, got {type(perusall_courses)}"
                        )
                
                # Step 2: Match course by name
                matched_course = None
                course_title_lower = course.title.lower().strip()
                course_title_normalized = normalize_name(course.title)
                
                print(f"[post_annotations_to_perusall] Looking for course: '{course.title}' (normalized: '{course_title_normalized}')")
                
                # First try exact match (case-insensitive, trimmed)
                for pc in perusall_courses:
                    if isinstance(pc, dict):
                        perusall_course_name = pc.get("name") or pc.get("title") or ""
                        if perusall_course_name.lower().strip() == course_title_lower:
                            matched_course = pc
                            print(f"[post_annotations_to_perusall] Exact course match found: '{perusall_course_name}'")
                            break
                
                # If no exact match, try normalized match (ignoring spaces)
                if not matched_course:
                    for pc in perusall_courses:
                        if isinstance(pc, dict):
                            perusall_course_name = pc.get("name") or pc.get("title") or ""
                            perusall_normalized = normalize_name(perusall_course_name)
                            if perusall_normalized == course_title_normalized:
                                matched_course = pc
                                print(f"[post_annotations_to_perusall] Normalized course match found: '{perusall_course_name}' (normalized: '{perusall_normalized}')")
                                break
                
                if not matched_course:
                    available_courses = [c.get("name", c.get("title", "Unknown")) for c in perusall_courses[:5]]
                    raise HTTPException(
                        status_code=404,
                        detail=f"Perusall course not found matching '{course.title}' (normalized: '{course_title_normalized}'). Available courses: {', '.join(available_courses) or 'None'}"
                    )
                
                # get perusall course id from matched course
                perusall_course_id = matched_course.get("_id") or matched_course.get("id")
                if not perusall_course_id:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Perusall course matched but no _id or id field found: {matched_course}"
                    )
                
                print(f"[post_annotations_to_perusall] Matched Perusall course: {matched_course.get('name')} -> {perusall_course_id}")
                
                # Step 3: Get course library (readings) for this course
                if mock_mode:
                    from app.mocks.perusall_mock_data import get_mock_library_for_course
                    perusall_readings = get_mock_library_for_course(perusall_course_id)
                    print(f"[post_annotations_to_perusall] MOCK MODE: Using {len(perusall_readings)} mock readings for course {perusall_course_id}")
                else:
                    library_url = f"{PERUSALL_BASE_URL}/courses/{perusall_course_id}/library"
                    print(f"[post_annotations_to_perusall] Fetching library from: {library_url}")
                    library_response = requests.get(library_url, headers=headers, timeout=30)

                    print(f"[post_annotations_to_perusall] Library API response status: {library_response.status_code}")
                    library_response.raise_for_status()

                    # Check if response is valid JSON
                    try:
                        perusall_readings = library_response.json()
                    except ValueError as json_error:
                        response_text = library_response.text[:500]  # First 500 chars
                        print(f"[post_annotations_to_perusall] Failed to parse JSON response. Response text (first 500 chars): {response_text}")
                        raise HTTPException(
                            status_code=500,
                            detail=f"Perusall library API returned invalid JSON. Status: {library_response.status_code}. Response: {response_text}"
                        )

                    if not isinstance(perusall_readings, list):
                        raise HTTPException(
                            status_code=500,
                            detail=f"Unexpected response format from Perusall library API: {type(perusall_readings)}. Expected list, got {type(perusall_readings)}"
                        )
                
                # Step 4: Match reading by name to get perusall reading_id
                matched_reading = None
                reading_title_normalized = normalize_name(reading.title)
                
                print(f"[post_annotations_to_perusall] Looking for reading: '{reading.title}' (normalized: '{reading_title_normalized}')")
                
                # First try exact match (case-insensitive, trimmed)
                reading_title_lower = reading.title.lower().strip()
                for pr in perusall_readings:
                    if isinstance(pr, dict):
                        perusall_reading_name = pr.get("name") or pr.get("title") or ""
                        if perusall_reading_name.lower().strip() == reading_title_lower:
                            matched_reading = pr
                            print(f"[post_annotations_to_perusall] Exact match found: '{perusall_reading_name}'")
                            break
                
                # If no exact match, try normalized match (ignoring spaces)
                if not matched_reading:
                    for pr in perusall_readings:
                        if isinstance(pr, dict):
                            perusall_reading_name = pr.get("name") or pr.get("title") or ""
                            perusall_normalized = normalize_name(perusall_reading_name)
                            if perusall_normalized == reading_title_normalized:
                                matched_reading = pr
                                print(f"[post_annotations_to_perusall] Normalized match found: '{perusall_reading_name}' (normalized: '{perusall_normalized}')")
                                break
                
                if not matched_reading:
                    available_readings = [r.get("name", r.get("title", "Unknown")) for r in perusall_readings[:10]]
                    available_normalized = [normalize_name(r.get("name", r.get("title", ""))) for r in perusall_readings[:10]]
                    raise HTTPException(
                        status_code=404,
                        detail=f"Perusall reading not found matching '{reading.title}' (normalized: '{reading_title_normalized}') in course '{course.title}'. Available readings: {', '.join(available_readings) or 'None'}"
                    )
                
                perusall_reading_id = matched_reading.get("_id") or matched_reading.get("id")
                if not perusall_reading_id:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Perusall reading matched but no _id or id field found: {matched_reading}"
                    )
                
                print(f"[post_annotations_to_perusall] Matched Perusall reading: {matched_reading.get('name')} -> {perusall_reading_id}")
                
                # Step 5: Get assignments for this course
                if mock_mode:
                    from app.mocks.perusall_mock_data import get_mock_assignments_for_course
                    perusall_assignments = get_mock_assignments_for_course(perusall_course_id)
                    print(f"[post_annotations_to_perusall] MOCK MODE: Using {len(perusall_assignments)} mock assignments for course {perusall_course_id}")
                else:
                    assignments_url = f"{PERUSALL_BASE_URL}/courses/{perusall_course_id}/assignments"
                    print(f"[post_annotations_to_perusall] Fetching assignments from: {assignments_url}")
                    assignments_response = requests.get(assignments_url, headers=headers, timeout=30)

                    print(f"[post_annotations_to_perusall] Assignments API response status: {assignments_response.status_code}")
                    assignments_response.raise_for_status()

                    # Check if response is valid JSON
                    try:
                        perusall_assignments = assignments_response.json()
                    except ValueError as json_error:
                        response_text = assignments_response.text[:500]  # First 500 chars
                        print(f"[post_annotations_to_perusall] Failed to parse JSON response. Response text (first 500 chars): {response_text}")
                        raise HTTPException(
                            status_code=500,
                            detail=f"Perusall assignments API returned invalid JSON. Status: {assignments_response.status_code}. Response: {response_text}"
                        )

                    if not isinstance(perusall_assignments, list):
                        raise HTTPException(
                            status_code=500,
                            detail=f"Unexpected response format from Perusall assignments API: {type(perusall_assignments)}. Expected list, got {type(perusall_assignments)}"
                        )
                
                # Step 6: Find assignment that contains this reading_id
                # Assignments may have a 'documents' array or 'document_id' field
                matched_assignment = None
                for pa in perusall_assignments:
                    if isinstance(pa, dict):
                        # Check if assignment has documents array containing the reading_id
                        assignment_documents = pa.get("documents", [])
                        if isinstance(assignment_documents, list):
                            for doc in assignment_documents:
                                doc_id = doc.get("_id") or doc.get("id") if isinstance(doc, dict) else doc
                                if str(doc_id) == str(perusall_reading_id):
                                    matched_assignment = pa
                                    break
                        
                        # Also check direct document_id field
                        if not matched_assignment:
                            assignment_doc_id = pa.get("document_id") or pa.get("documentId")
                            if assignment_doc_id and str(assignment_doc_id) == str(perusall_reading_id):
                                matched_assignment = pa
                                break
                        
                        if matched_assignment:
                            break
                
                if not matched_assignment:
                    available_assignments = [a.get("name", a.get("title", "Unknown")) for a in perusall_assignments[:5]]
                    raise HTTPException(
                        status_code=404,
                        detail=f"Perusall assignment not found containing reading_id '{perusall_reading_id}' (reading: '{reading.title}') in course '{course.title}'. Available assignments: {', '.join(available_assignments) or 'None'}"
                    )
                
                perusall_assignment_id = matched_assignment.get("_id") or matched_assignment.get("id")
                if not perusall_assignment_id:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Perusall assignment matched but no _id or id field found: {matched_assignment}"
                    )
                
                print(f"[post_annotations_to_perusall] Matched Perusall assignment: {matched_assignment.get('name')} -> {perusall_assignment_id} (contains reading_id: {perusall_reading_id})")
                
                # Step 7: Use reading_id as document_id
                # In Perusall, the reading_id from the library is the same as document_id
                # We don't need to call the documents API - we can use the reading_id directly
                perusall_document_id = perusall_reading_id
                print(f"[post_annotations_to_perusall] Using reading_id as document_id: {perusall_document_id} (from reading: '{matched_reading.get('name')}')")
                
                # Step 7: Save mapping to database for future use
                new_mapping = PerusallMapping(
                    course_id=course.id,
                    reading_id=reading.id,
                    perusall_course_id=str(perusall_course_id),
                    perusall_assignment_id=str(perusall_assignment_id),
                    perusall_document_id=str(perusall_document_id),
                )
                db.add(new_mapping)
                db.commit()
                db.refresh(new_mapping)
                print(f"[post_annotations_to_perusall] Saved Perusall mapping to database for future use")
                
            except requests.exceptions.RequestException as e:
                error_msg = str(e)
                response_text = None
                status_code = None
                if hasattr(e, "response") and e.response is not None:
                    try:
                        status_code = e.response.status_code
                        response_text = e.response.text[:500]  # First 500 chars
                        content_type = e.response.headers.get('Content-Type', 'unknown')
                        print(f"[post_annotations_to_perusall] RequestException - Status: {status_code}, Content-Type: {content_type}")
                        print(f"[post_annotations_to_perusall] Response text (first 500 chars): {response_text}")
                        error_msg = f"HTTP {status_code}: {error_msg}. Response: {response_text}"
                    except Exception as parse_error:
                        print(f"[post_annotations_to_perusall] Failed to parse error response: {parse_error}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to fetch Perusall mapping from API: {error_msg}"
                )
            except ValueError as json_error:
                # JSON parsing error
                print(f"[post_annotations_to_perusall] JSON parsing error: {json_error}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to parse Perusall API response as JSON: {str(json_error)}. This usually means the API returned HTML or an empty response instead of JSON."
                )
            except HTTPException:
                raise
            except Exception as e:
                import traceback
                error_trace = traceback.format_exc()
                print(f"[post_annotations_to_perusall] Error fetching Perusall mapping: {e}")
                print(f"[post_annotations_to_perusall] Traceback: {error_trace}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to get Perusall mapping: {str(e)}"
                )
    else:
        # If annotations were provided directly (not via annotation_ids), use environment variables
        if not req.annotation_ids and req.annotations:
            # Fallback to environment variables if annotations provided directly
            perusall_course_id = COURSE_ID
            perusall_assignment_id = ASSIGNMENT_ID
            perusall_document_id = DOCUMENT_ID
        
        if not perusall_course_id or not perusall_assignment_id or not perusall_document_id:
            raise HTTPException(
                status_code=400,
                detail="When providing annotations directly, PERUSALL_COURSE_ID, PERUSALL_ASSIGNMENT_ID, and PERUSALL_DOCUMENT_ID must be set in environment variables, or provide annotation_ids to lookup from database."
            )
    
    print(f"[post_annotations_to_perusall] Posting {len(annotations_to_post)} annotation(s) to Perusall")

    created_ids = []
    errors = []

    try:
        with requests.Session() as session:
            headers = {
                "X-Institution": X_INSTITUTION,
                "X-API-Token": X_API_TOKEN,
            }

            for idx, item in enumerate(annotations_to_post):
                payload = {
                    "documentId": perusall_document_id,
                    "userId": USER_ID,
                    "positionStartX": item.positionStartX,
                    "positionStartY": item.positionStartY,
                    "positionEndX": item.positionEndX,
                    "positionEndY": item.positionEndY,
                    "rangeType": item.rangeType,
                    "rangePage": item.rangePage,
                    "rangeStart": item.rangeStart,
                    "rangeEnd": item.rangeEnd,
                    "fragment": item.fragment,
                    "text": f"<p>{item.fragment}</p>"
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
    # Validate course_id and reading_id from path
    try:
        course_id = uuid.UUID(req.course_id)
        reading_id = uuid.UUID(req.reading_id)
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
            course_id=course_id,
            reading_id=reading_id,
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
