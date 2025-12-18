# 环境变量设置指南

## 方法 1: 使用 .env 文件（最简单，推荐）

### 步骤：

1. **创建 .env 文件**：
   ```bash
   cd InkSpire_Backend
   cp env.example .env
   ```

2. **编辑 .env 文件**，填入你的实际值：
   ```bash
   # 使用任何文本编辑器
   nano .env
   # 或
   vim .env
   # 或
   code .env  # 如果安装了 VS Code
   ```

3. **填写配置**（从 Supabase Dashboard 获取）：
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
   GOOGLE_API_KEY=your_google_api_key
   ```

4. **重启后端服务**：
   ```bash
   # 停止当前服务（Ctrl+C）
   # 重新启动
   uvicorn main:app --reload
   ```

**优点**：简单，不需要每次手动设置  
**注意**：`.env` 文件已经在 `.gitignore` 中，不会被提交到 Git

---

## 方法 2: 在当前终端会话中临时设置

### 一次性设置（只对当前终端窗口有效）：

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
export DATABASE_URL="postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"
export GOOGLE_API_KEY="your_google_api_key"
```

然后运行：
```bash
uvicorn main:app --reload
```

**优点**：快速测试  
**缺点**：关闭终端后失效

---

## 方法 3: 永久设置（添加到 ~/.zshrc）

### 步骤：

1. **编辑 ~/.zshrc 文件**：
   ```bash
   nano ~/.zshrc
   # 或
   vim ~/.zshrc
   ```

2. **在文件末尾添加**：
   ```bash
   # Supabase Configuration
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
   export DATABASE_URL="postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"
   export GOOGLE_API_KEY="your_google_api_key"
   ```

3. **保存并重新加载**：
   ```bash
   source ~/.zshrc
   ```

4. **验证设置**：
   ```bash
   echo $SUPABASE_URL
   ```

**优点**：所有新终端窗口都会自动加载  
**缺点**：影响所有项目（如果不同项目需要不同配置）

---

## 方法 4: 在运行命令时设置（单次运行）

### 直接在命令前设置：

```bash
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="your_key" \
DATABASE_URL="postgresql://..." \
GOOGLE_API_KEY="your_key" \
uvicorn main:app --reload
```

或者写在一行：
```bash
SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." DATABASE_URL="..." uvicorn main:app --reload
```

**优点**：不影响其他环境  
**缺点**：每次都要输入

---

## 方法 5: 使用 direnv（高级，推荐给多项目开发）

### 安装 direnv：
```bash
brew install direnv
```

### 配置：
1. 在 `~/.zshrc` 添加：
   ```bash
   eval "$(direnv hook zsh)"
   ```

2. 在项目目录创建 `.envrc`：
   ```bash
   cd InkSpire_Backend
   echo 'dotenv' > .envrc
   direnv allow
   ```

3. 现在 `.env` 文件会自动加载

**优点**：自动加载，按项目隔离  
**缺点**：需要额外安装工具

---

## 如何获取 Supabase 配置值

### 1. SUPABASE_URL
- 打开 [Supabase Dashboard](https://app.supabase.com)
- 选择你的项目
- Settings → API
- 复制 **Project URL**

### 2. SUPABASE_SERVICE_ROLE_KEY
- Settings → API
- 找到 **service_role** key（⚠️ 保密，不要分享）
- 点击 **Reveal** 显示完整 key
- 复制

### 3. DATABASE_URL
- Settings → Database
- Connection string → URI
- 复制连接字符串
- 格式：`postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
- ⚠️ 记得替换 `[PASSWORD]` 为你的数据库密码

### 4. GOOGLE_API_KEY
- 从 [Google AI Studio](https://makersuite.google.com/app/apikey) 获取
- 或从 Google Cloud Console 创建

---

## 验证环境变量是否设置成功

```bash
# 检查单个变量
echo $SUPABASE_URL

# 检查所有 Supabase 相关变量
env | grep SUPABASE

# 在 Python 中检查
python -c "import os; print(os.getenv('SUPABASE_URL'))"
```

---

## 常见问题

### Q: 设置了环境变量但还是报错？
A: 
1. 确保变量名拼写正确（区分大小写）
2. 确保没有多余的空格或引号
3. 重启后端服务
4. 检查 `.env` 文件是否在正确的目录

### Q: 如何查看当前所有环境变量？
A: 
```bash
env
# 或
printenv
```

### Q: 如何取消设置环境变量？
A: 
```bash
unset SUPABASE_URL
```

### Q: .env 文件不生效？
A: 
1. 确保文件名为 `.env`（不是 `env` 或 `.env.txt`）
2. 确保文件在 `InkSpire_Backend` 目录下
3. 确保安装了 `python-dotenv`：`pip install python-dotenv`
4. 重启服务

---

## 推荐方案

**开发环境**：使用方法 1（.env 文件）  
**生产环境**：使用系统环境变量或容器环境变量  
**多项目开发**：使用方法 5（direnv）


