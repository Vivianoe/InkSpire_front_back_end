import os
import requests
from typing import List, Dict, Any

# ==== LOAD ALL CONFIG FROM ENVIRONMENT VARIABLES ====
X_INSTITUTION = os.getenv("PERUSALL_INSTITUTION")
X_API_TOKEN = os.getenv("PERUSALL_API_TOKEN")
COURSE_ID = os.getenv("PERUSALL_COURSE_ID")
ASSIGNMENT_ID = os.getenv("PERUSALL_ASSIGNMENT_ID")
DOCUMENT_ID = os.getenv("PERUSALL_DOCUMENT_ID")
USER_ID = os.getenv("PERUSALL_USER_ID")

REQUIRED_ENV_VARS = {
    "PERUSALL_INSTITUTION": X_INSTITUTION,
    "PERUSALL_API_TOKEN": X_API_TOKEN,
    "PERUSALL_COURSE_ID": COURSE_ID,
    "PERUSALL_ASSIGNMENT_ID": ASSIGNMENT_ID,
    "PERUSALL_DOCUMENT_ID": DOCUMENT_ID,
    "PERUSALL_USER_ID": USER_ID,
}

missing = [name for name, value in REQUIRED_ENV_VARS.items() if not value]
if missing:
    raise EnvironmentError(f"Missing required environment variables: {', '.join(missing)}")

PERUSALL_BASE_URL = "https://app.perusall.com/legacy-api"


def build_comment_text(item: Dict[str, Any]) -> str:
    """Generate the HTML body for the comment."""
    return f"<p>{item.get('fragment', '')}</p>"


def post_single_comment(session: requests.Session, item: Dict[str, Any]) -> str:
    """Post a single annotation to Perusall from one highlight item dict."""
    url = f"{PERUSALL_BASE_URL}/courses/{COURSE_ID}/assignments/{ASSIGNMENT_ID}/annotations"

    payload = {
        "documentId": DOCUMENT_ID,
        "userId": USER_ID,
        "positionStartX": item["positionStartX"],
        "positionStartY": item["positionStartY"],
        "positionEndX": item["positionEndX"],
        "positionEndY": item["positionEndY"],
        "rangeType": item["rangeType"],
        "rangePage": item["rangePage"],
        "rangeStart": item["rangeStart"],
        "rangeEnd": item["rangeEnd"],
        "fragment": item["fragment"],
        "text": build_comment_text(item),
    }

    headers = {
        "X-Institution": X_INSTITUTION,
        "X-API-Token": X_API_TOKEN,
    }

    response = session.post(url, data=payload, headers=headers)
    response.raise_for_status()

    data = response.json()
    annotation_id = data[0].get("id")
    if not annotation_id:
        raise ValueError(f"Unexpected response: {data}")

    return annotation_id


def post_multiple_comments(items: List[Dict[str, Any]]) -> List[str]:
    """Loop through all highlight items and upload them one-by-one."""
    annotation_ids = []
    with requests.Session() as session:
        for idx, item in enumerate(items, start=1):
            try:
                ann_id = post_single_comment(session, item)
                print(f"[{idx}/{len(items)}] Posted annotation id={ann_id}")
                annotation_ids.append(ann_id)
            except Exception as e:
                print(f"Error posting item {idx}: {e}")
    return annotation_ids
