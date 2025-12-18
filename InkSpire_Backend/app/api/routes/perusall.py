"""
Perusall integration endpoints
"""
import os
import requests
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
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
def post_annotations_to_perusall(req: PerusallAnnotationRequest):
    """
    Upload multiple annotations into Perusall.
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

    created_ids = []
    errors = []

    try:
        with requests.Session() as session:
            headers = {
                "X-Institution": X_INSTITUTION,
                "X-API-Token": X_API_TOKEN,
            }

            for idx, item in enumerate(req.annotations):
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
                    if isinstance(data, list) and len(data) > 0:
                        ann_id = data[0].get("id")
                        if ann_id:
                            created_ids.append(ann_id)
                        else:
                            errors.append({
                                "index": idx,
                                "error": f"Unexpected response format: {data}",
                                "payload": payload
                            })
                    else:
                        errors.append({
                            "index": idx,
                            "error": f"Unexpected response format: {data}",
                            "payload": payload
                        })

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
