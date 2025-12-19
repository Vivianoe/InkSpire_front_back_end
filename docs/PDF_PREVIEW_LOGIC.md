# PdfPreview Component Logic Explanation

## Overview

`PdfPreview` 是一个 React 组件，用于在浏览器中渲染 PDF 文件，并提供文本高亮、搜索和滚动定位功能。它支持从本地文件或 URL（如 Supabase Storage）加载 PDF。

## Core Architecture

### 1. **PDF Loading (PDF 加载)**

```typescript
// 支持两种加载方式：
- file: File | null        // 本地文件对象
- url: string | null       // PDF URL (如 Supabase Storage 的签名 URL)
```

**加载流程：**
1. 使用 PDF.js 库加载 PDF 文档
2. 从 CDN 加载 PDF.js（在 `layout.tsx` 中已注入）
3. 根据 `file` 或 `url` 选择加载方式
4. 将 PDF 文档对象存储在 `pdfDoc` 状态中

### 2. **Page Rendering (页面渲染)**

**三层渲染结构：**

```
┌─────────────────────────┐
│   Page Container        │
│  ┌───────────────────┐  │
│  │  Canvas Layer     │  │  ← PDF 图像渲染层 (z-index: 1)
│  │  (PDF 视觉内容)    │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │  Overlay Layer    │  │  ← 后端高亮层 (z-index: 5)
│  │  (后端坐标高亮)    │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │  Text Layer       │  │  ← 文本选择层 (z-index: 10)
│  │  (可搜索文本)      │  │
│  └───────────────────┘  │
└─────────────────────────┘
```

**渲染步骤：**
1. **Canvas 层**：使用 PDF.js 将 PDF 页面渲染为 Canvas
2. **Text Layer**：提取文本内容，创建可选择的文本层
3. **Overlay Layer**：用于显示后端返回的坐标高亮

**关键函数：**
- `renderPage(pageNumber)` - 渲染单个页面
- `calculateScale(baseWidth)` - 根据容器宽度计算缩放比例
- 响应式：窗口大小改变时重新计算缩放

### 3. **Text Highlighting (文本高亮)**

**两种高亮策略：**

#### Strategy A: 本地搜索高亮（主要策略）

**流程：**
1. **接收搜索查询**：从 `searchQueries` prop 获取 scaffold fragments
2. **文本索引构建**：遍历 text layer 的所有文本节点，构建字符索引
3. **模式匹配**：使用灵活的正则表达式匹配文本
4. **应用高亮**：使用 Rangy 库在匹配的文本上添加 `<mark>` 标签
5. **记录坐标**：计算每个高亮的坐标并保存到 `highlightRecordsRef`

**关键函数：**
- `highlightInLayer(layer, query, applier)` - 在指定层中高亮查询文本
- `patternFromQueryLiteralFlexible(q)` - 生成灵活的正则模式

**模式匹配特点：**
- 处理 PDF 文本中常见的空格缺失问题（如 "aversion" 匹配 "A version"）
- 处理连字符和特殊字符
- 支持单字母单词的特殊处理（如 "A version" → "aversion"）
- 关键词回退匹配：如果完整匹配失败，尝试关键词序列匹配

#### Strategy B: 后端坐标高亮（备用策略）

**流程：**
1. 从后端 API 获取已保存的高亮坐标
2. 在 Overlay Layer 上绘制矩形高亮
3. 使用 `drawRectOnPage()` 函数绘制

### 4. **Coordinate System (坐标系统)**

**坐标编码格式：**
```typescript
{
  positionStartX: 0.123,      // X 坐标 [0, 1] (相对于页面宽度)
  positionStartY: 2.456,      // Y 坐标 = pageNum + fraction [0, 0.999]
  positionEndX: 0.789,
  positionEndY: 2.890,
  rangePage: 2,               // 页码 (1-based)
  rangeStart: 1234,           // 文本索引起始位置
  rangeEnd: 1567,             // 文本索引结束位置
  fragment: "text content",   // 匹配的文本片段
  session_id: "uuid"          // 会话 ID
}
```

**坐标计算：**
- `coordsPageEncodedY(range, pageEl, pageNum)` - 将 DOM Range 转换为页面坐标
- Y 坐标 = 页码 + 页面内相对位置（0-0.999）

### 5. **Scroll to Fragment (滚动定位)**

**功能：** 当用户点击 scaffold 卡片时，自动滚动到对应的 PDF 高亮位置

**流程：**
1. **接收参数**：
   - `scrollToFragment`: 要定位的文本片段
   - `scaffoldIndex`: scaffold 的索引（0-based）

2. **匹配策略**：
   - **策略 1**：直接索引匹配（最准确）
     - 根据 `scaffoldIndex` 找到对应的 highlight record
   - **策略 2**：文本匹配（回退）
     - 使用文本相似度匹配 fragment
     - 支持部分匹配（前 50/100 字符）

3. **滚动执行**：
   - 计算高亮在页面中的位置
   - 滚动容器使高亮居中显示
   - 添加视觉指示（box-shadow）

4. **高亮激活**：
   - 找到对应的 DOM 元素（`.pdf-hit` 或 `mark.pdf-highlight`）
   - 添加 `highlighted` class 和 box-shadow 效果

**关键函数：**
- `scrollToMatchFragment(fragment, scaffoldIndex)` - 滚动到匹配的片段

### 6. **Highlight Report (高亮报告)**

**功能：** 将本地搜索找到的高亮坐标保存到后端

