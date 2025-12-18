#!/bin/bash
# Start script for Inkspire Backend API

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Please create it first:"
    echo "   python -m venv venv"
    exit 1
fi

# Activate virtual environment
source venv/bin/activate

# Check if FastAPI is installed
if ! python -c "import fastapi" 2>/dev/null; then
    echo "❌ FastAPI not found. Installing dependencies..."
    pip install -r requirements.txt
fi

# Run the application
echo "🚀 Starting Inkspire Backend API..."
echo "📍 Running from: $SCRIPT_DIR"
echo "🌐 API will be available at: http://localhost:8000"
echo "📚 API docs will be available at: http://localhost:8000/docs"
echo ""

# Use new structure if app/main.py exists, otherwise use legacy main.py
if [ -f "app/main.py" ]; then
    echo "✅ Using new structure (app/main.py)"
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
else
    echo "⚠️  Using legacy structure (main.py)"
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
fi

