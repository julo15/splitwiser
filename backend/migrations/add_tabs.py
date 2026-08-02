#!/usr/bin/env python3
"""
Migration: add the tabs tables.

A tab is a one-off bill shared with a table of people via a link. It is
deliberately not a group — on close it resolves into an ordinary direct
expense (group_id NULL), so no existing table changes shape here. This
migration only adds new tables and is therefore additive and safe.

Tables added:
  tabs              the bill, its share token and its lifecycle
  tab_items         the lines on it
  tab_participants  whoever claimed something, with or without an account
  tab_item_claims   which participant claimed which line

Usage:
  python migrations/add_tabs.py --dry-run
  python migrations/add_tabs.py [--db-path path/to/db.sqlite3]
"""

import argparse
import os
import sqlite3
import sys

DATA_DIR = os.getenv(
    "DATA_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
DEFAULT_DB_PATH = os.path.join(DATA_DIR, "db.sqlite3")

STATEMENTS = [
    (
        "tabs table",
        """
        CREATE TABLE IF NOT EXISTS tabs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL,
            created_by_id INTEGER NOT NULL,
            currency VARCHAR DEFAULT 'USD',
            share_token VARCHAR NOT NULL UNIQUE,
            token_expires_at DATETIME NOT NULL,
            revoked BOOLEAN NOT NULL DEFAULT 0,
            status VARCHAR NOT NULL DEFAULT 'open',
            payer_id INTEGER,
            tax INTEGER NOT NULL DEFAULT 0,
            tip INTEGER NOT NULL DEFAULT 0,
            total INTEGER,
            receipt_image_path VARCHAR,
            created_at DATETIME NOT NULL,
            closed_at DATETIME,
            expense_id INTEGER,
            FOREIGN KEY (created_by_id) REFERENCES users(id)
        )
        """,
    ),
    (
        "index on tabs.share_token",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_tabs_share_token ON tabs(share_token)",
    ),
    (
        "index on tabs.created_by_id",
        "CREATE INDEX IF NOT EXISTS ix_tabs_created_by_id ON tabs(created_by_id)",
    ),
    (
        "index on tabs.expense_id",
        "CREATE INDEX IF NOT EXISTS ix_tabs_expense_id ON tabs(expense_id)",
    ),
    (
        "tab_items table",
        """
        CREATE TABLE IF NOT EXISTS tab_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tab_id INTEGER NOT NULL,
            description VARCHAR NOT NULL,
            price INTEGER NOT NULL,
            added_manually BOOLEAN NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE
        )
        """,
    ),
    (
        "index on tab_items.tab_id",
        "CREATE INDEX IF NOT EXISTS ix_tab_items_tab_id ON tab_items(tab_id)",
    ),
    (
        "tab_participants table",
        """
        CREATE TABLE IF NOT EXISTS tab_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tab_id INTEGER NOT NULL,
            display_name VARCHAR NOT NULL,
            user_id INTEGER,
            claim_token VARCHAR NOT NULL UNIQUE,
            joined_at DATETIME NOT NULL,
            FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """,
    ),
    (
        "index on tab_participants.tab_id",
        "CREATE INDEX IF NOT EXISTS ix_tab_participants_tab_id "
        "ON tab_participants(tab_id)",
    ),
    (
        "index on tab_participants.claim_token",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_tab_participants_claim_token "
        "ON tab_participants(claim_token)",
    ),
    (
        "index on tab_participants.user_id",
        "CREATE INDEX IF NOT EXISTS ix_tab_participants_user_id "
        "ON tab_participants(user_id)",
    ),
    (
        "tab_item_claims table",
        """
        CREATE TABLE IF NOT EXISTS tab_item_claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tab_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            participant_id INTEGER NOT NULL,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES tab_items(id) ON DELETE CASCADE,
            FOREIGN KEY (participant_id) REFERENCES tab_participants(id)
                ON DELETE CASCADE
        )
        """,
    ),
    (
        "index on tab_item_claims.tab_id",
        "CREATE INDEX IF NOT EXISTS ix_tab_item_claims_tab_id "
        "ON tab_item_claims(tab_id)",
    ),
    (
        "index on tab_item_claims.item_id",
        "CREATE INDEX IF NOT EXISTS ix_tab_item_claims_item_id "
        "ON tab_item_claims(item_id)",
    ),
    (
        "index on tab_item_claims.participant_id",
        "CREATE INDEX IF NOT EXISTS ix_tab_item_claims_participant_id "
        "ON tab_item_claims(participant_id)",
    ),
    (
        # A person claiming the same line twice is one claim, not two. Enforced
        # in the schema so a retry or a double tap cannot double-count.
        "unique claim per participant per item",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_tab_item_claims_item_participant "
        "ON tab_item_claims(item_id, participant_id)",
    ),
]


def migrate(db_path: str, dry_run: bool = False) -> int:
    if not os.path.exists(db_path):
        print(f"✗ Database not found: {db_path}")
        return 1

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing = {row[0] for row in cursor.fetchall()}

        for name, sql in STATEMENTS:
            if dry_run:
                already = any(t in existing for t in ("tabs",) if t in name)
                print(f"  would create {name}" + (" (already present)" if already else ""))
                continue
            cursor.execute(sql)
            print(f"✓ {name}")

        if dry_run:
            print("\nDry run complete — no changes were written.")
            conn.rollback()
            return 0

        conn.commit()
        print("\n✓ Migration complete: tabs tables added.")
        return 0

    except sqlite3.Error as error:
        conn.rollback()
        print(f"✗ Migration failed, database not modified: {error}")
        return 1
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Add the tabs tables.")
    parser.add_argument("--db-path", default=DEFAULT_DB_PATH)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"Database: {args.db_path}")
    return migrate(args.db_path, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
