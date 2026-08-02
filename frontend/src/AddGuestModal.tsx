import React, { useState, useEffect } from 'react';
import { X } from '@phosphor-icons/react';
import { api } from './services/api';
import { Button, Field, Notice } from './components/ui';

interface AddGuestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGuestAdded: () => void;
    groupId: string;
}

const AddGuestModal: React.FC<AddGuestModalProps> = ({ isOpen, onClose, onGuestAdded, groupId }) => {
    const [name, setName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setName('');
            setError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            setError('Guest name is required');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const response = await api.groups.addGuest(parseInt(groupId), name.trim());

            if (response.ok) {
                onGuestAdded();
                onClose();
            } else {
                const err = await response.json();
                setError(err.detail || 'Failed to add guest');
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/55 z-50 flex items-end md:items-center justify-center font-sans"
            onClick={handleBackdropClick}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Add guest"
                className="bg-sw-surface text-sw-text w-full md:w-[400px] max-h-[90vh] overflow-y-auto rounded-t-sw-sheet md:rounded-sw-card-lg shadow-[0_0_0_1px_var(--sw-line)]"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-sw-line">
                    <h2 className="sw-heading text-[17px]">Add guest</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-sw-dim hover:text-sw-text p-2 -mr-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 rounded-lg"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-5">
                    <div className="mb-6">
                        <Field
                            label="Guest name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter guest name"
                            hint="Guests don't need an account. Use this for people who aren't registered on Splitwiser."
                            autoFocus
                            required
                        />
                    </div>

                    {error && (
                        <Notice tone="error" className="mb-4">
                            {error}
                        </Notice>
                    )}

                    <div className="flex flex-col-reverse md:flex-row gap-3">
                        <Button
                            variant="secondary"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="flex-1 py-3 min-h-[44px]"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={isSubmitting}
                            className="flex-1 py-3 min-h-[44px]"
                        >
                            {isSubmitting ? 'Adding…' : 'Add guest'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddGuestModal;
