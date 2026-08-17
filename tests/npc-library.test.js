import { describe, expect, it } from 'vitest';
import {
    NPC_LIBRARY_FORMAT,
    NPC_LIBRARY_PACK_FORMAT,
    createLibraryRecord,
    dataUrlFromPortraitPayload,
    findLibraryNpcByName,
    parseNpcPackages,
    portraitPayloadFromDataUrl,
    removeLibraryNpcRecord,
    serializeNpcPackage,
    slugifyNpcName,
    stripCampaignRelationshipLines,
    sanitizeNpcLibraryRecords,
    uniqueLibraryNpcName,
    upsertLibraryNpc,
    buildAddLibraryNpcToPartyPrompt,
    buildApplyLibraryCardAsPcPrompt,
} from '../npc-library-lib.js';

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function emptySettings() {
    return { npcLibrary: [] };
}

describe('NPC library records', () => {
    it('strips campaign relationship lines from CORE text', () => {
        const content = `[CORE]\nSpecies: Elf\nFriendship/Rapport: 12/150\nAffection/Interest: -4/150\nPersonality: Wry\n[/CORE]`;
        const stripped = stripCampaignRelationshipLines(content);
        expect(stripped).toContain('Species: Elf');
        expect(stripped).toContain('Personality: Wry');
        expect(stripped).not.toMatch(/Friendship\/Rapport/);
        expect(stripped).not.toMatch(/Affection\/Interest/);
    });

    it('drops campaign chronicle and lore outside [CORE]', () => {
        const content = `[CORE]
Species: Elf
Personality: Wry
[/CORE]

[Day 12, 08:00 AM] Met the party at the docks.
She sold them a coil of rope.`;
        const rec = createLibraryRecord({ name: 'Lissa', content });
        expect(rec.content).toContain('Species: Elf');
        expect(rec.content).toContain('Personality: Wry');
        expect(rec.content).toMatch(/\[CORE\]/i);
        expect(rec.content).not.toMatch(/Day 12/);
        expect(rec.content).not.toMatch(/docks/);
        expect(rec.content).not.toMatch(/coil of rope/);
    });

    it('sanitizes existing library records that still carry lore', () => {
        const s = emptySettings();
        s.npcLibrary.push({
            id: 'legacy',
            name: 'Mira',
            keys: ['Mira'],
            content: '[CORE]\nSpecies: Scout.\n[/CORE]\n\n[Day 1] Joined the watch.',
        });
        expect(sanitizeNpcLibraryRecords(s)).toBe(true);
        expect(s.npcLibrary[0].content).toContain('Species: Scout.');
        expect(s.npcLibrary[0].content).not.toMatch(/Joined the watch/);
        expect(sanitizeNpcLibraryRecords(s)).toBe(false);
    });

    it('ensures the NPC name is present in keywords', () => {
        const rec = createLibraryRecord({ name: 'Lissa', keys: ['herbalist'], content: '[CORE]A healer.[/CORE]' });
        expect(rec.keys[0]).toBe('Lissa');
        expect(rec.keys).toContain('herbalist');
    });

    it('overwrites an existing library slot and suffixes colliding names', () => {
        const s = emptySettings();
        const first = upsertLibraryNpc(s, createLibraryRecord({ name: 'Lissa', content: 'one' }));
        const second = upsertLibraryNpc(s, createLibraryRecord({ name: 'Lissa', content: 'two' }), { overwriteId: first.id });
        expect(s.npcLibrary).toHaveLength(1);
        expect(second.id).toBe(first.id);
        expect(second.content).toBe('two');
        expect(uniqueLibraryNpcName('Lissa', s)).toBe('Lissa (2)');
    });

    it('removes by id', () => {
        const s = emptySettings();
        const rec = upsertLibraryNpc(s, createLibraryRecord({ name: 'Odran', content: 'guard' }));
        expect(removeLibraryNpcRecord(s, rec.id)?.name).toBe('Odran');
        expect(s.npcLibrary).toHaveLength(0);
        expect(findLibraryNpcByName(s, 'Odran')).toBeNull();
    });
});

