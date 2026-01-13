"""
Class profile service layer for class profile management
Handles class profile creation, updates, and version management
"""
import uuid
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.models import ClassProfile, ClassProfileVersion


def create_class_profile(
    db: Session,
    instructor_id: uuid.UUID,
    course_id: uuid.UUID,
    title: str,
    description: str,
    metadata_json: Optional[Dict[str, Any]] = None,
) -> ClassProfile:
    """
    Create a new class profile
    """
    class_profile = ClassProfile(
        id=uuid.uuid4(),
        instructor_id=instructor_id,
        course_id=course_id,
        title=title.strip(),
        description=description.strip(),
        metadata_json=metadata_json,
    )
    
    db.add(class_profile)
    db.commit()
    db.refresh(class_profile)
    
    return class_profile


def get_class_profile_by_id(db: Session, profile_id: uuid.UUID) -> Optional[ClassProfile]:
    """
    Get class profile by ID
    """
    return db.query(ClassProfile).filter(ClassProfile.id == profile_id).first()


def get_class_profiles_by_instructor(db: Session, instructor_id: uuid.UUID) -> List[ClassProfile]:
    """
    Get all class profiles for an instructor
    """
    return db.query(ClassProfile).filter(ClassProfile.instructor_id == instructor_id).order_by(desc(ClassProfile.created_at)).all()


def get_class_profile_by_course_id(db: Session, course_id: uuid.UUID) -> Optional[ClassProfile]:
    """
    Get class profile by course ID
    """
    return db.query(ClassProfile).filter(ClassProfile.course_id == course_id).first()


def update_class_profile(
    db: Session,
    profile_id: uuid.UUID,
    title: Optional[str] = None,
    description: Optional[str] = None,
    metadata_json: Optional[Dict[str, Any]] = None,
) -> ClassProfile:
    """
    Update class profile information
    """
    profile = get_class_profile_by_id(db, profile_id)
    if not profile:
        raise ValueError(f"Class profile {profile_id} not found")
    
    if title is not None:
        profile.title = title.strip()
    if description is not None:
        profile.description = description.strip()
    if metadata_json is not None:
        profile.metadata_json = metadata_json
    
    db.commit()
    db.refresh(profile)
    
    return profile


def delete_class_profile(db: Session, profile_id: uuid.UUID) -> bool:
    """
    Delete a class profile and all related versions
    """
    profile = get_class_profile_by_id(db, profile_id)
    if not profile:
        raise ValueError(f"Class profile {profile_id} not found")
    
    db.delete(profile)
    db.commit()
    
    return True


def create_class_profile_version(
    db: Session,
    class_profile_id: uuid.UUID,
    content: str,
    metadata_json: Optional[Dict[str, Any]] = None,
    created_by: Optional[str] = None,
) -> ClassProfileVersion:
    """
    Create a new version of class profile
    """
    # Get current max version number
    max_version = db.query(ClassProfileVersion).filter(
        ClassProfileVersion.class_profile_id == class_profile_id
    ).order_by(desc(ClassProfileVersion.version_number)).first()
    
    next_version = (max_version.version_number + 1) if max_version else 1
    
    version = ClassProfileVersion(
        id=uuid.uuid4(),
        class_profile_id=class_profile_id,
        version_number=next_version,
        content=content.strip(),
        metadata_json=metadata_json,
        created_by=created_by or "pipeline",
    )
    
    db.add(version)
    db.commit()
    db.refresh(version)
    
    # Update class profile to point to this version
    profile = get_class_profile_by_id(db, class_profile_id)
    if profile:
        profile.current_version_id = version.id
        profile.description = content.strip()  # Update current description
        profile.metadata_json = metadata_json  # Sync with version's metadata
        db.commit()
        db.refresh(profile)
    
    return version


def get_class_profile_versions(
    db: Session,
    class_profile_id: uuid.UUID,
) -> List[ClassProfileVersion]:
    """
    Get all versions for a class profile
    """
    return db.query(ClassProfileVersion).filter(
        ClassProfileVersion.class_profile_id == class_profile_id
    ).order_by(desc(ClassProfileVersion.version_number)).all()


def get_class_profile_version_by_id(
    db: Session,
    version_id: uuid.UUID,
) -> Optional[ClassProfileVersion]:
    """
    Get a specific version by ID
    """
    return db.query(ClassProfileVersion).filter(ClassProfileVersion.id == version_id).first()


def set_current_version(
    db: Session,
    profile_id: uuid.UUID,
    version_id: uuid.UUID,
) -> ClassProfile:
    """
    Set a specific version as the current active version
    """
    profile = get_class_profile_by_id(db, profile_id)
    if not profile:
        raise ValueError(f"Class profile {profile_id} not found")
    
    # Verify version exists and belongs to this profile
    version = get_class_profile_version_by_id(db, version_id)
    if not version or version.class_profile_id != profile_id:
        raise ValueError(f"Version {version_id} not found or does not belong to profile {profile_id}")
    
    profile.current_version_id = version_id
    profile.description = version.content  # Update description to match version
    db.commit()
    db.refresh(profile)
    
    return profile


def class_profile_to_dict(profile: ClassProfile) -> Dict[str, Any]:
    """
    Convert ClassProfile model to dictionary
    """
    return {
        "id": str(profile.id),
        "instructor_id": str(profile.instructor_id),
        "course_id": str(profile.course_id),
        "title": profile.title,
        "description": profile.description,
        "metadata_json": profile.metadata_json,
        "current_version_id": str(profile.current_version_id) if profile.current_version_id else None,
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


def class_profile_version_to_dict(version: ClassProfileVersion) -> Dict[str, Any]:
    """
    Convert ClassProfileVersion model to dictionary
    """
    return {
        "id": str(version.id),
        "class_profile_id": str(version.class_profile_id),
        "version_number": version.version_number,
        "content": version.content,
        "metadata_json": version.metadata_json,
        "created_by": version.created_by,
        "created_at": version.created_at.isoformat() if version.created_at else None,
    }

