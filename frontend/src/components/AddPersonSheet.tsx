import React, { useEffect, useState } from 'react';
import { Button, Field, Notice, Sheet } from './ui';
import { api } from '../services/api';

export interface AddPersonSheetProps {
    open: boolean;
    onClose: () => void;
    /** Called after a friend is added, so the caller can refetch. */
    onAdded: () => void;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add someone to your people by email.
 *
 * They have to have an account already — the server matches on an existing
 * user and 404s otherwise, so there is nothing useful to do with an address
 * nobody has signed up with.
 */
const AddPersonSheet: React.FC<AddPersonSheetProps> = ({
    open,
    onClose,
    onAdded,
}) => {
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setEmail('');
            setError(null);
        }
    }, [open]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const address = email.trim();

        if (!EMAIL.test(address)) {
            setError('That does not look like an email address.');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const response = await api.friends.add(address);
            if (response.ok) {
                onAdded();
                onClose();
                return;
            }
            const body = await response.json().catch(() => ({}));
            // 422 carries an array of field errors; everything else a string.
            const detail = Array.isArray(body.detail)
                ? body.detail[0]?.msg
                : body.detail;
            setError(
                response.status === 404
                    ? 'Nobody is signed up with that address.'
                    : typeof detail === 'string'
                      ? detail
                      : 'Could not add that person.'
            );
        } catch {
            setError('Could not reach the server. Try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            label="Add someone"
            title="Add someone"
            className="lg:max-w-[420px] lg:rounded-b-sw-sheet lg:mb-6"
        >
            <form onSubmit={submit} className="flex flex-col gap-3.5">
                <Field
                    label="Their email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="maya@example.com"
                    autoFocus
                    hint="They need a Splitwiser account already."
                />

                {error && <Notice tone="error">{error}</Notice>}

                <Button
                    type="submit"
                    variant="primary"
                    block
                    disabled={saving}
                    className="min-h-[46px]"
                >
                    {saving ? 'Adding…' : 'Add them'}
                </Button>
            </form>
        </Sheet>
    );
};

export default AddPersonSheet;
