import React from 'react';

export type CardTone = 'surface' | 'accent' | 'sunk';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    /**
     * 'card' (12px) matches desktop cards and list rows; 'lg' (16px) matches
     * the larger mobile cards. The mockups use a softer radius scale than
     * Nocturne's base 8px.
     */
    radius?: 'card' | 'lg';
    /**
     * 'accent' is the highlighted tile (net balance, promotion offers) — an
     * accent-ghost fill ringed in accent-soft. Per Nocturne this is a tint, not
     * an accent flood.
     */
    tone?: CardTone;
    children?: React.ReactNode;
}

const RADIUS_CLASS = {
    card: 'rounded-sw-card',
    lg: 'rounded-sw-card-lg',
} as const;

const TONE_CLASS: Record<CardTone, string> = {
    // Elevation on this ground is an edge, not a blurred shadow.
    surface: 'bg-sw-surface shadow-[0_0_0_1px_var(--sw-line)]',
    accent: 'bg-sw-accent-ghost shadow-[0_0_0_1px_var(--sw-accent-soft)]',
    sunk: 'bg-sw-sunk',
};

/**
 * The redesign's basic surface: a filled panel separated from the ground by a
 * hairline ring rather than a shadow.
 */
const Card: React.FC<CardProps> = ({
    radius = 'card',
    tone = 'surface',
    className = '',
    children,
    ...rest
}) => (
    <div
        className={`${TONE_CLASS[tone]} ${RADIUS_CLASS[radius]} ${className}`.trim()}
        {...rest}
    >
        {children}
    </div>
);

export default Card;
