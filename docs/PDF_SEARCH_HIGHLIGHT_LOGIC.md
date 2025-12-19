# PDF 页面搜索和高亮逻辑详解

## 概述

PdfPreview 组件的搜索和高亮功能分为两个主要阶段：
1. **搜索和高亮阶段**：在所有页面渲染完成后，根据 scaffold fragments 搜索并高亮文本
2. **滚动定位阶段**：当用户点击 scaffold 卡片时，滚动到对应的高亮位置

---

## 阶段一：搜索和高亮流程

### 1. 触发时机

```typescript
useEffect(() => {
  // 等待所有页面渲染完成
  const allRendered = renderedPages.size === pdfDoc.numPages && pdfDoc.numPages > 0;
  if (!allRendered) return;
  
  // 开始搜索和高亮流程
}, [pdfDoc, renderedPages, searchQueries]);
```

**条件：**
- PDF 文档已加载 (`pdfDoc` 存在)
- 所有页面都已渲染完成 (`renderedPages.size === pdfDoc.numPages`)
- 有搜索查询 (`searchQueries` prop)

### 2. 获取搜索查询

**优先级顺序：**

1. **从 Props 获取**（主要方式）：
   ```typescript
   // searchQueries 可以是字符串或字符串数组
   if (typeof searchQueries === 'string') {
     list = [searchQueries];
   } else if (Array.isArray(searchQueries)) {
     list = searchQueries.filter(q => q && typeof q === 'string' && q.trim());
   }
   ```
   - 这些 fragments 来自 scaffold 生成的结果
   - 每个 fragment 对应一个 scaffold 的文本片段

2. **从 API 获取**（备用方式）：
   ```typescript
   // 如果 props 中没有，尝试从 API 获取
   const qRes = await fetch('/api/queries');
   ```

### 3. 文本索引构建

**目的：** 将 PDF 文本层的 DOM 结构转换为可搜索的文本索引

**步骤：**

```typescript
// 1. 提取所有文本节点
const nodes = getTextNodesIn(layer);
// 使用 TreeWalker 遍历 DOM，提取所有文本节点

// 2. 构建索引映射
const { text, map } = buildIndex(nodes);
// text: 所有文本节点连接成的完整字符串
// map: 每个文本节点在连接字符串中的位置映射
//      [{ node: Node, start: 0, end: 50 }, { node: Node, start: 50, end: 100 }, ...]
```

**示例：**
```
文本节点1: "Hello "
文本节点2: "world"
文本节点3: "!"

连接文本: "Hello world!"
映射:
  - 节点1: start=0, end=6
  - 节点2: start=6, end=11
  - 节点3: start=11, end=12
```

### 4. 生成灵活的正则模式

**问题：** PDF 文本提取经常出现以下问题：
- 单词之间缺少空格（如 "aversion" 而不是 "A version"）
- 连字符处理不一致
- 单字母单词被合并（如 "A version" → "aversion"）

**解决方案：** `patternFromQueryLiteralFlexible()` 函数

**处理逻辑：**

```typescript
// 原始查询: "A version control system"
// 1. 分割为单词: ["A", "version", "control", "system"]

// 2. 处理单字母单词
// "A version" → 匹配 "A version", "aversion", "Aversion"
// 模式: (?:[Aa]version|(?:[Aa][\s\u00A0]+)version)

// 3. 处理单词间隙
// GAP 模式: (?:|[\s\u00A0]*|\s*[-\u2010...]\s*)
// 允许：无间隙、空格、连字符

// 4. 最终模式
// "A(?:|[\s\u00A0]*|\s*[-\u2010...]\s*)version(?:|[\s\u00A0]*|\s*[-\u2010...]\s*)control..."
```

**特殊处理：**
- **单字母单词**：允许与下一个单词合并（如 "A version" → "aversion"）
- **连字符**：支持多种连字符 Unicode 字符
- **引用格式**：识别并匹配 `[1, 2, 3]` 格式的引用

### 5. 执行搜索和高亮

**核心函数：** `highlightInLayer(layer, query, applier, debug)`

**流程：**

