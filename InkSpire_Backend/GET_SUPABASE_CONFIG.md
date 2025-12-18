# 获取 Supabase 配置信息

你的项目 URL 已设置：`https://jrcstgmtxnavrkbdcdig.supabase.co`

## 还需要获取以下配置：

### 1. SUPABASE_SERVICE_ROLE_KEY（必需，用于文件上传）

**步骤：**
1. 打开 [Supabase Dashboard](https://app.supabase.com)
2. 选择项目：`jrcstgmtxnavrkbdcdig`
3. 进入 **Settings** → **API**
4. 找到 **Project API keys** 部分
5. 找到 **service_role** key（⚠️ 这是敏感密钥，不要分享）
6. 点击 **Reveal** 显示完整 key
7. 复制整个 key（以 `eyJ...` 开头）

**更新 .env 文件：**
```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### 2. DATABASE_URL（必需，用于数据库连接）

**步骤：**
1. 在 Supabase Dashboard 中
2. 进入 **Settings** → **Database**
3. 找到 **Connection string** 部分
4. 选择 **URI** 标签
5. 复制连接字符串
6. ⚠️ **重要**：将 `[YOUR-PASSWORD]` 替换为你的实际数据库密码

**格式示例：**
```
postgresql://postgres:[YOUR_PASSWORD]@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
```

**更新 .env 文件：**
```env
DATABASE_URL=postgresql://postgres:你的实际密码@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres
```

**如果忘记数据库密码：**
- Settings → Database → Database password
- 点击 **Reset database password**
- 设置新密码并更新 DATABASE_URL

---

### 3. SUPABASE_KEY（可选，用于认证操作）

**步骤：**
1. Settings → API
2. 找到 **anon** 或 **public** key
3. 复制（如果 service_role key 已设置，这个可选）

**更新 .env 文件：**
```env
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 快速检查清单

完成配置后，你的 `.env` 文件应该包含：

- ✅ `SUPABASE_URL=https://jrcstgmtxnavrkbdcdig.supabase.co`
- ✅ `SUPABASE_SERVICE_ROLE_KEY=eyJ...` （必需）
- ✅ `DATABASE_URL=postgresql://postgres:密码@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres` （必需）
- ✅ `GOOGLE_API_KEY=...` （已有）

---

## 验证配置

配置完成后，测试连接：

```bash
cd InkSpire_Backend
python -c "
import os
from dotenv import load_dotenv
load_dotenv()
print('SUPABASE_URL:', os.getenv('SUPABASE_URL'))
print('DATABASE_URL:', '已设置' if os.getenv('DATABASE_URL') else '未设置')
print('SERVICE_ROLE_KEY:', '已设置' if os.getenv('SUPABASE_SERVICE_ROLE_KEY') else '未设置')
"
```

然后重启后端服务：
```bash
uvicorn main:app --reload
```

---

## 安全提示

⚠️ **重要**：
- `.env` 文件已在 `.gitignore` 中，不会被提交到 Git
- **不要**在代码中硬编码这些密钥
- **不要**在公开场合分享 `service_role` key
- 如果密钥泄露，立即在 Supabase Dashboard 中重置


