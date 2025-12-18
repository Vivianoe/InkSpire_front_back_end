# Database Migrations

This directory contains SQL migration scripts for database schema changes.

## Migration Files

### 1. `add_reading_chunks.sql` (DEPRECATED)
- **Status**: Deprecated - replaced by `migrate_to_reading_chunks_table.sql`
- **Purpose**: Originally added `reading_chunks` JSONB column to `readings` table
- **Note**: This migration is no longer needed as we've moved to a separate table

### 2. `split_reading_chunks.sql` (DEPRECATED)
- **Status**: Deprecated - replaced by `migrate_to_reading_chunks_table.sql`
- **Purpose**: Initial attempt to split reading_chunks into separate table
- **Note**: Use `migrate_to_reading_chunks_table.sql` instead

### 3. `migrate_to_reading_chunks_table.sql` (CURRENT)
- **Status**: Active - Use this for all new deployments
- **Purpose**: Creates `reading_chunks` table and migrates data from `readings.reading_chunks` JSONB column
- **Features**:
  - Idempotent (safe to run multiple times)
  - Automatically detects if old column exists
  - Migrates existing data if present
  - Includes verification steps

### 4. `create_scaffold_annotations_tables.sql` (CURRENT)
- **Status**: Active - Required for scaffold generation functionality
- **Purpose**: Creates `scaffold_annotations` and `scaffold_annotation_versions` tables
- **Features**:
  - Idempotent (safe to run multiple times)
  - Creates indexes for performance
  - Sets up triggers for automatic `updated_at` updates
- **How to run**:
  ```bash
  # Option 1: Use Python script (recommended)
  cd InkSpire_Backend
  python3 migrations/run_scaffold_annotations_migration.py
  
  # Option 2: Run SQL directly in Supabase Dashboard
  # Copy and paste the contents of create_scaffold_annotations_tables.sql
  # into Supabase Dashboard → SQL Editor → Run
  ```

## How to Backup Database

### Method 1: Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Database**
3. Scroll down to **Database Backups** section
4. Click **Download backup** or **Create backup**
5. Wait for the backup to complete and download the file

### Method 2: pg_dump (Command Line)
If you have `pg_dump` installed and database connection string:

```bash
# Get connection string from Supabase Dashboard:
# Settings → Database → Connection string → URI
# Format: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

pg_dump "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  --file=backup_$(date +%Y%m%d_%H%M%S).sql \
  --verbose
```

### Method 3: Export Specific Tables
If you only want to backup specific tables:

```sql
-- In Supabase SQL Editor, export readings and reading_chunks tables
-- This creates a SQL script you can save

-- Export readings table
COPY (
  SELECT * FROM readings
) TO STDOUT WITH CSV HEADER;

-- Export reading_chunks table  
COPY (
  SELECT * FROM reading_chunks
) TO STDOUT WITH CSV HEADER;
```

### Method 4: Manual SQL Export
1. Go to Supabase Dashboard → **SQL Editor**
2. Run this query to export all readings data:
   ```sql
   SELECT * FROM readings;
   ```
3. Copy the results and save to a file
4. Repeat for `reading_chunks` table if it exists

## How to Run Migrations

### For New Databases
If you're setting up a fresh database, the `supabase_schema.sql` file already includes the `reading_chunks` table definition. You don't need to run migrations.

### For Existing Databases

1. **Backup your database first!** (See backup methods above)

2. **Run the migration**:
   ```sql
   -- Copy and paste the contents of migrate_to_reading_chunks_table.sql
   -- into Supabase SQL Editor and execute
   ```

3. **Verify the migration**:
   ```sql
   -- Check that chunks were migrated
   SELECT 
       (SELECT COUNT(*) FROM readings WHERE reading_chunks IS NOT NULL) as readings_with_chunks,
       (SELECT COUNT(*) FROM reading_chunks) as total_chunks;
   
   -- Compare chunk counts
   SELECT 
       r.id,
       r.title,
       jsonb_array_length(r.reading_chunks) as old_chunk_count,
       COUNT(rc.id) as new_chunk_count
   FROM readings r
   LEFT JOIN reading_chunks rc ON r.id = rc.reading_id
   WHERE r.reading_chunks IS NOT NULL
   GROUP BY r.id, r.title, r.reading_chunks;
   ```

4. **Remove old column** (after verification):
   ```sql
   -- Only run this after verifying migration was successful!
   ALTER TABLE readings DROP COLUMN IF EXISTS reading_chunks;
   ```

## Migration History

- **2024-XX-XX**: Created `reading_chunks` table to replace JSONB column in `readings` table
  - Reason: Better query performance, easier to manage individual chunks
  - Impact: All existing chunks need to be migrated to new table

## Rollback

If you need to rollback this migration:

1. **Restore from backup** (recommended)

2. **Or manually rollback**:
   ```sql
   -- Re-add column
   ALTER TABLE readings ADD COLUMN reading_chunks JSONB;
   
   -- Migrate data back (if needed)
   -- This would require custom script to aggregate chunks back to JSONB
   ```

## Notes

- All migrations are designed to be **idempotent** (safe to run multiple times)
- Always **backup** before running migrations
- **Test** migrations on a development database first
- The `reading_chunks` table uses `ON DELETE CASCADE` - deleting a reading will automatically delete its chunks

