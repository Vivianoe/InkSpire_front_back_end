#!/usr/bin/env python3
"""\
Add missing columns to sessions table.

Currently used to add:
- perusall_assignment_info (JSONB)

This script is intended for Supabase/Postgres.
"""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("❌ DATABASE_URL 未设置")
    raise SystemExit(1)

print("=" * 50)
print("修复 sessions 表")
print("=" * 50)

try:
    engine = create_engine(DATABASE_URL)
    print("🔌 连接到数据库...")

    with engine.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'sessions'
                ORDER BY ordinal_position;
                """
            )
        )
        existing_columns = {row[0]: row[1] for row in result}
        print(f"\n现有列: {', '.join(existing_columns.keys())}")

        changes = []

        if "perusall_assignment_info" not in existing_columns:
            print("\n➕ 添加 perusall_assignment_info 列...")
            conn.execute(
                text(
                    """
                    ALTER TABLE sessions
                    ADD COLUMN perusall_assignment_info JSONB;
                    """
                )
            )
            changes.append("perusall_assignment_info")

        print("\n✅ 修复完成！")
        if changes:
            print(f"更改: {', '.join(changes)}")
        else:
            print("无需更改，表结构已正确")

except Exception as e:
    print(f"\n❌ 修复失败: {e}")
    raise

print("\n" + "=" * 50)
