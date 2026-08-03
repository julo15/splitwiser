import React, { useMemo, useState } from 'react';
import { CaretDown, WarningCircle } from '@phosphor-icons/react';
import { Avatar, Card, Money } from '../ui';
import { computeTabBreakdowns, toShareItems } from '../../utils/tabShares';
import type { TabBreakdown as Breakdown, TabShareLine } from '../../utils/tabShares';
import type { TabItem, TabParticipant } from '../../types/tab';

export interface TabBreakdownProps {
    items: TabItem[];
    /** Everyone at the table. The maths needs all of them, always. */
    participants: TabParticipant[];
    currency: string;
    tax: number;
    tip: number;
    /** The viewer's participant id: their row reads "You" and opens first. */
    meId?: number | null;
    /** Who fronted the bill, once that is settled. */
    payerId?: number | null;
    /** Draw only these rows. The totals still come from the whole table. */
    showOnly?: number[];
    /** Rows that start expanded. Default: the viewer's own. */
    openBy?: 'me' | 'all' | 'none';
    /** Off where there is a single row and nothing to collapse into. */
    collapsible?: boolean;
    className?: string;
}

/** "split 3 ways" / "nobody claimed it — split 4 ways" */
function lineCaption(line: TabShareLine): string | null {
    if (line.orphan) {
        return `Nobody claimed it — split ${line.splitCount} ways`;
    }
    if (line.splitCount > 1) {
        return `Split ${line.splitCount} ways`;
    }
    return null;
}

export interface TabWorkingProps {
    breakdown: Breakdown;
    currency: string;
    tax: number;
    tip: number;
    /** Whose lines these are, so the tax and tip rows can address them. */
    possessive: string;
}

/**
 * One person's lines, then the arithmetic that turns them into a total.
 *
 * Exported because the claim screen shows exactly this for the one person
 * reading it, under a total it already has a place for — it needs the working
 * without the row of names above it.
 */
export const TabWorking: React.FC<TabWorkingProps> = ({
    breakdown,
    currency,
    tax,
    tip,
    possessive,
}) => (
    <div className="border-t border-sw-line px-[15px] py-3">
        {breakdown.lines.length === 0 ? (
            <p className="text-[12.5px] text-sw-dim">
                Nothing claimed yet — and nothing spare to spread, either.
            </p>
        ) : (
            <div className="flex flex-col gap-[7px]">
                {breakdown.lines.map((line) => {
                    const caption = lineCaption(line);
                    return (
                        <div
                            key={line.itemId}
                            className="flex items-start justify-between gap-3 text-[13px]"
                        >
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    {line.orphan && (
                                        <WarningCircle
                                            size={13}
                                            weight="fill"
                                            className="text-sw-accent flex-none"
                                            aria-hidden="true"
                                        />
                                    )}
                                    <span className="truncate">{line.description}</span>
                                </div>
                                {caption && (
                                    <div
                                        className={`text-[11px] ${
                                            line.orphan ? 'text-sw-accent' : 'text-sw-dim'
                                        }`}
                                    >
                                        {caption} ·{' '}
                                        <Money
                                            amount={line.price}
                                            currency={currency}
                                            tone={line.orphan ? 'default' : 'dim'}
                                        />{' '}
                                        in all
                                    </div>
                                )}
                            </div>
                            <Money
                                amount={line.amount}
                                currency={currency}
                                tone="muted"
                                className="flex-none"
                            />
                        </div>
                    );
                })}
            </div>
        )}

        <div className="mt-3 pt-2.5 border-t border-sw-line flex flex-col gap-[5px] text-[12.5px]">
            <div className="flex justify-between gap-3 text-sw-muted">
                <span>
                    {breakdown.lines.length}{' '}
                    {breakdown.lines.length === 1 ? 'item' : 'items'}
                </span>
                <Money amount={breakdown.items} currency={currency} tone="muted" />
            </div>

            {/*
              * Tax and tip ride on the item subtotal, so whoever ordered more
              * carries more of them. Each is only worth a line when the bill
              * actually has one.
              */}
            {tax > 0 && (
                <div className="flex justify-between gap-3 text-sw-muted">
                    <span>{possessive} share of the tax</span>
                    <Money amount={breakdown.tax} currency={currency} tone="muted" />
                </div>
            )}
            {tip > 0 && (
                <div className="flex justify-between gap-3 text-sw-muted">
                    <span>{possessive} share of the tip</span>
                    <Money amount={breakdown.tip} currency={currency} tone="muted" />
                </div>
            )}

            <div className="flex justify-between gap-3 pt-1.5 border-t border-sw-line text-sw-text font-medium text-[13.5px]">
                <span>Total</span>
                <Money amount={breakdown.total} currency={currency} />
            </div>
        </div>
    </div>
);

