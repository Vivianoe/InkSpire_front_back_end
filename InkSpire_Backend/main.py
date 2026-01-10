from typing import Any, Dict, List, Literal, Optional
import uuid
import json

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session

# CORS middleware
from fastapi.middleware.cors import CORSMiddleware

# Add CORS middleware to the FastAPI app
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # React 前端地址
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()

# Database
from database import get_db
from models import AnnotationHighlightCoords, ScaffoldAnnotationVersion, ScaffoldAnnotation
from reading_scaffold_service import (
    create_scaffold_annotation,
    get_scaffold_annotation,
    get_scaffold_annotations_by_session,
    update_scaffold_annotation_status,
    update_scaffold_annotation_content,
    get_approved_annotations,
    scaffold_to_dict,
    scaffold_to_dict_with_status_and_history,
)

# ======================================================
# Shared Pydantic models
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
    status: Literal["pending", "approved", "rejected"]
    history: List[HistoryEntryModel]


class ReviewedProfileModel(BaseModel):
    id: str
    text: str
    status: Literal["pending", "approved", "rejected"]
    history: List[HistoryEntryModel]


# User authentication
from user_service import (
    create_user_from_supabase,
    get_user_by_id,
    get_user_by_email,
    get_user_by_supabase_id,
    user_to_dict,
)
from auth.supabase import supabase_signup, supabase_login, supabase_logout, AuthenticationError
from auth.dependencies import get_current_user

# Course management
from course_service import (
    create_course,
    create_course_basic_info,
    get_course_by_id,
    get_courses_by_instructor,
    get_course_basic_info_by_course_id,
    update_course_basic_info,
    course_to_dict,
    course_basic_info_to_dict,
)

# Class profile management
from class_profile_service import (
    create_class_profile as create_class_profile_db,
    create_class_profile_version,
    get_class_profile_by_id,
    get_class_profile_by_course_id,
    get_class_profiles_by_instructor,
    update_class_profile,
    set_current_version,
    get_class_profile_versions,
    get_class_profile_version_by_id,
    class_profile_to_dict,
    class_profile_version_to_dict,
)

# Reading management
from reading_service import (
    create_reading,
    get_reading_by_id,
    get_readings_by_course,
    get_readings_by_instructor,
    get_readings_by_course_and_instructor,
    update_reading,
    reading_to_dict,
)
from reading_chunk_service import (
    create_reading_chunks_batch,
    get_reading_chunks_by_reading_id,
    reading_chunk_to_dict,
)

# Session management
from session_service import (
    create_session,
    get_session_by_id,
    get_session_readings,
    add_reading_to_session,
    save_session_item,
    get_session_item_by_session_and_reading,
    create_session_item,
    session_to_dict,
    session_item_to_dict,
)

# Reading scaffold workflow
from workflow import (
    build_workflow as build_scaffold_workflow,
    WorkflowState as ScaffoldWorkflowState,
    approve_scaffold,
    reject_scaffold,
    manual_edit_scaffold,
    llm_refine_scaffold,
    export_approved_scaffolds,
    make_llm as make_scaffold_llm,
)

# Class profile workflow
from profile import (
    build_workflow as build_profile_workflow,
    WorkflowState as ProfileWorkflowState,
    approve_profile,
    manual_edit_profile,
    llm_refine_profile,
    export_approved_profile,
    make_llm as make_profile_llm,
)

# ======================================================
# FastAPI app
# ======================================================

