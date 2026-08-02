"""Share computation for closing a tab.

Kept free of SQLAlchemy so the arithmetic can be tested on plain data. The
inputs mirror the tab tables; the output is what each participant ends up
owing, in cents, summing exactly to the bill.
"""

from typing import Dict, Iterable, List, Tuple


def split_evenly(amount: int, n: int) -> List[int]:
    """
    Split `amount` cents into `n` parts that sum exactly to it.

    The remainder goes one cent at a time to the earliest parts, so a 3-way
    split of 100 is [34, 33, 33] rather than [33, 33, 33] losing a cent.
    """
    if n <= 0:
        return []
    base, remainder = divmod(amount, n)
    return [base + (1 if i < remainder else 0) for i in range(n)]


def compute_item_shares(
    items: Iterable[Tuple[int, int]],
    claims: Dict[int, List[int]],
    participant_ids: List[int],
) -> Dict[int, int]:
    """
    Work out each participant's share of the items.

    `items` is (item_id, price_cents). `claims` maps item_id to the
    participants who claimed it. An item nobody claimed is an orphan and is
    spread across everyone — closing a tab must not silently drop money.

    Returns participant_id -> cents. Always sums to the item total.
    """
    shares = {pid: 0 for pid in participant_ids}
    if not participant_ids:
        return shares

    for item_id, price in items:
        claimers = [
            pid for pid in claims.get(item_id, []) if pid in shares
        ]
        # Orphans fall to the whole table rather than to the payer alone.
        recipients = claimers if claimers else participant_ids

        for pid, part in zip(recipients, split_evenly(price, len(recipients))):
            shares[pid] += part

    return shares


def distribute_proportionally(
    amount: int, weights: Dict[int, int]
) -> Dict[int, int]:
    """
    Spread `amount` cents across participants in proportion to `weights`,
    summing exactly to `amount`.

    Used for tax and tip: someone who ordered more of the food carries more of
    them. With no weight anywhere (every item orphaned to a zero total, or a
    zero-priced bill) it falls back to an even split so the money still lands.
    """
    participant_ids = list(weights.keys())
    if not participant_ids or amount == 0:
        return {pid: 0 for pid in participant_ids}

    total_weight = sum(weights.values())
    if total_weight <= 0:
        return dict(zip(participant_ids, split_evenly(amount, len(participant_ids))))

    # Floor each share, then hand out the remaining cents to the largest
    # fractional parts, so the result sums exactly and favours bigger orders.
    exact = {pid: amount * w / total_weight for pid, w in weights.items()}
    floored = {pid: int(value) for pid, value in exact.items()}
    remainder = amount - sum(floored.values())

    by_fraction = sorted(
        participant_ids,
        key=lambda pid: (exact[pid] - floored[pid], weights[pid], -pid),
        reverse=True,
    )
    for pid in by_fraction[:remainder]:
        floored[pid] += 1

    return floored


def compute_tab_shares(
    items: Iterable[Tuple[int, int]],
    claims: Dict[int, List[int]],
    participant_ids: List[int],
    tax: int = 0,
    tip: int = 0,
) -> Dict[int, int]:
    """
    What each participant owes for the whole tab: their items plus their
    proportional share of tax and tip.

    The returned values sum exactly to items + tax + tip.
    """
    item_shares = compute_item_shares(items, claims, participant_ids)
    extras = distribute_proportionally((tax or 0) + (tip or 0), item_shares)
    return {pid: item_shares[pid] + extras[pid] for pid in item_shares}
