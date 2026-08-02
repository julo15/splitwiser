import React from 'react';
import { CheckCircle, Info, WarningCircle, XCircle } from '@phosphor-icons/react';
import { Button } from './ui';

interface AlertDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    title: string;
    message: string;
    type?: 'alert' | 'confirm' | 'success' | 'error';
    confirmText?: string;
    cancelText?: string;
}

/**
 * The mark above the title. Tinted from the soft ramps rather than filled — the
 * same treatment Notice gives a result stated inline.
 *
 * 'confirm' has no ramp of its own: a question is not an outcome, so it borrows
 * the negative one, since every confirm in this app guards a destructive step.
 */
const MARK = {
    success: { tone: 'bg-sw-pos-soft text-sw-pos', Icon: CheckCircle },
    error: { tone: 'bg-sw-neg-soft text-sw-neg', Icon: XCircle },
    confirm: { tone: 'bg-sw-neg-soft text-sw-neg', Icon: WarningCircle },
    alert: { tone: 'bg-sw-accent-ghost text-sw-accent', Icon: Info },
} as const;

const AlertDialog: React.FC<AlertDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    type = 'alert',
    confirmText = 'OK',
    cancelText = 'Cancel'
}) => {
    if (!isOpen) return null;

    const handleConfirm = () => {
        if (onConfirm) {
            onConfirm();
        }
        onClose();
    };

    const { tone, Icon } = MARK[type];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/55"
                onClick={type === 'confirm' ? undefined : onClose}
            />

            {/* Dialog */}
            <div
                role={type === 'confirm' ? 'alertdialog' : 'dialog'}
                aria-modal="true"
                aria-label={title}
                className="relative bg-sw-surface text-sw-text rounded-sw-card-lg shadow-[0_0_0_1px_var(--sw-line)] max-w-md w-full mx-auto"
            >
                <div className="p-6">
                    {/* Mark */}
                    <div
                        className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${tone}`}
                    >
                        <Icon size={24} weight="fill" aria-hidden="true" />
                    </div>

                    {/* Title */}
                    <h3 className="sw-heading mt-4 text-[17px] text-center">
                        {title}
                    </h3>

                    {/* Message */}
                    <p className="mt-2 text-[12.5px] text-sw-muted text-center whitespace-pre-line">
                        {message}
                    </p>

                    {/* Buttons */}
                    <div className="mt-6 flex gap-3">
                        {type === 'confirm' && (
                            <Button
                                variant="secondary"
                                onClick={onClose}
                                className="flex-1 py-3 min-h-[44px]"
                            >
                                {cancelText}
                            </Button>
                        )}
                        <Button
                            variant={type === 'confirm' ? 'secondary' : 'primary'}
                            onClick={handleConfirm}
                            className={`flex-1 py-3 min-h-[44px] ${
                                type === 'confirm' ? 'text-sw-neg border-sw-neg' : ''
                            }`}
                        >
                            {confirmText}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AlertDialog;
