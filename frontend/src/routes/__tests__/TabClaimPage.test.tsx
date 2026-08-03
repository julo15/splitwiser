import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TabClaimPage from '../TabClaimPage';
import { publicTabsApi } from '../../services/api';

vi.mock('../../services/api', () => ({
    publicTabsApi: {
        get: vi.fn(),
        join: vi.fn(),
        rename: vi.fn(),
        claim: vi.fn(),
    },
}));

// The page is rendered outside the shell but still inside AuthProvider: a
// signed-in visitor is recognised, everyone else sees the guest flow.
const signedOut = { user: null, loading: false };
const maya = {
    user: { id: 9, email: 'maya@example.com', full_name: 'Maya Lin' },
    loading: false,
};
let auth: { user: { id: number; email: string; full_name: string } | null; loading: boolean } =
    signedOut;
vi.mock('../../AuthContext', () => ({ useAuth: () => auth }));

const SHARE_TOKEN = 'share-token';

const tab = (
    participants: { id: number; display_name: string; user_id?: number | null }[]
) => ({
    name: 'Bar Sol',
    currency: 'USD',
    status: 'open' as const,
    tax: 0,
    tip: 0,
    total: 2800,
    items: [
        {
            id: 7,
            description: 'Pizza margherita',
            price: 2800,
            added_manually: false,
            claimed_by: [] as number[],
        },
    ],
    participants: participants.map((p) => ({ user_id: null, ...p })),
});

function renderPage() {
    return render(
        <MemoryRouter initialEntries={[`/t/${SHARE_TOKEN}`]}>
            <Routes>
                <Route path="/t/:shareToken" element={<TabClaimPage />} />
            </Routes>
        </MemoryRouter>
    );
}

