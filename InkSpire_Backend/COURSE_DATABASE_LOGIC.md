# Course Database Structure and Update Logic

## Database Schema

### 1. `courses` Table (Main Table)
Stores basic course information.

**Fields:**
- `id` (UUID, PK): Unique identifier for the course
- `instructor_id` (UUID, FK → users.id): Owner/instructor of the course
- `title` (Text): Course title/name
- `course_code` (Text, nullable): Course code (e.g., "CS101")
- `description` (Text, nullable): Course description/summary
- `created_at` (TIMESTAMPTZ): Course creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp (auto-updated)

**Purpose:**
- Represents one course instance
- Links to instructor (user) and optionally to class profile
- Basic course metadata (title, code, description)

---

### 2. `course_basic_info` Table (Detailed Information)
Stores detailed course information with versioning support. One course can have one basic_info record.

**Fields:**
- `id` (UUID, PK): Unique identifier
- `course_id` (UUID, FK → courses.id): Parent course
- `discipline_info_json` (JSONB, nullable): Discipline background information
- `course_info_json` (JSONB, nullable): Course-specific information
- `class_info_json` (JSONB, nullable): Class-specific information
- `current_version_id` (UUID, FK → course_basic_info_versions.id, nullable): Points to active version
- `created_at` (TIMESTAMPTZ): Record creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp (auto-updated)

**Purpose:**
- Stores structured course details in JSONB format
- Always contains the **current active version** of course information
- References the active version via `current_version_id`

---

### 3. `course_basic_info_versions` Table (Version History)
Stores complete version history of course basic information.

**Fields:**
- `id` (UUID, PK): Unique identifier for this version
- `basic_info_id` (UUID, FK → course_basic_info.id): Parent basic info record
- `version_number` (Integer): Sequential version number (1, 2, 3, ...)
- `discipline_json` (JSONB, nullable): Discipline info for this version
- `course_info_json` (JSONB, nullable): Course info for this version
- `class_info_json` (JSONB, nullable): Class info for this version
- `change_type` (String): Type of change - `"manual_edit"` / `"pipeline"`
- `created_by` (String, nullable): Creator identifier ("pipeline", user UUID, etc.)
- `created_at` (TIMESTAMPTZ): Version creation timestamp

**Purpose:**
- Maintains complete audit trail of all changes to course basic info
- Each edit creates a new version record
- Allows rollback to any previous version

---

## Data Flow and Relationships

```
courses (1) ──< (1) course_basic_info (1) ──< (many) course_basic_info_versions
     │                    │                              │
     │                    └── current_version_id ────────┘
     │
     └── class_profile_id ──> (1) class_profiles
```

**Key Relationships:**
- One `Course` has one `CourseBasicInfo` (1:1 relationship)
- One `CourseBasicInfo` has many `CourseBasicInfoVersion` records (1:many)
- `CourseBasicInfo.current_version_id` points to the active version
- `Course.class_profile_id` optionally links to a `ClassProfile`

---

## Update Logic Flow

### 1. **Course Creation** (`POST /api/class-profiles`)

**Steps:**
1. Extract course information from request (title, course_code, description)
2. Create `Course` record:
   - `instructor_id` = provided instructor UUID
   - `class_profile_id` = NULL (not set yet)
   - `title`, `course_code`, `description` = from request
3. Extract discipline_info, course_info, class_info from `class_input`
4. Create `CourseBasicInfo` record:
   - `course_id` = newly created course ID
   - `discipline_info_json` = discipline_info
   - `course_info_json` = course_info
   - `class_info_json` = class_info
   - `current_version_id` = NULL (no version created yet)
5. Generate class profile via LLM workflow
6. Create `ClassProfile` record
7. **Update `Course`** to link to class profile:
   - `class_profile_id` = newly created class profile ID

**Result:** Course created with basic info and linked to class profile

---

### 2. **Course Basic Info Update** (`POST /api/basic_info/edit`)

**Steps:**
1. Get `CourseBasicInfo` by `course_id`
2. Get current max version number
3. **Create new version record** with **old values** (snapshot before update):
   - `version_number` = max + 1
   - `discipline_json` = current `discipline_info_json`
   - `course_info_json` = current `course_info_json`
   - `class_info_json` = current `class_info_json`
   - `change_type` = "manual_edit"
   - `created_by` = "User"
4. **Update `CourseBasicInfo`** with new values:
   - Update `discipline_info_json`, `course_info_json`, `class_info_json` if provided
   - `current_version_id` = newly created version's ID
   - `updated_at` = current timestamp (auto)

**Result:** New version created with old values, basic info updated with new values

**Key Point:** Version stores the **previous state** before update, not the new state. This allows tracking what changed.

---

### 3. **Course Update** (`update_course()` function)

**Steps:**
1. Get course by ID
2. Update fields if provided:
   - `title`, `course_code`, `description` (optional updates)
   - `class_profile_id` (optional, to link/unlink class profile)
