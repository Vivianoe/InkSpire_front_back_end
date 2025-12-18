# Installing Dependencies

If you encounter `ModuleNotFoundError` for any package, follow these steps:

## Quick Fix

```bash
cd InkSpire_Backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Common Missing Dependencies

### LangChain Dependencies
If you see errors like `No module named 'langchain_google_genai'`:

```bash
pip install langchain-google-genai langchain-core langgraph
```

### Database Dependencies
If you see errors related to database:

```bash
pip install sqlalchemy psycopg2-binary supabase
```

### FastAPI Dependencies
If you see errors related to FastAPI:

```bash
pip install fastapi uvicorn python-dotenv
```

## Verify Installation

After installing, run the test script:

```bash
python test_imports.py
```

All imports should pass without errors.

## Full Requirements List

See `requirements.txt` for the complete list of dependencies.