**流程：**
1. 所有页面渲染完成后，执行本地搜索
2. 收集所有找到的高亮坐标到 `highlightRecordsRef.current`
3. 发送 POST 请求到 `/api/highlight-report`
4. 请求格式：
```json
{
  "coords": [
    {
      "rangeType": "text",
      "rangePage": 1,
      "rangeStart": 123,
      "rangeEnd": 456,
      "fragment": "matched text",
      "positionStartX": 0.123,
      "positionStartY": 1.456,
      "positionEndX": 0.789,
      "positionEndY": 1.890,
      "session_id": "uuid"
    }
  ]
}
```

### 7. **State Management (状态管理)**

**主要状态：**
```typescript
- pdfDoc: PDF 文档对象
- renderedPages: Set<number> - 已渲染的页码集合
- pageElements: Map<number, HTMLDivElement> - 页面容器元素映射
- overlayLayers: Map<number, HTMLDivElement> - 高亮层元素映射
- loading: boolean - 加载状态
- error: string | null - 错误信息
- viewportVersion: number - 视口版本（用于触发重新渲染）
```

**Refs：**
```typescript
- highlightRecordsRef: 高亮记录数组
- pageElementsRef: 页面元素映射（与 state 同步）
- overlayLayersRef: 高亮层映射（与 state 同步）
- appliersRef: Rangy 高亮应用器（A/B 两种样式）
- pendingScrollRef: 待处理的滚动请求
- activeHighlightRef: 当前激活的高亮元素
```

### 8. **Key Effects (关键 Effect Hooks)**

#### Effect 1: PDF 加载
```typescript
useEffect(() => {
  // 当 file 或 url 改变时，加载 PDF
}, [file, url]);
```

#### Effect 2: 页面渲染
```typescript
useEffect(() => {
  // 当 pdfDoc 加载完成后，渲染所有页面
  // 响应式：viewportVersion 改变时重新渲染
}, [pdfDoc, viewportVersion]);
```

#### Effect 3: 文本高亮
```typescript
useEffect(() => {
  // 当所有页面渲染完成后：
  // 1. 从 searchQueries 获取 fragments
  // 2. 在 text layers 中搜索并高亮
  // 3. 记录坐标并发送到后端
}, [pdfDoc, renderedPages, searchQueries]);
```

#### Effect 4: 滚动定位
```typescript
useEffect(() => {
  // 当 scrollToFragment 改变时，滚动到对应位置
}, [scrollToFragment, scaffoldIndex, renderedPages]);
```

### 9. **Styling (样式系统)**

**CSS 注入：**
- 组件首次挂载时，将 PDF.js 样式注入到 `<head>`
- 自定义高亮样式（黄色背景、橙色边框等）
- 文本选择样式（蓝色背景）

**高亮样式类：**
- `.pdf-highlight` - 主要高亮样式（黄色）
- `.pdf-highlight-alt` - 备用高亮样式（用于交替显示）
- `.pdf-hit` - 后端坐标高亮样式（橙色）
- `.highlighted` - 激活状态（带 box-shadow）

### 10. **Error Handling (错误处理)**

**错误场景：**
1. PDF 加载失败 → 显示错误消息
2. 页面渲染失败 → 记录错误但不中断其他页面
3. 高亮搜索失败 → 回退到后端坐标高亮
4. API 请求失败 → 记录警告但继续运行

## Data Flow (数据流)

```
用户操作
  ↓
Props 更新 (searchQueries, scrollToFragment)
  ↓
PDF 加载 (file/url → pdfDoc)
  ↓
页面渲染 (pdfDoc → renderedPages)
  ↓
文本高亮 (searchQueries → highlightRecordsRef)
  ↓
坐标报告 (highlightRecordsRef → /api/highlight-report)
  ↓
滚动定位 (scrollToFragment → scrollToMatchFragment)
  ↓
视觉反馈 (highlighted class + box-shadow)
```

## Performance Optimizations (性能优化)

1. **延迟渲染**：使用 `requestAnimationFrame` 延迟页面渲染
2. **取消机制**：使用 `cancelled` 标志防止内存泄漏
3. **批量更新**：收集所有高亮后再一次性发送到后端
4. **防抖滚动**：使用 `setTimeout` 延迟滚动执行
5. **条件渲染**：只在必要时重新渲染页面

## Key Dependencies (关键依赖)

- **PDF.js**: PDF 渲染和文本提取
- **Rangy**: 文本选择和范围操作
- **React Hooks**: 状态管理和副作用处理

## Usage Example (使用示例)

```tsx
<PdfPreview
  url={pdfUrl}                    // PDF URL from Supabase
  searchQueries={fragments}       // Array of scaffold fragments
  scrollToFragment={selectedFragment}  // Fragment to scroll to
  scaffoldIndex={selectedIndex}    // Index of selected scaffold
  sessionId={sessionId}           // Session ID for coordinate mapping
  onTextExtracted={(text) => {}}  // Callback (optional)
/>
```

## Common Issues & Solutions (常见问题)

1. **高亮不显示**：
   - 检查 PDF 文本层是否正确渲染
   - 验证正则模式是否匹配 PDF 文本格式
   - 查看控制台日志了解匹配结果

2. **滚动不工作**：
   - 确保 `highlightRecordsRef` 已填充
   - 检查 `scrollToFragment` 是否与 fragment 匹配
   - 验证页面元素是否已渲染

3. **坐标不准确**：
   - 检查页面缩放是否正确
   - 验证坐标计算是否考虑设备像素比
   - 确认页面容器尺寸

