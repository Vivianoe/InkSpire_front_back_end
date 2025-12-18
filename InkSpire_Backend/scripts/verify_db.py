#!/usr/bin/env python3
"""
验证数据库连接和表结构
"""
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
    from app.core.database import get_supabase_client
    client = get_supabase_client()
    print("   ✅ Supabase 客户端初始化成功")
except Exception as e:
    print(f"   ❌ Supabase 客户端初始化失败: {e}")
    print("   请检查 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY")

print("\n" + "=" * 50)
print("验证完成！")
print("=" * 50)