/**
 * What each person ends up owing, and how the bill got them there.
 *
 * The per-person figure on its own answers "how much?" but never "why that
 * much?" — which is the question actually asked at the table, and the one the
 * host has to answer when someone disputes their number. So every row opens
 * onto its own lines, its share of anything nobody claimed, and the tax and tip
 * that rode along on top.
 *
 * The arithmetic is `computeTabBreakdowns`, which is the same walk that
 * produces the totals — the working shown here always adds up to the figure
 * beside the name, and to what the server records at close.
 */
const TabBreakdown: React.FC<TabBreakdownProps> = ({
    items,
    participants,
    currency,
    tax,
    tip,
    meId,
    payerId,
    showOnly,
    openBy = 'me',
    collapsible = true,
    className = '',
}) => {
    const breakdowns = useMemo(
        () =>
            computeTabBreakdowns(
                toShareItems(items),
                participants.map((p) => p.id),
                tax,
                tip
            ),
        [items, participants, tax, tip]
    );

    /*
     * Which rows the reader has flipped away from their default, rather than
     * which rows are open. The board polls while the tab is live, so people
     * arrive and the viewer's own seat can appear after this mounts — a list of
     * open ids would freeze whatever was true on the first render.
     */
    const [flipped, setFlipped] = useState<Set<number>>(() => new Set());
    const opensByDefault = (id: number) =>
        openBy === 'all' || (openBy === 'me' && id === meId);

    const rows = showOnly
        ? participants.filter((p) => showOnly.includes(p.id))
        : participants;

    const billTotal = Object.values(breakdowns).reduce((sum, b) => sum + b.total, 0);

    if (rows.length === 0) return null;

    return (
        <Card radius="lg" className={`overflow-hidden ${className}`.trim()}>
            {rows.map((participant, index) => {
                const breakdown = breakdowns[participant.id];
                if (!breakdown) return null;

                const isMe = participant.id === meId;
                const isPayer = participant.id === payerId;
                const open =
                    !collapsible ||
                    flipped.has(participant.id) !== opensByDefault(participant.id);

                const caption = isPayer
                    ? 'Paid the bill'
                    : participant.user_id !== null
                      ? isMe
                          ? 'On your account'
                          : 'Splitwiser account'
                      : isMe
                        ? 'Guest — no account needed'
                        : 'Guest';

                const heading = (
                    <>
                        <Avatar
                            name={participant.display_name}
                            size={30}
                            variant={isMe ? 'accent' : 'neutral'}
                        />
                        <span className="flex-1 min-w-0 text-left">
                            <span className="block text-sm truncate">
                                {isMe ? 'You' : participant.display_name}
                            </span>
                            <span className="block text-[11.5px] text-sw-dim truncate">
                                {caption}
                                {/* What the payer is up: the bill, less their own share. */}
                                {isPayer && (
                                    <>
                                        {' · up '}
                                        <Money
                                            amount={billTotal - breakdown.total}
                                            currency={currency}
                                            tone="positive"
                                        />
                                    </>
                                )}
                            </span>
                        </span>
                        <Money
                            amount={breakdown.total}
                            currency={currency}
                            className="text-[15px] font-medium flex-none"
                        />
                        {collapsible && (
                            <CaretDown
                                size={15}
                                className={`text-sw-dim flex-none transition-transform ${
                                    open ? 'rotate-180' : ''
                                }`}
                                aria-hidden="true"
                            />
                        )}
                    </>
                );

                return (
                    <div
                        key={participant.id}
                        className={index < rows.length - 1 ? 'border-b border-sw-line' : ''}
                    >
                        {collapsible ? (
                            <button
                                type="button"
                                aria-expanded={open}
                                onClick={() =>
                                    setFlipped((current) => {
                                        const next = new Set(current);
                                        if (!next.delete(participant.id)) {
                                            next.add(participant.id);
                                        }
                                        return next;
                                    })
                                }
                                className="w-full flex items-center gap-[11px] px-[15px] py-3 hover:bg-sw-raise focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-[-2px]"
                            >
                                {heading}
                            </button>
                        ) : (
                            <div className="flex items-center gap-[11px] px-[15px] py-3">
                                {heading}
                            </div>
                        )}

                        {open && (
                            <TabWorking
                                breakdown={breakdown}
                                currency={currency}
                                tax={tax}
                                tip={tip}
                                possessive={isMe ? 'Your' : 'Their'}
                            />
                        )}
                    </div>
                );
            })}
        </Card>
    );
};

export default TabBreakdown;
