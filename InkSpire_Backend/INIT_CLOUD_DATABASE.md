# 初始化云端 Supabase 数据库

## 步骤 1: 验证数据库连接

### 方法 1: 使用 Python 脚本测试

创建测试脚本 `test_connection.py`：

```python
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("❌ DATABASE_URL 未设置")
    exit(1)

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT version();"))
        version = result.fetchone()[0]
        print("✅ 数据库连接成功！")
        print(f"PostgreSQL 版本: {version}")
        
        # 检查现有表
        result = conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """))
        tables = [row[0] for row in result]
        print(f"\n现有表数量: {len(tables)}")
        if tables:
            print("现有表:", ", ".join(tables))
        else:
            print("⚠️  数据库是空的，需要初始化")
except Exception as e:
    print(f"❌ 连接失败: {e}")
```

运行测试：
```bash
cd InkSpire_Backend
python test_connection.py
```

### 方法 2: 使用 psql 命令行

```bash
# 从 .env 获取 DATABASE_URL，然后连接
psql "postgresql://postgres:密码@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres"

# 连接后运行：
\dt  # 查看所有表
SELECT version();  # 查看版本
```

---

## 步骤 2: 创建数据库表

### 方法 1: 使用 Supabase Dashboard（推荐，最简单）

1. **打开 Supabase Dashboard**
   - 访问：https://app.supabase.com
   - 选择项目：`jrcstgmtxnavrkbdcdig`

2. **进入 SQL Editor**
   - 点击左侧菜单 **SQL Editor**
   - 点击 **New query**

3. **运行 Schema SQL**
   - 打开 `supabase_schema.sql` 文件
   - 复制全部内容
   - 粘贴到 SQL Editor
   - 点击 **Run** 或按 `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows)

4. **验证表已创建**
   - 在 SQL Editor 运行：
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```
   - 应该看到所有表：`users`, `courses`, `readings`, `reading_chunks`, 等

### 方法 2: 使用 Python 脚本自动创建

创建 `init_cloud_db.py`：

```python
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("❌ DATABASE_URL 未设置")
    exit(1)

# 读取 schema 文件
schema_file = "supabase_schema.sql"
with open(schema_file, "r", encoding="utf-8") as f:
    schema_sql = f.read()

try:
    engine = create_engine(DATABASE_URL)
    print("🔌 连接到数据库...")
    
    with engine.connect() as conn:
        # 执行 schema SQL
        # 注意：需要按语句分割执行（因为可能包含多个语句）
        statements = schema_sql.split(";")
        for i, statement in enumerate(statements, 1):
            statement = statement.strip()
            if statement and not statement.startswith("--"):
                try:
                    conn.execute(text(statement))
                    conn.commit()
                    print(f"✅ 执行语句 {i}/{len(statements)}")
                except Exception as e:
                    print(f"⚠️  语句 {i} 执行警告: {e}")
        
        print("\n✅ 数据库初始化完成！")
        
        # 验证表
        result = conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """))
        tables = [row[0] for row in result]
        print(f"\n创建的表 ({len(tables)} 个):")
        for table in tables:
            print(f"  - {table}")
            
except Exception as e:
    print(f"❌ 初始化失败: {e}")
```

运行：
```bash
cd InkSpire_Backend
python init_cloud_db.py
```

### 方法 3: 使用 psql 命令行

```bash
# 从文件执行 SQL
psql "postgresql://postgres:密码@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres" \
  -f supabase_schema.sql
```

---

## 步骤 3: 验证连接和表

### 快速验证脚本

创建 `verify_db.py`：

```python
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
SUPABASE_URL = os.getenv("SUPABASE_URL")

print("=" * 50)
print("数据库连接验证")
print("=" * 50)

# 1. 检查环境变量
print("\n1. 环境变量检查:")
print(f"   SUPABASE_URL: {SUPABASE_URL or '❌ 未设置'}")
print(f"   DATABASE_URL: {'✅ 已设置' if DATABASE_URL else '❌ 未设置'}")

if not DATABASE_URL:
    print("\n❌ 请先设置 DATABASE_URL")
    exit(1)

# 2. 测试数据库连接
print("\n2. 数据库连接测试:")
try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT version();"))
        version = result.fetchone()[0]
        print(f"   ✅ 连接成功")
        print(f"   PostgreSQL: {version.split(',')[0]}")
except Exception as e:
    print(f"   ❌ 连接失败: {e}")
    exit(1)

# 3. 检查表
print("\n3. 数据库表检查:")
try:
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """))
        tables = [row[0] for row in result]
        
        required_tables = [
            "users", "courses", "readings", "reading_chunks",
            "class_profiles", "sessions", "session_readings"
        ]
        
        print(f"   现有表数量: {len(tables)}")
        if tables:
            print(f"   表列表: {', '.join(tables)}")
        
        missing = [t for t in required_tables if t not in tables]
        if missing:
            print(f"\n   ⚠️  缺少必需的表: {', '.join(missing)}")
            print("   请运行 supabase_schema.sql 初始化数据库")
        else:
            print(f"\n   ✅ 所有必需的表都已存在")
            
except Exception as e:
    print(f"   ❌ 检查失败: {e}")

# 4. 检查 Supabase 客户端
print("\n4. Supabase 客户端检查:")
try:
    from database import get_supabase_client
    client = get_supabase_client()
    print("   ✅ Supabase 客户端初始化成功")
except Exception as e:
    print(f"   ❌ Supabase 客户端初始化失败: {e}")
    print("   请检查 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY")

print("\n" + "=" * 50)
print("验证完成！")
print("=" * 50)
```

运行：
```bash
cd InkSpire_Backend
python verify_db.py
```

---

## 推荐流程

1. **先验证连接**：
   ```bash
   python verify_db.py
   ```

2. **如果数据库是空的，初始化**：
   - 方法 A（推荐）：在 Supabase Dashboard → SQL Editor 运行 `supabase_schema.sql`
   - 方法 B：运行 `python init_cloud_db.py`

3. **再次验证**：
   ```bash
   python verify_db.py
   ```

4. **启动后端**：
   ```bash
   uvicorn main:app --reload
   ```

---

## 常见问题

### Q: 连接失败，提示密码错误？
A: 检查 DATABASE_URL 中的密码是否正确，或在 Supabase Dashboard → Settings → Database → Reset database password

### Q: 表创建失败？
A: 
- 检查 SQL 语法错误
- 确保有足够的权限
- 在 Supabase Dashboard 的 SQL Editor 中查看详细错误信息

### Q: 如何查看数据库内容？
A: 在 Supabase Dashboard → Table Editor 可以查看和编辑数据


