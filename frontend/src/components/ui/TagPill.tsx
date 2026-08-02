import React from 'react';

export type TagTone = 'neutral' | 'accent' | 'positive' | 'negative' | 'outline';

export interface TagPillProps {
    children: React.ReactNode;
    tone?: TagTone;
    /** Shows a small filled dot before the label — used for "open tab". */
    dot?: boolean;
    className?: string;
}

const TONE_CLASS: Record<TagTone, string> = {
    neutral: 'bg-sw-raise text-sw-muted',
    accent: 'bg-sw-accent-ghost text-sw-accent',
    positive: 'bg-sw-pos-soft text-sw-pos',
    negative: 'bg-sw-neg-soft text-sw-neg',
    outline: 'text-sw-muted shadow-[0_0_0_1px_var(--sw-line)]',
};

const DOT_CLASS: Record<TagTone, string> = {
    neutral: 'bg-sw-muted',
    accent: 'bg-sw-accent',
    positive: 'bg-sw-pos',
    negative: 'bg-sw-neg',
    outline: 'bg-sw-muted',
};

/**
 * A small tinted label — status, split type, currency. Tints come from the
 * soft ramps so the pill reads as a mark rather than a saturated fill.
 */
const TagPill: React.FC<TagPillProps> = ({
    children,
    tone = 'neutral',
    dot = false,
    className = '',
}) => (
    <span
        className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-[11px] font-medium ${TONE_CLASS[tone]} ${className}`.trim()}
    >
        {dot && (
            <span
                className={`w-[7px] h-[7px] rounded-full flex-none ${DOT_CLASS[tone]}`}
                aria-hidden="true"
            />
        )}
        {children}
    </span>
);

export default TagPill;