```typescript
// 1. 构建文本索引
const { text, map } = buildIndex(nodes);

// 2. 生成正则模式
const pattern = patternFromQueryLiteralFlexible(query);
const re = new RegExp(pattern, 'gius'); // g=global, i=ignoreCase, u=unicode, s=dotAll

// 3. 执行正则匹配
while ((m = re.exec(text)) !== null) {
  const start = m.index;        // 匹配开始位置
  const end = start + m[0].length; // 匹配结束位置
  
  // 4. 转换为 DOM Range
  const rng = indexToDomRange(start, end, map);
  
  // 5. 应用高亮样式
  applier.applyToRange(rng); // 添加 <mark class="pdf-highlight"> 标签
  
  // 6. 计算并记录坐标
  const coords = coordsPageEncodedY(rng, pageEl, pageNum);
  highlightRecordsRef.current.push({
    rangeType: 'text',
    rangePage: pageNum,
    rangeStart: start,
    rangeEnd: end,
    fragment: m[0], // 匹配到的文本
    ...coords,      // 归一化坐标
  });
}
```

**高亮样式：**
- 使用 Rangy 库的 `classApplier` 在匹配文本上添加 `<mark>` 标签
- 交替使用两种样式类：`pdf-highlight` 和 `pdf-highlight-alt`
- CSS 样式：黄色背景 (`#ffcc14e3`)

### 6. 关键词回退匹配

**如果完整模式匹配失败：**

```typescript
if (count === 0) {
  // 提取关键词（长度 > 2 的单词）
  const keyWords = query.split(/\s+/)
    .filter(w => w.length > 1)
    .map(w => w.replace(/[^\w]/g, '').toLowerCase())
    .filter(w => w.length > 2);
  
  // 生成关键词序列模式（允许任意字符间隔）
  // "version control" → "version.*?control"
  const keyPattern = keyWords.slice(0, 5).join('.*?');
  const keyRe = new RegExp(keyPattern, 'gi');
  
  // 执行关键词匹配
  while ((m = keyRe.exec(text)) !== null) {
    // 同样的高亮和坐标记录流程
  }
}
```

**适用场景：**
- PDF 文本中单词被合并（如 "Afterreading" 匹配 "After reading"）
- 部分单词缺失或变形

### 7. 坐标记录格式

**每个匹配记录包含：**

```typescript
{
  rangeType: 'text',              // 类型：文本范围
  rangePage: 1,                   // 页码（1-based）
  rangeStart: 1234,               // 文本索引起始位置
  rangeEnd: 1567,                 // 文本索引结束位置
  fragment: "matched text",       // 匹配到的文本片段
  positionStartX: 0.123,          // X 起始坐标 [0, 1]
  positionStartY: 1.456,          // Y 起始坐标 (pageNum + fraction)
  positionEndX: 0.789,            // X 结束坐标 [0, 1]
  positionEndY: 1.890,            // Y 结束坐标 (pageNum + fraction)
  session_id: "uuid"              // 会话 ID（用于后端查找）
}
```

**坐标系统：**
- **X 坐标**：归一化到 [0, 1]，相对于页面宽度
- **Y 坐标**：编码为 `pageNum + fraction`，其中 fraction ∈ [0, 0.999]
  - 例如：第 2 页，50% 位置 = `2.5`
  - 例如：第 1 页，25% 位置 = `1.25`

### 8. 发送坐标到后端

```typescript
const formattedReport = { 
  coords: highlightRecordsRef.current.map(coord => ({
    ...coord,
    session_id: sessionId || undefined,
  }))
};

await fetch('/api/highlight-report', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(formattedReport)
});
```

**后端用途：**
- 保存高亮坐标到数据库
- 用于后续的滚动定位
- 支持跨会话的高亮恢复

---

## 阶段二：滚动定位流程

### 1. 触发时机

```typescript
useEffect(() => {
  if (!scrollToFragment) return;
  const id = window.setTimeout(() => {
    scrollToMatchFragment(scrollToFragment, scaffoldIndex);
  }, 100);
  return () => window.clearTimeout(id);
}, [scrollToFragment, scaffoldIndex, renderedPages]);
```

**触发条件：**
- `scrollToFragment` prop 改变（用户点击 scaffold 卡片）
- 所有页面已渲染完成

### 2. 查找匹配的高亮记录

**策略 1：直接索引匹配（最准确）**

```typescript
if (typeof scaffoldIdx === 'number' && scaffoldIdx >= 0) {
  // 获取唯一的查询列表（按顺序）
  const orderedQueries = [...]; // 从 highlightRecordsRef 中提取唯一 fragments
  
  // 根据索引找到对应的查询
  if (scaffoldIdx < orderedQueries.length) {
    const targetQuery = orderedQueries[scaffoldIdx];
    rec = list.find((r: any) => r.fragment === targetQuery);
  }
}
```

