import React from 'react';

export interface BadgeProps {
    /** How many things are waiting. Nothing renders at zero. */
    count: number;
    /**
     * 'dot'   — a bare mark, for when the number isn't the point.
     * 'count' — the number itself, capped at 9+.
     */
    variant?: 'dot' | 'count';
    /** Describes what is waiting, for people who can't see the mark. */
    label?: string;
    /**
     * The surface the badge sits on. A dot overlapping an avatar needs a halo
     * in the background colour to stay legible, and the rail is not the page.
     */
    ring?: 'bg' | 'sunk' | 'surface' | 'none';
    className?: string;
}

const RING = {
    bg: 'ring-2 ring-sw-bg',
    sunk: 'ring-2 ring-sw-sunk',
    surface: 'ring-2 ring-sw-surface',
    none: '',
} as const;

/**
 * The unread mark.
 *
 * Accent rather than the negative ramp: something waiting for you is not the
 * same as money you owe, and the negative colour is spoken for. This is the one
 * place the accent is allowed to flood a shape — it is a mark, not an action,
 * and at 8px it never reads as a button.
 *
 * Positioning is the caller's job (`absolute` plus offsets on a `relative`
 * parent), so the same badge works on a rail row and on an avatar.
 */
const Badge: React.FC<BadgeProps> = ({
    count,
    variant = 'dot',
    label,
    ring = 'bg',
    className = '',
}) => {
    if (count <= 0) return null;

    const described = label ?? `${count} pending`;

    if (variant === 'dot') {
        return (
            <span
                role="status"
                aria-label={described}
                className={`block w-2 h-2 rounded-full bg-sw-accent ${RING[ring]} ${className}`.trim()}
            />
        );
    }

    return (
        <span
            role="status"
            aria-label={described}
            className={`inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-sw-accent text-sw-on-accent text-[10.5px] font-medium sw-num ${className}`.trim()}
        >
            {count > 9 ? '9+' : count}
        </span>
    );
};

export default Badge;
