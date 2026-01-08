# Inkspire Backend API

A FastAPI-based backend service for managing educational courses, class profiles, reading materials, and AI-generated teaching scaffolds. This application provides RESTful APIs for instructors to create courses, generate class profiles, upload readings, and automatically generate annotation scaffolds using LLM workflows.

## Features

- **User Authentication**: Registration and login for instructors and admins with secure password hashing
- **Course Management**: Create and manage courses with basic information and detailed course data
- **Class Profile Generation**: AI-powered class profile generation with complete versioning support
- **Reading Management**: Batch upload and manage reading materials (PDFs, documents)
- **Session Management**: Organize readings into teaching sessions with week-based structure
- **Scaffold Generation**: Automated generation of annotation scaffolds using LangGraph workflows
- **Version Control**: Complete version history for class profiles, course basic info, and scaffold annotations
- **Database Integration**: PostgreSQL/Supabase database with SQLAlchemy ORM
- **Audit Trail**: Track all changes with timestamps, creators, and change types

## Tech Stack

- **Framework**: FastAPI
- **Database**: PostgreSQL (via Supabase)
- **ORM**: SQLAlchemy 2.0+
- **LLM Framework**: LangChain, LangGraph
- **LLM Provider**: Google Gemini (gemini-2.5-flash)
- **Authentication**: bcrypt, python-jose
- **PDF Processing**: pypdf

## Project Structure

```
InkSpire_Backend/
├── app/                          # Main application package
│   ├── __init__.py
│   ├── main.py                  # FastAPI application entry point
│   │
│   ├── api/                     # API layer
│   │   ├── __init__.py
│   │   ├── models.py            # Pydantic request/response models
│   │   └── routes/              # API route handlers
│   │       ├── __init__.py
│   │       ├── users.py         # User authentication endpoints
│   │       ├── courses.py       # Course management endpoints
│   │       ├── class_profiles.py # Class profile endpoints
│   │       ├── readings.py      # Reading management endpoints
│   │       ├── scaffolds.py     # Scaffold generation endpoints
│   │       └── perusall.py     # Perusall integration endpoints
│   │
│   ├── core/                    # Core configuration
│   │   ├── __init__.py
│   │   ├── config.py            # Application configuration
│   │   └── database.py          # Database connection and session
│   │
│   ├── models/                  # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   └── models.py            # Database table definitions
│   │
│   ├── services/                # Business logic layer
│   │   ├── __init__.py
│   │   ├── user_service.py      # User management logic
│   │   ├── course_service.py    # Course management logic
│   │   ├── class_profile_service.py # Class profile logic
│   │   ├── reading_service.py  # Reading management logic
│   │   ├── reading_chunk_service.py # Reading chunk logic
│   │   ├── session_service.py   # Session management logic
│   │   └── reading_scaffold_service.py # Scaffold annotation logic
│   │
│   ├── workflows/               # LLM workflow definitions
│   │   ├── __init__.py
│   │   ├── scaffold_workflow.py # Reading scaffold generation workflow
│   │   ├── profile_workflow.py  # Class profile generation workflow
│   │   └── scaffold_reviewer.py # CLI tool for reviewing scaffolds
│   │
│   ├── prompts/                 # LLM prompt templates
│   │   ├── __init__.py
│   │   ├── material_prompt.py   # Material analysis prompts
│   │   ├── focus_prompt.py     # Focus identification prompts
│   │   ├── scaffold_prompt.py  # Scaffold generation prompts
│   │   └── class_profile_prompt.py # Class profile prompts
│   │
│   └── utils/                   # Utility functions
│       ├── __init__.py
│       ├── pdf_chunk_utils.py   # PDF chunking utilities
│       └── perusall.py         # Perusall integration utilities
│
├── migrations/                  # Database migration scripts
│   ├── README.md
│   ├── create_scaffold_annotations_tables.sql
│   └── ...
│
├── scripts/                     # Utility scripts
│   ├── init_db.py              # Database initialization
│   ├── init_cloud_db.py        # Cloud database setup
│   ├── verify_db.py            # Database verification
│   └── ...
│
├── tests/                       # Test files
│   ├── test_scaffold_*.py
│   └── ...
│
├── docs/                        # Documentation
│   ├── README.md               # This file (moved from root)
│   ├── API_TEST_DATA.md        # API test examples
│   ├── CLASS_PROFILE_DATABASE_LOGIC.md
│   ├── COURSE_DATABASE_LOGIC.md
│   ├── SCAFFOLD_GENERATION_DATABASE_LOGIC.md
│   └── ...
│
├── auth/                        # Authentication modules
│   ├── __init__.py
│   ├── dependencies.py         # Auth dependencies
│   └── supabase.py             # Supabase auth integration
│
├── pdf/                         # PDF processing files
│   ├── README.md
│   └── ...
│
├── requirements.txt             # Python dependencies
├── .env.example                 # Environment variables template
└── supabase_schema.sql          # Complete database schema
```

