import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus } from '@phosphor-icons/react';
import { Avatar, Button, Money } from '../components/ui';
import AddPersonSheet from '../components/AddPersonSheet';
import PageHeader from './PageHeader';
import { useAppData } from '../contexts/AppDataContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { useSettlement } from '../hooks/useSettlement';
import { settlementTotal } from '../utils/settlement';
import type { Counterparty } from '../utils/settlement';

interface Person {
    key: string;
    userId: number;
    isGuest: boolean;
    name: string;
    groups: string[];
    groupId?: number;
    /** Null for people you share no open balance with. */
    balance: Counterparty | null;
}

const PersonRow: React.FC<{ person: Person; onOpen: () => void }> = ({
    person,
    onOpen,
}) => (
    <button
        type="button"
        onClick={onOpen}
        className={`flex items-center gap-[11px] p-2.5 rounded-sw-row text-left hover:bg-sw-surface focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 ${
            person.balance ? '' : 'opacity-60'
        }`}
    >
        <Avatar name={person.name} />
        <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium truncate">{person.name}</div>
            {person.groups.length > 0 && (
                <div className="text-[11.5px] text-sw-dim truncate">
                    {person.groups[0]}
                    {person.groups.length > 1 && ` · ${person.groups.length - 1} more`}
                </div>
            )}
        </div>
        {person.balance ? (
            <Money
                amount={Math.abs(person.balance.amount)}
                currency={person.balance.currency}
                tone={person.balance.amount > 0 ? 'positive' : 'negative'}
                className="text-[13.5px] font-semibold flex-none"
            />
        ) : (
            <span className="text-xs text-sw-dim flex-none">even</span>
        )}
    </button>
);

const Section: React.FC<{
    label: string;
    people: Person[];
    onOpen: (person: Person) => void;
}> = ({ label, people, onOpen }) => {
    if (people.length === 0) return null;

    const total = settlementTotal(
        people.map((p) => p.balance).filter((b): b is Counterparty => b !== null)
    );

    return (
        <>
            <div className="px-1.5 pt-3.5 pb-1 text-[11px] uppercase tracking-[0.09em] text-sw-dim">
                {label}
                {total && total.amount !== 0 && (
                    <>
                        {' · '}
                        <Money
                            amount={Math.abs(total.amount)}
                            currency={total.currency}
                            tone="muted"
                        />
                    </>
                )}
            </div>
            {people.map((person) => (
                <PersonRow key={person.key} person={person} onOpen={() => onOpen(person)} />
            ))}
        </>
    );
};

/**
 * Everyone you share money with, filed into owes-you / you-owe / all-square.
 *
 * Figures come from the per-group debt simplification rather than /balances,
 * which returns per-group totals rather than per-person ones.
 */
const PeoplePage: React.FC = () => {
    usePageTitle('People');
    const navigate = useNavigate();
    const { friends, refreshFriends } = useAppData();
    const [addOpen, setAddOpen] = useState(false);
    const { counterparties, loading } = useSettlement();

    const { owed, owing, square } = useMemo(() => {
        const friendNames = new Map(friends.map((f) => [f.id, f.full_name]));
        const seen = new Set<number>();

        const withBalance: Person[] = counterparties.map((counterparty) => {
            if (!counterparty.isGuest) seen.add(counterparty.userId);
            return {
                key: counterparty.key,
                userId: counterparty.userId,
                isGuest: counterparty.isGuest,
                name:
                    (!counterparty.isGuest
                        ? friendNames.get(counterparty.userId)
                        : undefined) ?? `Person ${counterparty.userId}`,
                groups: counterparty.groups,
                groupId: counterparty.groupId,
                balance: counterparty,
            };
        });

        // Friends you are square with never appear in a simplification, but they
        // are still people you can start an expense with.
        const settled: Person[] = friends
            .filter((f) => !seen.has(f.id))
            .map((f) => ({
                key: `user-${f.id}`,
                userId: f.id,
                isGuest: false,
                name: f.full_name,
                groups: [],
                balance: null,
            }));

        const byMagnitude = (a: Person, b: Person) =>
            Math.abs(b.balance?.amount ?? 0) - Math.abs(a.balance?.amount ?? 0) ||
            a.name.localeCompare(b.name);

        return {
            owed: withBalance
                .filter((p) => (p.balance?.amount ?? 0) > 0)
                .sort(byMagnitude),
            owing: withBalance
                .filter((p) => (p.balance?.amount ?? 0) < 0)
                .sort(byMagnitude),
            square: settled.sort((a, b) => a.name.localeCompare(b.name)),
        };
    }, [counterparties, friends]);

    const openPerson = (person: Person) => {
        // Guests live inside their group; registered people have their own page.
        if (person.isGuest) {
            if (person.groupId) navigate(`/groups/${person.groupId}`);
            return;
        }
        navigate(`/friends/${person.userId}`);
    };

    const empty = owed.length === 0 && owing.length === 0 && square.length === 0;

    return (
        <>
            <PageHeader
                title="People"
                caption="Who you owe, and who owes you"
                mobileInset
                actions={
                    <Button
                        variant="secondary"
                        icon={<UserPlus size={15} />}
                        onClick={() => setAddOpen(true)}
                    >
                        Add someone
                    </Button>
                }
            />

            <div className="flex-1 overflow-auto px-2.5 pb-4 flex flex-col gap-0.5 max-w-3xl">
                {loading ? (
                    <p className="text-sm text-sw-dim py-8 text-center">Loading…</p>
                ) : empty ? (
                    <div className="flex flex-col items-center gap-3 py-12 px-1.5">
                        <p className="text-sm text-sw-dim text-center">
                            Nobody yet. Add someone by email, or put them in a group
                            and they turn up here.
                        </p>
                        <Button
                            variant="primary"
                            icon={<UserPlus size={15} />}
                            onClick={() => setAddOpen(true)}
                            className="min-h-[42px]"
                        >
                            Add someone
                        </Button>
                    </div>
                ) : (
                    <>
                        <Section label="Owes you" people={owed} onOpen={openPerson} />
                        <Section label="You owe" people={owing} onOpen={openPerson} />
                        <Section label="All square" people={square} onOpen={openPerson} />
                    </>
                )}
            </div>

            <AddPersonSheet
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onAdded={refreshFriends}
            />
        </>
    );
};

export default PeoplePage;
