"""
Pydantic models for API request/response validation
"""
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict

# ======================================================
# Shared Models
# ======================================================

class HistoryEntryModel(BaseModel):
    ts: float
    action: Literal["init", "approve", "reject", "manual_edit", "llm_refine"]
    prompt: Optional[str] = None
    old_text: Optional[str] = None
    new_text: Optional[str] = None


class ReviewedScaffoldModel(BaseModel):
    id: str
    fragment: str
    text: str


class ReviewedScaffoldModelWithStatusAndHistory(BaseModel):
    id: str
    fragment: str
    text: str
    status: Literal["pending", "approved", "rejected", "edit_pending", "draft"]
    history: List[HistoryEntryModel]


class ReviewedProfileModel(BaseModel):
    id: str
    text: str
    status: Literal["pending", "approved", "rejected"]
    history: List[HistoryEntryModel]


# ======================================================
# User Models
# ======================================================

class UserRegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    role: Literal["instructor", "admin"] = "instructor"


class UserLoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    supabase_user_id: str
    email: str
    name: str
    role: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class LoginResponse(BaseModel):
    user: UserResponse
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    message: str = "Login successful"


class PublicUserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: Optional[str] = None


# ======================================================
# Class Profile Models
# ======================================================

class RunClassProfileRequest(BaseModel):
    instructor_id: str
    # course_id: str
    title: str
    course_code: Optional[str] = None
    perusall_course_id: Optional[str] = None
    description: str
    class_input: Dict[str, Any]


class UpdateClassProfileRequest(BaseModel):
    instructor_id: str
    title: str
    course_code: str
    description: str
    class_input: Dict[str, Any]
    generated_profile: Optional[str] = None  # Optional, for updating the profile content


class RunClassProfileResponse(BaseModel):
    profile: Optional[Dict[str, Any]] = None  # Complete profile with all basic info (disciplineInfo, courseInfo, classInfo)
    review: ReviewedProfileModel
    course_id: Optional[str] = None  # Course ID associated with this profile
    instructor_id: Optional[str] = None  # Instructor ID associated with this profile
    profile_id: Optional[str] = None  # Profile ID
    status: Optional[str] = None  # Status (e.g., "CREATED", "OK")


class ApproveProfileRequest(BaseModel):
    pass


class EditProfileRequest(BaseModel):
    text: str


class LLMRefineProfileRequest(BaseModel):
    prompt: Optional[str] = None
    class_input: Optional[Dict[str, Any]] = None


class ExportedClassProfileResponse(BaseModel):
    profile: Dict[str, Any]


class ClassProfileListResponse(BaseModel):
    profiles: List[Dict[str, Any]]


class ClassProfileVersionResponse(BaseModel):
    id: str
    class_profile_id: str
    version_number: int
    content: str
    metadata_json: Optional[Dict[str, Any]] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None


class ClassProfileVersionsListResponse(BaseModel):
    versions: List[ClassProfileVersionResponse]
    total: int


# ======================================================
# Course Models
# ======================================================

class CourseSummaryModel(BaseModel):
    id: str
    title: str
    perusall_course_id: Optional[str] = None
    description: Optional[str] = None
    class_profile_id: Optional[str] = None


class CourseListResponse(BaseModel):
    courses: List[CourseSummaryModel]


class EditBasicInfoRequest(BaseModel):
    course_id: str
    discipline_info_json: Optional[Dict[str, Any]] = None
    course_info_json: Optional[Dict[str, Any]] = None
    class_info_json: Optional[Dict[str, Any]] = None


class EditDesignConsiderationsRequest(BaseModel):
    course_id: str
    design_consideration: str  # JSON string of design_consideration


# ======================================================
# Reading Models
# ======================================================

class ReadingUploadItem(BaseModel):
    title: str
    perusall_reading_id: Optional[str] = None
    file_path: Optional[str] = None  # Optional for uploaded readings (will be generated)
    source_type: str = "uploaded"
    content_base64: Optional[str] = None  # Base64 encoded PDF content for uploaded readings
    original_filename: Optional[str] = None  # Original filename for uploaded readings


class BatchUploadReadingsRequest(BaseModel):
    instructor_id: str
    course_id: Optional[str] = None
    readings: List[ReadingUploadItem]


class CreateReadingFromStorageRequest(BaseModel):
    instructor_id: str
    title: str
    file_path: str
    perusall_reading_id: Optional[str] = None
    source_type: str = "uploaded"


