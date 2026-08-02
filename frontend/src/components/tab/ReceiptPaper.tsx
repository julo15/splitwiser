import React from 'react';
import { formatMoney } from '../../utils/formatters';
import type { TabItem } from '../../types/tab';

export interface ReceiptPaperProps {
    title: string;
    items: TabItem[];
    tax: number;
    tip: number;
    /** The printed total, if the scan found one. Falls back to the sum. */
    total: number | null;
    currency: string;
    /** Line to ring, e.g. the row the cursor is on in the matrix. */
    highlightItemId?: number | null;
    /** Lines nobody has claimed — tinted so spare food is visible on the paper. */
    unclaimedItemIds?: ReadonlySet<number>;
    className?: string;
}

/** Bare numbers: a till prints 28.00, not $28.00. The currency is in the header. */
function bare(amount: number, currency: string): string {
    return formatMoney(amount, currency).replace(/[^\d.,]/g, '');
}

const Line: React.FC<{
    label: React.ReactNode;
    value: string;
    tone?: 'normal' | 'quiet' | 'strong';
    state?: 'plain' | 'highlight' | 'unclaimed';
}> = ({ label, value, tone = 'normal', state = 'plain' }) => {
    const toneClass =
        tone === 'quiet'
            ? 'text-[#595d6c]'
            : tone === 'strong'
              ? 'font-bold'
              : '';

    const stateClass =
        state === 'highlight'
            ? 'bg-[rgba(121,108,191,0.24)] shadow-[0_0_0_1.5px_#796cbf] -mx-[5px] px-[5px] rounded-[3px]'
            : state === 'unclaimed'
              ? 'bg-[rgba(121,108,191,0.1)] -mx-[5px] px-[5px] rounded-[3px]'
              : '';

    return (
        <div className={`flex justify-between gap-3 ${toneClass} ${stateClass}`.trim()}>
            <span className="truncate">{label}</span>
            <span className="flex-none">{value}</span>
        </div>
    );
};

/**
 * The bill as paper.
 *
 * Printed from the tab's own lines rather than the scanned photo: the point is
 * to check the grid against the bill, and a photo can't show which lines are
 * still nobody's. Deliberately fixed to the light palette in both themes —
 * a receipt is a white thing on the table, and inverting it would make it read
 * as another panel of the app.
 */
const ReceiptPaper: React.FC<ReceiptPaperProps> = ({
    title,
    items,
    tax,
    tip,
    total,
    currency,
    highlightItemId = null,
    unclaimedItemIds,
    className = '',
}) => {
    const itemsSum = items.reduce((sum, item) => sum + item.price, 0);
    const printed = total ?? itemsSum + tax + tip;

    return (
        <div
            className={`bg-[#e4e7f5] text-[#292b31] rounded-md px-5 py-[18px] font-mono text-[11.5px] leading-[2] ${className}`.trim()}
        >
            <div className="text-center text-[13px] tracking-[0.16em] uppercase truncate">
                {title}
            </div>
            <div className="text-center text-[#75798c] text-[10px] mb-3">
                {items.length} {items.length === 1 ? 'line' : 'lines'}
            </div>

            {items.map((item) => (
                <Line
                    key={item.id}
                    label={item.description.toUpperCase()}
                    value={bare(item.price, currency)}
                    state={
                        item.id === highlightItemId
                            ? 'highlight'
                            : unclaimedItemIds?.has(item.id)
                              ? 'unclaimed'
                              : 'plain'
                    }
                />
            ))}

            <div className="border-t border-dashed border-[#9397ab] mt-2.5 mb-[7px]" />

            {tax > 0 && <Line label="TAX" value={bare(tax, currency)} tone="quiet" />}
            {tip > 0 && <Line label="TIP" value={bare(tip, currency)} tone="quiet" />}
            <Line
                label="TOTAL"
                value={bare(printed, currency)}
                tone="strong"
            />
        </div>
    );
};

export default ReceiptPaper;
