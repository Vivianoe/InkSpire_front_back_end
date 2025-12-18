"""
pdf_chunk_all.py

Scan the current directory for all PDF files, chunk each PDF into overlapping
text chunks, and save each PDF's chunks as a JSONL file.

- Input:  all *.pdf files in the same folder as this script
- Output: one JSONL per PDF, named "<pdf_stem>_chunks.jsonl"

Each JSONL line looks like:
{
    "document_id": "sample",        # PDF filename without extension
    "chunk_index": 0,
    "content": "...",
    "token_count": 512
}

Dependencies:
    pip install pypdf tiktoken
"""

import json
import math
from dataclasses import dataclass
from typing import Callable, List
from pathlib import Path

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

def extract_text_from_pdf(pdf_path: Path) -> str:
    """
    Extract text from all pages of a PDF.
    """
    reader = PdfReader(str(pdf_path))
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
# Save chunks to JSONL
# ------------------------------------------------------------

def save_jsonl(chunks: List[TextChunk], output_path: Path) -> None:
    """
    Save chunks to a JSONL file, one JSON object per line.
    """
    with output_path.open("w", encoding="utf-8") as f:
        for c in chunks:
            record = {
                "document_id": c.document_id,
                "chunk_index": c.chunk_index,
                "content": c.content,
                "token_count": c.token_count,
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"  -> Saved {len(chunks)} chunks to {output_path.name}")


# ------------------------------------------------------------
# Main: process all PDFs in current directory
# ------------------------------------------------------------

def main():
    # Current directory where this script is run
    cwd = Path(".").resolve()
    pdf_files = sorted(cwd.glob("*.pdf"))

    if not pdf_files:
        print("No PDF files found in the current directory.")
        return

    print(f"Found {len(pdf_files)} PDF file(s):")
    for p in pdf_files:
        print(f" - {p.name}")

    tokenizer = get_tokenizer("gpt-4o-mini")

    for pdf_path in pdf_files:
        print(f"\nProcessing: {pdf_path.name}")
        document_id = pdf_path.stem  # filename without extension
        output_path = cwd / f"{document_id}_chunks.jsonl"

        text = extract_text_from_pdf(pdf_path)
        chunks = chunk_text(
            text=text,
            document_id=document_id,
            tokenizer_fn=tokenizer,
        )

        print(f"  Generated {len(chunks)} chunks for {pdf_path.name}")
        save_jsonl(chunks, output_path)

    print("\nDone. All PDFs in this folder have been chunked.")


if __name__ == "__main__":
    main()
