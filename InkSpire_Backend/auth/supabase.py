"""
Supabase authentication helpers
Handles JWT validation and Supabase Auth API interactions
"""
import os
from typing import Dict, Any
import jwt
from jwt.exceptions import PyJWTError
from supabase import Client
from app.core.database import get_supabase_client
from auth.constants import get_email_confirmation_url

# Load JWT secret for token validation
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")


class AuthenticationError(Exception):
    """Raised when authentication fails"""
    pass


class TokenValidationError(Exception):
    """Raised when JWT token validation fails"""
    pass


def validate_jwt_token(token: str) -> str:
    """
    Validate JWT token locally and return Supabase user ID

    This validates the token signature, expiration, and audience
    without making an API call to Supabase (fast, local validation).

    Args:
        token: JWT access token from Supabase Auth

    Returns:
        Supabase user ID (from 'sub' claim) as string

    Raises:
        TokenValidationError: If token is invalid, expired, or missing user ID
    """
    if not SUPABASE_JWT_SECRET:
        raise TokenValidationError("SUPABASE_JWT_SECRET not configured")

    try:
        # Decode and validate JWT locally
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated"
        )

        # Extract user ID from 'sub' claim
        user_id = payload.get("sub")
        if not user_id:
            raise TokenValidationError("Missing user ID in token")

        return str(user_id)

    except PyJWTError as e:
        raise TokenValidationError(f"Invalid token: {str(e)}")


def verify_supabase_token(token: str) -> Dict[str, Any]:
    """
    Verify JWT token from Supabase and extract user data

    Args:
        token: JWT access token from Supabase Auth

    Returns:
        Dict containing user data from token:
        - sub: Supabase user ID (UUID)
        - email: User email
        - role: Supabase role (authenticated, etc.)

    Raises:
        TokenValidationError: If token is invalid or expired
    """
    try:
        client = get_supabase_client()

        # Verify token and get user
        user_response = client.auth.get_user(token)

        if not user_response or not user_response.user:
            raise TokenValidationError("Invalid token: user not found")

        user = user_response.user

        return {
            "sub": user.id,  # Supabase user ID
            "email": user.email,
            "user_metadata": user.user_metadata or {},
        }

    except Exception as e:
        raise TokenValidationError(f"Token validation failed: {str(e)}")


def supabase_signup(email: str, password: str, name: str) -> Dict[str, Any]:
    """
    Sign up a new user via Supabase Auth

    Args:
        email: User email
        password: User password (will be hashed by Supabase)
        name: User display name (stored in user_metadata)

    Returns:
        Dict containing:
        - user: Supabase user object
        - session: Session object with access_token (may be None if email confirmation is required)

    Raises:
        AuthenticationError: If signup fails
    """
    import os
    from supabase import create_client
    
    try:
        # For auth operations, we should use the anon key, not service role key
        # Service role key bypasses RLS and may cause issues with auth flows
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_anon_key = os.getenv("SUPABASE_KEY")
        
        if not supabase_url or not supabase_anon_key:
            raise AuthenticationError("Supabase configuration missing: SUPABASE_URL and SUPABASE_KEY are required")
        
        # Create a client specifically for auth operations using anon key
        auth_client = create_client(supabase_url, supabase_anon_key)

        # Sign up user with Supabase
        response = auth_client.auth.sign_up({
            "email": email,
            "password": password,
            "options": {
                "data": {
                    "name": name,
                },
                "email_redirect_to": get_email_confirmation_url()  # Redirect to confirm page
            }
        })

        if not response.user:
            raise AuthenticationError("Signup failed: no user returned")

        # When email confirmations are enabled, session will be None until email is confirmed
        access_token = response.session.access_token if response.session else None
        refresh_token = response.session.refresh_token if response.session else None

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": response.user,
            "session": response.session,
        }

    except AuthenticationError:
        # Re-raise AuthenticationError as-is
        raise
    except Exception as e:
        # Handle Supabase API errors
        error_message = str(e)
        if "already registered" in error_message.lower() or "already exists" in error_message.lower():
            raise AuthenticationError("Email already registered")
        raise AuthenticationError(f"Signup failed: {error_message}")


def supabase_login(email: str, password: str) -> Dict[str, Any]:
    """
    Login user via Supabase Auth

    Args:
        email: User email
        password: User password

    Returns:
        Dict containing:
        - access_token: JWT token for API requests
        - user: Supabase user object
        - session: Full session object

    Raises:
        AuthenticationError: If login fails
    """
    import os
    from supabase import create_client
    
    try:
        # For auth operations, we should use the anon key, not service role key
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_anon_key = os.getenv("SUPABASE_KEY")
        
        if not supabase_url or not supabase_anon_key:
            raise AuthenticationError("Supabase configuration missing: SUPABASE_URL and SUPABASE_KEY are required")
        
        # Create a client specifically for auth operations using anon key
        auth_client = create_client(supabase_url, supabase_anon_key)

        # Sign in with email and password
        response = auth_client.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })

        if not response.user or not response.session:
            raise AuthenticationError("Login failed: invalid credentials")

        return {
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "token_type": "bearer",
            "user": response.user,
            "session": response.session,
        }

    except AuthenticationError:
        # Re-raise AuthenticationError as-is
        raise
    except Exception as e:
        error_message = str(e)
        if "invalid" in error_message.lower() or "credentials" in error_message.lower():
            raise AuthenticationError("Invalid email or password")
        raise AuthenticationError(f"Login failed: {error_message}")


def supabase_logout(access_token: str) -> None:
    """
    Logout user by invalidating the session

    Args:
        access_token: JWT access token to invalidate

    Raises:
        AuthenticationError: If logout fails
    """
    try:
        client = get_supabase_client()
        client.auth.sign_out()

    except Exception as e:
        raise AuthenticationError(f"Logout failed: {str(e)}")


def resend_confirmation_email(email: str) -> Dict[str, Any]:
    """
    Resend email confirmation to user

    This is useful when users don't receive the initial confirmation email
    or when the confirmation link has expired.

    Args:
        email: User's email address

    Returns:
        Dict containing success message

    Raises:
        AuthenticationError: If resend fails
    """
    try:
        client = get_supabase_client()

        # Resend confirmation email using Supabase Auth API
        response = client.auth.resend({
            "type": "signup",
            "email": email,
            "options": {
                "email_redirect_to": get_email_confirmation_url()
            }
        })

        return {"message": "Confirmation email sent"}

    except Exception as e:
        error_message = str(e)
        if "not found" in error_message.lower():
            raise AuthenticationError("User not found with this email")
        elif "already confirmed" in error_message.lower():
            raise AuthenticationError("Email already confirmed")
        raise AuthenticationError(f"Failed to resend confirmation email: {error_message}")
