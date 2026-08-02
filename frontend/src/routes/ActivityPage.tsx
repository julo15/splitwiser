import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt } from '@phosphor-icons/react';
import PageHeader from './PageHeader';
import ExpenseFeedRow from '../components/ExpenseFeedRow';
import { useAuth } from '../AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { useExpenseFeed } from '../hooks/useExpenseFeed';
import { useExpenseLabels } from '../hooks/useExpenseLabels';
import type { FeedExpense } from '../hooks/useExpenseFeed';

/**
 * Everything that has happened, newest first — the "Lately" feed at full
 * length.
 */
const ActivityPage: React.FC = () => {
    usePageTitle('Activity');
    const navigate = useNavigate();
    const { user } = useAuth();
    const { expenses, loading } = useExpenseFeed();
    const { payerName, groupName } = useExpenseLabels();

    /**
     * Open the expense in the context that owns it. The detail modal needs the
     * group's members and guests to render splits, and those are only loaded by
     * the group page — so route there rather than opening a modal without them.
     */
    const open = (expense: FeedExpense) => {
        if (expense.group_id) {
            navigate(`/groups/${expense.group_id}`);
        } else if (!expense.payer_is_guest && expense.payer_id !== user?.id) {
            navigate(`/friends/${expense.payer_id}`);
        }
    };

    return (
        <>
            <PageHeader
                title="Activity"
                caption="Every expense you're part of"
                mobileInset
            />

            <div className="flex-1 overflow-auto px-4 lg:px-[22px] pb-4">
                {loading ? (
                    <p className="text-sm text-sw-dim py-8 text-center">Loading…</p>
                ) : expenses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
                        <div className="w-16 h-16 rounded-full bg-sw-surface flex items-center justify-center text-sw-dim">
                            <Receipt size={30} />
                        </div>
                        <p className="text-sm text-sw-muted">Nothing yet</p>
                        <p className="text-[12.5px] text-sw-dim">
                            Expenses you add or get added to will show up here.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col max-w-3xl">
                        {expenses.map((expense) => (
                            <ExpenseFeedRow
                                key={expense.id}
                                expense={expense}
                                payerName={payerName}
                                groupName={groupName(expense)}
                                onClick={() => open(expense)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};

export default ActivityPage;
