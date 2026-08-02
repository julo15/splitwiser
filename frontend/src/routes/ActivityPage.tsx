import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretRight, Receipt } from '@phosphor-icons/react';
import PageHeader from './PageHeader';
import ExpenseFeedRow from '../components/ExpenseFeedRow';
import { Card, Money } from '../components/ui';
import { tabsApi } from '../services/api';
import { claimedTotal, unclaimedTotal } from '../utils/tabShares';
import type { Tab } from '../types/tab';
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

    // Open tabs live here rather than under Groups — a tab is not a group.
    const [openTabs, setOpenTabs] = useState<Tab[]>([]);
    useEffect(() => {
        let cancelled = false;
        tabsApi
            .getAll('open')
            .then((data: Tab[]) => !cancelled && setOpenTabs(data))
            .catch(() => {
                // An older backend without /tabs should not break Activity.
            });
        return () => {
            cancelled = true;
        };
    }, []);

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
                {openTabs.length > 0 && (
                    <div className="max-w-3xl pt-3 pb-1">
                        <div className="text-[11px] uppercase tracking-[0.09em] text-sw-dim mb-2">
                            Open tabs
                        </div>
                        <div className="flex flex-col gap-2 mb-4">
                            {openTabs.map((tab) => {
                                const shareItems = tab.items.map((item) => ({
                                    id: item.id,
                                    price: item.price,
                                    claimedBy: item.claimed_by,
                                }));
                                const outstanding = unclaimedTotal(shareItems);
                                const spoken = claimedTotal(shareItems);
                                return (
                                    <Card
                                        key={tab.id}
                                        radius="lg"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => navigate(`/tabs/${tab.id}`)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                navigate(`/tabs/${tab.id}`);
                                            }
                                        }}
                                        className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-sw-raise focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-sw-pos flex-none" />
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-sm font-medium truncate">
                                                {tab.name}
                                            </span>
                                            <span className="block text-[11.5px] text-sw-dim truncate">
                                                {tab.participants.length}{' '}
                                                {tab.participants.length === 1 ? 'person' : 'people'}
                                                {outstanding > 0 ? (
                                                    <>
                                                        {' · '}
                                                        <Money amount={outstanding} currency={tab.currency} tone="muted" />{' '}
                                                        still unclaimed
                                                    </>
                                                ) : (
                                                    ' · everything claimed'
                                                )}
                                            </span>
                                        </span>
                                        <Money
                                            amount={spoken + outstanding + tab.tax + tab.tip}
                                            currency={tab.currency}
                                            className="text-sm flex-none"
                                        />
                                        <CaretRight size={16} className="text-sw-dim flex-none" />
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                )}

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
