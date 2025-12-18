# Scaffold Generation Database Structure and Update Logic

## Database Schema

### 1. `scaffold_annotations` Table (Main Table)
Stores the active/current version of each scaffold annotation. Each annotation corresponds to a text fragment in a reading.

**Fields:**
- `id` (UUID, PK): Unique identifier for the annotation
- `session_id` (UUID, FK): Session this annotation belongs to
- `reading_id` (UUID, FK): Reading material this annotation belongs to
- `highlight_text` (Text): **Original text fragment** that was highlighted/selected
  - This is the source text from the reading (immutable)
- `current_content` (Text): **Current scaffold content** (explanation/prompt/discussion question)
  - This is the scaffold text that can be edited (mutable)
- `start_offset` (Integer, optional): Character position in full text where fragment starts
- `end_offset` (Integer, optional): Character position in full text where fragment ends
- `page_number` (Integer, optional): Page number in the document
- `status` (String): Current status - `"draft"` / `"accepted"` / `"rejected"`
  - Maps to API: `"draft"` → `"pending"`, `"accepted"` → `"approved"`
- `current_version_id` (UUID, FK → scaffold_annotation_versions.id): Points to active version
- `created_at` (TIMESTAMPTZ): Annotation creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp (auto-updated)

**Purpose:**
- Represents one scaffold annotation instance
- Always contains the **current active version** in `current_content` field
- References the active version via `current_version_id`
- `highlight_text` is immutable (original fragment), `current_content` is mutable (scaffold text)

---

### 2. `scaffold_annotation_versions` Table (Version History)
Stores complete version history - every change creates a new version record.

**Fields:**
- `id` (UUID, PK): Unique identifier for this version
- `annotation_id` (UUID, FK → scaffold_annotations.id): Parent annotation
- `version_number` (Integer): Sequential version number (1, 2, 3, ...)
- `content` (Text): **Scaffold content** for this version
  - Same as `scaffold_annotations.current_content` for active version
  - Stores the scaffold text (explanation/prompt/discussion question)
- `change_type` (String): Type of change that created this version
  - `"pipeline"`: Initial generation by workflow
  - `"manual_edit"`: Manual edit by user
  - `"llm_edit"`: LLM refinement
  - `"accept"`: Approval action
  - `"reject"`: Rejection action
  - `"revert"`: Revert to previous version
- `created_by` (String): Creator identifier ("pipeline", "user", "llm", or user UUID)
- `created_at` (TIMESTAMPTZ): Version creation timestamp

**Purpose:**
- Maintains complete audit trail of all changes to scaffold content
- Each edit, LLM refinement, approve, or reject creates a new version
- Allows rollback to any previous version
- Tracks who/what made each change

---

## Data Flow and Relationships

```
scaffold_annotations (1) ──< (many) scaffold_annotation_versions
     │                              │
     │                              │
     └── current_version_id ────────┘
          (points to active version)
```

**Key Relationship:**
- One `ScaffoldAnnotation` has many `ScaffoldAnnotationVersion` records
- `ScaffoldAnnotation.current_version_id` points to the active `ScaffoldAnnotationVersion.id`
- `ScaffoldAnnotation.current_content` mirrors `ScaffoldAnnotationVersion.content` of the active version

**Key Distinction:**
- `highlight_text`: Original text fragment from reading (never changes)
- `current_content`: Scaffold text/explanation (changes with each version)

---

## Update Logic Flow

### 1. **Initial Generation** (`POST /api/reading-scaffolds`)

**Workflow:**
1. Material → Focus → Scaffold pipeline generates scaffolds
2. For each scaffold in workflow output:
   - Extract `fragment` (highlighted text)
   - Extract `text` (scaffold content)
   - Extract position info (start_offset, end_offset, page_number)

**Database Operations:**
1. Create `ScaffoldAnnotation` record:
   - `highlight_text` = fragment (original text)
   - `current_content` = scaffold text
   - `status` = "draft"
   - `current_version_id` = NULL (not set yet)
2. Create first `ScaffoldAnnotationVersion` (version 1):
   - `content` = scaffold text
   - `change_type` = "pipeline"
   - `created_by` = "pipeline"
