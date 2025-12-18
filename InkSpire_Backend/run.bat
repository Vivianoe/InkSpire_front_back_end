@echo off
REM Start script for Inkspire Backend API (Windows)

cd /d "%~dp0"

REM Check if virtual environment exists
if not exist "venv" (
    echo ❌ Virtual environment not found. Please create it first:
    echo    python -m venv venv
    exit /b 1
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Check if FastAPI is installed
python -c "import fastapi" 2>nul
if errorlevel 1 (
    echo ❌ FastAPI not found. Installing dependencies...
    pip install -r requirements.txt
)

REM Run the application
echo 🚀 Starting Inkspire Backend API...
echo 📍 Running from: %CD%
echo 🌐 API will be available at: http://localhost:8000
echo 📚 API docs will be available at: http://localhost:8000/docs
echo.

REM Use new structure if app/main.py exists, otherwise use legacy main.py
if exist "app\main.py" (
    echo ✅ Using new structure (app/main.py)
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) else (
    echo ⚠️  Using legacy structure (main.py)
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
)

