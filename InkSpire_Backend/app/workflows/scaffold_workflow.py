import json
import os
import time
import re
from typing import Any, List, Literal, Dict, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

from typing_extensions import TypedDict
from dotenv import load_dotenv

# LangChain / LangGraph imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END

# Prompt imports (from prompts/ folder)
from app.prompts.material_prompt import get_material_prompt
from app.prompts.focus_prompt import get_focus_prompt
from app.prompts.scaffold_prompt import get_scaffold_prompt

# ======================================================
# 0. ENVIRONMENT
# ======================================================

load_dotenv()


# ======================================================
# 1. DATA STRUCTURES (HITL)
# ======================================================

class HistoryEntry(TypedDict, total=False):
    ts: float
    action: Literal["init", "approve", "reject", "manual_edit", "llm_refine"]
    prompt: str
    old_text: str
    new_text: str


class ReviewedScaffold(TypedDict, total=False):
    id: str
    fragment: str
    text: str
    status: Literal["pending", "approved", "rejected"]
    history: List[HistoryEntry]
    # Position fields from reading chunks
    start_offset: int
    end_offset: int
    page_number: int


class WorkflowState(TypedDict, total=False):
    # Inputs
    reading_chunks: Any        # JSON: { "chunks": [ {...}, ... ] }
    class_profile: Any         # JSON: { "class_id", "profile", "design_consideration" }
    reading_info: Any          # JSON: { "assignment_id", "session_description", ... }
    scaffold_count: int
    min_fragment_gap_chars: int

    # Intermediate / Outputs
    material_report_text: str                  # free text
    focus_report_json: str                     # JSON string: { "focus_areas": [...] }
    scaffold_json: str                         # JSON string: { "annotation_scaffolds": [...] }

    # HITL review objects (after scaffold)
    annotation_scaffolds_review: List[ReviewedScaffold]

    # Model config (optional)
    model: str
    temperature: float
    max_output_tokens: int


# ======================================================
# 2. UTILS
# ======================================================

def clean_json_output(raw: str) -> str:
    """
    Remove markdown fences like ```json ... ``` or ``` ... ``` and strip whitespace.
    Also extracts only the first complete JSON object if there's extra text after it.
    """
    if raw is None:
        return ""
    raw = raw.strip()
    # Remove starting ```json or ``` plus following newline
    raw = re.sub(r"^```[a-zA-Z]*\n", "", raw)
    # Remove trailing ```
    raw = re.sub(r"\n```$", "", raw)
    raw = raw.strip()
    
    # If there's extra text after JSON (like explanations), extract only the JSON part
    # Try to find the first complete JSON object/array by tracking braces/brackets
    brace_count = 0
    bracket_count = 0
    in_string = False
    escape_next = False
    json_end = -1
    
    for i, char in enumerate(raw):
        if escape_next:
            escape_next = False
            continue
        if char == '\\':
            escape_next = True
            continue
        if char == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
            
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0 and bracket_count == 0:
                json_end = i + 1
                break
        elif char == '[':
            bracket_count += 1
        elif char == ']':
            bracket_count -= 1
            if brace_count == 0 and bracket_count == 0:
                json_end = i + 1
                break
    
    # If we found a complete JSON object/array, extract only that part
    if json_end > 0:
        raw = raw[:json_end]
    
    return raw.strip()


def safe_json_loads(raw: str, context: str = "") -> Any:
    """
    Safely parse JSON with helpful error messages.
    Attempts to fix common JSON errors before failing.
    """
    cleaned = clean_json_output(raw)
    if not cleaned:
        raise ValueError(f"{context}: JSON string is empty after cleaning.")

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        # Try to fix common JSON errors
        fixed = cleaned
        try:
            # Fix missing commas between object properties (common Gemini error)
            # Pattern 1: } followed by " (missing comma between objects)
            fixed = re.sub(r'}\s*"', r'}, "', fixed)
            # Pattern 2: } followed by { (missing comma between objects)
            fixed = re.sub(r'}\s*{', r'}, {', fixed)
            # Pattern 3: " followed by " (missing comma between string properties)
            # But be careful - this could be inside a string, so we need to check context
            # Only fix if it's after a closing quote and before an opening quote for a key
            fixed = re.sub(r'"\s*"([^"]*":)', r'", "\1', fixed)
            # Pattern 4: ] followed by " or { (missing comma after array)
            fixed = re.sub(r']\s*"', r'], "', fixed)
            fixed = re.sub(r']\s*{', r'], {', fixed)
            # Pattern 5: number followed by " or { (missing comma after number)
            fixed = re.sub(r'(\d)\s*"', r'\1, "', fixed)
            fixed = re.sub(r'(\d)\s*{', r'\1, {', fixed)
            # Pattern 6: true/false/null followed by " or { (missing comma)
            fixed = re.sub(r'(true|false|null)\s*"', r'\1, "', fixed)
            fixed = re.sub(r'(true|false|null)\s*{', r'\1, {', fixed)
            
            # Try parsing again with fixed JSON
            return json.loads(fixed)
        except (json.JSONDecodeError, Exception) as fix_error:
            # If fixing didn't work, print debug info and raise original error
            error_pos = getattr(e, 'pos', 0)
            error_line = getattr(e, 'lineno', 0)
            error_col = getattr(e, 'colno', 0)
            
            # Show context around the error
            start_pos = max(0, error_pos - 200)
            end_pos = min(len(cleaned), error_pos + 200)
            error_context = cleaned[start_pos:end_pos]
            
            debug_msg = (
                f"\n===== JSONDecodeError in {context} =====\n"
                f"Error: {e}\n"
                f"Error position: line {error_line}, column {error_col}, char {error_pos}\n"
                f"Cleaned value (first 1000 chars):\n{repr(cleaned[:1000])}\n"
                f"Cleaned value (around error, ±200 chars):\n{repr(error_context)}\n"
                f"Fix attempt failed: {fix_error}\n"
                f"===== END JSON ERROR ({context}) =====\n"
            )
            print(debug_msg)
            raise ValueError(f"Failed to parse JSON in {context}: {e}") from e


def _salvage_annotation_scaffolds_from_raw(raw: str) -> Dict[str, Any]:
    """
    Best-effort fallback when model JSON is malformed:
    extract {"fragment": "...", "text": "..."} objects from raw text.
    """
    text = clean_json_output(raw or "")
    if not text:
        return {"annotation_scaffolds": []}

    pattern = re.compile(
        r'\{\s*"fragment"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}',
        re.DOTALL,
    )
    items: List[Dict[str, str]] = []
    for m in pattern.finditer(text):
        frag_raw = m.group(1)
        txt_raw = m.group(2)
        try:
            frag = json.loads(f'"{frag_raw}"')
            txt = json.loads(f'"{txt_raw}"')
        except Exception:
            continue
        if isinstance(frag, str) and isinstance(txt, str) and frag.strip() and txt.strip():
            items.append({"fragment": frag.strip(), "text": txt.strip()})

    return {"annotation_scaffolds": items}


def _split_sentences(text: str) -> List[str]:
    if not text:
        return []
    # Split by sentence-ending punctuation and line breaks first.
    primary = re.split(r'(?<=[.!?。！？])\s+|[\r\n]+', text)
    primary = [p.strip() for p in primary if p and p.strip()]
    if len(primary) > 1:
        return primary

    # Fallback: some model outputs use semicolons as sentence separators.
    secondary = re.split(r'[;；]+', text)
    secondary = [s.strip() for s in secondary if s and s.strip()]
    if len(secondary) > 1:
        return secondary

    # Last fallback: keep as one sentence.
    return [text.strip()] if text.strip() else []


def _truncate_fragment_to_max_sentences(fragment: str, max_sentences: int = 5) -> str:
    sentences = _split_sentences(fragment)
    if len(sentences) <= max_sentences:
        return fragment.strip()
    return " ".join(sentences[:max_sentences]).strip()


def _resolve_target_count(scaffold_count: Any) -> int | None:
    if isinstance(scaffold_count, int) and scaffold_count > 0:
        return scaffold_count
    if isinstance(scaffold_count, str):
        try:
            parsed = int(scaffold_count)
            return parsed if parsed > 0 else None
        except Exception:
            return None
    return None


def _resolve_generation_count(scaffold_count: Any, extra: int = 4) -> Any:
    target = _resolve_target_count(scaffold_count)
    if target is None:
        return scaffold_count
    return target + max(0, extra)


def _resolve_min_gap_chars(value: Any, default: int = 20) -> int:
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, str):
        try:
            return max(0, int(value))
        except Exception:
            return default
    return default


def _spans_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return max(a_start, b_start) < min(a_end, b_end)


def _span_gap(a_start: int, a_end: int, b_start: int, b_end: int) -> int:
    """
    Distance between two non-overlapping spans (in characters).
    Returns 0 when spans overlap or touch.
    """
    if _spans_overlap(a_start, a_end, b_start, b_end):
        return 0
    if a_end <= b_start:
        return b_start - a_end
    if b_end <= a_start:
        return a_start - b_end
    return 0


def _build_norm_index(text: str) -> tuple[str, List[int]]:
    """
    Normalize text for robust matching, adapted from backend perusall fragment matching.
    Returns (normalized_text, norm_idx -> original_idx map).
    """
    if not text:
        return "", []
    norm_chars: List[str] = []
    norm_to_orig: List[int] = []
    prev_space = True
    for i, ch in enumerate(text):
        if ch.isspace():
            if not prev_space and norm_chars:
                norm_chars.append(" ")
                norm_to_orig.append(i)
            prev_space = True
            continue
        prev_space = False
        if ch == "\u00ad":
            continue
        if ch == "-" and i > 0 and i + 1 < len(text):
            if text[i - 1].isalpha() and text[i + 1].isalpha():
                # skip OCR/extraction hyphenation between letters
                continue
        if ch in "“”«»„":
            ch = '"'
        elif ch in "‘’‚":
            ch = "'"
        elif ch in "–—":
            ch = "-"

        if ch.isalnum() or ch in "-'":
            norm_chars.append(ch.lower())
            norm_to_orig.append(i)
        else:
            if norm_chars and norm_chars[-1] != " ":
                norm_chars.append(" ")
                norm_to_orig.append(i)

    if norm_chars and norm_chars[-1] == " ":
        norm_chars.pop()
        norm_to_orig.pop()
    return "".join(norm_chars), norm_to_orig


def _find_fragment_range_in_text(text: str, fragment: str) -> tuple[int, int] | None:
    """
    Find fragment span in text using normalized matching + prefix/suffix fallback.
    Adapted from backend perusall `_find_fragment_range`.
    """
    if not text or not fragment:
        return None

    norm_text, map_text = _build_norm_index(text)
    norm_frag, _ = _build_norm_index(fragment)
    if not norm_text or not norm_frag:
        return None

    def _range_from_norm_idx(idx: int) -> tuple[int, int]:
        start_orig = map_text[idx]
        end_norm = min(idx + len(norm_frag) - 1, len(map_text) - 1)
        end_orig = map_text[end_norm] + 1
        return start_orig, end_orig

    idx = norm_text.find(norm_frag)
    if idx >= 0:
        return _range_from_norm_idx(idx)

    if len(norm_frag) < 20:
        return None
    lens = [120, 80, 60, 40, 30, 20]
    for L in lens:
        if len(norm_frag) < L * 2:
            continue
        prefix = norm_frag[:L]
        suffix = norm_frag[-L:]
        start_idx = 0
        while True:
            p_idx = norm_text.find(prefix, start_idx)
            if p_idx < 0:
                break
            s_idx = norm_text.find(suffix, p_idx + L)
            if s_idx >= 0:
                start_orig = map_text[p_idx]
                end_norm = min(s_idx + L - 1, len(map_text) - 1)
                end_orig = map_text[end_norm] + 1
                return start_orig, end_orig
            start_idx = p_idx + 1
    return None


