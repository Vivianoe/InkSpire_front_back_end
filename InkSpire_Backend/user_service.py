"""
User service layer for Supabase Auth integration
Handles custom user table operations (app-specific data)
Password authentication is managed by Supabase Auth
"""
import uuid
from typing import Optional
from sqlalchemy.orm import Session
from models import User


def create_user_from_supabase(
    db: Session,
    supabase_user_id: uuid.UUID,
    email: str,
    name: str,
    role: str = "instructor",
) -> User:
    """
    Create a custom user record after Supabase signup
    This syncs Supabase auth.users to the custom users table

    Args:
        db: Database session
        supabase_user_id: UUID from Supabase auth.users.id
        email: User email (from Supabase)
        name: User display name
        role: User role (instructor or admin)

    Returns:
        Created User object

    Raises:
        ValueError: If user already exists or is assigned an invalid role
    """
    # Check if user already exists by supabase_user_id
    existing_user = get_user_by_supabase_id(db, supabase_user_id)
    if existing_user:
        raise ValueError(f"User with Supabase ID {supabase_user_id} already exists")

    # Check if email already exists
    existing_email = get_user_by_email(db, email)
    if existing_email:
        raise ValueError(f"User with email {email} already exists")

    # Validate role
    if role not in ["instructor", "admin"]:
        raise ValueError(f"Invalid role: {role}. Must be 'instructor' or 'admin'")

    # Create user
    user = User(
        id=uuid.uuid4(),
        supabase_user_id=supabase_user_id,
        email=email.lower().strip(),
        name=name.strip(),
        role=role,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def get_user_by_id(db: Session, user_id: uuid.UUID) -> Optional[User]:
    """
    Get user by internal UUID
    """
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """
    Get user by email
    """
    return db.query(User).filter(User.email == email.lower().strip()).first()


def get_user_by_supabase_id(db: Session, supabase_user_id: uuid.UUID) -> Optional[User]:
    """
    Get user by Supabase auth.users ID
    This is used to link Supabase auth to our custom user table
    """
    return db.query(User).filter(User.supabase_user_id == supabase_user_id).first()


def user_to_dict(user: User) -> dict:
    """
    Convert User model to dictionary
    """
    return {
        "id": str(user.id),
        "supabase_user_id": str(user.supabase_user_id),
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }
