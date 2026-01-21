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
    
    # this function is used for testing only
    def confirm_email_for_testing(
        supabase_url: str,
        service_role_key: str,
        target_email: str,
        target_password: str,
    ) -> None:
        admin_client = create_client(supabase_url, service_role_key)
        normalized_target = target_email.strip().lower()

        def fetch_user_by_email_via_rest(email: str) -> Any:
            import json as json_module
            import urllib.parse
            import urllib.request

            params = urllib.parse.urlencode({"email": f"eq.{email}"})
            url = f"{supabase_url}/auth/v1/admin/users?{params}"
            req = urllib.request.Request(url, method="GET")
            req.add_header("apikey", service_role_key)
            req.add_header("Authorization", f"Bearer {service_role_key}")
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read().decode("utf-8")
                    parsed = json_module.loads(data) if data else {}
                    if isinstance(parsed, dict):
                        users = parsed.get("users") or []
                        return users[0] if users else None
                    if isinstance(parsed, list):
                        return parsed[0] if parsed else None
                    return None
            except Exception:
                return None

        def extract_users(response: Any) -> list:
            if hasattr(response, "users"):
                return response.users or []
            if hasattr(response, "data"):
                data = response.data
                if isinstance(data, list):
                    return data
                if hasattr(data, "users"):
                    return data.users or []
                if isinstance(data, dict):
                    return data.get("users") or []
            if isinstance(response, dict):
                if "users" in response:
                    return response.get("users") or []
                data = response.get("data")
                if isinstance(data, list):
                    return data
                if isinstance(data, dict):
                    return data.get("users") or []
            return []

        target_user = None
        page = 1
        per_page = 1000
        while True:
            users_response = admin_client.auth.admin.list_users(page=page, per_page=per_page)
            users = extract_users(users_response)
            if not users:
                print(f"[auth][testing] list_users empty (type={type(users_response)})")
                break
            for user in users:
                user_email = user.email if hasattr(user, "email") else user.get("email")
                if isinstance(user_email, str) and user_email.strip().lower() == normalized_target:
                    target_user = user
                    break
            if target_user or len(users) < per_page:
                break
            page += 1

        if not target_user:
            print("[auth][testing] list_users did not find user, trying get_user_by_email")
        if not target_user:
            try:
                user_response = admin_client.auth.admin.get_user_by_email(target_email)
                if hasattr(user_response, "user"):
                    target_user = user_response.user
                elif isinstance(user_response, dict):
                    target_user = user_response.get("user")
            except Exception:
                target_user = None

        if not target_user:
            print("[auth][testing] get_user_by_email did not find user, trying admin REST lookup")
            target_user = fetch_user_by_email_via_rest(target_email)

        if not target_user:
            print("[auth][testing] get_user_by_email did not find user, trying create_user")
        if not target_user:
            try:
                created = admin_client.auth.admin.create_user({
                    "email": target_email,
                    "password": target_password,
                    "email_confirm": True,
                })
                if hasattr(created, "user"):
                    target_user = created.user
                elif isinstance(created, dict):
                    target_user = created.get("user")
            except Exception as create_error:
                print(f"[auth][testing] create_user failed: {create_error}")
                if "already been registered" in str(create_error).lower():
                    target_user = fetch_user_by_email_via_rest(target_email)
                    if not target_user:
                        try:
                            user_response = admin_client.auth.admin.get_user_by_email(target_email)
                            if hasattr(user_response, "user"):
                                target_user = user_response.user
                            elif isinstance(user_response, dict):
                                target_user = user_response.get("user")
                        except Exception:
                            target_user = None
                if not target_user:
                    target_user = None

        if not target_user:
            raise AuthenticationError("Login failed: user not found for testing bypass")

        user_id = target_user.id if hasattr(target_user, "id") else target_user.get("id")
        if not user_id:
            raise AuthenticationError("Login failed: user id missing for testing bypass")

        try:
            admin_client.auth.admin.update_user_by_id(user_id, {"email_confirm": True})
        except Exception as update_error:
            print(f"[auth][testing] update_user_by_id failed: {update_error}")
            raise


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
        if "email not confirmed" in error_message.lower() and os.getenv("AUTH_TESTING") == "true":
            service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            if not service_role_key:
                raise AuthenticationError("Login failed: testing bypass missing service role key")

            confirm_email_for_testing(supabase_url, service_role_key, email, password)
            try:
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
                raise
            except Exception as retry_error:
                raise AuthenticationError(f"Login failed: {str(retry_error)}")
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
