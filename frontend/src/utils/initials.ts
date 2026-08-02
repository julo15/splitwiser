/**
 * Two initials from a name: first letter of the first and last word. Falls back
 * to a single letter for mononyms, and to '?' for an empty name so a guest with
 * no name yet still renders a stable circle.
 */
export function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    const first = parts[0].slice(0, 1);
    const last = parts[parts.length - 1].slice(0, 1);
    return (first + last).toUpperCase();
}
