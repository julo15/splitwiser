#!/usr/bin/env python3
"""
Migration: drop tab → expense links that point at somebody else's expense.

Closing a tab records the expense it resolved into on `tabs.expense_id`, and
`GET /expenses/{id}` reads that link backwards to offer the tab's owner a way
back to the item-by-item board. Deleting the expense used to leave the link
behind, and SQLite hands a freed rowid straight back to the next insert — so
the next expense created was born wearing a dead tab's id. Its owner opened the
receipt of a bill they had already thrown away, with the wrong people on it.

`delete_expense` now clears the link on the way out. This clears the ones
already written. A link is dropped when:

  * the expense is gone — the tab it belonged to was deleted;
  * a later tab claims the same expense — only the most recent close can have
    created it, so the earlier claim is a rowid the tab no longer owns;
  * the expense cannot be a tab's: it sits in a group (a tab never becomes a
    group) or was created by another account.

Nothing is deleted and no tab is reopened: a closed tab's claims are spent, and
reopening would put a writable link back in circulation. The tab simply stops
answering for an expense that is not its own.

Usage:
  python migrations/detach_tabs_from_deleted_expenses.py --dry-run
  python migrations/detach_tabs_from_deleted_expenses.py [--db-path path/to/db.sqlite3]
"""

import argparse
import os
import sqlite3
import sys

DATA_DIR = os.getenv(
    "DATA_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
DEFAULT_DB_PATH = os.path.join(DATA_DIR, "db.sqlite3")


def _linked_tabs(cursor):
    """Every tab claiming an expense, with what that expense turns out to be."""
    cursor.execute(
        """
        SELECT
            tabs.id,
            tabs.name,
            tabs.expense_id,
            tabs.created_by_id,
            expenses.id,
            expenses.group_id,
            expenses.created_by_id,
            (
                SELECT COUNT(*) FROM tabs AS later
                WHERE later.expense_id = tabs.expense_id AND later.id > tabs.id
            )
        FROM tabs
        LEFT JOIN expenses ON expenses.id = tabs.expense_id
        WHERE tabs.expense_id IS NOT NULL
        ORDER BY tabs.id
        """
    )
    return cursor.fetchall()


def _stale_reason(row) -> str:
    """Why this link cannot be real, or "" if it can."""
    (
        _tab_id,
        _name,
        expense_id,
        tab_owner_id,
        found_expense_id,
        group_id,
        expense_owner_id,
        newer_claims,
    ) = row

    if found_expense_id is None:
        return f"expense {expense_id} no longer exists"
    if newer_claims:
        return f"expense {expense_id} was claimed by a tab closed later"
    if group_id is not None:
        return f"expense {expense_id} belongs to a group"
    if expense_owner_id != tab_owner_id:
        return f"expense {expense_id} was created by another account"
    return ""


def migrate(db_path: str, dry_run: bool = False) -> int:
    if not os.path.exists(db_path):
        print(f"✗ Database not found: {db_path}")
        return 1

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='tabs'"
        )
        if not cursor.fetchone():
            print("• tabs table not present yet — nothing to do.")
            return 0

        stale = [
            (row[0], row[1], reason)
            for row in _linked_tabs(cursor)
            if (reason := _stale_reason(row))
        ]

        if not stale:
            print("✓ every tab points at its own expense")
        for tab_id, name, reason in stale:
            if dry_run:
                print(f"  would detach tab {tab_id} ({name!r}): {reason}")
                continue
            cursor.execute(
                "UPDATE tabs SET expense_id = NULL WHERE id = ?", (tab_id,)
            )
            print(f"✓ detached tab {tab_id} ({name!r}): {reason}")

        if dry_run:
            print("\nDry run complete — no changes were written.")
            conn.rollback()
            return 0

        conn.commit()
        print("\n✓ Migration complete: no tab answers for an expense it does not own.")
        return 0

    except sqlite3.Error as error:
        conn.rollback()
        print(f"✗ Migration failed, database not modified: {error}")
        return 1
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Drop tab → expense links left behind by a deleted expense."
    )
    parser.add_argument("--db-path", default=DEFAULT_DB_PATH)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"Database: {args.db_path}")
    return migrate(args.db_path, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
