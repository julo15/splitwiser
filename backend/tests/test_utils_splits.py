"""Unit tests for utils.splits — the itemized split calculation engine.

These are pure-function tests: no database, no HTTP client. They pin down the
cent-level arithmetic (integer division, remainder placement, proportional
tax/tip distribution) that the expense endpoints trust to be correct.
"""

import pytest

import schemas
from utils.splits import (
    calculate_itemized_splits,
    calculate_itemized_splits_with_expense_guests,
    get_assignment_key,
)

# --- helpers ---------------------------------------------------------------

def user(user_id: int) -> schemas.ItemAssignment:
    return schemas.ItemAssignment(user_id=user_id, is_guest=False)


def guest(guest_id: int) -> schemas.ItemAssignment:
    return schemas.ItemAssignment(user_id=guest_id, is_guest=True)


def temp_guest(temp_id: str) -> schemas.ItemAssignment:
    return schemas.ItemAssignment(temp_guest_id=temp_id)


def existing_expense_guest(expense_guest_id: int) -> schemas.ItemAssignment:
    return schemas.ItemAssignment(expense_guest_id=expense_guest_id)


def item(price, assignments, *, is_tax_tip=False, split_type="EQUAL", split_details=None):
    return schemas.ExpenseItemCreate(
        description="Item",
        price=price,
        is_tax_tip=is_tax_tip,
        assignments=assignments,
        split_type=split_type,
        split_details=split_details,
    )


def as_map(splits):
    """Collapse a list of ExpenseSplitBase into {(user_id, is_guest): amount}."""
    return {(s.user_id, s.is_guest): s.amount_owed for s in splits}


# --- get_assignment_key ----------------------------------------------------

class TestGetAssignmentKey:
    def test_registered_user(self):
        assert get_assignment_key(user(7)) == "user_7"

    def test_group_guest(self):
        assert get_assignment_key(guest(7)) == "guest_7"

    def test_temp_guest_id(self):
        assert get_assignment_key(temp_guest("abc")) == "expense_guest_abc"

    def test_existing_expense_guest_id(self):
        assert get_assignment_key(existing_expense_guest(3)) == "expense_guest_3"

    def test_temp_guest_id_wins_over_expense_guest_id(self):
        assignment = schemas.ItemAssignment(temp_guest_id="tmp", expense_guest_id=9)
        assert get_assignment_key(assignment) == "expense_guest_tmp"

    def test_expense_guest_id_wins_over_user_id(self):
        assignment = schemas.ItemAssignment(user_id=4, expense_guest_id=9)
        assert get_assignment_key(assignment) == "expense_guest_9"


# --- calculate_itemized_splits: EQUAL --------------------------------------

class TestEqualSplit:
    def test_even_division(self):
        splits = calculate_itemized_splits([item(1000, [user(1), user(2)])])
        assert as_map(splits) == {(1, False): 500, (2, False): 500}

    def test_uneven_division_remainder_to_leading_assignees(self):
        # $10.00 three ways -> 334 / 333 / 333, never losing a cent.
        splits = calculate_itemized_splits([item(1000, [user(1), user(2), user(3)])])
        amounts = as_map(splits)
        assert amounts == {(1, False): 334, (2, False): 333, (3, False): 333}
        assert sum(amounts.values()) == 1000

    def test_two_cent_remainder_spread_over_first_two(self):
        # 1001 / 3 = 333 r2 -> first two assignees get the extra cents.
        splits = calculate_itemized_splits([item(1001, [user(1), user(2), user(3)])])
        assert as_map(splits) == {(1, False): 334, (2, False): 334, (3, False): 333}

    def test_single_assignee_gets_whole_price(self):
        splits = calculate_itemized_splits([item(1999, [user(1)])])
        assert as_map(splits) == {(1, False): 1999}

    def test_guest_assignee_marked_as_guest(self):
        splits = calculate_itemized_splits([item(1000, [user(1), guest(2)])])
        assert as_map(splits) == {(1, False): 500, (2, True): 500}

    def test_user_and_guest_with_same_id_are_distinct_people(self):
        splits = calculate_itemized_splits([item(1000, [user(1), guest(1)])])
        assert as_map(splits) == {(1, False): 500, (1, True): 500}

    def test_multiple_items_accumulate_per_person(self):
        splits = calculate_itemized_splits([
            item(1000, [user(1), user(2)]),
            item(500, [user(1)]),
        ])
        assert as_map(splits) == {(1, False): 1000, (2, False): 500}

    def test_unassigned_item_is_skipped(self):
        splits = calculate_itemized_splits([
            item(1000, [user(1)]),
            item(9999, []),  # nobody claimed this
        ])
        assert as_map(splits) == {(1, False): 1000}

    def test_no_items_yields_no_splits(self):
        assert calculate_itemized_splits([]) == []


