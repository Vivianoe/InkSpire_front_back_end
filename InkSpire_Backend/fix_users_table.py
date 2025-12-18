#!/usr/bin/env python3
"""
修复 users 表，添加缺失的列
"""
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("❌ DATABASE_URL 未设置")
    exit(1)

print("=" * 50)
print("修复 users 表")
print("=" * 50)

try:
    engine = create_engine(DATABASE_URL)
    print("🔌 连接到数据库...")
    
    with engine.begin() as conn:
        # 检查现有列
        result = conn.execute(text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position;
        """))
        existing_columns = {row[0]: row[1] for row in result}
        print(f"\n现有列: {', '.join(existing_columns.keys())}")
        
        # 添加缺失的列
        changes = []
        
        if 'supabase_user_id' not in existing_columns:
            print("\n➕ 添加 supabase_user_id 列...")
            conn.execute(text("""
                ALTER TABLE users 
                ADD COLUMN supabase_user_id UUID;
            """))
            changes.append("supabase_user_id")
        
        if 'updated_at' not in existing_columns:
            print("➕ 添加 updated_at 列...")
            conn.execute(text("""
                ALTER TABLE users 
                ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
            """))
            changes.append("updated_at")
        
        # 删除不需要的列（如果存在）
        if 'password_hash' in existing_columns:
            print("\n⚠️  检测到 password_hash 列（已废弃，使用 Supabase Auth）")
            response = input("是否删除 password_hash 列？(y/N): ").strip().lower()
            if response == 'y':
                conn.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS password_hash;"))
                changes.append("删除 password_hash")
        
        # 创建索引
        print("\n📇 创建索引...")
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id 
            ON users(supabase_user_id);
        """))
        
        # 验证
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position;
        """))
        final_columns = [row[0] for row in result]
        
        print(f"\n✅ 修复完成！")
        print(f"最终列: {', '.join(final_columns)}")
        
        if changes:
            print(f"\n更改: {', '.join(changes)}")
        else:
            print("\n无需更改，表结构已正确")
            
except Exception as e:
    print(f"\n❌ 修复失败: {e}")
    exit(1)

print("\n" + "=" * 50)


