"""
Class profile management endpoints
"""
import uuid
import json
from typing import Any, List, Dict
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
)
from app.services.course_service import (
    create_course,
    create_course_basic_info,
    update_course,
    update_course_basic_info,
    get_course_basic_info_by_course_id,
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
    ReviewedProfileModel,
    HistoryEntryModel,
)

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


def _build_frontend_profile(profile_text: str, profile_id: str) -> Dict[str, Any]:
    """
    Build the ClassProfile shape expected by /class-profile/[id]/view.
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

    if not profile_text:
        return result

    try:
        parsed = json.loads(profile_text)
        if isinstance(parsed, dict):
            if isinstance(parsed.get("profile"), str):
                result["generatedProfile"] = parsed.get("profile") or ""
            elif isinstance(parsed.get("text"), str):
                result["generatedProfile"] = parsed.get("text") or ""
            else:
                result["generatedProfile"] = profile_text

            dc = parsed.get("design_consideration") or parsed.get("design_considerations")
            if isinstance(dc, dict):
                result["designConsiderations"] = dc

            class_input = parsed.get("class_input")
            if isinstance(class_input, dict):
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
                    }

                dc2 = class_input.get("design_considerations")
                if isinstance(dc2, dict) and not result["designConsiderations"]:
                    result["designConsiderations"] = dc2

            return result
    except Exception:
        pass

    result["generatedProfile"] = profile_text
    return result


@router.post("/class-profiles")
def create_class_profile(payload: RunClassProfileRequest, db: Session = Depends(get_db)):
    """
    Generate a draft class profile and wrap it in a HITL review object.
    Saves course information to database before generating profile.
    """
    # Validate and parse instructor_id
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
    
    # Create course in database
    course = create_course(
        db=db,
        instructor_id=instructor_uuid,
        title=payload.title,
        course_code=payload.course_code,
        description=payload.description,
    )
    
    # Create course basic info in database
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
        metadata_json = {
            "profile": profile_json.get("profile"),
            "design_consideration": profile_json.get("design_consideration"),
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
    frontend_profile = _build_frontend_profile(profile_text, str(class_profile.id))

    return {
        "profile_id": str(class_profile.id),
        "status": "CREATED",
        "profile": frontend_profile,
        "review": profile_to_model(class_profile, db).model_dump(),
        "course_id": str(class_profile.course_id) if class_profile.course_id else None,
        "instructor_id": str(class_profile.instructor_id) if class_profile.instructor_id else None,
    }



@router.get("/class-profiles/{profile_id}")
def get_class_profile(profile_id: str, db: Session = Depends(get_db)):
    """Get a specific class profile by ID"""
    profile = get_profile_or_404(profile_id, db)
    
    profile_text = _get_current_profile_text(profile, db)
    frontend_profile = _build_frontend_profile(profile_text, str(profile.id))

    return {
    "profile_id": str(profile.id),
    "status": getattr(profile, "status", None) or "OK",
    "profile": frontend_profile,
    "review": profile_to_model(profile, db).model_dump(),
    "course_id": str(profile.course_id) if profile.course_id else None,
    "instructor_id": str(profile.instructor_id) if profile.instructor_id else None,
    }


@router.put("/class-profiles/{profile_id}")
def update_class_profile_endpoint(profile_id: str, payload: UpdateClassProfileRequest, db: Session = Depends(get_db)):
    """
    Update an existing class profile.
    Updates course information, course basic info, and creates a new profile version if generated_profile changed.
    """
    profile = get_profile_or_404(profile_id, db)
    
    # Validate instructor_id
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
    
    # Update course if profile has a course_id
    if profile.course_id:
        update_course(
            db=db,
            course_id=profile.course_id,
            title=payload.title,
            course_code=payload.course_code,
            description=payload.description,
        )
        
        # Update course basic info if it exists
        basic_info = get_course_basic_info_by_course_id(db, profile.course_id)
        if basic_info:
            discipline_info = payload.class_input.get("discipline_info")
            course_info = payload.class_input.get("course_info")
            class_info = payload.class_input.get("class_info")
            
            update_course_basic_info(
                db=db,
                basic_info_id=basic_info.id,
                discipline_info_json=discipline_info,
                course_info_json=course_info,
                class_info_json=class_info,
                change_type="manual_edit",
                created_by="User",
            )
    
    # Build the full profile JSON if generated_profile is provided
    profile_content = None
    if payload.generated_profile:
        # Build the complete profile JSON structure
        profile_json = {
            "class_input": payload.class_input,
            "profile": payload.generated_profile,
            "design_consideration": payload.class_input.get("design_considerations", {}),
        }
        profile_content = json.dumps(profile_json)
    else:
        # If no generated_profile, get current content and update class_input
        current_content = _get_current_profile_text(profile, db)
        try:
            current_json = json.loads(current_content) if current_content else {}
            current_json["class_input"] = payload.class_input
            profile_content = json.dumps(current_json)
        except json.JSONDecodeError:
            # If current content is not valid JSON, create new structure
            profile_json = {
                "class_input": payload.class_input,
                "profile": current_content or "",
                "design_consideration": payload.class_input.get("design_considerations", {}),
            }
            profile_content = json.dumps(profile_json)
    
    # Create a new version if content changed
    if profile_content:
        # Parse to extract metadata
        try:
            profile_json = json.loads(profile_content)
            metadata_json = {
                "profile": profile_json.get("profile"),
                "design_consideration": profile_json.get("design_consideration"),
            }
        except json.JSONDecodeError:
            metadata_json = None
        
        # Create new version
        create_class_profile_version(
            db=db,
            class_profile_id=profile.id,
            content=profile_content,
            metadata_json=metadata_json,
            created_by="User",
        )
    
    # Update class profile basic info
    update_class_profile(
        db=db,
        profile_id=profile.id,
        title=payload.title,
        description=profile_content or payload.description,
    )
    
    # Refresh profile to get updated data
    db.refresh(profile)
    
    # Build frontend profile format
    profile_text = _get_current_profile_text(profile, db)
    frontend_profile = _build_frontend_profile(profile_text, str(profile.id))
    
    return {
        "profile_id": str(profile.id),
        "status": getattr(profile, "status", None) or "OK",
        "profile": frontend_profile,
        "review": profile_to_model(profile, db).model_dump(),
        "course_id": str(profile.course_id) if profile.course_id else None,
        "instructor_id": str(profile.instructor_id) if profile.instructor_id else None,
    }


@router.get("/class-profiles/instructor/{instructor_id}", response_model=ClassProfileListResponse)
def get_class_profiles_by_instructor_endpoint(instructor_id: str, db: Session = Depends(get_db)):
    """Get all class profiles for a specific instructor"""
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

    # Convert to response format
    profile_models = [profile_to_model(p, db) for p in profiles]

    return ClassProfileListResponse(
        profiles=profile_models,
        total=len(profile_models),
    )


@router.get("/class-profiles/{profile_id}/export", response_model=ExportedClassProfileResponse)
def export_class_profile(profile_id: str, db: Session = Depends(get_db)):
    """Export the final class profile JSON"""
    profile = get_profile_or_404(profile_id, db)

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


@router.post("/class-profiles/{profile_id}/approve", response_model=ExportedClassProfileResponse)
def approve_class_profile(profile_id: str, payload: ApproveProfileRequest, db: Session = Depends(get_db)):
    """
    Confirm and save the final class profile.
    If updated_text is provided: create a new version with the updated text first.
    Then return the final confirmed class_profile JSON.
    """
    profile = get_profile_or_404(profile_id, db)

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


@router.post("/class-profiles/{profile_id}/edit", response_model=RunClassProfileResponse)
def edit_class_profile(profile_id: str, payload: EditProfileRequest, db: Session = Depends(get_db)):
    """Manual edit - creates a new version."""
    profile = get_profile_or_404(profile_id, db)
    
    # Parse new text to extract metadata if it's JSON
    try:
        new_json = json.loads(payload.text)
        metadata_json = {
            "profile": new_json.get("profile"),
            "design_consideration": new_json.get("design_consideration"),
        }
    except json.JSONDecodeError:
        metadata_json = None
    
    # Create a new version
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
    frontend_profile = _build_frontend_profile(profile_text, str(profile.id))

    return {
    "profile_id": str(profile.id),
    "status": getattr(profile, "status", None) or "OK",
    "profile": frontend_profile,
    "review": profile_to_model(profile, db).model_dump(),
    "course_id": str(profile.course_id) if profile.course_id else None,
    "instructor_id": str(profile.instructor_id) if profile.instructor_id else None,
    }


@router.post("/class-profiles/{profile_id}/llm-refine")
def llm_refine_class_profile(profile_id: str, payload: LLMRefineProfileRequest, db: Session = Depends(get_db)):
    """
    Use LLM to refine the profile according to teacher instructions.
    Creates a new version with the refined content.
    """
    profile = get_profile_or_404(profile_id, db)
    
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
    refined_content = temp_review["text"]
    
    # Parse refined content to extract metadata
    try:
        refined_json = json.loads(refined_content)
        metadata_json = {
            "class_id": refined_json.get("class_id"),
            "profile": refined_json.get("profile"),
            "design_consideration": refined_json.get("design_consideration"),
        }
    except json.JSONDecodeError:
        metadata_json = None
    
    # Create a new version with refined content
    create_class_profile_version(
        db=db,
        class_profile_id=profile.id,
        content=refined_content,
        metadata_json=metadata_json,
        created_by="llm_refine",
    )
    
    # Refresh profile
    db.refresh(profile)
    
    
    profile_text = _get_current_profile_text(profile, db)
    frontend_profile = _build_frontend_profile(profile_text, str(profile.id))

    return {
    "profile_id": str(profile.id),
    "status": getattr(profile, "status", None) or "OK",
    "profile": frontend_profile,
    "review": profile_to_model(profile, db).model_dump(),
    "course_id": str(profile.course_id) if profile.course_id else None,
    "instructor_id": str(profile.instructor_id) if profile.instructor_id else None,
    }