"""Unit tests for utils.display — public-safe name rendering and email masking."""

import pytest

import models
from auth import get_password_hash
from utils.display import (
    mask_email,
    get_public_user_display_name,
    get_guest_display_name,
    get_participant_display_name,
)


def make_user(db, email, name=None):
    user = models.User(
        email=email,
        hashed_password=get_password_hash("password123"),
        full_name=name,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_group(db, owner):
    group = models.Group(name="Group", created_by_id=owner.id, default_currency="USD")
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


def make_guest(db, group, creator, name="Guest", claimed_by_id=None):
    guest = models.GuestMember(
        group_id=group.id,
        name=name,
        created_by_id=creator.id,
        claimed_by_id=claimed_by_id,
    )
    db.add(guest)
    db.commit()
    db.refresh(guest)
    return guest


class TestMaskEmail:
    @pytest.mark.parametrize("email,expected", [
        # Local part longer than 3 chars: keep first two and last one.
        ("jules@example.com", "ju***s@example.com"),
        ("alice@example.com", "al***e@example.com"),
        ("abcd@example.com", "ab***d@example.com"),
        # Local part of 2-3 chars: keep only the first.
        ("abc@example.com", "a***@example.com"),
        ("ab@example.com", "a***@example.com"),
        # Single-char local part reveals nothing.
        ("a@example.com", "***@example.com"),
    ])
    def test_masks_local_part(self, email, expected):
        assert mask_email(email) == expected

    def test_preserves_domain_including_subdomains(self):
        assert mask_email("jules@mail.corp.example.com") == "ju***s@mail.corp.example.com"

    def test_only_splits_on_the_first_at_sign(self):
        assert mask_email("we!rd@a@example.com") == "we***d@a@example.com"

    @pytest.mark.parametrize("value", ["", None, "not-an-email"])
    def test_falls_back_to_generic_label(self, value):
        assert mask_email(value) == "User"

    def test_masked_output_never_contains_the_full_local_part(self):
        assert "jules" not in mask_email("jules@example.com")


class TestPublicUserDisplayName:
    def test_prefers_full_name(self, db_session):
        user = make_user(db_session, "jules@example.com", "Jules Verne")
        assert get_public_user_display_name(user) == "Jules Verne"

    def test_falls_back_to_masked_email(self, db_session):
        user = make_user(db_session, "jules@example.com", None)
        assert get_public_user_display_name(user) == "ju***s@example.com"

    def test_empty_full_name_falls_back_to_masked_email(self, db_session):
        user = make_user(db_session, "jules@example.com", "")
        assert get_public_user_display_name(user) == "ju***s@example.com"

    def test_none_user_returns_placeholder(self):
        assert get_public_user_display_name(None) == "Unknown User"


class TestGuestDisplayName:
    def test_unclaimed_guest_uses_its_own_name(self, db_session):
        owner = make_user(db_session, "owner@example.com", "Owner")
        group = make_group(db_session, owner)
        guest = make_guest(db_session, group, owner, name="Bob")
        assert get_guest_display_name(guest, db_session) == "Bob"

    def test_claimed_guest_shows_claimer_full_name(self, db_session):
        owner = make_user(db_session, "owner@example.com", "Owner")
        claimer = make_user(db_session, "bob@example.com", "Bob Real")
        group = make_group(db_session, owner)
        guest = make_guest(db_session, group, owner, name="Bob", claimed_by_id=claimer.id)
        assert get_guest_display_name(guest, db_session) == "Bob Real"

    def test_claimed_guest_falls_back_to_claimer_email(self, db_session):
        owner = make_user(db_session, "owner@example.com", "Owner")
        claimer = make_user(db_session, "bob@example.com", None)
        group = make_group(db_session, owner)
        guest = make_guest(db_session, group, owner, name="Bob", claimed_by_id=claimer.id)
        assert get_guest_display_name(guest, db_session) == "bob@example.com"

    def test_dangling_claim_falls_back_to_guest_name(self, db_session):
        owner = make_user(db_session, "owner@example.com", "Owner")
        group = make_group(db_session, owner)
        guest = make_guest(db_session, group, owner, name="Bob", claimed_by_id=99999)
        assert get_guest_display_name(guest, db_session) == "Bob"

    def test_none_guest_returns_placeholder(self, db_session):
        assert get_guest_display_name(None, db_session) == "Unknown Guest"


class TestParticipantDisplayName:
    def test_registered_user_by_id(self, db_session):
        user = make_user(db_session, "jules@example.com", "Jules Verne")
        assert get_participant_display_name(user.id, False, db_session) == "Jules Verne"

    def test_registered_user_without_name_shows_full_email(self, db_session):
        # Not a public context, so the email is shown unmasked.
        user = make_user(db_session, "jules@example.com", None)
        assert get_participant_display_name(user.id, False, db_session) == "jules@example.com"

    def test_unknown_user_id_returns_placeholder(self, db_session):
        assert get_participant_display_name(99999, False, db_session) == "Unknown User"

    def test_guest_by_id(self, db_session):
        owner = make_user(db_session, "owner@example.com", "Owner")
        group = make_group(db_session, owner)
        guest = make_guest(db_session, group, owner, name="Bob")
        assert get_participant_display_name(guest.id, True, db_session) == "Bob"

    def test_claimed_guest_resolves_to_the_claimer(self, db_session):
        owner = make_user(db_session, "owner@example.com", "Owner")
        claimer = make_user(db_session, "bob@example.com", "Bob Real")
        group = make_group(db_session, owner)
        guest = make_guest(db_session, group, owner, name="Bob", claimed_by_id=claimer.id)
        assert get_participant_display_name(guest.id, True, db_session) == "Bob Real"

    def test_unknown_guest_id_returns_placeholder(self, db_session):
        assert get_participant_display_name(99999, True, db_session) == "Unknown Guest"

    def test_same_id_resolves_differently_for_user_and_guest(self, db_session):
        # A user ID and a guest ID can collide; the is_guest flag disambiguates.
        owner = make_user(db_session, "owner@example.com", "Owner Name")
        group = make_group(db_session, owner)
        guest = make_guest(db_session, group, owner, name="Guest Name")
        assert get_participant_display_name(owner.id, False, db_session) == "Owner Name"
        assert get_participant_display_name(guest.id, True, db_session) == "Guest Name"
