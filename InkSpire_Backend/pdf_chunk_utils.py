"""
PDF chunking utilities for converting PDF files to text chunks.
Based on pdf/pdf_chunk_all.py
"""
import json
import math
from dataclasses import dataclass
from typing import Callable, List, Optional, Union
from pathlib import Path
import io

from pypdf import PdfReader

# ------------------------------------------------------------
# Tokenizer (tiktoken if available, otherwise fallback)
# ------------------------------------------------------------
try:
    import tiktoken

    def get_tokenizer(model_name: str = "gpt-4o-mini") -> Callable[[str], List[int]]:
        """
        Return a tokenizer function using tiktoken.
        """
        try:
            enc = tiktoken.encoding_for_model(model_name)
        except KeyError:
            enc = tiktoken.get_encoding("cl100k_base")

        return lambda text: enc.encode(text)

except ImportError:
    def get_tokenizer(model_name: str = "gpt-4o-mini") -> Callable[[str], List[int]]:
        """
        Fallback tokenizer if tiktoken is not installed.

        Very simple: split on words and punctuation.
        """
        import re
        token_pattern = re.compile(r"\w+|\S")

        def tokenize(text: str) -> List[int]:
            tokens = token_pattern.findall(text)
            # Only the count matters; IDs can be fake.
            return list(range(len(tokens)))

        return tokenize


# ------------------------------------------------------------
# Data structure
# ------------------------------------------------------------

@dataclass
class TextChunk:
    document_id: str
    chunk_index: int
    content: str
    token_count: int


# ------------------------------------------------------------
# PDF extraction
# ------------------------------------------------------------

def extract_text_from_pdf(pdf_source: Union[str, Path, bytes, io.BytesIO]) -> str:
    """
    Extract text from all pages of a PDF.
    
    Args:
        pdf_source: Can be a file path (str or Path), bytes, or BytesIO object
    
    Returns:
        Extracted text from all pages
    """
    if isinstance(pdf_source, (str, Path)):
        reader = PdfReader(str(pdf_source))
    elif isinstance(pdf_source, bytes):
        reader = PdfReader(io.BytesIO(pdf_source))
    elif isinstance(pdf_source, io.BytesIO):
        reader = PdfReader(pdf_source)
    else:
        raise ValueError(f"Unsupported pdf_source type: {type(pdf_source)}")
    
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n".join(pages)


# ------------------------------------------------------------
# Chunking logic (base 450–700 tokens, 10–15% overlap)
# ------------------------------------------------------------

def chunk_text(
    text: str,
    document_id: str,
    tokenizer_fn: Callable[[str], List[int]],
    base_min_tokens: int = 450,
    base_max_tokens: int = 700,
    overlap_ratio_min: float = 0.10,
    overlap_ratio_max: float = 0.15,
) -> List[TextChunk]:
    """
    Chunk text into windows of tokens with overlap.

    Simplified policy:
    - Target chunk size: 450–700 tokens
    - Overlap: ~12.5% of the chunk token length
    """
    import re

    # Split text into word-like units
    word_pattern = re.compile(r"\w+|\S")
    words = word_pattern.findall(text)

    chunks: List[TextChunk] = []
    total_words = len(words)
    word_idx = 0
    chunk_idx = 0

    while word_idx < total_words:
        current_end = word_idx
        chunk_text_str = ""
        current_token_len = 0

        # Grow the chunk until we hit base_max_tokens or run out of words
        for i in range(word_idx, total_words):
            candidate = " ".join(words[word_idx : i + 1])
            tokens = tokenizer_fn(candidate)
            if len(tokens) > base_max_tokens:
                break
            chunk_text_str = candidate
            current_end = i + 1
            current_token_len = len(tokens)

        # If it's too small and we're not at the end, grab the rest
        if current_token_len < base_min_tokens and current_end < total_words:
            candidate = " ".join(words[word_idx:total_words])
            tokens = tokenizer_fn(candidate)
            chunk_text_str = candidate
            current_end = total_words
            current_token_len = len(tokens)

        # Safety check
        if not chunk_text_str.strip():
            break

        chunks.append(
            TextChunk(
                document_id=document_id,
                chunk_index=chunk_idx,
                content=chunk_text_str,
                token_count=current_token_len,
            )
        )
        chunk_idx += 1

        # Overlap ~ average of min and max ratio
        overlap_ratio = (overlap_ratio_min + overlap_ratio_max) / 2.0
        overlap_tokens = int(math.floor(current_token_len * overlap_ratio))
        # Approx: 1 token ≈ 1 word
        overlap_words = overlap_tokens

        next_start = max(word_idx, current_end - overlap_words)
        if next_start >= current_end:
            next_start = current_end  # avoid infinite loop

        word_idx = next_start

    return chunks


# ------------------------------------------------------------
# Main conversion function
# ------------------------------------------------------------

def pdf_to_chunks(
    pdf_source: Union[str, Path, bytes, io.BytesIO],
    document_id: Optional[str] = None,
    model_name: str = "gpt-4o-mini",
) -> List[dict]:
    """
    Convert a PDF file to chunks in JSON format.
    
    Args:
        pdf_source: PDF file path (str/Path), bytes, or BytesIO object
        document_id: Document ID (if None, will use filename or 'document')
        model_name: Tokenizer model name
    
    Returns:
        List of chunk dictionaries, each with:
        {
            "document_id": str,
            "chunk_index": int,
            "content": str,
            "token_count": int
        }
    """
    # Extract text from PDF
    text = extract_text_from_pdf(pdf_source)
    
    # Determine document_id
    if document_id is None:
        if isinstance(pdf_source, (str, Path)):
            document_id = Path(pdf_source).stem
        else:
            document_id = "document"
    
    # Get tokenizer
    tokenizer = get_tokenizer(model_name)
    
    # Chunk the text
    chunks = chunk_text(
        text=text,
        document_id=document_id,
        tokenizer_fn=tokenizer,
    )
    
    # Convert to list of dictionaries
    result = []
    for chunk in chunks:
        result.append({
            "document_id": chunk.document_id,
            "chunk_index": chunk.chunk_index,
            "content": chunk.content,
            "token_count": chunk.token_count,
        })
    
    return result

