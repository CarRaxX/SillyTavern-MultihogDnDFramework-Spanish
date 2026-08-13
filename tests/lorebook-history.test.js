import { describe, expect, it } from 'vitest';
import {
    bookBelongsToCampaignPrefix,
    getCreatedLorebookNames,
    getLorebookSnapshotNames,
} from '../src/state/lorebook-history.js';

describe('Lorebook Agent history safety', () => {
    it('represents a first-ever pass as an explicit empty baseline', () => {
        expect(getLorebookSnapshotNames({ campaignBookNames: [], bookSnapshots: {} })).toEqual([]);
    });

    it('deletes only books exactly recorded as created by a modern pass', () => {
        const created = getCreatedLorebookNames({
            snapshot: {
                campaignBookNames: [],
                bookSnapshots: {},
                createdBookNames: ['First_Campaign_NPCs'],
            },
            currentNames: ['First_Campaign_NPCs', 'First_Campaign_Manual', 'Other_NPCs'],
            currentRouterLog: [],
            prefix: 'First_Campaign',
        });

        expect(created).toEqual(['First_Campaign_NPCs']);
    });

    it('uses recorded entry IDs conservatively for legacy first-pass snapshots', () => {
        const created = getCreatedLorebookNames({
            snapshot: { bookSnapshots: {} },
            currentNames: ['First_Campaign_NPCs', 'First_Campaign_Manual', 'Other_NPCs'],
            currentRouterLog: [{ record: ['First_Campaign_NPCs::0'] }],
            prefix: 'First_Campaign',
        });

        expect(created).toEqual(['First_Campaign_NPCs']);
    });

    it('does not attribute an older log entry to a legacy no-op pass', () => {
        const created = getCreatedLorebookNames({
            snapshot: {
                bookSnapshots: { First_Campaign_NPCs: { entries: {} } },
            },
            currentNames: ['First_Campaign_NPCs'],
            currentRouterLog: [{ record: ['First_Campaign_NPCs::0'] }],
            prefix: 'First_Campaign',
        });

        expect(created).toEqual([]);
    });

    it('does not treat a longer campaign prefix as part of a shorter one', () => {
        expect(bookBelongsToCampaignPrefix('Campaign_NPCs', 'Campaign')).toBe(true);
        expect(bookBelongsToCampaignPrefix('Campaign_2026_NPCs', 'Campaign')).toBe(false);
    });
});
