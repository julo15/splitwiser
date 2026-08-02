import { useOutletContext } from 'react-router-dom';

/**
 * Actions the shell owns and its routed screens can trigger. The add-expense
 * and settle-up surfaces are mounted once by AppShell rather than by each
 * screen, so they survive navigation.
 *
 * Kept out of AppShell.tsx so that file only exports its component.
 */
export interface ShellActions {
    openAddExpense: () => void;
    openSettleUp: () => void;
}

export function useShellActions(): ShellActions {
    return useOutletContext<ShellActions>();
}
