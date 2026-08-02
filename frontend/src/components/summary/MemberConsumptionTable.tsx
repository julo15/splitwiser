import React, { useMemo, useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { Avatar, Money } from '../ui';
import type { GroupSummaryResponse, GroupSummaryMember } from '../../types/summary';
import SummaryHeader from './SummaryHeader';

interface MemberConsumptionTableProps {
    response: GroupSummaryResponse;
    currentUserId: number | null;
}

const memberKey = (member: Pick<GroupSummaryMember, 'user_id' | 'is_guest'>): string =>
    `${member.user_id}-${member.is_guest}`;

/**
 * Who accounted for how much of the group's spending.
 *
 * Rows come sorted by total descending from the server; the viewer is pinned
 * to the top so their own share is the first thing read. Bars are proportional
 * to the largest spender, which turns the column of figures into a shape you
 * can scan without reading every number.
 *
 * Managed members fold into whoever settles up for them, matching the balance
 * view, and expand to show the breakdown.
 */
const MemberConsumptionTable: React.FC<MemberConsumptionTableProps> = ({
    response,
    currentUserId,
}) => {
    const { members, group_total, currency, granularity, has_synthesized_historical_rate } =
        response;

    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
    const toggleButtonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

    const sortedMembers = useMemo<GroupSummaryMember[]>(() => {
        if (currentUserId == null) return members;
        const youIndex = members.findIndex(
            (m) => m.user_id === currentUserId && m.is_guest === false
        );
        if (youIndex === -1) return members;
        const you = members[youIndex];
        return [you, ...members.filter((_, i) => i !== youIndex)];
    }, [members, currentUserId]);

    // Bar widths are relative to the biggest spender, not to the group total:
    // with six people the tallest bar would otherwise never clear a fifth of
    // the track and every row would look the same.
    const largest = useMemo(
        () => Math.max(...members.map((m) => m.total), 1),
        [members]
    );

    const toggleExpanded = (key: string) => {
        setExpandedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
        // Keep keyboard focus on the toggle after the state change.
        requestAnimationFrame(() => toggleButtonRefs.current.get(key)?.focus());
    };

    if (members.length === 0) {
        return (
            <p className="text-[13px] text-sw-dim text-center py-6">
                No spending yet — add an expense and this fills in.
            </p>
        );
    }

    return (
        <div>
            <SummaryHeader
                groupTotal={group_total}
                currency={currency}
                granularity={granularity}
                hasSynthesizedHistoricalRate={has_synthesized_historical_rate}
            />

            <ul className="flex flex-col border-t border-sw-line">
                {sortedMembers.map((member) => {
                    const key = memberKey(member);
                    const managed = member.managed_members ?? [];
                    const isExpanded = expandedKeys.has(key);
                    const isYou =
                        currentUserId != null &&
                        member.user_id === currentUserId &&
                        member.is_guest === false;
                    const displayName = isYou ? 'You' : member.display_name;
                    const subrowsId = `member-managed-${key}`;

                    return (
                        <li key={key} className="border-b border-sw-line last:border-b-0">
                            <div className="flex items-center gap-[11px] py-2.5">
                                <Avatar
                                    name={member.display_name}
                                    size={28}
                                    variant={isYou ? 'accent' : 'neutral'}
                                />

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[13.5px] truncate">
                                            {displayName}
                                        </span>
                                        {member.is_guest && (
                                            <span className="text-[11px] text-sw-dim flex-none">
                                                guest
                                            </span>
                                        )}
                                        {managed.length > 0 && (
                                            <button
                                                ref={(el) => {
                                                    toggleButtonRefs.current.set(key, el);
                                                }}
                                                type="button"
                                                onClick={() => toggleExpanded(key)}
                                                aria-expanded={isExpanded}
                                                aria-controls={subrowsId}
                                                aria-label={`${
                                                    isExpanded ? 'Hide' : 'Show'
                                                } who is folded into ${displayName}`}
                                                className="flex-none inline-flex items-center gap-0.5 text-[11px] text-sw-dim hover:text-sw-text focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 rounded"
                                            >
                                                +{managed.length}
                                                <CaretDown
                                                    size={11}
                                                    className={`transition-transform ${
                                                        isExpanded ? 'rotate-180' : ''
                                                    }`}
                                                />
                                            </button>
                                        )}
                                    </div>

                                    <div className="h-[5px] rounded-[3px] bg-sw-sunk overflow-hidden mt-1.5">
                                        <div
                                            className="h-full rounded-[3px] bg-sw-accent"
                                            style={{
                                                width: `${(member.total / largest) * 100}%`,
                                            }}
                                        />
                                    </div>
                                </div>

                                <Money
                                    amount={member.total}
                                    currency={currency}
                                    className="text-[13.5px] font-medium flex-none"
                                />
                            </div>

                            {managed.length > 0 && isExpanded && (
                                <ul
                                    id={subrowsId}
                                    className="pl-[39px] pb-2.5 flex flex-col gap-1"
                                >
                                    {managed.map((entry, index) => (
                                        <li
                                            key={`${key}-managed-${index}`}
                                            className="flex items-center justify-between gap-3 text-[11.5px] text-sw-dim"
                                        >
                                            <span className="truncate">
                                                {entry.display_name}
                                            </span>
                                            <Money
                                                amount={entry.total}
                                                currency={currency}
                                                tone="dim"
                                                className="flex-none"
                                            />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export default MemberConsumptionTable;
