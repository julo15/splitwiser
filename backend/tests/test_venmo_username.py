"""The Venmo handle: normalisation, validation, and who is allowed to see it."""

import pytest

from conftest import client, db_session  # noqa: F401


def register(client, email, name):
    client.post(
        "/register",
        json={"email": email, "password": "password123", "full_name": name},
    )
    token = client.post(
        "/token", data={"username": email, "password": "password123"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def set_handle(client, headers, value):
    return client.put(
        "/users/me/profile", json={"venmo_username": value}, headers=headers
    )


def get_handle(client, headers):
    return client.get("/users/me/profile", headers=headers).json()["venmo_username"]


class TestSettingTheHandle:
    def test_a_plain_handle_is_stored_as_given(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        assert set_handle(client, headers, "vince-woo").status_code == 200
        assert get_handle(client, headers) == "vince-woo"

    def test_a_leading_at_is_stripped(self, client):
        """People copy their handle off Venmo, where it is shown with the @."""
        headers = register(client, "vince@example.com", "Vince Woo")
        set_handle(client, headers, "@VinceWoo")
        assert get_handle(client, headers) == "VinceWoo"

    def test_surrounding_whitespace_is_stripped(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        set_handle(client, headers, "  @vince_woo  ")
        assert get_handle(client, headers) == "vince_woo"

    def test_nobody_starts_with_one(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        assert get_handle(client, headers) is None

    def test_an_empty_value_clears_it(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        set_handle(client, headers, "vince-woo")
        assert set_handle(client, headers, "").status_code == 200
        assert get_handle(client, headers) is None

    def test_whitespace_only_also_clears_it(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        set_handle(client, headers, "vince-woo")
        set_handle(client, headers, "   ")
        assert get_handle(client, headers) is None

    def test_omitting_the_field_leaves_it_alone(self, client):
        """Saving the rest of the profile must not wipe the handle."""
        headers = register(client, "vince@example.com", "Vince Woo")
        set_handle(client, headers, "vince-woo")

        client.put(
            "/users/me/profile", json={"full_name": "Vince W"}, headers=headers
        )
        assert get_handle(client, headers) == "vince-woo"

    @pytest.mark.parametrize(
        "bad",
        ["has space", "emoji🙂", "semi;colon", "slash/es", "quote'", "at@sign"],
    )
    def test_unusable_characters_are_refused(self, client, bad):
        headers = register(client, "vince@example.com", "Vince Woo")
        assert set_handle(client, headers, bad).status_code == 422

    def test_an_over_long_handle_is_refused(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        assert set_handle(client, headers, "a" * 31).status_code == 422

    def test_thirty_characters_is_allowed(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        assert set_handle(client, headers, "a" * 30).status_code == 200


class TestWhoCanSeeIt:
    def test_a_friend_sees_it_in_the_friends_list(self, client):
        """This is the whole point: settling up needs the other side's handle."""
        vince = register(client, "vince@example.com", "Vince Woo")
        maya = register(client, "maya@example.com", "Maya Chen")
        set_handle(client, maya, "maya-chen")

        client.post("/friends", json={"email": "maya@example.com"}, headers=vince)

        friends = client.get("/friends", headers=vince).json()
        entry = next(f for f in friends if f["email"] == "maya@example.com")
        assert entry["venmo_username"] == "maya-chen"

    def test_a_friend_without_one_reads_as_null(self, client):
        vince = register(client, "vince@example.com", "Vince Woo")
        register(client, "maya@example.com", "Maya Chen")
        client.post("/friends", json={"email": "maya@example.com"}, headers=vince)

        friends = client.get("/friends", headers=vince).json()
        assert friends[0]["venmo_username"] is None

    def test_a_public_share_link_never_exposes_it(self, client):
        """
        A share link is handed to strangers. A payment handle is exactly the
        sort of thing that must not ride along with it.
        """
        vince = register(client, "vince@example.com", "Vince Woo")
        set_handle(client, vince, "vince-woo")

        group = client.post(
            "/groups", json={"name": "Tahoe", "default_currency": "USD"}, headers=vince
        ).json()
        share = client.post(f"/groups/{group['id']}/share", headers=vince).json()

        body = client.get(f"/public/groups/{share['share_link_id']}").text
        assert "vince-woo" not in body
        assert "venmo" not in body.lower()

    def test_a_stranger_cannot_read_it_through_the_friends_list(self, client):
        vince = register(client, "vince@example.com", "Vince Woo")
        set_handle(client, vince, "vince-woo")
        mallory = register(client, "mallory@example.com", "Mallory")

        # Not friends, so Vince does not appear at all.
        assert client.get("/friends", headers=mallory).json() == []