**策略 2：文本相似度匹配（回退）**

```typescript
if (!rec && fragment) {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const target = norm(fragment);
  
  rec = list.find((r: any) => {
    const pdfFrag = norm(r.fragment);
    
    // 多种匹配策略：
    // 1. 直接包含匹配
    if (pdfFrag.includes(target) || target.includes(pdfFrag)) return true;
    
    // 2. 清理后匹配（去除特殊字符）
    const pdfCleaned = pdfFrag.replace(/…/g, '').trim();
    const targetCleaned = target.replace(/…/g, '').trim();
    if (pdfCleaned.includes(targetCleaned)) return true;
    
    // 3. 前 50 字符匹配
    if (pdfFirst50.includes(targetFirst50)) return true;
    
    // 4. 前 100 字符匹配
    if (pdfFirst100.includes(targetFirst100)) return true;
    
    return false;
  });
}
```

### 3. 计算滚动位置

```typescript
// 1. 获取页面元素
const pageEl = pageElements.get(rec.rangePage);

// 2. 计算高亮在页面中的位置
const pageHeight = pageEl.clientHeight;
const highlightTop = (rec.positionStartY - rec.rangePage) * pageHeight;
// positionStartY = 2.5, rangePage = 2
// highlightTop = (2.5 - 2) * pageHeight = 0.5 * pageHeight (页面中间)

// 3. 计算绝对位置（相对于容器）
const absoluteTop = pageEl.offsetTop + highlightTop;

// 4. 计算高亮中心点
const highlightHeight = (rec.positionEndY - rec.positionStartY) * pageHeight;
const highlightCenter = absoluteTop + (highlightHeight / 2);

// 5. 计算滚动目标（使高亮居中）
const containerHeight = containerRef.current.getBoundingClientRect().height;
const scrollTarget = highlightCenter - (containerHeight / 2);

// 6. 执行滚动
containerRef.current.scrollTo({ 
  top: Math.max(0, scrollTarget), 
  behavior: 'smooth' 
});
```

### 4. 激活高亮视觉反馈

**延迟执行（等待滚动完成）：**

```typescript
setTimeout(() => {
  // 1. 查找页面上的所有高亮元素
  const overlayHighlights = overlay.querySelectorAll('.pdf-hit');
  const textHighlights = textLayer.querySelectorAll('mark.pdf-highlight, mark.pdf-highlight-alt');
  
  // 2. 匹配策略
  // 策略 1: 文本匹配（对于 mark 元素）
  if (el.tagName === 'mark') {
    const elText = norm(el.textContent || '');
    if (elText.includes(targetFragment)) {
      matchingHighlights.push(el);
    }
  }
  
  // 策略 2: 坐标匹配（对于 .pdf-hit 元素）
  else {
    const expectedTop = (rec.positionStartY - rec.rangePage) * currentPageHeight;
    const expectedLeft = rec.positionStartX * currentPageWidth;
    const distance = Math.sqrt(Math.pow(elTop - expectedTop, 2) + Math.pow(elLeft - expectedLeft, 2));
    if (distance < 150) { // 距离阈值 150px
      matchingHighlights.push(el);
    }
  }
  
  // 3. 应用激活样式
  matchingHighlights.forEach((el) => highlightSentence(el));
  // 添加 'highlighted' class 和 box-shadow
}, 300);
```

**视觉反馈：**
- 添加 `highlighted` class
- 添加橙色 box-shadow：`0 0 0 3px rgba(246, 162, 5, 0.89)`
- 提高 z-index 到 25

---

## 完整流程图

