import React from 'react';
import type { SplitType } from '../../types/expense';

export interface SplitTypePillsProps {
    value: SplitType;
    onChange: (value: SplitType) => void;
    /** Hide "By item" where itemizing does not apply. */
    allowItemized?: boolean;
    className?: string;
}

const OPTIONS: { value: SplitType; label: string }[] = [
    { value: 'EQUAL', label: 'Equal' },
    { value: 'EXACT', label: 'Exact' },
    { value: 'PERCENT', label: 'Percent' },
    { value: 'SHARES', label: 'Shares' },
    { value: 'ITEMIZED', label: 'By item' },
];

/**
 * The five split types as a scrolling pill row — the design keeps all of them
 * one tap apart rather than hiding the less-used ones behind a menu.
 */
const SplitTypePills: React.FC<SplitTypePillsProps> = ({
    value,
    onChange,
    allowItemized = true,
    className = '',
}) => {
    const options = allowItemized
        ? OPTIONS
        : OPTIONS.filter((option) => option.value !== 'ITEMIZED');

    return (
        <div
            role="radiogroup"
            aria-label="Split type"
            className={`flex gap-1.5 overflow-x-auto pb-0.5 ${className}`.trim()}
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(option.value)}
                        className={`px-[13px] py-2 rounded-full text-[13px] whitespace-nowrap flex-none transition-colors focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 ${
                            selected
                                ? 'bg-sw-accent-ghost text-sw-accent shadow-[0_0_0_1px_var(--sw-accent)]'
                                : 'bg-sw-surface text-sw-muted shadow-[0_0_0_1px_var(--sw-line)] hover:text-sw-text'
                        }`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
};

export default SplitTypePills;
