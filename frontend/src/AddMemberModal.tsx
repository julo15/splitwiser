import React, { useState, useEffect } from 'react';
import { Plus, X } from '@phosphor-icons/react';
import { api } from './services/api';
import { Button, Field, Notice } from './components/ui';
import { CONTROL_CLASS } from './components/ui/controlClass';

interface Friend {
    id: number;
    full_name: string;
    email: string;
}

interface AddMemberModalProps {
    isOpen: boolean;
    onClose: () => void;
    onMemberAdded: () => void;
    groupId: string;
    friends?: Friend[];
}

const AddMemberModal: React.FC<AddMemberModalProps> = ({ isOpen, onClose, onMemberAdded, groupId, friends = [] }) => {
    const [email, setEmail] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setEmail('');
            setSearchQuery('');
            setError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // Filter friends based on search query
    const filteredFriends = friends
        .filter(friend =>
            friend.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            friend.email.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => a.full_name.localeCompare(b.full_name));

    const handleAddMember = async (memberEmail: string) => {
        setIsSubmitting(true);
        setError(null);

        try {
            const response = await api.groups.addMember(parseInt(groupId), memberEmail);

            if (response.ok) {
                onMemberAdded();
                onClose();
            } else {
                const err = await response.json();
                setError(err.detail || 'Failed to add member');
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email.trim()) {
            setError('Email address is required');
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            setError('Please enter a valid email address');
            return;
        }

        await handleAddMember(email.trim());
    };

    const handleFriendClick = (friendEmail: string) => {
        handleAddMember(friendEmail);
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
                aria-label="Add member"
                className="bg-sw-surface text-sw-text w-full md:w-[480px] max-h-[90vh] overflow-y-auto rounded-t-sw-sheet md:rounded-sw-card-lg shadow-[0_0_0_1px_var(--sw-line)]"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-sw-line">
                    <h2 className="sw-heading text-[17px]">Add member</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-sw-dim hover:text-sw-text p-2 -mr-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 rounded-lg"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5">
                    {/* Quick-select friends */}
                    {friends.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-[11px] uppercase tracking-[0.09em] text-sw-dim mb-3">
                                Quick add from friends
                            </h3>

                            {/* Search input */}
                            <div className="mb-3">
                                <input
                                    type="text"
                                    aria-label="Search friends"
                                    placeholder="Search friends…"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className={CONTROL_CLASS}
                                />
                            </div>

                            {/* Friend chips */}
                            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                                {filteredFriends.length > 0 ? (
                                    filteredFriends.map(friend => (
                                        <Button
                                            key={friend.id}
                                            variant="secondary"
                                            onClick={() => handleFriendClick(friend.email)}
                                            disabled={isSubmitting}
                                            icon={<Plus size={14} />}
                                            className="px-3 py-2 min-h-[44px]"
                                        >
                                            {friend.full_name}
                                        </Button>
                                    ))
                                ) : (
                                    <p className="text-[12.5px] text-sw-dim py-2">
                                        No friends match your search
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Divider */}
                    {friends.length > 0 && (
                        <div className="relative mb-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-sw-line"></div>
                            </div>
                            <div className="relative flex justify-center">
                                <span className="px-2 bg-sw-surface text-[11px] uppercase tracking-[0.09em] text-sw-dim">
                                    Or add by email
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Email form */}
                    <form onSubmit={handleSubmit}>
                        <div className="mb-6">
                            <Field
                                label="Member's email address"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="member@example.com"
                                hint="They must have a Splitwiser account to join the group"
                                autoFocus={friends.length === 0}
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
                                {isSubmitting ? 'Adding…' : 'Add member'}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AddMemberModal;
