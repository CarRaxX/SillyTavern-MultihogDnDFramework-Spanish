import { describe, expect, it, vi } from 'vitest';
import { createCoalescedRefresh } from '../src/ui/panel/refresh-coalescer.js';

describe('refresh coalescer', () => {
    it('allows only one active run and one latest follow-up during an event burst', async () => {
        let releaseFirst;
        const firstGate = new Promise(resolve => { releaseFirst = resolve; });
        const run = vi.fn(async value => {
            if (value === 'first') await firstGate;
        });
        const refresh = createCoalescedRefresh(run);

        const first = refresh('first');
        const second = refresh('second');
        const third = refresh('third');

        expect(second).toBe(first);
        expect(third).toBe(first);
        expect(run).toHaveBeenCalledTimes(1);

        releaseFirst();
        await first;

        expect(run).toHaveBeenCalledTimes(2);
        expect(run).toHaveBeenNthCalledWith(2, 'third');
    });
});
