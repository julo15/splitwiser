import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../Badge';

describe('Badge', () => {
    it('renders nothing when there is nothing waiting', () => {
        const { container } = render(<Badge count={0} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing for a negative count', () => {
        const { container } = render(<Badge count={-1} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the count when asked for one', () => {
        render(<Badge count={3} variant="count" />);
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('caps the count at 9+', () => {
        render(<Badge count={42} variant="count" />);
        expect(screen.getByText('9+')).toBeInTheDocument();
    });

    it('gives the dot an accessible label, since it has no text', () => {
        render(<Badge count={2} label="2 friend requests waiting" />);
        expect(
            screen.getByLabelText('2 friend requests waiting')
        ).toBeInTheDocument();
    });

    it('falls back to a generic label', () => {
        render(<Badge count={2} />);
        expect(screen.getByLabelText('2 pending')).toBeInTheDocument();
    });
});