def _sort_chunks_for_reading_order(chunks: List[Any]) -> List[Dict[str, Any]]:
    valid_chunks: List[Dict[str, Any]] = [c for c in chunks if isinstance(c, dict)]

    def _key(c: Dict[str, Any]) -> tuple[int, int, int]:
        start_offset = c.get("start_offset")
        if isinstance(start_offset, int):
            return (0, start_offset, 0)
        chunk_index = c.get("chunk_index")
        if isinstance(chunk_index, int):
            return (1, chunk_index, 0)
        page_number = c.get("page_number")
        if isinstance(page_number, int):
            return (2, page_number, 0)
        return (3, 10**12, 0)

    return sorted(valid_chunks, key=_key)


def _normalize_fragment_key(fragment: str) -> str:
    return re.sub(r"\s+", " ", fragment or "").strip().lower()


def _fallback_text_overlap(a_key: str, b_key: str) -> bool:
    if not a_key or not b_key:
        return False
    # Direct containment is always overlap.
    return a_key in b_key or b_key in a_key


def _resolve_order_key(fragment: str, chunk_list: List[Any], source_text: str) -> tuple[int, int]:
    """
    Resolve stable reading order for a fragment.
    Priority:
    1) chunk-level match + start_offset
    2) chunk-level match + chunk_index / chunk order
    3) full-source-text find
    4) unresolved (send to end, keep generation order via index tie-break)
    """
    f = fragment or ""
    if not f:
        return (3, 10**12)
    for idx, chunk in enumerate(chunk_list):
        if not isinstance(chunk, dict):
            continue
        chunk_text = str(chunk.get("content") or chunk.get("text") or "")
        if not chunk_text:
            continue
        local_range = _find_fragment_range_in_text(chunk_text, f)
        if not local_range:
            continue
        local_pos, _ = local_range

        start_offset = chunk.get("start_offset")
        if isinstance(start_offset, int):
            return (0, start_offset + local_pos)

        chunk_order = chunk.get("chunk_index")
        if not isinstance(chunk_order, int):
            chunk_order = idx
        return (1, chunk_order * 10**6 + local_pos)

    source_range = _find_fragment_range_in_text(source_text, f) if source_text else None
    if source_range:
        return (2, source_range[0])

    return (3, 10**12)


def _sanitize_annotation_scaffolds_output(
    parsed: Any,
    reading_chunks: Any,
    max_sentences: int = 5,
    target_count: int | None = None,
    min_gap_chars: int = 40,
) -> Dict[str, Any]:
    if not isinstance(parsed, dict):
        return {"annotation_scaffolds": []}

    items = parsed.get("annotation_scaffolds", [])
    if not isinstance(items, list):
        return {"annotation_scaffolds": []}

    raw_chunks = reading_chunks.get("chunks", []) if isinstance(reading_chunks, dict) else []
    chunk_list = _sort_chunks_for_reading_order(raw_chunks if isinstance(raw_chunks, list) else [])
    source_text_parts: List[str] = []
    for chunk in chunk_list:
        if not isinstance(chunk, dict):
            continue
        chunk_text = chunk.get("content") or chunk.get("text") or ""
        if chunk_text:
            source_text_parts.append(str(chunk_text))
    source_text = "\n".join(source_text_parts)

    candidates = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        fragment = item.get("fragment")
        text = item.get("text")
        if not isinstance(fragment, str) or not isinstance(text, str):
            continue

        original_fragment = fragment.strip()
        if not original_fragment:
            continue

        unique_key = _normalize_fragment_key(original_fragment)
        fragment = _truncate_fragment_to_max_sentences(original_fragment, max_sentences=max_sentences)
        if not fragment:
            continue

        dedup_key = _normalize_fragment_key(fragment)

        source_range = _find_fragment_range_in_text(source_text, fragment) if source_text else None
        pos = source_range[0] if source_range else -1
        end = source_range[1] if source_range else -1
        order_tier, order_pos = _resolve_order_key(fragment, chunk_list, source_text)
        candidates.append(
            {
                "fragment": fragment,
                "text": text.strip(),
                "pos": pos,
                "end": end,
                "order_tier": order_tier,
                "order_pos": order_pos,
                "index": i,
                "key": dedup_key,
                "unique_key": unique_key,
            }
        )

    # Remove overlaps by output order; when one is dropped, keep scanning later
    # candidates so we can fill from the remaining output list.
    selected: List[Dict[str, Any]] = []
    for cand in candidates:
        overlap = False
        for keep in selected:
            # Overlap if source spans overlap OR one fragment contains the other.
            span_overlap = (
                cand["pos"] >= 0
                and keep["pos"] >= 0
                and _spans_overlap(cand["pos"], cand["end"], keep["pos"], keep["end"])
            )
            containment_overlap = _fallback_text_overlap(cand["key"], keep["key"])
            too_close = False
            if (
                cand["pos"] >= 0
                and cand["end"] >= 0
                and keep["pos"] >= 0
                and keep["end"] >= 0
                and min_gap_chars > 0
            ):
                gap = _span_gap(cand["pos"], cand["end"], keep["pos"], keep["end"])
                too_close = gap < min_gap_chars

            if span_overlap or containment_overlap or too_close:
                overlap = True
                break
        if overlap:
            continue
        selected.append(cand)

    # Fallback: if strict filtering leaves too few items, backfill from remaining
    # non-duplicate candidates (by normalized fragment key) in reading order.
    if target_count and target_count > 0 and len(selected) < target_count:
        selected_keys = {row["unique_key"] for row in selected}
        relaxed_pool = [
            row for row in candidates
            if row["unique_key"] not in selected_keys
        ]
        relaxed_pool.sort(key=lambda row: (row["order_tier"], row["order_pos"], row["index"]))
        for row in relaxed_pool:
            selected.append(row)
            selected_keys.add(row["unique_key"])
            if len(selected) >= target_count:
                break

    # Final output order: by reading_chunks order key.
    selected.sort(key=lambda row: (row["order_tier"], row["order_pos"], row["index"]))
    if target_count and target_count > 0 and len(selected) > target_count:
        # Spread picks across the full range so positions are more uniform.
        if target_count == 1:
            selected = [selected[0]]
        else:
            max_idx = len(selected) - 1
            indices = [round(i * max_idx / (target_count - 1)) for i in range(target_count)]
            # Dedup while preserving order, then backfill if needed.
            seen = set()
            spaced = []
            for idx in indices:
                if idx not in seen:
                    spaced.append(selected[idx])
                    seen.add(idx)
            if len(spaced) < target_count:
                for row in selected:
                    if len(spaced) >= target_count:
                        break
                    if row not in spaced:
                        spaced.append(row)
            selected = spaced

    return {
        "annotation_scaffolds": [{"fragment": row["fragment"], "text": row["text"]} for row in selected]
    }


