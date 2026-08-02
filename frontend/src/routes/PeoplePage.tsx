import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Money, SegmentedControl } from '../components/ui';
import PageHeader from './PageHeader';
import { useAppData } from '../contexts/AppDataContext';
import { usePageTitle } from '../hooks/usePageTitle';
import {
    aggregatePeople,
    bucketPeople,
    bucketTotal,
} from '../utils/peopleBalances';
import type { PersonBalance } from '../utils/peopleBalances';

const PersonRow: React.FC<{ person: PersonBalance; onOpen: () => void }> = ({
    person,
    onOpen,
}) => {
    const square = person.net === 0;

    return (
        <button
            type="button"
            onClick={onOpen}
            className={`flex items-center gap-[11px] p-2.5 rounded-sw-row text-left hover:bg-sw-surface focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 ${
                square ? 'opacity-60' : ''
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
            {square ? (
                <span className="text-xs text-sw-dim flex-none">even</span>
            ) : (
                <div className="flex flex-col items-end flex-none">
                    {person.totals.map((total) => (
                        <Money
                            key={total.currency}
                            amount={total.amount}
                            currency={total.currency}
                            tone="auto"
                            className="text-[13.5px] font-semibold"
                        />
                    ))}
                </div>
            )}
        </button>
    );
};

const Section: React.FC<{
    label: string;
    people: PersonBalance[];
    onOpen: (person: PersonBalance) => void;
}> = ({ label, people, onOpen }) => {
    if (people.length === 0) return null;
    const total = bucketTotal(people);

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
                <PersonRow
                    key={person.key}
                    person={person}
                    onOpen={() => onOpen(person)}
                />
            ))}
        </>
    );
};

/**
 * Everyone you share money with, filed into owes-you / you-owe / all-square.
 */
const PeoplePage: React.FC = () => {
    usePageTitle('People');
    const navigate = useNavigate();
    const { balances, friends, showInMyCurrency, setShowInMyCurrency, displayCurrency } =
        useAppData();

    const buckets = useMemo(
        () => bucketPeople(aggregatePeople(balances)),
        [balances]
    );

    // Friends with no shared expenses never appear in the balance list, but
    // they are still people you can start one with.
    const untouched = useMemo(() => {
        const seen = new Set(
            balances.filter((b) => !b.is_guest).map((b) => b.user_id)
        );
        return friends
            .filter((f) => !seen.has(f.id))
            .map<PersonBalance>((f) => ({
                key: `user-${f.id}`,
                userId: f.id,
                isGuest: false,
                name: f.full_name,
                totals: [],
                groups: [],
                net: 0,
                netCurrency: null,
            }));
    }, [friends, balances]);

    const openPerson = (person: PersonBalance) => {
        // Guests live inside their group; registered people have their own page.
        if (person.isGuest) {
            if (person.groupId) navigate(`/groups/${person.groupId}`);
            return;
        }
        navigate(`/friends/${person.userId}`);
    };

    const square = [...buckets.square, ...untouched];

    return (
        <>
            <PageHeader
                title="People"
                caption="Who you owe, and who owes you"
                mobileInset
                actions={
                    <SegmentedControl
                        label="Balance currency"
                        size="sm"
                        value={showInMyCurrency ? 'converted' : 'native'}
                        onChange={(value) => setShowInMyCurrency(value === 'converted')}
                        options={[
                            { value: 'converted', label: `In ${displayCurrency}` },
                            { value: 'native', label: 'Per group' },
                        ]}
                    />
                }
            />

            <div className="flex-1 overflow-auto px-2.5 pb-4 flex flex-col gap-0.5">
                <Section label="Owes you" people={buckets.owed} onOpen={openPerson} />
                <Section label="You owe" people={buckets.owing} onOpen={openPerson} />
                <Section label="All square" people={square} onOpen={openPerson} />

                {buckets.owed.length === 0 &&
                    buckets.owing.length === 0 &&
                    square.length === 0 && (
                        <p className="text-sm text-sw-dim px-1.5 py-8 text-center">
                            Nobody yet. Add an expense and the people in it show up here.
                        </p>
                    )}
            </div>
        </>
    );
};

export default PeoplePage;
