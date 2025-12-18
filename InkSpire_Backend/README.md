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
Inkspire/
├── main.py                      # FastAPI application and API endpoints
├── database.py                  # Database connection and configuration
├── models.py                    # SQLAlchemy ORM models (all tables)
├── init_db.py                   # Database initialization script
├── supabase_schema.sql          # Database schema SQL (Supabase compatible)
│
├── user_service.py              # User authentication services
├── course_service.py            # Course management services
├── class_profile_service.py    # Class profile services
├── reading_service.py           # Reading management services
├── session_service.py           # Session management services
├── reading_scaffold_service.py  # Scaffold annotation services
│
├── workflow.py                  # Reading scaffold generation workflow
├── profile.py                   # Class profile generation workflow
├── scaffold_reviewer.py         # CLI tool for reviewing scaffolds
│
├── prompts/                     # LLM prompt templates
│   ├── material_prompt.py
│   ├── focus_prompt.py
│   ├── scaffold_prompt.py
│   └── class_profile_prompt.py
│
├── Documentation Files           # Detailed documentation
│   ├── CLASS_PROFILE_DATABASE_LOGIC.md
│   ├── CLASS_PROFILE_EXAMPLE.md
│   ├── COURSE_DATABASE_LOGIC.md
│   └── SCAFFOLD_GENERATION_DATABASE_LOGIC.md
│
├── API_TEST_DATA.md             # API test data and expected outcomes
├── requirements.txt             # Python dependencies
└── README.md                    # This file
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
cd Inkspire
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
```

5. **Initialize the database**:
```bash
python init_db.py
```

Alternatively, you can run the SQL schema directly in Supabase:
```bash
# Execute supabase_schema.sql in your Supabase SQL editor
```

6. **Run the application**:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

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
- **sessions**: Teaching sessions (week-based organization, links to course)
- **session_readings**: Many-to-many relationship between sessions and readings
- **session_items**: Independent content for each reading within a session

#### Scaffold Generation
- **scaffold_annotations**: Generated annotation scaffolds (current version, links to session and reading)
- **scaffold_annotation_versions**: Version history for scaffold annotations (tracks all edits, approvals, rejections)

### Key Relationships

- `courses.class_profile_id` → `class_profiles.id` (optional)
- `courses.instructor_id` → `users.id`
- `course_basic_info.course_id` → `courses.id` (1:1)
- `scaffold_annotations.session_id` → `sessions.id`
- `scaffold_annotations.reading_id` → `readings.id`

For detailed database logic documentation, see:
- [Class Profile Database Logic](CLASS_PROFILE_DATABASE_LOGIC.md)
- [Course Database Logic](COURSE_DATABASE_LOGIC.md)
- [Scaffold Generation Database Logic](SCAFFOLD_GENERATION_DATABASE_LOGIC.md)

## API Endpoints

### Health Check
- `GET /health` - Check API health status

### User Authentication
- `POST /api/users/register` - Register a new user
- `POST /api/users/login` - Login user
- `GET /api/users/{user_id}` - Get user by ID
- `GET /api/users/email/{email}` - Get user by email

### Course Management
- `POST /api/basic_info/edit` - Edit course basic information
- `POST /api/design-considerations/edit` - Edit design considerations

### Class Profiles
- `POST /api/class-profiles` - Create and generate class profile
- `POST /api/class-profiles/{profile_id}/approve` - Approve class profile
- `POST /api/class-profiles/{profile_id}/edit` - Manually edit class profile
- `POST /api/class-profiles/{profile_id}/llm-refine` - Refine profile using LLM
- `GET /api/class-profiles/{profile_id}` - Get class profile by ID
- `GET /api/class-profiles/instructor/{instructor_id}` - Get profiles by instructor
- `GET /api/class-profiles/{profile_id}/export` - Export approved profile

### Reading Management
- `POST /api/readings/batch-upload` - Batch upload readings
- `GET /api/readings` - Get reading list (filter by course_id and/or instructor_id)

### Scaffold Generation
- `POST /api/reading-scaffolds` - Generate scaffolds via Material → Focus → Scaffold workflow
- `POST /api/annotation-scaffolds/{scaffold_id}/approve` - Approve a scaffold (creates version)
- `POST /api/annotation-scaffolds/{scaffold_id}/reject` - Reject a scaffold (creates version)
- `POST /api/annotation-scaffolds/{scaffold_id}/edit` - Manually edit scaffold content (creates version)
- `POST /api/annotation-scaffolds/{scaffold_id}/llm-refine` - Refine scaffold using LLM (creates version)
- `GET /api/annotation-scaffolds/export` - Export approved scaffolds (filter by reading_id or session_id)

### Perusall Integration
- `POST /api/perusall/annotations` - Process Perusall annotations

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

## Usage Examples

### User Registration

```bash
POST /api/users/register
{
  "email": "instructor@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "role": "instructor"
}
```

### Create a Class Profile

```bash
POST /api/class-profiles
{
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Introduction to Computer Science",
  "course_code": "CS101",
  "description": "Basic programming concepts",
  "class_input": {
    "discipline_info": {
      "discipline": "Computer Science",
      "subdiscipline": "Programming Fundamentals"
    },
    "course_info": {
      "syllabus_overview": "Introduction to programming",
      "learning_objectives": ["Understand variables", "Master loops"]
    },
    "class_info": {
      "class_size": 25,
      "student_background": "Mixed experience levels",
      "prerequisites": "None"
    }
  }
}
```

This endpoint:
1. Creates a `Course` record
2. Creates a `CourseBasicInfo` record
3. Generates class profile via LLM workflow
4. Creates a `ClassProfile` with version 1
5. Links the course to the class profile

### Generate Scaffolds

```bash
POST /api/reading-scaffolds
{
  "session_id": "bb0e8400-e29b-41d4-a716-446655440000",
  "reading_id": "880e8400-e29b-41d4-a716-446655440000",
  "class_profile": {
    "class_id": "class_001",
    "profile": {...},
    "design_consideration": "..."
  },
  "reading_chunks": {
    "chunks": [
      {
        "chunk_id": "chunk_001",
        "text": "Data structures are fundamental...",
        "page_number": 1,
        "start_offset": 0,
        "end_offset": 500
      }
    ]
  },
  "reading_info": {
    "assignment_id": "assignment_001",
    "session_description": "Week 1 session",
    "assignment_description": "Read and annotate chapter 1",
    "assignment_objective": "Understand basic data structures"
  }
}
```

This endpoint:
1. Runs Material → Focus → Scaffold pipeline
2. Creates `ScaffoldAnnotation` records for each scaffold
3. Creates initial version 1 for each annotation (change_type: "pipeline")
4. Returns review objects for instructor approval

### Edit Course Basic Info

```bash
POST /api/basic_info/edit
{
  "course_id": "660e8400-e29b-41d4-a716-446655440000",
  "discipline_info_json": {
    "discipline": "Computer Science",
    "subdiscipline": "Artificial Intelligence"
  },
  "course_info_json": {
    "syllabus_overview": "Updated overview",
    "learning_objectives": ["Understand AI", "Master ML"]
  },
  "class_info_json": {
    "class_size": 30,
    "student_background": "Advanced students",
    "prerequisites": "CS101"
  }
}
```

This endpoint:
1. Gets current `CourseBasicInfo`
2. Creates a new version with **old values** (snapshot)
3. Updates `CourseBasicInfo` with **new values**
4. Sets `current_version_id` to the new version

### Batch Upload Readings

```bash
POST /api/readings/batch-upload
{
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
  "course_id": "660e8400-e29b-41d4-a716-446655440000",
  "readings": [
    {
      "title": "Reading 1",
      "file_path": "path/to/file.pdf",
      "source_type": "uploaded"
    }
  ]
}
```

## Development

### Running the Server

```bash
# Development mode with auto-reload
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production mode
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Database Initialization

**Option 1: Using Python script**
```bash
python init_db.py
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

See [API_TEST_DATA.md](API_TEST_DATA.md) for comprehensive test data examples and expected outcomes for all endpoints.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string (Supabase format) | Yes |
| `SUPABASE_DB_URL` | Alternative: Supabase database URL | Optional |
| `SUPABASE_URL` | Supabase project URL | Optional |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Optional |
| `GOOGLE_API_KEY` | Google Gemini API key | Yes |

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
- [Class Profile Database Logic](CLASS_PROFILE_DATABASE_LOGIC.md)
- [Course Database Logic](COURSE_DATABASE_LOGIC.md)
- [Scaffold Generation Database Logic](SCAFFOLD_GENERATION_DATABASE_LOGIC.md)

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

