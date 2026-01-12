# Inkspire

**Inkspire** is an AI-powered educational system that helps instructors create and manage reading tasks with intelligent annotation scaffolds. The system uses Large Language Models (LLMs) to help instructors create class profiles, analyze reading materials, generate teaching scaffolds, and provide interactive PDF annotation capabilities.

## 🎯 Overview

Inkspire consists of three main components:

1. **Frontend** - Next.js React application for user interface
2. **Backend** - FastAPI Python service for API and business logic
3. **Database** - PostgreSQL database hosted on Supabase

The platform enables instructors to:
- Create courses and generate AI-powered class profiles
- Upload reading materials (PDFs) and organize them into sessions
- Automatically generate annotation scaffolds using LLM workflows
- Review, edit, and approve scaffolds with full version control
- Export approved scaffolds and integrate with Perusall

## 🏗️ Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Frontend      │         │    Backend      │         │   Supabase      │
│   (Next.js)     │◄───────►│   (FastAPI)    │◄───────►│  (PostgreSQL)   │
│   Port: 3000    │  HTTP   │   Port: 8000    │  SQL    │   Cloud DB      │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 15.5.4 (App Router)
- **Language**: TypeScript 5.9.3
- **UI Library**: React 19.1.0
- **Styling**: Tailwind CSS 3.4.18 + CSS Modules
- **PDF Rendering**: PDF.js 5.4.296
- **UI Components**: Headless UI, Heroicons
- **Mocking**: MSW (Mock Service Worker) 2.4.2

### Backend
- **Framework**: FastAPI
- **Language**: Python 3.9+
- **Database ORM**: SQLAlchemy 2.0+
- **LLM Framework**: LangChain, LangGraph
- **LLM Provider**: Google Gemini (gemini-2.5-flash)
- **Authentication**:
  - Supabase Auth (managed user authentication service)
  - JWT tokens with python-jose (local HS256 validation)
  - bcrypt for password hashing
  - Fast local token validation (no API calls needed)
- **PDF Processing**: pypdf

### Database & Infrastructure
- **Database**: PostgreSQL (via Supabase)
- **Storage**: Supabase Storage (for PDF files)
- **Authentication**: Supabase Auth (user management, JWT tokens)
- **Token Validation**: Local JWT validation using HS256 algorithm (fast, no external API calls)

## 📁 Project Structure

```
Inkspire_front_back_end/
├── inkspire_front/              # Frontend application
│   └── my-app/
│       ├── src/
│       │   ├── app/             # Next.js App Router pages
│       │   │   ├── create-task/ # Scaffold generation page
│       │   │   ├── class-profile/ # Class profile management
│       │   │   └── signin/      # Authentication
│       │   ├── components/      # React components
│       │   │   ├── layout/      # Navigation, layout
│       │   │   └── ui/          # UI components (PdfPreview)
│       │   └── utils/           # Utility functions
│       ├── public/              # Static assets
│       ├── package.json
│       └── next.config.ts       # Next.js configuration
│
├── InkSpire_Backend/            # Backend application
│   ├── app/
│   │   ├── main.py              # FastAPI application entry point
│   │   ├── api/
│   │   │   ├── models.py        # Pydantic request/response models
│   │   │   └── routes/          # API route handlers
│   │   │       ├── users.py
│   │   │       ├── courses.py
│   │   │       ├── class_profiles.py
│   │   │       ├── readings.py
│   │   │       ├── scaffolds.py
│   │   │       └── perusall.py
│   │   ├── core/
│   │   │   └── database.py      # Database connection
│   │   ├── models/
│   │   │   └── models.py        # SQLAlchemy ORM models
│   │   ├── services/            # Business logic layer
│   │   ├── workflows/           # LLM workflow definitions
│   │   ├── prompts/             # LLM prompt templates
│   │   └── utils/               # Utility functions
│   ├── auth/                    # Authentication modules
│   │   ├── supabase.py         # Supabase Auth API integration (JWT validation)
│   │   └── dependencies.py     # FastAPI dependency injection for route protection
│   ├── scripts/                 # Database initialization scripts
│   ├── migrations/              # Database migration scripts
│   ├── docs/                    # Documentation
│   ├── requirements.txt
│   ├── env.example
│   └── run.sh / run.bat         # Startup scripts
│
└── README.md                    # This file
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.9+
- **PostgreSQL** database (Supabase account recommended)
- **Google Gemini API** key

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Inkspire_front_back_end
```

