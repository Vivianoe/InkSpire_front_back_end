# API Documentation

This document describes all API endpoints, their request/response formats, and provides examples for both frontend and backend.

## Table of Contents

1. [User Management](#user-management)
2. [Course Management](#course-management)
3. [Class Profile Management](#class-profile-management)
4. [Reading Management](#reading-management)
5. [Session Management](#session-management)
6. [Scaffold Management](#scaffold-management)
7. [Perusall Integration](#perusall-integration)

---

## User Management

### Register User

**Endpoint:** `POST /api/users/register`

**Request Body:**
```json
{
  "email": "instructor@example.com",
  "password": "secure_password",
  "name": "Dr. Smith",
  "role": "instructor"
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "supabase_user_id": "12345678-1234-1234-1234-123456789012",
  "email": "instructor@example.com",
  "name": "Dr. Smith",
  "role": "instructor",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Frontend Example:**
```typescript
const response = await fetch('/api/users/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'instructor@example.com',
    password: 'secure_password',
    name: 'Dr. Smith',
    role: 'instructor'
  })
});
const user = await response.json();
```

**Backend Example:**
```python
# Request model: UserRegisterRequest
# Response model: UserResponse
```

---

### Login User

**Endpoint:** `POST /api/users/login`

**Request Body:**
```json
{
  "email": "instructor@example.com",
  "password": "secure_password"
}
```

**Response:**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "supabase_user_id": "12345678-1234-1234-1234-123456789012",
    "email": "instructor@example.com",
    "name": "Dr. Smith",
    "role": "instructor"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "message": "Login successful"
}
```

**Frontend Example:**
```typescript
const response = await fetch('/api/users/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'instructor@example.com',
    password: 'secure_password'
  })
});
const loginData = await response.json();
```

---

### Get Current User

**Endpoint:** `GET /api/users/me`

**Headers:** `Authorization: Bearer {access_token}`

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "supabase_user_id": "12345678-1234-1234-1234-123456789012",
  "email": "instructor@example.com",
  "name": "Dr. Smith",
  "role": "instructor"
}
```

---

### Get User by ID

**Endpoint:** `GET /api/users/{user_id}`

**Path Parameters:**
- `user_id` (string, UUID): User ID

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "instructor@example.com",
  "name": "Dr. Smith",
  "role": "instructor",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

## Course Management

### Get Courses by Instructor

**Endpoint:** `GET /api/courses/instructor/{instructor_id}`

**Path Parameters:**
- `instructor_id` (string, UUID): Instructor user ID

**Response:**
```json
{
  "courses": [
    {
      "id": "98adc978-af12-4b83-88ce-a9178670ae46",
      "title": "CS101: Introduction to Computer Science",
      "course_code": "CS101",
      "description": "An introductory course...",
      "class_profile_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    }
  ],
  "total": 1
}
```

**Frontend Example:**
```typescript
const response = await fetch(`/api/courses/instructor/${instructorId}`);
const data = await response.json();
const courses = data.courses;
```

---

### Edit Course Basic Info

**Endpoint:** `POST /api/courses/{course_id}/basic-info/edit`

**Path Parameters:**
- `course_id` (string, UUID): Course ID

**Request Body:**
```json
{
  "course_id": "98adc978-af12-4b83-88ce-a9178670ae46",
  "discipline_info_json": {
    "discipline": "Computer Science",
    "subdiscipline": "Software Engineering"
  },
  "course_info_json": {
    "courseName": "CS101",
    "courseCode": "CS101",
    "description": "Updated description"
  },
  "class_info_json": {
    "classSize": 30,
    "level": "undergraduate"
  }
}
```

**Response:**
```json
{
  "message": "Course basic info updated successfully",
  "course_id": "98adc978-af12-4b83-88ce-a9178670ae46"
}
```

---

### Edit Design Considerations

**Endpoint:** `POST /api/courses/{course_id}/design-considerations/edit`

**Path Parameters:**
- `course_id` (string, UUID): Course ID

**Request Body:**
```json
{
  "course_id": "98adc978-af12-4b83-88ce-a9178670ae46",
  "design_consideration": "{\"pedagogy\": \"active learning\", \"assessment\": \"project-based\"}"
}
```

**Response:**
```json
{
  "success": true,
  "review": {
    "id": "profile-id",
    "text": "...",
    "status": "approved"
  }
}
```

---

## Class Profile Management

### Create Class Profile

**Endpoint:** `POST /api/courses/{course_id}/class-profiles`

**Path Parameters:**
- `course_id` (string, UUID or "new"): Course ID (use "new" to create a new course)

**Request Body:**
```json
{
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "CS101: Introduction to Computer Science",
  "course_code": "CS101",
  "description": "An introductory course to computer science",
  "class_input": {
    "discipline_info": {
      "discipline": "Computer Science",
      "subdiscipline": "Software Engineering"
    },
    "course_info": {
      "courseName": "CS101",
      "courseCode": "CS101",
      "description": "Introduction to CS"
    },
    "class_info": {
      "classSize": 30,
      "level": "undergraduate",
      "prerequisites": "None"
    }
  }
}
```

**Response:**
```json
{
  "review": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "text": "Generated profile text...",
    "status": "pending"
  },
  "course_id": "98adc978-af12-4b83-88ce-a9178670ae46",
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Frontend Example:**
```typescript
const payload = {
  instructor_id: instructorId,
  title: formData.courseInfo.courseName,
  course_code: formData.courseInfo.courseCode,
  description: formData.courseInfo.description,
  class_input: {
    discipline_info: formData.disciplineInfo,
    course_info: formData.courseInfo,
    class_info: formData.classInfo
  }
};

const response = await fetch(`/api/courses/${courseId}/class-profiles`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});
const data = await response.json();
```

---

### Get Class Profile

**Endpoint:** `GET /api/class-profiles/{profile_id}`

**Path Parameters:**
- `profile_id` (string, UUID): Class profile ID

**Query Parameters:**
- `course_id` (string, UUID, optional): Course ID for validation

**Response:**
```json
{
  "review": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "text": "Profile content...",
    "status": "approved"
  },
  "course_id": "98adc978-af12-4b83-88ce-a9178670ae46",
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### Approve Class Profile

**Endpoint:** `POST /api/courses/{course_id}/class-profiles/{profile_id}/approve`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `profile_id` (string, UUID): Class profile ID

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "profile": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "content": "...",
    "metadata": {}
  }
}
```

---

### Edit Class Profile

**Endpoint:** `POST /api/courses/{course_id}/class-profiles/{profile_id}/edit`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `profile_id` (string, UUID): Class profile ID

**Request Body:**
```json
{
  "text": "Manually edited profile text..."
}
```

**Response:**
```json
{
  "review": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "text": "Manually edited profile text...",
    "status": "edit_pending"
  },
  "course_id": "98adc978-af12-4b83-88ce-a9178670ae46",
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### LLM Refine Class Profile

**Endpoint:** `POST /api/courses/{course_id}/class-profiles/{profile_id}/llm-refine`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `profile_id` (string, UUID): Class profile ID

**Request Body:**
```json
{
  "prompt": "Make the profile more focused on practical applications"
}
```

**Response:**
```json
{
  "review": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "text": "Refined profile text...",
    "status": "edit_pending"
  },
  "course_id": "98adc978-af12-4b83-88ce-a9178670ae46",
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Reading Management

### Batch Upload Readings

**Endpoint:** `POST /api/courses/{course_id}/readings/batch-upload`

**Path Parameters:**
- `course_id` (string, UUID): Course ID

**Request Body:**
```json
{
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
  "readings": [
    {
      "title": "Introduction to Version Control",
      "source_type": "uploaded",
      "content_base64": "JVBERi0xLjQKJeLjz9MKMy...",
      "original_filename": "version-control.pdf"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "created_count": 1,
  "readings": [
    {
      "id": "reading-uuid-here",
      "title": "Introduction to Version Control",
      "file_path": "course_98adc978-af12-4b83-88ce-a9178670ae46/reading-uuid_version-control.pdf",
      "source_type": "uploaded",
      "course_id": "98adc978-af12-4b83-88ce-a9178670ae46",
      "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
      "created_at": "2024-01-15T10:30:00Z",
      "reading_chunks": [
        {
          "id": "chunk-uuid",
          "chunk_index": 0,
          "content": "Chunk content...",
          "chunk_metadata": {
            "document_id": "introduction_to_version_control",
            "token_count": 150
          }
        }
      ]
    }
  ],
  "errors": []
}
```

**Frontend Example:**
```typescript
const fileArray = Array.from(files);
const readingsPayload = await Promise.all(
  fileArray.map(async file => {
    const base64 = await fileToBase64(file);
    return {
      title: file.name.replace(/\.pdf$/i, ''),
      source_type: 'uploaded',
      content_base64: base64,
      original_filename: file.name
    };
  })
);

const payload = {
  instructor_id: instructorId,
  readings: readingsPayload
};

const response = await fetch(`/api/courses/${courseId}/readings/batch-upload`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});
const data = await response.json();
```

---

### Get Readings List

**Endpoint:** `GET /api/readings`

**Query Parameters:**
- `course_id` (string, UUID, optional): Filter by course ID
- `instructor_id` (string, UUID, optional): Filter by instructor ID

**Response:**
```json
{
  "readings": [
    {
      "id": "reading-uuid-here",
      "title": "Introduction to Version Control",
      "file_path": "course_xxx/reading-uuid_version-control.pdf",
      "source_type": "uploaded",
      "course_id": "98adc978-af12-4b83-88ce-a9178670ae46",
      "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
      "created_at": "2024-01-15T10:30:00Z",
      "reading_chunks": [...]
    }
  ],
  "total": 1
}
```

**Frontend Example:**
```typescript
const query = new URLSearchParams({
  course_id: courseId,
  instructor_id: instructorId
});
const response = await fetch(`/api/readings?${query.toString()}`);
const data = await response.json();
const readings = data.readings;
```

---

### Delete Reading

**Endpoint:** `DELETE /api/courses/{course_id}/readings/{reading_id}`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `reading_id` (string, UUID): Reading ID

**Response:**
```json
{
  "success": true,
  "message": "Reading {reading_id} deleted successfully"
}
```

**Frontend Example:**
```typescript
const response = await fetch(`/api/courses/${courseId}/readings/${readingId}`, {
  method: 'DELETE'
});
const data = await response.json();
```

---

## Session Management

### Create Session with Readings

**Endpoint:** `POST /api/courses/{course_id}/sessions`

**Path Parameters:**
- `course_id` (string, UUID): Course ID

**Request Body:**
```json
{
  "week_number": 1,
  "title": "Week 1 Reading Session",
  "reading_ids": [
    "reading-uuid-1",
    "reading-uuid-2",
    "reading-uuid-3"
  ]
}
```

**Response:**
```json
{
  "session_id": "session-uuid-here",
  "course_id": "98adc978-af12-4b83-88ce-a9178670ae46",
  "week_number": 1,
  "title": "Week 1 Reading Session",
  "reading_ids": [
    "reading-uuid-1",
    "reading-uuid-2",
    "reading-uuid-3"
  ]
}
```

**Frontend Example:**
```typescript
const payload = {
  week_number: 1,
  title: "Week 1 Reading Session",
  reading_ids: selectedReadingIds
};

const response = await fetch(`/api/courses/${courseId}/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});
const data = await response.json();
const sessionId = data.session_id;
```

---

## Scaffold Management

### Generate Scaffolds

**Endpoint:** `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/generate`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `session_id` (string, UUID or "new"): Session ID (use "new" to create a new session)
- `reading_id` (string, UUID): Reading ID

**Request Body:**
```json
{
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "annotation_scaffolds_review": [
    {
      "id": "scaffold-uuid-1",
      "fragment": "A version control system serves the following purposes...",
      "text": "Consider a collaborative education data analysis project...",
      "status": "pending",
      "history": [
        {
          "ts": 1705312800.0,
          "action": "init",
          "prompt": null,
          "old_text": null,
          "new_text": "Consider a collaborative education data analysis project..."
        }
      ]
    }
  ],
  "session_id": "session-uuid-here",
  "reading_id": "reading-uuid-here",
  "pdf_url": "https://supabase.co/storage/v1/object/public/readings/course_xxx/reading-uuid_file.pdf"
}
```

**Frontend Example:**
```typescript
const payload = {
  instructor_id: instructorId
};

const generateUrl = `/api/courses/${courseId}/sessions/${sessionId}/readings/${readingId}/scaffolds/generate`;
const response = await fetch(generateUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});
const data = await response.json();
const scaffolds = data.annotation_scaffolds_review;
const pdfUrl = data.pdf_url;
```

---

### Approve Scaffold

**Endpoint:** `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/approve`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `session_id` (string, UUID): Session ID
- `reading_id` (string, UUID): Reading ID
- `scaffold_id` (string, UUID): Scaffold ID

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "scaffold": {
    "id": "scaffold-uuid-1",
    "fragment": "A version control system serves...",
    "text": "Consider a collaborative education...",
    "status": "approved",
    "history": [
      {
        "ts": 1705312800.0,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": "Consider a collaborative education..."
      },
      {
        "ts": 1705312900.0,
        "action": "approve",
        "prompt": null,
        "old_text": null,
        "new_text": null
      }
    ]
  }
}
```

**Frontend Example:**
```typescript
const response = await fetch(
  `/api/courses/${courseId}/sessions/${sessionId}/readings/${readingId}/scaffolds/${scaffoldId}/approve`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  }
);
const data = await response.json();
```

---

### Edit Scaffold

**Endpoint:** `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/edit`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `session_id` (string, UUID): Session ID
- `reading_id` (string, UUID): Reading ID
- `scaffold_id` (string, UUID): Scaffold ID

**Request Body:**
```json
{
  "new_text": "Edited scaffold text..."
}
```

**Response:**
```json
{
  "scaffold": {
    "id": "scaffold-uuid-1",
    "fragment": "A version control system serves...",
    "text": "Edited scaffold text...",
    "status": "edit_pending",
    "history": [...]
  }
}
```

---

### LLM Refine Scaffold

**Endpoint:** `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/llm-refine`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `session_id` (string, UUID): Session ID
- `reading_id` (string, UUID): Reading ID
- `scaffold_id` (string, UUID): Scaffold ID

**Request Body:**
```json
{
  "prompt": "Make this question more specific to data analysis workflows"
}
```

**Response:**
```json
{
  "scaffold": {
    "id": "scaffold-uuid-1",
    "fragment": "A version control system serves...",
    "text": "Refined scaffold text...",
    "status": "edit_pending",
    "history": [...]
  }
}
```

---

### Reject Scaffold

**Endpoint:** `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/reject`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `session_id` (string, UUID): Session ID
- `reading_id` (string, UUID): Reading ID
- `scaffold_id` (string, UUID): Scaffold ID

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "scaffold": {
    "id": "scaffold-uuid-1",
    "fragment": "A version control system serves...",
    "text": "Consider a collaborative education...",
    "status": "rejected",
    "history": [...]
  }
}
```

---

### Get Scaffolds Bundle

**Endpoint:** `GET /api/courses/{course_id}/sessions/{session_id}/scaffolds/bundle`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `session_id` (string, UUID): Session ID

**Response:**
```json
{
  "scaffolds": [
    {
      "id": "scaffold-uuid-1",
      "fragment": "...",
      "text": "...",
      "status": "approved",
      "reading_id": "reading-uuid-1"
    }
  ],
  "session_id": "session-uuid-here"
}
```

---

### Save Highlight Coordinates

**Endpoint:** `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/highlight-report`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `session_id` (string, UUID): Session ID
- `reading_id` (string, UUID): Reading ID

**Request Body:**
```json
{
  "coords": [
    {
      "annotation_id": "scaffold-uuid-1",
      "annotation_version_id": "version-uuid-1",
      "rangeType": "text",
      "rangePage": 1,
      "rangeStart": 0,
      "rangeEnd": 50,
      "fragment": "A version control system serves...",
      "positionStartX": 0.1,
      "positionStartY": 0.2,
      "positionEndX": 0.9,
      "positionEndY": 0.3,
      "session_id": "session-uuid-here"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "created_count": 1,
  "errors": []
}
```

**Frontend Example:**
```typescript
const coords = highlights.map(highlight => ({
  annotation_id: highlight.annotationId,
  annotation_version_id: highlight.versionId,
  rangeType: highlight.rangeType,
  rangePage: highlight.rangePage,
  rangeStart: highlight.rangeStart,
  rangeEnd: highlight.rangeEnd,
  fragment: highlight.fragment,
  positionStartX: highlight.positionStartX,
  positionStartY: highlight.positionStartY,
  positionEndX: highlight.positionEndX,
  positionEndY: highlight.positionEndY,
  session_id: sessionId
}));

const response = await fetch(
  `/api/courses/${courseId}/sessions/${sessionId}/readings/${readingId}/scaffolds/highlight-report`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coords })
  }
);
```

---

## Perusall Integration

### Post Annotations to Perusall

**Endpoint:** `POST /api/courses/{course_id}/readings/{reading_id}/perusall/annotations`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `reading_id` (string, UUID): Reading ID

**Request Body:**
```json
{
  "annotation_ids": [
    "scaffold-uuid-1",
    "scaffold-uuid-2"
  ]
}
```

**Alternative Request Body (direct annotations):**
```json
{
  "annotations": [
    {
      "positionStartX": 0.1,
      "positionStartY": 0.2,
      "positionEndX": 0.9,
      "positionEndY": 0.3,
      "rangeType": "text",
      "rangePage": 1,
      "rangeStart": 0,
      "rangeEnd": 50,
      "fragment": "A version control system serves..."
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "created_ids": ["perusall-annotation-id-1", "perusall-annotation-id-2"],
  "errors": []
}
```

**Frontend Example:**
```typescript
const annotationIds = acceptedScaffolds.map(s => s.id);
const response = await fetch(
  `/api/courses/${courseId}/readings/${readingId}/perusall/annotations`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotation_ids: annotationIds })
  }
);
const data = await response.json();
```

---

### Create Perusall Mapping

**Endpoint:** `POST /api/courses/{course_id}/readings/{reading_id}/perusall/mapping`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `reading_id` (string, UUID): Reading ID

**Request Body:**
```json
{
  "course_id": "98adc978-af12-4b83-88ce-a9178670ae46",
  "reading_id": "reading-uuid-here",
  "perusall_course_id": "12345",
  "perusall_assignment_id": "67890",
  "perusall_document_id": "11111"
}
```

**Response:**
```json
{
  "success": true,
  "mapping_id": "mapping-uuid-here",
  "course_title": "CS101: Introduction to Computer Science",
  "reading_title": "Introduction to Version Control",
  "perusall_course_id": "12345",
  "perusall_assignment_id": "67890",
  "perusall_document_id": "11111"
}
```

---

### Get Perusall Mapping

**Endpoint:** `GET /api/perusall/mapping/{course_id}/{reading_id}`

**Path Parameters:**
- `course_id` (string, UUID): Course ID
- `reading_id` (string, UUID): Reading ID

**Response:**
```json
{
  "success": true,
  "mapping_id": "mapping-uuid-here",
  "course_title": "CS101: Introduction to Computer Science",
  "reading_title": "Introduction to Version Control",
  "perusall_course_id": "12345",
  "perusall_assignment_id": "67890",
  "perusall_document_id": "11111"
}
```

---

## Data Models

### ReadingUploadItem
```typescript
{
  title: string;                    // Required
  file_path?: string;               // Optional (generated for uploaded readings)
  source_type: "uploaded" | "reused"; // Default: "uploaded"
  content_base64?: string;          // Required for uploaded readings
  original_filename?: string;        // Original filename for uploaded readings
}
```

### ReviewedScaffoldModel
```typescript
{
  id: string;
  fragment: string;                  // Text fragment from reading
  text: string;                     // Scaffold question/prompt
  status?: "pending" | "approved" | "rejected" | "edit_pending" | "draft";
  history?: HistoryEntryModel[];
}
```

### HistoryEntryModel
```typescript
{
  ts: number;                       // Timestamp
  action: "init" | "approve" | "reject" | "manual_edit" | "llm_refine";
  prompt?: string;                  // LLM prompt (if applicable)
  old_text?: string;                // Previous text (if applicable)
  new_text?: string;                // New text (if applicable)
}
```

### HighlightCoordsItem
```typescript
{
  annotation_id?: string;           // Scaffold/annotation ID
  annotation_version_id?: string;   // Version ID
  rangeType: string;                // "text" or other
  rangePage: number;                 // Page number (1-indexed)
  rangeStart: number;                // Character start position
  rangeEnd: number;                  // Character end position
  fragment: string;                  // Text fragment
  positionStartX: number;            // Normalized X start (0-1)
  positionStartY: number;            // Normalized Y start (0-1)
  positionEndX: number;              // Normalized X end (0-1)
  positionEndY: number;              // Normalized Y end (0-1)
  session_id?: string;              // Session ID
}
```

---

## URL Structure

All API endpoints follow RESTful conventions:

- **Resource hierarchy:** `/api/courses/{course_id}/class-profiles/{profile_id}/...`
- **Path parameters:** Required IDs are in the URL path
- **Query parameters:** Used for filtering (e.g., `?course_id=xxx&instructor_id=yyy`)
- **Request body:** Contains data payload (not IDs that are in the path)

### Frontend URL Structure

Frontend routes mirror the RESTful API structure:

- `/courses/{courseId}/class-profiles/{profileId}/view`
- `/courses/{courseId}/class-profiles/{profileId}/edit`
- `/courses/{courseId}/class-profiles/{profileId}/reading`
- `/courses/{courseId}/class-profiles/{profileId}/session/create`

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `400 Bad Request`: Invalid request format or parameters
- `404 Not Found`: Resource not found
- `422 Unprocessable Entity`: Validation error (e.g., missing required fields)
- `500 Internal Server Error`: Server-side error

---

## Notes

1. **UUID Format:** All IDs are UUIDs (e.g., `550e8400-e29b-41d4-a716-446655440000`)
2. **Session ID:** Use `"new"` as `session_id` to create a new session automatically
3. **Course ID:** Use `"new"` as `course_id` in class profile creation to create a new course
4. **Base64 Encoding:** PDF files are sent as base64-encoded strings in `content_base64`
5. **Retry Logic:** File uploads to Supabase Storage include automatic retry (3 attempts with exponential backoff)
6. **Cascade Deletes:** Deleting a course/session/reading automatically deletes related resources