## Installation

### Prerequisites

- Python 3.9+
- PostgreSQL database (or Supabase account)
- Google Gemini API key

### Setup

1. **Clone the repository**:
```bash
git clone <repository-url>
cd Inkspire_Backend
```

2. **Create a virtual environment**:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies**:
```bash
pip install -r requirements.txt
```

4. **Set up environment variables**:
Create a `.env` file in the project root:
```env
# Database Configuration
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
# or
SUPABASE_DB_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres

# Supabase Configuration
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # Recommended for Storage operations
SUPABASE_KEY=your_anon_key  # Alternative, for Auth operations only

# Google Gemini API
GOOGLE_API_KEY=your_google_api_key

# Perusall Integration (Optional)
PERUSALL_INSTITUTION=your_institution
PERUSALL_API_TOKEN=your_api_token
PERUSALL_COURSE_ID=your_course_id
PERUSALL_ASSIGNMENT_ID=your_assignment_id
PERUSALL_DOCUMENT_ID=your_document_id
PERUSALL_USER_ID=your_user_id
```

5. **Initialize the database**:
```bash
python scripts/init_db.py
```

Alternatively, you can run the SQL schema directly in Supabase:
```bash
# Execute supabase_schema.sql in your Supabase SQL editor
```

6. **Run the application**:

**Option 1: Using the start script (Recommended)**
```bash
# Linux/Mac
./run.sh

# Windows
run.bat
```

**Option 2: Manual start**
```bash
# Activate virtual environment first
source venv/bin/activate  # On Windows: venv\Scripts\activate

# From InkSpire_Backend directory
# Using new structure (recommended)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Or using legacy main.py (temporary during migration)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Important**: Make sure you're in the `InkSpire_Backend` directory and have activated the virtual environment before running uvicorn.

The API will be available at `http://localhost:8000`

## API Documentation

Once the server is running, you can access:
- **Interactive API docs**: `http://localhost:8000/docs` (Swagger UI)
- **Alternative docs**: `http://localhost:8000/redoc` (ReDoc)

## Database Schema

### Core Tables

#### User Management
- **users**: User accounts (instructors, admins) with email, password hash, name, role

#### Course Management
- **courses**: Course basic information (title, code, description, links to instructor and class profile)
- **course_basic_info**: Detailed course information with versioning (discipline_info, course_info, class_info)
- **course_basic_info_versions**: Version history for course basic info (snapshot pattern)

#### Class Profile Management
- **class_profiles**: Class profiles (current active version, links to instructor)
- **class_profile_versions**: Version history for class profiles (complete audit trail)

#### Reading & Session Management
- **readings**: Reading materials (PDFs, documents) with file paths
- **reading_chunks**: Chunked reading content for processing
- **sessions**: Teaching sessions (week-based organization, links to course)
- **session_readings**: Many-to-many relationship between sessions and readings
- **session_items**: Independent content for each reading within a session

#### Scaffold Generation
- **scaffold_annotations**: Generated annotation scaffolds (current version, links to session and reading)
- **scaffold_annotation_versions**: Version history for scaffold annotations (tracks all edits, approvals, rejections)
- **annotation_highlight_coords**: Highlight coordinates for PDF annotations

### Key Relationships

