"""
Scaffold generation and management endpoints
"""
import uuid
import json as json_module
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db, get_supabase_client
from app.models.models import AnnotationHighlightCoords, ScaffoldAnnotationVersion, ScaffoldAnnotation
from app.services.reading_scaffold_service import (
    create_scaffold_annotation,
    get_scaffold_annotation,
    get_scaffold_annotations_by_session,
    update_scaffold_annotation_status,
    update_scaffold_annotation_content,
    get_approved_annotations,
    scaffold_to_dict,
    scaffold_to_dict_with_status_and_history,
)
from app.services.user_service import get_user_by_id
from app.services.course_service import get_course_by_id
from app.services.reading_service import get_reading_by_id
from app.services.reading_chunk_service import get_reading_chunks_by_reading_id
from app.services.class_profile_service import get_class_profile_by_course_id
from app.services.session_service import (
    get_session_by_id,
)
from app.services.session_service import (
    create_session,
    get_session_readings,
    add_reading_to_session,
    get_latest_session_version,
    get_session_version_by_id,
    create_session_version,
    get_next_version_number,
    set_current_version,
)
from app.services.session_reading_service import (
    get_active_session_readings,
    rederive_session_readings_for_session,
)
from app.workflows.scaffold_workflow import (
    build_workflow as build_scaffold_workflow,
    WorkflowState as ScaffoldWorkflowState,
    llm_refine_scaffold,
    make_llm as make_scaffold_llm,
)
from app.api.models import (
    ReadingScaffoldsRequest,
    ReadingScaffoldsResponse,
    GenerateScaffoldsRequest,
    GenerateScaffoldsResponse,
    EditScaffoldRequest,
    LLMRefineScaffoldRequest,
    ScaffoldResponse,
    ExportedScaffold,
    ExportedScaffoldsResponse,
    ThreadReviewRequest,
    ThreadReviewAction,
    HighlightReportRequest,
    HighlightReportResponse,
    ReviewedScaffoldModel,
    ReviewedScaffoldModelWithStatusAndHistory,
)

router = APIRouter()


# Helper functions
def get_scaffold_or_404(scaffold_id: str, db: Session) -> Dict[str, Any]:
    """Get scaffold annotation from database or raise 404"""
    try:
        annotation_id = uuid.UUID(scaffold_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scaffold ID format: {scaffold_id}")
    
    annotation = get_scaffold_annotation(db, annotation_id)
    if annotation is None:
        raise HTTPException(status_code=404, detail=f"Scaffold {scaffold_id} not found")
    
    return scaffold_to_dict(annotation)


def scaffold_to_model(scaffold: Dict[str, Any]) -> ReviewedScaffoldModel:
    """Convert scaffold dict to ReviewedScaffoldModel"""
    return ReviewedScaffoldModel(
        id=scaffold["id"],
        fragment=scaffold["fragment"],
        text=scaffold["text"],
    )


def verify_scaffold_belongs_to_course(
    scaffold_id: str,
    course_id: str,
    db: Session
) -> None:
    """
    Verify that a scaffold belongs to a specific course.
    Raises HTTPException if verification fails.
    """
    try:
        course_uuid = uuid.UUID(course_id)
        annotation = db.query(ScaffoldAnnotation).filter(ScaffoldAnnotation.id == uuid.UUID(scaffold_id)).first()
        if not annotation:
            raise HTTPException(status_code=404, detail=f"Scaffold {scaffold_id} not found")
        
        # Check via reading's course_id
        if annotation.reading_id:
            reading = get_reading_by_id(db, annotation.reading_id)
            if reading and reading.course_id != course_uuid:
                raise HTTPException(
                    status_code=404,
                    detail=f"Scaffold {scaffold_id} does not belong to course {course_id}"
                )
        # Or check via session's course_id
        elif annotation.session_id:
            from app.models.models import Session
            session = db.query(Session).filter(Session.id == annotation.session_id).first()
            if session and session.course_id != course_uuid:
                raise HTTPException(
                    status_code=404,
                    detail=f"Scaffold {scaffold_id} does not belong to course {course_id}"
                )
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")


# Test endpoints (already migrated)
@router.post("/test-scaffold-response")
def test_scaffold_response_post(payload: Dict[str, Any]):
    """
    Test endpoint: Returns a hardcoded scaffold response for testing
    Signature matches /api/generate-scaffolds exactly
    """
    test_scaffolds = [
        {
            'id': 'cbf12d27-9155-431c-9fa0-857fb142b727',
            'fragment': 'A version control system serves the following purposes, among others. Version control enables multiple people to simultaneously work on a single project. Each person edits his or her own copy of the ﬁles and chooses when to share those changes with the rest of the team.',
            'text': 'Consider a collaborative education data analysis project. How could version control help your team manage Python scripts and datasets, ensuring everyone has the latest version and can track changes effectively?',
            'status': 'pending',
            'history': [{'ts': 1766037322.98965, 'action': 'init', 'prompt': None, 'old_text': None, 'new_text': 'Consider a collaborative education data analysis project. How could version control help your team manage Python scripts and datasets, ensuring everyone has the latest version and can track changes effectively?'}]
        },
        {
            'id': '1b9585d0-4f9c-4192-80fc-8d96ed9bd5a4',
            'fragment': 'Version control uses a repository (a database of program versions) and a working copy where you edit ﬁles. Your working copy (sometimes called a checkout or clone) is your personal copy of all the ﬁles in the project. When you are happy with your edits, you commit your changes to a repository.',
            'text': "In your own words, explain the difference between a 'working copy' and a 'repository'. What specific action does 'committing' your changes perform, and why is it a crucial step in managing your code?",
            'status': 'pending',
            'history': [{'ts': 1766037403.106373, 'action': 'init', 'prompt': None, 'old_text': None, 'new_text': "In your own words, explain the difference between a 'working copy' and a 'repository'. What specific action does 'committing' your changes perform, and why is it a crucial step in managing your code?"}]
        },
        {
            'id': '363ae2cf-6ec3-40a4-9341-b58ecf281510',
            'fragment': 'There are two general varieties of version control: centralized and distributed. Distributed version control is more modern, runs faster, is less prone to errors, has more features, and is more complex to understand. The main diﬀerence between centralized and distributed version control is the number of repositories.',
            'text': 'Given that we will primarily use Git, a distributed version control system, what do you think are the key advantages of having multiple repositories for a team working on Python-based data analysis workflows?',
            'status': 'pending',
            'history': [{'ts': 1766037403.37672, 'action': 'init', 'prompt': None, 'old_text': None, 'new_text': 'Given that we will primarily use Git, a distributed version control system, what do you think are the key advantages of having multiple repositories for a team working on Python-based data analysis workflows?'}]
        },
        {
            'id': 'beb89a84-8abf-4dd1-a900-9968ea82f739',
            'fragment': 'A typical workﬂow when using Git is: On the main branch: git pull git branch NEW-BRANCH-NAME git checkout NEW-BRANCH-NAME As many times as desired: Make local edits. Examine the local edits: git status and git diff git commit, or git add then git commit git pull Ensure that tests pass. git push Make a pull request for branch NEW-BRANCH-NAME',
            'text': 'Imagine you are developing a new Python function to clean student assessment data. How would you apply this typical Git workflow to ensure your changes are integrated smoothly and safely into the main project?',
            'status': 'pending',
            'history': [{'ts': 1766037403.572485, 'action': 'init', 'prompt': None, 'old_text': None, 'new_text': 'Imagine you are developing a new Python function to clean student assessment data. How would you apply this typical Git workflow to ensure your changes are integrated smoothly and safely into the main project?'}]
        },
        {
            'id': '833f6ac1-b8a4-457f-95cd-f0d42090c7ee',
            'fragment': "Don't rewrite history. git rebase is a powerful command that lets you rewrite the version control history. Never use rebase, including git pull -r. (Until you are more experienced with git. And, then still don't use it.) Rewriting history is ineﬀective if anyone else has cloned your repository.",
            'text': "Why is 'rewriting history' with commands like `git rebase` strongly discouraged, especially when working on a shared codebase with other researchers? What are the potential negative consequences for collaboration?",
            'status': 'pending',
            'history': [{'ts': 1766037403.737651, 'action': 'init', 'prompt': None, 'old_text': None, 'new_text': "Why is 'rewriting history' with commands like `git rebase` strongly discouraged, especially when working on a shared codebase with other researchers? What are the potential negative consequences for collaboration?"}]
        }
    ]

    test_response = {
        "annotation_scaffolds_review": test_scaffolds,
        "session_id": "cbac0675-6ba0-401e-9919-75046b6dcc5f",
        "reading_id": str(payload.get("reading_id")) if payload.get("reading_id") else "59c15877-b451-41a8-b7c1-0f02839afe73",
        "pdf_url": "https://jrcstgmtxnavrkbdcdig.supabase.co/storage/v1/object/sign/readings/course_98adc978-af12-4b83-88ce-a9178670ae46/59c15877-b451-41a8-b7c1-0f02839afe73_reading02.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV85NWYyODY4Ni1mOTAzLTQ4NjMtODQ3Mi0zNzNiMWFhYmRhZDciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyZWFkaW5ncy9jb3Vyc2VfOThhZGM5NzgtYWYxMi00YjgzLTg4Y2UtYTkxNzg2NzBhZTQ2LzU5YzE1ODc3LWI0NTEtNDFhOC1iN2MxLTBmMDI4MzlhZmU3M19yZWFkaW5nMDIucGRmIiwiaWF0IjoxNzY2MDc0ODAzLCJleHAiOjE3NjY2Nzk2MDN9.SQeFoTJXtXOKHFSRs9ebCyoMK7w3wZQq_vHpOE4IBGk",
    }

    encoded = jsonable_encoder(test_response)
    return JSONResponse(content=encoded)


@router.get("/test-scaffold-response")
def test_scaffold_response_get():
    """
    Test endpoint: Returns a hardcoded scaffold response for testing response serialization
    Tests multiple scaffolds scenario
    """
    # Create multiple test scaffolds, simulating actual response
    test_scaffolds = []
    for i in range(5):  # Create 5 scaffolds
        test_scaffolds.append({
            "id": f"test-scaffold-{i+1}",
            "fragment": f"Test fragment text {i+1}. " * 10,  # Longer text
            "text": f"Test scaffold text {i+1}. " * 50,  # Even longer text
        })
    
    # Create a simplified test response (only includes required fields)
    test_response = {
        "annotation_scaffolds_review": test_scaffolds,
        "session_id": "test-session-id",
        "reading_id": "test-reading-id",
        "pdf_url": "https://jrcstgmtxnavrkbdcdig.supabase.co/storage/v1/object/sign/readings/course_98adc978-af12-4b83-88ce-a9178670ae46/59c15877-b451-41a8-b7c1-0f02839afe73_reading02.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV85NWYyODY4Ni1mOTAzLTQ4NjMtODQ3Mi0zNzNiMWFhYmRhZDciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyZWFkaW5ncy9jb3Vyc2VfOThhZGM5NzgtYWYxMi00YjgzLTg4Y2UtYTkxNzg2NzBhZTQ2LzU5YzE1ODc3LWI0NTEtNDFhOC1iN2MxLTBmMDI4MzlhZmU3M19yZWFkaW5nMDIucGRmIiwiaWF0IjoxNzY2MDc0ODAzLCJleHAiOjE3NjY2Nzk2MDN9.SQeFoTJXtXOKHFSRs9ebCyoMK7w3wZQq_vHpOE4IBGk",
    }
    
    print(f"[test_scaffold_response] Returning test response")
    print(f"[test_scaffold_response] annotation_scaffolds_review count: {len(test_response['annotation_scaffolds_review'])}")
    
    # Try using jsonable_encoder
    try:
        encoded = jsonable_encoder(test_response)
        print(f"[test_scaffold_response] Encoded successfully")
        return JSONResponse(content=encoded)
    except Exception as e:
        print(f"[test_scaffold_response] Encoding failed: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Encoding failed: {str(e)}"}
        )


