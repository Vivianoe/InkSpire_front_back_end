"""
Authentication constants for Supabase integration
Centralizes configuration values used across auth module
"""
import os

# Frontend URL from environment variable
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Email confirmation redirect path (appended to FRONTEND_URL)
EMAIL_CONFIRMATION_PATH = "/auth/confirm"


def get_email_confirmation_url() -> str:
    """
    Get the full email confirmation redirect URL

    This URL is used when sending email confirmation links.
    Users will be redirected to this page after clicking the confirmation link.

    Returns:
        Full URL for email confirmation redirect (e.g., http://localhost:3000/auth/confirm)
    """
    return f"{FRONTEND_URL}{EMAIL_CONFIRMATION_PATH}"
