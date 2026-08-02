import React from 'react';
import Card from './Card';

export interface StatTileProps {
    label: string;
    /** The figure itself — usually a <Money> element. */
    value: React.ReactNode;
    /** Supporting line under the figure ("from 3 people across 4 groups"). */
    caption?: React.ReactNode;
    /**
     * 'md' is the desktop stat strip: surface card, uppercase tracked label,
     * 32px figure. 'sm' is the pair inside the mobile balance card: sunk fill,
     * sentence-case label, 17px figure.
     */
    size?: 'sm' | 'md';
    /** 'accent' highlights the net figure. Only meaningful at size 'md'. */
    tone?: 'surface' | 'accent';
    className?: string;
}

const StatTile: React.FC<StatTileProps> = ({
    label,
    value,
    caption,
    size = 'md',
    tone = 'surface',
    className = '',
}) => {
    if (size === 'sm') {
        return (
            <div
                className={`flex-1 min-w-0 bg-sw-sunk rounded-[11px] px-[13px] py-[11px] ${className}`.trim()}
            >
                <div className="text-[11.5px] text-sw-dim">{label}</div>
                <div className="mt-0.5 text-[17px] font-medium">{value}</div>
            </div>
        );
    }

    return (
        <Card tone={tone} className={`px-[18px] py-4 ${className}`.trim()}>
            <div
                className={`text-[11px] uppercase tracking-[0.09em] ${
                    tone === 'accent' ? 'text-sw-accent' : 'text-sw-dim'
                }`}
            >
                {label}
            </div>
            <div className="mt-1.5 text-[32px] font-medium">{value}</div>
            {caption && (
                <div className="mt-0.5 text-xs text-sw-muted">{caption}</div>
            )}
        </Card>
    );
};

export default StatTile;
