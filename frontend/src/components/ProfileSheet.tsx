import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CaretRight,
    Gear,
    Moon,
    Question,
    SignOut,
    Sun,
} from '@phosphor-icons/react';
import { Avatar, Badge, Sheet } from './ui';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import { useAppData } from '../contexts/AppDataContext';

export interface ProfileSheetProps {
    open: boolean;
    onClose: () => void;
}

/**
 * Account, help, theme and sign-out.
 *
 * The redesign replaced the old sidebar, which was where all of these lived.
 * The rail has room for a theme toggle and a gear, but nothing else, and the
 * mobile tab bar has five fixed slots — so they collect here instead, reachable
 * from the rail footer on desktop and the home header on mobile.
 */
const ProfileSheet: React.FC<ProfileSheetProps> = ({ open, onClose }) => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const { pendingRequests } = useAppData();

    const go = (path: string) => () => {
        onClose();
        navigate(path);
    };

    const rowClass =
        'flex items-center gap-3 w-full px-3.5 py-3 rounded-sw-card bg-sw-surface shadow-[0_0_0_1px_var(--sw-line)] text-left text-sm hover:bg-sw-raise focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2';

    return (
        <Sheet open={open} onClose={onClose} label="Your account">
            <div className="flex items-center gap-3 px-1 pb-1">
                <Avatar name={user?.full_name || ''} size={38} variant="accent" />
                <div className="min-w-0">
                    <div className="text-[15px] font-medium truncate">
                        {user?.full_name}
                    </div>
                    <div className="text-[12px] text-sw-dim truncate">{user?.email}</div>
                </div>
            </div>

            <button type="button" onClick={go('/account')} className={rowClass}>
                <Gear size={18} className="text-sw-muted flex-none" />
                <span className="flex-1 min-w-0">
                    <span className="block">Account settings</span>
                    {pendingRequests > 0 && (
                        <span className="block text-[12px] text-sw-accent">
                            {pendingRequests === 1
                                ? '1 friend request waiting'
                                : `${pendingRequests} friend requests waiting`}
                        </span>
                    )}
                </span>
                <Badge
                    count={pendingRequests}
                    variant="count"
                    ring="none"
                    label={`${pendingRequests} friend request${
                        pendingRequests === 1 ? '' : 's'
                    } waiting`}
                    className="flex-none"
                />
                <CaretRight size={16} className="text-sw-dim flex-none" />
            </button>

            <button type="button" onClick={go('/help')} className={rowClass}>
                <Question size={18} className="text-sw-muted flex-none" />
                <span className="flex-1">Help &amp; FAQ</span>
                <CaretRight size={16} className="text-sw-dim flex-none" />
            </button>

            <button
                type="button"
                onClick={toggleTheme}
                aria-pressed={isDark}
                className={rowClass}
            >
                {isDark ? (
                    <Sun size={18} className="text-sw-muted flex-none" />
                ) : (
                    <Moon size={18} className="text-sw-muted flex-none" />
                )}
                <span className="flex-1">
                    {isDark ? 'Switch to light' : 'Switch to dark'}
                </span>
            </button>

            <button
                type="button"
                onClick={() => {
                    onClose();
                    logout();
                }}
                className={`${rowClass} text-sw-neg`}
            >
                <SignOut size={18} className="flex-none" />
                <span className="flex-1">Log out</span>
            </button>
        </Sheet>
    );
};

export default ProfileSheet;