# ======================================================
# Scaffold Generation Endpoints
# ======================================================

@router.post("/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/generate")
def generate_scaffolds_with_session(
    course_id: str,
    session_id: str,
    reading_id: str,
    payload: GenerateScaffoldsRequest,
    db: Session = Depends(get_db)
):
    """
    Generate scaffolds endpoint - wraps run_material_focus_scaffold with error handling
    Generate scaffolds - all data loaded from database.
    Requires: course_id (path), session_id (path, use "new" to create new session), reading_id (path), instructor_id (body)
    """
    # Validate and parse IDs from path
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid course_id format: {course_id}",
        )
    
    try:
        reading_uuid = uuid.UUID(reading_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid reading_id format: {reading_id}",
        )
    
    # Validate and parse instructor_id from payload
    try:
        instructor_uuid = uuid.UUID(payload.instructor_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid instructor_id format: {payload.instructor_id}",
        )
    
    # Verify entities exist
    instructor = get_user_by_id(db, instructor_uuid)
    if not instructor:
        raise HTTPException(
            status_code=404,
            detail=f"Instructor {payload.instructor_id} not found",
        )
    
    course = get_course_by_id(db, course_uuid)
    if not course:
        raise HTTPException(
            status_code=404,
            detail=f"Course {course_id} not found",
        )
    
    reading = get_reading_by_id(db, reading_uuid)
    if not reading:
        raise HTTPException(
            status_code=404,
            detail=f"Reading {reading_id} not found",
        )
    
    # Verify reading belongs to the specified course
    if reading.course_id != course_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Reading {reading_id} does not belong to course {course_id}. Reading belongs to course {reading.course_id}",
        )
    
    # Handle session_id from path parameter
    # If session_id is "new", return with an error demanding creatation of a new session first
    # no need to handle the dirtystate existing session (as handled in sessions.py)
    
    if session_id.lower() == "new":
        raise HTTPException(
            status_code=400,
            detail="session_id must be an existing session UUID. Please create the session first, then call generate.",
        )

    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid session_id format: {session_id}. Must be a UUID.",
        )

    session = get_session_by_id(db, session_uuid)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_id} not found",
        )
    if session.course_id != course_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Session {session_id} does not belong to course {course_id}",
        )

    # Establish session-reading relationship (if not already exists)
    existing_relations = get_session_readings(db, session_uuid)
    reading_exists = any(sr.reading_id == reading_uuid for sr in existing_relations)
    
    if not reading_exists:
        add_reading_to_session(
            db=db,
            session_id=session_uuid,
            reading_id=reading_uuid,
        )
    
    # Load class_profile from database (by course_id)
    class_profile_db = get_class_profile_by_course_id(db, course_uuid)
    if not class_profile_db:
        print(f"[generate_scaffolds_with_session] ERROR: Class profile not found for course {course_id}")
        raise HTTPException(
            status_code=404,
            detail=f"Class profile not found for course {course_id}. Please create a class profile first.",
        )
    
    # Parse class_profile JSON from description field
    try:
        class_profile_json = json_module.loads(class_profile_db.description)
        print(f"[generate_scaffolds_with_session] Successfully parsed class profile JSON")
    except json_module.JSONDecodeError as json_error:
        print(f"[generate_scaffolds_with_session] ERROR: Failed to parse class profile JSON: {json_error}")
        print(f"[generate_scaffolds_with_session] Class profile description length: {len(class_profile_db.description) if class_profile_db.description else 0}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse class profile JSON from database: {str(json_error)}",
        )
    

    # Get current version from session
    current_version = None
    if session.current_version_id:
        current_version = get_session_version_by_id(db, session.current_version_id)

    
    # Load reading_chunks from database
    chunks = get_reading_chunks_by_reading_id(db, reading_uuid)
    if not chunks:
        raise HTTPException(
            status_code=404,
            detail=f"No chunks found for reading {reading_uuid}. Please upload and process the reading first.",
        )

    # Filter chunks based on assignment-derived session_readings (Perusall pages are 1-based; chunk_index is 0-based)
    start_page: Optional[int] = None
    end_page: Optional[int] = None

    def coerce_int(v: Any) -> Optional[int]:
        try:
            if v is None:
                return None
            return int(v)
        except Exception:
            return None

    session_readings = get_active_session_readings(db, session_uuid)
    sr_for_reading = next((sr for sr in session_readings if sr.reading_id == reading_uuid), None)
    if sr_for_reading and sr_for_reading.assigned_pages and isinstance(sr_for_reading.assigned_pages, dict):
        start_page = coerce_int(sr_for_reading.assigned_pages.get("start_page"))
        end_page = coerce_int(sr_for_reading.assigned_pages.get("end_page"))

    # Backfill: older sessions may have session_readings rows without assignment-derived metadata.
    if sr_for_reading and (start_page is None and end_page is None):
        try:
            rederive_session_readings_for_session(db, session_uuid)
        except Exception:
            pass
        session_readings = get_active_session_readings(db, session_uuid)
        sr_for_reading = next((sr for sr in session_readings if sr.reading_id == reading_uuid), None)
        if sr_for_reading and sr_for_reading.assigned_pages and isinstance(sr_for_reading.assigned_pages, dict):
            start_page = coerce_int(sr_for_reading.assigned_pages.get("start_page"))
            end_page = coerce_int(sr_for_reading.assigned_pages.get("end_page"))

    if start_page is None and end_page is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Assignment-derived session_readings page range not available for this session/reading. "
                "Please sync the Perusall assignment (and re-derive session_readings) first."
            ),
        )

    filtered_chunks = chunks
    start_idx = max(0, (start_page - 1) if start_page else 0)
    end_idx = (end_page - 1) if end_page else None
    if end_idx is not None and end_idx < start_idx:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid assignment page range: start_page={start_page}, end_page={end_page}",
        )
    if end_idx is None:
        filtered_chunks = [c for c in chunks if c.chunk_index >= start_idx]
    else:
        filtered_chunks = [c for c in chunks if start_idx <= c.chunk_index <= end_idx]
    print(
        f"[generate_scaffolds_with_session] Using page range start_page={start_page}, end_page={end_page} -> chunk_index {start_idx}..{end_idx}; selected {len(filtered_chunks)}/{len(chunks)} chunks"
    )
    
    # Convert to workflow format: {"chunks": [...]}
    reading_chunks_data = {
        "chunks": [
            {
                "document_id": chunk.chunk_metadata.get("document_id") if chunk.chunk_metadata else None,
                "chunk_index": chunk.chunk_index,
                "text": chunk.content,
                "content": chunk.content,
                "token_count": chunk.chunk_metadata.get("token_count") if chunk.chunk_metadata else None,
            }
            for chunk in filtered_chunks
        ]
    }
    
    # Build reading_info from reading and session version
    reading_info = {
        "assignment_id": str(reading_uuid),
        "source": reading.file_path,
        "session_id": str(session_uuid),
        "reading_id": str(reading_uuid),
    }
    # Add session version data if available
    if current_version:
        if current_version.session_info_json:
            reading_info["session_info"] = current_version.session_info_json
        if current_version.assignment_info_json:
            reading_info["assignment_info"] = current_version.assignment_info_json
        if current_version.assignment_goals_json:
            reading_info["assignment_goals"] = current_version.assignment_goals_json
    
    print(f"[generate_scaffolds_with_session] Loaded {len(chunks)} chunks from database for reading {reading_uuid}")
    
    scaffold_count = payload.scaffold_count
    if scaffold_count is not None and scaffold_count < 1:
        raise HTTPException(
            status_code=400,
            detail="scaffold_count must be a positive integer",
        )

    # Create ReadingScaffoldsRequest with data from database
    generation_uuid = uuid.uuid4()
    scaffold_request = ReadingScaffoldsRequest(
        class_profile=class_profile_json,
        reading_chunks=reading_chunks_data,
        reading_info=reading_info,
        session_id=str(session_uuid),
        reading_id=str(reading_uuid),
        course_id=str(course_uuid),  # Include course_id from path parameter
        generation_id=str(generation_uuid),
        scaffold_count=scaffold_count,
    )
    
    # Call the existing workflow function
    print(f"[generate_scaffolds_with_session] Calling run_material_focus_scaffold...")
    try:
        response = run_material_focus_scaffold(scaffold_request, db)
        print(f"[generate_scaffolds_with_session] Successfully got response from run_material_focus_scaffold")
        
        # Re-fetch annotations from database with full status and history
        # This ensures we return complete information including status and history
        # Filter by both session_id and reading_id to ensure we only return annotations for this reading
        print(f"[generate_scaffolds_with_session] Re-fetching annotations with full status and history...")
        print(f"[generate_scaffolds_with_session] Session UUID: {session_uuid}, Reading UUID: {reading_uuid}")
        all_annotations = get_scaffold_annotations_by_session(db, session_uuid)
        print(f"[generate_scaffolds_with_session] Found {len(all_annotations)} total annotations for session {session_uuid}")
        # Filter by reading_id to only return annotations for this specific reading
        annotations = [
            a for a in all_annotations
            if a.reading_id == reading_uuid and a.generation_id == generation_uuid
        ]
        print(f"[generate_scaffolds_with_session] Found {len(annotations)} annotations in database for reading {reading_uuid}")
        
        # If no annotations found, check if run_material_focus_scaffold returned any
        if len(annotations) == 0:
            print(f"[generate_scaffolds_with_session] WARNING: No annotations found in database after generation!")
            print(f"[generate_scaffolds_with_session] Response from run_material_focus_scaffold had {len(response.annotation_scaffolds_review) if hasattr(response, 'annotation_scaffolds_review') else 0} scaffolds")
            # Check if response has scaffolds that weren't saved
            if hasattr(response, 'annotation_scaffolds_review') and len(response.annotation_scaffolds_review) > 0:
                print(f"[generate_scaffolds_with_session] ERROR: Response has scaffolds but database query returned empty!")
                print(f"[generate_scaffolds_with_session] This may indicate a database transaction issue or ID mismatch")
        
        # Convert to full API format with status and history
        full_scaffolds = []
        for annotation in annotations:
            try:
                annotation_dict = scaffold_to_dict_with_status_and_history(annotation)
                scaffold_model = ReviewedScaffoldModelWithStatusAndHistory(**annotation_dict)
                full_scaffolds.append(scaffold_model)
                print(f"[generate_scaffolds_with_session] Converted annotation {annotation.id} with status={annotation_dict.get('status')} and history length={len(annotation_dict.get('history', []))}")
            except Exception as convert_error:
                print(f"[generate_scaffolds_with_session] ERROR converting annotation {annotation.id}: {convert_error}")
                import traceback
                traceback.print_exc()
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to convert annotation to API format: {str(convert_error)}",
                )
        
        # Get PDF URL from Supabase Storage
        # For frontend to display PDF
        pdf_url = None
        if reading.file_path:
            try:
                supabase_client = get_supabase_client()
                bucket_name = "readings"
                
                # Try to get signed URL (expires in 7 days)
                signed_url_response = supabase_client.storage.from_(bucket_name).create_signed_url(
                    reading.file_path,
                    expires_in=604800  # 7 days
                )
                pdf_url = signed_url_response.get('signedURL') if isinstance(signed_url_response, dict) else signed_url_response
                print(f"[generate_scaffolds_with_session] Got PDF signed URL: {pdf_url}")
            except Exception as url_error:
                print(f"[generate_scaffolds_with_session] Warning: Failed to get PDF URL: {url_error}")
                import traceback
                traceback.print_exc()
        
        # Build GenerateScaffoldsResponse with full information
        try:
            full_response = GenerateScaffoldsResponse(
                annotation_scaffolds_review=full_scaffolds,
                session_id=str(session_uuid),
                reading_id=str(reading_uuid),
                pdf_url=pdf_url,
            )
            print(f"[generate_scaffolds_with_session] Built GenerateScaffoldsResponse with {len(full_scaffolds)} scaffolds")
            
            # Convert to dict and encode
            response_dict = full_response.model_dump(mode='json')
            encoded = jsonable_encoder(response_dict)
            
            print(f"[generate_scaffolds_with_session] Returning JSONResponse with full scaffold information...")
            print(f"[generate_scaffolds] Response contains {len(full_scaffolds)} scaffolds")
            return JSONResponse(content=encoded)
        
        except Exception as response_error:
            print(f"[generate_scaffolds_with_session] ERROR building response: {response_error}")
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to build response: {str(response_error)}",
            )
        except HTTPException:
            raise
        except Exception as final_error:
            print(f"[generate_scaffolds_with_session] ERROR: Response cannot be serialized: {final_error}")
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Response serialization failed: {str(final_error)}",
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[generate_scaffolds_with_session] ERROR calling run_material_focus_scaffold: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate scaffolds: {str(e)}",
        )


