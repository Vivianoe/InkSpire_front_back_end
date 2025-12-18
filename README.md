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
- **Authentication**: bcrypt, python-jose
- **PDF Processing**: pypdf

### Database & Infrastructure
- **Database**: PostgreSQL (via Supabase)
- **Storage**: Supabase Storage (for PDF files)
- **Authentication**: Supabase Auth (optional)

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
4. **Initialize the database**:
   ```bash
   # Option 1: Using Python script
   python scripts/init_db.py
   
   # Option 2: Execute SQL schema directly in Supabase Dashboard
   # Open Supabase SQL Editor and run supabase_schema.sql
   ```
5. **Set up Supabase Storage**:
   - Create a bucket named `readings` in Supabase Storage
   - Configure bucket policies for your use case

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

## ⚙️ Environment Variables

### Backend (.env)

Create a `.env` file in `InkSpire_Backend/` directory:

```env
# Database Configuration (Required)
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
# or
SUPABASE_DB_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres

# Supabase Configuration (Required for Storage)
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_KEY=your_anon_key_here  # Optional, for Auth operations

# Google Gemini API (Required for LLM features)
GOOGLE_API_KEY=your_google_api_key_here

# Perusall Integration (Optional)
PERUSALL_INSTITUTION=your_institution
PERUSALL_API_TOKEN=your_api_token
PERUSALL_COURSE_ID=your_course_id
PERUSALL_ASSIGNMENT_ID=your_assignment_id
PERUSALL_DOCUMENT_ID=your_document_id
PERUSALL_USER_ID=your_user_id
```

### Frontend

The frontend automatically proxies API requests to the backend. No environment variables needed for basic setup.

## 📚 API Documentation

Once the backend is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Key API Endpoints

#### User Authentication
- `POST /api/users/register` - Register a new user
- `POST /api/users/login` - Login user
- `GET /api/users/me` - Get current user

#### Course Management
- `GET /api/courses/instructor/{instructor_id}` - Get courses by instructor
- `POST /api/basic_info/edit` - Edit course basic information
- `POST /api/design-considerations/edit` - Edit design considerations

#### Class Profiles
- `POST /api/class-profiles` - Create and generate class profile
- `GET /api/class-profiles/{profile_id}` - Get class profile
- `POST /api/class-profiles/{profile_id}/edit` - Edit class profile
- `POST /api/class-profiles/{profile_id}/llm-refine` - Refine profile using LLM

#### Reading Management
- `POST /api/readings/batch-upload` - Batch upload readings (PDFs)
- `GET /api/readings` - Get reading list

#### Scaffold Generation
- `POST /api/generate-scaffolds` - Generate scaffolds for readings
- `POST /api/annotation-scaffolds/{scaffold_id}/approve` - Approve scaffold
- `POST /api/annotation-scaffolds/{scaffold_id}/edit` - Edit scaffold
- `POST /api/annotation-scaffolds/{scaffold_id}/llm-refine` - Refine scaffold using LLM
- `GET /api/annotation-scaffolds/by-session/{session_id}` - Get scaffolds by session
- `POST /api/highlight-report` - Save PDF highlight coordinates

#### Perusall Integration
- `POST /api/perusall/annotations` - Upload annotations to Perusall

For detailed API documentation, see:
- [Backend README](InkSpire_Backend/README.md)
- [API Test Data](InkSpire_Backend/docs/API_TEST_DATA.md)

## 🗄️ Database Schema

The application uses PostgreSQL with the following main tables:

### Core Tables
- **users** - User accounts (instructors, admins)
- **courses** - Course information
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

