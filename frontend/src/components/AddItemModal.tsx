import React, { useState, useEffect } from 'react';
import { X } from '@phosphor-icons/react';
import { Button, Field, Notice } from './ui';
import { CONTROL_CLASS } from './ui/controlClass';

interface AddItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (description: string, price: number) => void;
}

const AddItemModal: React.FC<AddItemModalProps> = ({ isOpen, onClose, onAdd }) => {
    const [description, setDescription] = useState('');
    const [priceStr, setPriceStr] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setDescription('');
            setPriceStr('');
            setError('');
        }
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!description.trim()) {
            setError('Please enter an item description');
            return;
        }

        const price = Math.round(parseFloat(priceStr) * 100);
        if (isNaN(price) || price <= 0) {
            setError('Please enter a valid price greater than 0');
            return;
        }

        onAdd(description.trim(), price);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/55" onClick={onClose} />

            {/* Modal */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Add item"
                className="relative bg-sw-surface text-sw-text rounded-sw-card-lg shadow-[0_0_0_1px_var(--sw-line)] max-w-md w-full mx-auto"
            >
                <form onSubmit={handleSubmit}>
                    {/* Header */}
                    <div className="flex justify-between items-center p-5 border-b border-sw-line">
                        <h2 className="sw-heading text-[17px]">Add item</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close modal"
                            className="text-sw-dim hover:text-sw-text min-w-[44px] min-h-[44px] -mr-3 flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 rounded-lg"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-5 space-y-4">
                        {/* Description Input */}
                        <Field
                            label="Item description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g., Burger"
                            className="min-h-[44px]"
                            autoFocus
                        />

                        {/* Price Input */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="item-price" className="text-[12.5px] text-sw-muted">
                                Price
                            </label>
                            <div className="relative">
                                <span
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-sw-dim"
                                    aria-hidden="true"
                                >
                                    $
                                </span>
                                <input
                                    id="item-price"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={priceStr}
                                    onChange={(e) => setPriceStr(e.target.value)}
                                    placeholder="12.99"
                                    className={`${CONTROL_CLASS} sw-num pl-7 min-h-[44px]`}
                                />
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && <Notice tone="error">{error}</Notice>}
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3 p-5 border-t border-sw-line">
                        <Button
                            variant="secondary"
                            onClick={onClose}
                            className="flex-1 py-3 min-h-[44px]"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            className="flex-1 py-3 min-h-[44px]"
                        >
                            Add item
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddItemModal;
