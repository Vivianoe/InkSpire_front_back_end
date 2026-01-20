"""
Database service layer for scaffold annotation operations
Handles all database interactions for scaffold annotations and versions
"""
import uuid
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.models import ScaffoldAnnotation, ScaffoldAnnotationVersion, AnnotationHighlightCoords


def _copy_highlight_coords_to_new_version(
    db: Session,
    from_version_id: Optional[uuid.UUID],
    to_version_id: uuid.UUID,
) -> int:
    if not from_version_id:
        return 0

    coords_list = db.query(AnnotationHighlightCoords).filter(
        AnnotationHighlightCoords.annotation_version_id == from_version_id,
        AnnotationHighlightCoords.valid == True,
    ).all()

    if not coords_list:
        return 0

    created = 0
    for coord in coords_list:
        cloned = AnnotationHighlightCoords(
            id=uuid.uuid4(),
            annotation_version_id=to_version_id,
            range_type=coord.range_type,
            range_page=coord.range_page,
            range_start=coord.range_start,
            range_end=coord.range_end,
            fragment=coord.fragment,
            position_start_x=coord.position_start_x,
            position_start_y=coord.position_start_y,
            position_end_x=coord.position_end_x,
            position_end_y=coord.position_end_y,
            valid=True,
        )
        db.add(cloned)
        created += 1

    return created


def create_scaffold_annotation(
    db: Session,
    session_id: uuid.UUID,
    reading_id: uuid.UUID,
    generation_id: Optional[uuid.UUID],
    highlight_text: str,
    current_content: str,
    start_offset: Optional[int] = None,
    end_offset: Optional[int] = None,
    page_number: Optional[int] = None,
    status: str = "draft",
) -> ScaffoldAnnotation:
    """
    Create a new scaffold annotation and its initial version
    """
    # Create annotation
    annotation = ScaffoldAnnotation(
        id=uuid.uuid4(),
        session_id=session_id,
        reading_id=reading_id,
        generation_id=generation_id,
        highlight_text=highlight_text,
        current_content=current_content,
        start_offset=start_offset,
        end_offset=end_offset,
        page_number=page_number,
        status=status,
    )
    
    # Create initial version
    version = ScaffoldAnnotationVersion(
        id=uuid.uuid4(),
        annotation_id=annotation.id,
        version_number=1,
        content=current_content,
        change_type="pipeline",
        created_by="pipeline",
    )
    
    annotation.current_version_id = version.id
    annotation.versions.append(version)
    
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    
    return annotation


def get_scaffold_annotation(db: Session, annotation_id: uuid.UUID) -> Optional[ScaffoldAnnotation]:
    """
    Get a scaffold annotation by ID
    """
    return db.query(ScaffoldAnnotation).filter(ScaffoldAnnotation.id == annotation_id).first()


def get_scaffold_annotations_by_session(
    db: Session,
    session_id: uuid.UUID
) -> List[ScaffoldAnnotation]:
    """
    Get all scaffold annotations for a session
    """
    return db.query(ScaffoldAnnotation).filter(
        ScaffoldAnnotation.session_id == session_id
    ).all()


def get_scaffold_annotations_by_reading(
    db: Session,
    reading_id: uuid.UUID
) -> List[ScaffoldAnnotation]:
    """
    Get all scaffold annotations for a reading
    """
    return db.query(ScaffoldAnnotation).filter(
        ScaffoldAnnotation.reading_id == reading_id
    ).all()


def update_scaffold_annotation_status(
    db: Session,
    annotation_id: uuid.UUID,
    status: str,
    change_type: str,
    created_by: Optional[str] = None,
) -> ScaffoldAnnotation:
    """
    Update annotation status and create a version record
    """
    annotation = get_scaffold_annotation(db, annotation_id)
    if not annotation:
        raise ValueError(f"Annotation {annotation_id} not found")

    previous_version_id = annotation.current_version_id
    
    # Get current version number
    max_version = db.query(ScaffoldAnnotationVersion).filter(
        ScaffoldAnnotationVersion.annotation_id == annotation_id
    ).order_by(ScaffoldAnnotationVersion.version_number.desc()).first()
    
    next_version = (max_version.version_number + 1) if max_version else 1
    
    # Create new version
    version = ScaffoldAnnotationVersion(
        id=uuid.uuid4(),
        annotation_id=annotation_id,
        version_number=next_version,
        content=annotation.current_content,
        change_type=change_type,
        created_by=created_by or "system",
    )
    
    annotation.status = status
    annotation.current_version_id = version.id
    annotation.versions.append(version)

    _copy_highlight_coords_to_new_version(db, previous_version_id, version.id)
    
    db.add(version)
    db.commit()
    db.refresh(annotation)
    
    return annotation


