"""
Database migration: Add default_currency field to users table.

This migration adds a default_currency column to the users table,
allowing users to set their preferred currency for Dashboard display.

Usage:
    python migrations/add_user_default_currency.py [--dry-run] [--db-path <path>]
"""

import os
import sqlite3
import sys
from pathlib import Path

# Default to the database file in the backend directory
DEFAULT_DB_PATH = Path(__file__).parent.parent / "db.sqlite3"


def check_column_exists(cursor, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    return column_name in columns


def run_migration(db_path: str, dry_run: bool = False) -> None:
    """
    Run the migration to add default_currency to users table.
    
    Args:
        db_path: Path to the SQLite database file
        dry_run: If True, only show what would be done without executing
    """
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        sys.exit(1)
    
    print(f"📂 Using database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        if check_column_exists(cursor, "users", "default_currency"):
            print("✅ Column 'default_currency' already exists in users table. Nothing to do.")
            return
        
        print("🔄 Adding 'default_currency' column to users table...")
        
        if dry_run:
            print("   [DRY RUN] Would execute:")
            print("   ALTER TABLE users ADD COLUMN default_currency VARCHAR DEFAULT 'USD'")
        else:
            cursor.execute(
                "ALTER TABLE users ADD COLUMN default_currency VARCHAR DEFAULT 'USD'"
            )
            conn.commit()
            print("✅ Successfully added 'default_currency' column with default 'USD'")
        
        # Verify the migration
        if not dry_run:
            if check_column_exists(cursor, "users", "default_currency"):
                print("✅ Verification passed: Column exists")
            else:
                print("❌ Verification failed: Column not found after migration")
                sys.exit(1)
    
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        sys.exit(1)
    
    finally:
        conn.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Add default_currency field to users table",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python migrations/add_user_default_currency.py
  python migrations/add_user_default_currency.py --dry-run
  python migrations/add_user_default_currency.py --db-path /path/to/db.sqlite3
        """
    )
    
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )
    
    parser.add_argument(
        "--db-path",
        type=str,
        default=str(DEFAULT_DB_PATH),
        help=f"Path to SQLite database (default: {DEFAULT_DB_PATH})"
    )
    
    args = parser.parse_args()
    
    print("🚀 Starting migration: Add user default currency")
    print("=" * 50)
    
    run_migration(args.db_path, args.dry_run)
    
    print("=" * 50)
    print("✨ Migration complete!")
