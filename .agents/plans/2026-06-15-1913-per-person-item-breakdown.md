# Plan: Show which items each person ordered in the per-person Split Breakdown

## Working Protocol
- Use parallel subagents for independent tasks (reading, searching, implementing across files).
- Mark steps done (`- [x]`) as you complete them — a fresh agent should be able to find where to resume.
- Run tests after each step before moving on. **Always run tests via a subagent** (`cd frontend && npm run test`).
- Frontend only: no backend, schema, or migration changes. Do not edit `backend/`.
- If blocked, document the blocker here before stopping.

## Overview
In the expense read/view, the per-person "Split Breakdown" for ITEMIZED expenses shows each person's name, total owed, items subtotal, tax share, and tip share — but never **which specific items that person ordered**. This change lists each person's assigned items (with their per-item share amount) directly under their name in the breakdown.

## User Experience
When viewing an ITEMIZED expense (e.g. a scanned restaurant receipt), in the **Split Breakdown** section:

1. Each person appears in a card with their name and total owed (unchanged).
2. **New:** directly below, an itemized list of the regular items assigned to that person, each showing the item description and that person's share of it (e.g. `Margherita Pizza … $7.50` when split between two people).
3. Below the item list, the existing rollup lines remain: `Items subtotal`, `+ Tax (X% share)`, `+ Tip (X% share)`.
4. If a person has no regular items assigned (e.g. they were added as a participant but assigned nothing), the item list is omitted and only the existing subtotal/tax/tip rows show (subtotal `$0.00`, as today).

This applies identically in the authenticated view and the public (no-auth) share view, because both render the same `ExpenseDetailModal`.

Non-itemized expenses (EQUAL/EXACT/PERCENT/SHARES) are unchanged — they have no items to list.

## Architecture

### Current
`GET /expenses/{id}` (and the public `GET /groups/public/{share}/expenses/{id}`) already return `splits[]` (per-person totals, registered users + group guests only) and `items[]` (each with `assignments[]` carrying `user_id`, `is_guest`, `expense_guest_id`, `user_name`). No data is missing.

`ExpenseDetailModal.tsx` renders the per-person breakdown inline: for each `split`, it loops `regularItems`, matches assignments by `user_id`/`is_guest`, and accumulates `personSubtotal` using the per-item split type (EQUAL/EXACT/PERCENT/SHARES). The item *descriptions* are discarded — only the running subtotal is kept.

```mermaid
flowchart TD
    API[GET /expenses/:id → splits[] + items[]] --> Modal[ExpenseDetailModal]
    Modal --> Loop[per split: loop regularItems, match assignment, sum personSubtotal]
    Loop --> Render[Render: name, total, subtotal, tax, tip]
    Loop -. descriptions discarded .-> X[(dropped)]
```

### Proposed
Extract the per-person itemized math into a pure helper `calculatePersonItemBreakdown` in `frontend/src/utils/expenseCalculations.ts`. It takes the person (`user_id`, `is_guest`) and `items[]`, and returns `{ items: Array<{ description, shareAmount }>, subtotal, tax, tip, sharePercent }`. The modal calls the helper and renders the returned `items` list as a new block, plus the existing rollup. No change to data flow or the network layer.

```mermaid
flowchart TD
    API[GET /expenses/:id → splits[] + items[]] --> Modal[ExpenseDetailModal]
    Modal --> Helper[calculatePersonItemBreakdown person, items]
    Helper --> Out[{ items: desc+share, subtotal, tax, tip, sharePercent }]
    Out --> Render[Render: name, total, ITEM LIST, subtotal, tax, tip]
```

The breakdown is computed in-memory at render time from data already in the response; there is no extra fetch, no persistence, and the cost is O(people × items), identical to today.

## Current State
- `frontend/src/ExpenseDetailModal.tsx` lines ~1005–1099: inline itemized per-person computation + render (the only place this breakdown is rendered, for both auth and public views).
- `frontend/src/ExpenseDetailModal.tsx` lines ~943–972: separate "Items" section listing items grouped by item (not by person) — complementary, left unchanged.
- `frontend/src/utils/expenseCalculations.ts`: has `calculateEqualSplit`, `calculateExactSplit`, `calculatePercentSplit`, `calculateSharesSplit`, `calculateItemizedTotal` — but **no** per-person itemized breakdown helper. The per-item share math is currently duplicated inline in the modal.
- `frontend/src/types/expense.ts`: `ExpenseItemDetail.assignments` already typed with `user_name`, `user_id`, `is_guest`, `expense_guest_id`.
- Tests: vitest + @testing-library; existing pure-logic tests live in `frontend/src/utils/__tests__/` (incl. `expenseCalculations.test.ts`). No render test exists for `ExpenseDetailModal`.

## Proposed Changes
1. **Extract a pure helper** `calculatePersonItemBreakdown` in `expenseCalculations.ts` that reproduces the existing inline EQUAL/EXACT/PERCENT/SHARES per-item math and additionally returns the list of `{ description, shareAmount }` for items assigned to the person. This is the reuse strategy: it replaces the inline duplication in the modal and centralizes the math next to the other split helpers, where it can be unit-tested like them.
2. **Render the item list** in `ExpenseDetailModal.tsx`: replace the inline computation with a call to the helper and add a `<ul>`/divs block listing the person's items + share above the existing subtotal/tax/tip rollup. Match surrounding Tailwind/dark-mode classes (`text-xs text-gray-500 dark:text-gray-400`, etc.).
3. **Preserve existing totals**: `split.amount_owed` remains the source of truth for the headline total; the helper output is for display of the decomposition only. The sum of shown item shares + tax + tip should reconcile with `amount_owed` exactly as the current subtotal/tax/tip rows already do (same math, just now also surfacing descriptions).

### Complexity Assessment
**Low.** Two files changed (`expenseCalculations.ts`, `ExpenseDetailModal.tsx`) plus one test file. No backend/schema/migration. The only real logic is the per-item share math — and that already exists inline, so the work is mostly *extraction* (low regression risk: the helper must produce the same `subtotal`/`tax`/`tip` the inline code does today) plus additive rendering. Tricky parts: rounding parity with the existing inline `Math.floor`/`Math.round` so the displayed total still reconciles, and matching the `tax`/`tip` description-keyword heuristics (`includes('tax')`, `=== 'tax/tip'`) exactly.

## Impact Analysis
- **New Files**: `frontend/src/utils/__tests__/` — add tests for `calculatePersonItemBreakdown` (either extend `expenseCalculations.test.ts` or a new sibling file).
- **Modified Files**: `frontend/src/utils/expenseCalculations.ts` (new helper), `frontend/src/ExpenseDetailModal.tsx` (use helper + render item list).
- **Dependencies**: relies on `ExpenseItemDetail`/`ExpenseSplit` shapes in `frontend/src/types/expense.ts` (unchanged). Relied on by both the authenticated and public expense detail views (same component).
- **Similar Modules**: `expenseCalculations.ts` split helpers (reuse their style/rounding conventions); the inline modal block is the source being extracted — ensure no behavioral drift.

## Key Decisions
- **Extract vs. inline:** extract to a pure helper so the math is unit-testable and de-duplicated. Decided over keeping it inline (untestable, already duplicated) and over a backend change (unnecessary — data is present).
- **Per-item share, not just description:** show each item with the person's share amount (mirrors the "X% share" framing already used for tax/tip) so a person split-sharing a dish sees their actual portion.
- **Expense guests stay out of scope:** the per-person breakdown iterates `expense.splits`, which the backend builds from `ExpenseSplit` rows = registered users + group guests only. Expense guests (`ExpenseGuest`) are stored separately and are **already not shown** in this breakdown. This change preserves that; rendering expense guests here is a separate, pre-existing gap (noted under Edge Cases), not part of this task.

## Implementation Steps

### Step 1: Add the pure helper
- [x] In `frontend/src/utils/expenseCalculations.ts`, add `calculatePersonItemBreakdown(person: { user_id: number; is_guest: boolean }, items: ExpenseItemDetail[])` returning `{ items: Array<{ description: string; shareAmount: number }>; subtotal: number; tax: number; tip: number; sharePercent: number }`.
- [x] Port the existing inline logic from `ExpenseDetailModal.tsx` (lines ~1006–1067) verbatim in behavior: regular/tax/tip/combined item partitioning, the EQUAL/EXACT/PERCENT/SHARES per-item share computation, and the proportional tax/tip (`Math.round(total * (subtotal/totalSubtotal))`). Accumulate `{ description, shareAmount }` per assigned regular item alongside `subtotal`.

