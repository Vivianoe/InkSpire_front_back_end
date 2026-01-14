#!/usr/bin/env python3
"""\
Fix session_readings and readings tables for structural session-reading model.

Adds:
- readings.deleted_at (TIMESTAMPTZ)
- session_readings.perusall_assignment_id (UUID FK to perusall_assignments)
- session_readings.perusall_document_id (TEXT)
- session_readings.assigned_pages (JSONB)
- session_readings.position (INT)
- session_readings.is_active (BOOL)

NOTE: This uses ALTER TABLE and may require manual cleanup if your existing schema differs.
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
print("修复 readings / session_readings 表")
print("=" * 50)

try:
    engine = create_engine(DATABASE_URL)
    print("🔌 连接到数据库...")

    with engine.begin() as conn:
        # readings
        readings_cols = conn.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'readings'
                ORDER BY ordinal_position;
                """
            )
        ).fetchall()
        readings_cols = {r[0] for r in readings_cols}

        if "deleted_at" not in readings_cols:
            print("➕ readings.deleted_at")
            conn.execute(text("ALTER TABLE readings ADD COLUMN deleted_at TIMESTAMPTZ;"))

        # session_readings
        sr_cols = conn.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'session_readings'
                ORDER BY ordinal_position;
                """
            )
        ).fetchall()
        sr_cols = {r[0] for r in sr_cols}

        if "perusall_assignment_id" not in sr_cols:
            print("➕ session_readings.perusall_assignment_id")
            conn.execute(text("ALTER TABLE session_readings ADD COLUMN perusall_assignment_id UUID;"))
        if "perusall_document_id" not in sr_cols:
            print("➕ session_readings.perusall_document_id")
            conn.execute(text("ALTER TABLE session_readings ADD COLUMN perusall_document_id TEXT;"))
        if "assigned_pages" not in sr_cols:
            print("➕ session_readings.assigned_pages")
            conn.execute(text("ALTER TABLE session_readings ADD COLUMN assigned_pages JSONB;"))
        if "position" not in sr_cols:
            print("➕ session_readings.position")
            conn.execute(text("ALTER TABLE session_readings ADD COLUMN position INTEGER;"))
        if "is_active" not in sr_cols:
            print("➕ session_readings.is_active")
            conn.execute(text("ALTER TABLE session_readings ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;"))

        # Backfill position from order_index if present
        if "position" in sr_cols and "order_index" in sr_cols:
            print("↪ backfill session_readings.position from order_index")
            conn.execute(text("UPDATE session_readings SET position = COALESCE(position, order_index, 0);"))

        # Constraints (best-effort)
        print("📇 Creating indexes/constraints (best-effort)")
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_session_readings_session_id ON session_readings(session_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_session_readings_reading_id ON session_readings(reading_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_session_readings_assignment_id ON session_readings(perusall_assignment_id);"))

        # FK (cannot use IF NOT EXISTS portably; wrap in DO block)
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_readings_perusall_assignment_id'
                    ) THEN
                        ALTER TABLE session_readings
                        ADD CONSTRAINT fk_session_readings_perusall_assignment_id
                        FOREIGN KEY (perusall_assignment_id)
                        REFERENCES perusall_assignments(id);
                    END IF;
                END$$;
                """
            )
        )

        print("✅ 修复完成")

except Exception as e:
    print(f"❌ 修复失败: {e}")
    raise

print("=" * 50)