# ======================================================
# 3. LLM CREATOR & INVOCATION HELPER
# ======================================================

def make_llm(state: WorkflowState) -> ChatGoogleGenerativeAI:
    """
    Creates a Gemini 2.5 Flash LLM using values from state,
    with GOOGLE_API_KEY loaded from environment variables.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is missing. Did you set it in .env?")

    model_name = state.get("model", "gemini-2.5-flash")
    temperature = state.get("temperature", 0.3)
    max_output_tokens = state.get("max_output_tokens")

    return ChatGoogleGenerativeAI(
        model=model_name,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        api_key=api_key,
    )


def run_chain(
    llm: ChatGoogleGenerativeAI,
    prompt: ChatPromptTemplate,
    variables: Dict[str, Any],
    context: str,
) -> str:
    """
    Helper to run a prompt|llm|parser chain with unified error handling.
    """
    chain = prompt | llm | StrOutputParser()

    try:
        result = chain.invoke(variables)
    except Exception as e:
        print(f"\n===== ERROR in {context} node =====")
        print(f"Variables: {json.dumps(variables, ensure_ascii=False)[:1000]}...")
        print(f"Error: {e}")
        print("===== END ERROR =====\n")
        raise RuntimeError(f"LLM invocation failed in {context}: {e}") from e

    if not isinstance(result, str):
        raise TypeError(f"{context}: expected string result from chain, got {type(result)}")

    return result


def _repair_scaffold_json_with_llm(llm: ChatGoogleGenerativeAI, raw: str) -> str:
    """
    Ask the LLM to repair malformed scaffold JSON.
    Returns a JSON string or empty JSON object on failure.
    """
    repair_prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You fix malformed JSON. Return ONLY valid JSON, no commentary. "
            "Output must match schema: {{\"annotation_scaffolds\":[{{\"fragment\":\"...\",\"text\":\"...\"}}]}}."
        ),
        (
            "human",
            "Malformed JSON:\n{raw}\n\n"
            "Return a repaired JSON object with the same schema."
        ),
    ])
    try:
        return run_chain(
            llm=llm,
            prompt=repair_prompt,
            variables={"raw": raw or ""},
            context="node_scaffold_repair",
        )
    except Exception as e:
        print(f"[node_scaffold] WARNING: JSON repair failed: {e}")
        return "{\"annotation_scaffolds\": []}"


# ======================================================
# 4. NODE 1 — MATERIAL ANALYSIS
# ======================================================

def node_material(state: WorkflowState) -> dict:
    """
    Node 1:
    Input:  reading_chunks, class_profile
    Output: material_report_text (teacher-facing analysis)
    """
    if "class_profile" not in state or "reading_chunks" not in state:
        raise KeyError("node_material requires 'class_profile' and 'reading_chunks' in state.")

    prompt: ChatPromptTemplate = get_material_prompt()

    # Debug: Check input data
    reading_chunks = state.get("reading_chunks", {})
    chunks = reading_chunks.get("chunks", []) if isinstance(reading_chunks, dict) else []
    print(f"[node_material] Input check:")
    print(f"  - reading_chunks.chunks count: {len(chunks)}")
    if chunks:
        first_chunk = chunks[0] if isinstance(chunks[0], dict) else {}
        chunk_content = first_chunk.get("content", first_chunk.get("text", ""))
        print(f"  - First chunk content length: {len(chunk_content)}")
        print(f"  - First chunk content (first 200 chars): {chunk_content[:200] if chunk_content else 'N/A'}")

    if not chunks:
        return {"material_report_text": ""}

    max_workers = int(os.getenv("MATERIAL_ANALYSIS_MAX_WORKERS", "4"))
    max_retries = int(os.getenv("MATERIAL_ANALYSIS_MAX_RETRIES", "2"))
    base_backoff = float(os.getenv("MATERIAL_ANALYSIS_RETRY_BACKOFF_SECONDS", "0.75"))

    def _validate_output(text: Any) -> bool:
        return isinstance(text, str) and len(text.strip()) >= 20

    def _build_chunk_payload(chunk: Dict[str, Any], fallback_index: int) -> Dict[str, Any]:
        content = chunk.get("content") or chunk.get("text") or ""
        return {
            "chunks": [
                {
                    "document_id": chunk.get("document_id"),
                    "chunk_index": chunk.get("chunk_index", fallback_index),
                    "content": content,
                    "token_count": chunk.get("token_count"),
                }
            ]
        }

    def _analyze_chunk(task: Tuple[int, Dict[str, Any]]) -> Tuple[int, int, str]:
        idx, chunk = task
        chunk_index = int(chunk.get("chunk_index", idx)) if isinstance(chunk, dict) else idx
        if not isinstance(chunk, dict):
            return (idx, chunk_index, "")
        chunk_payload = _build_chunk_payload(chunk, idx)
        if not chunk_payload["chunks"][0]["content"]:
            return (idx, chunk_index, "")
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                llm = make_llm(state)
                result = run_chain(
                    llm=llm,
                    prompt=prompt,
                    variables={
                        "class_profile": state["class_profile"],
                        "reading_chunks": chunk_payload,
                    },
                    context=f"node_material_chunk_{chunk_index}",
                )
                if _validate_output(result):
                    return (idx, chunk_index, result)
                last_error = f"invalid_output_len={len(result) if isinstance(result, str) else 'n/a'}"
            except Exception as e:
                last_error = str(e)
            if attempt < max_retries:
                time.sleep(base_backoff * (attempt + 1))
        print(f"[node_material] Chunk {chunk_index} failed after retries: {last_error}")
        return (idx, chunk_index, "")

    # Task queue → parallel execution with limited concurrency
    tasks: List[Tuple[int, Dict[str, Any]]] = list(enumerate(chunks))
    results: List[Tuple[int, int, str]] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {executor.submit(_analyze_chunk, task): task[0] for task in tasks}
        for future in as_completed(future_map):
            results.append(future.result())

    # Reassemble in original chunk order (by chunk_index, then original order)
    results.sort(key=lambda x: (x[1], x[0]))
    assembled_sections: List[str] = []
    for _, chunk_index, text in results:
        if not text:
            continue
        assembled_sections.append(f"=== Chunk {chunk_index} ===\n{text.strip()}")

    material_report_text = "\n\n---\n\n".join(assembled_sections)
    print(f"[node_material] Material report length: {len(material_report_text) if material_report_text else 0}")
    print(f"[node_material] Material report (first 300 chars): {str(material_report_text)[:300] if material_report_text else 'None'}")

    return {"material_report_text": material_report_text}


# ======================================================
# 5. NODE 2 — FOCUS IDENTIFICATION
# ======================================================

def node_focus(state: WorkflowState) -> dict:
    """
    Node 2:
    Input:  reading_chunks, class_profile, material_report_text, reading_info
    Output: focus_report_json (JSON string describing focus_areas)
    """
    required_keys = ["class_profile", "reading_info", "reading_chunks", "material_report_text"]
    missing = [k for k in required_keys if k not in state]
    if missing:
        raise KeyError(f"node_focus missing required keys in state: {missing}")

    llm = make_llm(state)
    prompt: ChatPromptTemplate = get_focus_prompt()

    result = run_chain(
        llm=llm,
        prompt=prompt,
        variables={
            "class_profile": state["class_profile"],
            "reading_info": state["reading_info"],
            "reading_chunks": state["reading_chunks"],
            "material_report_text": state["material_report_text"],
            # Ask for a buffer so downstream scaffold filtering can still hit target count.
            "scaffold_count": _resolve_generation_count(state.get("scaffold_count", "unspecified"), extra=4),
        },
        context="node_focus",
    )
    
    # Debug: Print focus report result
    print(f"[node_focus] Focus report length: {len(result) if result else 0}")
    print(f"[node_focus] Focus report (first 300 chars): {str(result)[:300] if result else 'None'}")
    
    # Clean the result (remove markdown code fences if present)
    cleaned_result = clean_json_output(result)
    print(f"[node_focus] Cleaned result length: {len(cleaned_result)}")
    
    # Try to parse and validate focus_report_json
    try:
        import json
        focus_data = safe_json_loads(cleaned_result, context="node_focus")
        focus_areas = focus_data.get("focus_areas", []) if isinstance(focus_data, dict) else []
        print(f"[node_focus] Parsed focus_areas count: {len(focus_areas)}")
        if not focus_areas:
            print(f"[node_focus] WARNING: focus_areas is empty. Full focus_data: {focus_data}")
            # Check material_report_text to see if it has content
            material_text = state.get("material_report_text", "")
            print(f"[node_focus] material_report_text length: {len(material_text)}")
            if not material_text or len(material_text) < 100:
                print(f"[node_focus] WARNING: material_report_text is too short or empty")
    except Exception as e:
        print(f"[node_focus] WARNING: Failed to parse focus_report_json: {e}")
        import traceback
        print(traceback.format_exc())

    return {"focus_report_json": cleaned_result}


# ======================================================
# 6. NODE 3 — ANNOTATION SCAFFOLD GENERATION
# ======================================================

def node_scaffold(state: WorkflowState) -> dict:
    """
    Node 3:
    Input:  reading_chunks, class_profile, focus_report_json, reading_info
    Output: scaffold_json with format:
        {
          "annotation_scaffolds": [
            {
              "fragment": "...",  # exact text from reading
              "text": "..."       # generated question or prompt
            },
            ...
          ]
        }
    """
    required_keys = ["class_profile", "reading_info", "reading_chunks", "focus_report_json"]
    missing = [k for k in required_keys if k not in state]
    if missing:
        raise KeyError(f"node_scaffold missing required keys in state: {missing}")

    # Debug: Check input data
    reading_chunks = state.get("reading_chunks", {})
    chunks = reading_chunks.get("chunks", []) if isinstance(reading_chunks, dict) else []
    focus_report = state.get("focus_report_json", "")
    print(f"[node_scaffold] Input check:")
    print(f"  - reading_chunks type: {type(reading_chunks)}, chunks count: {len(chunks)}")
    print(f"  - focus_report_json length: {len(focus_report) if focus_report else 0}")
    print(f"  - class_profile type: {type(state.get('class_profile'))}")
    print(f"  - reading_info type: {type(state.get('reading_info'))}")
    
    if not chunks:
        print(f"[node_scaffold] WARNING: reading_chunks.chunks is empty!")
    if not focus_report:
        print(f"[node_scaffold] WARNING: focus_report_json is empty!")
    else:
        # Try to parse focus_report_json to check focus_areas
        try:
            import json
            focus_data = safe_json_loads(focus_report, context="node_scaffold_input_check")
            focus_areas = focus_data.get("focus_areas", []) if isinstance(focus_data, dict) else []
            print(f"[node_scaffold] focus_areas count: {len(focus_areas)}")
            if not focus_areas:
                print(f"[node_scaffold] WARNING: focus_areas is empty! This may be why no scaffolds are generated.")
                print(f"[node_scaffold] Full focus_data: {focus_data}")
        except Exception as e:
            print(f"[node_scaffold] WARNING: Failed to parse focus_report_json: {e}")

    llm = make_llm(state)
    prompt: ChatPromptTemplate = get_scaffold_prompt()

    result = run_chain(
        llm=llm,
        prompt=prompt,
        variables={
            "class_profile": state["class_profile"],
            "reading_info": state["reading_info"],
            "reading_chunks": state["reading_chunks"],
            "focus_report_json": state["focus_report_json"],
            # Ask LLM for a small buffer so backend can drop overlaps and still fill requested count.
            "scaffold_count": _resolve_generation_count(state.get("scaffold_count", "unspecified"), extra=4),
        },
        context="node_scaffold",
    )
    
    # Debug: Print the raw result from LLM
    print(f"[node_scaffold] Raw LLM result length: {len(result) if result else 0}")
    print(f"[node_scaffold] Raw LLM result (first 500 chars): {str(result)[:500] if result else 'None'}")
    
    # Validate/clean output and enforce backend overlap filtering + ordering.
    try:
        parsed = safe_json_loads(result, context="node_scaffold_output") if isinstance(result, str) else result
        if isinstance(parsed, dict):
            annotation_scaffolds = parsed.get("annotation_scaffolds", [])
            print(f"[node_scaffold] Parsed JSON has {len(annotation_scaffolds)} annotation_scaffolds")
            if not annotation_scaffolds:
                print(f"[node_scaffold] WARNING: annotation_scaffolds is empty. Full parsed JSON: {parsed}")
            else:
                sanitized = _sanitize_annotation_scaffolds_output(
                    parsed,
                    state.get("reading_chunks", {}),
                    max_sentences=5,
                    target_count=_resolve_target_count(state.get("scaffold_count")),
                    min_gap_chars=_resolve_min_gap_chars(state.get("min_fragment_gap_chars"), default=20),
                )
                sanitized_count = len(sanitized.get("annotation_scaffolds", []))
                if sanitized_count != len(annotation_scaffolds):
                    print(
                        f"[node_scaffold] Sanitized scaffolds count changed: {len(annotation_scaffolds)} -> {sanitized_count}"
                    )
                result = json.dumps(sanitized, ensure_ascii=False)
        else:
            print(f"[node_scaffold] WARNING: Parsed JSON is not a dict, got {type(parsed)}")
    except Exception as e:
        print(f"[node_scaffold] WARNING: Failed to parse result as JSON: {e}")
        repaired_raw = _repair_scaffold_json_with_llm(llm, result if isinstance(result, str) else "")
        try:
            repaired_parsed = safe_json_loads(repaired_raw, context="node_scaffold_repair_output")
            sanitized = _sanitize_annotation_scaffolds_output(
                repaired_parsed,
                state.get("reading_chunks", {}),
                max_sentences=5,
                target_count=_resolve_target_count(state.get("scaffold_count")),
                min_gap_chars=_resolve_min_gap_chars(state.get("min_fragment_gap_chars"), default=20),
            )
            print(
                f"[node_scaffold] Repaired JSON scaffolds count: "
                f"{len(sanitized.get('annotation_scaffolds', []))}"
            )
            result = json.dumps(sanitized, ensure_ascii=False)
        except Exception as repair_err:
            print(f"[node_scaffold] WARNING: Repaired JSON still invalid: {repair_err}")
            salvaged = _salvage_annotation_scaffolds_from_raw(result if isinstance(result, str) else "")
            sanitized = _sanitize_annotation_scaffolds_output(
                salvaged,
                state.get("reading_chunks", {}),
                max_sentences=5,
                target_count=_resolve_target_count(state.get("scaffold_count")),
                min_gap_chars=_resolve_min_gap_chars(state.get("min_fragment_gap_chars"), default=20),
            )
            print(
                f"[node_scaffold] Fallback salvage extracted "
                f"{len(sanitized.get('annotation_scaffolds', []))} scaffolds from malformed JSON"
            )
            result = json.dumps(sanitized, ensure_ascii=False)

    return {"scaffold_json": result}


# ======================================================
# 7. NODE 4 — INIT SCAFFOLD REVIEW OBJECTS
# ======================================================

def node_init_scaffold_review(state: WorkflowState) -> dict:
    """
    Take scaffold_json from node_scaffold and wrap each item with:
    - id
    - status = "pending"
    - history = [{ ts, action: "init" }]
    - position fields (start_offset, end_offset, page_number) matched from reading_chunks
    So it's ready for human-in-the-loop review.

    fragment remains unchanged; text may later be edited by humans / LLM.
    """
    print(f"[node_init_scaffold_review] ===== FUNCTION CALLED =====")
    raw = state.get("scaffold_json", "")
    print(f"[node_init_scaffold_review] Starting, scaffold_json length: {len(raw) if raw else 0}")
    
    if not raw:
        print("WARNING: node_init_scaffold_review received empty scaffold_json")
        return {"annotation_scaffolds_review": []}
    
    try:
        scaffold = safe_json_loads(raw, context="node_init_scaffold_review")
    except Exception as e:
        print(f"[node_init_scaffold_review] WARNING: primary JSON parse failed: {e}")
        scaffold = _salvage_annotation_scaffolds_from_raw(raw)
        print(
            f"[node_init_scaffold_review] Fallback salvage extracted "
            f"{len(scaffold.get('annotation_scaffolds', [])) if isinstance(scaffold, dict) else 0} scaffolds"
        )
    if not scaffold:
        print("WARNING: node_init_scaffold_review failed to parse scaffold_json")
        return {"annotation_scaffolds_review": []}

    annos = scaffold.get("annotation_scaffolds", [])
    print(f"[node_init_scaffold_review] Found {len(annos)} annotation_scaffolds in scaffold_json")
    
    if not isinstance(annos, list):
        print(f"ERROR: node_init_scaffold_review: 'annotation_scaffolds' must be a list but got {type(annos)}")
        raise TypeError(
            "node_init_scaffold_review: 'annotation_scaffolds' must be a list "
            f"but got {type(annos)}"
        )
    
    if not annos:
        print("WARNING: node_init_scaffold_review: 'annotation_scaffolds' list is empty")
        return {"annotation_scaffolds_review": []}

    scaffold_count = state.get("scaffold_count")
    if isinstance(scaffold_count, int) and scaffold_count > 0:
        annos = annos[:scaffold_count]

    # Get reading_chunks to match position data
    reading_chunks_data = state.get("reading_chunks", {})
    chunks = reading_chunks_data.get("chunks", []) if isinstance(reading_chunks_data, dict) else []

    # Build a lookup map: fragment text -> chunk with position data
    # Support both "text" and "content" fields in chunks
    chunk_map = {}
    for chunk in chunks:
        if isinstance(chunk, dict):
            # Try "text" first, then "content"
            chunk_text = chunk.get("text") or chunk.get("content", "")
            if chunk_text:
                chunk_map[chunk_text] = chunk
                # Also try matching by partial text (for cases where fragment is a substring)
                if len(chunk_text) > 20:
                    # Use first 50 chars as a key for partial matching
                    chunk_map[chunk_text[:50]] = chunk
    
    print(f"[node_init_scaffold_review] Built chunk_map with {len(chunk_map)} entries")

    reviewed: List[ReviewedScaffold] = []
    now = time.time()

    for idx, item in enumerate(annos):
        if not isinstance(item, dict):
            raise TypeError(
                f"node_init_scaffold_review: each annotation_scaffold must be a dict, got {type(item)}"
            )

        if "fragment" not in item or "text" not in item:
            print(f"[node_init_scaffold_review] ERROR: Scaffold {idx + 1} missing required keys. Item keys: {list(item.keys())}")
            raise KeyError(
                "Each annotation_scaffold must contain 'fragment' and 'text' keys."
            )

        fragment = item["fragment"]
        print(f"[node_init_scaffold_review] Processing scaffold {idx + 1}: fragment='{fragment[:50]}...'")

        # Try to find matching chunk by fragment text
        source_chunk = chunk_map.get(fragment)
        if not source_chunk:
            # Try partial matching - check if fragment is a substring of any chunk text
            for chunk_text, chunk in chunk_map.items():
                if fragment in chunk_text or chunk_text in fragment:
                    source_chunk = chunk
                    print(f"[node_init_scaffold_review] Found partial match for fragment")
                    break

        local_range = None
        if not source_chunk:
            # Fallback: normalized search across chunk contents
            for chunk in chunks:
                if not isinstance(chunk, dict):
                    continue
                chunk_text = chunk.get("text") or chunk.get("content", "")
                if not chunk_text:
                    continue
                match = _find_fragment_range_in_text(chunk_text, fragment)
                if match:
                    source_chunk = chunk
                    local_range = match
                    print(f"[node_init_scaffold_review] Found normalized match for fragment")
                    break

        if not source_chunk:
            # Fallback: match against full concatenated text (handles cross-chunk fragments)
            source_text_parts = []
            for c in chunks:
                if not isinstance(c, dict):
                    continue
                c_text = c.get("text") or c.get("content", "")
                if c_text:
                    source_text_parts.append(str(c_text))
            source_text = "\n".join(source_text_parts)
            global_range = _find_fragment_range_in_text(source_text, fragment) if source_text else None
            if global_range:
                global_start, global_end = global_range
                for chunk in chunks:
                    if not isinstance(chunk, dict):
                        continue
                    start_offset = chunk.get("start_offset")
                    end_offset = chunk.get("end_offset")
                    if isinstance(start_offset, int) and isinstance(end_offset, int):
                        if start_offset <= global_start < end_offset:
                            source_chunk = chunk
                            local_range = (global_start - start_offset, min(global_end, end_offset) - start_offset)
                            print(f"[node_init_scaffold_review] Found cross-chunk match for fragment")
                            break

        if not source_chunk:
            print(f"[node_init_scaffold_review] WARNING: No matching chunk found for fragment: '{fragment[:50]}...'")

        # Build review object with position data if available
        review_obj: ReviewedScaffold = {
            "id": f"scaf{idx + 1:03d}",
            "fragment": fragment,
            "text": item["text"],
            "status": "pending",
            "history": [
                {
                    "ts": now,
                    "action": "init",
                }
            ],
        }

        # Add position fields if we found a matching chunk
        if source_chunk:
            chunk_text = source_chunk.get("text") or source_chunk.get("content", "")
            if local_range is None:
                local_range = _find_fragment_range_in_text(chunk_text, fragment) if chunk_text else None
            if local_range and isinstance(source_chunk.get("start_offset"), int):
                local_start, local_end = local_range
                review_obj["start_offset"] = source_chunk["start_offset"] + local_start
                review_obj["end_offset"] = source_chunk["start_offset"] + local_end
            else:
                if "start_offset" in source_chunk:
                    review_obj["start_offset"] = source_chunk["start_offset"]
                if "end_offset" in source_chunk:
                    review_obj["end_offset"] = source_chunk["end_offset"]
            if "page_number" in source_chunk:
                review_obj["page_number"] = source_chunk["page_number"]

        reviewed.append(review_obj)
        print(f"[node_init_scaffold_review] Created review object {idx + 1}: id={review_obj['id']}, fragment length={len(fragment)}")

    print(f"[node_init_scaffold_review] Created {len(reviewed)} review objects")
    return {"annotation_scaffolds_review": reviewed}


# ======================================================
# 8. BUILD THE WORKFLOW GRAPH
# ======================================================

def build_workflow():
    graph = StateGraph(WorkflowState)

    graph.add_node("material", node_material)
    graph.add_node("focus", node_focus)
    graph.add_node("scaffold", node_scaffold)
    graph.add_node("init_scaffold_review", node_init_scaffold_review)

    graph.set_entry_point("material")
    graph.add_edge("material", "focus")
    graph.add_edge("focus", "scaffold")
    graph.add_edge("scaffold", "init_scaffold_review")
    graph.add_edge("init_scaffold_review", END)

    return graph.compile()


# ======================================================
# 9. UTIL: LOAD READING CHUNKS FROM JSONL
# ======================================================

def load_reading_chunks_from_jsonl(path: str) -> dict:
    """
    Load reading01_chunks.jsonl into the required JSON structure:
    {
       "chunks": [ {...}, {...} ]
    }
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"Reading chunks file not found: {path}")

    chunks = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                chunks.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON line in {path}: {e}") from e

    return {"chunks": chunks}