3. Update `ScaffoldAnnotation`:
   - `current_version_id` = newly created version's ID

**Result:** Multiple annotations created, each with version 1 as active

---

### 2. **Manual Edit** (`POST /api/annotation-scaffolds/{id}/edit`)

**Steps:**
1. Receive new scaffold text from frontend
2. Get current annotation from database
3. Create new `ScaffoldAnnotationVersion`:
   - `version_number` = max(existing versions) + 1
   - `content` = new scaffold text
   - `change_type` = "manual_edit"
   - `created_by` = "user"
4. Update `ScaffoldAnnotation`:
   - `current_content` = new scaffold text
   - `current_version_id` = new version's ID
   - `updated_at` = current timestamp (auto)

**Result:** New version created, becomes active version. `highlight_text` unchanged.

---

### 3. **LLM Refinement** (`POST /api/annotation-scaffolds/{id}/llm-refine`)

**Steps:**
1. Get current annotation from database
2. Extract current scaffold content from `current_content`
3. Run LLM refinement workflow with user prompt
4. Generate refined scaffold text
5. Create new `ScaffoldAnnotationVersion`:
   - `version_number` = max(existing versions) + 1
   - `content` = refined scaffold text
   - `change_type` = "llm_edit"
   - `created_by` = "llm"
6. Update `ScaffoldAnnotation`:
   - `current_content` = refined scaffold text
   - `current_version_id` = new version's ID

**Result:** LLM-refined version becomes active. `highlight_text` unchanged.

---

### 4. **Approve** (`POST /api/annotation-scaffolds/{id}/approve`)

**Steps:**
1. Get current annotation from database
2. Create new `ScaffoldAnnotationVersion`:
   - `version_number` = max(existing versions) + 1
   - `content` = current scaffold content (unchanged)
   - `change_type` = "accept"
   - `created_by` = "user"
3. Update `ScaffoldAnnotation`:
   - `status` = "accepted"
   - `current_version_id` = new version's ID
   - `current_content` remains the same

**Result:** Status changed to "accepted", version record created for audit trail.

---

### 5. **Reject** (`POST /api/annotation-scaffolds/{id}/reject`)

**Steps:**
1. Get current annotation from database
2. Create new `ScaffoldAnnotationVersion`:
   - `version_number` = max(existing versions) + 1
   - `content` = current scaffold content (unchanged)
   - `change_type` = "reject"
   - `created_by` = "user"
3. Update `ScaffoldAnnotation`:
   - `status` = "rejected"
   - `current_version_id` = new version's ID
   - `current_content` remains the same

**Result:** Status changed to "rejected", version record created for audit trail.

---

## Key Design Principles

### 1. **Dual Content Fields**
- **`highlight_text`**: Original text fragment from reading (immutable)
- **`current_content`**: Scaffold explanation/prompt (mutable, versioned)
- These serve different purposes and are never mixed

### 2. **Versioning Strategy**
- **Immutable versions**: Each version is a complete snapshot, never modified
- **Sequential numbering**: Versions are numbered 1, 2, 3... automatically
- **Current pointer**: `current_version_id` always points to active version
- **Content mirroring**: `ScaffoldAnnotation.current_content` always matches active version's `content`

### 3. **Status vs. Content Changes**
- **Status changes** (approve/reject): Create version with same content, change status
- **Content changes** (edit/llm_refine): Create version with new content, status may remain
- Both operations create version records for complete audit trail

### 4. **Update Synchronization**
When `update_scaffold_annotation_content()` or `update_scaffold_annotation_status()` is called:
```python
# 1. Create new version record
version = ScaffoldAnnotationVersion(
    content=new_content,
    version_number=next_version,
    change_type=change_type,
    ...
)

# 2. Update parent annotation
annotation.current_content = new_content  # Sync content
annotation.current_version_id = version.id  # Update pointer
annotation.status = new_status  # If status changed
```

This ensures:
- `ScaffoldAnnotation.current_content` always reflects the active version
- `ScaffoldAnnotation.current_version_id` always points to the correct version
- No data inconsistency between main table and version table

---

## Data Consistency Guarantees

