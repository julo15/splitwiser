import { afterEach, describe, expect, it, vi } from 'vitest';
import { tabsApi } from '../api';

describe('tabsApi.create', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('surfaces FastAPI validation details', async () => {
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) =>
                key === 'token' ? 'test-token' : null
            ),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        });
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: false,
                status: 422,
                json: async () => ({
                    detail: [
                        {
                            loc: ['body', 'items', 0, 'description'],
                            msg: 'String should have at most 200 characters',
                        },
                    ],
                }),
            }))
        );

        await expect(
            tabsApi.create({
                name: 'Bar Sol',
                items: [{ description: 'Coffee', price: 500 }],
            })
        ).rejects.toThrow(
            'description: String should have at most 200 characters'
        );
    });
});
