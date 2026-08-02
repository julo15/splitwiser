// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    getParticipantKey,
    getParticipantName,
    shouldUseCompactMode,
    sortParticipants,
    getAssignmentDisplayText,
} from '../participantHelpers';
import type { Participant, ItemAssignment } from '../../types/expense';

const user = (id: number, name: string): Participant => ({ id, name, isGuest: false });
const guest = (id: number, name: string): Participant => ({ id, name, isGuest: true });
const expenseGuest = (id: number, name: string): Participant => ({
    id,
    name,
    isGuest: false,
    isExpenseGuest: true,
});

describe('getParticipantKey', () => {
    it('prefixes registered users with "user_"', () => {
        expect(getParticipantKey(user(5, 'Alice'))).toBe('user_5');
    });

    it('prefixes group guests with "guest_"', () => {
        expect(getParticipantKey(guest(3, 'Bob'))).toBe('guest_3');
    });

    it('prefixes expense guests with "expenseguest_"', () => {
        expect(getParticipantKey(expenseGuest(12, 'Carol'))).toBe('expenseguest_12');
    });

    it('distinguishes a user from a guest sharing the same id', () => {
        expect(getParticipantKey(user(1, 'A'))).not.toBe(getParticipantKey(guest(1, 'B')));
    });

    it('treats the expense-guest flag as taking precedence over isGuest', () => {
        const participant: Participant = { id: 7, name: 'D', isGuest: true, isExpenseGuest: true };
        expect(getParticipantKey(participant)).toBe('expenseguest_7');
    });
});

describe('getParticipantName', () => {
    it('renders the current user as "You"', () => {
        expect(getParticipantName(user(5, 'Alice'), 5)).toBe('You');
    });

    it('renders other users by name', () => {
        expect(getParticipantName(user(6, 'Bob'), 5)).toBe('Bob');
    });

    it('renders the name when there is no current user', () => {
        expect(getParticipantName(user(5, 'Alice'))).toBe('Alice');
    });

    it('never renders a guest as "You" even on an id collision', () => {
        expect(getParticipantName(guest(5, 'Guest Five'), 5)).toBe('Guest Five');
    });
});

describe('shouldUseCompactMode', () => {
    it('stays expanded at five participants', () => {
        const five = Array.from({ length: 5 }, (_, i) => user(i, `U${i}`));
        expect(shouldUseCompactMode(five)).toBe(false);
    });

    it('switches to compact above five participants', () => {
        const six = Array.from({ length: 6 }, (_, i) => user(i, `U${i}`));
        expect(shouldUseCompactMode(six)).toBe(true);
    });

    it('stays expanded for an empty list', () => {
        expect(shouldUseCompactMode([])).toBe(false);
    });
});

describe('sortParticipants', () => {
    it('puts the current user first', () => {
        const sorted = sortParticipants([user(1, 'Zoe'), user(2, 'Alice')], 1);
        expect(sorted.map(p => p.name)).toEqual(['Zoe', 'Alice']);
    });

    it('sorts everyone else alphabetically', () => {
        const sorted = sortParticipants([user(1, 'Zoe'), user(2, 'Alice'), user(3, 'Mia')], 3);
        expect(sorted.map(p => p.name)).toEqual(['Mia', 'Alice', 'Zoe']);
    });

    it('sorts alphabetically when there is no current user', () => {
        const sorted = sortParticipants([user(1, 'Zoe'), user(2, 'Alice')]);
        expect(sorted.map(p => p.name)).toEqual(['Alice', 'Zoe']);
    });

    it('does not mutate the input array', () => {
        const input = [user(1, 'Zoe'), user(2, 'Alice')];
        sortParticipants(input);
        expect(input.map(p => p.name)).toEqual(['Zoe', 'Alice']);
    });

    it('does not hoist a guest that shares the current user id', () => {
        const sorted = sortParticipants([guest(1, 'Zed'), user(2, 'Alice')], 1);
        expect(sorted.map(p => p.name)).toEqual(['Alice', 'Zed']);
    });

    it('handles an empty list', () => {
        expect(sortParticipants([])).toEqual([]);
    });
});

describe('getAssignmentDisplayText', () => {
    const alice = user(1, 'Alice');
    const bob = user(2, 'Bob');
    const carol = user(3, 'Carol');
    const dave = user(4, 'Dave');

    const assign = (id: number): ItemAssignment => ({ user_id: id, is_guest: false });

    it('flags an item nobody claimed', () => {
        expect(getAssignmentDisplayText([], [alice, bob])).toBe('⚠️ Unclaimed');
    });

    it('collapses a fully-assigned item to a count', () => {
        const text = getAssignmentDisplayText([assign(1), assign(2)], [alice, bob]);
        expect(text).toBe('All 2 people');
    });

    it('lists a single assignee', () => {
        expect(getAssignmentDisplayText([assign(1)], [alice, bob])).toBe('Alice');
    });

    it('lists two assignees', () => {
        const text = getAssignmentDisplayText([assign(1), assign(2)], [alice, bob, carol]);
        expect(text).toBe('Alice, Bob');
    });

    it('summarises three or more assignees', () => {
        const text = getAssignmentDisplayText(
            [assign(1), assign(2), assign(3)],
            [alice, bob, carol, dave]
        );
        expect(text).toBe('Alice, Bob +1 more');
    });

    it('renders the current user as "You"', () => {
        expect(getAssignmentDisplayText([assign(1)], [alice, bob], 1)).toBe('You');
    });

    it('matches expense guests by expense_guest_id', () => {
        const eg = expenseGuest(9, 'Erin');
        const assignments: ItemAssignment[] = [{ expense_guest_id: 9, is_guest: false }];
        expect(getAssignmentDisplayText(assignments, [alice, eg])).toBe('Erin');
    });

    it('matches group guests on the is_guest flag', () => {
        const g = guest(1, 'Guest One');
        const assignments: ItemAssignment[] = [{ user_id: 1, is_guest: true }];
        // Same id as `alice`, but the flag disambiguates.
        expect(getAssignmentDisplayText(assignments, [alice, g])).toBe('Guest One');
    });

    it('drops assignees that are not in the participant list', () => {
        const text = getAssignmentDisplayText([assign(1), assign(99)], [alice, bob, carol]);
        expect(text).toBe('Alice');
    });

    it('collapses to a count purely on assignment count, before resolving names', () => {
        // Documents the current short-circuit: the length check runs first, so a
        // stale assignee id still reads as "All N people".
        const text = getAssignmentDisplayText([assign(1), assign(99)], [alice, bob]);
        expect(text).toBe('All 2 people');
    });
});
