"""Tabs: a one-off bill people claim items from via a share link.

Security note. The public endpoints here are the app's first *writable*
unauthenticated surface — Group.share_link_id is a permanent read-only UUID,
whereas a tab's token lets a stranger create a participant and claim money.
So the token is:

  * high-entropy (secrets.token_urlsafe(32)) rather than a UUID,
  * scoped to exactly one tab — it is looked up by token, never combined with
    a caller-supplied tab id,
  * expiring, and revocable independently of expiry,
  * rate-limited on every public route,
  * unable to read anything but its own tab: the public payload omits the
    share token, participant claim tokens, user ids of the creator, and every
    other tab.

Claimers are identified by their own `claim_token`, issued on join. It is the
only thing that lets an anonymous person amend their own claims, so it is
never returned in a listing — only once, to the person who just joined.
"""

import secrets
from datetime import datetime, timedelta
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dependencies import get_current_user
from utils.rate_limiter import RateLimiter
from utils.tabs import compute_tab_shares

router = APIRouter(tags=["tabs"])

# A tab link stays usable for a week past creation — long enough for stragglers
# to claim, short enough that a forwarded link goes stale.
TAB_LINK_LIFETIME = timedelta(days=7)

# Public routes are unauthenticated and writable, so they are limited harder
# than the authenticated surface.
public_tab_rate_limiter = RateLimiter(requests_limit=30, time_window=60)
tab_join_rate_limiter = RateLimiter(requests_limit=10, time_window=60)


def _load_tab_for_owner(db: Session, tab_id: int, user_id: int) -> models.Tab:
    tab = db.query(models.Tab).filter(models.Tab.id == tab_id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")
    if tab.created_by_id != user_id:
        # Same shape as "not found": don't confirm a tab exists to a stranger.
        raise HTTPException(status_code=404, detail="Tab not found")
    return tab


def _load_tab_by_token(db: Session, share_token: str) -> models.Tab:
    """
    Resolve a tab from its token alone.

    The token *is* the identifier here — no caller-supplied tab id is consulted
    — so a token can only ever reach the tab it belongs to.
    """
    tab = (
        db.query(models.Tab)
        .filter(models.Tab.share_token == share_token)
        .first()
    )
    if not tab or tab.revoked:
        raise HTTPException(status_code=404, detail="This link is no longer valid")
    if tab.token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="This link has expired")
    return tab


def _claims_by_item(db: Session, tab_id: int) -> dict:
    claims = (
        db.query(models.TabItemClaim)
        .filter(models.TabItemClaim.tab_id == tab_id)
        .all()
    )
    by_item: dict = {}
    for claim in claims:
        by_item.setdefault(claim.item_id, []).append(claim.participant_id)
    return by_item


def _serialize_items(db: Session, tab_id: int) -> List[schemas.TabItemOut]:
    items = (
        db.query(models.TabItem)
        .filter(models.TabItem.tab_id == tab_id)
        .order_by(models.TabItem.id)
        .all()
    )
    by_item = _claims_by_item(db, tab_id)
    return [
        schemas.TabItemOut(
            id=item.id,
            description=item.description,
            price=item.price,
            added_manually=item.added_manually,
            claimed_by=sorted(by_item.get(item.id, [])),
        )
        for item in items
    ]


def _serialize_participants(db: Session, tab_id: int) -> List[schemas.TabParticipantOut]:
    participants = (
        db.query(models.TabParticipant)
        .filter(models.TabParticipant.tab_id == tab_id)
        .order_by(models.TabParticipant.id)
        .all()
    )
    # Note the absence of claim_token: it never appears in a listing.
    return [
        schemas.TabParticipantOut(
            id=p.id, display_name=p.display_name, user_id=p.user_id
        )
        for p in participants
    ]


def _tab_out(db: Session, tab: models.Tab) -> schemas.TabOut:
    return schemas.TabOut(
        id=tab.id,
        name=tab.name,
        currency=tab.currency,
        status=tab.status,
        tax=tab.tax,
        tip=tab.tip,
        total=tab.total,
        created_by_id=tab.created_by_id,
        payer_id=tab.payer_id,
        expense_id=tab.expense_id,
        items=_serialize_items(db, tab.id),
        participants=_serialize_participants(db, tab.id),
        share_token=tab.share_token,
        token_expires_at=tab.token_expires_at,
    )