1. **Always in sync**: `ScaffoldAnnotation.current_content` = active `ScaffoldAnnotationVersion.content`
2. **Version integrity**: `current_version_id` always references an existing version
3. **Complete history**: All changes are preserved in version table
4. **Immutable fragment**: `highlight_text` never changes after creation
5. **Status mapping**: Database status ("draft"/"accepted"/"rejected") maps correctly to API status ("pending"/"approved"/"rejected")

---

## Example Update Sequence

**Initial State (after pipeline generation):**
- `ScaffoldAnnotation.highlight_text` = `"Data structures are fundamental..."`
- `ScaffoldAnnotation.current_content` = `"This passage introduces key concepts..."`
- `ScaffoldAnnotation.status` = `"draft"`
- `ScaffoldAnnotation.current_version_id` = `version_1_id`
- `ScaffoldAnnotationVersion` (v1): `content` = `"This passage introduces key concepts..."`, `change_type` = `"pipeline"`

**After Manual Edit:**
- `ScaffoldAnnotation.highlight_text` = `"Data structures are fundamental..."` (unchanged)
- `ScaffoldAnnotation.current_content` = `"This passage introduces key concepts with examples..."` (updated)
- `ScaffoldAnnotation.status` = `"draft"` (unchanged)
- `ScaffoldAnnotation.current_version_id` = `version_2_id` (updated)
- `ScaffoldAnnotationVersion` (v1): unchanged (preserved)
- `ScaffoldAnnotationVersion` (v2): `content` = `"This passage introduces key concepts with examples..."`, `change_type` = `"manual_edit"`

**After LLM Refinement:**
- `ScaffoldAnnotation.highlight_text` = `"Data structures are fundamental..."` (unchanged)
- `ScaffoldAnnotation.current_content` = `"This passage introduces key concepts with examples. Students should focus on..."` (updated)
- `ScaffoldAnnotation.status` = `"draft"` (unchanged)
- `ScaffoldAnnotation.current_version_id` = `version_3_id` (updated)
- `ScaffoldAnnotationVersion` (v1, v2): unchanged (preserved)
- `ScaffoldAnnotationVersion` (v3): `content` = refined text, `change_type` = `"llm_edit"`

**After Approval:**
- `ScaffoldAnnotation.highlight_text` = `"Data structures are fundamental..."` (unchanged)
- `ScaffoldAnnotation.current_content` = `"This passage introduces key concepts with examples. Students should focus on..."` (unchanged)
- `ScaffoldAnnotation.status` = `"accepted"` (updated)
- `ScaffoldAnnotation.current_version_id` = `version_4_id` (updated)
- `ScaffoldAnnotationVersion` (v4): `content` = same as v3, `change_type` = `"accept"`

---

## History Reconstruction

The `scaffold_to_dict()` function reconstructs history from version records:

```python
# For each version, build history entry
for i, version in enumerate(versions):
    old_text = versions[i - 1].content if i > 0 else None
    history_entry = {
        "ts": version.created_at.timestamp(),
        "action": map_change_type_to_action(version.change_type),
        "old_text": old_text,  # From previous version
        "new_text": version.content,
        "prompt": "LLM refinement" if version.change_type == "llm_edit" else None
    }
```

This allows the API to return complete edit history even though versions are stored separately.

---

## Benefits of This Design

1. **Complete Audit Trail**: Every change is preserved with timestamp, creator, and change type
2. **Easy Rollback**: Can revert to any previous version by updating `current_version_id`
3. **Clear Separation**: Original fragment (`highlight_text`) vs. scaffold content (`current_content`)
4. **Status Tracking**: Status changes are versioned separately from content changes
5. **Flexible Access**: Can retrieve current version from main table or specific version from version table
6. **Efficient Queries**: Can filter by status, session_id, reading_id without joining version table

---

## Export Logic

**Export Approved Scaffolds** (`GET /api/annotation-scaffolds/export`):
- Queries `scaffold_annotations` where `status = "accepted"`
- Optionally filters by `reading_id` or `session_id`
- Returns only approved scaffolds with their current content
- Does not include version history (only current state)

This allows exporting final approved scaffolds for posting to Perusall or other systems.

