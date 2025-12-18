"""
Inkspire Backend API - Main Application Entry Point
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException

# Import routers
from app.api.routes import users, courses, class_profiles, readings, scaffolds, perusall

# Create FastAPI app
app = FastAPI(
    title="Reading & Class Profile Workflows API",
    version="0.1.0",
    description="A FastAPI-based backend service for managing educational courses, class profiles, reading materials, and AI-generated teaching scaffolds."
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React frontend address
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for all unhandled exceptions"""
    import traceback
    error_trace = traceback.format_exc()
    print(f"[Global Exception Handler] Unhandled exception: {exc}")
    print(f"[Global Exception Handler] Exception type: {type(exc)}")
    print(f"[Global Exception Handler] Request path: {request.url.path}")
    print(f"[Global Exception Handler] Request method: {request.method}")
    print(f"[Global Exception Handler] Traceback:\n{error_trace}")
    
    # If it's an HTTPException, re-raise it
    if isinstance(exc, HTTPException):
        print(f"[Global Exception Handler] Re-raising HTTPException with status {exc.status_code}")
        return exc
    
    # Otherwise return 500 error
    print(f"[Global Exception Handler] Returning 500 error")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"},
    )

# Health check endpoint
@app.get("/health")
def health():
    return {"status": "ok"}

# Include routers
app.include_router(users.router, prefix="/api", tags=["users"])
app.include_router(courses.router, prefix="/api", tags=["courses"])
app.include_router(class_profiles.router, prefix="/api", tags=["class-profiles"])
app.include_router(readings.router, prefix="/api", tags=["readings"])
app.include_router(scaffolds.router, prefix="/api", tags=["scaffolds"])
app.include_router(perusall.router, prefix="/api", tags=["perusall"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