app = FastAPI(
    title="Reading & Class Profile Workflows API",
    version="0.1.0",
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器，捕获所有未处理的异常（包括 FastAPI 序列化错误）"""
    import traceback
    error_trace = traceback.format_exc()
    print(f"[Global Exception Handler] Unhandled exception: {exc}")
    print(f"[Global Exception Handler] Exception type: {type(exc)}")
    print(f"[Global Exception Handler] Request path: {request.url.path}")
    print(f"[Global Exception Handler] Request method: {request.method}")
    print(f"[Global Exception Handler] Traceback:\n{error_trace}")
    
    # 如果是 HTTPException，直接返回
    if isinstance(exc, HTTPException):
        print(f"[Global Exception Handler] Re-raising HTTPException with status {exc.status_code}")
        return exc
    
    # 否则返回 500 错误
    print(f"[Global Exception Handler] Returning 500 error")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"},
    )

@app.get("/health")
def health():
    return {"status": "ok"}


    
@app.post("/api/test-scaffold-response")
def test_scaffold_response(payload: Dict[str, Any]):
    """
    测试端点：签名和 /api/generate-scaffolds 完全一致的 payload，
    但内部不跑 workflow，而是直接返回一个硬编码的合法响应
    """
    # 这里完全忽略 payload，只用来验证“同样的请求体 + 同样的编码路径”在 FastAPI 下是否正常

    test_scaffolds = [{'id': 'cbf12d27-9155-431c-9fa0-857fb142b727', 'fragment': 'A version control system serves the following purposes, among others. Version control enables multiple people to simultaneously work on a single project. Each person edits his or her own copy of the ﬁles and chooses when to share those changes with the rest of the team.', 'text': 'Consider a collaborative education data analysis project. How could version control help your team manage Python scripts and datasets, ensuring everyone has the latest version and can track changes effectively?', 'status': 'pending', 'history': [{'ts': 1766037322.98965, 'action': 'init', 'prompt': None, 'old_text': None, 'new_text': 'Consider a collaborative education data analysis project. How could version control help your team manage Python scripts and datasets, ensuring everyone has the latest version and can track changes effectively?'}]}, {'id': '1b9585d0-4f9c-4192-80fc-8d96ed9bd5a4', 'fragment': 'Version control uses a repository (a database of program versions) and a working copy where you edit ﬁles. Your working copy (sometimes called a checkout or clone) is your personal copy of all the ﬁles in the project. When you are happy with your edits, you commit your changes to a repository.', 'text': "In your own words, explain the difference between a 'working copy' and a 'repository'. What specific action does 'committing' your changes perform, and why is it a crucial step in managing your code?", 'status': 'pending', 'history': [{'ts': 1766037403.106373, 'action': 'init', 'prompt': None, 'old_text': None, 'new_text': "In your own words, explain the difference between a 'working copy' and a 'repository'. What specific action does 'committing' your changes perform, and why is it a crucial step in managing your code?"}]}, {'id': '363ae2cf-6ec3-40a4-9341-b58ecf281510', 'fragment': 'There are two general varieties of version control: centralized and distributed. Distributed version control is more modern, runs faster, is less prone to errors, has more features, and is more complex to understand. The main diﬀerence between centralized and distributed version control is the number of repositories.', 'text': 'Given that we will primarily use Git, a distributed version control system, what do you think are the key advantages of having multiple repositories for a team working on Python-based data analysis workflows?', 'status': 'pending', 'history': [{'ts': 1766037403.37672, 'action': 'init', 'prompt': None, 'old_text': None, 'new_text': 'Given that we will primarily use Git, a distributed version control system, what do you think are the key advantages of having multiple repositories for a team working on Python-based data analysis workflows?'}]}, {'id': 'beb89a84-8abf-4dd1-a900-9968ea82f739', 'fragment': 'A typical workﬂow when using Git is: On the main branch: git pull git branch NEW-BRANCH-NAME git checkout NEW-BRANCH-NAME As many times as desired: Make local edits. Examine the local edits: git status and git diff git commit, or git add then git commit git pull Ensure that tests pass. git push Make a pull request for branch NEW-BRANCH-NAME', 'text': 'Imagine you are developing a new Python function to clean student assessment data. How would you apply this typical Git workflow to ensure your changes are integrated smoothly and safely into the main project?', 'status': 'pending', 'history': [{'ts': 1766037403.572485, 'action': 'init', 'prompt': None, 'old_text': None, 'new_text': 'Imagine you are developing a new Python function to clean student assessment data. How would you apply this typical Git workflow to ensure your changes are integrated smoothly and safely into the main project?'}]}, {'id': '833f6ac1-b8a4-457f-95cd-f0d42090c7ee', 'fragment': "Don't rewrite history. git rebase is a powerful command that lets you rewrite the version control history. Never use rebase, including git pull -r. (Until you are more experienced with git. And, then still don't use it.) Rewriting history is ineﬀective if anyone else has cloned your repository.", 'text': "Why is 'rewriting history' with commands like `git rebase` strongly discouraged, especially when working on a shared codebase with other researchers? What are the potential negative consequences for collaboration?", 'status': 'pending', 'history': [{'ts': 1766037403.737651, 'action': 'init', 'prompt': None, 'old_text': None, 'new_text': "Why is 'rewriting history' with commands like `git rebase` strongly discouraged, especially when working on a shared codebase with other researchers? What are the potential negative consequences for collaboration?"}]}]
    '''for i in range(5):
        test_scaffolds.append({
            "id": f"test-scaffold-{i+1}",
            "fragment": f"Test fragment text {i+1}. " * 2,
            "text": f"Test scaffold text {i+1}. " * 3,
        })'''

    test_response = {
        "annotation_scaffolds_review": test_scaffolds,
        "session_id": "cbac0675-6ba0-401e-9919-75046b6dcc5f",
        "reading_id": str(payload.get("reading_id")) if payload.get("reading_id") else "59c15877-b451-41a8-b7c1-0f02839afe73",
        "pdf_url": "https://jrcstgmtxnavrkbdcdig.supabase.co/storage/v1/object/sign/readings/course_98adc978-af12-4b83-88ce-a9178670ae46/59c15877-b451-41a8-b7c1-0f02839afe73_reading02.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV85NWYyODY4Ni1mOTAzLTQ4NjMtODQ3Mi0zNzNiMWFhYmRhZDciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyZWFkaW5ncy9jb3Vyc2VfOThhZGM5NzgtYWYxMi00YjgzLTg4Y2UtYTkxNzg2NzBhZTQ2LzU5YzE1ODc3LWI0NTEtNDFhOC1iN2MxLTBmMDI4MzlhZmU3M19yZWFkaW5nMDIucGRmIiwiaWF0IjoxNzY2MDc0ODAzLCJleHAiOjE3NjY2Nzk2MDN9.SQeFoTJXtXOKHFSRs9ebCyoMK7w3wZQq_vHpOE4IBGk",  # Mock PDF URL
    }

    encoded = jsonable_encoder(test_response)
    return JSONResponse(content=encoded)


@app.get("/api/test-scaffold-response")
def test_scaffold_response():
    """
    测试端点：直接返回一个硬编码的 scaffold 响应，用于测试响应序列化
    测试多个 scaffolds 的情况
    """
    # 创建多个测试 scaffolds，模拟实际响应
    test_scaffolds = []
    for i in range(5):  # 创建 5 个 scaffolds
        test_scaffolds.append({
            "id": f"test-scaffold-{i+1}",
            "fragment": f"Test fragment text {i+1}. " * 10,  # 较长的文本
            "text": f"Test scaffold text {i+1}. " * 50,  # 更长的文本
        })
    
    # 创建一个简化的测试响应（只包含需要的字段）
    test_response = {
        "annotation_scaffolds_review": test_scaffolds,
        "session_id": "test-session-id",
        "reading_id": "test-reading-id",
        "pdf_url": "https://jrcstgmtxnavrkbdcdig.supabase.co/storage/v1/object/sign/readings/course_98adc978-af12-4b83-88ce-a9178670ae46/59c15877-b451-41a8-b7c1-0f02839afe73_reading02.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV85NWYyODY4Ni1mOTAzLTQ4NjMtODQ3Mi0zNzNiMWFhYmRhZDciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyZWFkaW5ncy9jb3Vyc2VfOThhZGM5NzgtYWYxMi00YjgzLTg4Y2UtYTkxNzg2NzBhZTQ2LzU5YzE1ODc3LWI0NTEtNDFhOC1iN2MxLTBmMDI4MzlhZmU3M19yZWFkaW5nMDIucGRmIiwiaWF0IjoxNzY2MDc0ODAzLCJleHAiOjE3NjY2Nzk2MDN9.SQeFoTJXtXOKHFSRs9ebCyoMK7w3wZQq_vHpOE4IBGk",  # Mock PDF URL
    }
    
    print(f"[test_scaffold_response] Returning test response")
    print(f"[test_scaffold_response] annotation_scaffolds_review count: {len(test_response['annotation_scaffolds_review'])}")
    
    # 尝试使用 jsonable_encoder
    try:
        encoded = jsonable_encoder(test_response)
        print(f"[test_scaffold_response] Encoded successfully")
        return JSONResponse(content=encoded)
    except Exception as e:
        print(f"[test_scaffold_response] Encoding failed: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Encoding failed: {str(e)}"}
        )


# ======================================================
# In-memory stores (deprecated - class profiles now use database)
# ======================================================

# Note: Class profiles are now stored in database (class_profiles table)
# These are kept for backward compatibility only
CLASS_PROFILE_REVIEWS: Dict[str, Dict[str, Any]] = {}
COURSE_PROFILE_MAP: Dict[str, str] = {}


# ======================================================
# User authentication models
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
    token_type: str = "bearer"
    message: str = "Login successful"


class LogoutResponse(BaseModel):
    message: str = "Logout successful"


class PublicUserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: Optional[str] = None


# ======================================================
# User authentication API
# ======================================================

@app.post("/api/users/register", response_model=UserResponse)
def register_user(
    payload: UserRegisterRequest,
    db: Session = Depends(get_db)
):
    """
    Register a new user with Supabase Auth and sync to custom users table

    Flow:
    1. Create user in Supabase Auth (handles password hashing)
    2. Extract supabase_user_id from response
    3. Create record in custom users table
    4. Return user data with both IDs
    """
    try:
        # Step 1: Sign up with Supabase Auth
        supabase_response = supabase_signup(
            email=payload.email,
            password=payload.password,
            name=payload.name
        )

        # Step 2: Extract Supabase user ID from response
        supabase_user = supabase_response["user"]
        supabase_user_id = uuid.UUID(supabase_user.id)

        # Step 3: Create record in custom users table
        user = create_user_from_supabase(
            db=db,
            supabase_user_id=supabase_user_id,
            email=payload.email,
            name=payload.name,
            role=payload.role,
        )

        # Step 4: Return user data
        return UserResponse(**user_to_dict(user))

    except AuthenticationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/api/users/login", response_model=LoginResponse)
def login_user(
    payload: UserLoginRequest,
    db: Session = Depends(get_db)
):
    """
    Login user with Supabase Auth and return JWT token

    Flow:
    1. Authenticate with Supabase Auth (validates password)
    2. Get JWT access token from Supabase
    3. Query custom users table for app-specific data
    4. Return JWT token + user data
    """
    try:
        # Step 1: Authenticate with Supabase
        supabase_response = supabase_login(
            email=payload.email,
            password=payload.password
        )

        # Step 2: Extract JWT token from response
        access_token = supabase_response["access_token"]

        # Step 3: Get user from custom users table
        user = get_user_by_email(db, payload.email)
        if not user:
            raise HTTPException(
                status_code=404,
                detail="User profile not found. Please contact support."
            )

        # Step 4: Return JWT token + user data
        return LoginResponse(
            user=UserResponse(**user_to_dict(user)),
            access_token=access_token,
            token_type="bearer",
            message="Login successful"
        )

    except AuthenticationError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@app.post("/api/users/logout", response_model=LogoutResponse)
def logout_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    current_user = Depends(get_current_user)
):
    """
    Logout user by invalidating their session

    Flow:
    1. Validate JWT token (via get_current_user dependency)
    2. Call Supabase logout to invalidate session
    3. Return success message

    Requires valid JWT token in Authorization header.
    Usage: Authorization: Bearer <token>
    """
    try:
        # Extract JWT token from Authorization header
        access_token = credentials.credentials

        # Invalidate session in Supabase
        supabase_logout(access_token)

        return LogoutResponse(message="Logout successful")

    except AuthenticationError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logout failed: {str(e)}")


@app.get("/api/users/me", response_model=UserResponse)
def get_current_user_info(
    current_user = Depends(get_current_user)
):
    """
    Get current authenticated user's profile (Protected route)

    Requires valid JWT token in Authorization header.
    Usage: Authorization: Bearer <token>
    """
    return UserResponse(**user_to_dict(current_user))


@app.get("/api/users/{user_id}", response_model=PublicUserResponse)
def get_user(
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Get user by internal UUID (public profile only)
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid user ID format: {user_id}")

    user = get_user_by_id(db, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")

    return PublicUserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


@app.get("/api/users/email/{email}", response_model=PublicUserResponse)
def get_user_by_email_endpoint(
    email: str,
    db: Session = Depends(get_db)
):
    """
    Get user by email address (public profile only)
    """
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=404, detail=f"User with email {email} not found")

    return PublicUserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


# ======================================================
# Helper functions
# ======================================================

def get_scaffold_or_404(scaffold_id: str, db: Session) -> Dict[str, Any]:
    """
    Get scaffold annotation from database or raise 404
    """
    try:
        annotation_id = uuid.UUID(scaffold_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scaffold ID format: {scaffold_id}")
    
    annotation = get_scaffold_annotation(db, annotation_id)
    if annotation is None:
        raise HTTPException(status_code=404, detail=f"Scaffold {scaffold_id} not found")
    
    return scaffold_to_dict(annotation)


def scaffold_to_model(scaffold: Dict[str, Any]) -> ReviewedScaffoldModel:
    return ReviewedScaffoldModel(
        id=scaffold["id"],
        fragment=scaffold["fragment"],
        text=scaffold["text"],
    )


def get_profile_or_404(profile_id: str, db: Session) -> Any:
    """
    Get class profile from database or raise 404
    """
    try:
        profile_uuid = uuid.UUID(profile_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid profile ID format: {profile_id}")
    
    profile = get_class_profile_by_id(db, profile_uuid)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id} not found")
    return profile


def profile_to_model(profile: Any, db: Session = None) -> ReviewedProfileModel:
    """
    Convert database ClassProfile model to ReviewedProfileModel
    """
    # Get current version content
    current_content = profile.description
    history = []
    
    # If we have a db session, get versions for history
    if db is not None:
        if profile.current_version_id:
            version = get_class_profile_version_by_id(db, profile.current_version_id)
            if version:
                current_content = version.content
        
        # Build history from versions
        versions = get_class_profile_versions(db, profile.id)
        for v in versions:
            history.append({
                "ts": v.created_at.timestamp() if v.created_at else 0,
                "action": "init" if v.created_by == "pipeline" else "manual_edit",
            })
    else:
        # Fallback: try to get session from the model
        try:
            session = profile._sa_instance_state.session
            if profile.current_version_id:
                version = get_class_profile_version_by_id(session, profile.current_version_id)
                if version:
                    current_content = version.content
            
            versions = get_class_profile_versions(session, profile.id)
            for v in versions:
                history.append({
                    "ts": v.created_at.timestamp() if v.created_at else 0,
                    "action": "init" if v.created_by == "pipeline" else "manual_edit",
                })
        except (AttributeError, Exception):
            # If we can't get session, just use description
            pass
    
    return ReviewedProfileModel(
        id=str(profile.id),
        text=current_content,
        status="approved",  # All database profiles are considered approved
        history=history,
    )

# ======================================================
# Class profile models
# ======================================================

class ReviewedProfileModel(BaseModel):
    id: str
    text: str          # JSON string of ClassProfile
    status: Literal["pending", "approved", "rejected"]
    history: List[HistoryEntryModel]

class RunClassProfileRequest(BaseModel):
    # Course information
    instructor_id: str  # UUID as string
    title: str
    course_code: Optional[str] = None
    description: Optional[str] = None
    
    # Class input for profile generation
    class_input: Dict[str, Any]  # Contains class_id, discipline_info, course_info, class_info


class RunClassProfileResponse(BaseModel):
    review: ReviewedProfileModel
    course_id: Optional[str] = None  # Course ID associated with this profile
    instructor_id: Optional[str] = None  # Instructor ID associated with this profile


class ApproveProfileRequest(BaseModel):
    updated_text: Optional[str] = None


class EditProfileRequest(BaseModel):
    new_text: str


class LLMRefineProfileRequest(BaseModel):
    prompt: str


class ExportedClassProfileResponse(BaseModel):
    class_profile: Optional[Dict[str, Any]]


class ClassProfileListResponse(BaseModel):
    profiles: List[ReviewedProfileModel]
    total: int


class CourseSummaryModel(BaseModel):
    id: str
    title: str
    course_code: Optional[str] = None
    description: Optional[str] = None
    class_profile_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CourseListResponse(BaseModel):
    courses: List[CourseSummaryModel]
    total: int


class EditBasicInfoRequest(BaseModel):
    course_id: str  # UUID as string
    discipline_info_json: Optional[Dict[str, Any]] = None
    course_info_json: Optional[Dict[str, Any]] = None
    class_info_json: Optional[Dict[str, Any]] = None


class EditDesignConsiderationsRequest(BaseModel):
    course_id: str  # UUID as string
    design_consideration: str


# ======================================================
# Class profile API
# ======================================================

# click on create class profile button in frontend
# frontend should pass in the instructor_id, title, course_code, description, and class_input, see the class RunClassProfileRequest(BaseModel)
@app.post("/api/class-profiles", response_model=RunClassProfileResponse)
def create_class_profile(payload: RunClassProfileRequest, db: Session = Depends(get_db)):
    """
    Generate a draft class profile and wrap it in a HITL review object.
    Saves course information to database before generating profile.
    """
    # Validate and parse instructor_id; where is it from?
    try:
        instructor_uuid = uuid.UUID(payload.instructor_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid instructor_id format: {payload.instructor_id}",
        )
    
    # Verify instructor exists
    instructor = get_user_by_id(db, instructor_uuid)
    if not instructor:
        raise HTTPException(
            status_code=404,
            detail=f"Instructor {payload.instructor_id} not found",
        )
    
    # Extract discipline_info, course_info, class_info from class_input
    discipline_info = payload.class_input.get("discipline_info")
    course_info = payload.class_input.get("course_info")
    class_info = payload.class_input.get("class_info")

    # Get course id from payload
    course_id = payload.course_id
    
    # Create course basic info in database
    basic_info = create_course_basic_info(
        db=db,
        course_id=course_id,
        discipline_info_json=discipline_info,
        course_info_json=course_info,
        class_info_json=class_info,
    )
    
    # Run profile generation workflow
    initial_state: ProfileWorkflowState = {
        "class_input": payload.class_input,
        "model": "gemini-2.5-flash",
        "temperature": 0.3,
        "max_output_tokens": 4096,
    }

    graph = build_profile_workflow()
    final_state = graph.invoke(initial_state)

    review_list: List[Dict[str, Any]] = final_state["class_profile_review"]
    if not review_list:
        raise HTTPException(
            status_code=500,
            detail="class_profile_review is empty from workflow",
        )

    review = review_list[0]
    profile_text = review["text"]  # This is the JSON string from workflow
    
    # Parse the profile JSON to extract metadata
    try:
        profile_json = json.loads(profile_text)
        metadata_json = {
            #"class_id": profile_json.get("class_id"),
            "profile": profile_json.get("profile"),
            "design_consideration": profile_json.get("design_consideration"),
        }
    except json.JSONDecodeError:
        metadata_json = None
    
    # Create class profile in database (linked to course)
    class_profile = create_class_profile_db(
        db=db,
        instructor_id=instructor_uuid,
        course_id=course_id,
        title=payload.title,
        description=profile_text,  # Store the full JSON string as description
        metadata_json=metadata_json,
    )
    
    # Create initial version
    version = create_class_profile_version(
        db=db,
        class_profile_id=class_profile.id,
        content=profile_text,
        metadata_json=metadata_json,
        created_by="pipeline",
    )
    
    # Keep backward compatibility with memory store
    CLASS_PROFILE_REVIEWS[str(class_profile.id)] = review
    COURSE_PROFILE_MAP[str(course_id)] = str(class_profile.id)

    return RunClassProfileResponse(
        review=profile_to_model(class_profile, db),
        course_id=str(class_profile.course_id) if class_profile.course_id else None,
        instructor_id=str(class_profile.instructor_id) if class_profile.instructor_id else None,
    )


@app.get("/api/class-profiles/{profile_id}", response_model=RunClassProfileResponse)
def get_class_profile(profile_id: str, db: Session = Depends(get_db)):
    """
    Get a specific class profile by ID
    """
    profile = get_profile_or_404(profile_id, db)
    return RunClassProfileResponse(
        review=profile_to_model(profile, db),
        course_id=str(profile.course_id) if profile.course_id else None,
        instructor_id=str(profile.instructor_id) if profile.instructor_id else None,
    )


@app.get("/api/class-profiles/instructor/{instructor_id}", response_model=ClassProfileListResponse)
def get_class_profiles_by_instructor_endpoint(instructor_id: str, db: Session = Depends(get_db)):
    """
    Get all class profiles for a specific instructor
    """
    # Validate and parse instructor_id
    try:
        instructor_uuid = uuid.UUID(instructor_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid instructor_id format: {instructor_id}",
        )

    # Verify instructor exists
    instructor = get_user_by_id(db, instructor_uuid)
    if not instructor:
        raise HTTPException(
            status_code=404,
            detail=f"Instructor {instructor_id} not found",
        )

    # Get all profiles for this instructor
    profiles = get_class_profiles_by_instructor(db, instructor_uuid)

    # Convert to response format
    profile_models = [profile_to_model(p, db) for p in profiles]

    return ClassProfileListResponse(
        profiles=profile_models,
        total=len(profile_models),
    )


@app.get("/api/courses/instructor/{instructor_id}", response_model=CourseListResponse)
def get_courses_by_instructor_endpoint(instructor_id: str, db: Session = Depends(get_db)):
    """
    Get all courses for a specific instructor, including linked class_profile_id if exists.
    """
    # Validate and parse instructor_id
    try:
        instructor_uuid = uuid.UUID(instructor_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid instructor_id format: {instructor_id}",
        )

    # Verify instructor exists
    instructor = get_user_by_id(db, instructor_uuid)
    if not instructor:
        raise HTTPException(
            status_code=404,
            detail=f"Instructor {instructor_id} not found",
        )

    courses = get_courses_by_instructor(db, instructor_uuid)
    items: List[CourseSummaryModel] = []

    for course in courses:
        course_dict = course_to_dict(course)
        # Find linked class profile for this course, if any
        profile = get_class_profile_by_course_id(db, course.id)
        items.append(
            CourseSummaryModel(
                id=course_dict["id"],
                title=course_dict["title"],
                course_code=course_dict.get("course_code"),
                description=course_dict.get("description"),
                class_profile_id=str(profile.id) if profile else None,
                created_at=course_dict.get("created_at"),
                updated_at=course_dict.get("updated_at"),
            )
        )

    return CourseListResponse(courses=items, total=len(items))


@app.get("/api/class-profiles/{profile_id}/export", response_model=ExportedClassProfileResponse)
def export_class_profile(profile_id: str, db: Session = Depends(get_db)):
    """
    Export the final class profile JSON
    Returns the parsed JSON object of the class profile
    """
    profile = get_profile_or_404(profile_id, db)

    # Get current version content (source of truth)
    current_content = profile.description
    if profile.current_version_id:
        version = get_class_profile_version_by_id(db, profile.current_version_id)
        if version:
            current_content = version.content

    # Parse the profile JSON
    try:
        profile_json = json.loads(current_content)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Failed to parse class profile JSON",
        )

    return ExportedClassProfileResponse(class_profile=profile_json)


# click on the confirm and save button in frontend
# frontend should pass in the profile_id and updated_text (if any), see the class ApproveProfileRequest(BaseModel)
@app.post(
    "/api/class-profiles/{profile_id}/approve",
    response_model=ExportedClassProfileResponse,
)
def approve_class_profile(profile_id: str, payload: ApproveProfileRequest, db: Session = Depends(get_db)):
    """
    Confirm and save the final class profile.
    This is the final step to confirm and save the profile.
    - If updated_text is provided: create a new version with the updated text first.
    - Then return the final confirmed class_profile JSON.
    """
    profile = get_profile_or_404(profile_id, db)

    if payload.updated_text is not None:
        # Create a new version with the updated text before confirming
        create_class_profile_version(
            db=db,
            class_profile_id=profile.id,
            content=payload.updated_text,
            created_by=None,  # Could be extracted from auth token
        )
        # Refresh to get the latest profile data after version creation
        db.refresh(profile)

    # Get the current version content (source of truth)
    current_content = profile.description
    if profile.current_version_id:
        version = get_class_profile_version_by_id(db, profile.current_version_id)
        if version:
            current_content = version.content

    # Parse the profile JSON
    try:
        profile_json = json.loads(current_content)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Failed to parse class profile JSON",
        )

    # Return the final confirmed profile
    return ExportedClassProfileResponse(class_profile=profile_json)

# click on the edit - save button of class profile in frontend
# frontend should pass in the profile_id and new_text, see the class EditProfileRequest(BaseModel)
@app.post(
    "/api/class-profiles/{profile_id}/edit",
    response_model=RunClassProfileResponse,
)
def edit_class_profile(profile_id: str, payload: EditProfileRequest, db: Session = Depends(get_db)):
    """
    Manual edit - creates a new version.
    """
    profile = get_profile_or_404(profile_id, db)
    
    # Parse new text to extract metadata if it's JSON
    try:
        new_json = json.loads(payload.new_text)
        metadata_json = {
            #"class_id": new_json.get("class_id"),
            "profile": new_json.get("profile"),
            "design_consideration": new_json.get("design_consideration"),
        }
    except json.JSONDecodeError:
        metadata_json = None
    
    # Create a new version
    create_class_profile_version(
        db=db,
        class_profile_id=profile.id,
        content=payload.new_text,
        metadata_json=metadata_json,
        created_by="User",  # Could be extracted from auth token
    )
    
    # Refresh profile to get updated data why?
    db.refresh(profile)
    
    return RunClassProfileResponse(
        review=profile_to_model(profile, db),
        course_id=str(profile.course_id) if profile.course_id else None,
        instructor_id=str(profile.instructor_id) if profile.instructor_id else None,
    )

# click on the regenerate with LLM button in frontend
# frontend should pass in the profile_id and the content from design consideration section (put together as the prompt), see the class LLMRefineProfileRequest(BaseModel)
@app.post(
    "/api/class-profiles/{profile_id}/llm-refine",
    response_model=RunClassProfileResponse,
)
def llm_refine_class_profile(profile_id: str, payload: LLMRefineProfileRequest, db: Session = Depends(get_db)):
    """
    Use LLM to refine the profile according to teacher instructions.
    Creates a new version with the refined content.
    """
    profile = get_profile_or_404(profile_id, db)
    
    # Get current content
    current_content = profile.description
    if profile.current_version_id:
        version = get_class_profile_version_by_id(db, profile.current_version_id)
        if version:
            current_content = version.content
    
    # Create a temporary review object for LLM refinement
    temp_review = {
        "id": str(profile.id),
        "text": current_content,
        "status": "pending",
        "history": [],
    }
    
    state: ProfileWorkflowState = {
        "model": "gemini-2.5-flash",
        "temperature": 0.3,
        "max_output_tokens": 4096,
    }
    llm = make_profile_llm(state)

    # Refine using LLM
    llm_refine_profile(temp_review, payload.prompt, llm)
    refined_content = temp_review["text"]
    
    # Parse refined content to extract metadata
    try:
        refined_json = json.loads(refined_content)
        metadata_json = {
            "class_id": refined_json.get("class_id"),
            "profile": refined_json.get("profile"),
            "design_consideration": refined_json.get("design_consideration"),
        }
    except json.JSONDecodeError:
        metadata_json = None
    
    # Create a new version with refined content
    create_class_profile_version(
        db=db,
        class_profile_id=profile.id,
        content=refined_content,
        metadata_json=metadata_json,
        created_by="llm_refine",
    )
    
    # Refresh profile
    db.refresh(profile)
    
    return RunClassProfileResponse(
        review=profile_to_model(profile, db),
        course_id=str(profile.course_id) if profile.course_id else None,
        instructor_id=str(profile.instructor_id) if profile.instructor_id else None,
    )


# ======================================================
# Course Basic Info + design considerations Edit API
# ======================================================

@app.post("/api/basic_info/edit")
def edit_basic_info(payload: EditBasicInfoRequest, db: Session = Depends(get_db)):
    """
    Edit course basic info (discipline_info_json, course_info_json, class_info_json).
    Creates a new version record.
    """
    try:
        course_uuid = uuid.UUID(payload.course_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid course_id format: {payload.course_id}",
        )
    
    # Get course basic info
    basic_info = get_course_basic_info_by_course_id(db, course_uuid)
    if not basic_info:
        raise HTTPException(
            status_code=404,
            detail=f"Course basic info not found for course {payload.course_id}",
        )
    
    # Update basic info (creates a new version)
    updated_basic_info = update_course_basic_info(
        db=db,
        basic_info_id=basic_info.id,
        discipline_info_json=payload.discipline_info_json,
        course_info_json=payload.course_info_json,
        class_info_json=payload.class_info_json,
        change_type="manual_edit",
        created_by="User",  # Could be extracted from auth token in the future
    )
    
    return {
        "message": "Course basic info updated successfully",
        "course_id": str(payload.course_id),
    }

@app.post("/api/design-considerations/edit")
def edit_design_considerations(payload: EditDesignConsiderationsRequest, db: Session = Depends(get_db)):
    """
    Edit design_consideration in the class profile.
    Updates the class_profile JSON in database and creates a new version.
    """
    try:
        course_uuid = uuid.UUID(payload.course_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid course_id format: {payload.course_id}",
        )

    # Find class profile by course_id using database query
    profile = get_class_profile_by_course_id(db, course_uuid)
    if not profile:
        raise HTTPException(
            status_code=404,
            detail=f"Class profile not found for course {payload.course_id}",
        )
    
    # Get current content
    current_content = profile.description
    if profile.current_version_id:
        version = get_class_profile_version_by_id(db, profile.current_version_id)
        if version:
            current_content = version.content
    
    # Parse and update the class profile JSON
    try:
        profile_json = json.loads(current_content)
        profile_json["design_consideration"] = payload.design_consideration
        updated_text = json.dumps(profile_json, ensure_ascii=False, indent=2)
        
        # Extract metadata
        metadata_json = {
            "class_id": profile_json.get("class_id"),
            "profile": profile_json.get("profile"),
            "design_consideration": profile_json.get("design_consideration"),
        }
        
        # Create a new version
        create_class_profile_version(
            db=db,
            class_profile_id=profile.id,
            content=updated_text,
            metadata_json=metadata_json,
            created_by=None,  # Could be extracted from auth token
        )
        
        # Refresh profile
        db.refresh(profile)
        
        return {
            "success": True,
            "review": profile_to_model(profile),
        }
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse class profile JSON: {e}",
        )


# ======================================================
# Reading Management API
# ======================================================

class ReadingUploadItem(BaseModel):
    """Single reading item in batch upload"""
    title: str
    file_path: Optional[str] = None  # Supabase Storage path (for reused readings)
    source_type: Literal["uploaded", "reused"] = "uploaded"
    content_base64: Optional[str] = None  # Base64 encoded file content (for uploaded PDFs)
    original_filename: Optional[str] = None  # Original filename for uploaded files


class BatchUploadReadingsRequest(BaseModel):
    """Request for batch uploading readings"""
    instructor_id: str  # UUID as string
    course_id: str  # UUID as string
    readings: List[ReadingUploadItem]


class ReadingResponse(BaseModel):
    """Response model for a single reading"""
    id: str
    instructor_id: str
    course_id: str
    title: str
    file_path: str
    source_type: str
    reading_chunks: Optional[List[Dict[str, Any]]] = None  # PDF chunks if available
    created_at: Optional[str] = None


class BatchUploadReadingsResponse(BaseModel):
    """Response for batch upload"""
    success: bool
    created_count: int
    readings: List[ReadingResponse]
    errors: List[Dict[str, Any]] = []


class ReadingListResponse(BaseModel):
    """Response for reading list"""
    readings: List[ReadingResponse]
    total: int

# click on the (batch) upload readings button in frontend (or whatever the button is called)
# frontend should pass in the instructor_id, course_id, and the list of readings, see the class BatchUploadReadingsRequest(BaseModel)
# IMPORTANT: This route must be registered BEFORE /api/readings to avoid route conflicts
@app.post("/api/readings/batch-upload", response_model=BatchUploadReadingsResponse)
def batch_upload_readings(payload: BatchUploadReadingsRequest, db: Session = Depends(get_db)):
    """
    Batch upload readings to the database.
    Each reading in the list will be created as a separate record.
    """
    # Validate and parse IDs
    try:
        instructor_uuid = uuid.UUID(payload.instructor_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid instructor_id format: {payload.instructor_id}",
        )
    
    try:
        course_uuid = uuid.UUID(payload.course_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid course_id format: {payload.course_id}",
        )
    
    # Verify instructor exists
    instructor = get_user_by_id(db, instructor_uuid)
    if not instructor:
        raise HTTPException(
            status_code=404,
            detail=f"Instructor {payload.instructor_id} not found",
        )
    
    # Verify course exists
    course = get_course_by_id(db, course_uuid)
    if not course:
        raise HTTPException(
            status_code=404,
            detail=f"Course {payload.course_id} not found",
        )
    
    # Import PDF chunking utilities
    from pdf_chunk_utils import pdf_to_chunks
    from database import get_supabase_client
    import io
    import base64
    
    # Create readings in batch
    created_readings = []
    errors = []
    supabase_client = get_supabase_client()
    bucket_name = "readings"
    print(f"Instructor ID: {instructor_uuid}, Course ID: {course_uuid}")
    print(f"Number of readings to upload: {len(payload.readings)}")
    
    for idx, reading_item in enumerate(payload.readings):
        print(f"Processing reading {idx + 1}/{len(payload.readings)}: {reading_item.title}")
        try:
            final_file_path = None
            
            # For uploaded readings: create reading first, then upload file, then convert to chunks
            if reading_item.source_type == "uploaded":
                # Step 1: Create reading with temporary file_path (will be updated later)
                temp_file_path = f"temp/{uuid.uuid4()}.pdf"
            reading = create_reading(
                db=db,
                instructor_id=instructor_uuid,
                course_id=course_uuid,
                title=reading_item.title,
                file_path=temp_file_path,
                source_type=reading_item.source_type,
            )
            reading_id = reading.id
            
            # Step 2: Upload file to Supabase Storage if content_base64 is provided
            if reading_item.content_base64:
                try:
                        # Decode base64 content
                        pdf_bytes = base64.b64decode(reading_item.content_base64)
                        
                        # Determine original filename
                        original_filename = reading_item.original_filename or reading_item.title
                        if not original_filename.lower().endswith('.pdf'):
                            original_filename += '.pdf'
                        
                        # Build file path: course_{course_id}/{reading_id}_{original_filename}.pdf
                        final_file_path = f"course_{payload.course_id}/{reading_id}_{original_filename}"
                        
                        # Upload to Supabase Storage
                        # Note: Supabase Storage upload expects bytes and file path
                        # Try to remove existing file first (if any) to allow overwriting
                        try:
                            supabase_client.storage.from_(bucket_name).remove([final_file_path])
                        except Exception:
                            # File doesn't exist, which is fine - we'll upload it
                            pass
                        
                        # Upload the file； need to fix multiple uploads of the same file issue
                        supabase_client.storage.from_(bucket_name).upload(
                            final_file_path,
                            pdf_bytes,
                            file_options={"content-type": "application/pdf"}
                        )
                        
                        # Step 3: Update reading with correct file_path
                        reading = update_reading(
                            db=db,
                            reading_id=reading_id,
                            file_path=final_file_path,
                        )
                        
                        # Step 4: Convert PDF to chunks and store in reading_chunks table
                        try:
                            document_id = reading_item.title.replace(' ', '_').lower()[:50]
                            chunks = pdf_to_chunks(
                                pdf_source=pdf_bytes,
                                document_id=document_id,
                            )
                            
                            # pdf_to_chunks returns List[dict], not List[TextChunk]
                            # Convert chunks to format for database storage
                            chunks_data = []
                            for chunk in chunks:
                                # chunk is already a dict with keys: document_id, chunk_index, content, token_count
                                chunks_data.append({
                                    "chunk_index": chunk["chunk_index"],
                                    "content": chunk["content"],
                                    "chunk_metadata": {
                                        "document_id": chunk["document_id"],
                                        "token_count": chunk["token_count"],
                                    },
                                })
                            print(f"Chunks data: {len(chunks_data)} chunks created")
                            
                            # Store chunks in reading_chunks table
                            create_reading_chunks_batch(
                                db=db,
                                reading_id=reading_id,
                                chunks=chunks_data,
                            )
                        except Exception as chunk_error:
                            print(f"Warning: Failed to convert PDF to chunks for {reading_item.title}: {str(chunk_error)}")
                            # Continue without chunks
                except Exception as upload_error:
                        # If upload fails, delete the reading and report error
                        db.delete(reading)
                        db.commit()
                        raise Exception(f"Failed to upload file to Supabase Storage: {str(upload_error)}")
                else:
                    # No content_base64 provided, use provided file_path (for reused readings); direct reading record pointingto the provided file_path; no frontend yet
                    final_file_path = reading_item.file_path or temp_file_path
                    reading = update_reading(
                        db=db,
                        reading_id=reading_id,
                        file_path=final_file_path,
                    )
            else:
                # For reused readings: use provided file_path；different session should have different reading ids, so we need to create a new reading record, pointing to the same file_path
                final_file_path = reading_item.file_path
                if not final_file_path:
                    raise ValueError("file_path is required for reused readings")
                
                reading = create_reading(
                    db=db,
                    instructor_id=instructor_uuid,
                    course_id=course_uuid,
                    title=reading_item.title,
                    file_path=final_file_path,
                    source_type=reading_item.source_type,
                )
            
            # Refresh reading to ensure it's up to date
            db.refresh(reading)
            # Load chunks if needed
            reading_dict = reading_to_dict(reading, include_chunks=False)
            chunks = get_reading_chunks_by_reading_id(db, reading.id)
            reading_dict["reading_chunks"] = [reading_chunk_to_dict(chunk) for chunk in chunks]
            created_readings.append(reading_dict)
            print(f"Successfully created reading: {reading.title} (ID: {reading.id})")
        except Exception as e:
            error_msg = str(e)
            print(f"ERROR processing reading {idx} ({reading_item.title}): {error_msg}")
            import traceback
            print(traceback.format_exc())
            errors.append({
                "index": idx,
                "title": reading_item.title,
                "error": error_msg,
            })
    
    print(f"Batch upload completed: {len(created_readings)} created, {len(errors)} errors")
    
    response = BatchUploadReadingsResponse(
        success=len(errors) == 0,
        created_count=len(created_readings),
        readings=[ReadingResponse(**r) for r in created_readings],
        errors=errors,
    )
    print(f"Response: success={response.success}, created_count={response.created_count}, errors={len(response.errors)}")
    return response

# When go to the reading display and upload page, use this function to get the reading list
# frontend should pass in the course_id and instructor_id, see the class ReadingListRequest(BaseModel)
# selected readings' ids for sessin setup should be stored in the frontend state to pass in to the generate_scaffolds_with_session function
@app.get("/api/readings", response_model=ReadingListResponse)
def get_reading_list(
    course_id: Optional[str] = None,
    instructor_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get reading list for display.
    Returns readings matching both course_id and instructor_id.
    """
    # Validate and parse course_id
    course_uuid = None
    if course_id:
        try:
            course_uuid = uuid.UUID(course_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid course_id format: {course_id}",
            )
    
    # Validate and parse instructor_id
    instructor_uuid = None
    if instructor_id:
        try:
            instructor_uuid = uuid.UUID(instructor_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid instructor_id format: {instructor_id}",
            )
    
    # Get readings based on provided filters
    if course_uuid and instructor_uuid:
        # get readings for specific course and instructor
        readings_list = get_readings_by_course_and_instructor(db, course_uuid, instructor_uuid)
    else:
        # Neither provided
        raise HTTPException(
            status_code=400,
            detail="Both course_id and instructor_id must be provided",
        )
    
    # Convert to response format, including chunks
    readings_data = []
    for r in readings_list:
        reading_dict = reading_to_dict(r, include_chunks=True)
        # Load chunks if not already loaded
        if "reading_chunks" not in reading_dict or reading_dict["reading_chunks"] is None:
            chunks = get_reading_chunks_by_reading_id(db, r.id)
            reading_dict["reading_chunks"] = [reading_chunk_to_dict(chunk) for chunk in chunks]
        readings_data.append(ReadingResponse(**reading_dict))
    
    return ReadingListResponse(
        readings=readings_data,
        total=len(readings_data),
    )

# ======================================================
# Reading scaffold models
# ======================================================


class ReadingScaffoldsRequest(BaseModel):
    class_profile: Dict[str, Any]
    reading_chunks: Dict[str, Any]  # { "chunks": [...] }
    reading_info: Dict[str, Any]    # must contain assignment_id
    session_id: Optional[str] = None  # UUID as string, provided by frontend
    reading_id: Optional[str] = None  # UUID as string, provided by frontend



class GenerateScaffoldsRequest(BaseModel):
    """Request for generating scaffolds - all data loaded from database"""
    instructor_id: str  # UUID as string
    course_id: str  # UUID as string
    session_id: Optional[str] = None  # UUID as string, optional - will create new session if not provided
    reading_id: str  # UUID as string


class ReadingScaffoldsResponse(BaseModel):
    annotation_scaffolds_review: List[ReviewedScaffoldModel]
    session_id: Optional[str] = None  # UUID as string
    reading_id: Optional[str] = None  # UUID as string
    pdf_url: Optional[str] = None  # Public URL to PDF file in Supabase Storage


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


# Thread-based review API (compatibility layer for frontend)
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
# Reading scaffold API
# ======================================================

# click on generate scaffold button in frontend
# frontend needs to pass in the session_id and selected readings' ids, as well as receive the session_id and reading_ids in the response
# session_id is the id of the session that will be used to generate the scaffolds for the selected readings in the same session
# session_id should be none when entering the first reading's scaffold generation page for the first time, and remain the same for the subsequent readings' scaffold generation pages in the same session
# the returned session_id and reading_ids should be stored in the frontend state to guide whether to create a new session or use the existing one in the next reading's scaffold generation page
@app.post(
    "/api/generate-scaffolds",
    #response_model=ReadingScaffoldsResponse,
)
def generate_scaffolds_with_session(
    payload: GenerateScaffoldsRequest,
    db: Session = Depends(get_db)
):
    """
    Generate scaffolds endpoint - wraps run_material_focus_scaffold with error handling
    Generate scaffolds - all data loaded from database.
    Only requires: instructor_id, course_id, session_id, reading_id
    """
    # Ensure json module is available (use global import)
    import json as json_module
    # Validate and parse IDs
    try:
        course_uuid = uuid.UUID(payload.course_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid course_id format: {payload.course_id}",
        )
    
    try:
        instructor_uuid = uuid.UUID(payload.instructor_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid instructor_id format: {payload.instructor_id}",
        )
    
    try:
        reading_uuid = uuid.UUID(payload.reading_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid reading_id format: {payload.reading_id}",
        )
    
    # Verify entities exist
    instructor = get_user_by_id(db, instructor_uuid)
    if not instructor:
        raise HTTPException(
            status_code=404,
            detail=f"Instructor {payload.instructor_id} not found",
        )
    
    course = get_course_by_id(db, course_uuid)
    if not course:
        raise HTTPException(
            status_code=404,
            detail=f"Course {payload.course_id} not found",
        )
    
    reading = get_reading_by_id(db, reading_uuid)
    if not reading:
        raise HTTPException(
            status_code=404,
            detail=f"Reading {payload.reading_id} not found",
        )
    
    # Handle session_id - create new session if not provided
    session_uuid = None
    if payload.session_id:
        try:
            session_uuid = uuid.UUID(payload.session_id)
            session = get_session_by_id(db, session_uuid)
            if not session:
                raise HTTPException(
                    status_code=404,
                    detail=f"Session {payload.session_id} not found",
                )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid session_id format: {payload.session_id}",
            )
    else:
        # Create a new session (default week_number = 1, title = "Reading Session")
        session = create_session(
            db=db,
            course_id=course_uuid,
            week_number=1,
            title="Reading Session",
        )
        session_uuid = session.id
        print(f"[generate_scaffolds_with_session] Created new session: {session_uuid}")
    
    # Establish session-reading relationship (if not already exists)
    existing_relations = get_session_readings(db, session_uuid)
    reading_exists = any(sr.reading_id == reading_uuid for sr in existing_relations)
    
    if not reading_exists:
        add_reading_to_session(
            db=db,
            session_id=session_uuid,
            reading_id=reading_uuid,
        )
    
    # Load class_profile from database (by course_id)
    class_profile_db = get_class_profile_by_course_id(db, course_uuid)
    if not class_profile_db:
        raise HTTPException(
            status_code=404,
            detail=f"Class profile not found for course {payload.course_id}",
        )
    
    # Parse class_profile JSON from description field
    try:
        class_profile_json = json_module.loads(class_profile_db.description)
    except json_module.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Failed to parse class profile JSON from database",
        )
    
    # Load or create session_item from database (by session_id and reading_id)
    session_item = get_session_item_by_session_and_reading(db, session_uuid, reading_uuid)
    if not session_item:
        # Create a new session_item if it doesn't exist
        session_item = create_session_item(
        db=db,
        session_id=session_uuid,
        reading_id=reading_uuid,
        instructor_id=instructor_uuid,
            session_info_json=None,
            assignment_info_json=None,
            assignment_goals_json=None,
            version=1,
        )
        print(f"[generate_scaffolds_with_session] Created new session_item for session {session_uuid} and reading {reading_uuid}")
    
    # Load reading_chunks from database
    chunks = get_reading_chunks_by_reading_id(db, reading_uuid)
    if not chunks:
        raise HTTPException(
            status_code=404,
            detail=f"No chunks found for reading {reading_uuid}. Please upload and process the reading first.",
        )
    
    # Convert to workflow format: {"chunks": [...]}
    reading_chunks_data = {
        "chunks": [
            {
                "document_id": chunk.chunk_metadata.get("document_id") if chunk.chunk_metadata else None,
                "chunk_index": chunk.chunk_index,
                "text": chunk.content,  # Use "text" field for workflow compatibility
                "content": chunk.content,  # Also include "content" for compatibility
                "token_count": chunk.chunk_metadata.get("token_count") if chunk.chunk_metadata else None,
            }
            for chunk in chunks
        ]
    }
    
    # Build reading_info from reading and session_item
    reading_info = {
        "assignment_id": str(reading_uuid),  # Use reading_id as assignment_id
        "source": reading.file_path,
        "session_id": str(session_uuid),
        "reading_id": str(reading_uuid),
    }
    # Add session_item data if available
    if session_item.session_info_json:
        reading_info["session_info"] = session_item.session_info_json
    if session_item.assignment_info_json:
        reading_info["assignment_info"] = session_item.assignment_info_json
    if session_item.assignment_goals_json:
        reading_info["assignment_goals"] = session_item.assignment_goals_json
    
    print(f"[generate_scaffolds_with_session] Loaded {len(chunks)} chunks from database for reading {reading_uuid}")
    print(f"[generate_scaffolds_with_session] First chunk content length: {len(chunks[0].content) if chunks else 0}")
    
    # Create ReadingScaffoldsRequest with data from database
    scaffold_request = ReadingScaffoldsRequest(
        class_profile=class_profile_json,
        reading_chunks=reading_chunks_data,
        reading_info=reading_info,
        session_id=str(session_uuid),
        reading_id=str(reading_uuid),
    )
    
    # Call the existing workflow function
    print(f"[generate_scaffolds_with_session] Calling run_material_focus_scaffold...")
    try:
        response = run_material_focus_scaffold(scaffold_request, db)
        print(f"[generate_scaffolds_with_session] Successfully got response from run_material_focus_scaffold")
        print(f"[generate_scaffolds_with_session] Response type: {type(response)}")
        print(f"[generate_scaffolds_with_session] Response annotation_scaffolds_review count: {len(response.annotation_scaffolds_review) if hasattr(response, 'annotation_scaffolds_review') else 'N/A'}")
        
        # Convert to dict first - use model_dump with mode='json' to ensure JSON-compatible types
        try:
            response_dict = response.model_dump(mode='json')
            print(f"[generate_scaffolds_with_session] Response can be serialized to dict")
            print(f"[generate_scaffolds_with_session] Response dict keys: {list(response_dict.keys())}")
            print(f"[generate_scaffolds_with_session] Response dict annotation_scaffolds_review count: {len(response_dict.get('annotation_scaffolds_review', []))}")
            
            # Check the structure of annotation_scaffolds_review
            if response_dict.get('annotation_scaffolds_review'):
                first_scaffold = response_dict['annotation_scaffolds_review'][0] if response_dict['annotation_scaffolds_review'] else None
                if first_scaffold:
                    print(f"[generate_scaffolds_with_session] First scaffold type: {type(first_scaffold)}")
                    print(f"[generate_scaffolds_with_session] First scaffold keys: {list(first_scaffold.keys()) if isinstance(first_scaffold, dict) else 'N/A'}")
                    print(f"[generate_scaffolds_with_session] First scaffold: {first_scaffold}")
            
            # Try JSON serialization to catch any issues FastAPI might encounter
            try:
                json_str = json_module.dumps(response_dict, default=str)
                print(f"[generate_scaffolds_with_session] Response can be serialized to JSON (length: {len(json_str)})")
            except Exception as json_error:
                print(f"[generate_scaffolds_with_session] ERROR: Response cannot be serialized to JSON: {json_error}")
                import traceback
                traceback.print_exc()
                raise HTTPException(
                    status_code=500,
                    detail=f"Response JSON serialization failed: {str(json_error)}",
                )
            
            # Get PDF URL from Supabase Storage (signed URL for private buckets)
            pdf_url = None
            if reading.file_path:
                try:
                    from database import get_supabase_client
                    supabase_client = get_supabase_client()
                    bucket_name = "readings"
                    
                    # Try to get signed URL (works for both public and private buckets)
                    # Expires in 7 days (604800 seconds)
                    signed_url_response = supabase_client.storage.from_(bucket_name).create_signed_url(
                        reading.file_path,
                        expires_in=604800  # 7 days
                    )
                    pdf_url = signed_url_response.get('signedURL') if isinstance(signed_url_response, dict) else signed_url_response
                    print(f"[generate_scaffolds_with_session] Got PDF signed URL: {pdf_url}")
                except Exception as url_error:
                    print(f"[generate_scaffolds_with_session] Warning: Failed to get PDF URL: {url_error}")
                    import traceback
                    traceback.print_exc()
                    # Continue without PDF URL - not critical
            
            # Add pdf_url to response_dict
            if pdf_url:
                response_dict['pdf_url'] = pdf_url
            
            # Use jsonable_encoder to encode the dict (same as test endpoint)
            try:
                encoded = jsonable_encoder(response_dict)
                print(f"[generate_scaffolds_with_session] Response encoded successfully using jsonable_encoder")
                print(f"[generate_scaffolds_with_session] Encoded annotation_scaffolds_review count: {len(encoded.get('annotation_scaffolds_review', []))}")
                print(f"[generate_scaffolds_with_session] Encoded type: {type(encoded)}")
            except Exception as encode_error:
                print(f"[generate_scaffolds_with_session] ERROR: jsonable_encoder failed: {encode_error}")
                import traceback
                traceback.print_exc()
                raise HTTPException(
                    status_code=500,
                    detail=f"Response encoding failed: {str(encode_error)}",
                )
            
            # Return the encoded dict using JSONResponse (same as test endpoint)
            # This bypasses FastAPI's response_model validation
            print(f"[generate_scaffolds_with_session] Returning JSONResponse with encoded content...")
            print(f"[generate_scaffolds_with_session] Encoded content type: {type(encoded)}")
            print(f"[generate_scaffolds_with_session] Encoded content keys: {list(encoded.keys()) if isinstance(encoded, dict) else 'N/A'}")
            
            try:
                json_response = JSONResponse(content=encoded)
                print(f"[generate_scaffolds_with_session] JSONResponse created successfully")
                print(f"[generate_scaffolds_with_session] JSONResponse type: {type(json_response)}")
                print(f"[generate_scaffolds_with_session] JSONResponse status_code: {json_response.status_code}")
                return json_response
            except Exception as json_response_error:
                print(f"[generate_scaffolds_with_session] ERROR: Failed to create JSONResponse: {json_response_error}")
                import traceback
                traceback.print_exc()
                # Fallback: return the dict directly (FastAPI will serialize it)
                return encoded
            # return response_dict
        except HTTPException:
            raise
        except Exception as final_error:
            print(f"[generate_scaffolds_with_session] ERROR: Response cannot be serialized: {final_error}")
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Response serialization failed: {str(final_error)}",
            )
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        print(f"[generate_scaffolds_with_session] ERROR calling run_material_focus_scaffold: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate scaffolds: {str(e)}",
        )