@router.post("/reading-scaffolds", response_model=ReadingScaffoldsResponse)
def run_material_focus_scaffold(
    payload: ReadingScaffoldsRequest,
    db: Session = Depends(get_db)
):
    """
    Run Material → Focus → Scaffold pipeline and return review objects.
    Stores ReviewedScaffolds in database.
    """
    reading_info = payload.reading_info
    assignment_id = reading_info.get("assignment_id")
    if not assignment_id:
        raise HTTPException(
            status_code=400,
            detail="reading_info.assignment_id is required",
        )
    
    # Get session_id and reading_id from request, or from reading_info, or generate new ones
    session_id_str = payload.session_id or reading_info.get("session_id")
    reading_id_str = payload.reading_id or reading_info.get("reading_id")
    generation_id_str = getattr(payload, "generation_id", None)
    
    print(f"[run_material_focus_scaffold] Received session_id_str: {session_id_str}, reading_id_str: {reading_id_str}")
    print(f"[run_material_focus_scaffold] payload.session_id: {payload.session_id}, payload.reading_id: {payload.reading_id}")
    print(f"[run_material_focus_scaffold] reading_info.get('session_id'): {reading_info.get('session_id')}, reading_info.get('reading_id'): {reading_info.get('reading_id')}")
    
    # Validate and parse UUIDs
    try:
        session_id = uuid.UUID(session_id_str) if session_id_str else uuid.uuid4()
        print(f"[run_material_focus_scaffold] Parsed session_id: {session_id}")
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid session_id format: {session_id_str}",
        )
    
    try:
        reading_id = uuid.UUID(reading_id_str) if reading_id_str else uuid.uuid4()
        print(f"[run_material_focus_scaffold] Parsed reading_id: {reading_id}")
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid reading_id format: {reading_id_str}",
        )

    generation_id = None
    if generation_id_str:
        try:
            generation_id = uuid.UUID(generation_id_str)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid generation_id format: {generation_id_str}",
            )

    scaffold_count = getattr(payload, "scaffold_count", None)

    initial_state: ScaffoldWorkflowState = {
        "reading_chunks": payload.reading_chunks,
        "class_profile": payload.class_profile,
        "reading_info": reading_info,
        "scaffold_count": scaffold_count,
        "model": "gemini-2.5-flash",
        "temperature": 0.3,
        "max_output_tokens": 8192,
    }

    try:
        graph = build_scaffold_workflow()
        final_state = graph.invoke(initial_state)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Workflow execution error: {error_trace}")
        
        # Check if it's a quota/rate limit error
        error_str = str(e)
        if "429" in error_str or "quota" in error_str.lower() or "ResourceExhausted" in error_str:
            raise HTTPException(
                status_code=429,
                detail="API quota exceeded. Please wait a moment and try again, or check your Gemini API plan and billing details.",
            )
        
        raise HTTPException(
            status_code=500,
            detail=f"Workflow execution failed: {str(e)}",
        )

    # Debug: Print final_state keys
    print(f"Final state keys: {list(final_state.keys())}")
    print(f"scaffold_json present: {'scaffold_json' in final_state}")
    print(f"annotation_scaffolds_review present: {'annotation_scaffolds_review' in final_state}")

    review_list: List[Dict[str, Any]] = final_state.get("annotation_scaffolds_review") or []
    print(f"review_list length: {len(review_list)}")
    
    # If review_list is empty, check scaffold_json
    if not review_list:
        scaffold_json = final_state.get("scaffold_json", "")
        if scaffold_json:
            try:
                scaffold_data = json_module.loads(scaffold_json) if isinstance(scaffold_json, str) else scaffold_json
                annotation_scaffolds = scaffold_data.get("annotation_scaffolds", []) if isinstance(scaffold_data, dict) else []
                print(f"Found {len(annotation_scaffolds)} scaffolds in scaffold_json")
            except Exception as e:
                print(f"Error parsing scaffold_json: {e}")
                import traceback
                print(traceback.format_exc())
        
        error_detail = "Workflow returned empty 'annotation_scaffolds_review'"
        if scaffold_json:
            error_detail += f". However, scaffold_json contains data. This may indicate an issue in node_init_scaffold_review."
        else:
            error_detail += ". scaffold_json is also empty, indicating scaffolds were not generated."
        
        raise HTTPException(
            status_code=500,
            detail=error_detail,
        )

    # Save scaffolds to database
    saved_annotations = []
    try:
        for idx, scaf in enumerate(review_list):
            print(f"[run_material_focus_scaffold] Saving scaffold {idx + 1}/{len(review_list)}")
            start_offset = scaf.get("start_offset")
            end_offset = scaf.get("end_offset")
            page_number = scaf.get("page_number")

            try:
                annotation = create_scaffold_annotation(
                    db=db,
                    session_id=session_id,
                    reading_id=reading_id,
                    generation_id=generation_id,
                    highlight_text=scaf.get("fragment", ""),
                    current_content=scaf.get("text", ""),
                    start_offset=start_offset,
                    end_offset=end_offset,
                    page_number=page_number,
                    status="draft",
                )
                saved_annotations.append(annotation)
                print(f"[run_material_focus_scaffold] Successfully saved scaffold {idx + 1}")
            except Exception as e:
                print(f"[run_material_focus_scaffold] ERROR saving scaffold {idx + 1}: {e}")
                import traceback
                traceback.print_exc()
                raise

        print(f"[run_material_focus_scaffold] Saved {len(saved_annotations)} annotations to database")
    except Exception as e:
        print(f"[run_material_focus_scaffold] ERROR while saving annotations to database: {e}")
        import traceback
        traceback.print_exc()
        raise


