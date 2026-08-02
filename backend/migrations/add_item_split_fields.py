#!/usr/bin/env python3
"""
Migration script to add split_type and split_details columns to expense_items table.
"""

import os
import sqlite3
import sys

# Get the database path from environment or use default
DATA_DIR = os.getenv("DATA_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(DATA_DIR, "db.sqlite3")

def migrate():
    """Add split_type and split_details columns to expense_items table."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Check if columns already exist
        cursor.execute("PRAGMA table_info(expense_items)")
        columns = [column[1] for column in cursor.fetchall()]

        if 'split_type' not in columns:
            print("Adding split_type column to expense_items table...")
            cursor.execute("""
                ALTER TABLE expense_items
                ADD COLUMN split_type TEXT DEFAULT 'EQUAL'
            """)
            print("✓ Added split_type column")
        else:
            print("split_type column already exists")

        if 'split_details' not in columns:
            print("Adding split_details column to expense_items table...")
            cursor.execute("""
                ALTER TABLE expense_items
                ADD COLUMN split_details TEXT
            """)
            print("✓ Added split_details column")
        else:
            print("split_details column already exists")

        conn.commit()
        conn.close()
        print("\n✅ Migration completed successfully!")

    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate()