#!/usr/bin/env python3
"""
运行 scaffold_annotations 表的迁移脚本
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
migration_file = Path(__file__).parent / "create_scaffold_annotations_tables.sql"
try:
    with open(migration_file, "r", encoding="utf-8") as f:
        migration_sql = f.read()
except FileNotFoundError:
    print(f"❌ 找不到迁移文件: {migration_file}")
    sys.exit(1)

print("=" * 60)
print("创建 scaffold 相关表")
print("=" * 60)
print(f"\n数据库: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'N/A'}")
print(f"迁移文件: {migration_file}\n")

try:
    engine = create_engine(DATABASE_URL)
    print("🔌 连接到数据库...")
    
    with engine.begin() as conn:
        # 检查表是否已存在
        check_table = text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'scaffold_annotations'
            );
        """)
        table_exists = conn.execute(check_table).scalar()
        
        if table_exists:
            print("⚠️  scaffold_annotations 表已存在")
            response = input("是否继续执行迁移？(y/N): ").strip().lower()
            if response != 'y':
                print("❌ 迁移已取消")
                sys.exit(0)
        
        print("📝 执行迁移 SQL...\n")
        
        # 执行迁移 SQL
        conn.execute(text(migration_sql))
        
        print("✅ 迁移执行成功！\n")
        
        # 验证表是否创建成功
        print("📊 验证创建的表:")
        result = conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND table_name IN ('scaffold_annotations', 'scaffold_annotation_versions', 'annotation_highlight_coords')
            ORDER BY table_name;
        """))
        tables = [row[0] for row in result]
        
        if 'scaffold_annotations' in tables:
            print("   ✅ scaffold_annotations")
        else:
            print("   ❌ scaffold_annotations (未找到)")
            
        if 'scaffold_annotation_versions' in tables:
            print("   ✅ scaffold_annotation_versions")
        else:
            print("   ❌ scaffold_annotation_versions (未找到)")
            
        if 'annotation_highlight_coords' in tables:
            print("   ✅ annotation_highlight_coords")
        else:
            print("   ❌ annotation_highlight_coords (未找到)")
            
except Exception as e:
    print(f"\n❌ 迁移失败: {e}")
    print("\n💡 建议：")
    print("   1. 检查数据库连接是否正常")
    print("   2. 在 Supabase Dashboard → SQL Editor 手动运行 create_scaffold_annotations_tables.sql")
    sys.exit(1)

print("\n" + "=" * 60)
print("迁移完成！")
print("=" * 60)

