import React, { useId } from 'react';

export interface FieldProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
    label: string;
    /** Quiet line under the input — a constraint or a consequence. */
    hint?: React.ReactNode;
    /** Rendered to the right of the input, e.g. a show/hide toggle. */
    trailing?: React.ReactNode;
}

/**
 * A labelled text input in the system's style. Exists so the settings forms
 * don't each re-declare the same six classes and their own label wiring.
 */
const Field: React.FC<FieldProps> = ({
    label,
    hint,
    trailing,
    className = '',
    ...rest
}) => {
    const id = useId();
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-[12.5px] text-sw-muted">
                {label}
            </label>
            <div className="relative flex items-center">
                <input
                    id={id}
                    className={`w-full px-3 py-2.5 rounded-sw-row bg-sw-sunk text-sw-text border border-sw-line placeholder:text-sw-dim focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 disabled:opacity-45 ${
                        trailing ? 'pr-11' : ''
                    } ${className}`.trim()}
                    {...rest}
                />
                {trailing && (
                    <div className="absolute right-2 flex items-center">{trailing}</div>
                )}
            </div>
            {hint && <p className="text-[11.5px] text-sw-dim">{hint}</p>}
        </div>
    );
};

export default Field;
