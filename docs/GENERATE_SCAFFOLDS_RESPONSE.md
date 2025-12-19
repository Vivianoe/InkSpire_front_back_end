# `/api/generate-scaffolds` 端点返回结构

## 概述

`POST /api/generate-scaffolds` 端点返回生成的 scaffold 列表、会话信息、阅读材料 ID 和 PDF URL。

## 返回数据结构

### 响应格式

```json
{
  "annotation_scaffolds_review": [
    {
      "id": "uuid-string",
      "fragment": "文本片段（来自 PDF）",
      "text": "生成的 scaffold 问题/提示文本"
    },
    // ... 更多 scaffolds
  ],
  "session_id": "uuid-string",
  "reading_id": "uuid-string",
  "pdf_url": "https://supabase.co/storage/v1/object/sign/readings/..."
}
```

### 字段说明

#### `annotation_scaffolds_review` (Array)

**类型**: `List[ReviewedScaffoldModel]`

**每个 scaffold 对象包含：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | Scaffold 的唯一标识符（UUID） |
| `fragment` | `string` | 来自 PDF 的文本片段，这是 scaffold 对应的原文 |
| `text` | `string` | AI 生成的 scaffold 问题/提示文本，用于指导学生思考 |
| `status` | `string` | Scaffold 的状态：`"pending"`（待审核）、`"approved"`（已批准）、`"rejected"`（已拒绝）、`"edit_pending"`（编辑中）、`"draft"`（草稿） |
| `history` | `Array` | Scaffold 的历史记录数组，包含所有状态变更记录 |

**示例：**
```json
{
  "id": "cbf12d27-9155-431c-9fa0-857fb142b727",
  "fragment": "A version control system serves the following purposes, among others. Version control enables multiple people to simultaneously work on a single project.",
  "text": "Consider a collaborative education data analysis project. How could version control help your team manage Python scripts and datasets, ensuring everyone has the latest version and can track changes effectively?",
  "status": "pending",
  "history": [
    {
      "ts": 1766037322.98965,
      "action": "init",
      "prompt": null,
      "old_text": null,
      "new_text": "Consider a collaborative education data analysis project. How could version control help your team manage Python scripts and datasets, ensuring everyone has the latest version and can track changes effectively?"
    }
  ]
}
```

#### `session_id` (Optional String)

**类型**: `string | null`

**说明**: 
- 会话的唯一标识符（UUID）
- 如果请求中没有提供 `session_id`，后端会自动创建新会话
- 前端应保存此 ID，用于后续的 scaffold 操作和查询

#### `reading_id` (Optional String)

**类型**: `string | null`

**说明**:
- 阅读材料的唯一标识符（UUID）
- 对应生成 scaffolds 的 PDF 文件

#### `pdf_url` (Optional String)

**类型**: `string | null`

**说明**:
- PDF 文件的签名 URL（来自 Supabase Storage）
- URL 有效期为 7 天
- 用于前端渲染 PDF 预览
- 如果获取失败，此字段可能为 `null`

**URL 格式示例：**
```
https://[project-ref].supabase.co/storage/v1/object/sign/readings/course_[course_id]/[reading_id]_[filename].pdf?token=...
```

## 完整响应示例

```json
{
  "annotation_scaffolds_review": [
    {
      "id": "cbf12d27-9155-431c-9fa0-857fb142b727",
      "fragment": "A version control system serves the following purposes, among others. Version control enables multiple people to simultaneously work on a single project. Each person edits his or her own copy of the ﬁles and chooses when to share those changes with the rest of the team.",
      "text": "Consider a collaborative education data analysis project. How could version control help your team manage Python scripts and datasets, ensuring everyone has the latest version and can track changes effectively?",
      "status": "pending",
      "history": [
        {
          "ts": 1766037322.98965,
          "action": "init",
          "prompt": null,
          "old_text": null,
          "new_text": "Consider a collaborative education data analysis project. How could version control help your team manage Python scripts and datasets, ensuring everyone has the latest version and can track changes effectively?"
        }
      ]
    },
    {
      "id": "1b9585d0-4f9c-4192-80fc-8d96ed9bd5a4",
      "fragment": "Version control uses a repository (a database of program versions) and a working copy where you edit ﬁles. Your working copy (sometimes called a checkout or clone) is your personal copy of all the ﬁles in the project. When you are happy with your edits, you commit your changes to a repository.",
      "text": "In your own words, explain the difference between a 'working copy' and a 'repository'. What specific action does 'committing' your changes perform, and why is it a crucial step in managing your code?"
    },
    {
      "id": "363ae2cf-6ec3-40a4-9341-b58ecf281510",
      "fragment": "There are two general varieties of version control: centralized and distributed. Distributed version control is more modern, runs faster, is less prone to errors, has more features, and is more complex to understand. The main diﬀerence between centralized and distributed version control is the number of repositories.",
      "text": "Given that we will primarily use Git, a distributed version control system, what do you think are the key advantages of having multiple repositories for a team working on Python-based data analysis workflows?"
    }
  ],
  "session_id": "cbac0675-6ba0-401e-9919-75046b6dcc5f",
  "reading_id": "59c15877-b451-41a8-b7c1-0f02839afe73",
  "pdf_url": "https://jrcstgmtxnavrkbdcdig.supabase.co/storage/v1/object/sign/readings/course_98adc978-af12-4b83-88ce-a9178670ae46/59c15877-b451-41a8-b7c1-0f02839afe73_reading02.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV85NWYyODY4Ni1mOTAzLTQ4NjMtODQ3Mi0zNzNiMWFhYmRhZDciLCJhbGciOiJIUzI1NiJ9..."
}
```

