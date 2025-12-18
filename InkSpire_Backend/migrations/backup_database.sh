#!/bin/bash
# Database Backup Script for Supabase
# Usage: ./backup_database.sh [backup_name]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME=${1:-"backup_${TIMESTAMP}"}
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.sql"

# Check if pg_dump is installed
if ! command -v pg_dump &> /dev/null; then
    echo -e "${RED}Error: pg_dump is not installed${NC}"
    echo "Install it with: brew install postgresql (macOS) or apt-get install postgresql-client (Linux)"
    exit 1
fi

# Get database connection string
echo -e "${YELLOW}Enter your Supabase database connection string:${NC}"
echo "You can find it in: Supabase Dashboard → Settings → Database → Connection string → URI"
echo "Format: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
read -p "Connection string: " DB_URL

if [ -z "$DB_URL" ]; then
    echo -e "${RED}Error: Database connection string is required${NC}"
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo -e "${YELLOW}Creating backup...${NC}"
echo "Backup file: $BACKUP_FILE"

# Create backup
pg_dump "$DB_URL" \
    --file="$BACKUP_FILE" \
    --verbose \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists

if [ $? -eq 0 ]; then
    # Get file size
    FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✓ Backup created successfully!${NC}"
    echo "  File: $BACKUP_FILE"
    echo "  Size: $FILE_SIZE"
    echo ""
    echo "To restore this backup, run:"
    echo "  psql \"\$DB_URL\" < $BACKUP_FILE"
else
    echo -e "${RED}✗ Backup failed!${NC}"
    exit 1
fi


