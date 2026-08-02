import React, { useState, useEffect } from 'react';
import { api } from './services/api';
import IconSelector from './components/expense/IconSelector';
import { useCurrencyPreferences } from './hooks/useCurrencyPreferences';
import { formatCurrencyDisplay } from './utils/currencyHelpers';
import { Button, Notice } from './components/ui';
import { CONTROL_CLASS } from './components/ui/controlClass';

interface Group {
    id: number;
    name: string;
    created_by_id: number;
    default_currency: string;
    icon?: string | null;
}

interface EditGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    group: Group;
    onGroupUpdated: (group: { id: number; name: string; created_by_id: number; default_currency: string; icon?: string | null }) => void;
}

const EditGroupModal: React.FC<EditGroupModalProps> = ({ isOpen, onClose, group, onGroupUpdated }) => {
    const { sortedCurrencies, recordCurrencyUsage } = useCurrencyPreferences();
    const [name, setName] = useState(group.name);
    const [currency, setCurrency] = useState(group.default_currency || 'USD');
    const [selectedIcon, setSelectedIcon] = useState<string | null>(group.icon || null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setName(group.name);
        setCurrency(group.default_currency || 'USD');
        setSelectedIcon(group.icon || null);
        setError(null);
    }, [group, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const response = await api.groups.update(group.id, {
                name,
                default_currency: currency,
                icon: selectedIcon
            });

            if (response.ok) {
                // Record currency usage for sorting
                recordCurrencyUsage(currency);
                const updatedGroup = await response.json();
                onGroupUpdated({ ...group, ...updatedGroup });
            } else {
                const err = await response.json();
                setError(err.detail || 'Failed to update group');
            }
        } catch {
            setError('Failed to update group');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/55 overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4 font-sans"
            onClick={handleBackdropClick}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Edit group"
                className="bg-sw-surface text-sw-text p-5 rounded-sw-card-lg shadow-[0_0_0_1px_var(--sw-line)] w-full max-w-sm"
            >
                <h2 className="sw-heading text-[17px] mb-4">Edit group</h2>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label
                            className="block text-[12.5px] text-sw-muted mb-1.5"
                            htmlFor="edit-group-name"
                        >
                            Group name
                        </label>
                        <div className="flex items-center gap-2">
                            <IconSelector
                                selectedIcon={selectedIcon}
                                onIconSelect={setSelectedIcon}
                            />
                            <input
                                id="edit-group-name"
                                type="text"
                                className={CONTROL_CLASS}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="mb-4">
                        <label
                            className="block text-[12.5px] text-sw-muted mb-1.5"
                            htmlFor="edit-group-currency"
                        >
                            Default currency
                        </label>
                        <select
                            id="edit-group-currency"
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            className={CONTROL_CLASS}
                        >
                            {sortedCurrencies.map(c => (
                                <option key={c.code} value={c.code}>
                                    {formatCurrencyDisplay(c.code)}
                                </option>
                            ))}
                        </select>
                        <p className="text-[11.5px] text-sw-dim mt-1.5">
                            New expenses will default to this currency
                        </p>
                    </div>

                    {error && (
                        <Notice tone="error" className="mb-4">
                            {error}
                        </Notice>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditGroupModal;
