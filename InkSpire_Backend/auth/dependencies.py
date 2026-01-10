"""
FastAPI authentication dependencies
Provides get_current_user dependency for protecting routes
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.database import get_db
from app.services.user_service import get_user_by_supabase_id, get_user_by_email, create_user_from_supabase
from app.models.models import User
from auth.supabase import validate_jwt_token, verify_supabase_token

# HTTPBearer extracts the token from Authorization: Bearer <token> header
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Get current authenticated user from JWT token

    This dependency:
    1. Extracts JWT from Authorization header (via HTTPBearer)
    2. Validates JWT locally (fast, no API call to Supabase)
    3. Extracts Supabase user ID from token
    4. Queries custom users table to get full User object

    Usage:
        @app.get("/protected")
        def protected_route(current_user: User = Depends(get_current_user)):
            return {"user_id": current_user.id}

    Args:
        credentials: Automatically extracted from Authorization header
        db: Database session

    Returns:
        User object from custom users table

    Raises:
        HTTPException 401: If token is invalid or missing
        HTTPException 404: If user not found in custom users table
    """
    # Extract token from Authorization: Bearer <token>
    token = credentials.credentials

    # Validate JWT locally (validates signature, expiration, audience)
    try:
        supabase_user_id = validate_jwt_token(token)
    except Exception as e:
        # Fallback: verify via Supabase API when local JWT validation isn't available
        # (e.g., SUPABASE_JWT_SECRET not configured).
        try:
            token_info = verify_supabase_token(token)
            supabase_user_id = token_info.get("sub")
            if not supabase_user_id:
                raise ValueError("Missing user ID in token")
        except Exception as e2:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid authentication credentials: {str(e2)}",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Get (or sync) user from custom table by Supabase user ID
    supabase_uuid = UUID(str(supabase_user_id))
    user = get_user_by_supabase_id(db, supabase_uuid)

    if not user:
        # Try to resolve email from token via Supabase API, then upsert user.
        token_info = verify_supabase_token(token)
        email = (token_info.get("email") or "").lower().strip()
        meta = token_info.get("user_metadata") or {}
        name = meta.get("name") or (email.split("@")[0] if email else "user")

        if email:
            existing_by_email = get_user_by_email(db, email)
            if existing_by_email:
                existing_by_email.supabase_user_id = supabase_uuid
                db.add(existing_by_email)
                db.commit()
                db.refresh(existing_by_email)
                user = existing_by_email
            else:
                user = create_user_from_supabase(
                    db=db,
                    supabase_user_id=supabase_uuid,
                    email=email,
                    name=name,
                    role="instructor",
                )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found. Please contact support.",
        )

    return user
