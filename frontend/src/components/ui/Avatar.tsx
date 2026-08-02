import React from 'react';
import { initialsOf } from '../../utils/initials';

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