# ======================================================
# Scaffold Management Endpoints
# ======================================================

@router.get("/courses/{course_id}/sessions/{session_id}/scaffolds")
def get_scaffolds_by_session(
    course_id: str,
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    Get all scaffold annotations for a session with full details (status and history)
    Used by frontend to fetch complete scaffold information after receiving IDs from generate-scaffolds.
    """
    # Validate course_id
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")
    
    # Validate session_id
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid session ID format: {session_id}")
    
    # Verify session belongs to the course
    from app.models.models import Session
    session = db.query(Session).filter(Session.id == session_uuid).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    if session.course_id != course_uuid:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_id} does not belong to course {course_id}"
        )
    
    annotations = get_scaffold_annotations_by_session(db, session_uuid)
    
    # Convert to API format with status and history
    scaffolds = []
    for annotation in annotations:
        annotation_dict = scaffold_to_dict_with_status_and_history(annotation)
        scaffolds.append(annotation_dict)
    
    return {
        "scaffolds": scaffolds
    }

# ======================================================
# Load Scaffolds from Session (used for testing)
# ======================================================

@router.post("/load-scaffolds-from-session")
def load_scaffolds_from_session(
    payload: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Load existing scaffolds from database by session_id and reading_id.
    Returns data in the same format as /api/generate-scaffolds.
    Useful for testing without API calls.
    """
    session_id = payload.get("session_id")
    reading_id = payload.get("reading_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid session_id format: {session_id}")
    
    reading_uuid = None
    if reading_id:
        try:
            reading_uuid = uuid.UUID(reading_id)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid reading_id format: {reading_id}")
    
    # Get annotations from database
    all_annotations = get_scaffold_annotations_by_session(db, session_uuid)
    
    # Filter by reading_id if provided
    if reading_uuid:
        annotations = [a for a in all_annotations if a.reading_id == reading_uuid]
    else:
        annotations = all_annotations

    # If scaffolds have generation_id, only return the latest generation
    latest_generation_id = None
    if annotations:
        latest = max(
            annotations,
            key=lambda a: a.created_at.timestamp() if a.created_at else 0,
        )
        latest_generation_id = latest.generation_id
    if latest_generation_id is not None:
        annotations = [a for a in annotations if a.generation_id == latest_generation_id]
    elif annotations:
        annotations = [a for a in annotations if a.generation_id is None]
    
    if not annotations:
        raise HTTPException(
            status_code=404,
            detail=f"No scaffolds found for session_id={session_id}" + 
                   (f" and reading_id={reading_id}" if reading_id else "")
        )
    
    print(f"[load_scaffolds_from_session] Found {len(annotations)} annotations")
    
    # Convert to full API format with status and history (same as generate-scaffolds)
    full_scaffolds = []
    for idx, annotation in enumerate(annotations):
        try:
            print(f"[load_scaffolds_from_session] Converting annotation {idx + 1}/{len(annotations)}: {annotation.id}")
            annotation_dict = scaffold_to_dict_with_status_and_history(annotation)
            
            # Ensure fragment and text fields exist
            if not annotation_dict.get('fragment') and annotation.highlight_text:
                annotation_dict['fragment'] = annotation.highlight_text
            if not annotation_dict.get('text') and annotation.current_content:
                annotation_dict['text'] = annotation.current_content
                
            print(f"[load_scaffolds_from_session] Annotation {idx + 1} - fragment length: {len(annotation_dict.get('fragment', ''))}, text length: {len(annotation_dict.get('text', ''))}")
            
            scaffold_model = ReviewedScaffoldModelWithStatusAndHistory(**annotation_dict)
            full_scaffolds.append(scaffold_model)
            print(f"[load_scaffolds_from_session] Successfully converted annotation {idx + 1}")
        except Exception as convert_error:
            print(f"[load_scaffolds_from_session] ERROR converting annotation {idx + 1} ({annotation.id}): {convert_error}")
            import traceback
            traceback.print_exc()
            continue  # Skip this annotation but continue with others
    
    # Get PDF URL from the first annotation's reading
    pdf_url = None
    if annotations:
        first_annotation = annotations[0]
        # Get reading from database
        from app.models.models import Reading
        reading = db.query(Reading).filter(Reading.id == first_annotation.reading_id).first()
        if reading and reading.file_path:
            try:
                supabase = get_supabase_client()
                bucket = supabase.storage.from_("readings")
                signed_url = bucket.create_signed_url(reading.file_path, 60 * 60 * 24 * 7)  # 7 days
                pdf_url = signed_url.get("signedURL") if signed_url else None
            except Exception as url_error:
                print(f"[load_scaffolds_from_session] Warning: Failed to get PDF URL: {url_error}")
    
    # Build response in same format as generate-scaffolds
    try:
        full_response = GenerateScaffoldsResponse(
            annotation_scaffolds_review=full_scaffolds,
            session_id=str(session_uuid),
            reading_id=str(annotations[0].reading_id) if annotations else reading_id or "",
            pdf_url=pdf_url,
        )
        
        response_dict = full_response.model_dump(mode='json')
        encoded = jsonable_encoder(response_dict)
        
        print(f"[load_scaffolds_from_session] Returning {len(full_scaffolds)} scaffolds")
        return JSONResponse(content=encoded)
    except Exception as response_error:
        print(f"[load_scaffolds_from_session] ERROR building response: {response_error}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build response: {str(response_error)}",
        )


@router.get("/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds")
def get_scaffolds_by_session_and_reading(
    course_id: str,
    session_id: str,
    reading_id: str,
    db: Session = Depends(get_db)
):
    """
    Get all scaffold annotations for a specific session and reading with full details (status and history)
    """
    # Validate course_id
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")
    
    # Validate session_id
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid session ID format: {session_id}")
    
    # Validate reading_id
    try:
        reading_uuid = uuid.UUID(reading_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid reading ID format: {reading_id}")
    
    # Verify session belongs to the course
    from app.models.models import Session
    session = db.query(Session).filter(Session.id == session_uuid).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    if session.course_id != course_uuid:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_id} does not belong to course {course_id}"
        )
    
    # Verify reading belongs to the course
    reading = get_reading_by_id(db, reading_uuid)
    if not reading:
        raise HTTPException(status_code=404, detail=f"Reading {reading_id} not found")
    if reading.course_id != course_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Reading {reading_id} does not belong to course {course_id}"
        )
    
    # Get all annotations for the session
    annotations = get_scaffold_annotations_by_session(db, session_uuid)

    # Determine latest generation_id for this session + reading
    latest_generation_id = None
    latest_annotation = (
        db.query(ScaffoldAnnotation)
        .filter(
            ScaffoldAnnotation.session_id == session_uuid,
            ScaffoldAnnotation.reading_id == reading_uuid,
        )
        .order_by(ScaffoldAnnotation.created_at.desc())
        .first()
    )
    if latest_annotation:
        latest_generation_id = latest_annotation.generation_id
    
    # Filter by reading_id and convert to API format with status and history
    scaffolds = []
    for annotation in annotations:
        if annotation.reading_id != reading_uuid:
            continue
        if latest_generation_id is not None and annotation.generation_id != latest_generation_id:
            continue
        if latest_generation_id is None and annotation.generation_id is not None:
            continue
        annotation_dict = scaffold_to_dict_with_status_and_history(annotation)
        scaffolds.append(annotation_dict)
    
    # Get PDF URL for the reading
    pdf_url = None
    if reading.file_path:
        try:
            supabase_client = get_supabase_client()
            bucket_name = "readings"
            
            # Try to get signed URL (expires in 7 days)
            signed_url_response = supabase_client.storage.from_(bucket_name).create_signed_url(
                reading.file_path,
                expires_in=604800  # 7 days
            )
            pdf_url = signed_url_response.get('signedURL') if isinstance(signed_url_response, dict) else signed_url_response
        except Exception as url_error:
            print(f"[get_scaffolds_by_session_and_reading] Warning: Failed to get PDF URL: {url_error}")
    
    return {
        "scaffolds": scaffolds,
        "pdfUrl": pdf_url
    }


