#!/usr/bin/env python3
"""
Test script to verify all imports are working correctly
Run this from the InkSpire_Backend directory after activating venv
"""
import sys

def test_imports():
    """Test all critical imports"""
    errors = []
    
    print("Testing imports...")
    print("=" * 50)
    
    # Test core imports
    try:
        from app.core.database import get_db, Base, engine
        print("✅ app.core.database")
    except Exception as e:
        errors.append(f"❌ app.core.database: {e}")
    
    # Test models
    try:
        from app.models.models import User, Course, ScaffoldAnnotation
        print("✅ app.models.models")
    except Exception as e:
        errors.append(f"❌ app.models.models: {e}")
    
    # Test services
    try:
        from app.services.user_service import get_user_by_id
        from app.services.course_service import get_course_by_id
        print("✅ app.services.*")
    except Exception as e:
        errors.append(f"❌ app.services: {e}")
    
    # Test workflows
    try:
        from app.workflows.scaffold_workflow import build_workflow
        from app.workflows.profile_workflow import build_workflow as build_profile_workflow
        print("✅ app.workflows.*")
    except Exception as e:
        errors.append(f"❌ app.workflows: {e}")
    
    # Test API models
    try:
        from app.api.models import UserResponse, LoginResponse
        print("✅ app.api.models")
    except Exception as e:
        errors.append(f"❌ app.api.models: {e}")
    
    # Test routes
    try:
        from app.api.routes import users
        print("✅ app.api.routes.users")
    except Exception as e:
        errors.append(f"❌ app.api.routes.users: {e}")
    
    # Test auth
    try:
        from auth.supabase import supabase_signup
        from auth.dependencies import get_current_user
        print("✅ auth.*")
    except Exception as e:
        errors.append(f"❌ auth: {e}")
    
    # Test main app
    try:
        from app.main import app
        print("✅ app.main")
    except Exception as e:
        errors.append(f"❌ app.main: {e}")
    
    print("=" * 50)
    
    if errors:
        print("\n❌ Import errors found:")
        for error in errors:
            print(f"  {error}")
        return False
    else:
        print("\n✅ All imports successful!")
        return True

if __name__ == "__main__":
    success = test_imports()
    sys.exit(0 if success else 1)

