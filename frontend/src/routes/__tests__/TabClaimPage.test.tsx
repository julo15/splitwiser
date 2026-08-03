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

const SHARE_TOKEN = 'share-token';

const tab = (participants: { id: number; display_name: string }[]) => ({
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
    participants: participants.map((p) => ({ ...p, user_id: null })),
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
