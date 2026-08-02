import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Sheet from '../Sheet';

function SheetWithControlledInput({ onClose }: { onClose: () => void }) {
    const [value, setValue] = useState('');

    return (
        <Sheet open onClose={() => onClose()} label="Test sheet">
            <input
                aria-label="Venue name"
                value={value}
                onChange={(event) => setValue(event.target.value)}
            />
        </Sheet>
    );
}

describe('Sheet', () => {
    it('does not steal input focus when an inline onClose callback changes', () => {
        render(<SheetWithControlledInput onClose={vi.fn()} />);
        const input = screen.getByRole('textbox', { name: 'Venue name' });
        input.focus();

        fireEvent.change(input, { target: { value: 'B' } });
        fireEvent.change(input, { target: { value: 'Ba' } });

        expect(input).toHaveValue('Ba');
        expect(input).toHaveFocus();
    });
});