3. Commit changes
4. `updated_at` automatically updated via trigger

**Result:** Course metadata updated (no versioning for course table itself)

---

## Key Design Principles

### 1. **Two-Level Structure**
- **`courses`**: Basic course metadata (title, code, description) - simple updates, no versioning
- **`course_basic_info`**: Detailed structured information (JSONB) - versioned

### 2. **Versioning Strategy for Basic Info**
- **Immutable versions**: Each version is a complete snapshot, never modified
- **Sequential numbering**: Versions are numbered 1, 2, 3... automatically
- **Current pointer**: `current_version_id` always points to active version
- **Snapshot before update**: Version stores the **old state** before the update happens

### 3. **Version Snapshot Logic**
When `update_course_basic_info()` is called:
```python
# 1. Create version with CURRENT (old) values
version = CourseBasicInfoVersion(
    discipline_json=basic_info.discipline_info_json,  # Old value
    course_info_json=basic_info.course_info_json,      # Old value
    class_info_json=basic_info.class_info_json,        # Old value
    ...
)

# 2. Then update basic_info with NEW values
basic_info.discipline_info_json = new_discipline_info  # New value
basic_info.course_info_json = new_course_info         # New value
basic_info.class_info_json = new_class_info           # New value
basic_info.current_version_id = version.id
```

This ensures:
- Version table contains history of previous states
- Current state is always in `course_basic_info` table
- Can reconstruct change history by comparing versions

### 4. **Class Profile Linking**
- Course can be created without class profile (`class_profile_id` = NULL)
- Class profile is created separately via LLM workflow
- After class profile creation, course is updated to link to it
- Relationship is optional (nullable foreign key)

---

## Data Consistency Guarantees

1. **Version integrity**: `current_version_id` always references an existing version (or NULL)
2. **Complete history**: All changes to basic info are preserved in version table
3. **Current state**: `course_basic_info` always contains the latest values
4. **Relationship integrity**: `class_profile_id` references valid class profile (or NULL)

---

## Example Update Sequence

**Initial State (after course creation):**
- `Course`: `id` = course_1, `class_profile_id` = NULL
- `CourseBasicInfo`: 
  - `discipline_info_json` = `{"discipline": "CS"}`
  - `course_info_json` = `{"syllabus": "..."}`
  - `class_info_json` = `{"class_size": 25}`
  - `current_version_id` = NULL

**After Class Profile Creation:**
- `Course`: `class_profile_id` = profile_1 (updated)
- `CourseBasicInfo`: unchanged

**After Basic Info Edit (discipline_info updated):**
- `CourseBasicInfo`:
  - `discipline_info_json` = `{"discipline": "Computer Science", "subdiscipline": "AI"}` (updated)
  - `current_version_id` = version_1_id (updated)
- `CourseBasicInfoVersion` (v1):
  - `discipline_json` = `{"discipline": "CS"}` (old value, snapshot)
  - `course_info_json` = `{"syllabus": "..."}` (old value)
  - `class_info_json` = `{"class_size": 25}` (old value)
  - `change_type` = "manual_edit"

**After Another Edit (class_info updated):**
- `CourseBasicInfo`:
  - `class_info_json` = `{"class_size": 30, "prerequisites": "CS101"}` (updated)
  - `current_version_id` = version_2_id (updated)
- `CourseBasicInfoVersion` (v1): unchanged (preserved)
- `CourseBasicInfoVersion` (v2):
  - `discipline_json` = `{"discipline": "Computer Science", "subdiscipline": "AI"}` (old value)
  - `course_info_json` = `{"syllabus": "..."}` (old value)
  - `class_info_json` = `{"class_size": 25}` (old value, before update)
  - `change_type` = "manual_edit"

---

## Benefits of This Design

1. **Complete Audit Trail**: Every change to course basic info is preserved with timestamp and creator
2. **Easy Rollback**: Can revert to any previous version by updating `current_version_id` and copying version data
3. **Efficient Queries**: JSONB fields allow fast queries without parsing
4. **Flexible Structure**: JSONB allows schema evolution without migrations
5. **Clear Separation**: Basic course metadata (simple) vs. detailed info (versioned)
6. **Optional Linking**: Course and class profile can be created independently, linked later

---

## API Endpoints Summary

### Course Creation
- **Endpoint**: `POST /api/class-profiles`
- **Creates**: `Course` → `CourseBasicInfo` → `ClassProfile` → Links course to profile

### Course Basic Info Update
- **Endpoint**: `POST /api/basic_info/edit`
- **Updates**: `CourseBasicInfo` fields
- **Creates**: New `CourseBasicInfoVersion` with old values
- **Returns**: Success message with course_id

### Course Update (Direct)
- **Function**: `update_course()`
- **Updates**: Course metadata (title, code, description, class_profile_id)
- **No versioning**: Simple update, no version records created

