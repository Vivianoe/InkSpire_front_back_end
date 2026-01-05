"""
Perusall service layer for managing user Perusall credentials and API integration
Handles credential storage, validation, course fetching, and course import
"""
import uuid
import logging
import requests
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from app.models.models import UserPerusallCredentials
from app.services.course_service import create_course

# Setup logging
logger = logging.getLogger(__name__)

# Perusall API configuration
PERUSALL_BASE_URL = "https://app.perusall.com/api/v1"
PERUSALL_API_TIMEOUT = 30  # seconds


# ======================================================
# Credential Management Functions
# ======================================================

def save_user_perusall_credentials(
    db: Session,
    user_id: uuid.UUID,
    institution_id: str,
    api_token: str,
    is_validated: bool = False,
) -> UserPerusallCredentials:
    """
    Create or update user Perusall credentials
    Uses UNIQUE constraint on user_id (one credential per user)

    Args:
        db: Database session
        user_id: User UUID
        institution_id: Perusall institution ID
        api_token: Perusall API token
        is_validated: Whether credentials have been validated

    Returns:
        UserPerusallCredentials object
    """
    # Check if credentials already exist for this user
    existing = get_user_perusall_credentials(db, user_id)

    if existing:
        # Update existing credentials
        existing.institution_id = institution_id.strip()
        existing.api_token = api_token.strip()
        existing.is_validated = is_validated

        db.commit()
        db.refresh(existing)
        return existing
    else:
        # Create new credentials
        credentials = UserPerusallCredentials(
            id=uuid.uuid4(),
            user_id=user_id,
            institution_id=institution_id.strip(),
            api_token=api_token.strip(),
            is_validated=is_validated,
        )

        db.add(credentials)
        db.commit()
        db.refresh(credentials)
        return credentials


def get_user_perusall_credentials(
    db: Session,
    user_id: uuid.UUID,
) -> Optional[UserPerusallCredentials]:
    """
    Get user Perusall credentials by user_id

    Args:
        db: Database session
        user_id: User UUID

    Returns:
        UserPerusallCredentials object or None if not found
    """
    return db.query(UserPerusallCredentials).filter(
        UserPerusallCredentials.user_id == user_id
    ).first()


def delete_user_perusall_credentials(
    db: Session,
    user_id: uuid.UUID,
) -> bool:
    """
    Delete user Perusall credentials

    Args:
        db: Database session
        user_id: User UUID

    Returns:
        True if deleted successfully

    Raises:
        ValueError: If credentials not found
    """
    credentials = get_user_perusall_credentials(db, user_id)
    if not credentials:
        raise ValueError(f"Perusall credentials not found for user {user_id}")

    db.delete(credentials)
    db.commit()
    return True


# ======================================================
# Perusall API Integration Functions
# ======================================================

def validate_credential_format(institution_id: str, api_token: str) -> tuple[bool, str]:
    """
    Validate credential format before making API calls

    Args:
        institution_id: Perusall institution ID
        api_token: Perusall API token

    Returns:
        (is_valid, error_message) tuple
    """
    # Check institution ID
    if not institution_id or not institution_id.strip():
        return False, "Institution ID cannot be empty"
    if len(institution_id.strip()) < 2:
        return False, "Institution ID is too short (minimum 2 characters)"
    if not institution_id.replace('-', '').replace('_', '').isalnum():
        return False, "Institution ID contains invalid characters (use only letters, numbers, hyphens, underscores)"

    # Check API token
    if not api_token or not api_token.strip():
        return False, "API Token cannot be empty"
    if len(api_token.strip()) < 10:
        return False, "API Token is too short (minimum 10 characters)"

    return True, ""


def validate_perusall_credentials(
    institution_id: str,
    api_token: str,
) -> bool:
    """
    Validate Perusall credentials by testing API access
    Calls GET /api/v1/courses to verify authentication

    Args:
        institution_id: Perusall institution ID
        api_token: Perusall API token

    Returns:
        True if credentials are valid, False if authentication fails

    Raises:
        Exception: For network errors, timeouts, or unexpected API responses
    """
    # Validate format first
    is_valid, error_msg = validate_credential_format(institution_id, api_token)
    if not is_valid:
        raise Exception(f"Invalid credential format: {error_msg}")

    url = f"{PERUSALL_BASE_URL}/courses"
    headers = {
        "X-Institution": institution_id,
        "X-API-Token": api_token,
        "Accept": "application/json",
    }

    try:
        response = requests.get(url, headers=headers, timeout=PERUSALL_API_TIMEOUT)

        # Success - credentials are valid
        if response.status_code == 200:
            return True

        # Authentication failure (401 or 403)
        if response.status_code in [401, 403]:
            return False

        # Other error - raise exception with details
        response.raise_for_status()
        return True  # Should not reach here, but just in case

    except requests.exceptions.Timeout:
        raise Exception(f"Perusall API timeout after {PERUSALL_API_TIMEOUT} seconds")
    except requests.exceptions.ConnectionError as e:
        raise Exception(f"Failed to connect to Perusall API: {str(e)}")
    except requests.exceptions.RequestException as e:
        # For non-auth errors, raise with details
        if hasattr(e, "response") and e.response is not None:
            raise Exception(f"Perusall API error (HTTP {e.response.status_code}): {e.response.text[:200]}")
        raise Exception(f"Perusall API request failed: {str(e)}")