class ReadingResponse(BaseModel):
    id: str
    title: str
    perusall_reading_id: Optional[str] = None
    file_path: str
    source_type: str
    course_id: Optional[str] = None
    instructor_id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class BatchUploadReadingsResponse(BaseModel):
    success: bool
    created_count: int
    readings: List[ReadingResponse]
    errors: List[Dict[str, Any]]


class CreateReadingFromStorageResponse(BaseModel):
    success: bool
    reading: ReadingResponse


class CreateReadingSignedUploadUrlRequest(BaseModel):
    filename: str
    content_type: str = "application/pdf"


class CreateReadingSignedUploadUrlResponse(BaseModel):
    success: bool
    file_path: str
    signed_url: str
    token: str


class ReadingContentResponse(BaseModel):
    id: str
    mime_type: str = "application/pdf"
    size_label: Optional[str] = None
    content_base64: str


class ReadingListResponse(BaseModel):
    readings: List[ReadingResponse]


# ======================================================
# Scaffold Models
# ======================================================

class ReadingScaffoldsRequest(BaseModel):
    session_id: str
    reading_id: str
    course_id: Optional[str] = None  # Optional course_id for filtering/verification
    generation_id: Optional[str] = None  # UUID for grouping a single generation
    scaffold_count: Optional[int] = None
    class_profile: Dict[str, Any]
    reading_chunks: Dict[str, Any]
    reading_info: Dict[str, Any]


class GenerateScaffoldsRequest(BaseModel):
    instructor_id: str  # UUID as string
    scaffold_count: Optional[int] = None
    # course_id, session_id, and reading_id are now path parameters, not in request body

# return value of reading-scaffolds endpoint
class ReadingScaffoldsResponse(BaseModel):
    annotation_scaffolds_review: List[ReviewedScaffoldModel]
    session_id: Optional[str] = None
    reading_id: Optional[str] = None
    pdf_url: Optional[str] = None

# need to add the GenerateScaffoldsResponse model
class GenerateScaffoldsResponse(BaseModel):
    annotation_scaffolds_review: List[ReviewedScaffoldModelWithStatusAndHistory]
    session_id: Optional[str] = None
    reading_id: Optional[str] = None
    pdf_url: Optional[str] = None


class EditScaffoldRequest(BaseModel):
    new_text: str


class LLMRefineScaffoldRequest(BaseModel):
    prompt: str


class ScaffoldResponse(BaseModel):
    scaffold: ReviewedScaffoldModelWithStatusAndHistory


class ExportedScaffold(BaseModel):
    id: str
    fragment: str
    text: str


class ExportedScaffoldsResponse(BaseModel):
    annotation_scaffolds: List[ExportedScaffold]


class ThreadReviewAction(BaseModel):
    item_id: str
    action: Literal["approve", "reject", "llm_refine"]
    data: Optional[Dict[str, Any]] = None


class ThreadReviewRequest(BaseModel):
    thread_id: Optional[str] = None
    decision: Optional[Literal["approve", "reject", "edit"]] = None
    edit_prompt: Optional[str] = None
    actions: Optional[List[ThreadReviewAction]] = None


# ======================================================
# Perusall Models
# ======================================================

class PerusallAnnotationItem(BaseModel):
    positionStartX: float
    positionStartY: float
    positionEndX: float
    positionEndY: float
    rangeType: str
    rangePage: int
    rangeStart: int
    rangeEnd: int
    fragment: str
    text: Optional[str] = None


class PerusallAnnotationRequest(BaseModel):
    session_id: Optional[str] = None
    annotation_ids: Optional[List[str]] = None  # If provided, fetch highlight_coords from database
    annotations: Optional[List[PerusallAnnotationItem]] = None  # If annotation_ids not provided, use these directly
    perusall_user_id: Optional[str] = None  # Optional Perusall user ID to post as
    idempotency_key: Optional[str] = None


class PerusallAnnotationResponse(BaseModel):
    success: bool
    created_ids: List[str]
    errors: List[Dict[str, Any]]


class PerusallAnnotationStatusRequest(BaseModel):
    session_id: Optional[str] = None
    annotation_ids: List[str]
    perusall_user_id: Optional[str] = None


class PerusallAnnotationStatusItem(BaseModel):
    annotation_id: str
    status: str  # pending | posted


class PerusallAnnotationStatusResponse(BaseModel):
    items: List[PerusallAnnotationStatusItem]