# --- calculate_itemized_splits: EXACT --------------------------------------

class TestExactSplit:
    def test_uses_specified_amounts(self):
        splits = calculate_itemized_splits([
            item(
                1000,
                [user(1), user(2)],
                split_type="EXACT",
                split_details={
                    "user_1": schemas.ItemSplitDetail(amount=700),
                    "user_2": schemas.ItemSplitDetail(amount=300),
                },
            )
        ])
        assert as_map(splits) == {(1, False): 700, (2, False): 300}

    def test_missing_detail_defaults_to_zero(self):
        splits = calculate_itemized_splits([
            item(
                1000,
                [user(1), user(2)],
                split_type="EXACT",
                split_details={"user_1": schemas.ItemSplitDetail(amount=1000)},
            )
        ])
        assert as_map(splits) == {(1, False): 1000, (2, False): 0}

    def test_single_assignee_ignores_exact_details(self):
        # A lone assignee always takes the full price regardless of split_type.
        splits = calculate_itemized_splits([
            item(
                1000,
                [user(1)],
                split_type="EXACT",
                split_details={"user_1": schemas.ItemSplitDetail(amount=1)},
            )
        ])
        assert as_map(splits) == {(1, False): 1000}


# --- calculate_itemized_splits: PERCENT ------------------------------------

class TestPercentSplit:
    def test_simple_percentages(self):
        splits = calculate_itemized_splits([
            item(
                1000,
                [user(1), user(2)],
                split_type="PERCENT",
                split_details={
                    "user_1": schemas.ItemSplitDetail(percentage=60),
                    "user_2": schemas.ItemSplitDetail(percentage=40),
                },
            )
        ])
        assert as_map(splits) == {(1, False): 600, (2, False): 400}

    def test_last_assignee_absorbs_rounding_remainder(self):
        # 33.33% of 1000 truncates to 333 twice; the last person takes 334.
        splits = calculate_itemized_splits([
            item(
                1000,
                [user(1), user(2), user(3)],
                split_type="PERCENT",
                split_details={
                    "user_1": schemas.ItemSplitDetail(percentage=33.33),
                    "user_2": schemas.ItemSplitDetail(percentage=33.33),
                    "user_3": schemas.ItemSplitDetail(percentage=33.34),
                },
            )
        ])
        amounts = as_map(splits)
        assert amounts == {(1, False): 333, (2, False): 333, (3, False): 334}
        assert sum(amounts.values()) == 1000

    def test_remainder_goes_to_last_key_in_sort_order_not_input_order(self):
        # Assignments are sorted by key, so "user_2" is last even though it was
        # supplied first.
        splits = calculate_itemized_splits([
            item(
                1000,
                [user(2), user(1)],
                split_type="PERCENT",
                split_details={
                    "user_1": schemas.ItemSplitDetail(percentage=33.33),
                    "user_2": schemas.ItemSplitDetail(percentage=66.67),
                },
            )
        ])
        amounts = as_map(splits)
        assert amounts[(1, False)] == 333
        assert amounts[(2, False)] == 667
        assert sum(amounts.values()) == 1000

    def test_guests_sort_before_users(self):
        # "guest_9" < "user_1" lexicographically, so the user absorbs remainder.
        splits = calculate_itemized_splits([
            item(
                1000,
                [user(1), guest(9)],
                split_type="PERCENT",
                split_details={
                    "guest_9": schemas.ItemSplitDetail(percentage=50),
                    "user_1": schemas.ItemSplitDetail(percentage=50),
                },
            )
        ])
        assert as_map(splits) == {(9, True): 500, (1, False): 500}


# --- calculate_itemized_splits: SHARES -------------------------------------

