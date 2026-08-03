import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import TabBreakdown from '../TabBreakdown';
import type { TabItem, TabParticipant } from '../../../types/tab';

const items: TabItem[] = [
    {
        id: 1,
        description: 'Pizza margherita',
        price: 2800,
        added_manually: false,
        claimed_by: [10, 20],
    },
    {
        id: 2,
        description: 'Negroni',
        price: 1400,
        added_manually: false,
        claimed_by: [10],
    },
    // Nobody's: falls to the whole table.
    { id: 3, description: 'Olives', price: 600, added_manually: false, claimed_by: [] },
];

const participants: TabParticipant[] = [
    { id: 10, display_name: 'Maya', user_id: 9 },
    { id: 20, display_name: 'Dani', user_id: null },
];

function renderBreakdown(props: Partial<React.ComponentProps<typeof TabBreakdown>> = {}) {
    return render(
        <TabBreakdown
            items={items}
            participants={participants}
            currency="USD"
            tax={400}
            tip={600}
            {...props}
        />
    );
}

/** The expandable region for one person, by the name on its button. */
function rowFor(name: string): HTMLElement {
    const button = screen.getByRole('button', { name: new RegExp(name) });
    return button.parentElement as HTMLElement;
}

describe('TabBreakdown', () => {
    it('shows everyone with the total they would owe', () => {
        renderBreakdown();

        // Maya: 1400 + 1400 + 300 = 3100 of items, Dani: 1400 + 300 = 1700.
        // Tax and tip (1000) follow that split: 646 / 354.
        expect(screen.getByRole('button', { name: /Maya/ })).toHaveTextContent('$37.46');
        expect(screen.getByRole('button', { name: /Dani/ })).toHaveTextContent('$20.54');
    });

    it('opens the viewer\'s own row first, and calls them "You"', () => {
        renderBreakdown({ meId: 10 });

        expect(screen.getByRole('button', { name: /You/ })).toHaveAttribute(
            'aria-expanded',
            'true'
        );
        expect(screen.getByRole('button', { name: /Dani/ })).toHaveAttribute(
            'aria-expanded',
            'false'
        );
    });

    it('reveals the lines behind a total on demand', () => {
        renderBreakdown();

        const dani = rowFor('Dani');
        expect(within(dani).queryByText('Pizza margherita')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Dani/ }));

        // Their half of the pizza and their third of the olives — not the
        // Negroni, which they had nothing to do with.
        expect(within(dani).getByText('Pizza margherita')).toBeInTheDocument();
        expect(within(dani).getByText('Olives')).toBeInTheDocument();
        expect(within(dani).queryByText('Negroni')).not.toBeInTheDocument();
    });

    it('says how a shared line was split, and flags one nobody claimed', () => {
        renderBreakdown({ meId: 20 });

        const dani = rowFor('You');
        expect(within(dani).getByText(/Split 2 ways/)).toBeInTheDocument();
        expect(within(dani).getByText(/Nobody claimed it/)).toBeInTheDocument();
    });

    it('breaks the tax and the tip out separately', () => {
        renderBreakdown({ meId: 10 });

        const maya = rowFor('You');
        expect(within(maya).getByText('Your share of the tax')).toBeInTheDocument();
        expect(within(maya).getByText('Your share of the tip')).toBeInTheDocument();
    });

    it('leaves out a tax or tip line the bill does not have', () => {
        renderBreakdown({ meId: 10, tax: 0, tip: 500 });

        const maya = rowFor('You');
        expect(within(maya).queryByText(/share of the tax/)).not.toBeInTheDocument();
        expect(within(maya).getByText('Your share of the tip')).toBeInTheDocument();
    });

    it('marks the payer and what they are up', () => {
        renderBreakdown({ payerId: 10, openBy: 'none' });

        const maya = screen.getByRole('button', { name: /Maya/ });
        expect(maya).toHaveTextContent('Paid the bill');
        // The bill is $58.00; their own share is $37.46.
        expect(maya).toHaveTextContent('$20.54');
    });

    it('draws only the rows asked for, still costed against the whole table', () => {
        renderBreakdown({ showOnly: [20], meId: 20, collapsible: false });

        expect(screen.queryByText('Maya')).not.toBeInTheDocument();
        // Unchanged by Maya's absence from the list: she is still at the table,
        // so Dani still carries only half the pizza. Once in the heading, once
        // as the total of the working below it.
        expect(screen.getAllByText('$20.54')).toHaveLength(2);
    });

    it('renders nothing before anyone has joined', () => {
        const { container } = renderBreakdown({ participants: [] });
        expect(container).toBeEmptyDOMElement();
    });
});
