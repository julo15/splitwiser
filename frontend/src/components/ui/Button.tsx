import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /**
     * 'primary' is an accent OUTLINE, not a fill — Nocturne forbids flooding an
     * area with the accent. 'secondary' outlines in the hairline color.
     */
    variant?: ButtonVariant;
    block?: boolean;
    /** Leading icon element. */
    icon?: React.ReactNode;
    children?: React.ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
    primary:
        'text-sw-accent border-sw-accent hover:bg-[color-mix(in_srgb,var(--sw-accent)_12%,transparent)] active:bg-[color-mix(in_srgb,var(--sw-accent)_22%,transparent)]',
    secondary:
        'text-sw-text border-sw-line hover:bg-[color-mix(in_srgb,var(--sw-text)_7%,transparent)] active:bg-[color-mix(in_srgb,var(--sw-text)_14%,transparent)]',
    ghost:
        'text-sw-accent border-transparent px-1 hover:bg-[color-mix(in_srgb,var(--sw-accent)_10%,transparent)] active:bg-[color-mix(in_srgb,var(--sw-accent)_18%,transparent)]',
};

/**
 * The redesign's action. Outlined by default, with the accent carried as a line
 * rather than a ground, and a themed focus ring instead of the browser default.
 */
const Button: React.FC<ButtonProps> = ({
    variant = 'secondary',
    block = false,
    icon,
    children,
    className = '',
    type = 'button',
    ...rest
}) => (
    <button
        type={type}
        className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-medium leading-tight bg-transparent cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 ${
            VARIANT_CLASS[variant]
        } ${block ? 'w-full' : ''} ${className}`.trim()}
        {...rest}
    >
        {icon}
        {children}
    </button>
);

export default Button;
