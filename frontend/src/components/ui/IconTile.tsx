import React from 'react';

export type IconTileTone = 'neutral' | 'accent' | 'accent-solid' | 'surface';

export interface IconTileProps {
    /** A Phosphor icon element, or an emoji string for group/expense icons. */
    children: React.ReactNode;
    tone?: IconTileTone;
    /** Pixel size — 40 in sheet action rows, 38 in feed rows. */
    size?: number;
    className?: string;
}

const TONE_CLASS: Record<IconTileTone, string> = {
    neutral: 'bg-sw-raise text-sw-muted',
    accent: 'bg-sw-accent-ghost text-sw-accent',
    // The one accent fill the design permits at this scale: a small mark, not
    // a flood.
    'accent-solid': 'bg-sw-accent text-sw-on-accent',
    surface: 'bg-sw-surface text-sw-text',
};

/**
 * The rounded square behind an icon or emoji that leads most rows in the
 * redesign. Radius tracks size at roughly 0.3x, matching the mockups' 12px on
 * 40px and 11px on 38px.
 */
const IconTile: React.FC<IconTileProps> = ({
    children,
    tone = 'neutral',
    size = 40,
    className = '',
}) => (
    <div
        className={`flex-none flex items-center justify-center ${TONE_CLASS[tone]} ${className}`.trim()}
        style={{
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.3),
            fontSize: Math.round(size * 0.5),
        }}
    >
        {children}
    </div>
);

export default IconTile;
