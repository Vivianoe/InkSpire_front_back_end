# Backend File Structure Migration Guide

This document explains the new file structure and how to update imports.

## New Structure

The backend has been reorganized into a more modular structure:

```
InkSpire_Backend/
├── app/                    # Main application package
│   ├── main.py            # FastAPI app (to be created)
│   ├── api/               # API layer
│   ├── core/              # Core configuration
│   ├── models/            # SQLAlchemy models
│   ├── services/          # Business logic
│   ├── workflows/         # LLM workflows
│   ├── prompts/           # LLM prompts
│   └── utils/             # Utilities
├── scripts/               # Utility scripts
├── tests/                 # Test files
└── docs/                  # Documentation
```

## Import Path Updates

### Old Imports → New Imports

#### Database & Models
```python
# Old
from database import get_db, Base
from models import User, Course, ...

# New
from app.core.database import get_db, Base
from app.models.models import User, Course, ...
```

#### Services
```python
# Old
from user_service import create_user, get_user_by_email
from course_service import create_course
from reading_scaffold_service import create_scaffold_annotation

# New
from app.services.user_service import create_user, get_user_by_email
from app.services.course_service import create_course
from app.services.reading_scaffold_service import create_scaffold_annotation
```

#### Workflows
```python
# Old
from workflow import build_workflow, WorkflowState
from profile import build_workflow as build_profile_workflow

# New
from app.workflows.scaffold_workflow import build_workflow, WorkflowState
from app.workflows.profile_workflow import build_workflow as build_profile_workflow
```

#### Utils
```python
# Old
from pdf_chunk_utils import chunk_pdf
from perusall import upload_annotations

# New
from app.utils.pdf_chunk_utils import chunk_pdf
from app.utils.perusall import upload_annotations
```

## Migration Steps

### Step 1: Update Service Files

All service files in `app/services/` need to update their model imports:

```python
# In app/services/user_service.py, etc.
# Change:
from models import User

# To:
from app.models.models import User
```

### Step 2: Update Workflow Files

Workflow files in `app/workflows/` need to update their imports:

```python
# In app/workflows/scaffold_workflow.py
# Change:
from prompts.material_prompt import ...

# To:
from app.prompts.material_prompt import ...
```

### Step 3: Update main.py

The main `main.py` file needs to update all imports to use the new paths.

### Step 4: Update Scripts

Scripts in `scripts/` need to update their imports:

```python
# In scripts/init_db.py
# Change:
from database import Base, engine
from models import User, Course, ...

# To:
from app.core.database import Base, engine
from app.models.models import User, Course, ...
```

## Running the Application

### During Migration (Temporary)

You can still run using the old `main.py`:
```bash
uvicorn main:app --reload
```

### After Migration (New Structure)

Once `app/main.py` is created and all imports are updated:
```bash
uvicorn app.main:app --reload
```

## Backward Compatibility

The old `main.py` file is kept temporarily for backward compatibility during migration. Once all imports are updated and tested, it can be removed.

## Testing

After updating imports, test each module:
1. Run database initialization: `python scripts/init_db.py`
2. Start the server: `uvicorn app.main:app --reload`
3. Test API endpoints: `http://localhost:8000/docs`

## Notes

- All file moves have been completed
- Import paths need to be updated in all files
- The old `main.py` remains for reference during migration
- Update imports incrementally and test after each change