@router.post("/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/approve", response_model=ScaffoldResponse)
def approve_scaffold_endpoint(
    course_id: str,
    session_id: str,
    reading_id: str,
    scaffold_id: str,
    db: Session = Depends(get_db)
):
    """
    Approve a scaffold annotation and create a version record.
    """
    # Validate course_id
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")
    
    # Validate session_id
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid session_id format: {session_id}")
    
    # Validate reading_id
    try:
        reading_uuid = uuid.UUID(reading_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid reading_id format: {reading_id}")
    
    scaffold_dict = get_scaffold_or_404(scaffold_id, db)
    
    # Verify scaffold belongs to the course, session, and reading
    annotation = db.query(ScaffoldAnnotation).filter(ScaffoldAnnotation.id == uuid.UUID(scaffold_id)).first()
    if not annotation:
        raise HTTPException(status_code=404, detail=f"Scaffold {scaffold_id} not found")
    
    if annotation.reading_id != reading_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Scaffold {scaffold_id} does not belong to reading {reading_id}"
        )
    
    if annotation.session_id != session_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Scaffold {scaffold_id} does not belong to session {session_id}"
        )
    
    verify_scaffold_belongs_to_course(scaffold_id, course_id, db)
    
    try:
        annotation_id = uuid.UUID(scaffold_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scaffold ID format: {scaffold_id}")
    
    # Update status in database
    annotation = update_scaffold_annotation_status(
        db=db,
        annotation_id=annotation_id,
        status="accepted",
        change_type="accept",
        created_by="user",
    )
    
    updated_dict = scaffold_to_dict_with_status_and_history(annotation)
    return ScaffoldResponse(scaffold=ReviewedScaffoldModelWithStatusAndHistory(**updated_dict))


@router.post("/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/edit", response_model=ScaffoldResponse)
def edit_scaffold_endpoint(
    course_id: str,
    session_id: str,
    reading_id: str,
    scaffold_id: str,
    payload: EditScaffoldRequest,
    db: Session = Depends(get_db)
):
    """
    Manually edit scaffold annotation content and create a version record.
    """
    # Validate course_id
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")
    
    # Validate session_id
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid session_id format: {session_id}")
    
    # Validate reading_id
    try:
        reading_uuid = uuid.UUID(reading_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid reading_id format: {reading_id}")
    
    scaffold_dict = get_scaffold_or_404(scaffold_id, db)
    
    # Verify scaffold belongs to the course, session, and reading
    annotation = db.query(ScaffoldAnnotation).filter(ScaffoldAnnotation.id == uuid.UUID(scaffold_id)).first()
    if not annotation:
        raise HTTPException(status_code=404, detail=f"Scaffold {scaffold_id} not found")
    
    if annotation.reading_id != reading_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Scaffold {scaffold_id} does not belong to reading {reading_id}"
        )
    
    if annotation.session_id != session_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Scaffold {scaffold_id} does not belong to session {session_id}"
        )
    
    verify_scaffold_belongs_to_course(scaffold_id, course_id, db)
    
    try:
        annotation_id = uuid.UUID(scaffold_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scaffold ID format: {scaffold_id}")
    
    # Update content in database
    annotation = update_scaffold_annotation_content(
        db=db,
        annotation_id=annotation_id,
        new_content=payload.new_text,
        change_type="manual_edit",
        created_by="user",
    )
    
    updated_dict = scaffold_to_dict_with_status_and_history(annotation)
    return ScaffoldResponse(scaffold=ReviewedScaffoldModelWithStatusAndHistory(**updated_dict))


@router.post("/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/llm-refine", response_model=ScaffoldResponse)
def llm_refine_scaffold_endpoint(
    course_id: str,
    session_id: str,
    reading_id: str,
    scaffold_id: str,
    payload: LLMRefineScaffoldRequest,
    db: Session = Depends(get_db)
):
    """
    Use LLM to refine scaffold annotation content and create a version record.
    """
    # Validate course_id
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")
    
    # Validate session_id
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid session_id format: {session_id}")
    
    # Validate reading_id
    try:
        reading_uuid = uuid.UUID(reading_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid reading_id format: {reading_id}")
    
    scaffold_dict = get_scaffold_or_404(scaffold_id, db)
    
    # Verify scaffold belongs to the course, session, and reading
    annotation = db.query(ScaffoldAnnotation).filter(ScaffoldAnnotation.id == uuid.UUID(scaffold_id)).first()
    if not annotation:
        raise HTTPException(status_code=404, detail=f"Scaffold {scaffold_id} not found")
    
    if annotation.reading_id != reading_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Scaffold {scaffold_id} does not belong to reading {reading_id}"
        )
    
    if annotation.session_id != session_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Scaffold {scaffold_id} does not belong to session {session_id}"
        )
    
    verify_scaffold_belongs_to_course(scaffold_id, course_id, db)

    state: ScaffoldWorkflowState = {
        "model": "gemini-2.5-flash",
        "temperature": 0.3,
        "max_output_tokens": 2048,
    }
    llm = make_scaffold_llm(state)

    # Use workflow function to refine (this updates the dict)
    updated_dict = llm_refine_scaffold(scaffold_dict, payload.prompt, llm)
    
    # Save refined content to database
    try:
        annotation_id = uuid.UUID(scaffold_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scaffold ID format: {scaffold_id}")
    
    annotation = update_scaffold_annotation_content(
        db=db,
        annotation_id=annotation_id,
        new_content=updated_dict["text"],
        change_type="llm_edit",
        created_by="llm",
    )
    
    final_dict = scaffold_to_dict_with_status_and_history(annotation)
    return ScaffoldResponse(scaffold=ReviewedScaffoldModelWithStatusAndHistory(**final_dict))


@router.post("/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/reject", response_model=ScaffoldResponse)
def reject_scaffold_endpoint(
    course_id: str,
    session_id: str,
    reading_id: str,
    scaffold_id: str,
    db: Session = Depends(get_db)
):
    """
    Reject a scaffold annotation and create a version record.
    """
    # Validate course_id
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")
    
    # Validate session_id
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid session_id format: {session_id}")
    
    # Validate reading_id
    try:
        reading_uuid = uuid.UUID(reading_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid reading_id format: {reading_id}")
    
    scaffold_dict = get_scaffold_or_404(scaffold_id, db)
    
    # Verify scaffold belongs to the course, session, and reading
    annotation = db.query(ScaffoldAnnotation).filter(ScaffoldAnnotation.id == uuid.UUID(scaffold_id)).first()
    if not annotation:
        raise HTTPException(status_code=404, detail=f"Scaffold {scaffold_id} not found")
    
    if annotation.reading_id != reading_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Scaffold {scaffold_id} does not belong to reading {reading_id}"
        )
    
    if annotation.session_id != session_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Scaffold {scaffold_id} does not belong to session {session_id}"
        )
    
    verify_scaffold_belongs_to_course(scaffold_id, course_id, db)
    
    try:
        annotation_id = uuid.UUID(scaffold_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scaffold ID format: {scaffold_id}")
    
    # Update status in database
    annotation = update_scaffold_annotation_status(
        db=db,
        annotation_id=annotation_id,
        status="rejected",
        change_type="reject",
        created_by="user",
    )
    
    updated_dict = scaffold_to_dict_with_status_and_history(annotation)
    return ScaffoldResponse(scaffold=ReviewedScaffoldModelWithStatusAndHistory(**updated_dict))


@router.get("/courses/{course_id}/scaffolds/export", response_model=ExportedScaffoldsResponse)
def export_approved_scaffolds_endpoint(
    course_id: str,
    reading_id: Optional[str] = None,
    session_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Export final annotation_scaffolds for a course.
    Only includes status == 'accepted' (approved).
    Can optionally filter by reading_id or session_id.
    """
    # Validate course_id
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")
    
    reading_uuid = None
    if reading_id:
        try:
            reading_uuid = uuid.UUID(reading_id)
            # Verify reading belongs to the course
            reading = get_reading_by_id(db, reading_uuid)
            if not reading:
                raise HTTPException(status_code=404, detail=f"Reading {reading_id} not found")
            if reading.course_id != course_uuid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Reading {reading_id} does not belong to course {course_id}"
                )
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid reading_id format: {reading_id}")
    
    session_uuid = None
    if session_id:
        try:
            session_uuid = uuid.UUID(session_id)
            # Verify session belongs to the course
            from app.models.models import Session
            session = db.query(Session).filter(Session.id == session_uuid).first()
            if not session:
                raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
            if session.course_id != course_uuid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Session {session_id} does not belong to course {course_id}"
                )
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid session_id format: {session_id}")
    
    # Get approved annotations from database
    annotations = get_approved_annotations(
        db=db,
        reading_id=reading_uuid,
        session_id=session_uuid,
    )
    
    # Filter by course_id (verify all annotations belong to the course)
    from app.models.models import Session, Reading
    filtered_annotations = []
    for ann in annotations:
        # Check if annotation's reading belongs to the course
        if ann.reading_id:
            reading = db.query(Reading).filter(Reading.id == ann.reading_id).first()
            if reading and reading.course_id == course_uuid:
                filtered_annotations.append(ann)
        # Or check if annotation's session belongs to the course
        elif ann.session_id:
            session = db.query(Session).filter(Session.id == ann.session_id).first()
            if session and session.course_id == course_uuid:
                filtered_annotations.append(ann)
    annotations = filtered_annotations
    
    if not annotations:
        return ExportedScaffoldsResponse(annotation_scaffolds=[])
    
    # Convert to export format
    items = [
        ExportedScaffold(
            id=str(ann.id),
            fragment=ann.highlight_text,
            text=ann.current_content,
        )
        for ann in annotations
    ]
    
    return ExportedScaffoldsResponse(annotation_scaffolds=items)

    """
    Compatibility endpoint for thread-based review API.
    Maps to individual scaffold endpoints based on actions.
    """
    if not payload.actions or len(payload.actions) == 0:
        raise HTTPException(
            status_code=400,
            detail="At least one action is required"
        )
    
    results = []
    
    for action_item in payload.actions:
        scaffold_id = str(action_item.item_id)
        action = action_item.action
        
        try:
            if action == "approve":
                annotation_id = uuid.UUID(scaffold_id)
                annotation = update_scaffold_annotation_status(
                    db=db,
                    annotation_id=annotation_id,
                    status="accepted",
                    change_type="accept",
                    created_by="user",
                )
                updated_dict = scaffold_to_dict_with_status_and_history(annotation)
                scaffold_model = ReviewedScaffoldModelWithStatusAndHistory(**updated_dict)
                results.append({
                    "item_id": scaffold_id,
                    "scaffold": scaffold_model.model_dump(),
                })
                
            elif action == "reject":
                annotation_id = uuid.UUID(scaffold_id)
                annotation = update_scaffold_annotation_status(
                    db=db,
                    annotation_id=annotation_id,
                    status="rejected",
                    change_type="reject",
                    created_by="user",
                )
                updated_dict = scaffold_to_dict_with_status_and_history(annotation)
                scaffold_model = ReviewedScaffoldModelWithStatusAndHistory(**updated_dict)
                results.append({
                    "item_id": scaffold_id,
                    "scaffold": scaffold_model.model_dump(),
                })
                
            elif action == "llm_refine":
                prompt = None
                if action_item.data and "prompt" in action_item.data:
                    prompt = action_item.data["prompt"]
                elif payload.edit_prompt:
                    prompt = payload.edit_prompt
                else:
                    raise HTTPException(
                        status_code=400,
                        detail="Prompt is required for llm_refine action"
                    )
                
                scaffold_dict = get_scaffold_or_404(scaffold_id, db)
                
                state: ScaffoldWorkflowState = {
                    "model": "gemini-2.5-flash",
                    "temperature": 0.3,
                    "max_output_tokens": 2048,
                }
                llm = make_scaffold_llm(state)
                
                updated_dict = llm_refine_scaffold(scaffold_dict, prompt, llm)
                
                annotation_id = uuid.UUID(scaffold_id)
                annotation = update_scaffold_annotation_content(
                    db=db,
                    annotation_id=annotation_id,
                    new_content=updated_dict["text"],
                    change_type="llm_edit",
                    created_by="llm",
                )
                
                final_dict = scaffold_to_dict_with_status_and_history(annotation)
                scaffold_model = ReviewedScaffoldModelWithStatusAndHistory(**final_dict)
                results.append({
                    "item_id": scaffold_id,
                    "scaffold": scaffold_model.model_dump(),
                })
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown action: {action}"
                )
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid scaffold ID format: {scaffold_id}"
            )
        except HTTPException:
            raise
        except Exception as e:
            print(f"[thread_review_endpoint] Error processing action {action} for scaffold {scaffold_id}: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to process action {action} for scaffold {scaffold_id}: {str(e)}"
            )
    
    # Return response in format expected by frontend
    if len(results) == 1:
        result = results[0]
        return {
            "action_result": result.get("scaffold"),
            "__interrupt__": None,
        }
    else:
        return {
            "results": results,
            "__interrupt__": None,
        }


@router.get("/courses/{course_id}/sessions/{session_id}/scaffolds/bundle")
def get_scaffold_bundle_endpoint(
    course_id: str,
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    Get final scaffold bundle for a session.
    Returns all approved scaffolds for the session.
    """
    # Validate course_id
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")
    
    # Validate session_id
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid session_id format: {session_id}"
        )
    
    # Verify session belongs to the course
    from app.models.models import Session
    session = db.query(Session).filter(Session.id == session_uuid).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    if session.course_id != course_uuid:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_id} does not belong to course {course_id}"
        )
    
    # Get approved annotations for the session
    annotations = get_approved_annotations(
        db=db,
        reading_id=None,
        session_id=session_uuid,
    )
    
    if not annotations:
        return ExportedScaffoldsResponse(annotation_scaffolds=[])
    
    # Convert to export format
    items = [
        ExportedScaffold(
            id=str(ann.id),
            fragment=ann.highlight_text,
            text=ann.current_content,
        )
        for ann in annotations
    ]
    
    return ExportedScaffoldsResponse(annotation_scaffolds=items)


