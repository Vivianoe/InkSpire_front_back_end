"""
Supabase database connection configuration
"""
import os
from typing import Optional
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Supabase connection configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")  # Anon key for auth operations
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Service role key for admin operations (Storage, etc.)
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")  # For JWT validation

# Create Supabase client (prefer service role key for admin operations, fallback to anon key)
supabase: Optional[Client] = None
if SUPABASE_URL:
    # Use service role key if available (for Storage operations), otherwise use anon key
    key_to_use = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
    if key_to_use:
        supabase = create_client(SUPABASE_URL, key_to_use)

# Option 2: Use SQLAlchemy connection (for ORM operations)
# Supabase database connection string format:
# postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
# or direct connection:
# postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    os.getenv("SUPABASE_DB_URL")  # if SUPABASE_DB_URL is set
)

if not DATABASE_URL:
    raise ValueError(
        "Please set DATABASE_URL or SUPABASE_DB_URL environment variable. "
        "Format: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"
    )

# Create database engine (with connection pooling)
# Supabase recommends using connection pooling
engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,  # Check if connection is valid
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base model class
Base = declarative_base()


def get_db():
    """
    Get database session dependency function for FastAPI Depends
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_supabase_client() -> Client:
    """
    Get Supabase client instance for operations (Storage, Auth, etc.)
    
    For Storage operations, use SUPABASE_SERVICE_ROLE_KEY (recommended).
    For Auth operations, SUPABASE_KEY (anon key) is sufficient.
    """
    if supabase is None:
        missing_vars = []
        if not SUPABASE_URL:
            missing_vars.append("SUPABASE_URL")
        if not SUPABASE_KEY and not SUPABASE_SERVICE_ROLE_KEY:
            missing_vars.append("SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY")
        
        error_msg = (
            "Supabase client not initialized. Please set the following environment variables:\n"
            f"  - SUPABASE_URL (required)\n"
            f"  - SUPABASE_SERVICE_ROLE_KEY (recommended for Storage operations)\n"
            f"  - SUPABASE_KEY (alternative, for Auth operations)\n\n"
            f"Missing: {', '.join(missing_vars)}\n\n"
            "You can find these values in Supabase Dashboard:\n"
            "  - Settings → API → Project URL (SUPABASE_URL)\n"
            "  - Settings → API → service_role key (SUPABASE_SERVICE_ROLE_KEY)\n"
            "  - Settings → API → anon/public key (SUPABASE_KEY)"
        )
        raise ValueError(error_msg)
    return supabase

