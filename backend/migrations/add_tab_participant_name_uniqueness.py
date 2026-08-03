#!/usr/bin/env python3
"""
Migration: one participant per person per tab, by name and by account.

Joining a tab used to insert a participant unconditionally, so a claimer who
changed their name — or simply reopened the link — was seated a second time.
Their earlier claims stayed pinned to the abandoned row, and the board showed
two people who were one. The API now renames in place, recognises a signed-in
claimer's account, and refuses a name already at the table; this adds the
indexes that make those invariants rather than conventions, matching
ux_tab_item_claims_item_participant.

  ux_tab_participants_tab_name  (tab_id, LOWER(display_name))
  ux_tab_participants_tab_user  (tab_id, user_id)

Existing duplicates are cleared first, since neither index can be created while
a tab still holds two. A duplicate name keeps its claims and gains a numeric
suffix ("Maya" → "Maya (2)"), legible next to the original and unable to
collide in turn because the loop re-checks. A repeated account — which no
released code path produces, but which would stop the container booting — has
the account detached from the later seat, leaving it a guest seat with its
claims intact rather than deleting anything.

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

NAME_INDEX = "ux_tab_participants_tab_name"
USER_INDEX = "ux_tab_participants_tab_user"
CREATE_INDEXES = [
    (
        NAME_INDEX,
        f"CREATE UNIQUE INDEX IF NOT EXISTS {NAME_INDEX} "
        "ON tab_participants(tab_id, LOWER(display_name))",
    ),
    (
        # NULL repeats freely under a unique index, so anonymous seats are
        # untouched and only accounts are held to one seat per tab.
        USER_INDEX,
        f"CREATE UNIQUE INDEX IF NOT EXISTS {USER_INDEX} "
        "ON tab_participants(tab_id, user_id)",
    ),
]


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


def _duplicate_accounts(cursor):
    """Every seat whose account is already held by an earlier seat on the tab."""
    cursor.execute(
        """
        SELECT later.id, later.tab_id, later.user_id
        FROM tab_participants AS later
        WHERE later.user_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM tab_participants AS earlier
            WHERE earlier.tab_id = later.tab_id
              AND earlier.user_id = later.user_id
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

        repeated = _duplicate_accounts(cursor)
        for participant_id, _tab_id, user_id in repeated:
            if dry_run:
                print(
                    f"  would detach account {user_id} from participant "
                    f"{participant_id} (kept as a guest seat)"
                )
                continue
            cursor.execute(
                "UPDATE tab_participants SET user_id = NULL WHERE id = ?",
                (participant_id,),
            )
            print(
                f"✓ detached account {user_id} from participant {participant_id}"
                " (kept as a guest seat)"
            )

        if not repeated:
            print("✓ no repeated accounts to clear")

        if dry_run:
            for index_name, _sql in CREATE_INDEXES:
                print(f"  would create index {index_name}")
            print("\nDry run complete — no changes were written.")
            conn.rollback()
            return 0

        for index_name, sql in CREATE_INDEXES:
            cursor.execute(sql)
            print(f"✓ unique index {index_name}")

        conn.commit()
        print("\n✓ Migration complete: one participant per person per tab.")
        return 0

    except sqlite3.Error as error:
        conn.rollback()
        print(f"✗ Migration failed, database not modified: {error}")
        return 1
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Hold tab participants to one seat per person, per tab."
    )
    parser.add_argument("--db-path", default=DEFAULT_DB_PATH)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"Database: {args.db_path}")
    return migrate(args.db_path, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