# ======================================================
# Highlight Report Endpoint
# ======================================================

@router.post("/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/highlight-report", response_model=HighlightReportResponse)
def save_highlight_coords(
    course_id: str,
    session_id: str,
    reading_id: str,
    req: HighlightReportRequest,
    db: Session = Depends(get_db)
):
    """
    Save annotation highlight coordinates to database.
    Each coordinate record is bound to an annotation_version_id.
    """
    # Validate course_id
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")
    
    # Validate session_id
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid session_id format: {session_id}")
    
    # Validate reading_id
    try:
        reading_uuid = uuid.UUID(reading_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid reading_id format: {reading_id}")
    
    # Verify reading belongs to the course
    reading = get_reading_by_id(db, reading_uuid)
    if not reading:
        raise HTTPException(status_code=404, detail=f"Reading {reading_id} not found")
    if reading.course_id != course_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Reading {reading_id} does not belong to course {course_id}"
        )
    
    # Verify session belongs to the course
    from app.models.models import Session
    session = db.query(Session).filter(Session.id == session_uuid).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    if session.course_id != course_uuid:
        raise HTTPException(
            status_code=400,
            detail=f"Session {session_id} does not belong to course {course_id}"
        )
    created_count = 0
    errors = []

    for idx, item in enumerate(req.coords):
        try:
            # Get annotation_version_id: either provided directly, looked up by annotation_id, or looked up by fragment
            annotation_version_id = None
            
            if item.annotation_version_id:
                # Use provided annotation_version_id
                try:
                    annotation_version_id = uuid.UUID(item.annotation_version_id)
                except ValueError:
                    errors.append({
                        "index": idx,
                        "error": f"Invalid annotation_version_id format: {item.annotation_version_id}"
                    })
                    continue
            elif item.annotation_id:
                # Look up annotation by annotation_id and get current_version_id
                try:
                    annotation_uuid = uuid.UUID(item.annotation_id)
                    annotation = db.query(ScaffoldAnnotation).filter(
                        ScaffoldAnnotation.id == annotation_uuid
                    ).first()
                    
                    if annotation and annotation.current_version_id:
                        annotation_version_id = annotation.current_version_id
                    else:
                        errors.append({
                            "index": idx,
                            "error": f"Could not find annotation or current_version_id for annotation_id: {item.annotation_id}"
                        })
                        continue
                except ValueError:
                    errors.append({
                        "index": idx,
                        "error": f"Invalid annotation_id format: {item.annotation_id}"
                    })
                    continue
            elif item.session_id and item.fragment:
                # Look up annotation by fragment and session_id
                try:
                    session_uuid = uuid.UUID(item.session_id)
                    # Find annotation by matching fragment (highlight_text)
                    annotation = db.query(ScaffoldAnnotation).filter(
                        ScaffoldAnnotation.session_id == session_uuid,
                        ScaffoldAnnotation.highlight_text.ilike(f"%{item.fragment[:100]}%")
                    ).first()
                    
                    if annotation and annotation.current_version_id:
                        annotation_version_id = annotation.current_version_id
                    else:
                        errors.append({
                            "index": idx,
                            "error": f"Could not find annotation for fragment: {item.fragment[:50]}..."
                        })
                        continue
                except ValueError:
                    errors.append({
                        "index": idx,
                        "error": f"Invalid session_id format: {item.session_id}"
                    })
                    continue
            else:
                errors.append({
                    "index": idx,
                    "error": "Either annotation_version_id, annotation_id, or (session_id + fragment) must be provided"
                })
                continue

            # Check if annotation version exists (optional validation)
            version = db.query(ScaffoldAnnotationVersion).filter(
                ScaffoldAnnotationVersion.id == annotation_version_id
            ).first()
            
            if not version:
                errors.append({
                    "index": idx,
                    "error": f"Annotation version not found: {annotation_version_id}"
                })
                continue

            # Check if coordinate already exists for this version with same page and range
            # A fragment can appear in multiple locations (different pages/positions), so we need to check
            # for exact matches based on annotation_version_id + range_page + range_start + range_end
            existing = db.query(AnnotationHighlightCoords).filter(
                AnnotationHighlightCoords.annotation_version_id == annotation_version_id,
                AnnotationHighlightCoords.range_page == item.rangePage,
                AnnotationHighlightCoords.range_start == item.rangeStart,
                AnnotationHighlightCoords.range_end == item.rangeEnd
            ).first()

            if existing:
                # Update existing record (same location)
                existing.range_type = item.rangeType
                existing.fragment = item.fragment
                existing.position_start_x = item.positionStartX
                existing.position_start_y = item.positionStartY
                existing.position_end_x = item.positionEndX
                existing.position_end_y = item.positionEndY
                existing.valid = True
                print(f"[save_highlight_coords] Updated existing coords for annotation_version_id={annotation_version_id}, page={item.rangePage}, range=[{item.rangeStart}, {item.rangeEnd}]")
            else:
                # Create new record (new location for same annotation_version)
                coords = AnnotationHighlightCoords(
                    annotation_version_id=annotation_version_id,
                    range_type=item.rangeType,
                    range_page=item.rangePage,
                    range_start=item.rangeStart,
                    range_end=item.rangeEnd,
                    fragment=item.fragment,
                    position_start_x=item.positionStartX,
                    position_start_y=item.positionStartY,
                    position_end_x=item.positionEndX,
                    position_end_y=item.positionEndY,
                    valid=True
                )
                db.add(coords)
                print(f"[save_highlight_coords] Created new coords for annotation_version_id={annotation_version_id}, page={item.rangePage}, range=[{item.rangeStart}, {item.rangeEnd}]")

            db.commit()
            created_count += 1

        except Exception as e:
            db.rollback()
            errors.append({
                "index": idx,
                "error": str(e),
                "annotation_version_id": item.annotation_version_id
            })

    return HighlightReportResponse(
        success=len(errors) == 0,
        created_count=created_count,
        errors=errors
    )


