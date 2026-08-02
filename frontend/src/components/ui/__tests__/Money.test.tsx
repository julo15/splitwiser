import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Money, { MINUS } from '../Money';

describe('Money', () => {
    it('formats cents as currency', () => {
        render(<Money amount={24860} currency="USD" />);
        expect(screen.getByText('$248.60')).toBeInTheDocument();
    });

    it('shows magnitude only by default, even for negatives', () => {
        render(<Money amount={-6015} currency="USD" />);
        expect(screen.getByText('$60.15')).toBeInTheDocument();
    });

    it('uses U+2212 MINUS for negatives, never an ASCII hyphen', () => {
        render(<Money amount={-6015} currency="USD" sign="negative" />);
        const el = screen.getByText(`${MINUS}$60.15`);
        expect(el).toBeInTheDocument();
        expect(el.textContent).toContain('−');
        expect(el.textContent).not.toContain('-');
    });

    it('adds an explicit plus only when sign is "always"', () => {
        const { rerender } = render(
            <Money amount={24860} currency="USD" sign="negative" />
        );
        expect(screen.getByText('$248.60')).toBeInTheDocument();

        rerender(<Money amount={24860} currency="USD" sign="always" />);
        expect(screen.getByText('+$248.60')).toBeInTheDocument();
    });

    it('carries the tabular-numeral class on every figure', () => {
        render(<Money amount={100} currency="USD" />);
        expect(screen.getByText('$1.00')).toHaveClass('sw-num');
    });

    it('colors by sign under tone="auto"', () => {
        const { rerender } = render(
            <Money amount={500} currency="USD" tone="auto" />
        );
        expect(screen.getByText('$5.00')).toHaveClass('text-sw-pos');

        rerender(<Money amount={-500} currency="USD" tone="auto" />);
        expect(screen.getByText('$5.00')).toHaveClass('text-sw-neg');

        rerender(<Money amount={0} currency="USD" tone="auto" />);
        expect(screen.getByText('$0.00')).toHaveClass('text-sw-dim');
    });

    it('honors non-USD currencies', () => {
        render(<Money amount={9800} currency="EUR" />);
        expect(screen.getByText('€98.00')).toBeInTheDocument();
    });
});
