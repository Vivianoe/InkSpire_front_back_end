"""
Reading management endpoints
"""
import uuid
import io
import base64
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db, get_supabase_client
from app.services.reading_service import (
    create_reading,
    get_reading_by_id,
    get_readings_by_course,
    get_readings_by_instructor,
    get_readings_by_course_and_instructor,
    update_reading,
    reading_to_dict,
)
from app.services.reading_chunk_service import (
    create_reading_chunks_batch,
    get_reading_chunks_by_reading_id,
    reading_chunk_to_dict,
)
from app.services.user_service import get_user_by_id
from app.services.course_service import get_course_by_id
from app.utils.pdf_chunk_utils import pdf_to_chunks
from app.api.models import (
    BatchUploadReadingsRequest,
    BatchUploadReadingsResponse,
    ReadingListResponse,
    ReadingResponse,
    ReadingUploadItem,
)

router = APIRouter()


@router.post("/readings/batch-upload", response_model=BatchUploadReadingsResponse)
def batch_upload_readings(payload: BatchUploadReadingsRequest, db: Session = Depends(get_db)):
    """
    Batch upload readings to the database.
    Each reading in the list will be created as a separate record.
    """
    # Validate and parse IDs
    try:
        instructor_uuid = uuid.UUID(payload.instructor_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid instructor_id format: {payload.instructor_id}",
        )
    
    course_uuid = None
    if payload.course_id:
        try:
            course_uuid = uuid.UUID(payload.course_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid course_id format: {payload.course_id}",
            )
    
    # Verify instructor exists
    instructor = get_user_by_id(db, instructor_uuid)
    if not instructor:
        raise HTTPException(
            status_code=404,
            detail=f"Instructor {payload.instructor_id} not found",
        )
    
    # Verify course exists if provided
    if course_uuid:
        course = get_course_by_id(db, course_uuid)
        if not course:
            raise HTTPException(
                status_code=404,
                detail=f"Course {payload.course_id} not found",
            )
    
    # Create readings in batch
    created_readings = []
    errors = []
    supabase_client = get_supabase_client()
    bucket_name = "readings"
    print(f"Instructor ID: {instructor_uuid}, Course ID: {course_uuid}")
    print(f"Number of readings to upload: {len(payload.readings)}")
    
    for idx, reading_item in enumerate(payload.readings):
        print(f"Processing reading {idx + 1}/{len(payload.readings)}: {reading_item.title}")
        try:
            final_file_path = None
            
            # For uploaded readings: create reading first, then upload file, then convert to chunks
            if reading_item.source_type == "uploaded":
                # Step 1: Create reading with temporary file_path (will be updated later)
                temp_file_path = f"temp/{uuid.uuid4()}.pdf"
                reading = create_reading(
                    db=db,
                    instructor_id=instructor_uuid,
                    course_id=course_uuid,
                    title=reading_item.title,
                    file_path=temp_file_path,
                    source_type=reading_item.source_type,
                )
                reading_id = reading.id
                
                # Step 2: Upload file to Supabase Storage if content_base64 is provided
                if reading_item.content_base64:
                    try:
                        # Decode base64 content
                        pdf_bytes = base64.b64decode(reading_item.content_base64)
                        
                        # Determine original filename
                        original_filename = reading_item.original_filename or reading_item.title
                        if not original_filename.lower().endswith('.pdf'):
                            original_filename += '.pdf'
                        
                        # Build file path: course_{course_id}/{reading_id}_{original_filename}.pdf
                        course_path = f"course_{payload.course_id}" if payload.course_id else "general"
                        final_file_path = f"{course_path}/{reading_id}_{original_filename}"
                        
                        # Upload to Supabase Storage
                        try:
                            supabase_client.storage.from_(bucket_name).remove([final_file_path])
                        except Exception:
                            pass
                        
                        supabase_client.storage.from_(bucket_name).upload(
                            final_file_path,
                            pdf_bytes,
                            file_options={"content-type": "application/pdf"}
                        )
                        
                        # Step 3: Update reading with correct file_path
                        reading = update_reading(
                            db=db,
                            reading_id=reading_id,
                            file_path=final_file_path,
                        )
                        
                        # Step 4: Convert PDF to chunks and store in reading_chunks table
                        try:
                            document_id = reading_item.title.replace(' ', '_').lower()[:50]
                            chunks = pdf_to_chunks(
                                pdf_source=pdf_bytes,
                                document_id=document_id,
                            )
                            
                            chunks_data = []
                            for chunk in chunks:
                                chunks_data.append({
                                    "chunk_index": chunk["chunk_index"],
                                    "content": chunk["content"],
                                    "chunk_metadata": {
                                        "document_id": chunk["document_id"],
                                        "token_count": chunk["token_count"],
                                    },
                                })
                            print(f"Chunks data: {len(chunks_data)} chunks created")
                            
                            create_reading_chunks_batch(
                                db=db,
                                reading_id=reading_id,
                                chunks=chunks_data,
                            )
                        except Exception as chunk_error:
                            print(f"Warning: Failed to convert PDF to chunks for {reading_item.title}: {str(chunk_error)}")
                    except Exception as upload_error:
                        db.delete(reading)
                        db.commit()
                        raise Exception(f"Failed to upload file to Supabase Storage: {str(upload_error)}")
                else:
                    final_file_path = reading_item.file_path or temp_file_path
                    reading = update_reading(
                        db=db,
                        reading_id=reading_id,
                        file_path=final_file_path,
                    )
            else:
                # For reused readings
                final_file_path = reading_item.file_path
                if not final_file_path:
                    raise ValueError("file_path is required for reused readings")
                
                reading = create_reading(
                    db=db,
                    instructor_id=instructor_uuid,
                    course_id=course_uuid,
                    title=reading_item.title,
                    file_path=final_file_path,
                    source_type=reading_item.source_type,
                )
            
            # Refresh reading to ensure it's up to date
            db.refresh(reading)
            reading_dict = reading_to_dict(reading, include_chunks=False)
            chunks = get_reading_chunks_by_reading_id(db, reading.id)
            reading_dict["reading_chunks"] = [reading_chunk_to_dict(chunk) for chunk in chunks]
            created_readings.append(reading_dict)
            print(f"Successfully created reading: {reading.title} (ID: {reading.id})")
        except Exception as e:
            error_msg = str(e)
            print(f"ERROR processing reading {idx} ({reading_item.title}): {error_msg}")
            import traceback
            print(traceback.format_exc())
            errors.append({
                "index": idx,
                "title": reading_item.title,
                "error": error_msg,
            })
    
    print(f"Batch upload completed: {len(created_readings)} created, {len(errors)} errors")
    
    return BatchUploadReadingsResponse(
        success=len(errors) == 0,
        created_count=len(created_readings),
        readings=[ReadingResponse(**r) for r in created_readings],
        errors=errors,
    )


