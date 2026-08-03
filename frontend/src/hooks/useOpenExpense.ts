import { useCallback, useRef, useState } from 'react';
import { groupsApi } from '../services/api';
import type { GroupMember, GuestMember } from '../types/group';

interface OpenableExpense {
    id: number;
    group_id: number | null;
}

/**
 * Opening an expense from a feed, wherever that feed lives.
 *
 * The detail modal wants the group's members and guests, but only to populate
 * the *edit* form — viewing needs nothing beyond the expense itself, since
 * splits arrive with their names resolved. The feeds used to route to the
 * group page rather than open the modal for exactly this reason, which meant a
 * click on a group expense landed you on the group instead of the expense, and
 * an expense with no group at all — a direct payment, or the one a closed tab
 * resolves into — had nowhere to go and silently did nothing.
 *
 * So: open immediately, and fill in the group context when it arrives. A slow
 * or failed group fetch costs the edit form its participant pills, not the
 * user their click.
 */
export function useOpenExpense() {
    const [expenseId, setExpenseId] = useState<number | null>(null);
    const [members, setMembers] = useState<GroupMember[]>([]);
    const [guests, setGuests] = useState<GuestMember[]>([]);

    // Which expense the in-flight group fetch belongs to. Guards against a
    // slow response landing after the modal closed or moved to another row.
    const wantedId = useRef<number | null>(null);

    const open = useCallback((expense: OpenableExpense) => {
        wantedId.current = expense.id;
        setExpenseId(expense.id);
        setMembers([]);
        setGuests([]);

        if (expense.group_id === null) return;

        groupsApi
            .getById(expense.group_id)
            .then((group: { members?: GroupMember[]; guests?: GuestMember[] }) => {
                if (wantedId.current !== expense.id) return;
                setMembers(group.members ?? []);
                setGuests(group.guests ?? []);
            })
            .catch(() => {
                // Viewing still works; only the edit form is poorer for it.
            });
    }, []);

    const close = useCallback(() => {
        wantedId.current = null;
        setExpenseId(null);
    }, []);

    return { expenseId, members, guests, open, close };
}
