import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query.
 *
 * The redesign is "one app, two postures": below the desktop breakpoint the
 * shell is a bottom tab bar over a single pane, above it a rail plus a
 * three-pane workspace. That is a structural difference — different components
 * mount, not just different CSS — so the breakpoint has to be readable from JS.
 *
 * Implemented with useSyncExternalStore so the match is read during render
 * rather than synced into state by an effect, which would render once with a
 * stale value and immediately re-render.
 */
export function useMediaQuery(query: string): boolean {
    const subscribe = useCallback(
        (onChange: () => void) => {
            if (typeof window === 'undefined' || !window.matchMedia) return () => {};
            const list = window.matchMedia(query);
            list.addEventListener('change', onChange);
            return () => list.removeEventListener('change', onChange);
        },
        [query]
    );

    const getSnapshot = useCallback(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return false;
        return window.matchMedia(query).matches;
    }, [query]);

    // Server snapshot: assume the mobile posture, which is the safer default to
    // hydrate into.
    const getServerSnapshot = useCallback(() => false, []);

    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tailwind's `lg` breakpoint — where the desktop posture takes over. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

export function useIsDesktop(): boolean {
    return useMediaQuery(DESKTOP_QUERY);
}