class PerusallMappingRequest(BaseModel):
    course_id: str  # UUID as string
    reading_id: str  # UUID as string
    perusall_course_id: str  # Perusall course ID
    perusall_assignment_id: str  # Perusall assignment ID
    perusall_document_id: str  # Perusall document ID


class PerusallMappingResponse(BaseModel):
    success: bool
    mapping_id: str
    course_title: str
    reading_title: str
    perusall_course_id: str
    perusall_assignment_id: str
    perusall_document_id: str


class PerusallUserItem(BaseModel):
    id: str
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display: Optional[str] = None


class PerusallUsersResponse(BaseModel):
    users: List[PerusallUserItem]
    default_user_id: Optional[str] = None


# ======================================================
# Highlight Coordinates Models
# ======================================================

class HighlightCoordsItem(BaseModel):
    annotation_version_id: Optional[str] = None
    annotation_id: Optional[str] = None  # Frontend can provide annotation_id, backend will find current_version_id
    rangeType: str
    rangePage: int
    rangeStart: int
    rangeEnd: int
    fragment: str
    positionStartX: float
    positionStartY: float
    positionEndX: float
    positionEndY: float
    session_id: Optional[str] = None


class HighlightReportRequest(BaseModel):
    coords: List[HighlightCoordsItem]


class HighlightReportResponse(BaseModel):
    success: bool
    created_count: int
    errors: List[Dict[str, Any]]


# ========================================
# Perusall Integration Models
# ========================================

# Perusall Authentication
class PerusallAuthRequest(BaseModel):
    institution_id: str
    api_token: str

class PerusallAuthResponse(BaseModel):
    success: bool
    message: str
    user_id: Optional[str] = None


# Perusall Courses
class PerusallCourseItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(alias="_id")  # Perusall course ID - serializes as "_id"
    name: str  # Course name

class PerusallCoursesResponse(BaseModel):
    success: bool
    courses: List[PerusallCourseItem]


# Perusall Course Import
class PerusallImportRequest(BaseModel):
    course_ids: List[str]

class ImportedCourse(BaseModel):
    perusall_course_id: str
    inkspire_course_id: str
    title: str

class PerusallImportResponse(BaseModel):
    success: bool
    imported_courses: List[ImportedCourse]
    message: Optional[str] = None


# Perusall Course Library (Readings)
class PerusallReadingItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, by_alias=True)
    
    id: str = Field(alias="_id")  # Perusall reading/document ID
    name: str  # Reading name/title


class PerusallLibraryReadingStatus(BaseModel):
    """Status of a Perusall reading in the local database"""
    perusall_reading_id: str
    perusall_reading_name: str
    is_uploaded: bool
    local_reading_id: Optional[str] = None  # Local reading UUID if uploaded
    local_reading_title: Optional[str] = None


class PerusallLibraryResponse(BaseModel):
    success: bool
    perusall_course_id: str
    readings: List[PerusallLibraryReadingStatus]
    message: Optional[str] = None


# Perusall Assignments
class PerusallAssignmentPart(BaseModel):
    documentId: str
    startPage: Optional[int] = None
    endPage: Optional[int] = None


class PerusallAssignmentItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, by_alias=True)
    
    id: str = Field(alias="_id")  # Perusall assignment ID
    name: str  # Assignment name/title
    documentIds: Optional[List[str]] = None  # List of document IDs
    parts: Optional[List[PerusallAssignmentPart]] = None  # List of parts with documentId, startPage, endPage
    deadline: Optional[str] = None
    assignTo: Optional[str] = None
    documents: Optional[List[Dict[str, str]]] = None  # Legacy field for backward compatibility
    has_session: Optional[bool] = False  # Whether this assignment already has a session


class PerusallAssignmentsResponse(BaseModel):
    success: bool
    perusall_course_id: str
    assignments: List[PerusallAssignmentItem]
    message: Optional[str] = None


# Assignment Reading Status
class AssignmentReadingStatus(BaseModel):
    """Status of a reading in an assignment"""
    perusall_document_id: str
    perusall_document_name: Optional[str] = None
    is_uploaded: bool
    local_reading_id: Optional[str] = None  # Local reading UUID if uploaded
    local_reading_title: Optional[str] = None
    start_page: Optional[int] = None
    end_page: Optional[int] = None


class AssignmentReadingsResponse(BaseModel):
    success: bool
    assignment_id: str
    assignment_name: str
    readings: List[AssignmentReadingStatus]
    message: Optional[str] = None
