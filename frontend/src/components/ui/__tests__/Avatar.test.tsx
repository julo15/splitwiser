import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Avatar, { initialsOf } from '../Avatar';

describe('initialsOf', () => {
    it('takes the first and last word initials', () => {
        expect(initialsOf('Maya Chen')).toBe('MC');
        expect(initialsOf('Vince Woo')).toBe('VW');
    });

    it('skips middle names', () => {
        expect(initialsOf('Priya Anand Raman')).toBe('PR');
    });

    it('returns a single letter for a mononym', () => {
        expect(initialsOf('Prince')).toBe('P');
    });

    it('tolerates stray whitespace', () => {
        expect(initialsOf('  Dani   Park  ')).toBe('DP');
    });

    it('falls back to ? for an empty name', () => {
        // Guests can exist before they have given a name.
        expect(initialsOf('')).toBe('?');
        expect(initialsOf('   ')).toBe('?');
    });

    it('uppercases lowercase input', () => {
        expect(initialsOf('ben ortiz')).toBe('BO');
    });
});

describe('Avatar', () => {
    it('renders initials at the requested size', () => {
        render(<Avatar name="Maya Chen" size={32} />);
        const el = screen.getByText('MC');
        expect(el).toHaveStyle({ width: '32px', height: '32px' });
    });

    it('uses the accent tone when selected', () => {
        render(<Avatar name="Maya Chen" variant="accent" />);
        expect(screen.getByText('MC')).toHaveClass('bg-sw-accent-soft');
    });
});
