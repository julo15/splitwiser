"""Tabs: the owner surface, the public claim surface, and close-out."""

from datetime import datetime, timedelta

import pytest

import models


def register(client, email, name):
    client.post(
        "/register",
        json={"email": email, "password": "password123", "full_name": name},
    )
    token = client.post(
        "/token", data={"username": email, "password": "password123"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def make_tab(client, headers, **over):
    payload = {
        "name": "Bar Sol",
        "currency": "USD",
        "items": [
            {"description": "Pizza margherita", "price": 2800},
            {"description": "Vinho Verde", "price": 3400},
            {"description": "Polvo grelhado", "price": 3100},
        ],
        "tax": 900,
        "tip": 1000,
        "total": 11200,
    }
    payload.update(over)
    response = client.post("/tabs", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


class TestTabCreation:
    def test_creating_a_tab_issues_a_link_and_seats_the_opener(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)

        assert tab["status"] == "open"
        assert len(tab["items"]) == 3
        # The opener is already at the table.
        assert len(tab["participants"]) == 1
        assert tab["participants"][0]["display_name"] == "Vince Woo"
        # A usable, expiring link.
        assert tab["share_token"]
        assert len(tab["share_token"]) >= 32
        assert tab["token_expires_at"] is not None

    def test_tokens_are_unpredictable_and_unique(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tokens = {make_tab(client, headers)["share_token"] for _ in range(5)}
        assert len(tokens) == 5

    def test_a_tab_is_never_a_group(self, client, db_session):
        headers = register(client, "vince@example.com", "Vince Woo")
        make_tab(client, headers)
        assert db_session.query(models.Group).count() == 0
        assert client.get("/groups", headers=headers).json() == []

    def test_requires_authentication(self, client):
        assert client.post("/tabs", json={"name": "x"}).status_code == 401


class TestOwnerAccess:
    def test_another_user_cannot_read_someone_elses_tab(self, client):
        owner = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, owner)
        stranger = register(client, "mallory@example.com", "Mallory")

        response = client.get(f"/tabs/{tab['id']}", headers=stranger)
        # Indistinguishable from a tab that does not exist.
        assert response.status_code == 404

    def test_listing_only_returns_your_own_tabs(self, client):
        owner = register(client, "vince@example.com", "Vince Woo")
        make_tab(client, owner)
        stranger = register(client, "mallory@example.com", "Mallory")

        assert client.get("/tabs", headers=stranger).json() == []
        assert len(client.get("/tabs", headers=owner).json()) == 1


class TestPublicRead:
    def test_the_link_opens_the_tab_without_an_account(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)

        public = client.get(f"/public/tabs/{tab['share_token']}")
        assert public.status_code == 200
        body = public.json()
        assert body["name"] == "Bar Sol"
        assert len(body["items"]) == 3

    def test_the_public_payload_leaks_nothing_extra(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)

        body = client.get(f"/public/tabs/{tab['share_token']}").json()
        # No way to re-derive the link, the owner, or anyone's claim token.
        assert "share_token" not in body
        assert "created_by_id" not in body
        assert "id" not in body
        for participant in body["participants"]:
            assert "claim_token" not in participant

    def test_an_unknown_token_is_rejected(self, client):
        assert client.get("/public/tabs/not-a-real-token").status_code == 404

    def test_an_expired_link_stops_working(self, client, db_session):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)

        row = db_session.query(models.Tab).filter(models.Tab.id == tab["id"]).first()
        row.token_expires_at = datetime.utcnow() - timedelta(seconds=1)
        db_session.commit()

        assert client.get(f"/public/tabs/{tab['share_token']}").status_code == 410

    def test_a_revoked_link_stops_working(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)

        client.post(f"/tabs/{tab['id']}/revoke", headers=headers)
        assert client.get(f"/public/tabs/{tab['share_token']}").status_code == 404


class TestJoiningAndClaiming:
    def test_joining_with_a_first_name_creates_a_participant(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)

        response = client.post(
            f"/public/tabs/{tab['share_token']}/join", json={"display_name": "Maya"}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["participant"]["display_name"] == "Maya"
        # No account, so the claim token is the only handle they get.
        assert body["claim_token"]
        assert body["participant"]["user_id"] is None

    def test_claiming_and_releasing_a_line(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        token = tab["share_token"]
        item_id = tab["items"][0]["id"]

        joined = client.post(
            f"/public/tabs/{token}/join", json={"display_name": "Maya"}
        ).json()
        claim_token = joined["claim_token"]
        maya_id = joined["participant"]["id"]

        claimed = client.post(
            f"/public/tabs/{token}/items/{item_id}/claim",
            json={"claim_token": claim_token, "claimed": True},
        ).json()
        item = next(i for i in claimed["items"] if i["id"] == item_id)
        assert item["claimed_by"] == [maya_id]

        released = client.post(
            f"/public/tabs/{token}/items/{item_id}/claim",
            json={"claim_token": claim_token, "claimed": False},
        ).json()
        item = next(i for i in released["items"] if i["id"] == item_id)
        assert item["claimed_by"] == []

    def test_claiming_twice_is_idempotent(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        token, item_id = tab["share_token"], tab["items"][0]["id"]

        joined = client.post(
            f"/public/tabs/{token}/join", json={"display_name": "Maya"}
        ).json()

        for _ in range(3):
            body = client.post(
                f"/public/tabs/{token}/items/{item_id}/claim",
                json={"claim_token": joined["claim_token"], "claimed": True},
            ).json()

        item = next(i for i in body["items"] if i["id"] == item_id)
        assert item["claimed_by"] == [joined["participant"]["id"]]

    def test_two_people_on_one_line_is_sharing_not_a_conflict(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        token, item_id = tab["share_token"], tab["items"][0]["id"]

        maya = client.post(
            f"/public/tabs/{token}/join", json={"display_name": "Maya"}
        ).json()
        ben = client.post(
            f"/public/tabs/{token}/join", json={"display_name": "Ben"}
        ).json()

        for person in (maya, ben):
            response = client.post(
                f"/public/tabs/{token}/items/{item_id}/claim",
                json={"claim_token": person["claim_token"], "claimed": True},
            )
            assert response.status_code == 200

        item = next(i for i in response.json()["items"] if i["id"] == item_id)
        assert sorted(item["claimed_by"]) == sorted(
            [maya["participant"]["id"], ben["participant"]["id"]]
        )

    def test_claiming_without_joining_is_refused(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)

        response = client.post(
            f"/public/tabs/{tab['share_token']}/items/{tab['items'][0]['id']}/claim",
            json={"claim_token": "made-up", "claimed": True},
        )
        assert response.status_code == 403

    def test_a_claim_token_from_another_tab_is_refused(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        first = make_tab(client, headers)
        second = make_tab(client, headers, name="Other Bar")

        joined = client.post(
            f"/public/tabs/{first['share_token']}/join",
            json={"display_name": "Maya"},
        ).json()

        # The token belongs to `first`; it must not work against `second`.
        response = client.post(
            f"/public/tabs/{second['share_token']}/items/{second['items'][0]['id']}/claim",
            json={"claim_token": joined["claim_token"], "claimed": True},
        )
        assert response.status_code == 403


class TestParticipantIdentity:
    """
    One person is one row. The claim token is who somebody is; the name is a
    label on that row, and changing it must not seat a second them.
    """

    def join(self, client, tab, name):
        response = client.post(
            f"/public/tabs/{tab['share_token']}/join", json={"display_name": name}
        )
        assert response.status_code == 200, response.text
        return response.json()

    def test_renaming_keeps_the_same_person_and_their_claims(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        token, item_id = tab["share_token"], tab["items"][0]["id"]

        joined = self.join(client, tab, "Maya")
        client.post(
            f"/public/tabs/{token}/items/{item_id}/claim",
            json={"claim_token": joined["claim_token"], "claimed": True},
        )

        response = client.post(
            f"/public/tabs/{token}/rename",
            json={"claim_token": joined["claim_token"], "display_name": "Maya B"},
        )
        assert response.status_code == 200, response.text
        body = response.json()

        # Same row, new label — and the item they ticked is still theirs.
        assert body["participant"]["id"] == joined["participant"]["id"]
        assert body["participant"]["display_name"] == "Maya B"
        assert [p["display_name"] for p in body["tab"]["participants"]] == [
            "Vince Woo",
            "Maya B",
        ]
        claimed = next(i for i in body["tab"]["items"] if i["id"] == item_id)
        assert claimed["claimed_by"] == [joined["participant"]["id"]]

    def test_renaming_does_not_hand_out_a_new_claim_token(self, client):
        """The old token is the claimer's only way back, so it keeps working."""
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        token = tab["share_token"]

        joined = self.join(client, tab, "Maya")
        renamed = client.post(
            f"/public/tabs/{token}/rename",
            json={"claim_token": joined["claim_token"], "display_name": "Maya B"},
        ).json()
        assert "claim_token" not in renamed

        still_works = client.post(
            f"/public/tabs/{token}/items/{tab['items'][1]['id']}/claim",
            json={"claim_token": joined["claim_token"], "claimed": True},
        )
        assert still_works.status_code == 200

    def test_rejoining_under_the_same_name_is_refused(self, client):
        """
        The bug this guards: the claim page re-submitted the join form to
        change a name, so an unchanged name seated a duplicate person and the
        first one's claims were stranded.
        """
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        self.join(client, tab, "Maya")

        response = client.post(
            f"/public/tabs/{tab['share_token']}/join",
            json={"display_name": "Maya"},
        )
        assert response.status_code == 409
        assert "already claiming" in response.json()["detail"]

    def test_a_name_is_taken_regardless_of_case_or_padding(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        self.join(client, tab, "Maya")

        for variant in ("maya", "  MAYA  ", "MaYa"):
            response = client.post(
                f"/public/tabs/{tab['share_token']}/join",
                json={"display_name": variant},
            )
            assert response.status_code == 409, variant

    def test_the_hosts_name_is_taken_too(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)

        response = client.post(
            f"/public/tabs/{tab['share_token']}/join",
            json={"display_name": "vince woo"},
        )
        assert response.status_code == 409

    def test_names_are_stored_tidied_up(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)

        joined = self.join(client, tab, "  Maya   B  ")
        assert joined["participant"]["display_name"] == "Maya B"

    def test_a_different_name_still_seats_a_second_person(self, client):
        """Uniqueness must not stop the rest of the table from joining."""
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)

        first = self.join(client, tab, "Maya")
        second = self.join(client, tab, "Maya B")
        assert first["participant"]["id"] != second["participant"]["id"]
        assert len(second["tab"]["participants"]) == 3

    def test_renaming_onto_someone_elses_name_is_refused(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        self.join(client, tab, "Maya")
        joined = self.join(client, tab, "Sam")

        response = client.post(
            f"/public/tabs/{tab['share_token']}/rename",
            json={"claim_token": joined["claim_token"], "display_name": "MAYA"},
        )
        assert response.status_code == 409

    def test_renaming_to_your_own_name_is_a_no_op(self, client):
        """Re-submitting the form unchanged must not read as a collision."""
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        joined = self.join(client, tab, "Maya")

        response = client.post(
            f"/public/tabs/{tab['share_token']}/rename",
            json={"claim_token": joined["claim_token"], "display_name": "Maya"},
        )
        assert response.status_code == 200
        assert len(response.json()["tab"]["participants"]) == 2

    def test_renaming_needs_a_claim_token_for_this_tab(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        first = make_tab(client, headers)
        second = make_tab(client, headers, name="Other Bar")
        joined = self.join(client, first, "Maya")

        unknown = client.post(
            f"/public/tabs/{first['share_token']}/rename",
            json={"claim_token": "made-up", "display_name": "Maya B"},
        )
        assert unknown.status_code == 403

        # A token from another tab must not rename anyone here either.
        wrong_tab = client.post(
            f"/public/tabs/{second['share_token']}/rename",
            json={"claim_token": joined["claim_token"], "display_name": "Maya B"},
        )
        assert wrong_tab.status_code == 403

    def test_a_closed_tab_refuses_renames(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        joined = self.join(client, tab, "Maya")
        client.post(
            f"/public/tabs/{tab['share_token']}/items/{tab['items'][0]['id']}/claim",
            json={"claim_token": joined["claim_token"], "claimed": True},
        )
        assert client.post(f"/tabs/{tab['id']}/close", json={}, headers=headers).status_code == 200

        response = client.post(
            f"/public/tabs/{tab['share_token']}/rename",
            json={"claim_token": joined["claim_token"], "display_name": "Maya B"},
        )
        assert response.status_code == 409

    def test_the_schema_refuses_a_duplicate_name(self, client, db_session):
        """
        The router checks first, but the index is the backstop for two phones
        typing the same name at the same moment.
        """
        from sqlalchemy.exc import IntegrityError

        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        self.join(client, tab, "Maya")

        db_session.add(
            models.TabParticipant(
                tab_id=tab["id"],
                display_name="maya",
                user_id=None,
                claim_token="a-different-token",
            )
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_the_same_name_on_another_tab_is_fine(self, client, db_session):
        """Uniqueness is per tab: every table gets its own Maya."""
        headers = register(client, "vince@example.com", "Vince Woo")
        first = make_tab(client, headers)
        second = make_tab(client, headers, name="Other Bar")

        self.join(client, first, "Maya")
        joined = self.join(client, second, "Maya")
        assert joined["participant"]["display_name"] == "Maya"


class TestManualItems:
    def test_the_owner_can_add_a_line_to_a_live_tab(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)

        response = client.post(
            f"/tabs/{tab['id']}/items",
            json={"description": "Another round", "price": 1800},
            headers=headers,
        )
        assert response.status_code == 200
        items = response.json()["items"]
        assert len(items) == 4
        added = next(i for i in items if i["description"] == "Another round")
        assert added["added_manually"] is True

    def test_a_stranger_cannot_add_a_line(self, client):
        owner = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, owner)
        stranger = register(client, "mallory@example.com", "Mallory")

        response = client.post(
            f"/tabs/{tab['id']}/items",
            json={"description": "Free stuff", "price": 1},
            headers=stranger,
        )
        assert response.status_code == 404

    def test_deleting_a_line_drops_its_claims(self, client, db_session):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        token, item_id = tab["share_token"], tab["items"][0]["id"]

        joined = client.post(
            f"/public/tabs/{token}/join", json={"display_name": "Maya"}
        ).json()
        client.post(
            f"/public/tabs/{token}/items/{item_id}/claim",
            json={"claim_token": joined["claim_token"], "claimed": True},
        )
        assert db_session.query(models.TabItemClaim).count() == 1

        response = client.delete(
            f"/tabs/{tab['id']}/items/{item_id}", headers=headers
        )
        assert response.status_code == 200
        # A stale claim would otherwise be counted at close.
        assert db_session.query(models.TabItemClaim).count() == 0


class TestClosing:
    def test_closing_produces_one_direct_expense_that_balances(self, client, db_session):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        token = tab["share_token"]

        maya = client.post(
            f"/public/tabs/{token}/join", json={"display_name": "Maya"}
        ).json()
        # Maya takes the first line; the rest are unclaimed.
        client.post(
            f"/public/tabs/{token}/items/{tab['items'][0]['id']}/claim",
            json={"claim_token": maya["claim_token"], "claimed": True},
        )

        response = client.post(f"/tabs/{tab['id']}/close", json={}, headers=headers)
        assert response.status_code == 200
        closed = response.json()
        assert closed["status"] == "closed"
        assert closed["expense_id"] is not None

        expense = (
            db_session.query(models.Expense)
            .filter(models.Expense.id == closed["expense_id"])
            .first()
        )
        # The whole point: a tab lands as a direct expense, not a group.
        assert expense.group_id is None
        assert expense.amount == 2800 + 3400 + 3100 + 900 + 1000

        splits = (
            db_session.query(models.ExpenseSplit)
            .filter(models.ExpenseSplit.expense_id == expense.id)
            .all()
        )
        guests = (
            db_session.query(models.ExpenseGuest)
            .filter(models.ExpenseGuest.expense_id == expense.id)
            .all()
        )
        # Vince has an account; Maya does not.
        assert len(splits) == 1
        assert len(guests) == 1
        assert guests[0].name == "Maya"
        # Every cent is accounted for.
        assert sum(s.amount_owed for s in splits) + sum(
            g.amount_owed for g in guests
        ) == expense.amount

    def test_the_link_still_reads_after_closing(self, client):
        """
        Guests are still holding the link open when the host closes. They
        should see the closed tab and their number, not a broken link.
        """
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        client.post(f"/tabs/{tab['id']}/close", json={}, headers=headers)

        response = client.get(f"/public/tabs/{tab['share_token']}")
        assert response.status_code == 200
        assert response.json()["status"] == "closed"

    def test_a_closed_tab_cannot_be_closed_again(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        client.post(f"/tabs/{tab['id']}/close", json={}, headers=headers)

        again = client.post(f"/tabs/{tab['id']}/close", json={}, headers=headers)
        assert again.status_code == 409

    def test_a_closed_tab_refuses_new_claims(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        token = tab["share_token"]
        joined = client.post(
            f"/public/tabs/{token}/join", json={"display_name": "Maya"}
        ).json()

        client.post(f"/tabs/{tab['id']}/close", json={}, headers=headers)

        response = client.post(
            f"/public/tabs/{token}/items/{tab['items'][0]['id']}/claim",
            json={"claim_token": joined["claim_token"], "claimed": True},
        )
        # Readable, but no longer writable.
        assert response.status_code == 409

    def test_a_tab_with_no_items_cannot_close(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers, items=[])
        response = client.post(f"/tabs/{tab['id']}/close", json={}, headers=headers)
        assert response.status_code == 409

    def test_an_anonymous_participant_cannot_be_the_payer(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        maya = client.post(
            f"/public/tabs/{tab['share_token']}/join",
            json={"display_name": "Maya"},
        ).json()

        response = client.post(
            f"/tabs/{tab['id']}/close",
            json={"payer_participant_id": maya["participant"]["id"]},
            headers=headers,
        )
        # Balances need a real account behind the payer.
        assert response.status_code == 400

    def test_a_stranger_cannot_close_your_tab(self, client):
        owner = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, owner)
        stranger = register(client, "mallory@example.com", "Mallory")

        response = client.post(
            f"/tabs/{tab['id']}/close", json={}, headers=stranger
        )
        assert response.status_code == 404


class TestClosedTabIsReachableFromItsExpense:
    """
    A closed tab is listed nowhere, so its expense is the only way back to the
    item-by-item board. The expense carries the tab id to make that trip.
    """

    def test_the_expense_points_back_at_the_tab(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        client.post(
            f"/public/tabs/{tab['share_token']}/join",
            json={"display_name": "Maya"},
        )

        closed = client.post(
            f"/tabs/{tab['id']}/close", json={}, headers=headers
        ).json()

        expense = client.get(
            f"/expenses/{closed['expense_id']}", headers=headers
        ).json()
        assert expense["tab_id"] == tab["id"]

    def test_an_ordinary_expense_has_no_tab(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        me = client.get("/users/me", headers=headers).json()["id"]
        created = client.post(
            "/expenses/",
            json={
                "description": "Coffee",
                "amount": 500,
                "currency": "USD",
                "date": str(datetime.utcnow().date()),
                "payer_id": me,
                "group_id": None,
                "split_type": "EQUAL",
                "splits": [{"user_id": me, "amount_owed": 500, "is_guest": False}],
            },
            headers=headers,
        )
        assert created.status_code == 200, created.text

        detail = client.get(
            f"/expenses/{created.json()['id']}", headers=headers
        ).json()
        assert detail["tab_id"] is None

    def test_the_tab_stays_shut_to_everyone_else(self, client):
        """
        GET /tabs/{id} answers a non-owner with 404 so it never confirms a tab
        exists. The id travels on the expense only for the owner, so nobody
        else is handed a link they cannot follow.
        """
        owner = register(client, "vince@example.com", "Vince Woo")
        mallory = register(client, "mallory@example.com", "Mallory")
        tab = make_tab(client, owner)
        client.post(
            f"/public/tabs/{tab['share_token']}/join",
            json={"display_name": "Maya"},
        )

        closed = client.post(
            f"/tabs/{tab['id']}/close", json={}, headers=owner
        ).json()

        # Not her expense, and not her tab.
        assert (
            client.get(
                f"/expenses/{closed['expense_id']}", headers=mallory
            ).status_code
            == 403
        )
        assert client.get(f"/tabs/{tab['id']}", headers=mallory).status_code == 404


class TestClaimUniqueness:
    def test_the_schema_refuses_a_duplicate_claim(self, client, db_session):
        """
        The router already checks before inserting, but the constraint is the
        backstop for a concurrent double tap that passes both checks.
        """
        from sqlalchemy.exc import IntegrityError

        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        token, item_id = tab["share_token"], tab["items"][0]["id"]

        joined = client.post(
            f"/public/tabs/{token}/join", json={"display_name": "Maya"}
        ).json()
        participant_id = joined["participant"]["id"]

        db_session.add(
            models.TabItemClaim(
                tab_id=tab["id"], item_id=item_id, participant_id=participant_id
            )
        )
        db_session.commit()

        db_session.add(
            models.TabItemClaim(
                tab_id=tab["id"], item_id=item_id, participant_id=participant_id
            )
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()


class TestPublicRateLimiting:
    def test_joining_is_rate_limited(self, client):
        """
        The public join endpoint is unauthenticated and creates rows, so it
        must not be freely hammerable. Other tests disable rate limits via a
        dependency override; this one puts the real limiter back.
        """
        # Take the app from conftest, not `from main import app`:
        # test_cors_security reloads the main module, which leaves a second
        # app object behind. The client fixture is bound to conftest's, so an
        # override popped off the other one would have no effect.
        from conftest import app

        from routers.tabs import tab_join_rate_limiter

        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)

        override = app.dependency_overrides.pop(tab_join_rate_limiter, None)
        # Start from a clean window so earlier tests don't skew the count.
        tab_join_rate_limiter.ip_requests.clear()
        try:
            statuses = [
                client.post(
                    f"/public/tabs/{tab['share_token']}/join",
                    json={"display_name": f"Guest {i}"},
                ).status_code
                for i in range(tab_join_rate_limiter.requests_limit + 3)
            ]
        finally:
            tab_join_rate_limiter.ip_requests.clear()
            if override is not None:
                app.dependency_overrides[tab_join_rate_limiter] = override

        assert 200 in statuses
        assert 429 in statuses
        assert statuses.count(200) <= tab_join_rate_limiter.requests_limit


class TestSelfClaim:
    def test_the_host_can_claim_their_own_items(self, client):
        """
        The host is a participant like anyone else. Their claim token is never
        handed out, so without this route they could not say what they had
        except by opening their own link and joining twice.
        """
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        item_id = tab["items"][0]["id"]
        me = tab["participants"][0]["id"]

        response = client.post(
            f"/tabs/{tab['id']}/items/{item_id}/claim",
            json={"claimed": True},
            headers=headers,
        )
        assert response.status_code == 200
        item = next(i for i in response.json()["items"] if i["id"] == item_id)
        assert item["claimed_by"] == [me]

        released = client.post(
            f"/tabs/{tab['id']}/items/{item_id}/claim",
            json={"claimed": False},
            headers=headers,
        )
        item = next(i for i in released.json()["items"] if i["id"] == item_id)
        assert item["claimed_by"] == []

    def test_claiming_twice_is_idempotent(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        item_id = tab["items"][0]["id"]

        for _ in range(3):
            body = client.post(
                f"/tabs/{tab['id']}/items/{item_id}/claim",
                json={"claimed": True},
                headers=headers,
            ).json()

        item = next(i for i in body["items"] if i["id"] == item_id)
        assert len(item["claimed_by"]) == 1

    def test_someone_not_at_the_table_cannot_claim(self, client):
        owner = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, owner)
        stranger = register(client, "mallory@example.com", "Mallory")

        response = client.post(
            f"/tabs/{tab['id']}/items/{tab['items'][0]['id']}/claim",
            json={"claimed": True},
            headers=stranger,
        )
        # Indistinguishable from a tab that does not exist.
        assert response.status_code == 404

    def test_a_closed_tab_refuses_a_self_claim(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        client.post(f"/tabs/{tab['id']}/close", json={}, headers=headers)

        response = client.post(
            f"/tabs/{tab['id']}/items/{tab['items'][0]['id']}/claim",
            json={"claimed": True},
            headers=headers,
        )
        assert response.status_code == 409


class TestOwnerSetsClaims:
    """
    The desktop board is a grid of every item against every person. Someone at
    the table always leaves early or never opens the link, so the owner has to
    be able to tick on their behalf.
    """

    def join(self, client, tab, name):
        response = client.post(
            f"/public/tabs/{tab['share_token']}/join",
            json={"display_name": name},
        )
        assert response.status_code == 200, response.text
        return response.json()["participant"]["id"]

    def test_the_owner_can_claim_for_someone_else(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        maya = self.join(client, tab, "Maya")
        item_id = tab["items"][0]["id"]

        response = client.post(
            f"/tabs/{tab['id']}/items/{item_id}/claim/{maya}",
            json={"claimed": True},
            headers=headers,
        )
        assert response.status_code == 200
        item = next(i for i in response.json()["items"] if i["id"] == item_id)
        assert item["claimed_by"] == [maya]

    def test_the_owner_can_release_someone_elses_claim(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        maya = self.join(client, tab, "Maya")
        item_id = tab["items"][0]["id"]

        client.post(
            f"/tabs/{tab['id']}/items/{item_id}/claim/{maya}",
            json={"claimed": True},
            headers=headers,
        )
        body = client.post(
            f"/tabs/{tab['id']}/items/{item_id}/claim/{maya}",
            json={"claimed": False},
            headers=headers,
        ).json()

        item = next(i for i in body["items"] if i["id"] == item_id)
        assert item["claimed_by"] == []

    def test_setting_a_claim_twice_is_idempotent(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        maya = self.join(client, tab, "Maya")
        item_id = tab["items"][0]["id"]

        for _ in range(3):
            body = client.post(
                f"/tabs/{tab['id']}/items/{item_id}/claim/{maya}",
                json={"claimed": True},
                headers=headers,
            ).json()

        item = next(i for i in body["items"] if i["id"] == item_id)
        assert item["claimed_by"] == [maya]

    def test_a_participant_cannot_claim_for_another_participant(self, client):
        """
        The route is owner-only. A signed-in participant who is not the owner
        gets the same 404 a stranger would.
        """
        owner = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, owner)
        maya = self.join(client, tab, "Maya")
        other = register(client, "ben@example.com", "Ben Ortiz")

        response = client.post(
            f"/tabs/{tab['id']}/items/{tab['items'][0]['id']}/claim/{maya}",
            json={"claimed": True},
            headers=other,
        )
        assert response.status_code == 404

    def test_a_participant_from_another_tab_is_refused(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        mine = make_tab(client, headers)
        theirs = make_tab(client, headers, name="Mission Bowl")
        outsider = self.join(client, theirs, "Dani")

        response = client.post(
            f"/tabs/{mine['id']}/items/{mine['items'][0]['id']}/claim/{outsider}",
            json={"claimed": True},
            headers=headers,
        )
        assert response.status_code == 404

    def test_a_closed_tab_refuses_owner_claims_too(self, client):
        headers = register(client, "vince@example.com", "Vince Woo")
        tab = make_tab(client, headers)
        maya = self.join(client, tab, "Maya")
        client.post(f"/tabs/{tab['id']}/close", json={}, headers=headers)

        response = client.post(
            f"/tabs/{tab['id']}/items/{tab['items'][0]['id']}/claim/{maya}",
            json={"claimed": True},
            headers=headers,
        )
        assert response.status_code == 409