describe('NPC package export/import', () => {
    it('embeds a portrait as base64 and round-trips it', () => {
        const rec = createLibraryRecord({ name: 'Mira', keys: ['Mira'], content: '[CORE]Scout.[/CORE]' });
        const pkg = serializeNpcPackage(rec, TINY_PNG);
        expect(pkg.format).toBe(NPC_LIBRARY_FORMAT);
        expect(pkg.portrait?.mime).toBe('image/png');
        expect(pkg.portrait?.data).toBeTruthy();
        expect(dataUrlFromPortraitPayload(pkg.portrait)).toBe(TINY_PNG);

        const [parsed] = parseNpcPackages(JSON.stringify(pkg));
        expect(parsed.name).toBe('Mira');
        expect(parsed.content).toContain('Scout');
        expect(dataUrlFromPortraitPayload(parsed.portrait)).toBe(TINY_PNG);
    });

    it('exports without a portrait when none is supplied', () => {
        const rec = createLibraryRecord({ name: 'Igor', content: '[CORE]Smith.[/CORE]' });
        const pkg = serializeNpcPackage(rec, '');
        expect(pkg.portrait).toBeNull();
        const [parsed] = parseNpcPackages(JSON.stringify(pkg));
        expect(parsed.portrait).toBeNull();
        expect(dataUrlFromPortraitPayload(parsed.portrait)).toBe('');
    });

    it('accepts a pack of NPCs', () => {
        const pack = {
            format: NPC_LIBRARY_PACK_FORMAT,
            version: 1,
            npcs: [
                { format: NPC_LIBRARY_FORMAT, name: 'A', content: '[CORE]a[/CORE]' },
                { name: 'B', content: '[CORE]b[/CORE]', keys: ['B'] },
            ],
        };
        const parsed = parseNpcPackages(JSON.stringify(pack));
        expect(parsed.map(p => p.name)).toEqual(['A', 'B']);
    });

    it('rejects unknown formats and missing fields', () => {
        expect(() => parseNpcPackages('{"format":"nope","name":"X","content":"y"}')).toThrow(/Not a Multihog NPC package/);
        expect(() => parseNpcPackages('{"format":"multihog-npc","name":"X"}')).toThrow(/missing NPC content/);
        expect(() => parseNpcPackages('not-json')).toThrow(/parse/);
    });

    it('slugifies download names', () => {
        expect(slugifyNpcName('Mira Voss')).toBe('mira_voss');
        expect(slugifyNpcName('')).toBe('npc');
    });

    it('round-trips a tiny PNG payload helper', () => {
        const payload = portraitPayloadFromDataUrl(TINY_PNG);
        expect(payload.mime).toBe('image/png');
        expect(dataUrlFromPortraitPayload(payload)).toBe(TINY_PNG);
        expect(portraitPayloadFromDataUrl('https://example/x.png')).toBeNull();
    });
});

describe('Add library NPC to party prompt', () => {
    it('includes the join trigger and the identity card', () => {
        const rec = createLibraryRecord({
            name: 'Keeper',
            keys: ['Keeper', 'forge'],
            content: '[CORE]\nSpecies: Bound dwarven forge spirit.\n[/CORE]',
        });
        const prompt = buildAddLibraryNpcToPartyPrompt(rec);
        expect(prompt).toContain('(Keeper joins the party.)');
        expect(prompt).toContain('active [PARTY] roster');
        expect(prompt).toContain('NPC IDENTITY CARD:');
        expect(prompt).toContain('Name: Keeper');
        expect(prompt).toContain('Species: Bound dwarven forge spirit.');
        expect(prompt).toContain('Do not rewrite [CHARACTER]');
    });
});

describe('Apply library card as player character prompt', () => {
    it('asks the State Tracker to replace [CHARACTER] from the identity card', () => {
        const rec = createLibraryRecord({
            name: 'Keeper',
            keys: ['Keeper'],
            content: '[CORE]\nSpecies: Bound dwarven forge spirit.\n[/CORE]',
        });
        const prompt = buildApplyLibraryCardAsPcPrompt(rec);
        expect(prompt).toContain('Replace the player\'s [CHARACTER] sheet');
        expect(prompt).toContain('PLAYER IDENTITY CARD:');
        expect(prompt).toContain('Name: Keeper');
        expect(prompt).toContain('Do not output [PARTY]');
        expect(prompt).toContain('Species: Bound dwarven forge spirit.');
    });
});
