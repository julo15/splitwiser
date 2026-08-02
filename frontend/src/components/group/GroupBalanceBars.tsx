import React, { useMemo } from 'react';
import { Money } from '../ui';
import type { GroupBalance } from '../../types/group';

export interface GroupBalanceBarsProps {
    balances: GroupBalance[];
    currentUserId?: number;
}

/**
 * Each member's net position in the group, as bars diverging from a centre
 * line: owed to the right in the positive tone, owing to the left in the
 * negative one. Bar widths are relative to the largest exposure in the group,
 * so the shape reads at a glance without needing an axis.
 */
const GroupBalanceBars: React.FC<GroupBalanceBarsProps> = ({
    balances,
    currentUserId,
}) => {
    const rows = useMemo(() => {
        const max = Math.max(...balances.map((b) => Math.abs(b.amount)), 1);
        return [...balances]
            .sort((a, b) => b.amount - a.amount)
            .map((balance) => ({
                balance,
                // Half the track is available on each side of the centre.
                width: (Math.abs(balance.amount) / max) * 50,
                isMe: !balance.is_guest && balance.user_id === currentUserId,
            }));
    }, [balances, currentUserId]);

    if (balances.length === 0) {
        return (
            <p className="text-[12.5px] text-sw-dim py-2">No balances yet.</p>
        );
    }

    return (
        <div className="flex flex-col gap-[9px]">
            {rows.map(({ balance, width, isMe }) => {
                const positive = balance.amount > 0;
                return (
                    <div
                        key={`${balance.user_id}-${balance.is_guest}-${balance.currency}`}
                        className="flex items-center gap-2.5"
                    >
                        <div
                            className={`text-[13px] w-[92px] flex-none truncate ${
                                isMe ? 'font-medium' : 'text-sw-muted'
                            }`}
                            title={balance.full_name}
                        >
                            {isMe ? 'You' : balance.full_name}
                        </div>

                        <div className="flex-1 h-1.5 rounded-[3px] bg-sw-bg relative min-w-0">
                            {balance.amount !== 0 && (
                                <div
                                    className={`absolute top-0 h-full rounded-[3px] ${
                                        positive ? 'bg-sw-pos' : 'bg-sw-neg'
                                    }`}
                                    style={
                                        positive
                                            ? { left: '50%', width: `${width}%` }
                                            : { right: '50%', width: `${width}%` }
                                    }
                                />
                            )}
                            <div
                                className="absolute left-1/2 -top-[3px] w-px h-3 bg-sw-line"
                                aria-hidden="true"
                            />
                        </div>

                        <Money
                            amount={balance.amount}
                            currency={balance.currency}
                            sign="always"
                            tone="auto"
                            className="w-[84px] text-right text-[13px] font-semibold flex-none"
                        />
                    </div>
                );
            })}
        </div>
    );
};

export default GroupBalanceBars;