# ======================================================
# 10. HITL HELPER FUNCTIONS (approve / reject / edit / llm_refine)
# ======================================================

def _ensure_history(scaffold: ReviewedScaffold) -> None:
    if "history" not in scaffold or scaffold["history"] is None:
        scaffold["history"] = []  # type: ignore[assignment]


def approve_scaffold(scaffold: ReviewedScaffold) -> ReviewedScaffold:
    _ensure_history(scaffold)
    scaffold["status"] = "approved"
    scaffold["history"].append({
        "ts": time.time(),
        "action": "approve",
    })
    return scaffold


def reject_scaffold(scaffold: ReviewedScaffold) -> ReviewedScaffold:
    _ensure_history(scaffold)
    scaffold["status"] = "rejected"
    scaffold["history"].append({
        "ts": time.time(),
        "action": "reject",
    })
    return scaffold


def manual_edit_scaffold(scaffold: ReviewedScaffold, new_text: str) -> ReviewedScaffold:
    """
    Manually edit the scaffold's text (fragment remains unchanged), and record in history.
    Typically: manual_edit -> approve in a separate step.
    """
    if "text" not in scaffold:
        raise KeyError("manual_edit_scaffold: scaffold has no 'text' field.")

    _ensure_history(scaffold)
    old_text = scaffold["text"]
    scaffold["text"] = new_text
    scaffold["history"].append({
        "ts": time.time(),
        "action": "manual_edit",
        "old_text": old_text,
        "new_text": new_text,
    })
    return scaffold