### Step 2: Wire the modal to the helper + render the item list
- [x] In `frontend/src/ExpenseDetailModal.tsx`, replace the inline computation (lines ~1006–1067) with a call to `calculatePersonItemBreakdown`.
- [x] Render the returned `items` as a new block inside the person card (between the name/total row ~line 1078 and the `Items subtotal` row ~line 1080): each row = `description` left, `formatMoney(shareAmount, expense.currency)` right, using the existing `text-xs text-gray-500 dark:text-gray-400` styling. Omit the block when `items` is empty.
- [x] Confirm the non-itemized branch (lines ~1101–1111) is untouched.

### Step 3: Write tests
- [x] Add tests for `calculatePersonItemBreakdown` in `frontend/src/utils/__tests__/expenseCalculations.test.ts` (or a new sibling test file).
- [x] Test case: single assignee gets the full item price as their share, item appears in `items`.
- [x] Test case: EQUAL split of one item between two people → each gets `floor(price/2)` and the item appears for both.
- [x] Test case: EXACT / PERCENT / SHARES per-item splits → share amounts match the existing inline math.
- [x] Test case: person assigned no regular items → `items` empty, `subtotal === 0`.
- [x] Test case: tax/tip-only items are excluded from `items` but contribute to `tax`/`tip` proportionally.
- [x] Test case: group guest (`is_guest: true`) assignment matches correctly and is not confused with a registered user of the same `user_id`.

### Step 4: Verify
- [x] Run `cd frontend && npm run test` (via subagent) — all green.
- [x] Run `cd frontend && npm run lint` and `npm run build` (tsc) — no errors.

## Acceptance Criteria
- [x] [test] `calculatePersonItemBreakdown` returns the correct per-person item list and share amounts for EQUAL/EXACT/PERCENT/SHARES, covered by unit tests.
- [x] [test] A person with no assigned regular items yields an empty item list and `subtotal === 0`.
- [x] [test] Group-guest assignments (`is_guest: true`) match correctly and don't collide with a registered user sharing the same numeric id.
- [x] [test] Extracted helper produces the same `subtotal`/`tax`/`tip` the modal previously computed inline (no regression in the existing rollup numbers).
- [x] [test-manual] Viewing a scanned itemized receipt shows each person's items under their name in the Split Breakdown, in both the authenticated and public share views, in light and dark mode.

## Edge Cases
- **Item shared by N people:** each person's row shows their share (`floor`/exact/percent/shares), not the full item price.
- **Unassigned items:** appear only in the existing "Items" section as "⚠️ Unclaimed"; they belong to no person, so they never appear in any person's list.
- **Expense guests:** not shown in the per-person breakdown today (splits exclude them); this change does not add them. Pre-existing limitation, explicitly out of scope.
- **Rounding:** displayed item shares + tax + tip should reconcile to the headline `amount_owed` to the same degree they do today (the headline remains `split.amount_owed`, untouched).

## Addendum — shipped enhancements (beyond original plan)
After the base feature, two display refinements were added per Julian's feedback, both in the same helper + modal (and covered by the same test file):
1. **Per-item percentage for shared items.** `PersonItemShare` gained `percent` (0–100, derived per split type: EQUAL → 100/N, EXACT → amount/price, PERCENT → the set %, SHARES → personShares/total) and `isShared` (`assignments.length > 1`). The modal shows the percentage only for shared items (solo items imply 100%).
2. **"with N other(s)" count.** `PersonItemShare` gained `sharedWith` (`assignments.length - 1`). The label reads e.g. `Margherita Pizza (50%, with 1 other)` / `House Red Wine (33.3%, with 2 others)`, with correct singular/plural. Phrasing chosen ("others" excludes the viewer) to avoid the "+1" ambiguity of "shared with N people".
