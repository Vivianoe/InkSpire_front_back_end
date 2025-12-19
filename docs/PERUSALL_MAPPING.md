# Perusall 映射配置和使用指南

## 概述

系统现在支持为每个课程-阅读材料对配置独立的 Perusall 参数（`course_id`, `assignment_id`, `document_id`）。当发布 annotations 到 Perusall 时，系统会自动根据课程和阅读材料查找对应的 Perusall 参数。

## 数据库结构

### `perusall_mappings` 表

存储课程和阅读材料到 Perusall ID 的映射关系：

```sql
CREATE TABLE perusall_mappings (
    id UUID PRIMARY KEY,
    course_id UUID NOT NULL REFERENCES courses(id),
    reading_id UUID NOT NULL REFERENCES readings(id),
    perusall_course_id TEXT NOT NULL,      -- Perusall 的 course ID
    perusall_assignment_id TEXT NOT NULL,  -- Perusall 的 assignment ID
    perusall_document_id TEXT NOT NULL,    -- Perusall 的 document ID
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    UNIQUE (course_id, reading_id)
);
```

## API 端点

### 1. 创建或更新 Perusall 映射

**端点**: `POST /api/perusall/mapping`

**请求体**:
```json
{
  "course_id": "uuid-string",
  "reading_id": "uuid-string",
  "perusall_course_id": "perusall-course-id",
  "perusall_assignment_id": "perusall-assignment-id",
  "perusall_document_id": "perusall-document-id"
}
```

**响应**:
```json
{
  "success": true,
  "mapping_id": "uuid-string",
  "course_title": "Course Name",
  "reading_title": "Reading Name",
  "perusall_course_id": "perusall-course-id",
  "perusall_assignment_id": "perusall-assignment-id",
  "perusall_document_id": "perusall-document-id"
}
```

### 2. 获取 Perusall 映射

**端点**: `GET /api/perusall/mapping/{course_id}/{reading_id}`

**响应**: 同创建端点的响应格式

### 3. 发布 Annotations 到 Perusall

**端点**: `POST /api/perusall/annotations`

**请求体**:
```json
{
  "annotation_ids": ["uuid1", "uuid2", ...]
}
```

**工作流程**:
1. 从第一个 `annotation_id` 获取 `session_id` 和 `reading_id`
2. 从 `session_id` 获取 `course_id`
3. 根据 `course_id` 和 `reading_id` 查询 `perusall_mappings` 表
4. 获取对应的 `perusall_course_id`, `perusall_assignment_id`, `perusall_document_id`
5. 使用这些参数发布 annotations 到 Perusall

## 环境变量

以下环境变量仍然需要配置（用于 API 认证和用户 ID）：

- `PERUSALL_INSTITUTION`: Perusall 机构名称
- `PERUSALL_API_TOKEN`: Perusall API Token
- `PERUSALL_USER_ID`: Perusall 用户 ID

**注意**: `PERUSALL_COURSE_ID`, `PERUSALL_ASSIGNMENT_ID`, `PERUSALL_DOCUMENT_ID` 不再需要作为环境变量，而是从数据库映射表中动态获取。

## 使用示例

### 1. 配置映射

```bash
curl -X POST http://localhost:8000/api/perusall/mapping \
  -H "Content-Type: application/json" \
  -d '{
    "course_id": "00000000-0000-4000-8000-000000000111",
    "reading_id": "59c15877-b451-41a8-b7c1-0f02839afe73",
    "perusall_course_id": "course123",
    "perusall_assignment_id": "assignment456",
    "perusall_document_id": "document789"
  }'
```

### 2. 发布 Annotations

前端调用：
```typescript
const response = await fetch('/api/perusall/annotations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    annotation_ids: acceptedScaffolds.map(s => s.id)
  })
});
```

后端会自动：
1. 从第一个 annotation 获取 course 和 reading
2. 查询映射表获取 Perusall 参数
3. 使用这些参数发布到 Perusall

## 错误处理

如果映射不存在，会返回 404 错误：
```json
{
  "detail": "Perusall mapping not found for course 'Course Name' and reading 'Reading Name'. Please configure the mapping first."
}
```

## 数据库迁移

运行迁移脚本创建 `perusall_mappings` 表：

```bash
psql -h your-db-host -U your-user -d your-database -f migrations/create_perusall_mapping_table.sql
```

或在 Supabase SQL Editor 中执行 `migrations/create_perusall_mapping_table.sql` 文件中的 SQL。

