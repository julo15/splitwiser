# Tabs

A tab is a one-off bill that people claim their own items from, using a link.
Nobody has to be invited, nobody has to have an account, and no group is
created.

The flow it replaces: one person scans a receipt, then taps through forty
checkboxes on everyone else's behalf while the table reads out what they had.
With a tab, the host scans once and sends a link; everyone else opens it, types
a first name, and ticks their own lines. Closing the tab turns it into one
ordinary expense.

**A tab is never a group.** It has no members, no permanent home, and it does
not appear under Groups. It shows up in Activity and in person balances once it
closes.

## Lifecycle

```
scan receipt → open tab → share link → people join and claim → close → one expense
```

1. **Open.** `POST /tabs` with the scanned lines, tax, tip and printed total.
   The response carries a `share_token` — the only credential for the link.
2. **Claim.** Anyone with the link joins with a display name and ticks lines.
   Several people on the same line is sharing, not a conflict.
3. **Close.** `POST /tabs/{id}/close` computes what each person owes and writes
   a single direct expense (`group_id = NULL`, `split_type = "ITEMIZED"`).

## Database Schema

**Tab**
- `id`, `name` (the venue, e.g. "Bar Sol"), `created_by_id`, `currency`
- `share_token` - high-entropy public token; unique, indexed
- `token_expires_at` - 7 days from creation (`TAB_LINK_LIFETIME`)
- `revoked` - kills the link without closing the tab
- `status` - `open` | `closed`
- `payer_id` - who fronted the bill; defaults to the creator at close
- `tax`, `tip`, `total` - cents. `total` is what the receipt printed.
- `receipt_image_path`, `created_at`, `closed_at`
- `expense_id` - set once the tab resolves into a real expense

**TabItem**
- `id`, `tab_id`, `description`, `price` (cents)
- `added_manually` - true for lines typed on the live board rather than scanned.
  The API will delete any line (dropping its claims with it); offering deletion
  only for hand-added lines is a UI convention, so the board does not drift
  from the paper receipt beside it.

**TabParticipant**
- `id`, `tab_id`, `display_name`, `joined_at`
- `user_id` - set when a signed-in user claims; `NULL` for anonymous claimers
- `claim_token` - the anonymous claimer's only handle on their own claims.
  Returned exactly once, at join. Never included in any listing.

Participants are created the moment somebody claims, not by invitation.

**TabItemClaim**
- `id`, `tab_id`, `item_id`, `participant_id`
- `UNIQUE (item_id, participant_id)` — `ux_tab_item_claims_item_participant`.
  Claiming twice is idempotent at the API level and impossible at the schema
  level.

## Security Model

The public tab endpoints are the app's first *writable* unauthenticated
surface. `Group.share_link_id` is a permanent read-only UUID; a tab's token
lets a stranger create a participant and move money. So the token is:

- **High-entropy** — `secrets.token_urlsafe(32)`, not a UUID.
- **Scoped to one tab** — resolved by token alone. No caller-supplied tab id is
  ever consulted, so a token cannot reach a tab it does not belong to.
- **Expiring** — 7 days, returning `410 Gone` afterwards.
- **Separately revocable** — `POST /tabs/{id}/revoke` returns `404` from then
  on, and is independent of expiry and of closing.
- **Rate-limited** — 30 req/min on public reads and claims, 10 req/min on join.
- **Narrow** — the public payload omits the share token, every participant's
  claim token, the creator's user id, the tab id, and every other tab.

Claim tokens are scoped the same way: a claim token issued for one tab is
rejected on another (`403`).

Closing does **not** revoke the link. People are still holding it open on their
phones when the host closes, and a dead link would show them an error instead
of what they ended up owing. Writes are already refused once `status` is
`closed`, and the token still expires on its own.

## Share Computation

`backend/utils/tabs.py` — deliberately free of SQLAlchemy so the arithmetic can
be tested on plain data. Everything is in cents and every result sums *exactly*
to the bill.

1. **Items.** Each line splits evenly between whoever claimed it. The remainder
   goes one cent at a time to the earliest recipients, so 100¢ three ways is
   `[34, 33, 33]`, not `[33, 33, 33]` losing a cent.
2. **Orphans.** A line nobody claimed is spread across the whole table rather
   than dropped or charged to the payer. Closing a tab must not silently lose
   money.
3. **Tax and tip.** Distributed in proportion to each person's item total, so
   whoever ordered more carries more. Remaining cents go to the largest
   fractional parts. With no weight anywhere it falls back to an even split.