# ======================================================
# Queries Endpoint (for PDF highlighting fallback)
# ======================================================

@router.get("/queries")
def get_queries(
    sessionId: Optional[str] = None,
    readingId: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get scaffold fragments (queries) for PDF highlighting.
    Used as a fallback when searchQueries prop is not provided to PdfPreview component.
    
    Query parameters:
    - sessionId: Session ID to get scaffolds from
    - readingId: Optional reading ID to filter scaffolds
    
    Returns:
    - queries: Array of fragment strings from scaffolds
    """
    print(f"[get_queries] Called with sessionId={sessionId}, readingId={readingId}")
    
    if not sessionId:
        print(f"[get_queries] No sessionId provided, returning empty queries")
        return {"queries": []}
    
    try:
        session_uuid = uuid.UUID(sessionId)
        print(f"[get_queries] Parsed session_uuid: {session_uuid}")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid sessionId format: {sessionId}")
    
    reading_uuid = None
    if readingId:
        try:
            reading_uuid = uuid.UUID(readingId)
            print(f"[get_queries] Parsed reading_uuid: {reading_uuid}")
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid readingId format: {readingId}")
    
    # Get scaffold annotations for the session
    annotations = get_scaffold_annotations_by_session(db, session_uuid)
    print(f"[get_queries] Found {len(annotations)} total annotations for session {session_uuid}")
    
    # Filter by reading_id if provided
    if reading_uuid:
        annotations = [a for a in annotations if a.reading_id == reading_uuid]
        print(f"[get_queries] After filtering by reading_id {reading_uuid}: {len(annotations)} annotations")
    
    # Extract fragments (highlight_text) from annotations
    queries = [ann.highlight_text for ann in annotations if ann.highlight_text and ann.highlight_text.strip()]
    print(f"[get_queries] Extracted {len(queries)} queries from {len(annotations)} annotations")
    
    return {"queries": queries}