### 2. Backend Setup

```bash
cd InkSpire_Backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment variables template
cp env.example .env

# Edit .env with your configuration (see Environment Variables section)
```

### 3. Database Setup (Supabase)

1. **Create a Supabase project** at [supabase.com](https://supabase.com)
2. **Get your database connection string**:
   - Go to Settings → Database → Connection string → URI
   - Format: `postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres`
3. **Get your Supabase API keys**:
   - Go to Settings → API
   - Copy `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_KEY`
4. **Obtain JWT Secret for Token Validation**:
   - Go to Settings → API in Supabase Dashboard
   - Look for "JWT Secret" under "Exposed as environment variable" section
   - Copy this value and add to your `.env` as `SUPABASE_JWT_SECRET`
   - This enables fast local JWT validation without making API calls to Supabase
5. **Initialize the database**:
   ```bash
   # Option 1: Using Python script
   python scripts/init_db.py
   
   # Option 2: Execute SQL schema directly in Supabase Dashboard
   # Open Supabase SQL Editor and run supabase_schema.sql
   ```
6. **Set up Supabase Storage**:
   - Create a bucket named `readings` in Supabase Storage
   - Configure bucket policies for your use case

7. **Create Test User**:
   Before using the application, you need to create a test user in the Supabase database. Run the following SQL in the Supabase SQL Editor:

   ```sql
   INSERT INTO "public"."users" (
     "id", 
     "email", 
     "password_hash", 
     "name", 
     "role", 
     "created_at", 
     "supabase_user_id", 
     "updated_at"
   ) VALUES (
     '550e8400-e29b-41d4-a716-446655440000', 
     'example@gmail.com', 
     'hashed_password_here', 
     'John Doe', 
     'instructor', 
     '2025-12-17 23:42:26.768888+00', 
     null, 
     '2025-12-17 23:44:50.819598+00'
   );
   ```

   **Note**: Replace `'hashed_password_here'` with an actual bcrypt hash of your password. You can generate one using Python:

   ```python
   import bcrypt
   password = "your_password"
   hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
   print(hashed)
   ```

### 4. Frontend Setup

```bash
cd inkspire_front/my-app

# Install dependencies
npm install

# The frontend is configured to proxy API requests to the backend
# No additional configuration needed if backend runs on localhost:8000
```

### 5. Run the Application

**Terminal 1 - Backend:**
```bash
cd InkSpire_Backend
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Using startup script (recommended)
./run.sh  # On Windows: run.bat

# Or manually
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd inkspire_front/my-app
npm run dev
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### 6. Testing Scaffold Generation

After clicking the "Generate Scaffolds" button, if you'd like to repeatedly test behavior on the same page, it's more efficient to copy the content shown in the terminal under:

```
[generate_scaffolds] Encoded content:
```

And paste it into the `@router.post("/test-scaffold-response")` endpoint. This avoids repeated LLM calls and makes testing easier.

## 🔐 User Authentication

### Architecture Overview

The InkSpire platform uses **Supabase Auth** for user management combined with a custom users table for role-based access control. This hybrid approach provides:

- **Secure authentication** via Supabase Auth API (managed password hashing and user management)
- **Fast token validation** using local JWT verification (no API calls needed)
- **Role-based access control** (instructor, admin) via custom users table
- **Automatic user profile creation** on signup with role assignment

### Authentication Flow

**1. Registration**:
   - User submits email, password, and name to `/api/users/register`
   - Backend creates user account in Supabase Auth
   - Custom user record created in users table with role assignment (default: "instructor")
   - Access token (JWT) and refresh token returned to frontend
   - Frontend stores session using Supabase SDK's `setSession()`
   - Frontend shows email confirmation modal
   - User receives confirmation email and clicks verification link
   - Frontend detects email confirmation via Supabase auth state changes
   - Email confirmed modal appears, user clicks "Continue to Perusall Setup" to proceed
   - Frontend shows Perusall setup modal
   - User enters Perusall institution ID and API token
   - Backend validates credentials and creates user_perusall_credentials record
   - User selects courses to import from Perusall
   - Backend imports courses and creates course records
   - User is redirected to dashboard

**2. Login**:
   - User submits email and password to `/api/users/login`
   - Supabase Auth validates credentials
   - Access token and refresh token returned
   - Frontend establishes session with both tokens

**3. API Request Authentication**:
   - Frontend includes JWT in Authorization header: `Authorization: Bearer <access_token>`
   - Backend validates JWT locally using HS256 algorithm (fast, no API call)
   - User object fetched from custom users table based on Supabase user ID
   - Route handler processes authenticated request with full user context

### Token Management

- **Access Tokens**: JWT tokens valid for ~1 hour, used for all API requests
- **Refresh Tokens**: Long-lived tokens used to obtain new access tokens when they expire
- **Local Validation**: Backend validates JWT signature and expiration without making API calls (HS256 algorithm)
- **Fast Authentication**: Dependency injection pattern provides `get_current_user` for easy route protection

### Key Files

**Backend**:
- `auth/supabase.py` - Supabase Auth integration (signup, login, logout, JWT validation)
- `auth/dependencies.py` - FastAPI dependency for JWT validation and user lookup
- `app/api/routes/users.py` - User registration, login, and profile endpoints
- `app/services/user_service.py` - User database operations
- `app/models/models.py` - User model with Supabase ID linking

**Frontend**:
- `src/contexts/AuthContext.tsx` - Global authentication state management
- `src/components/auth/` - Sign-in and sign-up UI components

### Usage Example

Protecting routes with authentication:

```python
from fastapi import Depends
from auth.dependencies import get_current_user
from app.models.models import User

@app.get("/api/protected-resource")
async def protected_route(current_user: User = Depends(get_current_user)):
    """This route requires a valid JWT token"""
    return {
        "user_id": current_user.id,
        "email": current_user.email,
        "role": current_user.role
    }
```

The `get_current_user` dependency automatically validates the JWT token and returns the full User object from the database.

## ⚙️ Environment Variables

### Backend (.env)

Create a `.env` file in `InkSpire_Backend/` directory:

```env
# ============================================
# Authentication Configuration (Required)
# ============================================
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_JWT_SECRET=your_jwt_secret_here

# Note: Get SUPABASE_JWT_SECRET from Supabase Dashboard → Settings → API
# Look for "JWT Secret" under "Exposed as environment variable" section
# This enables fast local JWT validation without making API calls

# ============================================
# Database Configuration (Required)
# ============================================
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
# or
SUPABASE_DB_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres

# Supabase Configuration (Required for Storage)
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_KEY=your_anon_key_here  # Optional, for Auth operations

# Google Gemini API (Required for LLM features)
GOOGLE_API_KEY=your_google_api_key_here

# ============================================
# Perusall Integration
# ============================================
# Required for live Perusall API (course import, annotation posting)
PERUSALL_INSTITUTION=your_institution
PERUSALL_API_TOKEN=your_api_token
PERUSALL_USER_ID=your_user_id

# Mock mode for development/testing (Optional - default: false)
PERUSALL_MOCK_MODE=false
# Set to 'true' to use mock data instead of live Perusall API
# Perfect for testing without real API credentials

# Optional fallback IDs (auto-fetched if not provided)
# PERUSALL_COURSE_ID=perusall_course_id
# PERUSALL_ASSIGNMENT_ID=perusall_assignment_id
# PERUSALL_DOCUMENT_ID=perusall_document_id
# Note: System automatically fetches these from Perusall API based on course/reading names
```

### Frontend

The frontend automatically proxies API requests to the backend. No environment variables needed for basic setup.

## 📚 API Documentation

Once the backend is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Complete API Reference**: [API_DOCUMENTATION.md](API_DOCUMENTATION.md) - Detailed request/response examples

### Key API Endpoints

All endpoints follow RESTful conventions with resource hierarchy: `/api/courses/{course_id}/...`

#### User Authentication
- `POST /api/users/register` - Register a new user
- `POST /api/users/login` - Login user
- `GET /api/users/me` - Get current user (requires valid JWT token)
- `GET /api/users/{user_id}` - Get user by ID
- `GET /api/users/email/{email}` - Get user by email

**Token Management:**
- **Access Tokens**: JWT tokens (HS256) valid for ~1 hour, used for all API requests
- **Refresh Tokens**: Long-lived tokens used to obtain new access tokens when they expire
- **Authentication**: Include in requests as `Authorization: Bearer <access_token>`
- **Local Validation**: Backend validates JWT signature locally (no Supabase API calls) for fast performance

#### Course Management
- `GET /api/courses/instructor/{instructor_id}` - Get courses by instructor
- `POST /api/courses/{course_id}/basic-info/edit` - Edit course basic information
- `POST /api/courses/{course_id}/design-considerations/edit` - Edit design considerations

#### Class Profiles
- `POST /api/courses/{course_id}/class-profiles` - Create and generate class profile (use `course_id="new"` to create new course)
- `GET /api/class-profiles/{profile_id}` - Get class profile by ID
- `GET /api/class-profiles/instructor/{instructor_id}` - Get profiles by instructor
- `GET /api/class-profiles/{profile_id}/export` - Export approved profile
- `POST /api/courses/{course_id}/class-profiles/{profile_id}/approve` - Approve class profile
- `POST /api/courses/{course_id}/class-profiles/{profile_id}/edit` - Edit class profile
- `POST /api/courses/{course_id}/class-profiles/{profile_id}/llm-refine` - Refine profile using LLM

#### Reading Management
- `POST /api/courses/{course_id}/readings/batch-upload` - Batch upload readings (with PDF content)
- `GET /api/readings` - Get reading list (query params: `course_id`, `instructor_id`)
- `DELETE /api/courses/{course_id}/readings/{reading_id}` - Delete a reading

#### Session Management
- `POST /api/courses/{course_id}/sessions` - Create session and associate readings

#### Scaffold Generation
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/generate` - Generate scaffolds (use `session_id="new"` to create new session)
- `GET /api/courses/{course_id}/sessions/{session_id}/scaffolds/bundle` - Get scaffolds bundle for a session
- `GET /api/courses/{course_id}/scaffolds/export` - Export approved scaffolds (query params: `session_id`, `reading_id`)
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/approve` - Approve scaffold
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/edit` - Edit scaffold
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/llm-refine` - Refine scaffold using LLM
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/reject` - Reject scaffold
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/highlight-report` - Save PDF highlight coordinates

#### Perusall Course Import
- `POST /api/perusall/authenticate` - Validate and save user Perusall credentials
- `GET /api/perusall/courses` - Fetch available courses from Perusall (requires authentication)
- `POST /api/perusall/import-courses` - Import selected Perusall courses as Inkspire courses

#### Perusall Integration
- `POST /api/courses/{course_id}/readings/{reading_id}/perusall/annotations` - Upload annotations to Perusall
- `POST /api/courses/{course_id}/readings/{reading_id}/perusall/mapping` - Create Perusall mapping
- `GET /api/perusall/mapping/{course_id}/{reading_id}` - Get Perusall mapping

**Note:** Set `PERUSALL_MOCK_MODE=true` in .env for development/testing without real API credentials.

For detailed API documentation with request/response examples, see:
- [Complete API Documentation](API_DOCUMENTATION.md) - Full API reference with examples
- [Backend README](InkSpire_Backend/README.md) - Backend setup and architecture
- [API Test Data](InkSpire_Backend/docs/API_TEST_DATA.md) - Test examples

## 🗄️ Database Schema

The application uses PostgreSQL with the following main tables:

### Core Tables
- **users** - User accounts (instructors, admins) with Supabase Auth integration
- **courses** - Course information (includes `perusall_course_id` for Perusall integration)
- **course_basic_info** - Detailed course information with versioning
- **class_profiles** - AI-generated class profiles
- **class_profile_versions** - Version history for class profiles
- **readings** - Reading materials (PDFs)
- **reading_chunks** - Chunked reading content
- **sessions** - Teaching sessions
- **session_item** - Marks each reading a session
- **scaffold_annotations** - Generated annotation scaffolds
- **scaffold_annotation_versions** - Version history for scaffolds
- **annotation_highlight_coords** - PDF highlight coordinates

### Integration Tables
- **user_perusall_credentials** - Stored Perusall API credentials per user (institution ID, API token)
- **perusall_mappings** - Maps Inkspire course/reading pairs to Perusall IDs (course_id, assignment_id, document_id)

### Version Control

The system implements comprehensive version control:
- Every edit, LLM refinement, or approval creates an immutable version record
- Complete audit trail with timestamps, creators, and change types
- Easy rollback to any previous version

See [Database Documentation](InkSpire_Backend/docs/) for detailed schema information.

## 🔄 Workflows

### Class Profile Generation

1. Instructor creates a course with basic information
2. System generates AI-powered class profile using LLM
3. Instructor reviews, edits, or refines the profile
4. Profile is approved and linked to the course

### Reading Scaffold Generation

1. Instructor uploads reading materials (PDFs)
2. PDFs are automatically chunked for processing
3. System runs Material → Focus → Scaffold workflow:
   - **Material Analysis**: Analyzes reading chunks for key concepts
   - **Focus Identification**: Identifies focus areas for teaching
   - **Scaffold Generation**: Generates annotation scaffolds
4. Scaffolds are saved with initial "draft" status
5. Instructor reviews, edits, refines, approves, or rejects scaffolds
6. Approved scaffolds can be exported or sent to Perusall

## 🧪 Development

### Initial Setup: Create Test User

Before using the application, you need to create a test user in the Supabase database. Run the following SQL in the Supabase SQL Editor:

```sql
INSERT INTO "public"."users" (
  "id", 
  "email", 
  "password_hash", 
  "name", 
  "role", 
  "created_at", 
  "supabase_user_id", 
  "updated_at"
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000', 
  'example@gmail.com', 
  'hashed_password_here', 
  'John Doe', 
  'instructor', 
  '2025-12-17 23:42:26.768888+00', 
  null, 
  '2025-12-17 23:44:50.819598+00'
);
```

**Note**: Replace `'hashed_password_here'` with an actual bcrypt hash of your password. You can generate one using Python:

```python
import bcrypt
password = "your_password"
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
print(hashed)
```

### Testing Scaffold Generation

After clicking the "Generate Scaffolds" button, if you'd like to repeatedly test behavior on the same page, it's more efficient to copy the content shown in the terminal under:

```
[generate_scaffolds] Encoded content:
```

And paste it into the `@router.post("/test-scaffold-response")` endpoint. This avoids repeated LLM calls and makes testing easier.

### Backend Development

```bash
cd InkSpire_Backend
source venv/bin/activate

# Run with auto-reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests
python -m pytest tests/

# Check code style
black app/
flake8 app/
```

### Frontend Development

```bash
cd inkspire_front/my-app

# Development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

### Database Migrations

For schema changes, create migration scripts in `InkSpire_Backend/migrations/`:

```bash
# Execute migration SQL in Supabase Dashboard SQL Editor
# Or use Alembic (if configured)
alembic revision --autogenerate -m "description"
alembic upgrade head
```

## 🔐 Supabase Configuration

### Storage Setup

1. **Create Storage Bucket**:
   - Go to Storage in Supabase Dashboard
   - Create a bucket named `readings`
   - Set bucket to private (recommended) or public

2. **Configure Bucket Policies**:
   - Allow authenticated users to upload files
   - Allow service role to read/write files

3. **File Organization**:
   - Files are stored as: `course_{course_id}/{reading_id}_{filename}.pdf`
   - Signed URLs are generated for secure access

### Database Connection

The backend connects to Supabase PostgreSQL using:
- Connection string from Supabase Dashboard
- Service role key for admin operations
- Anon key for client-side operations (optional)

### Authentication (Optional)

If using Supabase Auth:
- Configure authentication providers in Supabase Dashboard
- Update backend auth dependencies
- Configure frontend to use Supabase Auth client

## 📖 Documentation

### Backend Documentation
- [Backend README](InkSpire_Backend/README.md) - Detailed backend documentation
- [API Test Data](InkSpire_Backend/docs/API_TEST_DATA.md) - API examples and test data
- [Database Logic](InkSpire_Backend/docs/) - Database schema and logic documentation
- [Migration Guide](InkSpire_Backend/docs/MIGRATION_GUIDE.md) - Code organization guide

### Frontend Documentation
- [Frontend README](inkspire_front/README.md) - Frontend setup and structure

## 📌 Perusall Integration

The InkSpire platform provides comprehensive integration with Perusall, enabling instructors to import courses, manage course-reading mappings, and post annotations with highlight coordinates.

### Quick Start: Mock Mode for Development

**For development and testing without live Perusall API access:**

Add the following to your `.env` file:
```env
PERUSALL_MOCK_MODE=true
```

**When mock mode is enabled:**
- All Perusall API calls return predefined mock data
- No actual API credentials needed for testing
- Perfect for testing annotation workflows and course imports
- Available mock courses include:
  - `[MOCK] Introduction to Python` (CS101)
  - `[MOCK] Data Structures and Algorithms` (CS201)
  - `InkSpire` (test course)
  - Various EDUC courses (5913, 6144-001, 5050-002)

**To use live Perusall API:** Set `PERUSALL_MOCK_MODE=false` (or omit it) and provide real API credentials.

### Prerequisites for Live Perusall Integration

To successfully integrate with Perusall for course import and annotation posting:

1. **Environment Variables** (Required):
   - `PERUSALL_INSTITUTION`: Your Perusall institution identifier
   - `PERUSALL_API_TOKEN`: Your Perusall API token
   - `PERUSALL_USER_ID`: The Perusall user ID to post annotations as
   - `PERUSALL_MOCK_MODE`: Set to `false` for live API (default behavior)

2. **Course Name Matching**:
   - The course name in Inkspire must **exactly match** (case-insensitive, spaces normalized) the course name in Perusall
   - The system will automatically match courses by name when posting annotations
   - If no exact match is found, the system will return an error with available course names

3. **Reading Name Matching**:
   - The reading material name in Inkspire must **exactly match** (case-insensitive, spaces normalized) the reading name in Perusall's course library
   - The system will:
     1. Fetch the course library from Perusall
     2. Match the reading by name to get the `reading_id`
     3. Find the assignment that contains this reading
     4. Use the `reading_id` as the `document_id` for posting annotations

4. **Automatic Mapping**:
   - On first successful post, the system automatically creates a mapping between Inkspire course/reading and Perusall IDs
   - This mapping is stored in the `perusall_mappings` table for future use
   - Subsequent posts will use the cached mapping, avoiding repeated API calls

5. **Error Handling**:
   - If authentication fails, the system will return an error indicating invalid credentials
   - If course/reading names don't match, the system will list available options
   - All errors include detailed logging for troubleshooting

### Manual Mapping Management

Optionally manage Perusall course/reading mappings manually:

```bash
# Create or update mapping
POST /api/courses/{course_id}/readings/{reading_id}/perusall/mapping
{
  "course_id": "inkspire_course_uuid",
  "reading_id": "inkspire_reading_uuid",
  "perusall_course_id": "perusall_course_id",
  "perusall_assignment_id": "perusall_assignment_id",
  "perusall_document_id": "perusall_document_id"
}

# Get existing mapping
GET /api/perusall/mapping/{course_id}/{reading_id}
```

Manual mappings useful for:
- Pre-configuring mappings before annotation posting
- Bypassing automatic name-based matching
- Troubleshooting mapping issues

## 🐛 Troubleshooting

### Backend Issues

**Import Errors:**
```bash
# Ensure you're in the InkSpire_Backend directory
cd InkSpire_Backend
source venv/bin/activate
python -c "from app.main import app; print('OK')"
```

**Database Connection Issues:**
- Verify `DATABASE_URL` in `.env` is correct
- Check Supabase project is active
- Test connection: `python scripts/verify_db.py`

**LLM API Errors:**
- Verify `GOOGLE_API_KEY` is set correctly
- Check API quota and billing
- Review error logs for specific error messages

### Frontend Issues

**API Proxy Errors:**
- Ensure backend is running on `http://localhost:8000`
- Check `next.config.ts` proxy configuration
- Verify CORS settings in backend

**PDF Rendering Issues:**
- Check browser console for PDF.js errors
- Verify PDF file is accessible
- Check PDF URL is valid (for Supabase Storage)

### Supabase Issues

**Storage Access:**
- Verify bucket exists and is named `readings`
- Check bucket policies allow access
- Verify service role key has correct permissions

**Database Access:**
- Verify connection string format
- Check database is not paused
- Review Supabase logs for connection errors

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

[Add your license here]

## 🆘 Support

For issues and questions:
- Open an issue on GitHub
- Contact the development team
- Check documentation in `docs/` directory

## 🙏 Acknowledgments

- Built with [FastAPI](https://fastapi.tiangolo.com/)
- Frontend powered by [Next.js](https://nextjs.org/)
- Database hosted on [Supabase](https://supabase.com/)
- LLM powered by [Google Gemini](https://deepmind.google/technologies/gemini/)