# This is an internal function to run the material → focus → scaffold pipeline
# It is used by the generate_scaffolds_with_session function to run the pipeline
@app.post(
    "/api/reading-scaffolds",
    response_model=ReadingScaffoldsResponse,
)
def run_material_focus_scaffold(
    payload: ReadingScaffoldsRequest,
    db: Session = Depends(get_db)
):
    """
    Run Material → Focus → Scaffold pipeline and return review objects.
    Stores ReviewedScaffolds in database.
    """
    reading_info = payload.reading_info
    assignment_id = reading_info.get("assignment_id")
    if not assignment_id:
        raise HTTPException(
            status_code=400,
            detail="reading_info.assignment_id is required",
        )
    
    # Get session_id and reading_id from request, or from reading_info, or generate new ones
    session_id_str = payload.session_id or reading_info.get("session_id")
    reading_id_str = payload.reading_id or reading_info.get("reading_id")
    
    # Validate and parse UUIDs
    try:
        session_id = uuid.UUID(session_id_str) if session_id_str else uuid.uuid4()
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid session_id format: {session_id_str}",
        )
    
    try:
        reading_id = uuid.UUID(reading_id_str) if reading_id_str else uuid.uuid4()
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid reading_id format: {reading_id_str}",
        )

    # print(payload.reading_chunks)
    initial_state: ScaffoldWorkflowState = {
        "reading_chunks": payload.reading_chunks,
        "class_profile": payload.class_profile,
        "reading_info": reading_info,
        "model": "gemini-2.5-flash",
        "temperature": 0.3,
        "max_output_tokens": 8192,
    }

    try:
        graph = build_scaffold_workflow()
        final_state = graph.invoke(initial_state)
        # final_state = run_scaffold_workflow(initial_state)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Workflow execution error: {error_trace}")
        
        # Check if it's a quota/rate limit error
        error_str = str(e)
        if "429" in error_str or "quota" in error_str.lower() or "ResourceExhausted" in error_str:
            raise HTTPException(
                status_code=429,
                detail="API quota exceeded. Please wait a moment and try again, or check your Gemini API plan and billing details.",
            )
        
        raise HTTPException(
            status_code=500,
            detail=f"Workflow execution failed: {str(e)}",
        )

    # Debug: Print final_state keys to understand what was returned
    print(f"Final state keys: {list(final_state.keys())}")
    print(f"scaffold_json present: {'scaffold_json' in final_state}")
    print(f"annotation_scaffolds_review present: {'annotation_scaffolds_review' in final_state}")
    if 'scaffold_json' in final_state:
        scaffold_json_raw = final_state.get('scaffold_json', '')
        print(f"scaffold_json length: {len(scaffold_json_raw)}")
        print(f"scaffold_json content (first 500 chars): {str(scaffold_json_raw)[:500]}")

    review_list: List[Dict[str, Any]] = final_state.get("annotation_scaffolds_review") or []
    print(f"review_list length: {len(review_list)}")
    if review_list:
        print(f"First review item keys: {list(review_list[0].keys()) if review_list else 'N/A'}")
    
    # If review_list is empty, check scaffold_json to see if scaffolds were generated
    if not review_list:
        scaffold_json = final_state.get("scaffold_json", "")
        if scaffold_json:
            try:
                scaffold_data = json.loads(scaffold_json) if isinstance(scaffold_json, str) else scaffold_json
                print(f"Parsed scaffold_data type: {type(scaffold_data)}")
                print(f"Parsed scaffold_data keys: {list(scaffold_data.keys()) if isinstance(scaffold_data, dict) else 'N/A'}")
                annotation_scaffolds = scaffold_data.get("annotation_scaffolds", []) if isinstance(scaffold_data, dict) else []
                print(f"Found {len(annotation_scaffolds)} scaffolds in scaffold_json")
                if annotation_scaffolds:
                    print(f"First scaffold keys: {list(annotation_scaffolds[0].keys()) if annotation_scaffolds else 'N/A'}")
                else:
                    print(f"WARNING: annotation_scaffolds is empty. Full scaffold_data: {scaffold_data}")
            except Exception as e:
                print(f"Error parsing scaffold_json: {e}")
                import traceback
                print(traceback.format_exc())
        
        # Provide more detailed error message
        error_detail = "Workflow returned empty 'annotation_scaffolds_review'"
        if scaffold_json:
            error_detail += f". However, scaffold_json contains data. This may indicate an issue in node_init_scaffold_review."
        else:
            error_detail += ". scaffold_json is also empty, indicating scaffolds were not generated."
        
        raise HTTPException(
            status_code=500,
            detail=error_detail,
        )

    # Save scaffolds to database
    saved_annotations = []
    try:
        for idx, scaf in enumerate(review_list):
            print(f"[run_material_focus_scaffold] Saving scaffold {idx + 1}/{len(review_list)}")
            # Extract position info if available
            start_offset = scaf.get("start_offset")
            end_offset = scaf.get("end_offset")
            page_number = scaf.get("page_number")
            
            try:
                annotation = create_scaffold_annotation(
                    db=db,
                    session_id=session_id,
                    reading_id=reading_id,
                    highlight_text=scaf.get("fragment", ""),
                    current_content=scaf.get("text", ""),
                    start_offset=start_offset,
                    end_offset=end_offset,
                    page_number=page_number,
                    status="draft",  # Initial status is draft
                )
                saved_annotations.append(annotation)
                print(f"[run_material_focus_scaffold] Successfully saved scaffold {idx + 1}")
            except Exception as e:
                print(f"[run_material_focus_scaffold] ERROR saving scaffold {idx + 1}: {e}")
                import traceback
                traceback.print_exc()
                raise

        print(f"[run_material_focus_scaffold] Saved {len(saved_annotations)} annotations to database")
    except Exception as e:
        # Any error in saving annotations should surface clearly
        print(f"[run_material_focus_scaffold] ERROR while saving annotations to database: {e}")
        import traceback
        traceback.print_exc()
        raise

    # Convert to API response format
    print(f"[run_material_focus_scaffold] Converting to API response format...")
    api_review_objs = []
    for idx, annotation in enumerate(saved_annotations):
        try:
            annotation_dict = scaffold_to_dict(annotation)
            api_obj = scaffold_to_model(annotation_dict)
            api_review_objs.append(api_obj)
            print(f"[run_material_focus_scaffold] Converted annotation {idx + 1}")
        except Exception as e:
            print(f"[run_material_focus_scaffold] ERROR converting annotation {idx + 1}: {e}")
            import traceback
            traceback.print_exc()
            raise

    print(f"[run_material_focus_scaffold] Building response...")
    try:
        response = ReadingScaffoldsResponse(
            annotation_scaffolds_review=api_review_objs,
            session_id=str(session_id),
            reading_id=str(reading_id),
        )
        print(f"[run_material_focus_scaffold] Response built successfully")
        print(f"[run_material_focus_scaffold] Response annotation_scaffolds_review count: {len(response.annotation_scaffolds_review)}")
        print(response)
        
        # Try to serialize the response to check for any serialization issues
        try:
            response_dict = response.model_dump()
            print(f"[run_material_focus_scaffold] Response serialized successfully")
            print(f"[run_material_focus_scaffold] Serialized annotation_scaffolds_review count: {len(response_dict.get('annotation_scaffolds_review', []))}")
        except Exception as serialize_error:
            print(f"[run_material_focus_scaffold] ERROR: Response serialization failed: {serialize_error}")
            import traceback
            traceback.print_exc()
            # Raise error if serialization fails
            raise HTTPException(
                status_code=500,
                detail=f"Response serialization failed: {str(serialize_error)}",
            )
        
        print(f"[run_material_focus_scaffold] About to return response to FastAPI...")
        return response
    except Exception as response_error:
        print(f"[run_material_focus_scaffold] ERROR building response: {response_error}")
        print(f"[run_material_focus_scaffold] api_review_objs type: {type(api_review_objs)}")
        print(f"[run_material_focus_scaffold] api_review_objs length: {len(api_review_objs)}")
        if api_review_objs:
            print(f"[run_material_focus_scaffold] First api_review_obj type: {type(api_review_objs[0])}")
            print(f"[run_material_focus_scaffold] First api_review_obj: {api_review_objs[0]}")
        import traceback
        traceback.print_exc()
        raise
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        print(f"[run_material_focus_scaffold] ERROR in save/convert process: {e}")
        import traceback
        error_trace = traceback.format_exc()
        print(f"[run_material_focus_scaffold] Full traceback:\n{error_trace}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save or convert scaffolds: {str(e)}",
        )

