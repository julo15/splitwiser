import React from 'react';

export type RowVariant = 'plain' | 'card' | 'divided';

export interface RowProps {
    /** Avatar, emoji tile or icon tile at the leading edge. */
    leading?: React.ReactNode;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Money figure, caret, or a stacked pair of both. */
    trailing?: React.ReactNode;
    /**
     * 'plain'   — list-pane rows: 10px padding, 10px radius, fill when selected.
     * 'card'    — standalone actionable rows (the FAB sheet): 14px padding,
     *             14px radius, surface fill with a hairline ring.
     * 'divided' — feed rows ("Lately"): no fill, hairline rule beneath.
     */
    variant?: RowVariant;
    /** 'accent' is the emphasized card row — accent-ghost fill, accent ring. */
    tone?: 'default' | 'accent';
    selected?: boolean;
    /** Dims the row to 60%, as the mockups do for all-square people. */
    muted?: boolean;
    onClick?: () => void;
    className?: string;
}

const VARIANT_CLASS: Record<RowVariant, string> = {
    plain: 'gap-[11px] p-2.5 rounded-sw-row',
    card: 'gap-[13px] p-3.5 rounded-[14px]',
    divided: 'gap-3 py-[11px] border-b border-sw-line',
};

/**
 * The horizontal record that carries most of the redesign's content: a leading
 * mark, a title/subtitle stack, and a trailing figure.
 *
 * Renders as a <button> when clickable so it is focusable and keyboard
 * operable; as a plain <div> otherwise.
 */
const Row: React.FC<RowProps> = ({
    leading,
    title,
    subtitle,
    trailing,
    variant = 'plain',
    tone = 'default',
    selected = false,
    muted = false,
    onClick,
    className = '',
}) => {
    let fill = '';
    if (tone === 'accent') {
        fill = 'bg-sw-accent-ghost shadow-[0_0_0_1px_var(--sw-accent)]';
    } else if (variant === 'card') {
        fill = 'bg-sw-surface shadow-[0_0_0_1px_var(--sw-line)]';
    } else if (selected) {
        fill = 'bg-sw-surface';
    }

    const interactive = onClick
        ? 'text-left w-full cursor-pointer hover:bg-sw-surface focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2'
        : '';

    const content = (
        <>
            {leading}
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{title}</div>
                {subtitle && (
                    <div className="text-[11.5px] text-sw-dim truncate">{subtitle}</div>
                )}
            </div>
            {trailing}
        </>
    );

    const classes = `flex items-center ${VARIANT_CLASS[variant]} ${fill} ${interactive} ${
        muted ? 'opacity-60' : ''
    } ${className}`.trim();

    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={classes}>
                {content}
            </button>
        );
    }

    return <div className={classes}>{content}</div>;
};

export default Row;