/** Join, then reopen the name form via the "claiming as" button. */
async function joinAs(name: string) {
    renderPage();
    fireEvent.change(await screen.findByLabelText('Your first name'), {
        target: { value: name },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start claiming' }));
    await screen.findByText(name);
}

describe('TabClaimPage identity', () => {
    beforeEach(() => {
        localStorage.clear();
        auth = signedOut;
        vi.mocked(publicTabsApi.get).mockResolvedValue(tab([{ id: 1, display_name: 'Vince Woo' }]));
        vi.mocked(publicTabsApi.join).mockResolvedValue({
            participant: { id: 2, display_name: 'Maya', user_id: null },
            claim_token: 'claim-token',
            tab: tab([
                { id: 1, display_name: 'Vince Woo' },
                { id: 2, display_name: 'Maya' },
            ]),
        });
        vi.mocked(publicTabsApi.rename).mockResolvedValue({
            participant: { id: 2, display_name: 'Maya B', user_id: null },
            tab: tab([
                { id: 1, display_name: 'Vince Woo' },
                { id: 2, display_name: 'Maya B' },
            ]),
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('joins once, then renames in place instead of joining again', async () => {
        // The bug: the rename form re-submitted `join`, seating a second Maya
        // and stranding everything the first one had ticked.
        await joinAs('Maya');
        fireEvent.click(screen.getByRole('button', { name: /claiming as/i }));
        fireEvent.change(screen.getByLabelText('Your first name'), {
            target: { value: 'Maya B' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save this name' }));

        await screen.findByText('Maya B');
        expect(publicTabsApi.rename).toHaveBeenCalledWith(
            SHARE_TOKEN,
            'claim-token',
            'Maya B'
        );
        expect(publicTabsApi.join).toHaveBeenCalledTimes(1);
    });

    it('keeps the same claim token after a rename', async () => {
        await joinAs('Maya');
        fireEvent.click(screen.getByRole('button', { name: /claiming as/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Save this name' }));
        await screen.findByText('Maya B');

        fireEvent.click(screen.getByRole('button', { name: /Pizza margherita/ }));
        await waitFor(() =>
            expect(publicTabsApi.claim).toHaveBeenCalledWith(
                SHARE_TOKEN,
                7,
                'claim-token',
                true
            )
        );
    });

    it('surfaces a name collision without seating anyone', async () => {
        vi.mocked(publicTabsApi.join).mockRejectedValueOnce(
            new Error('Someone at this table is already claiming as that name.')
        );
        renderPage();
        fireEvent.change(await screen.findByLabelText('Your first name'), {
            target: { value: 'Vince Woo' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Start claiming' }));

        expect(await screen.findByText(/already claiming as that name/)).toBeTruthy();
        // Still on the name form, with nothing stored.
        expect(screen.getByLabelText('Your first name')).toBeTruthy();
        expect(localStorage.getItem(`sw.tab.${SHARE_TOKEN}`)).toBeNull();
    });

    it('can back out of a rename', async () => {
        await joinAs('Maya');
        fireEvent.click(screen.getByRole('button', { name: /claiming as/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Never mind' }));

        await screen.findByText('Maya');
        expect(publicTabsApi.rename).not.toHaveBeenCalled();
    });

    it('sends a typed name and no bearer when signed out', async () => {
        await joinAs('Maya');
        expect(publicTabsApi.join).toHaveBeenCalledWith(SHARE_TOKEN, {
            displayName: 'Maya',
            withAuth: false,
        });
    });

    it('follows the name the server reports, not the one cached at join', async () => {
        // The host can rename someone from the board, so the copy this browser
        // saved at join is not authoritative.
        localStorage.setItem(
            `sw.tab.${SHARE_TOKEN}`,
            JSON.stringify({
                claimToken: 'claim-token',
                participantId: 2,
                displayName: 'Maya',
            })
        );
        vi.mocked(publicTabsApi.get).mockResolvedValue(
            tab([
                { id: 1, display_name: 'Vince Woo' },
                { id: 2, display_name: 'Maya (from work)' },
            ])
        );
        renderPage();

        expect(await screen.findByText('Maya (from work)')).toBeTruthy();
    });
});

describe('TabClaimPage with an account', () => {
    /** Seated as Maya Lin's account, as the server would report it. */
    const seatedAsMaya = {
        participant: { id: 2, display_name: 'Maya Lin', user_id: 9 },
        claim_token: 'claim-token',
        tab: tab([
            { id: 1, display_name: 'Vince Woo' },
            { id: 2, display_name: 'Maya Lin', user_id: 9 },
        ]),
    };

    beforeEach(() => {
        localStorage.clear();
        auth = maya;
        vi.mocked(publicTabsApi.get).mockResolvedValue(
            tab([{ id: 1, display_name: 'Vince Woo' }])
        );
        vi.mocked(publicTabsApi.join).mockResolvedValue(seatedAsMaya);
    });

    afterEach(() => {
        vi.clearAllMocks();
        auth = signedOut;
    });

    it('seats a signed-in visitor as their account, without asking for a name', async () => {
        renderPage();

        // Straight to the board: they already told us who they are.
        expect(await screen.findByText('Maya Lin')).toBeTruthy();
        expect(screen.queryByLabelText('Your first name')).toBeNull();
        expect(publicTabsApi.join).toHaveBeenCalledWith(SHARE_TOKEN, {
            claimToken: undefined,
            withAuth: true,
        });
        expect(screen.getByText(/Goes on your account/)).toBeTruthy();
    });

    it('binds the account to a seat already claimed from anonymously', async () => {
        // Claimed as a guest first, signed in after — the picks come along.
        localStorage.setItem(
            `sw.tab.${SHARE_TOKEN}`,
            JSON.stringify({
                claimToken: 'guest-token',
                participantId: 2,
                displayName: 'Maya',
            })
        );
        vi.mocked(publicTabsApi.get).mockResolvedValue(
            tab([
                { id: 1, display_name: 'Vince Woo' },
                { id: 2, display_name: 'Maya' },
            ])
        );

        renderPage();

        await waitFor(() =>
            expect(publicTabsApi.join).toHaveBeenCalledWith(SHARE_TOKEN, {
                claimToken: 'guest-token',
                withAuth: true,
            })
        );
    });

    it('leaves a seat that already carries the account alone', async () => {
        localStorage.setItem(
            `sw.tab.${SHARE_TOKEN}`,
            JSON.stringify({
                claimToken: 'claim-token',
                participantId: 2,
                displayName: 'Maya Lin',
            })
        );
        vi.mocked(publicTabsApi.get).mockResolvedValue(seatedAsMaya.tab);

        renderPage();

        expect(await screen.findByText('Maya Lin')).toBeTruthy();
        expect(publicTabsApi.join).not.toHaveBeenCalled();
    });

    it('falls back to the name form when the account name is taken', async () => {
        vi.mocked(publicTabsApi.join).mockRejectedValueOnce(
            new Error('Someone at this table is already claiming as that name.')
        );
        renderPage();

        expect(await screen.findByText(/already claiming as that name/)).toBeTruthy();
        const input = await screen.findByLabelText('Your first name');

        // The typed name still lands on their account.
        vi.mocked(publicTabsApi.join).mockResolvedValue({
            ...seatedAsMaya,
            participant: { id: 2, display_name: 'Maya L', user_id: 9 },
        });
        fireEvent.change(input, { target: { value: 'Maya L' } });
        fireEvent.click(screen.getByRole('button', { name: 'Start claiming' }));

        await waitFor(() =>
            expect(publicTabsApi.join).toHaveBeenLastCalledWith(SHARE_TOKEN, {
                displayName: 'Maya L',
                withAuth: true,
            })
        );
    });

    it('does not retry seating on every poll', async () => {
        vi.mocked(publicTabsApi.join).mockRejectedValue(new Error('Nope'));
        renderPage();

        await screen.findByText(/Nope/);
        await waitFor(() => expect(publicTabsApi.join).toHaveBeenCalledTimes(1));
    });
});

describe('TabClaimPage running total', () => {
    /** A bill with something shared, something spare, and tax and tip on top. */
    const billed = (mine: number[]) => ({
        name: 'Bar Sol',
        currency: 'USD',
        status: 'open' as const,
        tax: 400,
        tip: 600,
        total: 5800,
        items: [
            {
                id: 7,
                description: 'Pizza margherita',
                price: 2800,
                added_manually: false,
                claimed_by: mine.includes(7) ? [1, 2] : [1],
            },
            {
                id: 8,
                description: 'Negroni',
                price: 1400,
                added_manually: false,
                claimed_by: mine.includes(8) ? [2] : [],
            },
            // Nobody's either way: spread across the table at close.
            {
                id: 9,
                description: 'Olives',
                price: 600,
                added_manually: false,
                claimed_by: [],
            },
        ],
        participants: [
            { id: 1, display_name: 'Vince Woo', user_id: null },
            { id: 2, display_name: 'Maya', user_id: null },
        ],
    });

    beforeEach(() => {
        localStorage.clear();
        auth = signedOut;
        localStorage.setItem(
            `sw.tab.${SHARE_TOKEN}`,
            JSON.stringify({
                claimToken: 'claim-token',
                participantId: 2,
                displayName: 'Maya',
            })
        );
        vi.mocked(publicTabsApi.get).mockResolvedValue(billed([7]));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('keeps the working folded away until asked for', async () => {
        renderPage();

        const toggle = await screen.findByRole('button', { name: /Your bit/ });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Your share of the tax')).not.toBeInTheDocument();
    });

    it('shows what the total is made of', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Your bit/ }));

        // Half the pizza and a third-of-nothing olive share — the Negroni is
        // still going spare, so it is on the list as an orphan, not as theirs.
        expect(screen.getByText('Your share of the tax')).toBeInTheDocument();
        expect(screen.getByText('Your share of the tip')).toBeInTheDocument();
        expect(screen.getByText(/Split 2 ways/)).toBeInTheDocument();
        expect(screen.getAllByText(/Nobody claimed it/).length).toBeGreaterThan(0);
    });

    it('moves the total, and the working, as items are claimed', async () => {
        vi.mocked(publicTabsApi.claim).mockResolvedValue(billed([7, 8]));
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: /Your bit/ }));
        // Half the pizza, plus half of each orphan: 1400 + 700 + 300 = 2400.
        // Both of them ordered the same, so the tax and tip halve too.
        expect(screen.getByRole('button', { name: /Your bit/ })).toHaveTextContent(
            '$29.00'
        );

        fireEvent.click(screen.getByRole('button', { name: /Negroni/ }));

        // The Negroni lands, the olives are the only orphan left, and the tax
        // and tip tilt towards the bigger order: 3100 + 646.
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Your bit/ })).toHaveTextContent(
                '$37.46'
            )
        );
        // Twice over now: the line on the list, and the line in the working.
        expect(screen.getAllByText('Negroni')).toHaveLength(2);
    });
});