@app.get("/api/annotation-scaffolds/by-session/{session_id}")
def get_scaffolds_by_session(
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    Get all scaffold annotations for a session with full details (status and history)
    Used by frontend to fetch complete scaffold information after receiving IDs from generate-scaffolds
    """
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid session ID format: {session_id}")
    
    annotations = get_scaffold_annotations_by_session(db, session_uuid)
    
    # Convert to API format with status and history
    scaffolds = []
    for annotation in annotations:
        annotation_dict = scaffold_to_dict_with_status_and_history(annotation)
        scaffolds.append(annotation_dict)
    
    return {
        "scaffolds": scaffolds
    }


@app.post(
    "/api/annotation-scaffolds/{scaffold_id}/approve",
    response_model=ScaffoldResponse,
)
def approve_scaffold_endpoint(
    scaffold_id: str,
    db: Session = Depends(get_db)
):
    """
    Approve a scaffold annotation and create a version record
    """
    scaffold_dict = get_scaffold_or_404(scaffold_id, db)
    
    try:
        annotation_id = uuid.UUID(scaffold_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scaffold ID format: {scaffold_id}")
    
    # Update status in database
    annotation = update_scaffold_annotation_status(
        db=db,
        annotation_id=annotation_id,
        status="accepted",
        change_type="accept",
        created_by="user",
    )
    
    updated_dict = scaffold_to_dict_with_status_and_history(annotation)
    return ScaffoldResponse(scaffold=ReviewedScaffoldModelWithStatusAndHistory(**updated_dict))


@app.post(
    "/api/annotation-scaffolds/{scaffold_id}/edit",
    response_model=ScaffoldResponse,
)
def edit_scaffold_endpoint(
    scaffold_id: str,
    payload: EditScaffoldRequest,
    db: Session = Depends(get_db)
):
    """
    Manually edit scaffold annotation content and create a version record
    """
    scaffold_dict = get_scaffold_or_404(scaffold_id, db)
    
    try:
        annotation_id = uuid.UUID(scaffold_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scaffold ID format: {scaffold_id}")
    
    # Update content in database
    annotation = update_scaffold_annotation_content(
        db=db,
        annotation_id=annotation_id,
        new_content=payload.new_text,
        change_type="manual_edit",
        created_by="user",
    )
    
    updated_dict = scaffold_to_dict_with_status_and_history(annotation)
    return ScaffoldResponse(scaffold=ReviewedScaffoldModelWithStatusAndHistory(**updated_dict))


@app.post(
    "/api/annotation-scaffolds/{scaffold_id}/llm-refine",
    response_model=ScaffoldResponse,
)
def llm_refine_scaffold_endpoint(
    scaffold_id: str,
    payload: LLMRefineScaffoldRequest,
    db: Session = Depends(get_db)
):
    """
    Use LLM to refine scaffold annotation content and create a version record
    """
    scaffold_dict = get_scaffold_or_404(scaffold_id, db)

    state: ScaffoldWorkflowState = {
        "model": "gemini-2.5-flash",
        "temperature": 0.3,
        "max_output_tokens": 2048,
    }
    llm = make_scaffold_llm(state)

    # Use workflow function to refine (this updates the dict)
    updated_dict = llm_refine_scaffold(scaffold_dict, payload.prompt, llm)
    
    # Save refined content to database
    try:
        annotation_id = uuid.UUID(scaffold_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scaffold ID format: {scaffold_id}")
    
    annotation = update_scaffold_annotation_content(
        db=db,
        annotation_id=annotation_id,
        new_content=updated_dict["text"],
        change_type="llm_edit",
        created_by="llm",
    )
    
    final_dict = scaffold_to_dict_with_status_and_history(annotation)
    return ScaffoldResponse(scaffold=ReviewedScaffoldModelWithStatusAndHistory(**final_dict))


@app.post(
    "/api/annotation-scaffolds/{scaffold_id}/reject",
    response_model=ScaffoldResponse,
)
def reject_scaffold_endpoint(
    scaffold_id: str,
    db: Session = Depends(get_db)
):
    """
    Reject a scaffold annotation and create a version record
    """
    scaffold_dict = get_scaffold_or_404(scaffold_id, db)
    
    try:
        annotation_id = uuid.UUID(scaffold_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid scaffold ID format: {scaffold_id}")
    
    # Update status in database
    annotation = update_scaffold_annotation_status(
        db=db,
        annotation_id=annotation_id,
        status="rejected",
        change_type="reject",
        created_by="user",
    )
    
    updated_dict = scaffold_to_dict_with_status_and_history(annotation)
    return ScaffoldResponse(scaffold=ReviewedScaffoldModelWithStatusAndHistory(**updated_dict))


@app.get(
    "/api/annotation-scaffolds/export",
    response_model=ExportedScaffoldsResponse,
)
def export_approved_scaffolds_endpoint(
    assignment_id: Optional[str] = None,
    reading_id: Optional[str] = None,
    session_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Export final annotation_scaffolds.
    Only includes status == 'accepted' (approved).
    Can filter by reading_id or session_id.
    """
    reading_uuid = None
    if reading_id:
        try:
            reading_uuid = uuid.UUID(reading_id)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid reading_id format: {reading_id}")
    
    session_uuid = None
    if session_id:
        try:
            session_uuid = uuid.UUID(session_id)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid session_id format: {session_id}")
    
    # Get approved annotations from database
    annotations = get_approved_annotations(
        db=db,
        reading_id=reading_uuid,
        session_id=session_uuid,
    )
    
    if not annotations:
        return ExportedScaffoldsResponse(annotation_scaffolds=[])
    
    # Convert to export format
    items = [
        ExportedScaffold(
            id=str(ann.id),
            fragment=ann.highlight_text,
            text=ann.current_content,
        )
        for ann in annotations
    ]
    
    return ExportedScaffoldsResponse(annotation_scaffolds=items)


# ======================================================
# Thread-based review API (compatibility endpoint)
# ======================================================

class ThreadReviewAction(BaseModel):
    item_id: str
    action: Literal["approve", "reject", "llm_refine"]
    data: Optional[Dict[str, Any]] = None


class ThreadReviewRequest(BaseModel):
    thread_id: Optional[str] = None
    decision: Optional[Literal["approve", "reject", "edit"]] = None
    edit_prompt: Optional[str] = None
    actions: Optional[List[ThreadReviewAction]] = None


@app.post("/threads/{thread_id}/review")
def thread_review_endpoint(
    thread_id: str,
    payload: ThreadReviewRequest,
    db: Session = Depends(get_db)
):
    """
    Compatibility endpoint for thread-based review API.
    Maps to individual scaffold endpoints based on actions.
    """
    if not payload.actions or len(payload.actions) == 0:
        raise HTTPException(
            status_code=400,
            detail="At least one action is required"
        )
    
    results = []
    
    for action_item in payload.actions:
        scaffold_id = str(action_item.item_id)
        action = action_item.action
        
        try:
            if action == "approve":
                # Call approve endpoint
                annotation_id = uuid.UUID(scaffold_id)
                annotation = update_scaffold_annotation_status(
                    db=db,
                    annotation_id=annotation_id,
                    status="accepted",
                    change_type="accept",
                    created_by="user",
                )
                updated_dict = scaffold_to_dict_with_status_and_history(annotation)
                scaffold_model = ReviewedScaffoldModelWithStatusAndHistory(**updated_dict)
                results.append({
                    "item_id": scaffold_id,
                    "scaffold": scaffold_model.model_dump(),
                })
                
            elif action == "reject":
                # Call reject endpoint
                annotation_id = uuid.UUID(scaffold_id)
                annotation = update_scaffold_annotation_status(
                    db=db,
                    annotation_id=annotation_id,
                    status="rejected",
                    change_type="reject",
                    created_by="user",
                )
                updated_dict = scaffold_to_dict_with_status_and_history(annotation)
                scaffold_model = ReviewedScaffoldModelWithStatusAndHistory(**updated_dict)
                results.append({
                    "item_id": scaffold_id,
                    "scaffold": scaffold_model.model_dump(),
                })
                
            elif action == "llm_refine":
                # Call llm-refine endpoint
                prompt = None
                if action_item.data and "prompt" in action_item.data:
                    prompt = action_item.data["prompt"]
                elif payload.edit_prompt:
                    prompt = payload.edit_prompt
                else:
                    raise HTTPException(
                        status_code=400,
                        detail="Prompt is required for llm_refine action"
                    )
                
                scaffold_dict = get_scaffold_or_404(scaffold_id, db)
                
                state: ScaffoldWorkflowState = {
                    "model": "gemini-2.5-flash",
                    "temperature": 0.3,
                    "max_output_tokens": 2048,
                }
                llm = make_scaffold_llm(state)
                
                updated_dict = llm_refine_scaffold(scaffold_dict, prompt, llm)
                
                annotation_id = uuid.UUID(scaffold_id)
                annotation = update_scaffold_annotation_content(
                    db=db,
                    annotation_id=annotation_id,
                    new_content=updated_dict["text"],
                    change_type="llm_edit",
                    created_by="llm",
                )
                
                final_dict = scaffold_to_dict_with_status_and_history(annotation)
                scaffold_model = ReviewedScaffoldModelWithStatusAndHistory(**final_dict)
                results.append({
                    "item_id": scaffold_id,
                    "scaffold": scaffold_model.model_dump(),
                })
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown action: {action}"
                )
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid scaffold ID format: {scaffold_id}"
            )
        except HTTPException:
            raise
        except Exception as e:
            print(f"[thread_review_endpoint] Error processing action {action} for scaffold {scaffold_id}: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to process action {action} for scaffold {scaffold_id}: {str(e)}"
            )
    
    # Return response in format expected by frontend
    # Frontend expects a response with __interrupt__ and action_result fields
    if len(results) == 1:
        # Single action - return in format expected by processReviewResponse
        result = results[0]
        return {
            "action_result": result.get("scaffold"),
            "__interrupt__": None,  # Indicates all actions completed
        }
    else:
        # Multiple actions - return all results
        return {
            "results": results,
            "__interrupt__": None,  # Indicates all actions completed
        }


