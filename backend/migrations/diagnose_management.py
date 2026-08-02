#!/usr/bin/env python3
"""
Diagnose management relationship issues
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models

# Create database connection
engine = create_engine("sqlite:///db.sqlite3")
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

print("=" * 80)
print("GUEST MEMBERS (Claimed)")
print("=" * 80)
claimed_guests = db.query(models.GuestMember).filter(
    models.GuestMember.claimed_by_id != None
).all()

for guest in claimed_guests:
    print(f"\nGuest ID: {guest.id}")
    print(f"  Name: {guest.name}")
    print(f"  Claimed by User ID: {guest.claimed_by_id}")
    print(f"  Managed by ID: {guest.managed_by_id}")
    print(f"  Managed by Type: {guest.managed_by_type}")
    print(f"  Group ID: {guest.group_id}")

print("\n" + "=" * 80)
print("GROUP MEMBERS (from claimed guests)")
print("=" * 80)

for guest in claimed_guests:
    member = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == guest.group_id,
        models.GroupMember.user_id == guest.claimed_by_id
    ).first()

    if member:
        print(f"\nUser ID: {member.user_id} (was guest '{guest.name}')")
        print(f"  Group ID: {member.group_id}")
        print(f"  Managed by ID: {member.managed_by_id}")
        print(f"  Managed by Type: {member.managed_by_type}")

        # Check if this should have a management relationship
        if guest.managed_by_id and not member.managed_by_id:
            print(f"  ⚠️  ISSUE: Guest had managed_by_id={guest.managed_by_id}, but group_member doesn't!")
    else:
        print(f"\n⚠️  No group_member found for user {guest.claimed_by_id} (was guest '{guest.name}')")

print("\n" + "=" * 80)
print("ALL GROUP MEMBERS WITH MANAGEMENT")
print("=" * 80)

managed_members = db.query(models.GroupMember).filter(
    models.GroupMember.managed_by_id != None
).all()

for member in managed_members:
    user = db.query(models.User).filter(models.User.id == member.user_id).first()
    print(f"\nUser ID: {member.user_id} (Email: {user.email if user else 'Unknown'})")
    print(f"  Group ID: {member.group_id}")
    print(f"  Managed by ID: {member.managed_by_id}")
    print(f"  Managed by Type: {member.managed_by_type}")

db.close()