## 数据流转过程

### 1. 后端处理流程

```
用户请求 (GenerateScaffoldsRequest)
  ↓
验证和加载数据（课程、阅读材料、class profile、chunks）
  ↓
调用 LLM 工作流 (run_material_focus_scaffold)
  ↓
保存到数据库 (create_scaffold_annotation)
  ↓
转换为 API 格式 (scaffold_to_dict → scaffold_to_model)
  ↓
获取 PDF 签名 URL (Supabase Storage)
  ↓
构建响应 (ReadingScaffoldsResponse + pdf_url)
  ↓
返回 JSON 响应
```

### 2. 数据转换

**数据库模型 → API 模型：**

```python
# 数据库: ScaffoldAnnotation
annotation = create_scaffold_annotation(...)
# 包含: id, highlight_text, current_content, status, versions, ...

# 转换为字典
annotation_dict = scaffold_to_dict(annotation)
# 返回: { "id": "...", "fragment": "...", "text": "..." }

# 转换为 Pydantic 模型
api_obj = scaffold_to_model(annotation_dict)
# ReviewedScaffoldModel(id="...", fragment="...", text="...")
```

**注意**: `generate-scaffolds` 现在返回完整版本，包含 `status` 和 `history` 字段。新生成的 scaffolds 初始状态为 `"pending"`，并包含一个 `"init"` 历史记录。

## 前端使用方式

### 1. 接收响应

```typescript
const response = await fetch('/api/generate-scaffolds', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    instructor_id: "...",
    course_id: "...",
    reading_id: "...",
    session_id: "..." // 可选
  })
});

const data = await response.json();
// data = {
//   annotation_scaffolds_review: [...],
//   session_id: "...",
//   reading_id: "...",
//   pdf_url: "..."
// }
```

### 2. 使用数据

```typescript
// 1. 保存 session_id 和 reading_id
setSessionId(data.session_id);
setReadingId(data.reading_id);

// 2. 使用 PDF URL 渲染 PDF
setPdfUrl(data.pdf_url);

// 3. 显示 scaffolds 列表
setScaffolds(data.annotation_scaffolds_review);

// 4. 将 fragments 传递给 PdfPreview 组件进行高亮
const fragments = data.annotation_scaffolds_review.map(s => s.fragment);
<PdfPreview 
  url={data.pdf_url}
  searchQueries={fragments}  // 用于高亮
  sessionId={data.session_id}
/>
```

### 3. 后续操作

**获取完整 scaffold 信息（包括 status 和 history）：**
```typescript
const fullResponse = await fetch(`/api/annotation-scaffolds/by-session/${sessionId}`);
const { scaffolds } = await fullResponse.json();
// scaffolds 包含 status 和 history 字段
```

**操作 scaffold（approve, edit, reject, llm-refine）：**
```typescript
// 使用 scaffold.id 进行操作
await fetch(`/api/annotation-scaffolds/${scaffold.id}/approve`, {
  method: 'POST'
});
// 返回包含 status 和 history 的完整信息
```

## 与 `/api/reading-scaffolds` 的区别

| 端点 | 用途 | 返回的 scaffold 格式 |
|------|------|---------------------|
| `/api/generate-scaffolds` | 高级端点，从数据库加载所有数据 | `ReviewedScaffoldModel` (简化版：id, fragment, text) |
| `/api/reading-scaffolds` | 底层端点，直接运行工作流 | `ReviewedScaffoldModel` (简化版：id, fragment, text) |

**注意**: 
- `/api/generate-scaffolds` 返回完整版本（包含 `status` 和 `history`）
- `/api/reading-scaffolds` 返回简化版本（只有 `id`, `fragment`, `text`）

## 错误响应

### 400 Bad Request
```json
{
  "detail": "Invalid course_id format: ..."
}
```

### 404 Not Found
```json
{
  "detail": "Course ... not found"
}
```

### 429 Too Many Requests
```json
{
  "detail": "API quota exceeded. Please wait a moment and try again, or check your Gemini API plan and billing details."
}
```

### 500 Internal Server Error
```json
{
  "detail": "Failed to generate scaffolds: ..."
}
```