def fetch_perusall_courses(
    institution_id: str,
    api_token: str,
) -> List[Dict[str, str]]:
    """
    Fetch list of courses from Perusall API

    Args:
        institution_id: Perusall institution ID
        api_token: Perusall API token

    Returns:
        List of course dicts: [{"_id": str, "name": str}, ...]

    Raises:
        Exception: For API errors, network issues, or invalid responses
    """
    url = f"{PERUSALL_BASE_URL}/courses"
    headers = {
        "X-Institution": institution_id,
        "X-API-Token": api_token,
        "Accept": "application/json",
    }

    try:
        response = requests.get(url, headers=headers, timeout=PERUSALL_API_TIMEOUT)

        # Log response details for debugging
        logger.info(
            f"[fetch_perusall_courses] Perusall API response: "
            f"Status={response.status_code}, "
            f"Content-Type={response.headers.get('Content-Type', 'unknown')}, "
            f"Content-Length={len(response.text)} chars"
        )

        # Check for authentication errors FIRST (before parsing)
        if response.status_code == 401:
            logger.warning(f"[fetch_perusall_courses] Authentication failed (401)")
            raise Exception("Invalid Perusall credentials: Institution ID or API Token is incorrect")

        if response.status_code == 403:
            logger.warning(f"[fetch_perusall_courses] Access forbidden (403)")
            raise Exception("Perusall access forbidden: API Token may have expired or been revoked")

        # Check for other HTTP errors
        if response.status_code != 200:
            response_preview = response.text[:200] if response.text else "(empty response)"
            logger.warning(f"[fetch_perusall_courses] HTTP error {response.status_code}. Response: {response_preview}")
            raise Exception(f"Perusall API error (HTTP {response.status_code}): {response_preview}")

        # Check response has content
        if not response.text or not response.text.strip():
            logger.error(f"[fetch_perusall_courses] Empty response from Perusall API")
            raise Exception("Perusall API returned empty response. The API may be experiencing issues.")

        # Check content-type header
        content_type = response.headers.get('Content-Type', '')
        if 'application/json' not in content_type:
            response_preview = response.text[:200]
            logger.error(f"[fetch_perusall_courses] Non-JSON response. Content-Type: {content_type}, Preview: {response_preview}")
            raise Exception(
                f"Perusall API returned non-JSON response (Content-Type: {content_type}). "
                f"Preview: {response_preview}"
            )

        # NOW safe to parse JSON
        try:
            courses_data = response.json()
        except ValueError as e:
            response_preview = response.text[:200]
            logger.error(f"[fetch_perusall_courses] JSON parse error. Response: {response_preview}")
            raise Exception(
                f"Failed to parse Perusall API response as JSON. "
                f"Response preview: {response_preview}. Error: {str(e)}"
            )

        # Validate response format
        if not isinstance(courses_data, list):
            raise Exception(f"Unexpected Perusall API response format. Expected list, got {type(courses_data)}")

        # Extract _id and name from each course
        courses = []
        for course in courses_data:
            if not isinstance(course, dict):
                continue

            course_id = course.get("_id") or course.get("id")
            course_name = course.get("name") or course.get("title")

            if course_id and course_name:
                courses.append({
                    "_id": str(course_id),
                    "name": str(course_name),
                })

        logger.info(f"[fetch_perusall_courses] Successfully fetched {len(courses)} courses")
        return courses

    except requests.exceptions.Timeout:
        raise Exception(f"Perusall API timeout after {PERUSALL_API_TIMEOUT} seconds")
    except requests.exceptions.ConnectionError as e:
        raise Exception(f"Failed to connect to Perusall API: {str(e)}")
    except requests.exceptions.RequestException as e:
        raise Exception(f"Perusall API request failed: {str(e)}")


# ======================================================
# Course Import Function
# ======================================================

def import_perusall_courses(
    db: Session,
    user_id: uuid.UUID,
    perusall_courses: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    """
    Import Perusall courses as Inkspire Course records

    Args:
        db: Database session
        user_id: Instructor user UUID
        perusall_courses: List of Perusall course dicts with "_id" and "name" keys

    Returns:
        List of import results: [
            {
                "perusall_course_id": str,
                "inkspire_course_id": str,
                "title": str,
            },
            ...
        ]

    Raises:
        ValueError: For invalid input or course creation errors
    """
    if not perusall_courses:
        raise ValueError("No courses provided for import")

    imported_courses = []

    for perusall_course in perusall_courses:
        # Validate course data
        perusall_course_id = perusall_course.get("_id")
        course_name = perusall_course.get("name")

        if not perusall_course_id or not course_name:
            # Skip invalid courses
            continue

        # Create Inkspire course
        try:
            course = create_course(
                db=db,
                instructor_id=user_id,
                title=course_name,
                perusall_course_id=perusall_course_id,
                description=f"Imported from Perusall",
            )

            imported_courses.append({
                "perusall_course_id": str(perusall_course_id),
                "inkspire_course_id": str(course.id),
                "title": course.title,
            })
        except Exception as e:
            # Log error but continue with other courses
            print(f"[import_perusall_courses] Failed to import course '{course_name}': {str(e)}")
            continue

    return imported_courses


# ======================================================
# Helper Functions
# ======================================================

def credentials_to_dict(credentials: UserPerusallCredentials) -> Dict[str, Any]:
    """
    Convert UserPerusallCredentials model to dictionary
    Security: Excludes api_token from response

    Args:
        credentials: UserPerusallCredentials object

    Returns:
        Dictionary with credential info (excluding api_token)
    """
    return {
        "id": str(credentials.id),
        "user_id": str(credentials.user_id),
        "institution_id": credentials.institution_id,
        # SECURITY: Do not include api_token in response
        "is_validated": credentials.is_validated,
        "created_at": credentials.created_at.isoformat() if credentials.created_at else None,
        "updated_at": credentials.updated_at.isoformat() if credentials.updated_at else None,
    }
