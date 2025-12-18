"""
Reading chunk service layer for reading chunk management
Handles reading chunk creation, retrieval, and deletion
"""
import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.models import ReadingChunk


def create_reading_chunk(
    db: Session,
    reading_id: uuid.UUID,
    chunk_index: int,
    content: str,
    chunk_metadata: Optional[Dict[str, Any]] = None,
) -> ReadingChunk:
    """
    Create a new reading chunk
    """
    chunk = ReadingChunk(
        id=uuid.uuid4(),
        reading_id=reading_id,
        chunk_index=chunk_index,
        content=content.strip(),
        chunk_metadata=chunk_metadata,
    )
    
    db.add(chunk)
    db.commit()
    db.refresh(chunk)
    
    return chunk


def create_reading_chunks_batch(
    db: Session,
    reading_id: uuid.UUID,
    chunks: List[Dict[str, Any]],
) -> List[ReadingChunk]:
    """
    Create multiple reading chunks in batch.
    
    Args:
        chunks: List of chunk dictionaries, each should have:
            - chunk_index (int): Sequential order
            - content (str): Chunk text content
            - chunk_metadata (dict, optional): Additional metadata like document_id, token_count, etc.
            - metadata (dict, optional): Legacy field name, will be converted to chunk_metadata
    
    Returns:
        List of created ReadingChunk objects
    """
    created_chunks = []
    
    for chunk_data in chunks:
        chunk = ReadingChunk(
            id=uuid.uuid4(),
            reading_id=reading_id,
            chunk_index=chunk_data.get("chunk_index", 0),
            content=chunk_data.get("content", "").strip(),
            chunk_metadata=chunk_data.get("chunk_metadata") or chunk_data.get("metadata") or {
                "document_id": chunk_data.get("document_id"),
                "token_count": chunk_data.get("token_count"),
            },
        )
        db.add(chunk)
        created_chunks.append(chunk)
    
    db.commit()
    
    # Refresh all chunks
    for chunk in created_chunks:
        db.refresh(chunk)
    
    return created_chunks


def get_reading_chunks_by_reading_id(
    db: Session,
    reading_id: uuid.UUID,
) -> List[ReadingChunk]:
    """
    Get all chunks for a reading, ordered by chunk_index
    """
    return db.query(ReadingChunk).filter(
        ReadingChunk.reading_id == reading_id
    ).order_by(ReadingChunk.chunk_index).all()


def get_reading_chunk_by_id(
    db: Session,
    chunk_id: uuid.UUID,
) -> Optional[ReadingChunk]:
    """
    Get a specific chunk by ID
    """
    return db.query(ReadingChunk).filter(ReadingChunk.id == chunk_id).first()


def delete_reading_chunks_by_reading_id(
    db: Session,
    reading_id: uuid.UUID,
) -> int:
    """
    Delete all chunks for a reading
    Returns the number of deleted chunks
    """
    deleted_count = db.query(ReadingChunk).filter(
        ReadingChunk.reading_id == reading_id
    ).delete()
    db.commit()
    return deleted_count


def delete_reading_chunk(
    db: Session,
    chunk_id: uuid.UUID,
) -> bool:
    """
    Delete a specific chunk
    """
    chunk = get_reading_chunk_by_id(db, chunk_id)
    if not chunk:
        return False
    
    db.delete(chunk)
    db.commit()
    return True


def reading_chunk_to_dict(chunk: ReadingChunk) -> Dict[str, Any]:
    """
    Convert ReadingChunk model to dictionary
    """
    return {
        "id": str(chunk.id),
        "reading_id": str(chunk.reading_id),
        "chunk_index": chunk.chunk_index,
        "content": chunk.content,
        "chunk_metadata": chunk.chunk_metadata,
        "created_at": chunk.created_at.isoformat() if chunk.created_at else None,
    }

