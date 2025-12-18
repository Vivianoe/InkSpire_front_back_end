# DATABASE_URL 格式示例

## 正确的格式

### 基本格式
```
postgresql://[用户名]:[密码]@[主机]:[端口]/[数据库名]
```

### 你的项目示例

#### 示例 1: 简单密码（推荐）
```env
DATABASE_URL=postgresql://postgres:mypassword123@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
```

#### 示例 2: 密码包含特殊字符（需要 URL 编码）

**原始密码**: `my@pass#word$123`

**URL 编码后**:
```env
DATABASE_URL=postgresql://postgres:my%40pass%23word%24123@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
```

**特殊字符编码对照表**:
- `@` → `%40`
- `#` → `%23`
- `$` → `%24`
- `&` → `%26`
- `'` → `%27`
- `[` → `%5B`
- `]` → `%5D`
- ` ` (空格) → `%20`
- `%` → `%25`

#### 示例 3: 从 Supabase Dashboard 复制的格式
```env
DATABASE_URL=postgresql://postgres.jrcstgmtxnavrkbdcdig:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

或者直接连接：
```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
```

---

## 完整的 .env 文件示例

```env
# Cloud Supabase Configuration
SUPABASE_URL=https://jrcstgmtxnavrkbdcdig.supabase.co

# Database Configuration
# 格式: postgresql://postgres:密码@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
# 如果密码是: mypassword123
DATABASE_URL=postgresql://postgres:mypassword123@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres

# 如果密码是: pass@word#123 (包含特殊字符)
# DATABASE_URL=postgresql://postgres:pass%40word%23123@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres

# Supabase API Keys
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyY3N0Z210eG5hdnJrYmRjZGlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY5OTk5OTk5OSwiZXhwIjoyMDAwMDAwMDB9.example_signature

# Google Gemini API
GOOGLE_API_KEY=AIzaSyCf_JkOK6IF1pI5AXc6XypTxylzqXkEyIg
```

---

## 如何获取正确的 DATABASE_URL

### 方法 1: 从 Supabase Dashboard 复制（最简单）

1. 打开 [Supabase Dashboard](https://app.supabase.com)
2. 选择项目：`jrcstgmtxnavrkbdcdig`
3. 进入 **Settings** → **Database**
4. 找到 **Connection string** 部分
5. 选择 **URI** 标签
6. 你会看到类似这样的格式：
   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
   或
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
7. 复制这个字符串
8. 将 `[YOUR-PASSWORD]` 替换为你的实际数据库密码
9. 粘贴到 `.env` 文件

### 方法 2: 手动构建

如果你知道密码，可以手动构建：

```bash
# 格式
postgresql://postgres:你的密码@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres

# 例子（假设密码是 "mypass123"）
postgresql://postgres:mypass123@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
```

---

## 密码包含特殊字符的处理

### 示例：密码是 `abc@123#def`

**错误写法** ❌:
```env
DATABASE_URL=postgresql://postgres:abc@123#def@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
```
这会被解析错误，因为 `@` 和 `#` 是 URL 的特殊字符。

**正确写法** ✅:
```env
DATABASE_URL=postgresql://postgres:abc%40123%23def@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
```

### 快速编码工具

使用 Python 快速编码密码：
```python
from urllib.parse import quote

password = "abc@123#def"
encoded = quote(password, safe='')
print(f"原始密码: {password}")
print(f"编码后: {encoded}")
# 输出: abc%40123%23def
```

或者在线工具：https://www.urlencoder.org/

---

## 验证 DATABASE_URL 格式

运行检查脚本：
```bash
cd InkSpire_Backend
python3 check_env.py
```

如果格式正确，应该看到：
```
✅ 已设置
协议: postgresql
主机: db.jrcstgmtxnavrkbdcdig.supabase.co
端口: 5432
数据库: postgres
密码: ******** (已设置)
```

---

## 常见错误示例

### ❌ 错误 1: 密码未替换
```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
```
**问题**: `[YOUR-PASSWORD]` 是占位符，需要替换为实际密码

### ❌ 错误 2: 特殊字符未编码
```env
DATABASE_URL=postgresql://postgres:pass@word@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
```
**问题**: `@` 应该编码为 `%40`

### ❌ 错误 3: 缺少协议
```env
DATABASE_URL=postgres:password@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
```
**问题**: 缺少 `postgresql://` 协议前缀

### ✅ 正确示例
```env
DATABASE_URL=postgresql://postgres:simplepassword123@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
```

---

## 推荐做法

1. **使用简单密码**：只包含字母和数字，避免特殊字符
2. **从 Dashboard 复制**：最不容易出错
3. **重置密码**：如果当前密码太复杂，可以在 Supabase Dashboard 重置


