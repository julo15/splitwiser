import React from 'react';

export interface AvatarProps {
    /** Full name; initials are derived from it. */
    name: string;
    /**
     * Accent avatars mark the focused/selected person in a list; the rest sit
     * on the raised neutral. Matches the desktop overview list pane.
     */
    variant?: 'neutral' | 'accent';
    /** Pixel diameter — 26 in the rail, 32 in list rows, 38 in expense rows. */
    size?: number;
    className?: string;
}

/**
 * Two initials from a name: first letter of the first and last word. Falls back
 * to a single letter for mononyms, and to '?' for an empty name so a guest with
 * no name yet still renders a stable circle.
 */
export function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    const first = parts[0].slice(0, 1);
    const last = parts[parts.length - 1].slice(0, 1);
    return (first + last).toUpperCase();
}

const Avatar: React.FC<AvatarProps> = ({
    name,
    variant = 'neutral',
    size = 32,
    className = '',
}) => {
    const tone =
        variant === 'accent'
            ? 'bg-sw-accent-soft text-sw-accent'
            : 'bg-sw-raise text-sw-muted';

    return (
        <div
            className={`flex-none rounded-full flex items-center justify-center font-semibold select-none ${tone} ${className}`.trim()}
            style={{
                width: size,
                height: size,
                // Initials track the circle: ~0.375x reads correctly from the
                // 26px rail avatar up to the 38px expense row.
                fontSize: Math.round(size * 0.375),
            }}
            aria-hidden="true"
        >
            {initialsOf(name)}
        </div>
    );
};

export default Avatar;
