import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Percent, PencilSimple } from '@phosphor-icons/react';
import { Button, Money } from '../components/ui';
import { usePageTitle } from '../hooks/usePageTitle';
import { publicTabsApi } from '../services/api';
import { computeTabShares } from '../utils/tabShares';
import type { PublicTab, TabJoinResponse } from '../types/tab';

/**
 * Where the claim token lives. The person has no account, so this is the only
 * thing that lets them come back and change their mind — losing it would strand
 * their claims under a name they can no longer edit.
 */
const storageKey = (shareToken: string) => `sw.tab.${shareToken}`;

interface StoredIdentity {
    claimToken: string;
    participantId: number;
    displayName: string;
}

function loadIdentity(shareToken: string): StoredIdentity | null {
    try {
        const raw = localStorage.getItem(storageKey(shareToken));
        return raw ? (JSON.parse(raw) as StoredIdentity) : null;
    } catch {
        return null;
    }
}

function saveIdentity(shareToken: string, identity: StoredIdentity) {
    try {
        localStorage.setItem(storageKey(shareToken), JSON.stringify(identity));
    } catch {
        // A private-mode browser can refuse; claiming still works for this
        // session, it just will not survive a reload.
    }
}

/**
 * The guest side of a tab: a name, some taps, no signup.
 *
 * Rendered outside the app shell and without auth — the share token is the
 * only credential, and most people opening this will never have an account.
 */
