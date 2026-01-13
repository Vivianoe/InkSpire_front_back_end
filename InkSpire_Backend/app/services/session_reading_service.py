"""SessionReading service layer

SessionReadings are structural, assignment-derived join rows:
- Each row references a Perusall assignment (FK) and represents a reading used in a session.
- perusall_document_id and assigned_pages are projections of perusall_assignments.parts.

Queries must only return active rows whose reading is not soft-deleted.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError

from app.models.models import PerusallAssignment, Reading, Session as SessionModel, SessionReading


def get_active_session_readings(db: Session, session_id: uuid.UUID) -> List[SessionReading]:
    try:
        return (
            db.query(SessionReading)
            .join(Reading, Reading.id == SessionReading.reading_id)
            .filter(
                SessionReading.session_id == session_id,
                SessionReading.is_active.is_(True),
                Reading.deleted_at.is_(None),
            )
            .order_by(SessionReading.position)
            .all()
        )
    except ProgrammingError as e:
        # Backward compatibility: DB may not yet have readings.deleted_at
        if "deleted_at" in str(e):
            return (
                db.query(SessionReading)
                .filter(
                    SessionReading.session_id == session_id,
                    SessionReading.is_active.is_(True),
                )
                .order_by(SessionReading.position)
                .all()
            )
        raise


def deactivate_session_readings_for_reading(db: Session, reading_id: uuid.UUID) -> int:
    rows = (
        db.query(SessionReading)
        .filter(SessionReading.reading_id == reading_id, SessionReading.is_active.is_(True))
        .all()
    )
    for r in rows:
        r.is_active = False
    db.commit()
    return len(rows)


def _coerce_int(v: Any) -> Optional[int]:
    try:
        if v is None:
            return None
        return int(v)
    except Exception:
        return None


def rederive_session_readings_for_session(db: Session, session_id: uuid.UUID) -> List[SessionReading]:
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise ValueError(f"Session {session_id} not found")

    if not session.perusall_assignment_id:
        raise ValueError(f"Session {session_id} does not have perusall_assignment_id")

    assignment = (
        db.query(PerusallAssignment)
        .filter(PerusallAssignment.id == session.perusall_assignment_id)
        .first()
    )
    if not assignment:
        raise ValueError(f"Perusall assignment {session.perusall_assignment_id} not found")

    parts = assignment.parts or []
    if not isinstance(parts, list):
        parts = []

    # Delete existing session_readings (structural, derived)
    db.query(SessionReading).filter(SessionReading.session_id == session_id).delete()
    db.commit()

    created: List[SessionReading] = []

    # If assignment has explicit parts, use them for ordering and page ranges.
    if parts:
        for idx, part in enumerate(parts):
            if not isinstance(part, dict):
                continue

            perusall_document_id = part.get("documentId")
            if not perusall_document_id:
                continue

            reading = (
                db.query(Reading)
                .filter(
                    Reading.course_id == session.course_id,
                    Reading.perusall_reading_id == str(perusall_document_id),
                )
                .first()
            )

            # If PDF not uploaded yet, we still keep the structural row, but it cannot reference a missing reading.
            # Requirement: rows depend on readings (PDFs). For now, only create rows when a local Reading exists.
            if not reading:
                continue

            assigned_pages = {
                "start_page": _coerce_int(part.get("startPage")),
                "end_page": _coerce_int(part.get("endPage")),
            }

            sr = SessionReading(
                id=uuid.uuid4(),
                session_id=session_id,
                reading_id=reading.id,
                perusall_assignment_id=assignment.id,
                perusall_document_id=str(perusall_document_id),
                assigned_pages=assigned_pages,
                position=idx,
                is_active=True,
                added_at=datetime.now(timezone.utc),
            )
            db.add(sr)
            created.append(sr)

        db.commit()
        for sr in created:
            db.refresh(sr)
        return created

    # Fallback: if no parts, try document_ids as ordering.
    doc_ids = assignment.document_ids or []
    if not isinstance(doc_ids, list):
        doc_ids = []

    for idx, doc_id in enumerate(doc_ids):
        if not doc_id:
            continue
        reading = (
            db.query(Reading)
            .filter(
                Reading.course_id == session.course_id,
                Reading.perusall_reading_id == str(doc_id),
            )
            .first()
        )
        if not reading:
            continue
        sr = SessionReading(
            id=uuid.uuid4(),
            session_id=session_id,
            reading_id=reading.id,
            perusall_assignment_id=assignment.id,
            perusall_document_id=str(doc_id),
            assigned_pages=None,
            position=idx,
            is_active=True,
            added_at=datetime.now(timezone.utc),
        )
        db.add(sr)
        created.append(sr)

    db.commit()
    for sr in created:
        db.refresh(sr)
    return created


def get_expected_session_readings(db: Session, session_id: uuid.UUID) -> List[Dict[str, Any]]:
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise ValueError(f"Session {session_id} not found")

    if not session.perusall_assignment_id:
        return []

    assignment = (
        db.query(PerusallAssignment)
        .filter(PerusallAssignment.id == session.perusall_assignment_id)
        .first()
    )
    if not assignment:
        return []

    parts = assignment.parts or []
    if not isinstance(parts, list):
        parts = []

    expected: List[Dict[str, Any]] = []
    for idx, part in enumerate(parts):
        if not isinstance(part, dict):
            continue

        perusall_document_id = part.get("documentId")
        if not perusall_document_id:
            continue

        try:
            reading = (
                db.query(Reading)
                .filter(
                    Reading.course_id == session.course_id,
                    Reading.perusall_reading_id == str(perusall_document_id),
                    Reading.deleted_at.is_(None),
                )
                .first()
            )
        except ProgrammingError as e:
            if "deleted_at" in str(e):
                reading = (
                    db.query(Reading)
                    .filter(
                        Reading.course_id == session.course_id,
                        Reading.perusall_reading_id == str(perusall_document_id),
                    )
                    .first()
                )
            else:
                raise

        assigned_pages = {
            "start_page": _coerce_int(part.get("startPage")),
            "end_page": _coerce_int(part.get("endPage")),
        }

        expected.append(
            {
                "position": idx,
                "perusall_document_id": str(perusall_document_id),
                "assigned_pages": assigned_pages,
                "is_uploaded": reading is not None,
                "local_reading_id": str(reading.id) if reading else None,
                "local_reading_title": reading.title if reading else None,
            }
        )

    return expected
