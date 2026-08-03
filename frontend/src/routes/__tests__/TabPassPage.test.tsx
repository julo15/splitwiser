import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TabPassPage from '../TabPassPage';
import { tabsApi } from '../../services/api';

vi.mock('../../services/api', () => ({
    tabsApi: {
        getById: vi.fn(),
        addParticipant: vi.fn(),
        claimOwn: vi.fn(),
        setClaim: vi.fn(),
    },
}));

const vince = { user: { id: 9, email: 'v@example.com', full_name: 'Vince Woo' }, loading: false };
vi.mock('../../AuthContext', () => ({ useAuth: () => vince }));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>(
        'react-router-dom'
    );
    return { ...actual, useNavigate: () => navigate };
});

/** Vince took the pizza; Dani has claimed nothing; the olives are spare. */
const tab = (over: Partial<ReturnType<typeof base>> = {}) => ({ ...base(), ...over });

function base() {
    return {
        id: 1,
        name: 'Bar Sol',
        currency: 'USD',
        status: 'open' as 'open' | 'closed',
        tax: 400,
        tip: 600,
        total: 5800,
        created_by_id: 9,
        payer_id: null,
        expense_id: null,
        share_token: 'tok',
        token_expires_at: null,
        items: [
            {
                id: 7,
                description: 'Pizza margherita',
                price: 2800,
                added_manually: false,
                claimed_by: [1],
            },
            {
                id: 8,
                description: 'Olives',
                price: 600,
                added_manually: false,
                claimed_by: [] as number[],
            },
        ],
        participants: [
            { id: 1, display_name: 'Vince Woo', user_id: 9 },
            { id: 2, display_name: 'Dani', user_id: null },
        ],
    };
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/tabs/1/pass']}>
            <Routes>
                <Route path="/tabs/:tabId/pass" element={<TabPassPage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('TabPassPage — the picker', () => {
    beforeEach(() => {
        vi.mocked(tabsApi.getById).mockResolvedValue(tab());
    });
    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('leads with what is still unclaimed, not with who has had a turn', async () => {
        renderPage();
        // The olives: what actually gets spread across everyone at close.
        expect(await screen.findByText(/still unclaimed/)).toBeInTheDocument();
        expect(screen.getByText('$6.00')).toBeInTheDocument();
    });

    it('says who still has to pick', async () => {
        renderPage();
        await screen.findByText('You');
        expect(screen.getByText('1 item')).toBeInTheDocument();
        expect(screen.getByText("Hasn't picked yet")).toBeInTheDocument();
    });

    it('offers no way into the rest of the app', async () => {
        renderPage();
        await screen.findByText('You');
        // No share link, no close button, no navigation — the device is in
        // somebody else's hands.
        expect(screen.queryByText(/Send the link/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Close the tab/)).not.toBeInTheDocument();
    });
});

describe('TabPassPage — a turn', () => {
    beforeEach(() => {
        vi.mocked(tabsApi.getById).mockResolvedValue(tab());
        vi.mocked(tabsApi.setClaim).mockResolvedValue(tab());
        vi.mocked(tabsApi.claimOwn).mockResolvedValue(tab());
    });
    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    /** Tap a row in the picker and wait for that person's turn to open. */
    const takeTurn = async (row: string, turn: string) => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: new RegExp(row) }));
        await screen.findByText(turn);
    };

    it('names whoever is holding the phone, unmissably', async () => {
        await takeTurn('Dani', 'Dani\u2019s turn');
        expect(screen.getByText('Not Dani? Tap to switch')).toBeInTheDocument();
    });

    it('claims onto that person, not the host', async () => {
        await takeTurn('Dani', 'Dani\u2019s turn');
        fireEvent.click(screen.getByRole('button', { name: /Olives/ }));

        await waitFor(() =>
            expect(tabsApi.setClaim).toHaveBeenCalledWith(1, 8, 2, true)
        );
        expect(tabsApi.claimOwn).not.toHaveBeenCalled();
    });

    it("routes the host's own seat through self-claim", async () => {
        // The host is a participant, not an administrator of themselves.
        await takeTurn('You', 'Your turn');
        fireEvent.click(screen.getByRole('button', { name: /Olives/ }));

        await waitFor(() => expect(tabsApi.claimOwn).toHaveBeenCalledWith(1, 8, true));
        expect(tabsApi.setClaim).not.toHaveBeenCalled();
    });

    it('shows that person\u2019s running total, with the working behind it', async () => {
        await takeTurn('Dani', 'Dani\u2019s turn');
        // Dani claimed nothing, so she carries only her half of the spare
        // olives ($3.00) and the tax and tip that ride on it.
        const total = screen.getByRole('button', { name: /Dani.s bit/ });
        expect(total).toHaveTextContent('$3.88');

        fireEvent.click(total);
        expect(screen.getByText('Dani\u2019s share of the tax')).toBeInTheDocument();
        expect(screen.getByText('Dani\u2019s share of the tip')).toBeInTheDocument();
    });

    it('hands back to the picker when the turn ends', async () => {
        await takeTurn('Dani', 'Dani\u2019s turn');
        fireEvent.click(screen.getByRole('button', { name: /Done — pass it on/ }));

        expect(await screen.findByText(/Who.s got the phone/)).toBeInTheDocument();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('hands back to the picker when a turn goes quiet', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        await takeTurn('Dani', 'Dani\u2019s turn');

        // The phone goes face-up on the table; the next person picks it up.
        // Ticking their order onto Dani is the bug this prevents.
        await vi.advanceTimersByTimeAsync(46_000);
        await waitFor(() =>
            expect(screen.getByText(/Who.s got the phone/)).toBeInTheDocument()
        );
    });
});

