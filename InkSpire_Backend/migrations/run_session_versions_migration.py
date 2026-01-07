#!/usr/bin/env python3
"""
运行 session_versions 表的迁移脚本
添加 current_version_id 列到 sessions 表
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
migration_file = Path(__file__).parent / "migrate_to_session_versions.sql"
try:
    with open(migration_file, "r", encoding="utf-8") as f:
        migration_sql = f.read()
except FileNotFoundError:
    print(f"❌ 找不到迁移文件: {migration_file}")
    sys.exit(1)

print("=" * 60)
print("迁移到 session_versions 结构")
print("=" * 60)
print(f"\n数据库: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'N/A'}")
print(f"迁移文件: {migration_file}\n")

try:
    engine = create_engine(DATABASE_URL)
    print("🔌 连接到数据库...")
    
    with engine.begin() as conn:
        # 检查 current_version_id 列是否已存在
        check_column = text("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'sessions'
                AND column_name = 'current_version_id'
            );
        """)
        column_exists = conn.execute(check_column).scalar()
        
        if column_exists:
            print("⚠️  current_version_id 列已存在")
            response = input("是否继续执行迁移？(y/N): ").strip().lower()
            if response != 'y':
                print("❌ 迁移已取消")
                sys.exit(0)
        
        print("📝 执行迁移 SQL...\n")
        
        # 执行迁移 SQL
        conn.execute(text(migration_sql))
        
        print("✅ 迁移执行成功！\n")
        
        # 验证迁移结果
        print("📊 验证迁移结果:")
        
        # 检查 session_versions 表
        check_table = text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'session_versions'
            );
        """)
        table_exists = conn.execute(check_table).scalar()
        if table_exists:
            print("   ✅ session_versions 表已创建")
        else:
            print("   ❌ session_versions 表未找到")
        
        # 检查 current_version_id 列
        column_exists_after = conn.execute(check_column).scalar()
        if column_exists_after:
            print("   ✅ sessions.current_version_id 列已添加")
        else:
            print("   ❌ sessions.current_version_id 列未找到")
        
        # 检查 status 列
        check_status = text("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'sessions'
                AND column_name = 'status'
            );
        """)
        status_exists = conn.execute(check_status).scalar()
        if status_exists:
            print("   ✅ sessions.status 列已添加")
        else:
            print("   ❌ sessions.status 列未找到")
            
except Exception as e:
    print(f"\n❌ 迁移失败: {e}")
    import traceback
    traceback.print_exc()
    print("\n💡 建议：")
    print("   1. 检查数据库连接是否正常")
    print("   2. 在 Supabase Dashboard → SQL Editor 手动运行 migrate_to_session_versions.sql")
    sys.exit(1)

print("\n" + "=" * 60)
print("迁移完成！")
print("=" * 60)
print("\n💡 提示：迁移完成后，请重启后端服务。")