class TestSharesSplit:
    def test_equal_shares(self):
        splits = calculate_itemized_splits([
            item(
                1000,
                [user(1), user(2)],
                split_type="SHARES",
                split_details={
                    "user_1": schemas.ItemSplitDetail(shares=1),
                    "user_2": schemas.ItemSplitDetail(shares=1),
                },
            )
        ])
        assert as_map(splits) == {(1, False): 500, (2, False): 500}

    def test_unequal_shares(self):
        splits = calculate_itemized_splits([
            item(
                1000,
                [user(1), user(2)],
                split_type="SHARES",
                split_details={
                    "user_1": schemas.ItemSplitDetail(shares=3),
                    "user_2": schemas.ItemSplitDetail(shares=1),
                },
            )
        ])
        assert as_map(splits) == {(1, False): 750, (2, False): 250}

    def test_missing_detail_defaults_to_one_share(self):
        splits = calculate_itemized_splits([
            item(
                900,
                [user(1), user(2), user(3)],
                split_type="SHARES",
                split_details={"user_1": schemas.ItemSplitDetail(shares=1)},
            )
        ])
        amounts = as_map(splits)
        assert sum(amounts.values()) == 900
        assert amounts[(1, False)] == 300

    def test_last_assignee_absorbs_remainder(self):
        splits = calculate_itemized_splits([
            item(
                1000,
                [user(1), user(2), user(3)],
                split_type="SHARES",
                split_details={
                    "user_1": schemas.ItemSplitDetail(shares=1),
                    "user_2": schemas.ItemSplitDetail(shares=1),
                    "user_3": schemas.ItemSplitDetail(shares=1),
                },
            )
        ])
        amounts = as_map(splits)
        assert amounts == {(1, False): 333, (2, False): 333, (3, False): 334}
        assert sum(amounts.values()) == 1000


# --- tax / tip distribution ------------------------------------------------

class TestTaxTipDistribution:
    def test_distributed_proportionally_to_subtotals(self):
        # user_1 consumed 750, user_2 consumed 250 of a 1000 subtotal.
        # A 100 tax should land 75 / 25.
        splits = calculate_itemized_splits([
            item(750, [user(1)]),
            item(250, [user(2)]),
            item(100, [], is_tax_tip=True),
        ])
        amounts = as_map(splits)
        assert amounts == {(1, False): 825, (2, False): 275}
        assert sum(amounts.values()) == 1100

    def test_last_person_absorbs_tax_rounding(self):
        splits = calculate_itemized_splits([
            item(1000, [user(1), user(2), user(3)]),
            item(150, [], is_tax_tip=True),
        ])
        amounts = as_map(splits)
        # Subtotals 334/333/333; tax shares 50/49 then the remainder 51.
        assert amounts == {(1, False): 384, (2, False): 382, (3, False): 384}
        assert sum(amounts.values()) == 1150

    def test_multiple_tax_tip_items_are_pooled(self):
        splits = calculate_itemized_splits([
            item(1000, [user(1), user(2)]),
            item(80, [], is_tax_tip=True),
            item(120, [], is_tax_tip=True),
        ])
        amounts = as_map(splits)
        assert sum(amounts.values()) == 1200
        assert amounts == {(1, False): 600, (2, False): 600}

    def test_tax_tip_assignments_are_ignored(self):
        # A tax/tip item is pooled by price; its own assignments never create
        # a participant.
        splits = calculate_itemized_splits([
            item(1000, [user(1)]),
            item(100, [user(2)], is_tax_tip=True),
        ])
        assert as_map(splits) == {(1, False): 1100}

    def test_tax_tip_only_expense_produces_no_splits(self):
        # With no regular items there is no subtotal to distribute against.
        splits = calculate_itemized_splits([item(100, [], is_tax_tip=True)])
        assert splits == []

    def test_zero_tax_tip_leaves_subtotals_untouched(self):
        splits = calculate_itemized_splits([
            item(1000, [user(1), user(2)]),
            item(0, [], is_tax_tip=True),
        ])
        assert as_map(splits) == {(1, False): 500, (2, False): 500}


# --- expense-guest variant -------------------------------------------------

