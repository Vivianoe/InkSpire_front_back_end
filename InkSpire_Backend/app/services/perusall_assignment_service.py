"""
Perusall assignment service layer
Handles upsert operations for Perusall assignments
"""
import uuid
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.models import PerusallAssignment
from app.services.session_reading_service import rederive_session_readings_for_session


def upsert_perusall_assignment(
    db: Session,
    perusall_course_id: str,
    perusall_assignment_id: str,
    name: str,
    document_ids: Optional[List[str]] = None,
    parts: Optional[List[Dict[str, Any]]] = None,
    order_index: Optional[int] = None,
) -> PerusallAssignment:
    """
    Upsert a Perusall assignment.
    Creates if not exists, updates if exists and metadata has changed.
    Keyed by (perusall_course_id, perusall_assignment_id).
    """
    # Check if assignment already exists
    existing = db.query(PerusallAssignment).filter(
        and_(
            PerusallAssignment.perusall_course_id == perusall_course_id,
            PerusallAssignment.perusall_assignment_id == perusall_assignment_id
        )
    ).first()
    
    if existing:
        # Check if metadata has changed
        needs_update = False
        
        if existing.name != name:
            existing.name = name
            needs_update = True

        if order_index is not None and existing.order_index != order_index:
            existing.order_index = order_index
            needs_update = True
        
        # Compare document_ids
        existing_doc_ids = existing.document_ids if existing.document_ids else []
        new_doc_ids = document_ids if document_ids else []
        if sorted(existing_doc_ids) != sorted(new_doc_ids):
            existing.document_ids = new_doc_ids
            needs_update = True
        
        # Compare parts (convert to comparable format)
        existing_parts = existing.parts if existing.parts else []
        new_parts = parts if parts else []
        # Normalize parts for comparison (sort by documentId)
        existing_parts_sorted = sorted(
            existing_parts,
            key=lambda p: p.get("documentId", "")
        ) if isinstance(existing_parts, list) else []
        new_parts_sorted = sorted(
            new_parts,
            key=lambda p: p.get("documentId", "")
        ) if isinstance(new_parts, list) else []
        
        if existing_parts_sorted != new_parts_sorted:
            existing.parts = new_parts
            needs_update = True
        
        if needs_update:
            db.commit()
            db.refresh(existing)

            # If this assignment is linked to sessions, rebuild structural session_readings.
            # Note: missing PDFs will not create rows; UI should use expected_readings for visibility.
            for session in existing.sessions or []:
                rederive_session_readings_for_session(db, session.id)
        
        return existing
    else:
        # Create new assignment
        assignment = PerusallAssignment(
            id=uuid.uuid4(),
            perusall_course_id=perusall_course_id,
            perusall_assignment_id=perusall_assignment_id,
            name=name,
            document_ids=document_ids if document_ids else [],
            parts=parts if parts else [],
            order_index=order_index,
        )
        
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        
        return assignment


def get_perusall_assignment_by_ids(
    db: Session,
    perusall_course_id: str,
    perusall_assignment_id: str,
) -> Optional[PerusallAssignment]:
    """
    Get a Perusall assignment by perusall_course_id and perusall_assignment_id.
    """
    return db.query(PerusallAssignment).filter(
        and_(
            PerusallAssignment.perusall_course_id == perusall_course_id,
            PerusallAssignment.perusall_assignment_id == perusall_assignment_id
        )
    ).first()


def get_perusall_assignment_by_id(
    db: Session,
    assignment_id: uuid.UUID,
) -> Optional[PerusallAssignment]:
    """
    Get a Perusall assignment by its UUID.
    """
    return db.query(PerusallAssignment).filter(
        PerusallAssignment.id == assignment_id
    ).first()


def get_perusall_assignments_by_course(
    db: Session,
    perusall_course_id: str,
) -> List[PerusallAssignment]:
    """
    Get all Perusall assignments for a course.
    """
    return db.query(PerusallAssignment).filter(
        PerusallAssignment.perusall_course_id == perusall_course_id
    ).order_by(
        PerusallAssignment.order_index.asc(),
        PerusallAssignment.created_at.asc(),
    ).all()
