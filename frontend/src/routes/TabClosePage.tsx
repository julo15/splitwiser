import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, UsersThree } from '@phosphor-icons/react';
import { Avatar, Button, Card, Money } from '../components/ui';
import { useAuth } from '../AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { tabsApi } from '../services/api';
import { computeTabShares, unclaimedTotal } from '../utils/tabShares';
import type { Tab } from '../types/tab';

/**
 * Closing a tab: resolve what nobody claimed, name the payer, show everyone
 * their number, then write it as one direct expense.
 */
const TabClosePage: React.FC = () => {
    usePageTitle('Close the tab');
    const { tabId } = useParams<{ tabId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { refreshAll } = useAppData();

    const [tab, setTab] = useState<Tab | null>(null);
    const [loading, setLoading] = useState(true);
    const [closing, setClosing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [payerId, setPayerId] = useState<number | null>(null);

    const id = tabId ? parseInt(tabId, 10) : undefined;

    useEffect(() => {
        if (id === undefined) return;
        let cancelled = false;
        tabsApi
            .getById(id)
            .then((data: Tab) => {
                if (cancelled) return;
                setTab(data);
                // Default the payer to whoever opened the tab.
                const opener = data.participants.find(
                    (p) => p.user_id === data.created_by_id
                );
                setPayerId(opener?.id ?? null);
            })
            .catch(() => !cancelled && setError('Could not load this tab'))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [id]);

    const shareItems = useMemo(
        () =>
            (tab?.items ?? []).map((item) => ({
                id: item.id,
                price: item.price,
                claimedBy: item.claimed_by,
            })),
        [tab]
    );

    const shares = useMemo(
        () =>
            tab
                ? computeTabShares(
                      shareItems,
                      tab.participants.map((p) => p.id),
                      tab.tax,
                      tab.tip
                  )
                : {},
        [tab, shareItems]
    );

    const orphans = (tab?.items ?? []).filter((i) => i.claimed_by.length === 0);
    const orphanTotal = unclaimedTotal(shareItems);
    const perHead =
        tab && tab.participants.length > 0
            ? Math.round(orphanTotal / tab.participants.length)
            : 0;

    const handleClose = async () => {
        if (id === undefined) return;
        setClosing(true);
        setError(null);
        try {
            await tabsApi.close(id, payerId);
            await refreshAll();
            navigate(`/tabs/${id}`);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Could not close the tab'
            );
        } finally {
            setClosing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-sw-muted">Loading…</p>
            </div>
        );
    }

    if (!tab) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <p className="text-sm text-sw-muted">{error ?? 'Tab not found'}</p>
                <Button variant="secondary" onClick={() => navigate('/activity')}>
                    Back
                </Button>
            </div>
        );
    }

    const payer = tab.participants.find((p) => p.id === payerId) ?? null;
    const payerShare = payer ? (shares[payer.id] ?? 0) : 0;
    const billTotal = Object.values(shares).reduce((sum, value) => sum + value, 0);

    return (
        <>
            <div className="flex items-center gap-3 px-[18px] pb-3.5 pt-[max(1rem,env(safe-area-inset-top))] flex-none">
                <button
                    type="button"
                    onClick={() => navigate(`/tabs/${tab.id}`)}
                    aria-label="Back to the tab"
                    className="text-sw-muted flex-none"
                >
                    <ArrowLeft size={21} />
                </button>
                <div className="text-[17px] font-medium">Close the tab</div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto px-4 pb-4 flex flex-col gap-4">
                {orphans.length > 0 && (
                    <Card radius="lg" className="px-4 py-[15px] shadow-[0_0_0_1px_var(--sw-accent)]">
                        <div className="text-[14.5px] font-medium mb-0.5">
                            {orphans.length}{' '}
                            {orphans.length === 1 ? 'thing' : 'things'} nobody claimed —{' '}
                            <Money amount={orphanTotal} currency={tab.currency} />
                        </div>
                        <div className="text-[12.5px] text-sw-muted mb-3">
                            {orphans.map((o) => o.description).join(', ')}.
                        </div>
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[11px] bg-sw-accent-ghost shadow-[0_0_0_1px_var(--sw-accent)]">
                            <span className="w-[17px] h-[17px] rounded-full bg-sw-accent shadow-[inset_0_0_0_3.5px_var(--sw-bg)] flex-none" />
                            <span className="flex-1 text-[13.5px]">
                                Spread across the {tab.participants.length} of you
                            </span>
                            <Money
                                amount={perHead}
                                currency={tab.currency}
                                tone="muted"
                                className="text-[12.5px]"
                            />
                            <span className="text-[12.5px] text-sw-muted">each</span>
                        </div>
                        <p className="text-[11.5px] text-sw-dim mt-2">
                            Want them on someone in particular?{' '}
                            <button
                                type="button"
                                onClick={() => navigate(`/tabs/${tab.id}`)}
                                className="text-sw-accent hover:text-sw-text"
                            >
                                Go back and claim them
                            </button>
                            .
                        </p>
                    </Card>
                )}

                <div>
                    <div className="text-xs uppercase tracking-[0.08em] text-sw-dim mb-2">
                        Who actually paid?
                    </div>
                    <div className="flex gap-[7px] flex-wrap">
                        {tab.participants.map((participant) => {
                            const selected = participant.id === payerId;
                            // Only an account can carry a balance.
                            const eligible = participant.user_id !== null;
                            return (
                                <button
                                    key={participant.id}
                                    type="button"
                                    disabled={!eligible}
                                    onClick={() => setPayerId(participant.id)}
                                    title={
                                        eligible
                                            ? undefined
                                            : 'Only someone with an account can be the payer'
                                    }
                                    className={`flex items-center gap-1.5 pl-1.5 pr-3 py-[7px] rounded-full text-[13px] ${
                                        selected
                                            ? 'bg-sw-accent-ghost text-sw-accent shadow-[0_0_0_1px_var(--sw-accent)]'
                                            : 'bg-sw-surface text-sw-muted shadow-[0_0_0_1px_var(--sw-line)]'
                                    } ${eligible ? '' : 'opacity-45 cursor-not-allowed'}`}
                                >
                                    <Avatar
                                        name={participant.display_name}
                                        size={23}
                                        variant={selected ? 'accent' : 'neutral'}
                                    />
                                    {participant.user_id === user?.id
                                        ? 'You'
                                        : participant.display_name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <div className="text-xs uppercase tracking-[0.08em] text-sw-dim mb-2">
                        {payer
                            ? `Everyone owes ${
                                  payer.user_id === user?.id ? 'you' : payer.display_name
                              }`
                            : 'Everyone owes'}
                    </div>
                    <Card radius="lg" className="overflow-hidden">
                        {tab.participants.map((participant, index) => {
                            const owed = shares[participant.id] ?? 0;
                            const isPayer = participant.id === payerId;
                            const isMe = participant.user_id === user?.id;
                            return (
                                <div
                                    key={participant.id}
                                    className={`flex items-center gap-[11px] px-[15px] py-3 ${
                                        index < tab.participants.length - 1
                                            ? 'border-b border-sw-line'
                                            : ''
                                    }`}
                                >
                                    <Avatar
                                        name={participant.display_name}
                                        size={30}
                                        variant={isMe ? 'accent' : 'neutral'}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm truncate">
                                            {isMe ? 'You' : participant.display_name}
                                        </div>
                                        <div className="text-[11.5px] text-sw-dim truncate">
                                            {isPayer
                                                ? 'Paid the bill'
                                                : participant.user_id !== null
                                                  ? 'Splitwiser account'
                                                  : 'Guest'}
                                        </div>
                                    </div>
                                    {isPayer ? (
                                        <Money
                                            // What the payer is up: the bill less their own share.
                                            amount={billTotal - payerShare}
                                            currency={tab.currency}
                                            sign="always"
                                            tone="positive"
                                            className="text-[15px] font-medium"
                                        />
                                    ) : (
                                        <Money
                                            amount={owed}
                                            currency={tab.currency}
                                            className="text-[15px] font-medium"
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </Card>
                </div>

                <div className="flex items-start gap-2.5 px-3 py-3 rounded-sw-card shadow-[inset_0_0_0_1px_var(--sw-line)]">
                    <UsersThree size={17} className="text-sw-dim mt-0.5 flex-none" />
                    <p className="text-[12.5px] text-sw-muted leading-relaxed">
                        These land in your normal balances. Nothing new appears under
                        Groups.
                    </p>
                </div>

                {error && <p className="text-[12.5px] text-sw-neg">{error}</p>}
            </div>

            <div className="px-4 pt-3 pb-3.5 bg-sw-sunk border-t border-sw-line flex-none">
                <Button
                    variant="primary"
                    block
                    disabled={closing || !payer}
                    onClick={handleClose}
                    className="min-h-[46px]"
                >
                    {closing ? 'Closing…' : 'Close it and tell everyone'}
                </Button>
            </div>
        </>
    );
};

export default TabClosePage;
