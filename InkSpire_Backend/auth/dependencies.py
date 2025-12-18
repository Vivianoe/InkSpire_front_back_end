"""
FastAPI authentication dependencies
Provides get_current_user dependency for protecting routes
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from uuid import UUID

from database import get_db
from user_service import get_user_by_supabase_id
from models import User
from auth.supabase import validate_jwt_token

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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user from custom table by Supabase user ID
    user = get_user_by_supabase_id(db, UUID(supabase_user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found. Please contact support.",
        )

    return user
