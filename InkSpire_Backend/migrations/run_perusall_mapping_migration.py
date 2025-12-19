#!/usr/bin/env python3
"""
运行 perusall_mappings 表的迁移脚本
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# 加载环境变量
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("❌ DATABASE_URL 未设置")
    print("请在 .env 文件中设置 DATABASE_URL")
    sys.exit(1)

# 读取迁移脚本
migration_file = Path(__file__).parent / "create_perusall_mapping_table.sql"
try:
    with open(migration_file, "r", encoding="utf-8") as f:
        migration_sql = f.read()
except FileNotFoundError:
    print(f"❌ 找不到迁移文件: {migration_file}")
    sys.exit(1)

print("=" * 60)
print("创建 perusall_mappings 表")
print("=" * 60)
print(f"\n数据库: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'N/A'}")
print(f"迁移文件: {migration_file}\n")

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        # 执行迁移
        conn.execute(text(migration_sql))
        conn.commit()
        print("✅ 迁移成功！")
        
        # 验证表是否创建成功
        result = conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'perusall_mappings';
        """))
        if result.fetchone():
            print("✅ 验证成功：perusall_mappings 表已创建")
        else:
            print("⚠️  警告：表可能未创建成功，请检查数据库")
            
except Exception as e:
    print(f"❌ 迁移失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