@router.get("/readings", response_model=ReadingListResponse)
def get_readings(
    course_id: str = None,
    instructor_id: str = None,
    db: Session = Depends(get_db)
):
    """
    Get reading list, optionally filtered by course_id and/or instructor_id
    """
    readings_list = []
    
    if course_id and instructor_id:
        # Both filters
        try:
            course_uuid = uuid.UUID(course_id)
            instructor_uuid = uuid.UUID(instructor_id)
            readings = get_readings_by_course_and_instructor(db, course_uuid, instructor_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID format")
    elif course_id:
        # Filter by course only
        try:
            course_uuid = uuid.UUID(course_id)
            readings = get_readings_by_course(db, course_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid course_id format")
    elif instructor_id:
        # Filter by instructor only
        try:
            instructor_uuid = uuid.UUID(instructor_id)
            readings = get_readings_by_instructor(db, instructor_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid instructor_id format")
    else:
        # No filters - return empty list (or could return all if needed)
        readings = []
    
    # Convert to response format
    for reading in readings:
        reading_dict = reading_to_dict(reading, include_chunks=False)
        chunks = get_reading_chunks_by_reading_id(db, reading.id)
        reading_dict["reading_chunks"] = [reading_chunk_to_dict(chunk) for chunk in chunks]
        readings_list.append(ReadingResponse(**reading_dict))
    
    return ReadingListResponse(readings=readings_list, total=len(readings_list))
