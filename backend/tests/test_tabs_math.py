"""Arithmetic for closing a tab, tested on plain data."""

from utils.tabs import (
    compute_item_shares,
    compute_tab_shares,
    distribute_proportionally,
    split_evenly,
)


class TestSplitEvenly:
    def test_exact_division(self):
        assert split_evenly(900, 3) == [300, 300, 300]

    def test_remainder_goes_to_the_earliest_parts(self):
        # Never loses a cent to rounding.
        assert split_evenly(100, 3) == [34, 33, 33]
        assert sum(split_evenly(100, 3)) == 100

    def test_single_and_empty(self):
        assert split_evenly(500, 1) == [500]
        assert split_evenly(500, 0) == []

    def test_zero_amount(self):
        assert split_evenly(0, 3) == [0, 0, 0]


class TestComputeItemShares:
    def test_each_claimer_pays_for_what_they_claimed(self):
        items = [(1, 2800), (2, 3400)]
        claims = {1: [10], 2: [20]}
        shares = compute_item_shares(items, claims, [10, 20])
        assert shares == {10: 2800, 20: 3400}

    def test_a_shared_item_splits_between_its_claimers(self):
        items = [(1, 2800)]
        claims = {1: [10, 20]}
        shares = compute_item_shares(items, claims, [10, 20])
        assert shares == {10: 1400, 20: 1400}

    def test_an_unclaimed_item_falls_to_the_whole_table(self):
        # Closing must not drop money on the floor.
        items = [(1, 900)]
        shares = compute_item_shares(items, {}, [10, 20, 30])
        assert shares == {10: 300, 20: 300, 30: 300}

    def test_shares_always_sum_to_the_item_total(self):
        items = [(1, 2800), (2, 3401), (3, 999)]
        claims = {1: [10, 20], 2: [30], 3: [10, 20, 30]}
        shares = compute_item_shares(items, claims, [10, 20, 30])
        assert sum(shares.values()) == 2800 + 3401 + 999

    def test_claims_from_someone_no_longer_present_are_ignored(self):
        # A participant removed after claiming must not silently absorb a line.
        items = [(1, 1000)]
        claims = {1: [99]}
        shares = compute_item_shares(items, claims, [10, 20])
        # Falls back to the orphan path across the real participants.
        assert shares == {10: 500, 20: 500}

    def test_no_participants(self):
        assert compute_item_shares([(1, 100)], {}, []) == {}


class TestDistributeProportionally:
    def test_splits_in_proportion_to_weight(self):
        result = distribute_proportionally(1000, {10: 3000, 20: 1000})
        assert result == {10: 750, 20: 250}
        assert sum(result.values()) == 1000

    def test_always_sums_exactly(self):
        # 100 across three equal weights cannot divide evenly.
        result = distribute_proportionally(100, {10: 100, 20: 100, 30: 100})
        assert sum(result.values()) == 100

    def test_zero_weights_fall_back_to_an_even_split(self):
        result = distribute_proportionally(90, {10: 0, 20: 0, 30: 0})
        assert sum(result.values()) == 90
        assert result == {10: 30, 20: 30, 30: 30}

    def test_zero_amount(self):
        assert distribute_proportionally(0, {10: 500}) == {10: 0}

    def test_no_participants(self):
        assert distribute_proportionally(100, {}) == {}


class TestComputeTabShares:
    def test_tax_and_tip_follow_what_each_person_ordered(self):
        # 30.00 and 10.00 of food, 8.00 of tax+tip -> 6.00 / 2.00.
        items = [(1, 3000), (2, 1000)]
        claims = {1: [10], 2: [20]}
        shares = compute_tab_shares(items, claims, [10, 20], tax=400, tip=400)
        assert shares == {10: 3600, 20: 1200}

    def test_total_is_conserved(self):
        items = [(1, 2800), (2, 3400), (3, 3100), (4, 1200)]
        claims = {1: [10, 20], 2: [20], 3: [30], 4: []}
        shares = compute_tab_shares(items, claims, [10, 20, 30], tax=1449, tip=3686)
        expected = 2800 + 3400 + 3100 + 1200 + 1449 + 3686
        assert sum(shares.values()) == expected

    def test_the_worked_example_from_the_design(self):
        # Bar Sol: 161.00 of items, 14.49 tax, 36.86 tip, 212.35 total.
        items = [
            (1, 2800), (2, 3400), (3, 3100), (4, 1200),
            (5, 1800), (6, 1600), (7, 900), (8, 1300),
        ]
        # Four people, everything claimed by exactly one of them.
        claims = {1: [10], 2: [20], 3: [30], 4: [40],
                  5: [10], 6: [20], 7: [30], 8: [40]}
        shares = compute_tab_shares(items, claims, [10, 20, 30, 40],
                                    tax=1449, tip=3686)
        assert sum(shares.values()) == 21235

    def test_a_tab_nobody_claimed_still_balances(self):
        items = [(1, 1000), (2, 500)]
        shares = compute_tab_shares(items, {}, [10, 20], tax=100, tip=50)
        assert sum(shares.values()) == 1650

    def test_no_tax_or_tip(self):
        items = [(1, 1000)]
        shares = compute_tab_shares(items, {1: [10]}, [10])
        assert shares == {10: 1000}
