#!/usr/bin/env python3
"""
初始化云端 Supabase 数据库
运行 supabase_schema.sql 创建所有表
"""
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
try:
    with open(schema_file, "r", encoding="utf-8") as f:
        schema_sql = f.read()
except FileNotFoundError:
    print(f"❌ 找不到文件: {schema_file}")
    exit(1)

print("=" * 50)
print("初始化云端数据库")
print("=" * 50)
print(f"\n数据库: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'N/A'}")
print(f"Schema 文件: {schema_file}\n")

try:
    engine = create_engine(DATABASE_URL)
    print("🔌 连接到数据库...")
    
    with engine.begin() as conn:  # 使用 begin() 自动提交事务
        # 分割 SQL 语句（按分号分割，但保留注释和空行）
        statements = []
        current_statement = []
        
        for line in schema_sql.split('\n'):
            line = line.strip()
            # 跳过空行和注释
            if not line or line.startswith('--'):
                continue
            
            current_statement.append(line)
            
            # 如果行以分号结尾，说明是一个完整的语句
            if line.endswith(';'):
                statement = ' '.join(current_statement)
                if statement.strip() and not statement.strip().startswith('--'):
                    statements.append(statement)
                current_statement = []
        
        # 处理最后一个语句（如果没有分号）
        if current_statement:
            statement = ' '.join(current_statement)
            if statement.strip():
                statements.append(statement)
        
        print(f"📝 找到 {len(statements)} 个 SQL 语句\n")
        
        # 执行每个语句
        success_count = 0
        error_count = 0
        
        for i, statement in enumerate(statements, 1):
            try:
                # 跳过空语句
                if not statement.strip() or statement.strip() == ';':
                    continue
                    
                conn.execute(text(statement))
                success_count += 1
                if i % 10 == 0:  # 每10个语句显示一次进度
                    print(f"   执行中... ({i}/{len(statements)})")
            except Exception as e:
                error_count += 1
                # 只显示前几个错误，避免输出太多
                if error_count <= 5:
                    print(f"   ⚠️  语句 {i} 警告: {str(e)[:100]}")
        
        print(f"\n✅ 执行完成: {success_count} 成功, {error_count} 警告/错误")
        
        # 验证表
        print("\n📊 验证创建的表:")
        result = conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """))
        tables = [row[0] for row in result]
        
        if tables:
            print(f"   创建了 {len(tables)} 个表:")
            for table in tables:
                print(f"     ✅ {table}")
        else:
            print("   ⚠️  没有检测到表，可能已经存在或创建失败")
        
        required_tables = [
            "users", "courses", "readings", "reading_chunks",
            "class_profiles", "sessions", "session_readings"
        ]
        missing = [t for t in required_tables if t not in tables]
        if missing:
            print(f"\n   ⚠️  缺少表: {', '.join(missing)}")
            print("   建议：在 Supabase Dashboard → SQL Editor 手动运行 supabase_schema.sql")
        else:
            print(f"\n   ✅ 所有必需的表都已创建！")
            
except Exception as e:
    print(f"\n❌ 初始化失败: {e}")
    print("\n💡 建议：")
    print("   1. 检查数据库连接是否正常")
    print("   2. 在 Supabase Dashboard → SQL Editor 手动运行 supabase_schema.sql")
    exit(1)

print("\n" + "=" * 50)
print("初始化完成！")
print("=" * 50)


