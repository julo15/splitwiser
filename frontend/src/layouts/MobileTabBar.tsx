import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    House,
    UsersThree,
    User,
    ClockCounterClockwise,
    Plus,
} from '@phosphor-icons/react';

export interface MobileTabBarProps {
    /** Opens the FAB sheet. */
    onFabPress: () => void;
}

interface TabDef {
    to: string;
    label: string;
    Icon: React.ComponentType<{ size?: number; weight?: 'regular' | 'fill' }>;
    /** Match only the exact path — used for Home so it isn't always active. */
    end?: boolean;
}

const LEFT_TABS: TabDef[] = [
    { to: '/', label: 'Home', Icon: House, end: true },
    { to: '/groups', label: 'Groups', Icon: UsersThree },
];

const RIGHT_TABS: TabDef[] = [
    { to: '/people', label: 'People', Icon: User },
    { to: '/activity', label: 'Activity', Icon: ClockCounterClockwise },
];

const Tab: React.FC<{ tab: TabDef }> = ({ tab }) => (
    <NavLink
        to={tab.to}
        end={tab.end}
        className={({ isActive }) =>
            `flex flex-col items-center gap-[3px] w-[52px] ${
                isActive ? 'text-sw-accent' : 'text-sw-dim'
            }`
        }
    >
        {({ isActive }) => (
            <>
                <tab.Icon size={23} weight={isActive ? 'fill' : 'regular'} />
                <span className="text-[10px]">{tab.label}</span>
            </>
        )}
    </NavLink>
);

/**
 * The mobile bottom navigation: four destinations around a raised FAB that
 * breaks the bar's top edge. The FAB opens a sheet rather than jumping
 * straight into add-expense — one extra tap, in exchange for reaching all
 * three entry points from anywhere.
 */
const MobileTabBar: React.FC<MobileTabBarProps> = ({ onFabPress }) => (
    <nav
        aria-label="Primary"
        className="relative flex items-center justify-between px-[22px] pt-2.5 pb-1.5 bg-sw-sunk border-t border-sw-line flex-none"
        // Keep the bar clear of the iOS home indicator.
        style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
    >
        {LEFT_TABS.map((tab) => (
            <Tab key={tab.to} tab={tab} />
        ))}

        <div className="w-[60px] h-[52px] flex items-start justify-center">
            <button
                type="button"
                onClick={onFabPress}
                aria-label="New expense, tab or settlement"
                className="w-14 h-14 -mt-[22px] rounded-sw-fab bg-sw-accent text-sw-on-accent flex items-center justify-center shadow-[0_8px_22px_rgba(145,132,217,.35)] focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
            >
                <Plus size={28} weight="fill" />
            </button>
        </div>

        {RIGHT_TABS.map((tab) => (
            <Tab key={tab.to} tab={tab} />
        ))}
    </nav>
);

export default MobileTabBar;
