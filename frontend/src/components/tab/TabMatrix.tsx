import React from 'react';
import { Check, WarningCircle } from '@phosphor-icons/react';
import { Avatar, Money } from '../ui';
import type { TabItem, TabParticipant } from '../../types/tab';

export interface TabMatrixProps {
    items: TabItem[];
    participants: TabParticipant[];
    currency: string;
    /** The viewer's own participant id, so their column can read "You". */
    meId?: number | null;
    /** Per-participant totals if the tab closed right now, in cents. */
    shares: Record<number, number>;
    /** Total of every line nobody has claimed. */
    unclaimed: number;
    /** Sum of the lines that do have a claimer. */
    claimed: number;
    /** Ticking is only possible while the tab is open. */
    editable: boolean;
    onToggle: (itemId: number, participantId: number, claimed: boolean) => void;
    onHoverItem?: (itemId: number | null) => void;
}

/**
 * Every item against every person, in one grid.
 *
 * The mobile board sorts lines into "needs a home" and "sorted" because a phone
 * can only show one axis at a time. With the room for both, the sorting is the
 * thing you want to see rather than a filter to apply — so the order stays as
 * printed on the receipt and unclaimed lines are marked in place.
 */
const TabMatrix: React.FC<TabMatrixProps> = ({
    items,
    participants,
    currency,
    meId,
    shares,
    unclaimed,
    claimed,
    editable,
    onToggle,
    onHoverItem,
}) => {
    // 1fr for the name, a fixed price column, then one column per person. The
    // template is shared by the header, every row and the footer so the columns
    // line up without a table's layout rules.
    const columns = {
        gridTemplateColumns: `minmax(0,1fr) 96px repeat(${participants.length}, minmax(88px, 104px))`,
    };

    return (
        <div className="min-w-0">
            {/* ------------------------------------------------ people */}
            <div className="grid items-end pb-2.5" style={columns}>
                <div className="text-[11px] uppercase tracking-[0.08em] text-sw-dim">
                    Item
                </div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-sw-dim text-right">
                    Price
                </div>

                {participants.map((participant) => {
                    const picking = !items.some((item) =>
                        item.claimed_by.includes(participant.id)
                    );
                    const isMe = participant.id === meId;
                    return (
                        <div
                            key={participant.id}
                            className="flex flex-col items-center gap-[5px] px-1"
                        >
                            <Avatar
                                name={participant.display_name}
                                size={30}
                                variant={isMe ? 'accent' : 'neutral'}
                            />
                            <div className="text-[11.5px] truncate max-w-full">
                                {isMe ? 'You' : participant.display_name}
                                {participant.user_id === null && !isMe && (
                                    <span className="text-sw-dim"> · guest</span>
                                )}
                            </div>
                            <div
                                className={`flex items-center gap-1 text-[10.5px] ${
                                    picking ? 'text-sw-accent' : 'text-sw-pos'
                                }`}
                            >
                                <span
                                    className={`w-[5px] h-[5px] rounded-full ${
                                        picking ? 'bg-sw-accent' : 'bg-sw-pos'
                                    }`}
                                />
                                {picking ? 'picking' : 'done'}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ------------------------------------------------- lines */}
            {items.map((item) => {
                const orphan = item.claimed_by.length === 0;
                return (
                    <div
                        key={item.id}
                        onMouseEnter={() => onHoverItem?.(item.id)}
                        onMouseLeave={() => onHoverItem?.(null)}
                        className={`grid items-center border-t border-sw-line ${
                            orphan
                                ? 'bg-sw-accent-ghost rounded-[9px] -mx-2 px-2 py-[11px]'
                                : 'py-[11px]'
                        }`}
                        style={columns}
                    >
                        <div className="text-[13.5px] flex items-center gap-2 min-w-0">
                            {orphan && (
                                <WarningCircle
                                    size={15}
                                    weight="fill"
                                    className="text-sw-accent flex-none"
                                    aria-label="Nobody has claimed this"
                                />
                            )}
                            <span className="truncate">{item.description}</span>
                        </div>

                        <Money
                            amount={item.price}
                            currency={currency}
                            tone="muted"
                            className="text-[13.5px] text-right"
                        />

                        {participants.map((participant) => {
                            const on = item.claimed_by.includes(participant.id);
                            const label = `${participant.display_name} had ${item.description}`;
                            return (
                                <div
                                    key={participant.id}
                                    className="flex justify-center"
                                >
                                    <button
                                        type="button"
                                        role="checkbox"
                                        aria-checked={on}
                                        aria-label={label}
                                        disabled={!editable}
                                        onClick={() =>
                                            onToggle(item.id, participant.id, !on)
                                        }
                                        className={`w-[22px] h-[22px] rounded-[7px] flex items-center justify-center transition-colors ${
                                            on
                                                ? 'bg-sw-accent text-sw-on-accent'
                                                : orphan
                                                  ? 'shadow-[inset_0_0_0_1.5px_var(--sw-accent)]'
                                                  : 'shadow-[inset_0_0_0_1.5px_var(--sw-line)]'
                                        } ${
                                            editable
                                                ? 'hover:shadow-[inset_0_0_0_1.5px_var(--sw-accent)] focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2'
                                                : 'cursor-default'
                                        }`}
                                    >
                                        {on && <Check size={13} weight="bold" />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                );
            })}

            {/* ------------------------------------------------ totals */}
            <div
                className="grid items-center border-t border-sw-line pt-3.5 mt-2"
                style={columns}
            >
                <div className="text-[13px] text-sw-muted pr-3">
                    If you closed now, tax and tip in
                    {unclaimed > 0 && (
                        <span className="text-sw-accent">
                            {' · '}
                            <Money amount={unclaimed} currency={currency} /> still
                            nobody&rsquo;s, split evenly
                        </span>
                    )}
                </div>

                <Money
                    amount={claimed}
                    currency={currency}
                    tone="muted"
                    className="text-[13.5px] text-right"
                />

                {participants.map((participant) => {
                    const picking = !items.some((item) =>
                        item.claimed_by.includes(participant.id)
                    );
                    return (
                        <Money
                            key={participant.id}
                            amount={shares[participant.id] ?? 0}
                            currency={currency}
                            tone={picking ? 'dim' : 'default'}
                            className="text-[15px] font-medium text-center"
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default TabMatrix;
