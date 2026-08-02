#!/usr/bin/env python3
"""
Database migration: Fix management relationships for claimed guests
-------------------------------------------------------------------
When guests with management relationships claimed their accounts,
the management relationship wasn't transferred to the new group_member record.
This migration fixes that by looking at claimed guests and updating their
corresponding group_member records.

Usage:
    python migrations/fix_claimed_guest_management.py [--dry-run] [--db-path <path>]

Options:
    --dry-run       Show what would be done without making changes
    --db-path       Path to SQLite database (default: db.sqlite3)
"""

import argparse
import sqlite3
import sys
from pathlib import Path


class MigrationError(Exception):
    """Custom exception for migration errors"""
    pass


def run_migration(db_path, dry_run=False):
    """
    Fix management relationships for claimed guests

    Args:
        db_path: Path to the SQLite database file
        dry_run: If True, only show what would be done

    Returns:
        bool: True if migration completed successfully
    """
    print(f"{'[DRY RUN] ' if dry_run else ''}Starting migration...")
    print(f"Database: {db_path}")
    print()

    # Check if database exists
    if not Path(db_path).exists():
        raise MigrationError(f"Database file not found: {db_path}")

    # Connect to database
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row  # Enable column access by name
    cursor = conn.cursor()

    try:
        # Find all claimed guests that have management relationships
        cursor.execute("""
            SELECT
                gm.id AS guest_id,
                gm.name AS guest_name,
                gm.claimed_by_id,
                gm.managed_by_id,
                gm.managed_by_type,
                gm.group_id
            FROM guest_members gm
            WHERE gm.claimed_by_id IS NOT NULL
              AND gm.managed_by_id IS NOT NULL
        """)

        claimed_guests_with_managers = cursor.fetchall()

        if not claimed_guests_with_managers:
            print("✓ No claimed guests with management relationships found")
            print("✓ No changes needed!")
            return True

        print(f"Found {len(claimed_guests_with_managers)} claimed guest(s) with management relationships:")
        print()

        updates_to_apply = []

        for guest in claimed_guests_with_managers:
            # Get the corresponding group_member record
            cursor.execute("""
                SELECT id, user_id, managed_by_id, managed_by_type
                FROM group_members
                WHERE group_id = ? AND user_id = ?
            """, (guest['group_id'], guest['claimed_by_id']))

            member = cursor.fetchone()

            if not member:
                print(f"⚠ Warning: No group_member found for claimed guest '{guest['guest_name']}' (claimed by user {guest['claimed_by_id']})")
                continue

            # Determine the correct manager
            manager_id = guest['managed_by_id']
            manager_type = guest['managed_by_type']

            # If managed by a guest, check if that guest was also claimed
            if manager_type == 'guest':
                cursor.execute("""
                    SELECT claimed_by_id FROM guest_members WHERE id = ?
                """, (manager_id,))
                manager_guest = cursor.fetchone()

                if manager_guest and manager_guest['claimed_by_id']:
                    # Manager guest was claimed, update to point to the user
                    manager_id = manager_guest['claimed_by_id']
                    manager_type = 'user'
                    status = "Manager guest also claimed → updating to user"
                else:
                    status = "Manager guest not claimed → keeping guest reference"
            else:
                status = "Manager is user"

            # Check if update is needed
            if member['managed_by_id'] != manager_id or member['managed_by_type'] != manager_type:
                updates_to_apply.append({
                    'member_id': member['id'],
                    'guest_name': guest['guest_name'],
                    'old_manager_id': member['managed_by_id'],
                    'old_manager_type': member['managed_by_type'],
                    'new_manager_id': manager_id,
                    'new_manager_type': manager_type,
                    'status': status
                })
                print(f"  • {guest['guest_name']} (claimed by user {guest['claimed_by_id']})")
                print(f"    Current: managed_by_id={member['managed_by_id']}, managed_by_type={member['managed_by_type']}")
                print(f"    New:     managed_by_id={manager_id}, managed_by_type={manager_type}")
                print(f"    Status:  {status}")
                print()
            else:
                print(f"  ✓ {guest['guest_name']} - already correctly set")
                print()

        if not updates_to_apply:
            print("✓ All management relationships are already correct!")
            print("✓ No changes needed!")
            return True

        print(f"Updates to apply: {len(updates_to_apply)}")
        print()

        if dry_run:
            print("[DRY RUN] Migration would complete successfully")
            print("[DRY RUN] No changes were made to the database")
            return True

        # Begin transaction
        cursor.execute("BEGIN TRANSACTION")

        try:
            # Apply updates
            for update in updates_to_apply:
                cursor.execute("""
                    UPDATE group_members
                    SET managed_by_id = ?, managed_by_type = ?
                    WHERE id = ?
                """, (update['new_manager_id'], update['new_manager_type'], update['member_id']))

            # Verify changes
            print("Verifying changes...")
            for update in updates_to_apply:
                cursor.execute("""
                    SELECT managed_by_id, managed_by_type
                    FROM group_members
                    WHERE id = ?
                """, (update['member_id'],))
                result = cursor.fetchone()

                if result['managed_by_id'] != update['new_manager_id'] or result['managed_by_type'] != update['new_manager_type']:
                    raise MigrationError(
                        f"Verification failed for member {update['member_id']}: "
                        f"expected ({update['new_manager_id']}, {update['new_manager_type']}), "
                        f"got ({result['managed_by_id']}, {result['managed_by_type']})"
                    )

            print("✓ All changes verified successfully")
            print()

            # Commit transaction
            conn.commit()
            print("✓ Migration completed successfully!")
            print()
            print("Summary:")
            print(f"  - Database: {db_path}")
            print(f"  - Claimed guests processed: {len(claimed_guests_with_managers)}")
            print(f"  - Group members updated: {len(updates_to_apply)}")

            return True

        except Exception as e:
            # Rollback on error
            conn.rollback()
            raise MigrationError(f"Migration failed and was rolled back: {e!s}") from e

    finally:
        cursor.close()
        conn.close()


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Fix management relationships for claimed guests in Splitwiser database",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run migration on default database
  python migrations/fix_claimed_guest_management.py

  # Dry run to see what would change
  python migrations/fix_claimed_guest_management.py --dry-run

  # Run migration on specific database
  python migrations/fix_claimed_guest_management.py --db-path /path/to/db.sqlite3
        """
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )

    parser.add_argument(
        "--db-path",
        default="db.sqlite3",
        help="Path to SQLite database file (default: db.sqlite3)"
    )

    args = parser.parse_args()

    try:
        success = run_migration(args.db_path, dry_run=args.dry_run)
        sys.exit(0 if success else 1)

    except MigrationError as e:
        print()
        print(f"❌ Migration Error: {e}", file=sys.stderr)
        sys.exit(1)

    except KeyboardInterrupt:
        print()
        print("❌ Migration cancelled by user", file=sys.stderr)
        sys.exit(1)

    except Exception as e:
        print()
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
