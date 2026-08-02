"""
Migration: Add indexes for friend expense queries
Adds indexes to improve performance of friend expense and balance queries.
"""

import os
import sqlite3


def run_migration():
    # Find the database
    db_path = os.path.join(os.path.dirname(__file__), '..', 'db.sqlite3')
    if not os.path.exists(db_path):
        db_path = '/data/db.sqlite3'  # Production path
    
    if not os.path.exists(db_path):
        print("Error: Database file not found")
        return False
    
    print(f"Using database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Index for expense_splits lookups by user_id and is_guest
        # This helps the subqueries that find expenses where a user is a participant
        print("Creating index on expense_splits(user_id, is_guest)...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_expense_splits_user_guest 
            ON expense_splits(user_id, is_guest)
        """)
        print("✓ Created idx_expense_splits_user_guest")
        
        # Index for guest_members lookups by group_id and managed_by_id
        # This helps the managed guest queries
        print("Creating index on guest_members(group_id, managed_by_id)...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_guest_members_group_managed 
            ON guest_members(group_id, managed_by_id)
        """)
        print("✓ Created idx_guest_members_group_managed")
        
        # Index for group_members lookups by group_id and managed_by_id
        # This helps the managed member queries
        print("Creating index on group_members(group_id, managed_by_id)...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_group_members_group_managed 
            ON group_members(group_id, managed_by_id)
        """)
        print("✓ Created idx_group_members_group_managed")
        
        # Index for group_members lookups by user_id
        # This helps finding groups a user is in
        print("Creating index on group_members(user_id)...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_group_members_user_id 
            ON group_members(user_id)
        """)
        print("✓ Created idx_group_members_user_id")
        
        conn.commit()
        print("\n✅ Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"Error running migration: {e}")
        conn.rollback()
        return False
        
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
