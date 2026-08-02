import React, { useState, useEffect } from 'react';
import { Check } from '@phosphor-icons/react';
import { Button, TagPill } from './components/ui';
import { CONTROL_CLASS } from './components/ui/controlClass';

interface Participant {
    id: number;
    name: string;
    isGuest: boolean;
}

interface ParticipantSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    participants: Participant[];
    selectedParticipants: Participant[];
    onConfirm: (selected: Participant[]) => void;
    itemDescription: string;
}

const ParticipantSelector: React.FC<ParticipantSelectorProps> = ({
    isOpen,
    onClose,
    participants,
    selectedParticipants,
    onConfirm,
    itemDescription
}) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        // Initialize with currently selected participants
        const keys = selectedParticipants.map(p =>
            p.isGuest ? `guest_${p.id}` : `user_${p.id}`
        );
        setSelected(new Set(keys));
    }, [selectedParticipants, isOpen]);

    const getKey = (p: Participant) => p.isGuest ? `guest_${p.id}` : `user_${p.id}`;

    const toggleParticipant = (p: Participant) => {
        const key = getKey(p);
        const newSelected = new Set(selected);
        if (newSelected.has(key)) {
            newSelected.delete(key);
        } else {
            newSelected.add(key);
        }
        setSelected(newSelected);
    };

    const selectAll = () => {
        const allKeys = participants.map(p => getKey(p));
        setSelected(new Set(allKeys));
    };

    const selectNone = () => {
        setSelected(new Set());
    };

    const handleConfirm = () => {
        const selectedList = participants.filter(p => selected.has(getKey(p)));
        onConfirm(selectedList);
        onClose();
    };

    const filteredParticipants = participants
        .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            // "You" always first
            if (a.name === 'You') return -1;
            if (b.name === 'You') return 1;
            // Then alphabetically
            return a.name.localeCompare(b.name);
        });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4 font-sans">
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Select people"
                className="bg-sw-surface text-sw-text rounded-sw-card-lg shadow-[0_0_0_1px_var(--sw-line)] w-full max-w-lg max-h-[80vh] flex flex-col"
            >
                {/* Header */}
                <div className="p-4 border-b border-sw-line">
                    <h3 className="sw-heading text-[17px] mb-1">Select people</h3>
                    <p className="text-[12.5px] text-sw-dim truncate">{itemDescription}</p>
                </div>

                {/* Search and Quick Actions */}
                <div className="p-4 border-b border-sw-line space-y-3">
                    <input
                        type="text"
                        aria-label="Search people"
                        placeholder="Search people…"
                        className={CONTROL_CLASS}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={selectAll}
                            className="flex-1 min-h-[44px]"
                        >
                            Select all ({participants.length})
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={selectNone}
                            className="flex-1 min-h-[44px]"
                        >
                            Clear all
                        </Button>
                    </div>
                </div>

                {/* Participant List */}
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="grid grid-cols-2 gap-2">
                        {filteredParticipants.map(p => {
                            const key = getKey(p);
                            const isSelected = selected.has(key);

                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleParticipant(p)}
                                    aria-pressed={isSelected}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-sw-row text-left transition-colors min-h-[44px] cursor-pointer focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 ${
                                        isSelected
                                            ? 'bg-sw-accent-ghost shadow-[0_0_0_1px_var(--sw-accent)]'
                                            : 'bg-sw-sunk shadow-[0_0_0_1px_var(--sw-line)] hover:bg-sw-raise'
                                    }`}
                                >
                                    {/*
                                     * Guests used to be told apart by a second
                                     * accent colour. The redesign has only one,
                                     * so the distinction moves to a label —
                                     * which says what it means rather than
                                     * asking you to remember what orange meant.
                                     */}
                                    <div
                                        className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center ${
                                            isSelected
                                                ? 'bg-sw-accent text-sw-on-accent'
                                                : 'shadow-[0_0_0_1.5px_var(--sw-line)]'
                                        }`}
                                    >
                                        {isSelected && <Check size={12} weight="bold" />}
                                    </div>
                                    <span className="text-sm font-medium truncate flex-1 min-w-0">
                                        {p.name}
                                    </span>
                                    {p.isGuest && (
                                        <TagPill tone="neutral" className="flex-none">
                                            Guest
                                        </TagPill>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {filteredParticipants.length === 0 && (
                        <p className="text-center text-[12.5px] text-sw-dim py-8">
                            No people found
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-sw-line flex items-center justify-between">
                    <span className="text-[12.5px] text-sw-muted">
                        {selected.size} of {participants.length} selected
                    </span>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleConfirm}>
                            Done
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ParticipantSelector;