class TestCalculateItemizedSplitsWithExpenseGuests:
    def test_separates_expense_guests_from_registered_participants(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(1000, [user(1), temp_guest("tmp-1")])
        ])
        assert as_map(splits) == {(1, False): 500}
        assert guest_amounts == {"tmp-1": 500}

    def test_group_guests_stay_in_splits(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(900, [user(1), guest(2), temp_guest("tmp-1")])
        ])
        assert as_map(splits) == {(1, False): 300, (2, True): 300}
        assert guest_amounts == {"tmp-1": 300}

    def test_existing_expense_guest_id_is_keyed_by_id(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(1000, [user(1), existing_expense_guest(42)])
        ])
        assert as_map(splits) == {(1, False): 500}
        assert guest_amounts == {"42": 500}

    def test_tax_tip_distributed_across_expense_guests_too(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(750, [user(1)]),
            item(250, [temp_guest("tmp-1")]),
            item(100, [], is_tax_tip=True),
        ])
        total = sum(as_map(splits).values()) + sum(guest_amounts.values())
        assert total == 1100
        # 250 consumed + a 25 proportional share of the 100 tax.
        assert guest_amounts["tmp-1"] == 275
        assert as_map(splits) == {(1, False): 825}

    def test_expense_guest_only_expense(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(1000, [temp_guest("a"), temp_guest("b")])
        ])
        assert splits == []
        assert guest_amounts == {"a": 500, "b": 500}

    def test_shares_split_with_expense_guest(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(
                1000,
                [user(1), temp_guest("tmp-1")],
                split_type="SHARES",
                split_details={
                    "user_1": schemas.ItemSplitDetail(shares=1),
                    "expense_guest_tmp-1": schemas.ItemSplitDetail(shares=3),
                },
            )
        ])
        # "expense_guest_tmp-1" sorts before "user_1", so the user is last and
        # absorbs the remainder.
        assert guest_amounts == {"tmp-1": 750}
        assert as_map(splits) == {(1, False): 250}

    def test_exact_split_with_expense_guest(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(
                1000,
                [user(1), temp_guest("tmp-1")],
                split_type="EXACT",
                split_details={
                    "user_1": schemas.ItemSplitDetail(amount=700),
                    "expense_guest_tmp-1": schemas.ItemSplitDetail(amount=300),
                },
            )
        ])
        assert as_map(splits) == {(1, False): 700}
        assert guest_amounts == {"tmp-1": 300}

    def test_exact_split_missing_detail_defaults_to_zero(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(
                1000,
                [user(1), temp_guest("tmp-1")],
                split_type="EXACT",
                split_details={"user_1": schemas.ItemSplitDetail(amount=1000)},
            )
        ])
        assert as_map(splits) == {(1, False): 1000}
        assert guest_amounts == {"tmp-1": 0}

    def test_percent_split_with_expense_guest(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(
                1000,
                [user(1), temp_guest("tmp-1")],
                split_type="PERCENT",
                split_details={
                    "user_1": schemas.ItemSplitDetail(percentage=40),
                    "expense_guest_tmp-1": schemas.ItemSplitDetail(percentage=60),
                },
            )
        ])
        # "expense_guest_tmp-1" sorts first, so the user absorbs the remainder.
        assert guest_amounts == {"tmp-1": 600}
        assert as_map(splits) == {(1, False): 400}

    def test_percent_split_missing_detail_defaults_to_zero(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(
                1000,
                [user(1), temp_guest("tmp-1")],
                split_type="PERCENT",
                split_details={"user_1": schemas.ItemSplitDetail(percentage=100)},
            )
        ])
        assert guest_amounts == {"tmp-1": 0}
        assert as_map(splits) == {(1, False): 1000}

    def test_shares_split_missing_detail_defaults_to_one(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(
                900,
                [user(1), temp_guest("a"), temp_guest("b")],
                split_type="SHARES",
                split_details={"user_1": schemas.ItemSplitDetail(shares=1)},
            )
        ])
        total = sum(as_map(splits).values()) + sum(guest_amounts.values())
        assert total == 900

    def test_single_assignee_expense_guest_takes_the_whole_price(self):
        _, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(
                1999,
                [temp_guest("tmp-1")],
                split_type="EXACT",
                split_details={"expense_guest_tmp-1": schemas.ItemSplitDetail(amount=1)},
            )
        ])
        assert guest_amounts == {"tmp-1": 1999}

    def test_unassigned_item_is_skipped(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([
            item(1000, [temp_guest("tmp-1")]),
            item(9999, []),
        ])
        assert guest_amounts == {"tmp-1": 1000}
        assert splits == []

    def test_no_items_yields_empty_results(self):
        splits, guest_amounts = calculate_itemized_splits_with_expense_guests([])
        assert splits == []
        assert guest_amounts == {}


# --- invariants across split types ----------------------------------------

@pytest.mark.parametrize("price", [1, 7, 99, 100, 333, 1000, 1001, 99999])
@pytest.mark.parametrize("num_people", [1, 2, 3, 4, 7])
def test_equal_split_never_loses_or_invents_cents(price, num_people):
    assignments = [user(i) for i in range(1, num_people + 1)]
    splits = calculate_itemized_splits([item(price, assignments)])
    assert sum(s.amount_owed for s in splits) == price


@pytest.mark.parametrize("subtotal,tax", [(1000, 150), (999, 1), (100, 100), (7, 3)])
def test_tax_tip_distribution_conserves_the_total(subtotal, tax):
    splits = calculate_itemized_splits([
        item(subtotal, [user(1), user(2), user(3)]),
        item(tax, [], is_tax_tip=True),
    ])
    assert sum(s.amount_owed for s in splits) == subtotal + tax
