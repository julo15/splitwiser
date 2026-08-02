import React, { useCallback, useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import DesktopRail from './DesktopRail';
import MobileTabBar from './MobileTabBar';
import FabSheet from './FabSheet';
import type { ResumeTarget } from './FabSheet';
import AddExpenseModal from '../AddExpenseModal';
import SettleUpModal from '../SettleUpModal';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useAppData } from '../contexts/AppDataContext';
import { pinnedGroups } from '../utils/groupBalances';
import type { ShellActions } from './shellActions';

/**
 * The persistent frame around every authenticated screen.
 *
 * "One app, two postures": on desktop a rail sits beside a workspace that fills
 * the rest of the viewport; on mobile the same routes render full-bleed above a
 * bottom tab bar with the FAB. Which one mounts is decided in JS rather than by
 * CSS, because the two postures render structurally different components.
 */
const AppShell: React.FC = () => {
    const isDesktop = useIsDesktop();
    const navigate = useNavigate();
    const { friends, groups, balances, refreshAll, refreshBalances } = useAppData();

    const [fabOpen, setFabOpen] = useState(false);
    const [expenseModal, setExpenseModal] = useState<{
        open: boolean;
        scanner: boolean;
    }>({ open: false, scanner: false });
    const [settleUpOpen, setSettleUpOpen] = useState(false);

    const pinned = useMemo(
        () =>
            pinnedGroups(groups, balances).map(({ group, net }) => ({
                group,
                balance: net ? net.amount : null,
                currency: net ? net.currency : 'USD',
            })),
        [groups, balances]
    );

    // "Pick up where you left off" — the groups you have most at stake in.
    // Open tabs will join this strip once the tab flow exists.
    //
    // The caption is the group's standing balance rather than a member count:
    // /groups returns groups without their members, so a count here would
    // always read "0 people".
    const resumeTargets: ResumeTarget[] = useMemo(
        () =>
            pinnedGroups(groups, balances, 2).map(({ group, net }) => ({
                key: `group-${group.id}`,
                label: group.name,
                caption:
                    net && net.amount !== 0
                        ? net.amount > 0
                            ? 'you are owed'
                            : 'you owe'
                        : 'all square',
                icon: group.icon || '👥',
                onSelect: () => navigate(`/groups/${group.id}`),
            })),
        [groups, balances, navigate]
    );

    const openAddExpense = useCallback(
        () => setExpenseModal({ open: true, scanner: false }),
        []
    );
    const openSettleUp = useCallback(() => setSettleUpOpen(true), []);
    const shellActions = useMemo<ShellActions>(
        () => ({ openAddExpense, openSettleUp }),
        [openAddExpense, openSettleUp]
    );

    const content = (
        <>
            <Outlet context={shellActions} />

            <AddExpenseModal
                isOpen={expenseModal.open}
                openScanner={expenseModal.scanner}
                onClose={() => setExpenseModal({ open: false, scanner: false })}
                onExpenseAdded={refreshAll}
                friends={friends}
                groups={groups}
            />

            <SettleUpModal
                isOpen={settleUpOpen}
                onClose={() => setSettleUpOpen(false)}
                onSettled={refreshBalances}
                friends={friends}
            />
        </>
    );

    if (isDesktop) {
        return (
            <div className="flex h-screen bg-sw-bg text-sw-text font-sans overflow-hidden">
                <DesktopRail
                    groupCount={groups.length}
                    peopleCount={friends.length}
                    pinned={pinned}
                />
                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    {content}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-sw-bg text-sw-text font-sans overflow-hidden">
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{content}</div>

            <MobileTabBar onFabPress={() => setFabOpen(true)} />

            <FabSheet
                open={fabOpen}
                onClose={() => setFabOpen(false)}
                onAddExpense={openAddExpense}
                onSplitBill={() => setExpenseModal({ open: true, scanner: true })}
                onSettleUp={openSettleUp}
                resumeTargets={resumeTargets}
            />
        </div>
    );
};

export default AppShell;
