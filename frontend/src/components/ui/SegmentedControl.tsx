import React from 'react';

export interface SegmentedOption<T extends string> {
    value: T;
    label: string;
}

export interface SegmentedControlProps<T extends string> {
    options: SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    /**
     * 'sm' is the currency toggle inside the mobile balance card; 'md' is the
     * desktop header and list-pane toggles.
     */
    size?: 'sm' | 'md';
    /** Stretch options to equal widths — the list-pane People/Groups toggle. */
    fill?: boolean;
    /** Accessible name, e.g. "Balance currency". */
    label: string;
    className?: string;
}

/**
 * The pill toggle used for every either/or in the redesign: currency display,
 * People vs Groups, split modes.
 *
 * Built on real radio inputs so it is keyboard- and screen-reader-navigable;
 * the visual selection is the raised chip with a hairline ring, matching the
 * mockups.
 */
function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    size = 'md',
    fill = false,
    label,
    className = '',
}: SegmentedControlProps<T>) {
    const groupName = React.useId();

    const pad = size === 'sm' ? 'px-2 py-[3px] text-[10.5px]' : 'px-2.5 py-1 text-xs';

    return (
        <div
            role="radiogroup"
            aria-label={label}
            className={`flex gap-0.5 p-[3px] bg-sw-sunk rounded-lg ${className}`.trim()}
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <label
                        key={option.value}
                        className={`${fill ? 'flex-1 text-center' : ''} cursor-pointer rounded-md transition-colors ${pad} ${
                            selected
                                ? 'bg-sw-surface font-medium text-sw-text shadow-[0_0_0_1px_var(--sw-line)]'
                                : 'text-sw-muted hover:text-sw-text'
                        }`}
                    >
                        <input
                            type="radio"
                            name={groupName}
                            className="sr-only"
                            checked={selected}
                            onChange={() => onChange(option.value)}
                        />
                        {option.label}
                    </label>
                );
            })}
        </div>
    );
}

export default SegmentedControl;