const TabClaimPage: React.FC = () => {
    const { shareToken = '' } = useParams<{ shareToken: string }>();

    const [tab, setTab] = useState<PublicTab | null>(null);
    const [identity, setIdentity] = useState<StoredIdentity | null>(null);
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [renaming, setRenaming] = useState(false);

    usePageTitle(tab ? `${tab.name} — what did you have?` : 'Claim your items');

    const load = useCallback(async () => {
        try {
            setTab(await publicTabsApi.get(shareToken));
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'This link is not valid');
        } finally {
            setLoading(false);
        }
    }, [shareToken]);

    useEffect(() => {
        setIdentity(loadIdentity(shareToken));
        load();
    }, [shareToken, load]);

    // Other people are claiming at the same table; keep the board fresh.
    useEffect(() => {
        if (!tab || tab.status !== 'open') return;
        const timer = setInterval(load, 5000);
        return () => clearInterval(timer);
    }, [tab, load]);

    const shareItems = useMemo(
        () =>
            (tab?.items ?? []).map((item) => ({
                id: item.id,
                price: item.price,
                claimedBy: item.claimed_by,
            })),
        [tab]
    );

    const myShare = useMemo(() => {
        if (!tab || !identity) return 0;
        const shares = computeTabShares(
            shareItems,
            tab.participants.map((p) => p.id),
            tab.tax,
            tab.tip
        );
        return shares[identity.participantId] ?? 0;
    }, [tab, identity, shareItems]);

    const handleJoin = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const result: TabJoinResponse = await publicTabsApi.join(
                shareToken,
                name.trim()
            );
            const next = {
                claimToken: result.claim_token,
                participantId: result.participant.id,
                displayName: result.participant.display_name,
            };
            saveIdentity(shareToken, next);
            setIdentity(next);
            setTab(result.tab);
            setRenaming(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not join');
        } finally {
            setBusy(false);
        }
    };

    const toggleItem = async (itemId: number, claimed: boolean) => {
        if (!identity) return;
        setBusy(true);
        try {
            setTab(
                await publicTabsApi.claim(
                    shareToken,
                    itemId,
                    identity.claimToken,
                    claimed
                )
            );
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not update that');
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-sw-bg text-sw-text font-sans flex items-center justify-center">
                <p className="text-sm text-sw-muted">Loading…</p>
            </div>
        );
    }

    if (!tab) {
        return (
            <div className="min-h-screen bg-sw-bg text-sw-text font-sans flex flex-col items-center justify-center gap-2 px-8 text-center">
                <p className="text-[17px] font-medium">This link isn't working</p>
                <p className="text-[13px] text-sw-muted">
                    {error ?? 'It may have expired, or the tab is already closed.'}
                </p>
            </div>
        );
    }

    // Not joined yet: ask for a first name and nothing else.
    if (!identity || renaming) {
        return (
            <div className="min-h-screen bg-sw-bg text-sw-text font-sans flex flex-col">
                <div className="px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-3.5">
                    <div className="text-xs uppercase tracking-[0.08em] text-sw-dim">
                        {tab.name}
                    </div>
                    <h1 className="text-[21px] font-medium mt-1 tracking-[-0.01em]">
                        Someone got the bill. What did you have?
                    </h1>
                </div>

                <form onSubmit={handleJoin} className="px-4 flex flex-col gap-3">
                    <label className="text-[13px] text-sw-muted" htmlFor="claim-name">
                        Your first name
                    </label>
                    <input
                        id="claim-name"
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Maya"
                        className="px-3 py-3 rounded-sw-card bg-sw-surface text-sw-text border border-sw-line placeholder:text-sw-dim focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                    />
                    {error && <p className="text-[12.5px] text-sw-neg">{error}</p>}
                    <Button
                        type="submit"
                        variant="primary"
                        block
                        disabled={busy || !name.trim()}
                        className="min-h-[46px]"
                    >
                        {busy ? 'One moment…' : 'Start claiming'}
                    </Button>
                    <p className="text-[11.5px] text-sw-dim text-center">
                        No account needed. You can make one later and we'll attach this.
                    </p>
                </form>
            </div>
        );
    }

    const participantsById = new Map(tab.participants.map((p) => [p.id, p]));

    return (
        <div className="min-h-screen bg-sw-bg text-sw-text font-sans flex flex-col">
            <div className="px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-3.5 flex-none">
                <div className="text-xs uppercase tracking-[0.08em] text-sw-dim">
                    {tab.name}
                </div>
                <h1 className="text-[21px] font-medium mt-1 tracking-[-0.01em]">
                    What did you have?
                </h1>
            </div>

            <div className="px-4 pb-3.5 flex-none">
                <button
                    type="button"
                    onClick={() => {
                        setName(identity.displayName);
                        setRenaming(true);
                    }}
                    className="w-full flex items-center gap-[11px] px-3.5 py-3 rounded-sw-card bg-sw-surface shadow-[0_0_0_1px_var(--sw-line)] text-left"
                >
                    <span className="w-8 h-8 rounded-full bg-sw-accent-soft text-sw-accent flex items-center justify-center text-xs font-semibold flex-none">
                        {identity.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="block text-sm">
                            You're claiming as{' '}
                            <span className="font-medium">{identity.displayName}</span>
                        </span>
                        <span className="block text-[11.5px] text-sw-dim">
                            No account needed — tap to use a different name
                        </span>
                    </span>
                    <PencilSimple size={16} className="text-sw-dim flex-none" />
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto px-4 flex flex-col gap-2">
                {error && <p className="text-[12.5px] text-sw-neg">{error}</p>}

                {tab.items.map((item) => {
                    const mine = item.claimed_by.includes(identity.participantId);
                    const others = item.claimed_by
                        .filter((pid) => pid !== identity.participantId)
                        .map((pid) => participantsById.get(pid)?.display_name)
                        .filter(Boolean) as string[];

                    const yourBit = mine
                        ? Math.round(item.price / item.claimed_by.length)
                        : null;

                    return (
                        <button
                            key={item.id}
                            type="button"
                            disabled={busy || tab.status !== 'open'}
                            onClick={() => toggleItem(item.id, !mine)}
                            aria-pressed={mine}
                            className={`flex items-center gap-3 p-3 rounded-sw-card text-left disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 ${
                                mine
                                    ? 'bg-sw-accent-ghost shadow-[0_0_0_1px_var(--sw-accent)]'
                                    : 'bg-sw-surface shadow-[0_0_0_1px_var(--sw-line)]'
                            }`}
                        >
                            <span
                                className={`w-[22px] h-[22px] rounded-[7px] flex items-center justify-center flex-none ${
                                    mine
                                        ? 'bg-sw-accent text-sw-on-accent'
                                        : 'shadow-[inset_0_0_0_1.5px_var(--sw-line)]'
                                }`}
                            >
                                {mine && <Check size={14} weight="bold" />}
                            </span>

                            <span className="flex-1 min-w-0">
                                <span className="block text-sm truncate">
                                    {item.description}
                                </span>
                                <span
                                    className={`block text-[11.5px] truncate ${
                                        mine ? 'text-sw-accent' : 'text-sw-dim'
                                    }`}
                                >
                                    {mine && others.length > 0 && (
                                        <>
                                            Splitting with {others.join(', ')} ·{' '}
                                            <Money
                                                amount={yourBit ?? 0}
                                                currency={tab.currency}
                                                tone="default"
                                            />{' '}
                                            you
                                        </>
                                    )}
                                    {mine && others.length === 0 && 'All yours'}
                                    {!mine && others.length > 0 &&
                                        `${others.join(', ')} took this`}
                                    {!mine && others.length === 0 && 'Still going spare'}
                                </span>
                            </span>

                            <Money
                                amount={item.price}
                                currency={tab.currency}
                                tone="muted"
                                className="text-[13.5px] flex-none"
                            />
                        </button>
                    );
                })}

                {(tab.tax > 0 || tab.tip > 0) && (
                    <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-sw-card shadow-[inset_0_0_0_1px_var(--sw-line)] text-[13px] text-sw-muted">
                        <Percent size={16} className="flex-none" />
                        Tax and tip get added on, in proportion to what you ordered.
                    </div>
                )}
            </div>

            <div
                className="px-4 pt-3.5 bg-sw-sunk border-t border-sw-line flex-none"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
                <div className="flex items-baseline mb-2.5">
                    <div className="text-[13px] text-sw-muted">Your bit</div>
                    <Money
                        amount={myShare}
                        currency={tab.currency}
                        className="ml-auto text-2xl font-medium"
                    />
                </div>
                <p className="text-[11.5px] text-sw-dim text-center">
                    {tab.status === 'open'
                        ? 'Your picks save as you tap. Come back any time before the tab closes.'
                        : "This tab has been closed — that's your final share."}
                </p>
            </div>
        </div>
    );
};

export default TabClaimPage;
