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
from app.models.models import AnnotationHighlightCoords, ScaffoldAnnotation
from app.api.models import (
    PerusallAnnotationRequest,
    PerusallAnnotationResponse,
    PerusallAnnotationItem,
)

router = APIRouter()

# Perusall environment variables
PERUSALL_BASE_URL = "https://app.perusall.com/api/v1"

X_INSTITUTION = os.getenv("PERUSALL_INSTITUTION")
X_API_TOKEN = os.getenv("PERUSALL_API_TOKEN")
COURSE_ID = os.getenv("PERUSALL_COURSE_ID")
ASSIGNMENT_ID = os.getenv("PERUSALL_ASSIGNMENT_ID")
DOCUMENT_ID = os.getenv("PERUSALL_DOCUMENT_ID")
USER_ID = os.getenv("PERUSALL_USER_ID")


@router.post("/perusall/annotations", response_model=PerusallAnnotationResponse)
def post_annotations_to_perusall(
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
    # Check for missing environment variables
    missing_vars = []
    if not X_INSTITUTION:
        missing_vars.append("PERUSALL_INSTITUTION")
    if not X_API_TOKEN:
        missing_vars.append("PERUSALL_API_TOKEN")
    if not COURSE_ID:
        missing_vars.append("PERUSALL_COURSE_ID")
    if not ASSIGNMENT_ID:
        missing_vars.append("PERUSALL_ASSIGNMENT_ID")
    if not DOCUMENT_ID:
        missing_vars.append("PERUSALL_DOCUMENT_ID")
    if not USER_ID:
        missing_vars.append("PERUSALL_USER_ID")
    
    if missing_vars:
        raise HTTPException(
            status_code=500,
            detail=f"Perusall API environment variables are missing: {', '.join(missing_vars)}. Please configure these in your .env file."
        )

    # If annotation_ids provided, fetch highlight_coords from database
    annotations_to_post = []
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
                
                if not annotation.current_version_id:
                    print(f"[post_annotations_to_perusall] Annotation {annotation_id_str} has no current_version_id")
                    continue
                
                # Get all highlight_coords for this annotation version
                coords_list = db.query(AnnotationHighlightCoords).filter(
                    AnnotationHighlightCoords.annotation_version_id == annotation.current_version_id,
                    AnnotationHighlightCoords.valid == True
                ).all()
                
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
                    "documentId": DOCUMENT_ID,
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

                url = f"{PERUSALL_BASE_URL}/courses/{COURSE_ID}/assignments/{ASSIGNMENT_ID}/annotations"

                try:
                    response = session.post(url, data=payload, headers=headers, timeout=30)
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
                    if hasattr(e, "response") and e.response is not None:
                        try:
                            response_text = e.response.text
                        except:
                            pass
                        if e.response.status_code:
                            error_msg = f"HTTP {e.response.status_code}: {error_msg}"
                    
                    errors.append({
                        "index": idx,
                        "error": error_msg,
                        "response": response_text,
                        "payload": payload
                    })
                    print(f"[post_annotations_to_perusall] Error posting annotation {idx}: {error_msg}")
                    if response_text:
                        print(f"[post_annotations_to_perusall] Response: {response_text}")
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