@app.get("/threads/{thread_id}/scaffold-bundle")
def get_scaffold_bundle_endpoint(
    thread_id: str,
    session_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get final scaffold bundle for a thread/session.
    Returns all approved scaffolds for the session.
    """
    session_uuid = None
    
    # Try to get session_id from query parameter first
    if session_id:
        try:
            session_uuid = uuid.UUID(session_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid session_id format: {session_id}"
            )
    else:
        # If no session_id provided, try to find the most recent session with annotations
        # This is a fallback for when frontend only provides thread_id
        from reading_scaffold_service import get_scaffold_annotations_by_session
        from models import ScaffoldAnnotation
        
        # Get the most recent annotation to find its session_id
        recent_annotation = db.query(ScaffoldAnnotation).order_by(
            ScaffoldAnnotation.created_at.desc()
        ).first()
        
        if recent_annotation and recent_annotation.session_id:
            session_uuid = recent_annotation.session_id
            print(f"[get_scaffold_bundle] Using session_id from recent annotation: {session_uuid}")
        else:
            raise HTTPException(
                status_code=400,
                detail="session_id is required. Please provide it as a query parameter."
            )
    
    # Get approved annotations for the session
    annotations = get_approved_annotations(
        db=db,
        reading_id=None,  # Get all readings in the session
        session_id=session_uuid,
    )
    
    if not annotations:
        return ExportedScaffoldsResponse(annotation_scaffolds=[])
    
    # Convert to export format
    items = [
        ExportedScaffold(
            id=str(ann.id),
            fragment=ann.highlight_text,
            text=ann.current_content,
        )
        for ann in annotations
    ]
    
    return ExportedScaffoldsResponse(annotation_scaffolds=items)


# ======================================================
# 5. Perusall Annotation Posting API
# ======================================================

import os
import requests
from pydantic import BaseModel
from typing import List, Optional


# ---- Perusall environment variables ----
PERUSALL_BASE_URL = "https://app.perusall.com/legacy-api"

X_INSTITUTION = os.getenv("PERUSALL_INSTITUTION")
X_API_TOKEN = os.getenv("PERUSALL_API_TOKEN")

COURSE_ID = os.getenv("PERUSALL_COURSE_ID")
ASSIGNMENT_ID = os.getenv("PERUSALL_ASSIGNMENT_ID")
DOCUMENT_ID = os.getenv("PERUSALL_DOCUMENT_ID")
USER_ID = os.getenv("PERUSALL_USER_ID")


# ---- Pydantic models for annotation posting ----

class PerusallAnnotationItem(BaseModel):
    rangeType: str
    rangePage: int
    rangeStart: int
    rangeEnd: int
    fragment: str
    positionStartX: float
    positionStartY: float
    positionEndX: float
    positionEndY: float


class PerusallAnnotationRequest(BaseModel):
    annotations: List[PerusallAnnotationItem]


class PerusallAnnotationResponse(BaseModel):
    success: bool
    created_ids: List[str]
    errors: List[dict]


# ---- Publish to Perusall implementation ----

@app.post("/api/perusall/annotations", response_model=PerusallAnnotationResponse)
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


# ======================================================
# 6. Annotation Highlight Coords API
# ======================================================

class HighlightCoordsItem(BaseModel):
    annotation_version_id: Optional[str] = None  # Optional: can be looked up by fragment
    rangeType: str
    rangePage: int
    rangeStart: int
    rangeEnd: int
    fragment: str
    positionStartX: float
    positionStartY: float
    positionEndX: float
    positionEndY: float
    session_id: Optional[str] = None  # Optional: used to lookup annotation if annotation_version_id not provided


class HighlightReportRequest(BaseModel):
    coords: List[HighlightCoordsItem]


class HighlightReportResponse(BaseModel):
    success: bool
    created_count: int
    errors: List[dict]


@app.post("/api/highlight-report", response_model=HighlightReportResponse)
def save_highlight_coords(
    req: HighlightReportRequest,
    db: Session = Depends(get_db)
):
    """
    Save annotation highlight coordinates to database.
    Each coordinate record is bound to an annotation_version_id.
    """
    created_count = 0
    errors = []

    for idx, item in enumerate(req.coords):
        try:
            # Get annotation_version_id: either provided directly or looked up by fragment
            annotation_version_id = None
            
            if item.annotation_version_id:
                # Use provided annotation_version_id
                try:
                    annotation_version_id = uuid.UUID(item.annotation_version_id)
                except ValueError:
                    errors.append({
                        "index": idx,
                        "error": f"Invalid annotation_version_id format: {item.annotation_version_id}"
                    })
                    continue
            elif item.session_id and item.fragment:
                # Look up annotation by fragment and session_id
                try:
                    session_uuid = uuid.UUID(item.session_id)
                    # Find annotation by matching fragment (highlight_text)
                    annotation = db.query(ScaffoldAnnotation).filter(
                        ScaffoldAnnotation.session_id == session_uuid,
                        ScaffoldAnnotation.highlight_text.ilike(f"%{item.fragment[:100]}%")  # Partial match
                    ).first()
                    
                    if annotation and annotation.current_version_id:
                        annotation_version_id = annotation.current_version_id
                    else:
                        errors.append({
                            "index": idx,
                            "error": f"Could not find annotation for fragment: {item.fragment[:50]}..."
                        })
                        continue
                except ValueError:
                    errors.append({
                        "index": idx,
                        "error": f"Invalid session_id format: {item.session_id}"
                    })
                    continue
            else:
                errors.append({
                    "index": idx,
                    "error": "Either annotation_version_id or (session_id + fragment) must be provided"
                })
                continue

            # Check if annotation version exists (optional validation)
            version = db.query(ScaffoldAnnotationVersion).filter(
                ScaffoldAnnotationVersion.id == annotation_version_id
            ).first()
            
            if not version:
                errors.append({
                    "index": idx,
                    "error": f"Annotation version not found: {annotation_version_id}"
                })
                continue

            # Check if coordinate already exists for this version
            existing = db.query(AnnotationHighlightCoords).filter(
                AnnotationHighlightCoords.annotation_version_id == annotation_version_id
            ).first()

            if existing:
                # Update existing record
                existing.range_type = item.rangeType
                existing.range_page = item.rangePage
                existing.range_start = item.rangeStart
                existing.range_end = item.rangeEnd
                existing.fragment = item.fragment
                existing.position_start_x = item.positionStartX
                existing.position_start_y = item.positionStartY
                existing.position_end_x = item.positionEndX
                existing.position_end_y = item.positionEndY
                existing.valid = True
            else:
                # Create new record
                coords = AnnotationHighlightCoords(
                    annotation_version_id=annotation_version_id,
                    range_type=item.rangeType,
                    range_page=item.rangePage,
                    range_start=item.rangeStart,
                    range_end=item.rangeEnd,
                    fragment=item.fragment,
                    position_start_x=item.positionStartX,
                    position_start_y=item.positionStartY,
                    position_end_x=item.positionEndX,
                    position_end_y=item.positionEndY,
                    valid=True
                )
                db.add(coords)

            db.commit()
            created_count += 1

        except Exception as e:
            db.rollback()
            errors.append({
                "index": idx,
                "error": str(e),
                "annotation_version_id": item.annotation_version_id
            })

    return HighlightReportResponse(
        success=len(errors) == 0,
        created_count=created_count,
        errors=errors
    )


# ======================================================
# Local dev entrypoint (optional)
# ======================================================

# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)