`frontend/src/utils/tabShares.ts` is a TypeScript port used for the live
preview on the board and the claim screen — round-tripping every tap would be
worse. **The server is the authority**; its numbers are the ones recorded at
close. The two test suites run the same cases so they cannot drift apart
unnoticed (`backend/tests/test_tabs_math.py`,
`frontend/src/utils/__tests__/tabShares.test.ts`).

## Closing

Closing writes one ordinary direct expense on the existing `group_id IS NULL`
path:

- Registered participants become `ExpenseSplit` rows.
- Anonymous participants become `ExpenseGuest` rows — the same records a direct
  expense with guests already uses.
- The expense gets `split_type = "ITEMIZED"`, icon `🧾`, and a note naming the
  venue. `Tab.expense_id` points at it.

Refused with `409` if the tab is already closed, has no items, or nobody has
joined. Refused with `400` if the chosen payer is anonymous — an expense must
be paid by a real account for balances to work.

### Getting back to a closed tab

Closed tabs are not listed anywhere — `GET /tabs` is filtered to `open` by
every caller — so the expense is the only handle on one. `GET
/expenses/{id}` therefore carries `tab_id`, derived from `Tab.expense_id`, and
the expense detail view turns it into a "View tab" action.

Only for the tab's owner. `GET /tabs/{id}` answers everyone else with `404`
precisely so it never confirms a tab exists, so `tab_id` is filtered on
`created_by_id` to avoid both leaking that and offering a link that dead-ends.
Anonymous claimers never had an account to read the expense with in the first
place.

## API Endpoints

### Owner (authenticated)
- `POST /tabs` - open a tab from scanned lines
- `GET /tabs` - your tabs; `?status_filter=open`
- `GET /tabs/{tab_id}` - full view, including the share token
- `POST /tabs/{tab_id}/items` - add a line the scan missed
- `DELETE /tabs/{tab_id}/items/{item_id}` - remove a line, dropping its claims.
  The UI only offers this for hand-added lines.
- `POST /tabs/{tab_id}/items/{item_id}/claim` - claim as yourself. The host is a
  participant like anyone else, and their claim token is never handed out, so
  identity comes from the session. Open to any signed-in participant.
- `POST /tabs/{tab_id}/items/{item_id}/claim/{participant_id}` - set anyone's
  claim. Owner only. Somebody at the table always leaves early or never opens
  the link; without this the desktop grid would be read-only. Grants nothing the
  owner did not already have — they can close the tab and decide who paid.
- `POST /tabs/{tab_id}/revoke` - kill the link without closing
- `POST /tabs/{tab_id}/close` - resolve into one expense

### Public (no auth, rate-limited)
- `GET /public/tabs/{share_token}` - read the tab
- `POST /public/tabs/{share_token}/join` - join with a name; returns a claim
  token
- `POST /public/tabs/{share_token}/items/{item_id}/claim` - claim or release,
  authenticated by `claim_token` in the body

## Frontend

**Routes**
- `TabBoardPage.tsx` - the host's view. Picks a posture with `useIsDesktop`.
- `TabClaimPage.tsx` - `/t/:shareToken`. No auth, no shell: the token is the
  only credential and most people opening it have no account.
- `TabClosePage.tsx` - confirm who paid, see the final shares.

**Components** (`src/components/tab/`)
- `TabBoardDesktop.tsx` - the two-pane board
- `ReceiptPaper.tsx` - the bill as paper, printed from the tab's own lines
  rather than the scanned photo, since a photo cannot show which lines are
  still nobody's. Fixed to the light palette in both themes.
- `TabMatrix.tsx` - every item against every person, with per-person totals
- `TabProgress.tsx` - how much of the bill is spoken for
- `ClaimerStack.tsx` - overlapping avatars on a claimed line
- `QrCode.tsx` - the share link as a QR. Everyone is at the same table, so a
  code on the host's screen beats sending four messages.

### Two postures

**Mobile** sorts lines into "needs a home" and "sorted" — a phone can only show
one axis at a time, so unclaimed lines lead.

**Desktop** shows both axes at once: the receipt on the left, the item × person
grid on the right. Hovering a row in the grid rings the same line on the paper.
The per-person footer totals are what closing *right now* would record, so they
include each person's share of the unclaimed lines; the outstanding amount is
called out separately.

The board polls every 5 seconds while the tab is open, because claims arrive
from other people's phones.

## Migration

`backend/migrations/add_tabs.py` — additive, idempotent, four new tables.
Supports `--dry-run`.

## Not Built

- **Nudging** a participant who has not claimed. They are link-holders and
  often have no account, so there is no address to reach them at.
- **Retroactive group promotion.** Offering to turn recurring tab participants
  into a real group needs recurrence data across closed tabs.
