# 数据库备份指南

## 方法 1: Supabase Dashboard（最简单，推荐）

### 步骤：
1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Settings** → **Database**
4. 滚动到 **Database Backups** 部分
5. 点击 **Download backup** 或 **Create backup**
6. 等待备份完成并下载文件

**优点**：最简单，不需要命令行  
**缺点**：需要等待 Supabase 生成备份

---

## 方法 2: 使用 pg_dump（命令行）

### 前提条件：
- 安装 PostgreSQL 客户端工具
  - macOS: `brew install postgresql`
  - Linux: `apt-get install postgresql-client` 或 `yum install postgresql`
  - Windows: 下载 [PostgreSQL](https://www.postgresql.org/download/)

### 步骤：

1. **获取数据库连接字符串**：
   - 进入 Supabase Dashboard
   - Settings → Database → Connection string
   - 选择 **URI** 格式
   - 复制连接字符串，格式类似：
     ```
     postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres
     ```

2. **运行备份命令**：
   ```bash
   # 替换 [CONNECTION_STRING] 为你的连接字符串
   pg_dump "[CONNECTION_STRING]" \
     --file=backup_$(date +%Y%m%d_%H%M%S).sql \
     --verbose \
     --no-owner \
     --no-acl
   ```

3. **使用提供的脚本**（更简单）：
   ```bash
   cd migrations
   chmod +x backup_database.sh
   ./backup_database.sh my_backup_name
   ```

---

## 方法 3: 导出特定表（SQL Editor）

如果你只想备份 `readings` 和 `reading_chunks` 表：

1. 进入 Supabase Dashboard → **SQL Editor**

2. 运行以下查询并保存结果：

   ```sql
   -- 导出 readings 表结构
   SELECT 
       'CREATE TABLE IF NOT EXISTS readings (' || 
       string_agg(column_definition, ', ') || 
       ');' as create_statement
   FROM (
       SELECT 
           column_name || ' ' || 
           CASE data_type
               WHEN 'uuid' THEN 'UUID'
               WHEN 'text' THEN 'TEXT'
               WHEN 'varchar' THEN 'VARCHAR(' || character_maximum_length || ')'
               WHEN 'timestamp with time zone' THEN 'TIMESTAMPTZ'
               ELSE data_type
           END ||
           CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
           CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END
           as column_definition
       FROM information_schema.columns
       WHERE table_name = 'readings'
       ORDER BY ordinal_position
   ) t;

   -- 导出 readings 表数据
   SELECT * FROM readings;
   ```

3. 复制结果并保存到文件

---

## 方法 4: 使用 Supabase CLI

如果你安装了 Supabase CLI：

```bash
# 安装 Supabase CLI
npm install -g supabase

# 登录
supabase login

# 链接项目
supabase link --project-ref your-project-ref

# 创建备份
supabase db dump -f backup.sql
```

---

## 备份文件命名建议

使用有意义的文件名，包含日期和时间：

```bash
backup_20241215_143022.sql
backup_before_migration_20241215.sql
backup_readings_table_20241215.sql
```

---

## 验证备份

备份完成后，验证备份文件：

```bash
# 检查文件大小（应该 > 0）
ls -lh backup.sql

# 查看备份内容（前几行）
head -20 backup.sql

# 检查是否包含关键表
grep -i "CREATE TABLE.*readings" backup.sql
grep -i "CREATE TABLE.*reading_chunks" backup.sql
```

---

## 恢复备份

如果需要恢复备份：

```bash
# 使用 psql
psql "[CONNECTION_STRING]" < backup.sql

# 或者使用 Supabase SQL Editor
# 直接复制备份文件内容到 SQL Editor 并执行
```

---

## 备份最佳实践

1. **迁移前必须备份**：运行任何迁移前都要备份
2. **定期备份**：建议每天或每周备份一次
3. **保存多个版本**：保留最近几次备份
4. **测试恢复**：定期测试备份是否可以正常恢复
5. **存储位置**：将备份文件保存在安全的地方（不要提交到 Git）

---

## 常见问题

### Q: 备份文件太大怎么办？
A: 可以只备份特定表，或者使用压缩：
```bash
pg_dump "[CONNECTION_STRING]" | gzip > backup.sql.gz
```

### Q: 如何自动备份？
A: 可以设置 cron job 或使用 Supabase 的自动备份功能（在 Dashboard 中启用）

### Q: 备份需要多长时间？
A: 取决于数据库大小，通常几秒到几分钟

### Q: 可以备份到云存储吗？
A: 可以，备份后上传到 S3、Google Drive 等云存储服务