def llm_refine_scaffold(
    scaffold: ReviewedScaffold,
    user_prompt: str,
    llm: ChatGoogleGenerativeAI,
) -> ReviewedScaffold:
    """
    Use the LLM to refine the scaffold text based on teacher instructions.
    fragment remains unchanged.
    """
    if "text" not in scaffold or "fragment" not in scaffold:
        raise KeyError("llm_refine_scaffold: scaffold must have 'fragment' and 'text'.")

    fragment = scaffold["fragment"]
    old_text = scaffold["text"]

    refine_prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You refine existing annotation scaffolds for students.\n"
            "Keep the fragment unchanged. Only rewrite the scaffold text.\n"
            "Return ONLY the new scaffold text string, no explanation."
        ),
        (
            "human",
            "Fragment:\n{fragment}\n\n"
            "Current scaffold:\n{old_text}\n\n"
            "Refinement instruction from teacher:\n{user_prompt}\n\n"
            "Rewrite the scaffold according to the instruction."
        ),
    ])

    new_text = run_chain(
        llm=llm,
        prompt=refine_prompt,
        variables={
            "fragment": fragment,
            "old_text": old_text,
            "user_prompt": user_prompt,
        },
        context="llm_refine_scaffold",
    )

    _ensure_history(scaffold)
    scaffold["text"] = new_text
    scaffold["history"].append({
        "ts": time.time(),
        "action": "llm_refine",
        "prompt": user_prompt,
        "old_text": old_text,
        "new_text": new_text,
    })
    return scaffold


