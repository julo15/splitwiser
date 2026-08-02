"""
Database migration: Add venmo_username field to users table.

Lets a user publish a Venmo handle so that anyone settling up with them can be
handed a pre-filled payment instead of retyping the amount. The column is
nullable and has no default: absent means "I have not set one", which is the
correct starting state for every existing user.

Usage:
    python migrations/add_venmo_username.py [--dry-run] [--db-path <path>]
"""

import argparse
import sqlite3
import sys
import os
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).parent.parent / "db.sqlite3"


def check_column_exists(cursor, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    cursor.execute(f"PRAGMA table_info({table_name})")
    return column_name in [row[1] for row in cursor.fetchall()]


def run_migration(db_path: str, dry_run: bool = False) -> None:
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        sys.exit(1)

    print(f"📂 Using database: {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        if check_column_exists(cursor, "users", "venmo_username"):
            print("✅ Column 'venmo_username' already exists. Nothing to do.")
            return

        print("🔄 Adding 'venmo_username' column to users table...")

        if dry_run:
            print("   [DRY RUN] Would execute:")
            print("   ALTER TABLE users ADD COLUMN venmo_username VARCHAR")
        else:
            cursor.execute("ALTER TABLE users ADD COLUMN venmo_username VARCHAR")
            conn.commit()
            print("✅ Added 'venmo_username' column (NULL for every existing user)")
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Add venmo_username to the users table."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would happen without changing the database",
    )
    parser.add_argument(
        "--db-path",
        default=str(DEFAULT_DB_PATH),
        help=f"Path to the SQLite database (default: {DEFAULT_DB_PATH})",
    )
    args = parser.parse_args()
    run_migration(args.db_path, args.dry_run)


if __name__ == "__main__":
    main()
