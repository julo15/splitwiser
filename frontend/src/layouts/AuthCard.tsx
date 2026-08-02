import React from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';

export type AuthMarkTone = 'success' | 'error' | 'accent';

export interface AuthCardProps {
    /** Heading at the top of the card. */
    title: string;
    /** Quiet line under the heading. */
    subtitle?: React.ReactNode;
    /**
     * A tinted disc above the heading, for the pages that report an outcome
     * rather than ask for input (email sent, password reset, verify failed).
     */
    mark?: { icon: React.ReactNode; tone: AuthMarkTone };
    /** Centres the heading block. Outcome pages do; forms don't. */
    centered?: boolean;
    children?: React.ReactNode;
}

const MARK_TONE: Record<AuthMarkTone, string> = {
    success: 'bg-sw-pos-soft text-sw-pos',
    error: 'bg-sw-neg-soft text-sw-neg',
    accent: 'bg-sw-accent-ghost text-sw-accent',
};

/**
 * The shell every signed-out page shares: one card centred on the page ground.
 *
 * The five auth pages each carried their own copy of this markup — eight
 * copies in all once the success and error branches are counted — which is how
 * they drifted a full palette behind the rest of the app. Keeping the shell in
 * one place means the next change to it lands everywhere at once.
 */
const AuthCard: React.FC<AuthCardProps> = ({
    title,
    subtitle,
    mark,
    centered = false,
    children,
}) => (
    <div className="min-h-screen flex items-center justify-center bg-sw-bg text-sw-text font-sans p-4">
        <div className="max-w-md w-full p-8 bg-sw-surface rounded-sw-card-lg shadow-[0_0_0_1px_var(--sw-line)]">
            <div className={centered ? 'text-center' : ''}>
                {mark && (
                    <div
                        className={`mx-auto mb-5 flex items-center justify-center h-12 w-12 rounded-full ${MARK_TONE[mark.tone]}`}
                    >
                        {mark.icon}
                    </div>
                )}
                <h1 className="sw-heading text-[22px]">{title}</h1>
                {subtitle && (
                    <p className="mt-2 text-[12.5px] text-sw-muted">{subtitle}</p>
                )}
            </div>
            {children}
        </div>
    </div>
);

/**
 * The show/hide control that sits inside a password `Field`. Matches the one
 * on the account settings page — same icons, same placement, same wording.
 */
export const PasswordToggle: React.FC<{
    shown: boolean;
    onToggle: () => void;
    /** Plural when one toggle governs several fields. */
    label?: string;
}> = ({ shown, onToggle, label = 'password' }) => (
    <button
        type="button"
        onClick={onToggle}
        aria-label={shown ? `Hide ${label}` : `Show ${label}`}
        className="p-1 text-sw-dim hover:text-sw-text focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
    >
        {shown ? <EyeSlash size={16} /> : <Eye size={16} />}
    </button>
);

export default AuthCard;