def update_scaffold_annotation_content(
    db: Session,
    annotation_id: uuid.UUID,
    new_content: str,
    change_type: str,
    created_by: Optional[str] = None,
) -> ScaffoldAnnotation:
    """
    Update annotation content and create a version record
    """
    annotation = get_scaffold_annotation(db, annotation_id)
    if not annotation:
        raise ValueError(f"Annotation {annotation_id} not found")

    previous_version_id = annotation.current_version_id
    
    old_content = annotation.current_content
    
    # Get current version number
    max_version = db.query(ScaffoldAnnotationVersion).filter(
        ScaffoldAnnotationVersion.annotation_id == annotation_id
    ).order_by(ScaffoldAnnotationVersion.version_number.desc()).first()
    
    next_version = (max_version.version_number + 1) if max_version else 1
    
    # Create new version
    version = ScaffoldAnnotationVersion(
        id=uuid.uuid4(),
        annotation_id=annotation_id,
        version_number=next_version,
        content=new_content,
        change_type=change_type,
        created_by=created_by or "system",
    )
    
    annotation.current_content = new_content
    annotation.current_version_id = version.id
    annotation.versions.append(version)

    _copy_highlight_coords_to_new_version(db, previous_version_id, version.id)
    
    db.add(version)
    db.commit()
    db.refresh(annotation)
    
    return annotation


def get_annotation_versions(
    db: Session,
    annotation_id: uuid.UUID
) -> List[ScaffoldAnnotationVersion]:
    """
    Get all versions for an annotation, ordered by version number
    """
    return db.query(ScaffoldAnnotationVersion).filter(
        ScaffoldAnnotationVersion.annotation_id == annotation_id
    ).order_by(ScaffoldAnnotationVersion.version_number.asc()).all()


def get_approved_annotations(
    db: Session,
    reading_id: Optional[uuid.UUID] = None,
    session_id: Optional[uuid.UUID] = None,
) -> List[ScaffoldAnnotation]:
    """
    Get all approved annotations, optionally filtered by reading_id or session_id
    """
    query = db.query(ScaffoldAnnotation).filter(
        ScaffoldAnnotation.status == "accepted"
    )
    
    if reading_id:
        query = query.filter(ScaffoldAnnotation.reading_id == reading_id)
    
    if session_id:
        query = query.filter(ScaffoldAnnotation.session_id == session_id)
    
    return query.all()


def scaffold_to_dict(annotation: ScaffoldAnnotation) -> Dict[str, Any]:
    """
    Convert ScaffoldAnnotation model to dictionary format compatible with existing code
    Returns minimal fields (id, fragment, text) for workflow responses
    """
    return {
        "id": str(annotation.id),
        "fragment": annotation.highlight_text,
        "text": annotation.current_content,
    }


def scaffold_to_dict_with_status_and_history(annotation: ScaffoldAnnotation) -> Dict[str, Any]:
    """
    Convert ScaffoldAnnotation model to dictionary format with status and history
    Used when frontend needs full scaffold information
    """
    # Map database status to API status format
    status_map = {
        "draft": "pending",
        "accepted": "approved",
        "rejected": "rejected",
    }
    api_status = status_map.get(annotation.status, annotation.status)
    
    # Build history with old_text from previous version
    history = []
    versions = sorted(annotation.versions, key=lambda v: v.version_number)
    for i, version in enumerate(versions):
        old_text = None
        if i > 0:
            old_text = versions[i - 1].content
        
        action = _map_change_type_to_action(version.change_type)
        # Ensure action is valid for HistoryEntryModel
        valid_actions = ["init", "approve", "reject", "manual_edit", "llm_refine"]
        if action not in valid_actions:
            print(f"WARNING: Invalid action '{action}' mapped from change_type '{version.change_type}', defaulting to 'init'")
            action = "init"
        
        history_entry = {
            "ts": float(version.created_at.timestamp()) if version.created_at else 0.0,
            "action": action,
            "prompt": None,
            "old_text": old_text,
            "new_text": version.content,
        }
        
        # Add prompt for LLM edits if available (would need to store in version table)
        if version.change_type == "llm_edit":
            history_entry["prompt"] = "LLM refinement"
        
        history.append(history_entry)
    
    return {
        "id": str(annotation.id),
        "fragment": annotation.highlight_text,
        "text": annotation.current_content,
        "status": api_status,
        "history": history,
    }


def _map_change_type_to_action(change_type: str) -> str:
    """
    Map database change_type to history action format
    """
    mapping = {
        "pipeline": "init",
        "manual_edit": "manual_edit",
        "llm_edit": "llm_refine",
        "accept": "approve",
        "reject": "reject",
        "revert": "revert",
    }
    return mapping.get(change_type, "unknown")
