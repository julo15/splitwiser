import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    ArrowsLeftRight,
    SquaresFour,
    UsersThree,
    User,
    ClockCounterClockwise,
    Moon,
    Sun,
    Gear,
} from '@phosphor-icons/react';
import { Avatar, Badge, Money } from '../components/ui';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import type { Group } from '../types/group';

export interface PinnedGroup {
    group: Group;
    /** Net balance in cents for this group, or null when it is all square. */
    balance: number | null;
    currency: string;
}

export interface DesktopRailProps {
    groupCount?: number;
    peopleCount?: number;
    pinned?: PinnedGroup[];
    /** Opens the account menu — help and sign-out live there too. */
    onOpenProfile?: () => void;
    /** Things waiting on you behind the account menu. */
    pendingRequests?: number;
}

interface NavDef {
    to: string;
    label: string;
    Icon: React.ComponentType<{ size?: number; weight?: 'regular' | 'fill' }>;
    end?: boolean;
    count?: number;
}

/**
 * The 222px desktop rail: brand, the four destinations, a pinned-groups strip
 * with live balances, and the account footer. It stays mounted across every
 * route — the redesign's core claim is that nothing on desktop hides behind a
 * page jump.
 */
const DesktopRail: React.FC<DesktopRailProps> = ({
    groupCount,
    peopleCount,
    pinned = [],
    onOpenProfile,
    pendingRequests = 0,
}) => {
    const { user } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const navigate = useNavigate();

    const navItems: NavDef[] = [
        { to: '/', label: 'Overview', Icon: SquaresFour, end: true },
        { to: '/groups', label: 'Groups', Icon: UsersThree, count: groupCount },
        { to: '/people', label: 'People', Icon: User, count: peopleCount },
        { to: '/activity', label: 'Activity', Icon: ClockCounterClockwise },
    ];

    return (
        <div className="w-[222px] flex-none bg-sw-sunk border-r border-sw-line flex flex-col gap-[22px] px-3 py-[18px]">
            <div className="flex items-center gap-[9px] px-2">
                <div className="w-6 h-6 rounded-[7px] bg-sw-accent text-sw-on-accent flex items-center justify-center flex-none">
                    <ArrowsLeftRight size={14} weight="fill" />
                </div>
                <div className="text-base font-medium tracking-[-0.01em]">Splitwiser</div>
            </div>

            <nav aria-label="Primary" className="flex flex-col gap-0.5">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                            `flex items-center gap-2.5 px-2.5 py-2 rounded-lg ${
                                isActive
                                    ? 'bg-sw-accent-ghost text-sw-accent font-medium'
                                    : 'text-sw-muted hover:text-sw-text'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <item.Icon
                                    size={17}
                                    weight={isActive ? 'fill' : 'regular'}
                                />
                                {item.label}
                                {item.count !== undefined && (
                                    <span className="ml-auto text-xs">{item.count}</span>
                                )}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            {pinned.length > 0 && (
                <div className="flex flex-col gap-2 min-h-0">
                    <div className="text-[11px] uppercase tracking-[0.09em] text-sw-dim px-2.5">
                        Pinned
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-auto">
                        {pinned.map(({ group, balance, currency }) => (
                            <button
                                key={group.id}
                                type="button"
                                onClick={() => navigate(`/groups/${group.id}`)}
                                title={group.name}
                                className="flex items-center gap-2 px-2 py-[7px] rounded-lg text-sw-muted hover:text-sw-text text-left focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                            >
                                <span className="text-[15px] flex-none" aria-hidden="true">
                                    {group.icon || '👥'}
                                </span>
                                <span className="truncate text-[13px]">{group.name}</span>
                                {balance === null || balance === 0 ? (
                                    <span className="ml-auto text-[11px] text-sw-dim flex-none">
                                        even
                                    </span>
                                ) : (
                                    <Money
                                        amount={balance}
                                        currency={currency}
                                        sign="always"
                                        tone="auto"
                                        className="ml-auto text-[11px] flex-none"
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-auto flex flex-col gap-2.5">
                <div className="h-px bg-sw-line" aria-hidden="true" />
                <div className="flex items-center gap-[9px] px-2 py-1">
                    <button
                        type="button"
                        onClick={onOpenProfile}
                        aria-label="Your account"
                        className="flex items-center gap-[9px] min-w-0 flex-1 text-left rounded hover:text-sw-text focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                    >
                        <span className="relative flex-none">
                            <Avatar
                                name={user?.full_name || ''}
                                variant="accent"
                                size={26}
                            />
                            <Badge
                                count={pendingRequests}
                                ring="sunk"
                                label={`${pendingRequests} friend request${
                                    pendingRequests === 1 ? '' : 's'
                                } waiting`}
                                className="absolute -top-0.5 -right-0.5"
                            />
                        </span>
                        <span className="text-[13px] truncate">{user?.full_name}</span>
                    </button>
                    <div className="ml-auto flex gap-0.5 text-sw-dim flex-none">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                            className="p-0.5 rounded hover:text-sw-text focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                        >
                            {isDark ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                        <button
                            type="button"
                            onClick={onOpenProfile}
                            aria-label="Account settings"
                            className="p-0.5 rounded hover:text-sw-text focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                        >
                            <Gear size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DesktopRail;