def _public_tab_out(db: Session, tab: models.Tab) -> schemas.PublicTabOut:
    return schemas.PublicTabOut(
        name=tab.name,
        currency=tab.currency,
        status=tab.status,
        tax=tab.tax,
        tip=tab.tip,
        total=tab.total,
        items=_serialize_items(db, tab.id),
        participants=_serialize_participants(db, tab.id),
    )


# ---------------------------------------------------------------------------
# Owner surface
# ---------------------------------------------------------------------------


@router.post("/tabs", response_model=schemas.TabOut)
def create_tab(
    payload: schemas.TabCreate,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """Open a tab, usually straight from a scanned receipt."""
    tab = models.Tab(
        name=payload.name,
        created_by_id=current_user.id,
        currency=payload.currency.upper(),
        share_token=secrets.token_urlsafe(32),
        token_expires_at=datetime.utcnow() + TAB_LINK_LIFETIME,
        status="open",
        tax=payload.tax,
        tip=payload.tip,
        total=payload.total,
        receipt_image_path=payload.receipt_image_path,
    )
    db.add(tab)
    db.commit()
    db.refresh(tab)

    for item in payload.items:
        db.add(
            models.TabItem(
                tab_id=tab.id, description=item.description, price=item.price
            )
        )

    # The opener is at the table too, and is the default payer.
    db.add(
        models.TabParticipant(
            tab_id=tab.id,
            display_name=current_user.full_name or "You",
            user_id=current_user.id,
            claim_token=secrets.token_urlsafe(32),
        )
    )
    db.commit()

    return _tab_out(db, tab)


@router.get("/tabs", response_model=List[schemas.TabOut])
def list_tabs(
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    status_filter: Optional[str] = None,
):
    query = db.query(models.Tab).filter(models.Tab.created_by_id == current_user.id)
    if status_filter:
        query = query.filter(models.Tab.status == status_filter)
    tabs = query.order_by(models.Tab.created_at.desc()).all()
    return [_tab_out(db, tab) for tab in tabs]


@router.get("/tabs/{tab_id}", response_model=schemas.TabOut)
def get_tab(
    tab_id: int,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    return _tab_out(db, _load_tab_for_owner(db, tab_id, current_user.id))


@router.post("/tabs/{tab_id}/items", response_model=schemas.TabOut)
def add_tab_item(
    tab_id: int,
    payload: schemas.TabItemCreate,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """Add a line by hand to a live tab — a round the scan never saw."""
    tab = _load_tab_for_owner(db, tab_id, current_user.id)
    if tab.status != "open":
        raise HTTPException(status_code=409, detail="This tab is already closed")

    db.add(
        models.TabItem(
            tab_id=tab.id,
            description=payload.description,
            price=payload.price,
            added_manually=True,
        )
    )
    db.commit()
    return _tab_out(db, tab)


@router.delete("/tabs/{tab_id}/items/{item_id}", response_model=schemas.TabOut)
def delete_tab_item(
    tab_id: int,
    item_id: int,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    tab = _load_tab_for_owner(db, tab_id, current_user.id)
    if tab.status != "open":
        raise HTTPException(status_code=409, detail="This tab is already closed")

    item = (
        db.query(models.TabItem)
        .filter(models.TabItem.id == item_id, models.TabItem.tab_id == tab.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Claims on a deleted line would otherwise linger and be counted.
    db.query(models.TabItemClaim).filter(
        models.TabItemClaim.item_id == item.id
    ).delete()
    db.delete(item)
    db.commit()
    return _tab_out(db, tab)


@router.post("/tabs/{tab_id}/items/{item_id}/claim", response_model=schemas.TabOut)
def claim_own_tab_item(
    tab_id: int,
    item_id: int,
    payload: schemas.TabSelfClaimRequest,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """
    Claim a line as a signed-in participant.

    The host is a participant like anyone else and has to be able to say what
    they had. They cannot use the public claim route — that needs a claim
    token, and theirs is never handed out — so identity comes from the session
    instead. Open to any signed-in participant, not just the owner.
    """
    tab = db.query(models.Tab).filter(models.Tab.id == tab_id).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Tab not found")

    participant = (
        db.query(models.TabParticipant)
        .filter(
            models.TabParticipant.tab_id == tab.id,
            models.TabParticipant.user_id == current_user.id,
        )
        .first()
    )
    if not participant:
        # Not at this table; same shape as a missing tab.
        raise HTTPException(status_code=404, detail="Tab not found")

    if tab.status != "open":
        raise HTTPException(status_code=409, detail="This tab is already closed")

    item = (
        db.query(models.TabItem)
        .filter(models.TabItem.id == item_id, models.TabItem.tab_id == tab.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    existing = (
        db.query(models.TabItemClaim)
        .filter(
            models.TabItemClaim.item_id == item.id,
            models.TabItemClaim.participant_id == participant.id,
        )
        .first()
    )

    if payload.claimed and not existing:
        db.add(
            models.TabItemClaim(
                tab_id=tab.id, item_id=item.id, participant_id=participant.id
            )
        )
        db.commit()
    elif not payload.claimed and existing:
        db.delete(existing)
        db.commit()

    return _tab_out(db, tab)


@router.post("/tabs/{tab_id}/revoke", response_model=schemas.TabOut)
def revoke_tab_link(
    tab_id: int,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """Kill the share link without closing the tab."""
    tab = _load_tab_for_owner(db, tab_id, current_user.id)
    tab.revoked = True
    db.commit()
    db.refresh(tab)
    return _tab_out(db, tab)


@router.post("/tabs/{tab_id}/close", response_model=schemas.TabOut)
def close_tab(
    tab_id: int,
    payload: schemas.TabCloseRequest,
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """
    Resolve the tab into one ordinary direct expense.

    Everything lands on the existing group_id NULL path: registered
    participants become expense splits, anonymous ones become expense guests.
    Nothing about a tab appears under Groups.
    """
    tab = _load_tab_for_owner(db, tab_id, current_user.id)
    if tab.status == "closed":
        raise HTTPException(status_code=409, detail="This tab is already closed")

    participants = (
        db.query(models.TabParticipant)
        .filter(models.TabParticipant.tab_id == tab.id)
        .order_by(models.TabParticipant.id)
        .all()
    )
    if not participants:
        raise HTTPException(
            status_code=409, detail="Nobody has joined this tab yet"
        )

    items = (
        db.query(models.TabItem)
        .filter(models.TabItem.tab_id == tab.id)
        .order_by(models.TabItem.id)
        .all()
    )
    if not items:
        raise HTTPException(status_code=409, detail="This tab has no items")

    # Who fronted the bill. Defaults to the tab's creator.
    payer = None
    if payload.payer_participant_id is not None:
        payer = next(
            (p for p in participants if p.id == payload.payer_participant_id), None
        )
        if not payer:
            raise HTTPException(status_code=400, detail="Unknown payer")
        if payer.user_id is None:
            # An expense must be paid by a real account for balances to work.
            raise HTTPException(
                status_code=400,
                detail="The payer must be a registered user",
            )
    else:
        payer = next(
            (p for p in participants if p.user_id == tab.created_by_id), None
        )
    if payer is None or payer.user_id is None:
        raise HTTPException(
            status_code=400, detail="This tab has no registered payer"
        )

    shares = compute_tab_shares(
        [(item.id, item.price) for item in items],
        _claims_by_item(db, tab.id),
        [p.id for p in participants],
        tax=tab.tax,
        tip=tab.tip,
    )
    amount = sum(shares.values())

    expense = models.Expense(
        description=tab.name,
        amount=amount,
        currency=tab.currency,
        date=payload.date or datetime.utcnow().date().isoformat(),
        payer_id=payer.user_id,
        payer_is_guest=False,
        group_id=None,  # A tab never becomes a group.
        created_by_id=current_user.id,
        split_type="ITEMIZED",
        receipt_image_path=tab.receipt_image_path,
        icon="🧾",
        notes=f"Closed from a tab at {tab.name}",
        is_settlement=False,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)

    for participant in participants:
        owed = shares.get(participant.id, 0)
        if participant.user_id is not None:
            db.add(
                models.ExpenseSplit(
                    expense_id=expense.id,
                    user_id=participant.user_id,
                    is_guest=False,
                    amount_owed=owed,
                )
            )
        else:
            # Anonymous claimers land as expense guests, the same records a
            # direct expense with guests already uses.
            db.add(
                models.ExpenseGuest(
                    expense_id=expense.id,
                    name=participant.display_name,
                    amount_owed=owed,
                    created_by_id=current_user.id,
                )
            )

    tab.status = "closed"
    tab.closed_at = datetime.utcnow()
    tab.payer_id = payer.user_id
    tab.expense_id = expense.id
    # The link is deliberately NOT revoked here. People are still holding it
    # open on their phones when the host closes, and a revoked link would show
    # them an error instead of what they ended up owing. Writes are already
    # refused once status is "closed", and the token still expires on its own.
    # Revoking stays a separate, explicit action.
    db.commit()
    db.refresh(tab)

    return _tab_out(db, tab)


# ---------------------------------------------------------------------------
# Public surface — unauthenticated, token-scoped, rate-limited
# ---------------------------------------------------------------------------


@router.get(
    "/public/tabs/{share_token}",
    response_model=schemas.PublicTabOut,
    dependencies=[Depends(public_tab_rate_limiter)],
)
def read_public_tab(share_token: str, db: Session = Depends(get_db)):
    return _public_tab_out(db, _load_tab_by_token(db, share_token))


@router.post(
    "/public/tabs/{share_token}/join",
    response_model=schemas.TabJoinResponse,
    dependencies=[Depends(tab_join_rate_limiter)],
)
def join_public_tab(
    share_token: str,
    payload: schemas.TabJoinRequest,
    db: Session = Depends(get_db),
):
    """
    Join with a first name and nothing else.

    Returns a claim token that identifies this person on later requests. There
    is no account, so that token is the only handle they have on their claims.
    """
    tab = _load_tab_by_token(db, share_token)
    if tab.status != "open":
        raise HTTPException(status_code=409, detail="This tab is closed")

    name = payload.display_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Please give a name")

    participant = models.TabParticipant(
        tab_id=tab.id,
        display_name=name,
        user_id=None,
        claim_token=secrets.token_urlsafe(32),
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)

    return schemas.TabJoinResponse(
        participant=schemas.TabParticipantOut(
            id=participant.id,
            display_name=participant.display_name,
            user_id=None,
        ),
        claim_token=participant.claim_token,
        tab=_public_tab_out(db, tab),
    )


@router.post(
    "/public/tabs/{share_token}/items/{item_id}/claim",
    response_model=schemas.PublicTabOut,
    dependencies=[Depends(public_tab_rate_limiter)],
)
def claim_public_tab_item(
    share_token: str,
    item_id: int,
    payload: schemas.TabClaimRequest,
    db: Session = Depends(get_db),
):
    """
    Claim or release one line.

    Several people on the same line is sharing, not a conflict — the line
    splits between them at close. Claiming twice is idempotent.
    """
    tab = _load_tab_by_token(db, share_token)
    if tab.status != "open":
        raise HTTPException(status_code=409, detail="This tab is closed")

    participant = (
        db.query(models.TabParticipant)
        .filter(
            models.TabParticipant.claim_token == payload.claim_token,
            # Scope the claim token to this tab: a token from another tab must
            # not be usable here.
            models.TabParticipant.tab_id == tab.id,
        )
        .first()
    )
    if not participant:
        raise HTTPException(status_code=403, detail="Join the tab first")

    item = (
        db.query(models.TabItem)
        .filter(models.TabItem.id == item_id, models.TabItem.tab_id == tab.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    existing = (
        db.query(models.TabItemClaim)
        .filter(
            models.TabItemClaim.item_id == item.id,
            models.TabItemClaim.participant_id == participant.id,
        )
        .first()
    )

    if payload.claimed and not existing:
        db.add(
            models.TabItemClaim(
                tab_id=tab.id, item_id=item.id, participant_id=participant.id
            )
        )
        db.commit()
    elif not payload.claimed and existing:
        db.delete(existing)
        db.commit()

    return _public_tab_out(db, tab)
