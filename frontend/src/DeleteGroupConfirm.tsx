import React, { useState } from 'react';
import { api } from './services/api';
import { Button, Notice } from './components/ui';

interface Group {
    id: number;
    name: string;
    created_by_id: number;
}

interface DeleteGroupConfirmProps {
    isOpen: boolean;
    onClose: () => void;
    group: Group;
    onDeleted: () => void;
}

const DeleteGroupConfirm: React.FC<DeleteGroupConfirmProps> = ({ isOpen, onClose, group, onDeleted }) => {
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleDelete = async () => {
        setIsDeleting(true);
        setError(null);

        try {
            const response = await api.groups.delete(group.id);

            if (response.ok) {
                onDeleted();
            } else {
                const err = await response.json();
                setError(err.detail || 'Failed to delete group');
            }
        } catch {
            setError('Failed to delete group');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/55 overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4 font-sans"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-label="Delete group"
                className="bg-sw-surface text-sw-text p-5 rounded-sw-card-lg shadow-[0_0_0_1px_var(--sw-line)] w-full max-w-sm"
            >
                <h2 className="sw-heading text-[17px] mb-4">Delete group</h2>

                <p className="text-sm text-sw-text mb-3">
                    Are you sure you want to delete <strong className="font-medium">{group.name}</strong>?
                </p>

                <p className="text-[12.5px] text-sw-dim mb-4">
                    This action cannot be undone. Existing expenses will be preserved but will no longer be associated with this group.
                </p>

                {error && (
                    <Notice tone="error" className="mb-4">
                        {error}
                    </Notice>
                )}

                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={isDeleting}>
                        Cancel
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="text-sw-neg border-sw-neg"
                    >
                        {isDeleting ? 'Deleting…' : 'Delete'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default DeleteGroupConfirm;
