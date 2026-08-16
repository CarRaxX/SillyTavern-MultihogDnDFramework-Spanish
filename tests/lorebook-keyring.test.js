import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    buildKeyringText,
    grepLoreInBooks,
    isConcatenatedNameDump,
    resolveBooksToScan,
} from '../src/state/lorebook-keyring.js';

const books = {
    Campaign_NPCs: {
        entries: {
            0: { comment: 'Odran', key: ['Odran', 'chaplain'], content: 'Tends the chapel.' },
        },
    },
    Campaign_Locations: {
        entries: {
            3: { comment: "Elder's Stone Lodge", key: ["Elder's Stone Lodge", "Elder's Rise"], content: 'A timber hall.' },
        },
    },
    Campaign_Skeleton: {
        entries: {
            1: { comment: 'Hidden seed', key: ['seed'], content: 'Should never appear.' },
        },
    },
};

describe('lorebook keyring', () => {
    it('lists inactive entries with Book::UID and skips active plus skeleton books', () => {
        const text = buildKeyringText(books, ['Campaign_NPCs::0']);
        expect(text).toContain("Campaign_Locations::3 | Label: Elder's Stone Lodge");
        expect(text).toContain("Keys: [Elder's Stone Lodge, Elder's Rise]");
        expect(text).not.toContain('Odran');
        expect(text).not.toContain('Hidden seed');
        expect(text).not.toContain('_Skeleton');
    });

    it('treats a dumped name list as an existence check, not a content search', () => {
        const dump = "Elder Varek Elder's Stone Lodge Elder's Rise Horn & Hearth Tavern Foothill Smithy North Timber Verge northern beast";
        expect(isConcatenatedNameDump(dump)).toBe(true);
        expect(isConcatenatedNameDump("Elder Varek, Elder's Stone Lodge, Horn & Hearth Tavern")).toBe(true);
        expect(isConcatenatedNameDump('northern beast')).toBe(false);
        expect(isConcatenatedNameDump("Elder's Stone Lodge")).toBe(false);
        const hits = grepLoreInBooks(books, dump);
        expect(hits).toHaveLength(1);
        expect(hits[0]).toContain('Do not grep to check whether entries exist');
        expect(hits[0]).not.toContain('Tends the chapel');
    });

    it('still searches a single phrase in labels, keys, and bodies', () => {
        const hits = grepLoreInBooks(books, 'chaplain');
        expect(hits.some(hit => hit.includes('Campaign_NPCs::0'))).toBe(true);
    });
});

describe('resolveBooksToScan', () => {
    it('unions campaignBooks with in-memory registry names for the prefix', () => {
        const scanned = resolveBooksToScan(
            ['Camp_Locations'],
            ['Camp_Locations', 'Camp_NPCs', 'OtherChat_NPCs'],
            'Camp',
        );
        expect(scanned).toEqual(expect.arrayContaining(['Camp_Locations', 'Camp_NPCs']));
        expect(scanned).not.toContain('OtherChat_NPCs');
    });

    it('drops skeleton books and names that do not belong to the prefix', () => {
        const scanned = resolveBooksToScan(
            ['Camp_Skeleton', 'Camp_NPCs'],
            ['Unrelated', 'Camp_Events'],
            'Camp',
            ['Camp_NPCs'],
        );
        expect(scanned).toEqual(expect.arrayContaining(['Camp_NPCs', 'Camp_Events']));
        expect(scanned).not.toContain('Camp_Skeleton');
        expect(scanned).not.toContain('Unrelated');
    });
});

describe('Lorebook Agent existence catalog wiring', () => {
    it('does not tell the agent to grep before recording', () => {
        const router = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
        expect(router).not.toContain('look up existing data before recording');
        expect(router).toContain('do not grep to confirm');
        expect(router).toContain('Do not call grep_lore, inspect_book, or read_entry to check whether an entry exists');
    });
});
