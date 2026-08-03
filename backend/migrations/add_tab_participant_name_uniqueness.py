#!/usr/bin/env python3
"""
Migration: one participant per name per tab.

Joining a tab used to insert a participant unconditionally, so a claimer who
changed their name — or simply reopened the link — was seated a second time.
Their earlier claims stayed pinned to the abandoned row, and the board showed
two people who were one. The API now renames in place and refuses a name
already at the table; this adds the index that makes that an invariant rather
than a convention, matching ux_tab_item_claims_item_participant.

Existing duplicates are renamed before the index goes on, since the index
cannot be created while any tab still holds two. A duplicate keeps its claims
and gains a numeric suffix ("Maya" → "Maya (2)"), which is legible next to the
original and cannot itself collide, because the loop re-checks.

Usage:
  python migrations/add_tab_participant_name_uniqueness.py --dry-run
  python migrations/add_tab_participant_name_uniqueness.py [--db-path path/to/db.sqlite3]
"""

import argparse
import os
import sqlite3
import sys

DATA_DIR = os.getenv(
    "DATA_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
DEFAULT_DB_PATH = os.path.join(DATA_DIR, "db.sqlite3")

INDEX_NAME = "ux_tab_participants_tab_name"
CREATE_INDEX = (
    f"CREATE UNIQUE INDEX IF NOT EXISTS {INDEX_NAME} "
    "ON tab_participants(tab_id, LOWER(display_name))"
)


def _duplicate_rows(cursor):
    """Every participant sharing a name with an earlier one on the same tab."""
    cursor.execute(
        """
        SELECT later.id, later.tab_id, later.display_name
        FROM tab_participants AS later
        WHERE EXISTS (
            SELECT 1 FROM tab_participants AS earlier
            WHERE earlier.tab_id = later.tab_id
              AND LOWER(TRIM(earlier.display_name)) = LOWER(TRIM(later.display_name))
              AND earlier.id < later.id
        )
        ORDER BY later.tab_id, later.id
        """
    )
    return cursor.fetchall()


def _free_name(cursor, tab_id: int, name: str, taken: set) -> str:
    """First 'name (n)' nobody on this tab is using."""
    suffix = 2
    while True:
        candidate = f"{name} ({suffix})"
        cursor.execute(
            """
            SELECT 1 FROM tab_participants
            WHERE tab_id = ? AND LOWER(TRIM(display_name)) = LOWER(?)
            LIMIT 1
            """,
            (tab_id, candidate),
        )
        if not cursor.fetchone() and (tab_id, candidate.lower()) not in taken:
            return candidate
        suffix += 1


def migrate(db_path: str, dry_run: bool = False) -> int:
    if not os.path.exists(db_path):
        print(f"✗ Database not found: {db_path}")
        return 1

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='tab_participants'"
        )
        if not cursor.fetchone():
            print("• tab_participants table not present yet — nothing to do.")
            return 0

        duplicates = _duplicate_rows(cursor)
        renamed = set()
        for participant_id, tab_id, display_name in duplicates:
            base = " ".join((display_name or "").split()) or "Guest"
            fresh = _free_name(cursor, tab_id, base, renamed)
            renamed.add((tab_id, fresh.lower()))
            if dry_run:
                print(f"  would rename participant {participant_id}: {display_name!r} → {fresh!r}")
                continue
            cursor.execute(
                "UPDATE tab_participants SET display_name = ? WHERE id = ?",
                (fresh, participant_id),
            )
            print(f"✓ renamed participant {participant_id}: {display_name!r} → {fresh!r}")

        if not duplicates:
            print("✓ no duplicate names to clear")

        if dry_run:
            print(f"  would create index {INDEX_NAME}")
            print("\nDry run complete — no changes were written.")
            conn.rollback()
            return 0

        cursor.execute(CREATE_INDEX)
        print(f"✓ unique index {INDEX_NAME}")

        conn.commit()
        print("\n✓ Migration complete: tab participant names are unique per tab.")
        return 0

    except sqlite3.Error as error:
        conn.rollback()
        print(f"✗ Migration failed, database not modified: {error}")
        return 1
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Make tab participant names unique per tab."
    )
    parser.add_argument("--db-path", default=DEFAULT_DB_PATH)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"Database: {args.db_path}")
    return migrate(args.db_path, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