- `courses.class_profile_id` → `class_profiles.id` (optional)
- `courses.instructor_id` → `users.id`
- `course_basic_info.course_id` → `courses.id` (1:1)
- `scaffold_annotations.session_id` → `sessions.id`
- `scaffold_annotations.reading_id` → `readings.id`
- `scaffold_annotations.current_version_id` → `scaffold_annotation_versions.id`

For detailed database logic documentation, see:
- [Class Profile Database Logic](docs/CLASS_PROFILE_DATABASE_LOGIC.md)
- [Course Database Logic](docs/COURSE_DATABASE_LOGIC.md)
- [Scaffold Generation Database Logic](docs/SCAFFOLD_GENERATION_DATABASE_LOGIC.md)

## API Endpoints

All endpoints follow RESTful conventions with resource hierarchy: `/api/courses/{course_id}/...`

For detailed API documentation with request/response examples, see [API_DOCUMENTATION.md](../API_DOCUMENTATION.md).

### Health Check
- `GET /health` - Check API health status

### User Authentication
- `POST /api/users/register` - Register a new user
- `POST /api/users/login` - Login user
- `GET /api/users/me` - Get current user (requires authentication)
- `GET /api/users/{user_id}` - Get user by ID
- `GET /api/users/email/{email}` - Get user by email

### Course Management
- `GET /api/courses/instructor/{instructor_id}` - Get courses by instructor
- `POST /api/courses/{course_id}/basic-info/edit` - Edit course basic information
- `POST /api/courses/{course_id}/design-considerations/edit` - Edit design considerations

### Class Profiles
- `POST /api/courses/{course_id}/class-profiles` - Create and generate class profile (use `course_id="new"` to create new course)
- `GET /api/class-profiles/{profile_id}` - Get class profile by ID
- `GET /api/class-profiles/instructor/{instructor_id}` - Get profiles by instructor
- `GET /api/class-profiles/{profile_id}/export` - Export approved profile
- `POST /api/courses/{course_id}/class-profiles/{profile_id}/approve` - Approve class profile
- `POST /api/courses/{course_id}/class-profiles/{profile_id}/edit` - Manually edit class profile
- `POST /api/courses/{course_id}/class-profiles/{profile_id}/llm-refine` - Refine profile using LLM

### Reading Management
- `POST /api/courses/{course_id}/readings/batch-upload` - Batch upload readings (with PDF content)
- `GET /api/readings` - Get reading list (query params: `course_id`, `instructor_id`)
- `DELETE /api/courses/{course_id}/readings/{reading_id}` - Delete a reading

### Session Management
- `POST /api/courses/{course_id}/sessions` - Create session and associate readings

### Scaffold Generation
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/generate` - Generate scaffolds (use `session_id="new"` to create new session)
- `GET /api/courses/{course_id}/sessions/{session_id}/scaffolds/bundle` - Get scaffolds bundle for a session
- `GET /api/courses/{course_id}/scaffolds/export` - Export approved scaffolds (query params: `session_id`, `reading_id`)
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/approve` - Approve a scaffold
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/edit` - Manually edit scaffold content
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/llm-refine` - Refine scaffold using LLM
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/reject` - Reject a scaffold
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/highlight-report` - Save PDF highlight coordinates

### Perusall Integration
- `POST /api/courses/{course_id}/readings/{reading_id}/perusall/annotations` - Upload annotations to Perusall
- `POST /api/courses/{course_id}/readings/{reading_id}/perusall/mapping` - Create Perusall mapping
- `GET /api/perusall/mapping/{course_id}/{reading_id}` - Get Perusall mapping

### Test/Development Endpoints
- `POST /api/test-scaffold-response` - Test scaffold response format
- `GET /api/test-scaffold-response` - Get test scaffold response
- `POST /api/reading-scaffolds` - Direct scaffold generation (internal use)
- `POST /api/threads/{thread_id}/review` - Thread-based review endpoint (legacy compatibility)

## Workflows

### Class Profile Generation Workflow