# ======================================================
# 11. EXPORT ONLY APPROVED SCAFFOLDS
# ======================================================

def export_approved_scaffolds(review_list: List[ReviewedScaffold]) -> dict:
    """
    Keep only status == 'approved' scaffolds and export final JSON structure
    for student/teaching systems.

    Output structure:
    {
      "annotation_scaffolds": [
        { "id": "...", "fragment": "...", "text": "..." },
        ...
      ]
    }
    """
    approved_items = [
        {
            "id": item["id"],
            "fragment": item["fragment"],
            "text": item["text"],
        }
        for item in review_list
        if item.get("status") == "approved"
    ]

    return {"annotation_scaffolds": approved_items}


# ======================================================
# 12. DEMO / ENTRY POINT
# ======================================================

def run_demo():
    # Adjust this path if your file is elsewhere
    reading_chunks = load_reading_chunks_from_jsonl("reading01_chunks.jsonl")

    # Example class profile
    class_profile = {
        "class_id": "class_001",
        "profile": "11th grade CS class with mixed prior experience.",
        "design_consideration": "Multilingual learners need scaffolded support for technical reading."
    }

    # Example reading info
    reading_info = {
        "assignment_id": "reading01",
        "session_description": "Session 3 of unit on version control and tools.",
        "assignment_description": "Students read about differences between distributed and centralized version control.",
        "assignment_objective": "Students can explain key concepts and compare workflows."
    }

    initial_state: WorkflowState = {
        "reading_chunks": reading_chunks,
        "class_profile": class_profile,
        "reading_info": reading_info,
        "model": "gemini-2.5-flash",
        "temperature": 0.3,
        "max_output_tokens": 8192,
    }

    app = build_workflow()
    final = app.invoke(initial_state)

    print("\n=== MATERIAL REPORT ===\n")
    print(final["material_report_text"])

    print("\n=== FOCUS REPORT JSON ===\n")
    print(final["focus_report_json"])

    print("\n=== RAW SCAFFOLD JSON ===\n")
    print(final["scaffold_json"])

    print("\n=== REVIEW OBJECTS (HITL) ===\n")
    for item in final["annotation_scaffolds_review"]:
        print(json.dumps(item, ensure_ascii=False, indent=2))

    # Demo: mark first two as approved
    reviewed = final["annotation_scaffolds_review"]
    if reviewed:
        approve_scaffold(reviewed[0])
    if len(reviewed) > 1:
        approve_scaffold(reviewed[1])

    approved_json = export_approved_scaffolds(reviewed)

    print("\n=== FINAL APPROVED ANNOTATION_SCAFFOLDS JSON ===\n")
    print(json.dumps(approved_json, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        run_demo()
    except Exception as e:
        print("\n=== UNHANDLED ERROR ===")
        print(repr(e))
        print("=== END ERROR ===\n")
