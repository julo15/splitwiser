import React from 'react';
import { Money, Notice } from '../ui';
import type { SummaryGranularity } from '../../types/summary';
import { granularityLabel } from './granularity';

interface SummaryHeaderProps {
    groupTotal: number;
    currency: string;
    granularity: SummaryGranularity;
    hasSynthesizedHistoricalRate: boolean;
}

/**
 * What the group has spent in total, and over what.
 *
 * This is consumption, not balance: it never nets to zero and it does not
 * shrink when people settle up. A group where everyone has paid their share
 * reads $0 on the balances and still reads the full figure here.
 */
const SummaryHeader: React.FC<SummaryHeaderProps> = ({
    groupTotal,
    currency,
    granularity,
    hasSynthesizedHistoricalRate,
}) => (
    <div className="flex flex-col gap-1 pb-3.5">
        <Money
            amount={groupTotal}
            currency={currency}
            className="text-[28px] font-medium tracking-[-0.015em]"
        />
        <div className="text-[12px] text-sw-dim">{granularityLabel(granularity)}</div>

        {hasSynthesizedHistoricalRate && (
            <Notice tone="info" className="mt-1.5">
                Some expenses predate the exchange rates we have, so their
                conversion uses today&rsquo;s rate. Treat those figures as close
                rather than exact.
            </Notice>
        )}
    </div>
);

export default SummaryHeader;
