# API Test Data and Expected Outcomes

This document provides test data examples and expected outcomes for all API endpoints in the Inkspire backend.

## Table of Contents

1. [Health Check](#health-check)
2. [User Authentication](#user-authentication)
3. [Course Management](#course-management)
4. [Class Profiles](#class-profiles)
5. [Reading Management](#reading-management)
6. [Scaffold Generation](#scaffold-generation)
7. [Perusall Integration](#perusall-integration)

---

## Health Check

### GET /health

**Test Data**: None (no request body)

**Expected Outcome**:
```json
{
  "status": "ok"
}
```

**Status Code**: `200 OK`

---

## User Authentication

### POST /api/users/register

**Test Data**:
```json
{
  "email": "instructor@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "role": "instructor"
}
```

**Expected Outcome**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "instructor@example.com",
  "name": "John Doe",
  "role": "instructor",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **users** table: 1 new record created
  - `id`: Generated UUID (e.g., "550e8400-e29b-41d4-a716-446655440000")
  - `email`: "instructor@example.com" (unique)
  - `password_hash`: Bcrypt hashed password (not plain text)
  - `name`: "John Doe"
  - `role`: "instructor"
  - `created_at`: Current timestamp

**Error Cases**:
- `400 Bad Request`: Email already exists
  ```json
  {
    "detail": "Email already registered"
  }
  ```
- `400 Bad Request`: Invalid email format
- `500 Internal Server Error`: Registration failed

---

### POST /api/users/login

**Test Data**:
```json
{
  "email": "instructor@example.com",
  "password": "SecurePassword123!"
}
```

**Expected Outcome**:
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "instructor@example.com",
    "name": "John Doe",
    "role": "instructor",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "message": "Login successful"
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **users** table: No changes (read-only operation)

**Error Cases**:
- `401 Unauthorized`: Invalid credentials
  ```json
  {
    "detail": "Invalid email or password"
  }
  ```

---

### GET /api/users/{user_id}

**Test Data**: 
- Path parameter: `user_id` = `"550e8400-e29b-41d4-a716-446655440000"`

**Expected Outcome**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "instructor@example.com",
  "name": "John Doe",
  "role": "instructor",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **users** table: No changes (read-only operation)

**Error Cases**:
- `400 Bad Request`: Invalid UUID format
  ```json
  {
    "detail": "Invalid user ID format: invalid-id"
  }
  ```
- `404 Not Found`: User not found
  ```json
  {
    "detail": "User 550e8400-e29b-41d4-a716-446655440000 not found"
  }
  ```

---

### GET /api/users/email/{email}

**Test Data**:
- Path parameter: `email` = `"instructor@example.com"`

**Expected Outcome**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "instructor@example.com",
  "name": "John Doe",
  "role": "instructor",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **users** table: No changes (read-only operation)

**Error Cases**:
- `404 Not Found`: User not found
  ```json
  {
    "detail": "User with email notfound@example.com not found"
  }
  ```

---
## Class Profiles

### POST /api/class-profiles

**Test Data**:
```json
{
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Introduction to Computer Science",
  "course_code": "CS101",
  "description": "Basic programming concepts and data structures",
  "class_input": {
    "discipline_info": {
      "discipline": "Computer Science",
      "subdiscipline": "Programming Fundamentals"
    },
    "course_info": {
      "syllabus_overview": "Introduction to programming",
      "learning_objectives": ["Understand variables", "Master loops"]
    },
    "class_info": {
      "class_size": 25,
      "student_background": "Mixed experience levels",
      "prerequisites": "None"
    }
  }
}
```

**Expected Outcome**:
```json
{
  "review": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "text": "{\"class_profile\": {...generated profile JSON...}}",
    "status": "pending",
    "history": [
      {
        "ts": 1705312800.0,
        "action": "init"
      }
    ]
  }
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **courses** table: 1 new record created
  - `id`: Generated UUID
  - `instructor_id`: Matches provided instructor_id
  - `title`: "Introduction to Computer Science"
  - `course_code`: "CS101"
  - `description`: "Basic programming concepts and data structures"
  - `created_at`: Current timestamp
  - `updated_at`: Current timestamp
- **course_basic_info** table: 1 new record created
  - `id`: Generated UUID
  - `course_id`: References the created course
  - `discipline_info_json`: Contains discipline_info from class_input
  - `course_info_json`: Contains course_info from class_input
  - `class_info_json`: Contains class_info from class_input
  - `current_version_id`: NULL (no version created yet)
  - `created_at`: Current timestamp
  - `updated_at`: Current timestamp
- **class_profiles** table: 1 new record created
  - `id`: Generated UUID (returned in response)
  - `instructor_id`: Matches provided instructor_id
  - `course_id`: Link to a course
  - `title`: "Introduction to Computer Science"
  - `description`: Generated profile JSON string (from LLM workflow)
  - `metadata_json`: Extracted metadata (profile, design_consideration)
  - `current_version_id`: References the created version
  - `created_at`: Current timestamp
  - `updated_at`: Current timestamp
- **class_profile_versions** table: 1 new record created
  - `id`: Generated UUID (set as current_version_id in class_profiles)
  - `class_profile_id`: References the created class profile
  - `version_number`: 1
  - `content`: Generated profile JSON string
  - `metadata_json`: Extracted metadata
  - `created_by`: "pipeline"
  - `created_at`: Current timestamp

**Error Cases**:
- `400 Bad Request`: Invalid instructor_id format
- `404 Not Found`: Instructor not found
- `500 Internal Server Error`: Workflow execution failed

---

### POST /api/class-profiles/{profile_id}/approve

**Test Data**:
- Path parameter: `profile_id` = `"770e8400-e29b-41d4-a716-446655440000"`
- Request body:
```json
{
  "updated_text": "{\"class_profile\": {...optional manual edits...}}"
}
```

**Expected Outcome**:
```json
{
  "review": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "text": "{\"class_profile\": {...approved profile...}}",
    "status": "approved",
    "history": [
      {
        "ts": 1705312800.0,
        "action": "init"
      },
      {
        "ts": 1705312900.0,
        "action": "approve"
      }
    ]
  }
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **class_profile_versions** table: 1 new version record created (if updated_text provided)
  - `id`: Generated UUID
  - `class_profile_id`: References the profile
  - `version_number`: Incremented (e.g., if previous was 1, new is 2)
  - `content`: Updated text from request (or existing if not provided)
  - `metadata_json`: Parsed from updated_text if JSON
  - `created_by`: NULL or user UUID (if available)
  - `created_at`: Current timestamp
- **class_profiles** table: Updated record
  - `current_version_id`: Updated to point to new version (if created)
  - `description`: Updated to match new version content
  - `updated_at`: Current timestamp

**Error Cases**:
- `400 Bad Request`: Invalid profile_id format
- `404 Not Found`: Profile not found

---

### POST /api/class-profiles/{profile_id}/edit

**Test Data**:
- Path parameter: `profile_id` = `"770e8400-e29b-41d4-a716-446655440000"`
- Request body:
```json
{
  "new_text": "{\"class_profile\": {...edited content...}}"
}
```

**Expected Outcome**:
```json
{
  "review": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "text": "{\"class_profile\": {...edited content...}}",
    "status": "approved",
    "history": [
      {
        "ts": 1705312800.0,
        "action": "init"
      },
      {
        "ts": 1705313000.0,
        "action": "manual_edit"
      }
    ]
  }
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **class_profile_versions** table: 1 new version record created
  - `id`: Generated UUID
  - `class_profile_id`: References the profile
  - `version_number`: Incremented (e.g., if previous was 2, new is 3)
  - `content`: LLM-refined profile JSON string
  - `metadata_json`: Extracted metadata from refined content
  - `created_by`: "llm_refine"
  - `created_at`: Current timestamp
- **class_profiles** table: Updated record
  - `current_version_id`: Updated to point to new version
  - `description`: Updated to match new version content
  - `metadata_json`: Updated with new metadata
  - `updated_at`: Current timestamp

**Error Cases**:
- `400 Bad Request`: Invalid profile_id format
- `404 Not Found`: Profile not found

---

### POST /api/class-profiles/{profile_id}/llm-refine

**Test Data**:
- Path parameter: `profile_id` = `"770e8400-e29b-41d4-a716-446655440000"`
- Request body:
```json
{
  "prompt": "Make the profile more focused on students with no prior programming experience. Emphasize hands-on practice."
}
```

**Expected Outcome**:
```json
{
  "review": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "text": "{\"class_profile\": {...LLM refined content...}}",
    "status": "approved",
    "history": [
      {
        "ts": 1705312800.0,
        "action": "init"
      },
      {
        "ts": 1705313100.0,
        "action": "llm_refine",
        "prompt": "Make the profile more focused..."
      }
    ]
  }
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **class_profile_versions** table: 1 new version record created
  - `id`: Generated UUID
  - `class_profile_id`: References the profile
  - `version_number`: Incremented
  - `content`: LLM-refined profile JSON string
  - `metadata_json`: Extracted metadata
  - `created_by`: "llm_refine"
  - `created_at`: Current timestamp
- **class_profiles** table: Updated record
  - `current_version_id`: Updated to point to new version
  - `description`: Updated to match new version content
  - `updated_at`: Current timestamp

**Error Cases**:
- `400 Bad Request`: Invalid profile_id format
- `404 Not Found`: Profile not found
- `500 Internal Server Error`: LLM refinement failed

---

### GET /api/class-profiles/{profile_id}

**Test Data**:
- Path parameter: `profile_id` = `"770e8400-e29b-41d4-a716-446655440000"`

**Expected Outcome**:
```json
{
  "review": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "text": "{\"class_profile\": {...current profile...}}",
    "status": "approved",
    "history": [...]
  }
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **class_profiles** table: No changes (read-only operation)

**Error Cases**:
- `400 Bad Request`: Invalid profile_id format
- `404 Not Found`: Profile not found

---

### GET /api/class-profiles/instructor/{instructor_id}

**Test Data**:
- Path parameter: `instructor_id` = `"550e8400-e29b-41d4-a716-446655440000"`

**Expected Outcome**:
```json
{
  "profiles": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "text": "{\"class_profile\": {...}}",
      "status": "approved",
      "history": [...]
    }
  ],
  "total": 1
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **class_profiles** table: No changes (read-only operation)

**Error Cases**:
- `400 Bad Request`: Invalid instructor_id format
- `404 Not Found`: Instructor not found

---

### GET /api/class-profiles/{profile_id}/export

**Test Data**:
- Path parameter: `profile_id` = `"770e8400-e29b-41d4-a716-446655440000"`

**Expected Outcome**:
```json
{
  "class_profile": {
    "class_id": "class_001",
    "profile": "11th grade CS class with mixed prior experience...",
    "design_consideration": "Multilingual learners need scaffolded support..."
  }
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **class_profiles** table: No changes (read-only operation)

**Error Cases**:
- `400 Bad Request`: Invalid profile_id format
- `404 Not Found`: Profile not found


---

## Course Basic Info + design considerations Edit API

### POST /api/basic_info/edit

**Test Data**:
```json
{
  "course_id": "660e8400-e29b-41d4-a716-446655440000",
  "discipline_info_json": {
    "discipline": "Computer Science",
    "subdiscipline": "Data Structures",
    "level": "undergraduate"
  },
  "course_info_json": {
    "syllabus_overview": "Introduction to fundamental data structures",
    "learning_objectives": [
      "Understand arrays and linked lists",
      "Master tree structures"
    ]
  },
  "class_info_json": {
    "class_size": 30,
    "student_background": "Mixed prior experience",
    "prerequisites": "CS101"
  }
}
```

**Expected Outcome**:
```json
{
  "message": "Course basic info updated successfully",
  "course_id": "660e8400-e29b-41d4-a716-446655440000"
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **CourseBasicInfo**, update the course basic info in the table
- **CourseBasicInfoVersion**,create a quick screentshot of the old version of the couse basic info

**Error Cases**:
- `400 Bad Request`: Invalid course_id format
- `404 Not Found`: Course not found

---

### POST /api/design-considerations/edit

**Test Data**:
```json
{
  "course_id": "660e8400-e29b-41d4-a716-446655440000",
  "design_consideration": "Multilingual learners need scaffolded support for technical reading. Focus on visual aids and step-by-step explanations."
}
```

**Expected Outcome**:
```json
{
  "success": True,
  "review": profile_to_model(profile),
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **class_profiles** table: Updated record (metadata_json field)
  - `metadata_json`: Updated with new design_consideration
  - `updated_at`: Current timestamp
- Note: This endpoint updates the metadata_json directly, not creating a version

**Error Cases**:
- `400 Bad Request`: Invalid course_id format
- `404 Not Found`: Course not found

---


---
## Reading Management

### POST /api/readings/batch-upload

**Test Data**:
```json
{
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
  "course_id": "660e8400-e29b-41d4-a716-446655440000",
  "readings": [
    {
      "title": "Introduction to Data Structures",
      "file_path": "readings/cs101/week1/data_structures.pdf",
      "source_type": "uploaded"
    },
    {
      "title": "Algorithms Overview",
      "file_path": "readings/cs101/week1/algorithms.pdf",
      "source_type": "uploaded"
    }
  ]
}
```

**Expected Outcome**:
```json
{
  "readings": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
      "course_id": "660e8400-e29b-41d4-a716-446655440000",
      "title": "Introduction to Data Structures",
      "file_path": "readings/cs101/week1/data_structures.pdf",
      "source_type": "uploaded",
      "created_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": "990e8400-e29b-41d4-a716-446655440000",
      "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
      "course_id": "660e8400-e29b-41d4-a716-446655440000",
      "title": "Algorithms Overview",
      "file_path": "readings/cs101/week1/algorithms.pdf",
      "source_type": "uploaded",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 2
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **readings** table: N new records created (one per reading in request)
  - For each reading:
    - `id`: Generated UUID
    - `instructor_id`: Matches provided instructor_id
    - `course_id`: Matches provided course_id
    - `title`: Reading title from request
    - `file_path`: File path from request
    - `source_type`: "uploaded" or "reused"
    - `created_at`: Current timestamp

**Error Cases**:
- `400 Bad Request`: Invalid instructor_id or course_id format
- `404 Not Found`: Instructor or course not found

---

### GET /api/readings

**Test Data**:
- Query parameters:
  - `course_id` = `"660e8400-e29b-41d4-a716-446655440000"`
  - `instructor_id` = `"550e8400-e29b-41d4-a716-446655440000"`

**Expected Outcome**:
```json
{
  "readings": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
      "course_id": "660e8400-e29b-41d4-a716-446655440000",
      "title": "Introduction to Data Structures",
      "file_path": "readings/cs101/week1/data_structures.pdf",
      "source_type": "uploaded",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **readings** table: No changes (read-only operation)

**Error Cases**:
- `400 Bad Request`: 
  - Invalid UUID format
  - Neither course_id nor instructor_id provided
    ```json
    {
      "detail": "Either course_id or instructor_id must be provided"
    }
    ```

---

## Scaffold Generation

### POST /api/generate-scaffolds

**Test Data**:
```json
{
  "course_id": "660e8400-e29b-41d4-a716-446655440000",
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
  "week_number": 1,
  "session_title": "Week 1: Introduction",
  "reading_id": "880e8400-e29b-41d4-a716-446655440000",
  "session_info_json": {
    "session_description": "Introduction to course materials",
    "teaching_notes": "Focus on basic concepts"
  },
  "assignment_info_json": {
    "assignment_description": "Read chapter 1 and complete exercises",
    "due_date": "2024-01-22"
  },
  "assignment_goals_json": {
    "learning_objectives": [
      "Understand basic concepts",
      "Complete reading comprehension"
    ]
  },
  "class_profile": {
    "class_id": "class_001",
    "profile": "11th grade CS class with mixed prior experience",
    "design_consideration": "Multilingual learners need scaffolded support"
  },
  "reading_chunks": {
    "chunks": [
      {
        "chunk_id": "chunk_001",
        "text": "Data structures are fundamental...",
        "page_number": 1,
        "start_offset": 0,
        "end_offset": 500
      }
    ]
  },
  "reading_info": {
    "assignment_id": "assignment_001",
    "session_description": "Week 1 session",
    "assignment_description": "Read and annotate chapter 1",
    "assignment_objective": "Understand basic data structures"
  }
}
```

**Expected Outcome**:
```json
{
  "material_report_text": "Material analysis report...",
  "focus_report_json": "{\"focus_areas\": [...]}",
  "scaffold_json": "{\"scaffolds\": [...]}",
  "annotation_scaffolds_review": [
    {
      "id": "aa0e8400-e29b-41d4-a716-446655440000",
      "fragment": "Data structures are fundamental...",
      "text": "This passage introduces key concepts...",
      "status": "draft",
      "history": [
        {
          "ts": 1705313200.0,
          "action": "init"
        }
      ]
    }
  ],
  "session_id": "bb0e8400-e29b-41d4-a716-446655440000",
  "reading_id": "880e8400-e29b-41d4-a716-446655440000"
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- if session id does not exist, create a session
- create a session item
- create annotations
  **scaffold_annotations** table: N new records created (one per generated scaffold)
  - For each scaffold:
    - `id`: Generated UUID
    - `session_id`: From request or generated
    - `reading_id`: From request or generated
    - `highlight_text`: Fragment text
    - `current_content`: Generated scaffold text
    - `status`: "draft"
    - `current_version_id`: References the created version
    - `created_at`: Current timestamp
    - `updated_at`: Current timestamp
- create annotations and their initial versions
  **scaffold_annotation_versions** table: N new records created
  - For each scaffold:
    - `id`: Generated UUID
    - `annotation_id`: References the annotation
    - `version_number`: 1
    - `content`: Generated scaffold text
    - `change_type`: "pipeline"
    - `created_by`: "pipeline"
    - `created_at`: Current timestamp

**Error Cases**:
- `400 Bad Request`: Invalid UUID format for any ID
- `404 Not Found`: Instructor, course, or reading not found
- `500 Internal Server Error`: Workflow execution failed

**Note**: If `session_id` is provided, it will use the existing session. Otherwise, a new session will be created.

---

### POST /api/reading-scaffolds

**Test Data**:
```json
{
  "class_profile": {
    "class_id": "class_001",
    "profile": "11th grade CS class",
    "design_consideration": "Multilingual learners need support"
  },
  "reading_chunks": {
    "chunks": [
      {
        "chunk_id": "chunk_001",
        "text": "Data structures are fundamental...",
        "page_number": 1
      }
    ]
  },
  "reading_info": {
    "assignment_id": "assignment_001",
    "session_description": "Week 1 session",
    "assignment_description": "Read chapter 1",
    "assignment_objective": "Understand basic concepts"
  },
  "session_id": "bb0e8400-e29b-41d4-a716-446655440000",
  "reading_id": "880e8400-e29b-41d4-a716-446655440000"
}
```

**Expected Outcome**:
```json
{
  "material_report_text": "Material analysis report...",
  "focus_report_json": "{\"focus_areas\": [...]}",
  "scaffold_json": "{\"scaffolds\": [...]}",
  "annotation_scaffolds_review": [
    {
      "id": "aa0e8400-e29b-41d4-a716-446655440000",
      "fragment": "Data structures are fundamental...",
      "text": "This passage introduces key concepts...",
      "status": "draft",
      "history": [...]
    }
  ],
  "session_id": "bb0e8400-e29b-41d4-a716-446655440000",
  "reading_id": "880e8400-e29b-41d4-a716-446655440000"
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **scaffold_annotations** table: N new records created (one per generated scaffold)
  - For each scaffold:
    - `id`: Generated UUID
    - `session_id`: From request or generated
    - `reading_id`: From request or generated
    - `highlight_text`: Fragment text
    - `current_content`: Generated scaffold text
    - `status`: "draft"
    - `current_version_id`: References the created version
    - `created_at`: Current timestamp
    - `updated_at`: Current timestamp
- **scaffold_annotation_versions** table: N new records created
  - For each scaffold:
    - `id`: Generated UUID
    - `annotation_id`: References the annotation
    - `version_number`: 1
    - `content`: Generated scaffold text
    - `change_type`: "pipeline"
    - `created_by`: "pipeline"
    - `created_at`: Current timestamp

**Error Cases**:
- `400 Bad Request`: 
  - Missing `assignment_id` in `reading_info`
  - Invalid UUID format
- `500 Internal Server Error`: Workflow execution failed

---

### POST /api/annotation-scaffolds/{scaffold_id}/approve

**Test Data**:
- Path parameter: `scaffold_id` = `"aa0e8400-e29b-41d4-a716-446655440000"`

**Expected Outcome**:
```json
{
  "scaffold": {
    "id": "aa0e8400-e29b-41d4-a716-446655440000",
    "fragment": "Data structures are fundamental...",
    "text": "This passage introduces key concepts...",
    "status": "accepted",
    "history": [
      {
        "ts": 1705313200.0,
        "action": "init"
      },
      {
        "ts": 1705313300.0,
        "action": "approve"
      }
    ]
  }
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **scaffold_annotations** table: Updated record
  - `status`: Changed to "accepted"
  - `updated_at`: Current timestamp
- **scaffold_annotation_versions** table: 1 new version record created
  - `id`: Generated UUID
  - `annotation_id`: References the scaffold annotation
  - `version_number`: Incremented (e.g., if previous was 1, new is 2)
  - `content`: Same as current_content (status change only)
  - `change_type`: "accept"
  - `created_by`: "user"
  - `created_at`: Current timestamp
- **scaffold_annotations** table: `current_version_id` updated to point to new version

**Error Cases**:
- `400 Bad Request`: Invalid scaffold_id format
- `404 Not Found`: Scaffold not found

---

### POST /api/annotation-scaffolds/{scaffold_id}/edit

**Test Data**:
- Path parameter: `scaffold_id` = `"aa0e8400-e29b-41d4-a716-446655440000"`
- Request body:
```json
{
  "new_text": "This passage introduces key concepts in data structures. Students should focus on understanding the relationship between arrays and linked lists."
}
```

**Expected Outcome**:
```json
{
  "scaffold": {
    "id": "aa0e8400-e29b-41d4-a716-446655440000",
    "fragment": "Data structures are fundamental...",
    "text": "This passage introduces key concepts in data structures. Students should focus on understanding the relationship between arrays and linked lists.",
    "status": "draft",
    "history": [
      {
        "ts": 1705313200.0,
        "action": "init"
      },
      {
        "ts": 1705313400.0,
        "action": "manual_edit",
        "old_text": "This passage introduces key concepts...",
        "new_text": "This passage introduces key concepts in data structures..."
      }
    ]
  }
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **scaffold_annotations** table: Updated record
  - `current_content`: Updated with new_text from request
  - `updated_at`: Current timestamp
- **scaffold_annotation_versions** table: 1 new version record created
  - `id`: Generated UUID
  - `annotation_id`: References the scaffold annotation
  - `version_number`: Incremented
  - `content`: Updated content (new_text from request)
  - `change_type`: "manual_edit"
  - `created_by`: "user"
  - `created_at`: Current timestamp
- **scaffold_annotations** table: `current_version_id` updated to point to new version

**Error Cases**:
- `400 Bad Request`: Invalid scaffold_id format
- `404 Not Found`: Scaffold not found

---

### POST /api/annotation-scaffolds/{scaffold_id}/llm-refine

**Test Data**:
- Path parameter: `scaffold_id` = `"aa0e8400-e29b-41d4-a716-446655440000"`
- Request body:
```json
{
  "prompt": "Make the explanation more accessible for beginners. Use simpler language and add examples."
}
```

**Expected Outcome**:
```json
{
  "scaffold": {
    "id": "aa0e8400-e29b-41d4-a716-446655440000",
    "fragment": "Data structures are fundamental...",
    "text": "This passage introduces key concepts in data structures. Think of arrays like a row of lockers...",
    "status": "draft",
    "history": [
      {
        "ts": 1705313200.0,
        "action": "init"
      },
      {
        "ts": 1705313500.0,
        "action": "llm_refine",
        "prompt": "Make the explanation more accessible for beginners..."
      }
    ]
  }
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **scaffold_annotations** table: Updated record
  - `current_content`: Updated with LLM-refined content
  - `updated_at`: Current timestamp
- **scaffold_annotation_versions** table: 1 new version record created
  - `id`: Generated UUID
  - `annotation_id`: References the scaffold annotation
  - `version_number`: Incremented
  - `content`: LLM-refined content
  - `change_type`: "llm_edit"
  - `created_by`: "llm"
  - `created_at`: Current timestamp
- **scaffold_annotations** table: `current_version_id` updated to point to new version

**Error Cases**:
- `400 Bad Request`: Invalid scaffold_id format
- `404 Not Found`: Scaffold not found
- `500 Internal Server Error`: LLM refinement failed

---

### POST /api/annotation-scaffolds/{scaffold_id}/reject

**Test Data**:
- Path parameter: `scaffold_id` = `"aa0e8400-e29b-41d4-a716-446655440000"`

**Expected Outcome**:
```json
{
  "scaffold": {
    "id": "aa0e8400-e29b-41d4-a716-446655440000",
    "fragment": "Data structures are fundamental...",
    "text": "This passage introduces key concepts...",
    "status": "rejected",
    "history": [
      {
        "ts": 1705313200.0,
        "action": "init"
      },
      {
        "ts": 1705313600.0,
        "action": "reject"
      }
    ]
  }
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **scaffold_annotations** table: Updated record
  - `status`: Changed to "rejected"
  - `updated_at`: Current timestamp
- **scaffold_annotation_versions** table: 1 new version record created
  - `id`: Generated UUID
  - `annotation_id`: References the scaffold annotation
  - `version_number`: Incremented
  - `content`: Same as current_content (status change only)
  - `change_type`: "reject"
  - `created_by`: "user"
  - `created_at`: Current timestamp
- **scaffold_annotations** table: `current_version_id` updated to point to new version

**Error Cases**:
- `400 Bad Request`: Invalid scaffold_id format
- `404 Not Found`: Scaffold not found

---

### GET /api/annotation-scaffolds/export

**Test Data**:
- Query parameters (all optional):
  - `assignment_id` = `"assignment_001"`
  - `reading_id` = `"880e8400-e29b-41d4-a716-446655440000"`
  - `session_id` = `"bb0e8400-e29b-41d4-a716-446655440000"`

**Expected Outcome**:
```json
{
  "annotation_scaffolds": [
    {
      "id": "aa0e8400-e29b-41d4-a716-446655440000",
      "fragment": "Data structures are fundamental...",
      "text": "This passage introduces key concepts in data structures..."
    }
  ]
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **scaffold_annotations** table: No changes (read-only operation)
- **scaffold_annotation_versions** table: No changes (read-only operation)

**Note**: Only returns scaffolds with `status == "accepted"`

**Error Cases**:
- `400 Bad Request`: Invalid UUID format for reading_id or session_id




## Perusall Integration

### POST /api/perusall/annotations

**Test Data**:
```json
{
  "annotations": [
    {
      "rangeType": "text",
      "rangePage": 1,
      "rangeStart": 0,
      "rangeEnd": 100,
      "fragment": "Data structures are fundamental to computer science...",
      "positionStartX": 100.5,
      "positionStartY": 200.3,
      "positionEndX": 500.2,
      "positionEndY": 220.1
    },
    {
      "rangeType": "text",
      "rangePage": 2,
      "rangeStart": 0,
      "rangeEnd": 150,
      "fragment": "Arrays provide constant-time access...",
      "positionStartX": 100.0,
      "positionStartY": 300.0,
      "positionEndX": 600.0,
      "positionEndY": 320.0
    }
  ]
}
```

**Expected Outcome**:
```json
{
  "success": true,
  "created_ids": [
    "perusall_annotation_id_001",
    "perusall_annotation_id_002"
  ],
  "errors": []
}
```

**Status Code**: `200 OK`

**Expected Database State**:
- **scaffold_annotations** table: No changes (external API call only, no database writes)
- **scaffold_annotation_versions** table: No changes
- Note: This endpoint only calls Perusall API, does not modify local database

**Error Cases**:
- `500 Internal Server Error`: 
  - Perusall API environment variables missing
    ```json
    {
      "detail": "Perusall API environment variables are missing."
    }
    ```
  - Perusall API request failed
    ```json
    {
      "success": false,
      "created_ids": ["perusall_annotation_id_001"],
      "errors": [
        {
          "index": 1,
          "error": "HTTP 400: Bad Request",
          "response": "Error message from Perusall API",
          "payload": {...}
        }
      ]
    }
    ```

---

## Test Data Notes

1. **UUIDs**: All UUIDs in test data are examples. Replace with actual UUIDs from our database later.

2. **Timestamps**: Timestamp values (`ts` in history) are Unix timestamps. Actual values will vary.

3. **JSON Strings**: Some fields like `text` in class profiles may contain JSON strings. The actual content will be generated by the LLM workflow.

4. **File Paths**: Reading file paths should point to actual files in our storage system (e.g., Supabase Storage).

5. **Dependencies**: Some endpoints require existing records:
   - Creating a class profile requires an existing instructor
   - Generating scaffolds requires existing course, instructor, and reading
   - Most operations require prior creation of related entities

6. **Workflow Execution**: Endpoints that trigger LLM workflows (`/api/class-profiles`, `/api/generate-scaffolds`) may take longer to respond due to LLM processing time.

7. **Error Responses**: All error responses follow FastAPI's standard format with a `detail` field containing the error message.



