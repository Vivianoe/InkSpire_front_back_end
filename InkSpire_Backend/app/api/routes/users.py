"""
User authentication and management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import User
from app.services.user_service import (
    create_user_from_supabase,
    get_user_by_id,
    get_user_by_email,
    get_user_by_supabase_id,
    user_to_dict,
)
from auth.supabase import supabase_signup, supabase_login, AuthenticationError
from auth.dependencies import get_current_user
from app.api.models import (
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    LoginResponse,
    PublicUserResponse,
)

router = APIRouter()

@router.post("/users/register", response_model=LoginResponse)
def register_user(req: UserRegisterRequest, db: Session = Depends(get_db)):
    """Register a new user"""
    import uuid
    try:
        # Create user in Supabase Auth
        supabase_response = supabase_signup(req.email, req.password, req.name)
        supabase_user = supabase_response["user"]
        supabase_user_id = uuid.UUID(supabase_user.id)

        # Extract tokens from response
        access_token = supabase_response["access_token"]
        refresh_token = supabase_response["refresh_token"]

        # Create user record in our database
        user = create_user_from_supabase(
            db=db,
            supabase_user_id=supabase_user_id,
            email=req.email,
            name=req.name,
            role=req.role or "instructor",
        )

        # Return LoginResponse with both access and refresh tokens
        return LoginResponse(
            user=UserResponse(
                id=str(user.id),
                supabase_user_id=str(user.supabase_user_id),
                email=user.email,
                name=user.name,
                role=user.role,
            ),
            access_token=access_token,
            refresh_token=refresh_token,
            message="Registration successful"
        )
    except AuthenticationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@router.post("/users/login", response_model=LoginResponse)
def login_user(req: UserLoginRequest, db: Session = Depends(get_db)):
    """Login user"""
    import uuid
    try:
        # Authenticate with Supabase
        supabase_response = supabase_login(req.email, req.password)

        # Extract tokens from response
        access_token = supabase_response["access_token"]
        refresh_token = supabase_response["refresh_token"]
        supabase_user = supabase_response["user"]

        # Get (or sync) user from our database
        supabase_user_id = uuid.UUID(supabase_user.id)
        user = get_user_by_supabase_id(db, supabase_user_id)
        if not user:
            existing_by_email = get_user_by_email(db, req.email)
            if existing_by_email:
                existing_by_email.supabase_user_id = supabase_user_id
                db.add(existing_by_email)
                db.commit()
                db.refresh(existing_by_email)
                user = existing_by_email
            else:
                name = getattr(supabase_user, "user_metadata", None) or {}
                resolved_name = name.get("name") or req.email.split("@")[0]
                user = create_user_from_supabase(
                    db=db,
                    supabase_user_id=supabase_user_id,
                    email=req.email,
                    name=resolved_name,
                    role="instructor",
                )

        return LoginResponse(
            user=UserResponse(
                id=str(user.id),
                supabase_user_id=str(user.supabase_user_id),
                email=user.email,
                name=user.name,
                role=user.role,
            ),
            access_token=access_token,
            refresh_token=refresh_token,
        )
    except AuthenticationError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

@router.get("/users/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return UserResponse(
        id=str(current_user.id),
        supabase_user_id=str(current_user.supabase_user_id),
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
    )

@router.get("/users/{user_id}", response_model=PublicUserResponse)
def get_user(user_id: str, db: Session = Depends(get_db)):
    """Get user by ID"""
    import uuid
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    user = get_user_by_id(db, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return PublicUserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
    )

@router.get("/users/email/{email}", response_model=PublicUserResponse)
def get_user_by_email_endpoint(email: str, db: Session = Depends(get_db)):
    """Get user by email"""
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return PublicUserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
    )

