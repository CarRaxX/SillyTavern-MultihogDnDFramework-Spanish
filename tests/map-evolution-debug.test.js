import { beforeEach, describe, expect, it } from 'vitest';
import { applyTestingGroundWorldState, cloneTestingGroundWorldState } from '../map-evolution-lib.js';

describe('Map Evolution Testing Ground rollback', () => {
    let settings;

    beforeEach(() => {
        settings = {
            currentMemo: '[TIME]Day 7, 07:00 PM[/TIME]',
            mapEvolutionLastFiredBySite: { crypt: 'Day 7, 07:00 AM' },
            mapEvolutionWorldReportApplications: { crypt: { r1: { status: 'considered' } } },
            mapEvolutionBacklogBySite: { crypt: [{ kind: 'commit', summary: 'chase' }] },
            mapEvolutionThreadsBySite: { crypt: [{ id: 'a:0', status: 'open', cause: 'Pursued the necromancer.' }] },
        };
    });

    it('clones and restores clocks, threads, backlog, and memo without aliasing', () => {
        const snap = cloneTestingGroundWorldState(settings);
        settings.mapEvolutionLastFiredBySite = { crypt: 'Day 8, 07:00 AM' };
        settings.currentMemo = '[TIME]Day 8, 07:00 AM[/TIME]';
        settings.mapEvolutionThreadsBySite = {
            crypt: [{ id: 'b:0', status: 'open', cause: 'Settled into a vigil.' }],
        };
        expect(applyTestingGroundWorldState(snap, settings)).toBe(true);
        expect(settings.mapEvolutionLastFiredBySite).toEqual({ crypt: 'Day 7, 07:00 AM' });
        expect(settings.currentMemo).toBe('[TIME]Day 7, 07:00 PM[/TIME]');
        expect(settings.mapEvolutionThreadsBySite.crypt[0].cause).toBe('Pursued the necromancer.');
        expect(settings.mapEvolutionLastFiredBySite).not.toBe(snap.lastFiredBySite);
        settings.mapEvolutionLastFiredBySite.crypt = 'mutated';
        expect(snap.lastFiredBySite.crypt).toBe('Day 7, 07:00 AM');
    });

    it('rejects a missing snapshot or settings bag', () => {
        expect(applyTestingGroundWorldState(null, settings)).toBe(false);
        expect(applyTestingGroundWorldState(cloneTestingGroundWorldState(settings), null)).toBe(false);
    });
});
