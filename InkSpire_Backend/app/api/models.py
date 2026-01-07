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
    access_token: str
    refresh_token: str
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
    course_id: str
    title: str
    perusall_course_id: Optional[str] = None
    description: str
    class_input: Dict[str, Any]


class RunClassProfileResponse(BaseModel):
    review: ReviewedProfileModel
    course_id: Optional[str] = None  # Course ID associated with this profile
    instructor_id: Optional[str] = None  # Instructor ID associated with this profile


class ApproveProfileRequest(BaseModel):
    pass


class EditProfileRequest(BaseModel):
    text: str


class LLMRefineProfileRequest(BaseModel):
    prompt: str


class ExportedClassProfileResponse(BaseModel):
    profile: Dict[str, Any]


class ClassProfileListResponse(BaseModel):
    profiles: List[Dict[str, Any]]


# ======================================================
# Course Models
# ======================================================

class CourseSummaryModel(BaseModel):
    id: str
    title: str
    perusall_course_id: Optional[str] = None
    description: str
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
    file_path: str
    source_type: str = "uploaded"


class BatchUploadReadingsRequest(BaseModel):
    instructor_id: str
    course_id: Optional[str] = None
    readings: List[ReadingUploadItem]


class ReadingResponse(BaseModel):
    id: str
    title: str
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


class ReadingListResponse(BaseModel):
    readings: List[ReadingResponse]


# ======================================================
# Scaffold Models
# ======================================================

class ReadingScaffoldsRequest(BaseModel):
    session_id: str
    reading_id: str
    class_profile: Dict[str, Any]
    reading_chunks: Dict[str, Any]
    reading_info: Dict[str, Any]


class GenerateScaffoldsRequest(BaseModel):
    instructor_id: str  # UUID as string
    course_id: str  # UUID as string
    session_id: Optional[str] = None  # UUID as string, optional - will create new session if not provided
    reading_id: str  # UUID as string

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


class PerusallAnnotationRequest(BaseModel):
    annotation_ids: Optional[List[str]] = None  # If provided, fetch highlight_coords from database
    annotations: Optional[List[PerusallAnnotationItem]] = None  # If annotation_ids not provided, use these directly


class PerusallAnnotationResponse(BaseModel):
    success: bool
    created_ids: List[str]
    errors: List[Dict[str, Any]]


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

