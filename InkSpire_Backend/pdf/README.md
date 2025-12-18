# 📘 PDF Chunking Tool

This folder contains a simple tool that automatically processes **all PDF files in this directory** and converts them into JSONL chunks that can be uploaded to Supabase later.

---

## 📂 Folder Structure

```
pdf/
│
├── pdf_chunk_all.py     # Main script: auto-detects all PDFs and chunks them
├── sample.pdf           # Example PDF (you can add more)
├── another.pdf          # Another example
└── output files …       # Will appear after running the script:
                         # sample_chunks.jsonl
                         # another_chunks.jsonl
```

You can place **any number of PDFs** in this folder — the script will process all of them.

---

## 🚀 How to Use

### 1. Navigate into the folder

```bash
cd pdf
```

Make sure you see the script and your PDFs:

```bash
ls
# pdf_chunk_all.py  sample.pdf  another.pdf
```

---

### 2. (Recommended) Activate your virtual environment

```bash
source .venv/bin/activate
```

If you haven’t created the virtual environment yet:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install pypdf tiktoken
```

---

### 3. Run the script

```bash
python pdf_chunk_all.py
```

The script will:

- Detect **all `.pdf` files** in this folder
- Extract their text
- Chunk them according to your policy (450–700 tokens, ~12% overlap)
- Save a corresponding `.jsonl` file for each PDF

Example output:

```
Found 2 PDF file(s):
 - sample.pdf
 - another.pdf

Processing: sample.pdf
  Generated 12 chunks for sample.pdf
  -> Saved sample_chunks.jsonl

Processing: another.pdf
  Generated 8 chunks for another.pdf
  -> Saved another_chunks.jsonl

Done. All PDFs in this folder have been chunked.
```

---

## 📦 Output Format

Each PDF produces one JSONL file:

```
sample_chunks.jsonl
another_chunks.jsonl
```

Each line in the file contains a JSON object representing **one chunk**:

```json
{
  "document_id": "sample",
  "chunk_index": 0,
  "content": ".... text ...",
  "token_count": 512
}
```

- `document_id` → the PDF file name (without `.pdf`)
- `chunk_index` → the chunk number (0-based)
- `content` → the text of that chunk
- `token_count` → number of tokens in that chunk

---

## 🧹 Notes

- PDFs must be placed in **this folder**.
- JSONL outputs will also appear **in this folder**.
- Virtual environment is optional but recommended.
- These chunk files are ready to be uploaded to Supabase later.

---
