# Class Profile Database Structure and Update Logic

## Database Schema

### 1. `class_profiles` Table (Main Table)
Stores the active/current version of each class profile.

**Fields:**
- `id` (UUID, PK): Unique identifier for the class profile
- `instructor_id` (UUID, FK → users.id): Owner of the profile
- `course_id`: (UUID, FK → courses.id) Link to a course
- `title` (Text): Class/course name (e.g., "Introduction to Computer Science")
- `description` (Text): **Full Class Profile JSON string** (current active version)
  - Stores the complete JSON: `{"class_id": "...", "profile": {...}, "design_consideration": "..."}`
- `metadata_json` (JSONB): Structured metadata extracted from the profile JSON
  - Contains: `{"profile": {...}, "design_consideration": "..."}`
  - Used for efficient querying without parsing the full JSON string
- `current_version_id` (UUID, FK → class_profile_versions.id): Points to the active version
- `created_at` (TIMESTAMPTZ): Profile creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp (auto-updated)

**Purpose:** 
- Represents one class profile instance
- Always contains the **current active version** in `description` field
- References the active version via `current_version_id`

---

### 2. `class_profile_versions` Table (Version History)
Stores complete version history - every change creates a new version record.

**Fields:**
- `id` (UUID, PK): Unique identifier for this version
- `class_profile_id` (UUID, FK → class_profiles.id): Parent profile
- `version_number` (Integer): Sequential version number (1, 2, 3, ...)
- `content` (Text): **Full Class Profile JSON string** for this version
  - Same format as `class_profiles.description`
  - Stores complete snapshot: `{"class_id": "...", "profile": {...}, "design_consideration": "..."}`
- `metadata_json` (JSONB): Structured metadata for this version
- `created_by` (String): Creator identifier ("pipeline", "User", "llm_refine", or user UUID)
- `created_at` (TIMESTAMPTZ): Version creation timestamp

**Purpose:**
- Maintains complete audit trail of all changes
- Each edit, LLM refinement, or approval creates a new version
- Allows rollback to any previous version

---

## Data Flow and Relationships

```
class_profiles (1) ──< (many) class_profile_versions
     │                        │
     │                        │
     └── current_version_id ──┘
          (points to active version)
```

**Key Relationship:**
- One `ClassProfile` has many `ClassProfileVersion` records
- `ClassProfile.current_version_id` points to the active `ClassProfileVersion.id`
- `ClassProfile.description` mirrors `ClassProfileVersion.content` of the active version

---

## Update Logic Flow

### 1. **Initial Creation** (`POST /api/class-profiles`)

**Steps:**
1. LLM workflow generates Class Profile JSON string
2. Parse JSON to extract metadata (profile, design_consideration)
3. Create `ClassProfile` record:
   - `description` = full JSON string
   - `metadata_json` = structured metadata
   - `current_version_id` = NULL (not set yet)
4. Create first `ClassProfileVersion` (version 1):
   - `content` = full JSON string
   - `metadata_json` = structured metadata
   - `created_by` = "pipeline"
5. Update `ClassProfile`:
   - `current_version_id` = newly created version's ID
   - `description` = version's content (already set, but ensures sync)

**Result:** Profile with version 1 as active

---

### 2. **Manual Edit** (`POST /api/class-profiles/{id}/edit`)

**Steps:**
1. Receive new profile JSON string from frontend
2. Parse JSON to extract metadata
3. Create new `ClassProfileVersion`:
   - `version_number` = max(existing versions) + 1
   - `content` = new JSON string
   - `metadata_json` = extracted metadata
   - `created_by` = "User"
4. Update `ClassProfile`:
   - `current_version_id` = new version's ID
   - `description` = new version's content
   - `updated_at` = current timestamp (auto)

**Result:** New version created, becomes active version

---

### 3. **LLM Refinement** (`POST /api/class-profiles/{id}/llm-refine`)

**Steps:**
1. Get current active version content from `ClassProfile.description`
2. Run LLM refinement workflow with user prompt
3. Generate refined profile JSON string
4. Parse refined JSON to extract metadata
5. Create new `ClassProfileVersion`:
   - `version_number` = max(existing versions) + 1
   - `content` = refined JSON string
   - `metadata_json` = extracted metadata
   - `created_by` = "llm_refine"
6. Update `ClassProfile`:
   - `current_version_id` = new version's ID
   - `description` = refined version's content

**Result:** LLM-refined version becomes active

---

### 4. **Approve** (`POST /api/class-profiles/{id}/approve`)

**Steps:**
1. Optionally apply manual edit if `updated_text` provided (creates version first)
2. Mark profile as approved (status change, if status field exists)
3. Current version remains active (no new version created unless edited)

**Note:** Approval itself doesn't create a version, but any edits before approval do.

---

## Key Design Principles

### 1. **Dual Storage Pattern**
- **`description` (Text)**: Stores full JSON string for easy retrieval
- **`metadata_json` (JSONB)**: Stores structured data for efficient querying
- Both are kept in sync when versions are created

### 2. **Versioning Strategy**
- **Immutable versions**: Each version is a complete snapshot, never modified
- **Sequential numbering**: Versions are numbered 1, 2, 3... automatically
- **Current pointer**: `current_version_id` always points to active version
- **Content mirroring**: `ClassProfile.description` always matches active version's `content`

### 3. **Update Synchronization**
When `create_class_profile_version()` is called:
```python
# 1. Create new version record
version = ClassProfileVersion(
    content=new_json_string,
    version_number=next_version,
    ...
)

# 2. Update parent profile to point to new version
profile.current_version_id = version.id
profile.description = version.content  # Sync description
```

This ensures:
- `ClassProfile.description` always reflects the active version
- `ClassProfile.current_version_id` always points to the correct version
- No data inconsistency between main table and version table

---

## Data Consistency Guarantees

1. **Always in sync**: `ClassProfile.description` = active `ClassProfileVersion.content`
2. **Version integrity**: `current_version_id` always references an existing version
3. **Complete history**: All changes are preserved in version table
4. **Metadata consistency**: `metadata_json` in both tables match for active version

---

## Example Update Sequence

**Initial State:**
- `ClassProfile.description` = `{"class_id": "001", "profile": {...}, ...}`
- `ClassProfile.current_version_id` = `version_1_id`
- `ClassProfileVersion` (v1): `content` = same JSON string

**After Manual Edit:**
- `ClassProfile.description` = `{"class_id": "001", "profile": {...modified...}, ...}`
- `ClassProfile.current_version_id` = `version_2_id` (updated)
- `ClassProfileVersion` (v1): unchanged (preserved)
- `ClassProfileVersion` (v2): `content` = new JSON string (created)

**After LLM Refinement:**
- `ClassProfile.description` = `{"class_id": "001", "profile": {...refined...}, ...}`
- `ClassProfile.current_version_id` = `version_3_id` (updated)
- `ClassProfileVersion` (v1, v2): unchanged (preserved)
- `ClassProfileVersion` (v3): `content` = refined JSON string (created)

---

## Benefits of This Design

1. **Complete Audit Trail**: Every change is preserved with timestamp and creator
2. **Easy Rollback**: Can revert to any previous version by updating `current_version_id`
3. **Efficient Queries**: `metadata_json` (JSONB) allows fast queries without parsing full JSON
4. **Data Integrity**: Description always matches active version content
5. **Flexible Access**: Can retrieve current version from main table or specific version from version table

