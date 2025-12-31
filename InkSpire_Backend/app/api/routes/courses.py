"""
Course management endpoints
"""
import uuid
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.course_service import (
    get_course_by_id,
    get_courses_by_instructor,
    get_course_basic_info_by_course_id,
    update_course_basic_info,
    course_to_dict,
)
from app.services.class_profile_service import get_class_profile_by_course_id
from app.api.models import (
    EditBasicInfoRequest,
    EditDesignConsiderationsRequest,
    CourseListResponse,
    CourseSummaryModel,
)

router = APIRouter()

@router.get("/courses/instructor/{instructor_id}", response_model=CourseListResponse)
def get_courses_by_instructor_endpoint(instructor_id: str, db: Session = Depends(get_db)):
    """
    Get all courses for a specific instructor, including linked class_profile_id if exists.
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
    from app.services.user_service import get_user_by_id
    instructor = get_user_by_id(db, instructor_uuid)
    if not instructor:
        raise HTTPException(
            status_code=404,
            detail=f"Instructor {instructor_id} not found",
        )

    courses = get_courses_by_instructor(db, instructor_uuid)
    items: List[CourseSummaryModel] = []

    for course in courses:
        course_dict = course_to_dict(course)
        # Find linked class profile for this course, if any
        profile = get_class_profile_by_course_id(db, course.id)
        items.append(
            CourseSummaryModel(
                id=course_dict["id"],
                title=course_dict["title"],
                course_code=course_dict.get("course_code"),
                description=course_dict.get("description"),
                perusall_course_id=course_dict.get("perusall_course_id"),
                class_profile_id=str(profile.id) if profile else None,
            )
        )

    return CourseListResponse(courses=items, total=len(items))


@router.post("/basic_info/edit")
def edit_basic_info(payload: EditBasicInfoRequest, db: Session = Depends(get_db)):
    """
    Edit course basic info (discipline_info_json, course_info_json, class_info_json).
    Creates a new version record.
    """
    try:
        course_uuid = uuid.UUID(payload.course_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid course_id format: {payload.course_id}",
        )
    
    # Get course basic info
    basic_info = get_course_basic_info_by_course_id(db, course_uuid)
    if not basic_info:
        raise HTTPException(
            status_code=404,
            detail=f"Course basic info not found for course {payload.course_id}",
        )
    
    # Update basic info (creates a new version)
    updated_basic_info = update_course_basic_info(
        db=db,
        basic_info_id=basic_info.id,
        discipline_info_json=payload.discipline_info_json,
        course_info_json=payload.course_info_json,
        class_info_json=payload.class_info_json,
        change_type="manual_edit",
        created_by="User",  # Could be extracted from auth token in the future
    )
    
    return {
        "message": "Course basic info updated successfully",
        "course_id": str(payload.course_id),
    }


@router.post("/design-considerations/edit")
def edit_design_considerations(payload: EditDesignConsiderationsRequest, db: Session = Depends(get_db)):
    """
    Edit design_consideration in the class profile.
    Updates the class_profile JSON in database and creates a new version.
    """
    try:
        course_uuid = uuid.UUID(payload.course_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid course_id format: {payload.course_id}",
        )

    # Find class profile by course_id using database query
    profile = get_class_profile_by_course_id(db, course_uuid)
    if not profile:
        raise HTTPException(
            status_code=404,
            detail=f"Class profile not found for course {payload.course_id}",
        )
    
    # Get current content
    from app.services.class_profile_service import (
        get_class_profile_version_by_id,
        create_class_profile_version,
        profile_to_dict,
    )
    
    current_content = profile.description
    if profile.current_version_id:
        version = get_class_profile_version_by_id(db, profile.current_version_id)
        if version:
            current_content = version.content
    
    # Parse and update the class profile JSON
    try:
        profile_json = json.loads(current_content)
        profile_json["design_consideration"] = payload.design_consideration
        updated_text = json.dumps(profile_json, ensure_ascii=False, indent=2)
        
        # Extract metadata
        metadata_json = {
            "class_id": profile_json.get("class_id"),
            "profile": profile_json.get("profile"),
            "design_consideration": profile_json.get("design_consideration"),
        }
        
        # Create a new version
        create_class_profile_version(
            db=db,
            class_profile_id=profile.id,
            content=updated_text,
            metadata_json=metadata_json,
            created_by=None,  # Could be extracted from auth token
        )
        
        # Refresh profile
        db.refresh(profile)
        
        return {
            "success": True,
            "review": profile_to_dict(profile),
        }
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse class profile JSON: {e}",
        )