1. **Create Course & Basic Info**: Instructor provides course information (creates Course and CourseBasicInfo)
2. **Generate Profile**: LLM generates initial class profile JSON
3. **Create Class Profile**: Profile saved to database with version 1
4. **Link Course**: Course is linked to the generated class profile
5. **Review & Edit**: Instructor can manually edit or use LLM to refine (creates new versions)
6. **Approve**: Final approval returns the profile JSON (no new version unless edited)

**Versioning**: Every edit, LLM refinement, or approval creates a new version record for complete audit trail.

### Reading Scaffold Generation Workflow

1. **Material Analysis**: Analyze reading chunks for key concepts
2. **Focus Identification**: Identify focus areas for teaching
3. **Scaffold Generation**: Generate annotation scaffolds for each text fragment
4. **Database Storage**: Each scaffold saved with initial version (status: "draft")
5. **Review & Approval**: Instructor reviews, edits, refines, approves, or rejects scaffolds
6. **Version Tracking**: Every action (edit, LLM refine, approve, reject) creates a version record
7. **Export**: Export approved scaffolds (status: "accepted") for use

**Versioning**: Every change creates an immutable version record with change type, creator, and timestamp.

## Development

### Running the Server

```bash
# Development mode with auto-reload (new structure)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Legacy main.py (during migration)
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production mode
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Database Initialization

**Option 1: Using Python script**
```bash
python scripts/init_db.py
```

**Option 2: Using SQL schema**
Execute `supabase_schema.sql` in Supabase Dashboard SQL Editor

### Code Style

The project follows PEP 8 style guidelines. Consider using:
- `black` for code formatting
- `flake8` for linting
- `mypy` for type checking

### Database Migrations

For database schema changes, use Alembic:
```bash
# Create a new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

### Testing API Endpoints

See [docs/API_TEST_DATA.md](docs/API_TEST_DATA.md) for comprehensive test data examples and expected outcomes for all endpoints.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string (Supabase format) | Yes |
| `SUPABASE_DB_URL` | Alternative: Supabase database URL | Optional |
| `SUPABASE_URL` | Supabase project URL | Optional |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Optional |
| `GOOGLE_API_KEY` | Google Gemini API key | Yes |
| `PERUSALL_INSTITUTION` | Perusall institution name | Optional |
| `PERUSALL_API_TOKEN` | Perusall API token | Optional |
| `PERUSALL_COURSE_ID` | Perusall course ID | Optional |
| `PERUSALL_ASSIGNMENT_ID` | Perusall assignment ID | Optional |
| `PERUSALL_DOCUMENT_ID` | Perusall document ID | Optional |
| `PERUSALL_USER_ID` | Perusall user ID | Optional |

**Database URL Format:**
```
postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

## Version Control System

The application implements a comprehensive version control system for:

1. **Class Profiles**: Every edit, LLM refinement, or approval creates a version
2. **Course Basic Info**: Every edit creates a version with snapshot of old values
3. **Scaffold Annotations**: Every edit, LLM refine, approve, or reject creates a version

**Key Features:**
- Immutable version records (never modified)
- Sequential version numbering (1, 2, 3...)
- Complete audit trail (timestamp, creator, change type)
- Easy rollback to any previous version
- Current state always in main table, history in version table

See detailed documentation:
- [Class Profile Database Logic](docs/CLASS_PROFILE_DATABASE_LOGIC.md)
- [Course Database Logic](docs/COURSE_DATABASE_LOGIC.md)
- [Scaffold Generation Database Logic](docs/SCAFFOLD_GENERATION_DATABASE_LOGIC.md)

## File Organization

The project follows a modular structure:

- **app/api/routes/**: API endpoint handlers organized by domain
- **app/services/**: Business logic and database operations
- **app/workflows/**: LLM workflow definitions using LangGraph
- **app/models/**: SQLAlchemy ORM models
- **app/prompts/**: LLM prompt templates
- **app/utils/**: Utility functions and helpers
- **scripts/**: Database initialization and utility scripts
- **tests/**: Test files
- **docs/**: Documentation files
- **migrations/**: Database migration scripts

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[Add your license here]

## Support

For issues and questions, please open an issue on GitHub or contact the development team.

