"""
Class profile management endpoints
"""
import uuid
import json
import logging
from typing import Any, List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.class_profile_service import (
    create_class_profile as create_class_profile_db,
    create_class_profile_version,
    update_class_profile,
    get_class_profile_by_id,
    get_class_profile_by_course_id,
    get_class_profiles_by_instructor,
    get_class_profile_versions,
    get_class_profile_version_by_id,
    class_profile_version_to_dict,
)
from app.services.course_service import (
    create_course,
    get_course_by_id,
    get_course_basic_info_by_course_id,
    create_course_basic_info,
    update_course_basic_info,
)
from app.services.user_service import get_user_by_id
from app.workflows.profile_workflow import (
    build_workflow as build_profile_workflow,
    WorkflowState as ProfileWorkflowState,
    make_llm as make_profile_llm,
    llm_refine_profile,
)
from app.api.models import (
    RunClassProfileRequest,
    RunClassProfileResponse,
    UpdateClassProfileRequest,
    ApproveProfileRequest,
    EditProfileRequest,
    LLMRefineProfileRequest,
    ExportedClassProfileResponse,
    ClassProfileListResponse,
    ClassProfileVersionResponse,
    ClassProfileVersionsListResponse,
    ReviewedProfileModel,
    HistoryEntryModel,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def get_profile_or_404(profile_id: str, db: Session) -> Any:
    """Get class profile from database or raise 404"""
    try:
        profile_uuid = uuid.UUID(profile_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid profile ID format: {profile_id}")
    
    profile = get_class_profile_by_id(db, profile_uuid)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id} not found")
    return profile


def profile_to_model(profile: Any, db: Session = None) -> ReviewedProfileModel:
    """Convert database ClassProfile model to ReviewedProfileModel (FAST)"""
    current_content = getattr(profile, "description", "") or ""
    history: List[HistoryEntryModel] = []

    # Only fetch current version content (avoid loading all versions history - can be slow)
    if db is not None:
        try:
            if getattr(profile, "current_version_id", None):
                version = get_class_profile_version_by_id(db, profile.current_version_id)
                if version and getattr(version, "content", None):
                    current_content = version.content
        except Exception:
            pass

    return ReviewedProfileModel(
        id=str(profile.id),
        text=current_content,
        status="approved",
        history=history,
    )



def _get_current_profile_text(profile: Any, db: Session) -> str:
    """Get current version content as source of truth; fallback to profile.description."""
    current_content = getattr(profile, "description", "") or ""
    try:
        if getattr(profile, "current_version_id", None):
            version = get_class_profile_version_by_id(db, profile.current_version_id)
            if version and getattr(version, "content", None):
                current_content = version.content
    except Exception:
        pass
    return current_content or ""


def _build_frontend_profile(
    profile_text: str,
    profile_id: str,
    db: Session = None,
    course_id: uuid.UUID = None,
    metadata_json: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Build the ClassProfile shape expected by /class-profile/[id]/view.
    Queries course_basic_info table if db and course_id provided to retrieve discipline_info, course_info, and class_info.
    """
    result: Dict[str, Any] = {
        "id": profile_id,
        "disciplineInfo": {
            "disciplineName": "",
            "department": "",
            "fieldDescription": "",
        },
        "courseInfo": {
            "courseName": "",
            "courseCode": "",
            "description": "",
            "credits": "",
            "prerequisites": "",
            "learningObjectives": "",
            "assessmentMethods": "",
            "deliveryMode": "",
        },
        "classInfo": {
            "semester": "",
            "year": "",
            "section": "",
            "meetingDays": "",
            "meetingTime": "",
            "location": "",
            "enrollment": "",
            "background": "",
            "priorKnowledge": "",
        },
        "generatedProfile": "",
        "designConsiderations": {},
    }

    def apply_class_input(class_input: Dict[str, Any]) -> None:
        di = class_input.get("discipline_info") or {}
        ci = class_input.get("course_info") or {}
        cl = class_input.get("class_info") or {}

        if isinstance(di, dict):
            result["disciplineInfo"] = {
                "disciplineName": di.get("discipline_name", "") or "",
                "department": di.get("department", "") or "",
                "fieldDescription": di.get("field_description", "") or "",
            }

        if isinstance(ci, dict):
            result["courseInfo"] = {
                "courseName": ci.get("course_name", "") or "",
                "courseCode": ci.get("course_code", "") or "",
                "description": ci.get("description", "") or "",
                "credits": ci.get("credits", "") or "",
                "prerequisites": ci.get("prerequisites", "") or "",
                "learningObjectives": ci.get("learning_objectives", "") or "",
                "assessmentMethods": ci.get("assessment_methods", "") or "",
                "deliveryMode": ci.get("delivery_mode", "") or "",
            }

        if isinstance(cl, dict):
            learning_challenges = cl.get("learning_challenges", [])
            if isinstance(learning_challenges, str):
                learning_challenges = [
                    item.strip()
                    for item in learning_challenges.replace("||", ",").split(",")
                    if item.strip()
                ]
            if not isinstance(learning_challenges, list):
                learning_challenges = []
            result["classInfo"] = {
                "semester": cl.get("semester", "") or "",
                "year": cl.get("year", "") or "",
                "section": cl.get("section", "") or "",
                "meetingDays": cl.get("meeting_days", "") or "",
                "meetingTime": cl.get("meeting_time", "") or "",
                "location": cl.get("location", "") or "",
                "enrollment": cl.get("enrollment", "") or "",
                "background": cl.get("background", "") or "",
                "priorKnowledge": cl.get("prior_knowledge", "") or "",
                "learningChallenges": learning_challenges,
                "learningChallengesOther": cl.get("learning_challenges_other", "") or "",
            }

    if not profile_text:
        if db and course_id:
            from app.services.course_service import get_course_basic_info_by_course_id
            basic_info = get_course_basic_info_by_course_id(db, course_id)
            if basic_info:
                apply_class_input({
                    "discipline_info": basic_info.discipline_info_json or {},
                    "course_info": basic_info.course_info_json or {},
                    "class_info": basic_info.class_info_json or {},
                })
        return result

    try:
        parsed = json.loads(profile_text)
        if isinstance(parsed, dict):
            # Handle the new JSON structure from the workflow
            if isinstance(parsed.get("profile"), dict):
                profile_obj = parsed.get("profile")
                # Convert the structured profile to the format expected by parseProfileSections
                profile_parts = []
                
                if profile_obj.get("overall_profile"):
                    profile_parts.append(profile_obj.get("overall_profile", ""))
                
                if profile_obj.get("discipline_paragraph"):
                    profile_parts.append("Discipline level:")
                    profile_parts.append(profile_obj.get("discipline_paragraph", ""))
                
                if profile_obj.get("course_paragraph"):
                    profile_parts.append("Course level:")
                    profile_parts.append(profile_obj.get("course_paragraph", ""))
                
                if profile_obj.get("class_paragraph"):
                    profile_parts.append("Class level:")
                    profile_parts.append(profile_obj.get("class_paragraph", ""))

                result["generatedProfile"] = "\n\n".join(filter(None, profile_parts))
            elif isinstance(parsed.get("profile"), str):
                result["generatedProfile"] = parsed.get("profile") or ""
            elif isinstance(parsed.get("text"), str):
                result["generatedProfile"] = parsed.get("text") or ""
            else:
                result["generatedProfile"] = profile_text

            # Check metadata_json first for design considerations (takes precedence)
            if metadata_json and isinstance(metadata_json.get("design_consideration"), dict):
                result["designConsiderations"] = metadata_json["design_consideration"]

            # Check for class_input in parsed JSON first
            class_input = parsed.get("class_input")
            # If not in JSON and db/course_id provided, query course_basic_info table
            if not class_input and db and course_id:
                from app.services.course_service import get_course_basic_info_by_course_id
                basic_info = get_course_basic_info_by_course_id(db, course_id)
                if basic_info:
                    class_input = {
                        "discipline_info": basic_info.discipline_info_json or {},
                        "course_info": basic_info.course_info_json or {},
                        "class_info": basic_info.class_info_json or {},
                    }

            if isinstance(class_input, dict):
                apply_class_input(class_input)

                # Also check class_input for design_considerations if not already set
                dc2 = class_input.get("design_considerations")
                if isinstance(dc2, dict) and not result["designConsiderations"]:
                    result["designConsiderations"] = dc2

            # Final check: if metadata_json has class_input, use it
            if metadata_json and isinstance(metadata_json.get("class_input"), dict):
                dc3 = metadata_json["class_input"].get("design_considerations")
                if isinstance(dc3, dict) and not result["designConsiderations"]:
                    result["designConsiderations"] = dc3

            return result
    except Exception:
        result["generatedProfile"] = profile_text
        if db and course_id:
            from app.services.course_service import get_course_basic_info_by_course_id
            basic_info = get_course_basic_info_by_course_id(db, course_id)
            if basic_info:
                apply_class_input({
                    "discipline_info": basic_info.discipline_info_json or {},
                    "course_info": basic_info.course_info_json or {},
                    "class_info": basic_info.class_info_json or {},
                })
        return result

    result["generatedProfile"] = profile_text
    return result

def _extract_design_rationale(profile_json: Dict[str, Any]) -> Optional[Any]:
    """Return LLM-generated design rationale from known keys."""
    if not isinstance(profile_json, dict):
        return None
    design_rationale = (
        profile_json.get("design_rationale")
        or profile_json.get("design_consideration")
        or profile_json.get("design_considerations")
    )
    if design_rationale is None:
        logger.warning(
            "design_rationale missing in profile JSON",
            extra={"class_id": profile_json.get("class_id"), "keys": list(profile_json.keys())},
        )
    return design_rationale

@router.post("/courses/{course_id}/class-profiles", response_model=RunClassProfileResponse)
def create_class_profile(
    course_id: str,
    payload: RunClassProfileRequest,
    db: Session = Depends(get_db)
):
    """
    Generate a draft class profile and wrap it in a HITL review object.
    If course_id is "new", creates a new course. Otherwise, uses existing course.
    """
    # Validate instructor_id from payload
    try:
        instructor_uuid = uuid.UUID(payload.instructor_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid instructor_id format: {payload.instructor_id}",
        )
    
    # Verify instructor exists
    instructor = get_user_by_id(db, instructor_uuid)
    if not instructor:
        raise HTTPException(
            status_code=404,
            detail=f"Instructor {payload.instructor_id} not found",
        )
    
    # Extract discipline_info, course_info, class_info from class_input
    discipline_info = payload.class_input.get("discipline_info")
    course_info = payload.class_input.get("course_info")
    class_info = payload.class_input.get("class_info")
    
    # Handle course_id: if "new", create new course; otherwise, use existing course
    if course_id == "new":
        # Create course in database
        course = create_course(
            db=db,
            instructor_id=instructor_uuid,
            title=payload.title,
            course_code=payload.course_code,
            description=payload.description,
        )
    else:
        # Use existing course
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid course_id format: {course_id}",
            )
        
        course = get_course_by_id(db, course_uuid)
        if not course:
            raise HTTPException(
                status_code=404,
                detail=f"Course {course_id} not found",
            )
        
        # Verify course belongs to instructor
        if course.instructor_id != instructor_uuid:
            raise HTTPException(
                status_code=403,
                detail=f"Course {course_id} does not belong to instructor {payload.instructor_id}",
            )
    
    # Create or update course basic info in database
    existing_basic_info = get_course_basic_info_by_course_id(db, course.id)
    if existing_basic_info:
        # Update existing basic info
        basic_info = update_course_basic_info(
            db=db,
            basic_info_id=existing_basic_info.id,
            discipline_info_json=discipline_info,
            course_info_json=course_info,
            class_info_json=class_info,
            change_type="manual_edit",
            created_by="User",
        )
    else:
        # Create new basic info
        basic_info = create_course_basic_info(
            db=db,
            course_id=course.id,
            discipline_info_json=discipline_info,
            course_info_json=course_info,
            class_info_json=class_info,
        )
    
    # Run profile generation workflow
    initial_state: ProfileWorkflowState = {
        "class_input": payload.class_input,
        "model": "gemini-2.5-flash",
        "temperature": 0.3,
        "max_output_tokens": 4096,
    }

    graph = build_profile_workflow()
    final_state = graph.invoke(initial_state)

    review_list: List[Dict[str, Any]] = final_state["class_profile_review"]
    if not review_list:
        raise HTTPException(
            status_code=500,
            detail="class_profile_review is empty from workflow",
        )

    review = review_list[0]
    profile_text = review["text"]  # This is the JSON string from workflow
    
    # Parse the profile JSON to extract metadata
    try:
        profile_json = json.loads(profile_text)

        # Get user-entered design considerations from class_input
        # This preserves exactly what the user entered, including empty fields
        user_design_considerations = payload.class_input.get("design_considerations", {})

        metadata_json = {
            "profile": profile_json.get("profile"),
            "design_consideration": user_design_considerations,  # Store user input only
            "design_rationale": _extract_design_rationale(profile_json),
            "class_input": payload.class_input,  # Store full class_input for reference
        }
    except json.JSONDecodeError:
        metadata_json = None
    
    # Create class profile in database (linked to course)
    class_profile = create_class_profile_db(
        db=db,
        instructor_id=instructor_uuid,
        course_id=course.id,
        title=payload.title,
        description=profile_text,  # Store the full JSON string as description
        metadata_json=metadata_json,
    )
    
    # Create initial version
    version = create_class_profile_version(
        db=db,
        class_profile_id=class_profile.id,
        content=profile_text,
        metadata_json=metadata_json,
        created_by="pipeline",
    )

    # Build frontend profile format
    profile_text = _get_current_profile_text(class_profile, db)
    frontend_profile = _build_frontend_profile(
        profile_text,
        str(class_profile.id),
        db=db,
        course_id=class_profile.course_id,
        metadata_json=metadata_json  # Pass the metadata_json we just created
    )

    return {
        "profile_id": str(class_profile.id),
        "status": "CREATED",
        "profile": frontend_profile,
        "review": profile_to_model(class_profile, db).model_dump(),
        "course_id": str(class_profile.course_id) if class_profile.course_id else None,
        "instructor_id": str(class_profile.instructor_id) if class_profile.instructor_id else None,
    }



@router.get("/class-profiles/{profile_id}", response_model=RunClassProfileResponse)
def get_class_profile(
    profile_id: str,
    course_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get a specific class profile by ID.
    Optionally filter by course_id to verify the profile belongs to the course.
    """
    profile = get_profile_or_404(profile_id, db)

    # If course_id is provided, verify it matches
    if course_id:
        try:
            course_uuid = uuid.UUID(course_id)
            if profile.course_id != course_uuid:
                raise HTTPException(
                    status_code=404,
                    detail=f"Class profile {profile_id} does not belong to course {course_id}"
                )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid course_id format: {course_id}"
            )

    # Refresh profile to get updated data
    db.refresh(profile)

    # Build frontend profile format
    profile_text = _get_current_profile_text(profile, db)
    frontend_profile = _build_frontend_profile(
        profile_text,
        str(profile.id),
        db=db,
        course_id=profile.course_id,
        metadata_json=profile.metadata_json
    )

    return {
        "profile_id": str(profile.id),
        "status": getattr(profile, "status", None) or "OK",
        "profile": frontend_profile,
        "review": profile_to_model(profile, db).model_dump(),
        "course_id": str(profile.course_id) if profile.course_id else None,
        "instructor_id": str(profile.instructor_id) if profile.instructor_id else None,
    }


@router.get("/class-profiles/{profile_id}/debug")
def get_class_profile_debug(
    profile_id: str,
    course_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Debug endpoint to inspect how class_input/basic info are resolved for a profile.
    """
    profile = get_profile_or_404(profile_id, db)

    if course_id:
        try:
            course_uuid = uuid.UUID(course_id)
            if profile.course_id != course_uuid:
                raise HTTPException(
                    status_code=404,
                    detail=f"Class profile {profile_id} does not belong to course {course_id}"
                )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid course_id format: {course_id}"
            )

    current_content = _get_current_profile_text(profile, db)
    parsed_profile = None
    parsed_error = None
    try:
        parsed_profile = json.loads(current_content) if current_content else None
    except Exception as exc:
        parsed_error = str(exc)

    metadata_json = profile.metadata_json if isinstance(profile.metadata_json, dict) else None
    metadata_class_input = (
        metadata_json.get("class_input") if metadata_json else None
    )
    text_class_input = (
        parsed_profile.get("class_input") if isinstance(parsed_profile, dict) else None
    )

    basic_info = None
    basic_info_payload = None
    if profile.course_id:
        basic_info = get_course_basic_info_by_course_id(db, profile.course_id)
        if basic_info:
            basic_info_payload = {
                "discipline_info": basic_info.discipline_info_json or {},
                "course_info": basic_info.course_info_json or {},
                "class_info": basic_info.class_info_json or {},
            }

    class_input_source = None
    if isinstance(metadata_class_input, dict):
        class_input_source = "metadata_json"
    elif isinstance(text_class_input, dict):
        class_input_source = "profile_text"
    elif isinstance(basic_info_payload, dict):
        class_input_source = "course_basic_info"

    return {
        "profile_id": str(profile.id),
        "course_id": str(profile.course_id) if profile.course_id else None,
        "metadata_json_present": bool(metadata_json),
        "metadata_json_keys": list(metadata_json.keys()) if metadata_json else [],
        "metadata_class_input_present": isinstance(metadata_class_input, dict),
        "text_class_input_present": isinstance(text_class_input, dict),
        "course_basic_info_present": basic_info is not None,
        "class_input_source": class_input_source,
        "parsed_profile_present": isinstance(parsed_profile, dict),
        "parsed_profile_error": parsed_error,
        "basic_info_keys": {
            "discipline_info": list((basic_info_payload or {}).get("discipline_info", {}).keys())
            if basic_info_payload else [],
            "course_info": list((basic_info_payload or {}).get("course_info", {}).keys())
            if basic_info_payload else [],
            "class_info": list((basic_info_payload or {}).get("class_info", {}).keys())
            if basic_info_payload else [],
        },
    }


@router.get("/class-profiles/instructor/{instructor_id}", response_model=ClassProfileListResponse)
def get_class_profiles_by_instructor_endpoint(
    instructor_id: str,
    course_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all class profiles for a specific instructor.
    Optionally filter by course_id to get profiles for a specific course.
    """
    # Validate and parse instructor_id
    try:
        instructor_uuid = uuid.UUID(instructor_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid instructor_id format: {instructor_id}",
        )

    # Verify instructor exists
    instructor = get_user_by_id(db, instructor_uuid)
    if not instructor:
        raise HTTPException(
            status_code=404,
            detail=f"Instructor {instructor_id} not found",
        )

    # Get all profiles for this instructor
    profiles = get_class_profiles_by_instructor(db, instructor_uuid)
    
    # Filter by course_id if provided
    if course_id:
        try:
            course_uuid = uuid.UUID(course_id)
            profiles = [p for p in profiles if p.course_id == course_uuid]
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid course_id format: {course_id}"
            )

    # Convert to response format
    profile_models = [profile_to_model(p, db) for p in profiles]

    return ClassProfileListResponse(
        profiles=profile_models,
        total=len(profile_models),
    )


@router.get("/class-profiles/{profile_id}/export", response_model=ExportedClassProfileResponse)
def export_class_profile(
    profile_id: str,
    course_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Export the final class profile JSON.
    Optionally filter by course_id to verify the profile belongs to the course.
    """
    profile = get_profile_or_404(profile_id, db)
    
    # If course_id is provided, verify it matches
    if course_id:
        try:
            course_uuid = uuid.UUID(course_id)
            if profile.course_id != course_uuid:
                raise HTTPException(
                    status_code=404,
                    detail=f"Class profile {profile_id} does not belong to course {course_id}"
                )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid course_id format: {course_id}"
            )

    # Get current version content (source of truth)
    current_content = profile.description
    if profile.current_version_id:
        version = get_class_profile_version_by_id(db, profile.current_version_id)
        if version:
            current_content = version.content

    # Parse the profile JSON
    try:
        profile_json = json.loads(current_content)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Failed to parse class profile JSON",
        )

    return ExportedClassProfileResponse(profile=profile_json)


@router.post("/courses/{course_id}/class-profiles/{profile_id}/approve", response_model=ExportedClassProfileResponse)
def approve_class_profile(
    course_id: str,
    profile_id: str,
    payload: ApproveProfileRequest,
    db: Session = Depends(get_db)
):
    """
    Confirm and save the final class profile.
    If updated_text is provided: create a new version with the updated text first.
    Then return the final confirmed class_profile JSON.
    """
    # Verify course_id matches profile
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")
    
    profile = get_profile_or_404(profile_id, db)
    
    # Verify profile belongs to the course
    if profile.course_id != course_uuid:
        raise HTTPException(
            status_code=404,
            detail=f"Class profile {profile_id} does not belong to course {course_id}"
        )

    if hasattr(payload, 'updated_text') and payload.updated_text is not None:
        # Create a new version with the updated text before confirming
        create_class_profile_version(
            db=db,
            class_profile_id=profile.id,
            content=payload.updated_text,
            created_by=None,  # Could be extracted from auth token
        )
        # Refresh to get the latest profile data after version creation
        db.refresh(profile)

    # Get the current version content (source of truth)
    current_content = profile.description
    if profile.current_version_id:
        version = get_class_profile_version_by_id(db, profile.current_version_id)
        if version:
            current_content = version.content

    # Parse the profile JSON
    try:
        profile_json = json.loads(current_content)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Failed to parse class profile JSON",
        )

    # Return the final confirmed profile
    return ExportedClassProfileResponse(profile=profile_json)


@router.post("/courses/{course_id}/class-profiles/{profile_id}/edit", response_model=RunClassProfileResponse)
def edit_class_profile(
    course_id: str,
    profile_id: str,
    payload: EditProfileRequest,
    db: Session = Depends(get_db)
):
    """
    Manual edit - creates a new version.
    """
    # Verify course_id matches profile
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")
    
    profile = get_profile_or_404(profile_id, db)
    
    # Verify profile belongs to the course
    if profile.course_id != course_uuid:
        raise HTTPException(
            status_code=404,
            detail=f"Class profile {profile_id} does not belong to course {course_id}"
        )
    
    # Parse new text to extract metadata if it's JSON
    try:
        new_json = json.loads(payload.text)
        class_input = new_json.get("class_input") if isinstance(new_json, dict) else None
        user_design_considerations = None
        if isinstance(class_input, dict):
            user_design_considerations = class_input.get("design_considerations")
        if user_design_considerations is None and profile.metadata_json:
            user_design_considerations = profile.metadata_json.get("design_consideration")
        design_rationale = _extract_design_rationale(new_json)
        metadata_json = {
            "profile": new_json.get("profile"),
            "design_consideration": user_design_considerations,
            "design_rationale": design_rationale,
            "class_input": class_input,
        }
    except json.JSONDecodeError:
        metadata_json = None

    # Add course basic info versioning (FIRST - input data)
    class_input = new_json.get("class_input") if new_json else None

    if class_input:
        # Get the basic info record via course_id
        basic_info = get_course_basic_info_by_course_id(db, profile.course_id)

        if basic_info:
            # Extract the three info sections from class_input
            discipline_info = class_input.get("discipline_info")
            course_info = class_input.get("course_info")
            class_info = class_input.get("class_info")

            # Create version with old values and update to new values
            try:
                update_course_basic_info(
                    db=db,
                    basic_info_id=basic_info.id,
                    discipline_info_json=discipline_info,
                    course_info_json=course_info,
                    class_info_json=class_info,
                    change_type="manual_edit",
                    created_by="User",
                )
            except Exception as e:
                # Log but don't fail the request - versioning is supplementary
                print(f"Warning: Failed to create course basic info version: {e}")

    # Create a new class profile version (SECOND - output/generated data)
    create_class_profile_version(
        db=db,
        class_profile_id=profile.id,
        content=payload.text,
        metadata_json=metadata_json,
        created_by="User",  # Could be extracted from auth token
    )

    # Refresh profile to get updated data
    db.refresh(profile)


    profile_text = _get_current_profile_text(profile, db)
    frontend_profile = _build_frontend_profile(
        profile_text,
        str(profile.id),
        db=db,
        course_id=profile.course_id,
        metadata_json=metadata_json
    )

    return {
    "profile_id": str(profile.id),
    "status": getattr(profile, "status", None) or "OK",
    "profile": frontend_profile,
    "review": profile_to_model(profile, db).model_dump(),
    "course_id": str(profile.course_id) if profile.course_id else None,
    "instructor_id": str(profile.instructor_id) if profile.instructor_id else None,
    }


@router.get("/class-profiles/{profile_id}/versions", response_model=ClassProfileVersionsListResponse)
def get_class_profile_versions_list(
    profile_id: str,
    db: Session = Depends(get_db)
):
    """
    Get all versions for a class profile.
    Returns versions ordered by version_number descending (newest first).
    """
    # Validate profile_id
    try:
        profile_uuid = uuid.UUID(profile_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid profile_id format: {profile_id}"
        )

    # Verify profile exists
    profile = get_class_profile_by_id(db, profile_uuid)
    if not profile:
        raise HTTPException(
            status_code=404,
            detail=f"Class profile {profile_id} not found"
        )

    # Get all versions using existing service function
    versions = get_class_profile_versions(db, profile_uuid)

    # Convert to response format
    versions_data = []
    for version in versions:
        version_dict = class_profile_version_to_dict(version)
        versions_data.append(ClassProfileVersionResponse(**version_dict))

    return ClassProfileVersionsListResponse(
        versions=versions_data,
        total=len(versions_data)
    )


def _parse_and_format_profile_json(content: str, error_context: str) -> tuple:
    """
    Parse, validate, and reformat profile JSON.
    Returns (formatted_content, parsed_json).
    """
    try:
        parsed = json.loads(content)
        formatted = json.dumps(parsed, ensure_ascii=False, indent=2)
        return formatted, parsed
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON from {error_context}: {e}")
        raise HTTPException(status_code=500, detail=f"LLM returned invalid JSON ({error_context})")


def _build_metadata_json(
    profile_json: Dict[str, Any],
    class_input: Dict[str, Any],
    design_considerations: Dict[str, Any],
    design_rationale: Optional[Any] = None,
) -> Dict[str, Any]:
    """Build metadata JSON structure for class profile."""
    return {
        "class_id": profile_json.get("class_id"),
        "profile": profile_json.get("profile"),
        "design_consideration": design_considerations,
        "design_rationale": design_rationale,
        "class_input": class_input,
    }


def _handle_full_regeneration(
    payload: LLMRefineProfileRequest,
    profile,
    course_uuid: uuid.UUID,
    db: Session
) -> tuple:
    """
    Handle full regeneration path with new class_input.
    Returns (refined_content, metadata_json).
    """
    # Update course basic info with new data
    discipline_info = payload.class_input.get("discipline_info")
    course_info = payload.class_input.get("course_info")
    class_info = payload.class_input.get("class_info")

    existing_basic_info = get_course_basic_info_by_course_id(db, course_uuid)
    if existing_basic_info:
        update_course_basic_info(
            db=db,
            basic_info_id=existing_basic_info.id,
            discipline_info_json=discipline_info,
            course_info_json=course_info,
            class_info_json=class_info,
            change_type="manual_edit",
            created_by="User",
        )
    else:
        create_course_basic_info(
            db=db,
            course_id=course_uuid,
            discipline_info_json=discipline_info,
            course_info_json=course_info,
            class_info_json=class_info,
        )

    # Run profile generation workflow
    initial_state: ProfileWorkflowState = {
        "class_input": payload.class_input,
        "model": "gemini-2.5-flash",
        "temperature": 0.3,
        "max_output_tokens": 4096,
    }

    graph = build_profile_workflow()
    final_state = graph.invoke(initial_state)

    review_list: List[Dict[str, Any]] = final_state["class_profile_review"]
    if not review_list:
        raise HTTPException(
            status_code=500,
            detail="class_profile_review is empty from workflow",
        )

    review = review_list[0]
    regenerated_content = review["text"]

    # Parse and validate JSON
    refined_content, profile_json = _parse_and_format_profile_json(regenerated_content, "LLM regeneration")

    # Get user-entered design considerations from class_input
    user_design_considerations = payload.class_input.get("design_considerations", {})

    # Build metadata
    metadata_json = _build_metadata_json(
        profile_json,
        payload.class_input,
        user_design_considerations,
        _extract_design_rationale(profile_json),
    )

    return refined_content, metadata_json


def _handle_llm_refinement(
    payload: LLMRefineProfileRequest,
    profile,
    db: Session
) -> tuple:
    """
    Handle LLM refinement path with teacher prompt.
    Returns (refined_content, metadata_json).
    """
    if not payload.prompt:
        raise HTTPException(
            status_code=400,
            detail="Either prompt or class_input must be provided"
        )

    # Get current content
    current_content = profile.description
    if profile.current_version_id:
        version = get_class_profile_version_by_id(db, profile.current_version_id)
        if version:
            current_content = version.content

    # Create a temporary review object for LLM refinement
    temp_review = {
        "id": str(profile.id),
        "text": current_content,
        "status": "pending",
        "history": [],
    }

    state: ProfileWorkflowState = {
        "model": "gemini-2.5-flash",
        "temperature": 0.3,
        "max_output_tokens": 4096,
    }
    llm = make_profile_llm(state)

    # Refine using LLM
    llm_refine_profile(temp_review, payload.prompt, llm)
    raw_content = temp_review["text"]

    # Parse and validate JSON
    refined_content, refined_json = _parse_and_format_profile_json(raw_content, "LLM refinement")

    # Preserve class_input from current version (LLM doesn't modify this)
    current_class_input = None
    if profile.metadata_json and isinstance(profile.metadata_json.get("class_input"), dict):
        current_class_input = profile.metadata_json["class_input"]
    elif profile.course_id:
        # Fallback: query course_basic_info
        basic_info = get_course_basic_info_by_course_id(db, profile.course_id)
        if basic_info:
            current_class_input = {
                "discipline_info": basic_info.discipline_info_json or {},
                "course_info": basic_info.course_info_json or {},
                "class_info": basic_info.class_info_json or {},
            }

    user_design_considerations = None
    if isinstance(current_class_input, dict):
        user_design_considerations = current_class_input.get("design_considerations")
    metadata_json = _build_metadata_json(
        refined_json,
        current_class_input,
        user_design_considerations,
        _extract_design_rationale(refined_json),
    )

    return refined_content, metadata_json


@router.post("/courses/{course_id}/class-profiles/{profile_id}/llm-refine", response_model=RunClassProfileResponse)
def llm_refine_class_profile(
    course_id: str,
    profile_id: str,
    payload: LLMRefineProfileRequest,
    db: Session = Depends(get_db)
):
    """
    Use LLM to refine the profile according to teacher instructions OR regenerate with new class_input.
    - If class_input is provided: Runs full regeneration workflow with updated data
    - If only prompt is provided: Refines existing profile with teacher guidance
    Creates a new version with the refined/regenerated content.
    """
    # Validate inputs upfront
    if not payload.class_input and not payload.prompt:
        raise HTTPException(
            status_code=400,
            detail="Either prompt or class_input must be provided"
        )

    # Verify course_id matches profile
    try:
        course_uuid = uuid.UUID(course_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid course_id format: {course_id}")

    profile = get_profile_or_404(profile_id, db)

    # Verify profile belongs to the course
    if profile.course_id != course_uuid:
        raise HTTPException(
            status_code=404,
            detail=f"Class profile {profile_id} does not belong to course {course_id}"
        )

    # Route to appropriate handler based on input
    if payload.class_input:
        refined_content, metadata_json = _handle_full_regeneration(payload, profile, course_uuid, db)
    else:
        refined_content, metadata_json = _handle_llm_refinement(payload, profile, db)

    # Create a new version with refined/regenerated content
    created_by = "llm_regenerate" if payload.class_input else "llm_refine"
    create_class_profile_version(
        db=db,
        class_profile_id=profile.id,
        content=refined_content,
        metadata_json=metadata_json,
        created_by=created_by,
    )
    
    # Refresh profile to get updated data
    db.refresh(profile)

    profile_text = _get_current_profile_text(profile, db)
    frontend_profile = _build_frontend_profile(
        profile_text,
        str(profile.id),
        db=db,
        course_id=profile.course_id,
        metadata_json=profile.metadata_json  # Use refreshed profile metadata
    )

    return {
    "profile_id": str(profile.id),
    "status": getattr(profile, "status", None) or "OK",
    "profile": frontend_profile,
    "review": profile_to_model(profile, db).model_dump(),
    "course_id": str(profile.course_id) if profile.course_id else None,
    "instructor_id": str(profile.instructor_id) if profile.instructor_id else None,
    }
