import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, ShareNetwork, Trash } from '@phosphor-icons/react';
import { Avatar, Button, Card, Money } from '../components/ui';
import ClaimerStack from '../components/tab/ClaimerStack';
import { useAuth } from '../AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { tabsApi } from '../services/api';
import { claimedTotal, unclaimedTotal } from '../utils/tabShares';
import type { Tab, TabItem } from '../types/tab';

/** How often the board re-reads while people are still claiming. */
const POLL_MS = 5000;

/**
 * The host's view of a live tab.
 *
 * The design's claim is that the host only ever looks at what nobody has
 * claimed, so unclaimed lines lead and everything settled is filed below.
 */
const TabBoardPage: React.FC = () => {
    const { tabId } = useParams<{ tabId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [tab, setTab] = useState<Tab | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [newDescription, setNewDescription] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [copied, setCopied] = useState(false);

    usePageTitle(tab?.name ?? 'Tab');

    const id = tabId ? parseInt(tabId, 10) : undefined;

    const load = useCallback(
        async (showSpinner = false) => {
            if (id === undefined) return;
            if (showSpinner) setLoading(true);
            try {
                setTab(await tabsApi.getById(id));
                setError(null);
            } catch {
                setError('Could not load this tab');
            } finally {
                if (showSpinner) setLoading(false);
            }
        },
        [id]
    );

    useEffect(() => {
        load(true);
    }, [load]);

    // Claims arrive from other people's phones, so the board polls while open.
    useEffect(() => {
        if (!tab || tab.status !== 'open') return;
        const timer = setInterval(() => load(), POLL_MS);
        return () => clearInterval(timer);
    }, [tab, load]);

    const participantsById = useMemo(
        () => new Map((tab?.participants ?? []).map((p) => [p.id, p])),
        [tab]
    );

    const me = useMemo(
        () => (tab?.participants ?? []).find((p) => p.user_id === user?.id) ?? null,
        [tab, user?.id]
    );

    const shareItems = useMemo(
        () =>
            (tab?.items ?? []).map((item) => ({
                id: item.id,
                price: item.price,
                claimedBy: item.claimed_by,
            })),
        [tab]
    );

    const unclaimed = (tab?.items ?? []).filter((i) => i.claimed_by.length === 0);
    const sorted = (tab?.items ?? []).filter((i) => i.claimed_by.length > 0);
    const spokenFor = claimedTotal(shareItems);
    const outstanding = unclaimedTotal(shareItems);
    const billTotal = spokenFor + outstanding + (tab?.tax ?? 0) + (tab?.tip ?? 0);

    const shareLink = tab?.share_token
        ? `${window.location.origin}/t/${tab.share_token}`
        : null;

    const handleShare = async () => {
        if (!shareLink || !tab) return;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: `${tab.name} — what did you have?`,
                    text: 'Claim what you ordered:',
                    url: shareLink,
                });
            } else {
                await navigator.clipboard.writeText(shareLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        } catch {
            // Dismissing the share sheet rejects; not worth surfacing.
        }
    };

    const handleAddItem = async (event: React.FormEvent) => {
        event.preventDefault();
        if (id === undefined) return;
        const cents = Math.round(parseFloat(newPrice || '0') * 100);
        if (!newDescription.trim() || !Number.isFinite(cents) || cents <= 0) return;

        try {
            setTab(await tabsApi.addItem(id, newDescription.trim(), cents));
            setNewDescription('');
            setNewPrice('');
            setAdding(false);
        } catch {
            setError('Could not add that item');
        }
    };

    const handleDeleteItem = async (itemId: number) => {
        if (id === undefined) return;
        try {
            setTab(await tabsApi.deleteItem(id, itemId));
        } catch {
            setError('Could not remove that item');
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

    const renderItem = (item: TabItem, orphan: boolean) => {
        const claimers = item.claimed_by
            .map((pid) => participantsById.get(pid))
            .filter((p): p is NonNullable<typeof p> => Boolean(p));

        const names =
            claimers.length === 0
                ? null
                : claimers.length === tab.participants.length
                  ? 'Everyone'
                  : claimers
                        .map((p) => (p.id === me?.id ? 'You' : p.display_name))
                        .join(' and ');

        return (
            <div
                key={item.id}
                className={`flex items-center gap-[11px] p-3 rounded-sw-card ${
                    orphan
                        ? 'border border-dashed border-sw-accent bg-sw-accent-ghost'
                        : 'bg-sw-surface shadow-[0_0_0_1px_var(--sw-line)]'
                }`}
            >
                <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{item.description}</div>
                    <div
                        className={`text-[11.5px] truncate ${
                            orphan ? 'text-sw-accent' : 'text-sw-dim'
                        }`}
                    >
                        {orphan ? "Nobody's grabbed this yet" : names}
                    </div>
                </div>

                {!orphan && (
                    <ClaimerStack
                        participants={claimers}
                        currentParticipantId={me?.id}
                    />
                )}

                <Money
                    amount={item.price}
                    currency={tab.currency}
                    tone="muted"
                    className="text-[13.5px] w-[62px] text-right flex-none"
                />

                {tab.status === 'open' && item.added_manually && (
                    <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        aria-label={`Remove ${item.description}`}
                        className="text-sw-dim hover:text-sw-neg flex-none"
                    >
                        <Trash size={15} />
                    </button>
                )}
            </div>
        );
    };

    return (
        <>
            <div className="flex items-center gap-3 px-[18px] pb-3 pt-[max(1rem,env(safe-area-inset-top))] flex-none">
                <button
                    type="button"
                    onClick={() => navigate('/activity')}
                    aria-label="Back"
                    className="text-sw-muted flex-none"
                >
                    <ArrowLeft size={21} />
                </button>
                <div className="min-w-0">
                    <div className="text-base font-medium truncate">{tab.name}</div>
                    <div className="text-xs text-sw-dim flex items-center gap-1.5">
                        <span
                            className={`w-1.5 h-1.5 rounded-full ${
                                tab.status === 'open' ? 'bg-sw-pos' : 'bg-sw-dim'
                            }`}
                        />
                        {tab.status === 'open'
                            ? `${tab.participants.length} ${
                                  tab.participants.length === 1 ? 'person' : 'people'
                              } here now`
                            : 'Closed'}
                    </div>
                </div>
                {tab.status === 'open' && (
                    <Button
                        variant="secondary"
                        onClick={handleShare}
                        icon={<ShareNetwork size={15} />}
                        className="ml-auto flex-none"
                    >
                        {copied ? 'Copied' : 'Send link'}
                    </Button>
                )}
            </div>

            <div className="px-4 pb-3.5 flex-none">
                <Card radius="lg" className="px-4 py-[15px]">
                    <div className="flex items-baseline gap-2 mb-2.5">
                        <Money
                            amount={spokenFor}
                            currency={tab.currency}
                            className="text-[25px] font-medium"
                        />
                        <span className="text-[13px] text-sw-muted">
                            of{' '}
                            <Money
                                amount={billTotal}
                                currency={tab.currency}
                                tone="muted"
                            />{' '}
                            spoken for
                        </span>
                    </div>

                    <div className="h-[7px] rounded bg-sw-sunk overflow-hidden mb-3">
                        <div
                            className="h-full rounded bg-sw-accent transition-[width] duration-300"
                            style={{
                                width: `${billTotal > 0 ? Math.round((spokenFor / billTotal) * 100) : 0}%`,
                            }}
                        />
                    </div>

                    <div className="flex gap-[7px] flex-wrap">
                        {tab.participants.map((participant) => {
                            const hasClaimed = tab.items.some((item) =>
                                item.claimed_by.includes(participant.id)
                            );
                            return (
                                <span
                                    key={participant.id}
                                    className={`flex items-center gap-1.5 pl-[5px] pr-[11px] py-[5px] rounded-full text-[12.5px] ${
                                        hasClaimed
                                            ? 'bg-sw-accent-ghost text-sw-accent shadow-[0_0_0_1px_var(--sw-accent)]'
                                            : 'bg-sw-surface text-sw-muted shadow-[0_0_0_1px_var(--sw-line)]'
                                    }`}
                                >
                                    <Avatar
                                        name={participant.display_name}
                                        size={21}
                                        variant={hasClaimed ? 'accent' : 'neutral'}
                                    />
                                    {participant.id === me?.id
                                        ? 'You'
                                        : participant.display_name}
                                    {!hasClaimed && (
                                        <span className="text-[11px] text-sw-dim">
                                            picking…
                                        </span>
                                    )}
                                </span>
                            );
                        })}
                    </div>
                </Card>
            </div>

            <div className="flex-1 min-h-0 overflow-auto px-4 pb-4 flex flex-col gap-2">
                {error && <p className="text-[12.5px] text-sw-neg">{error}</p>}

                {unclaimed.length > 0 && (
                    <>
                        <div className="flex items-center gap-2 pb-1">
                            <div className="text-[11px] uppercase tracking-[0.09em] text-sw-dim">
                                Needs a home
                            </div>
                            <div className="ml-auto text-[11.5px] text-sw-dim">
                                {unclaimed.length}{' '}
                                {unclaimed.length === 1 ? 'item' : 'items'} ·{' '}
                                <Money
                                    amount={outstanding}
                                    currency={tab.currency}
                                    tone="muted"
                                />
                            </div>
                        </div>
                        {unclaimed.map((item) => renderItem(item, true))}
                    </>
                )}

                {sorted.length > 0 && (
                    <>
                        <div className="pt-2.5 pb-1 text-[11px] uppercase tracking-[0.09em] text-sw-dim">
                            Sorted
                        </div>
                        {sorted.map((item) => renderItem(item, false))}
                    </>
                )}

                {tab.status === 'open' && (
                    adding ? (
                        <form
                            onSubmit={handleAddItem}
                            className="flex flex-col gap-2 p-3 rounded-sw-card bg-sw-surface shadow-[0_0_0_1px_var(--sw-line)]"
                        >
                            <input
                                autoFocus
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                placeholder="Another round"
                                aria-label="Item name"
                                className="px-2.5 py-2 rounded-lg bg-sw-bg text-sw-text border border-sw-line placeholder:text-sw-dim focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                            />
                            <div className="flex gap-2">
                                <input
                                    value={newPrice}
                                    onChange={(e) => setNewPrice(e.target.value)}
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    aria-label="Price"
                                    className="sw-num flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-sw-bg text-sw-text border border-sw-line placeholder:text-sw-dim focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                                />
                                <Button variant="ghost" onClick={() => setAdding(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary">
                                    Add
                                </Button>
                            </div>
                        </form>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setAdding(true)}
                            className="flex items-center justify-center gap-1.5 p-3 rounded-sw-card text-[13px] text-sw-muted shadow-[0_0_0_1px_var(--sw-line)] hover:text-sw-text focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                        >
                            <Plus size={14} />
                            Add something the scan missed
                        </button>
                    )
                )}
            </div>

            {tab.status === 'open' ? (
                <div className="px-4 pt-3 pb-3.5 bg-sw-sunk border-t border-sw-line flex-none">
                    <Button
                        variant="primary"
                        block
                        onClick={() => navigate(`/tabs/${tab.id}/close`)}
                        className="min-h-[46px]"
                    >
                        Close the tab
                    </Button>
                </div>
            ) : (
                <div className="px-4 pt-3 pb-3.5 bg-sw-sunk border-t border-sw-line flex-none text-center">
                    <p className="text-[12.5px] text-sw-muted">
                        Closed — this landed in your normal balances.
                    </p>
                </div>
            )}
        </>
    );
};

export default TabBoardPage;