```
┌─────────────────────────────────────────────────────────────┐
│ 1. PDF 加载完成，所有页面渲染完成                              │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 获取搜索查询 (searchQueries prop)                          │
│    - 从 scaffold fragments 获取                              │
│    - 或从 API 获取（备用）                                     │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 对每个页面执行搜索                                          │
│    ├─ 提取文本节点 (getTextNodesIn)                           │
│    ├─ 构建文本索引 (buildIndex)                               │
│    ├─ 生成灵活正则模式 (patternFromQueryLiteralFlexible)      │
│    └─ 执行正则匹配                                             │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 应用高亮                                                    │
│    ├─ 转换为 DOM Range (indexToDomRange)                     │
│    ├─ 应用 CSS 类 (applier.applyToRange)                     │
│    └─ 记录坐标 (coordsPageEncodedY)                           │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. 如果匹配失败，尝试关键词回退匹配                             │
│    └─ 提取关键词，生成序列模式                                 │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. 发送坐标到后端 (/api/highlight-report)                     │
│    └─ 保存到数据库，用于后续定位                                │
└─────────────────────────────────────────────────────────────┘

                        ║
                        ║ (用户点击 scaffold 卡片)
                        ↓

┌─────────────────────────────────────────────────────────────┐
│ 7. 接收滚动请求 (scrollToFragment prop)                        │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. 查找匹配的高亮记录                                          │
│    ├─ 策略 1: 索引匹配 (scaffoldIndex)                        │
│    └─ 策略 2: 文本相似度匹配                                   │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. 计算滚动位置                                                │
│    ├─ 计算高亮在页面中的位置                                   │
│    ├─ 计算高亮中心点                                           │
│    └─ 计算滚动目标（使高亮居中）                               │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. 执行平滑滚动                                               │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 11. 延迟激活高亮（300ms 后）                                    │
│     ├─ 查找匹配的 DOM 元素                                    │
│     ├─ 文本匹配或坐标匹配                                      │
│     └─ 应用激活样式 (highlightSentence)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 关键技术点

### 1. 文本索引系统

**为什么需要索引？**
- PDF 文本层是分散的 DOM 节点，不是连续字符串
- 需要将字符位置映射回 DOM 节点和偏移量

**索引结构：**
```typescript
{
  text: "Hello world!",  // 连接后的完整文本
  map: [
    { node: Node1, start: 0, end: 6 },   // "Hello "
    { node: Node2, start: 6, end: 11 },  // "world"
    { node: Node3, start: 11, end: 12 }  // "!"
  ]
}
```

### 2. 灵活正则模式

**处理的问题：**
- **空格缺失**：`"A version"` → 匹配 `"aversion"`
- **连字符变化**：支持多种 Unicode 连字符
- **单词合并**：`"After reading"` → 匹配 `"Afterreading"`

**模式示例：**
```
查询: "A version control system"

模式: A(?:|[\s\u00A0]*|\s*[-\u2010...]\s*)version(?:|[\s\u00A0]*|\s*[-\u2010...]\s*)control(?:|[\s\u00A0]*|\s*[-\u2010...]\s*)system
```

### 3. 坐标编码系统

**Y 坐标编码：**
- 格式：`pageNum + fraction`，其中 `fraction ∈ [0, 0.999]`
- 优点：可以同时表示页码和页面内位置
- 示例：
  - 第 1 页，顶部 = `1.0`
  - 第 1 页，中间 = `1.5`
  - 第 2 页，25% = `2.25`

**X 坐标：**
- 归一化到 `[0, 1]`，相对于页面宽度
- 示例：`0.5` = 页面水平中心

### 4. 匹配策略

**搜索阶段：**
1. 完整正则模式匹配
2. 关键词序列匹配（回退）

**定位阶段：**
1. 索引匹配（最准确）
2. 文本相似度匹配（回退）
3. 坐标匹配（对于后端高亮）
4. 索引回退（最后手段）

---

## 性能优化

1. **延迟渲染**：使用 `requestAnimationFrame` 延迟页面渲染
2. **批量处理**：收集所有高亮后再一次性发送到后端
3. **防抖滚动**：使用 `setTimeout` 延迟滚动执行
4. **条件匹配**：只在必要时执行复杂的匹配逻辑

---

## 常见问题

### Q: 为什么高亮不显示？

**可能原因：**
1. PDF 文本层未正确渲染
2. 正则模式不匹配 PDF 文本格式
3. 文本节点提取失败

**调试方法：**
- 查看控制台日志（启用 `debug=true`）
- 检查 `text` 和 `pattern` 的值
- 验证文本层是否存在

### Q: 为什么滚动不准确？

**可能原因：**
1. 坐标计算时页面尺寸已改变
2. 高亮记录未找到匹配
3. 滚动目标计算错误

**解决方案：**
- 使用延迟执行（`setTimeout`）等待 DOM 稳定
- 增加匹配策略的容错性
- 验证坐标编码是否正确

### Q: 为什么某些文本匹配不到？

**可能原因：**
1. PDF 文本提取质量问题（单词合并、空格缺失）
2. 正则模式不够灵活

**解决方案：**
- 使用关键词回退匹配
- 调整 `patternFromQueryLiteralFlexible` 的 GAP 模式
- 增加单字母单词的特殊处理

