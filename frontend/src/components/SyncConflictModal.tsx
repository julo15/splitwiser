import React from 'react';
import type { PendingOperation } from '../db';
import { Button, Card } from './ui';

interface SyncConflictModalProps {
  conflict: PendingOperation;
  onResolve: (action: 'discard' | 'retry') => void;
}

const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  conflict,
  onResolve
}) => {
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onResolve('discard');
    }
  };

  const getConflictMessage = () => {
    switch (conflict.type) {
      case 'CREATE_EXPENSE':
        return 'An expense you created offline could not be synced. It may already exist or the group has been modified.';
      case 'UPDATE_EXPENSE':
        return 'An expense you edited offline was also modified by someone else.';
      case 'DELETE_EXPENSE':
        return 'An expense you deleted offline was already deleted or modified.';
      case 'CREATE_GROUP':
        return 'A group you created offline could not be synced.';
      case 'UPDATE_GROUP':
        return 'A group you edited offline was also modified by someone else.';
      default:
        return 'There was a sync conflict with your offline changes.';
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 p-4 font-sans"
      onClick={handleBackdropClick}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Sync conflict"
        className="bg-sw-surface text-sw-text rounded-sw-card-lg shadow-[0_0_0_1px_var(--sw-line)] p-6 max-w-md w-full"
      >
        <h3 className="sw-heading text-[17px] mb-4">Sync conflict</h3>

        <p className="text-[12.5px] text-sw-muted mb-4">
          {getConflictMessage()}
        </p>

        <Card tone="sunk" className="p-3 mb-4 text-[12.5px]">
          <p>
            <span className="text-sw-muted">Operation:</span> {conflict.type}
          </p>
          <p>
            <span className="text-sw-muted">Created:</span>{' '}
            {new Date(conflict.created_at).toLocaleString()}
          </p>
          {conflict.last_error && (
            <p className="text-sw-neg mt-2">
              <span className="text-sw-muted">Error:</span> {conflict.last_error}
            </p>
          )}
        </Card>

        <div className="flex gap-2 justify-end">
          <Button
            variant="secondary"
            onClick={() => onResolve('discard')}
            className="text-sw-neg border-sw-neg"
          >
            Discard local
          </Button>
          <Button variant="primary" onClick={() => onResolve('retry')}>
            Retry sync
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SyncConflictModal;