describe('TabPassPage — seating someone', () => {
    beforeEach(() => {
        vi.mocked(tabsApi.getById).mockResolvedValue(tab());
    });
    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('seats a name and goes straight into their turn', async () => {
        const withPriya = tab();
        withPriya.participants = [
            ...withPriya.participants,
            { id: 3, display_name: 'Priya', user_id: null },
        ];
        vi.mocked(tabsApi.addParticipant).mockResolvedValue(withPriya);

        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Someone else/ }));
        fireEvent.change(screen.getByLabelText('Who else is here?'), {
            target: { value: 'Priya' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Seat them' }));

        await waitFor(() =>
            expect(tabsApi.addParticipant).toHaveBeenCalledWith(1, 'Priya')
        );
        // Seating somebody is only ever a prelude to handing them the phone.
        expect(await screen.findByText('Priya\u2019s turn')).toBeInTheDocument();
    });

    it('surfaces a name already at the table', async () => {
        vi.mocked(tabsApi.addParticipant).mockRejectedValue(
            new Error('Someone at this table is already claiming as that name.')
        );

        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Someone else/ }));
        fireEvent.change(screen.getByLabelText('Who else is here?'), {
            target: { value: 'Dani' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Seat them' }));

        expect(
            await screen.findByText(/already claiming as that name/)
        ).toBeInTheDocument();
    });
});

describe('TabPassPage — leaving', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('confirms before dropping the host back into their account', async () => {
        vi.mocked(tabsApi.getById).mockResolvedValue(tab());
        renderPage();

        fireEvent.click(
            await screen.findByRole('button', { name: /Stop passing it round/ })
        );
        // Deliberately never the word "done": that ends a turn, one screen over.
        expect(screen.getByText('Stop passing it round?')).toBeInTheDocument();
        expect(navigate).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        expect(navigate).toHaveBeenCalledWith('/tabs/1');
    });

    it('bounces out if the tab closes from another device', async () => {
        vi.mocked(tabsApi.getById).mockResolvedValue(tab({ status: 'closed' }));
        renderPage();

        await waitFor(() =>
            expect(navigate).toHaveBeenCalledWith('/tabs/1', { replace: true })
        );
    });
});
