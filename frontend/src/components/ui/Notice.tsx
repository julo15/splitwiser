import React from 'react';
import { CheckCircle, Info, WarningCircle } from '@phosphor-icons/react';

export type NoticeTone = 'success' | 'error' | 'info';

export interface NoticeProps {
    tone: NoticeTone;
    children: React.ReactNode;
    className?: string;
}

const TONE = {
    success: {
        box: 'bg-sw-pos-soft text-sw-pos',
        Icon: CheckCircle,
    },
    error: {
        box: 'bg-sw-neg-soft text-sw-neg',
        Icon: WarningCircle,
    },
    info: {
        box: 'bg-sw-accent-ghost text-sw-accent',
        Icon: Info,
    },
} as const;

/**
 * The result of an action, stated inline next to what produced it.
 *
 * Tinted from the soft ramps rather than filled, so it reads as a mark on the
 * surface rather than a banner competing with the content.
 */
const Notice: React.FC<NoticeProps> = ({ tone, children, className = '' }) => {
    const { box, Icon } = TONE[tone];
    return (
        <div
            role={tone === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2 px-3 py-2.5 rounded-sw-row text-[12.5px] ${box} ${className}`.trim()}
        >
            <Icon size={16} weight="fill" className="flex-none mt-px" />
            <span className="flex-1">{children}</span>
        </div>
    );
};

export default Notice;
