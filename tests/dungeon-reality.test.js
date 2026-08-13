import { describe, expect, it } from 'vitest';
import {
    buildDungeonRealityInjection,
    attachDungeonMapToLocationEntry,
    buildDungeonSitesFromLocationEntries,
    collectDungeonMapCandidates,
    dungeonLabelsMatch,
    extractDungeonMapSection,
    extractFooterLocation,
    extractHiddenDungeonDeltaBlocks,
    extractHiddenDungeonMapBlocks,
    findLatestDungeonLocation,
    getSiteRootFromLocation,
    looksLikeDungeonSite,
    migrateDungeonMapAttachmentToContent,
    parseDungeonDeltaBlock,
    resolveActiveDungeonSite,
    stripCapturedDungeonMapBlocks,
    stripDungeonMapSection,
    syncDungeonRealityState,
} from '../dungeon-reality.js';

function assistant(mes, extra = {}) {
    return { is_user: false, is_system: false, mes, ...extra };
}

describe('Dungeon Reality persistence', () => {
    it('extracts hidden blocks and binds them to the footer site root', () => {
        const text = `<div hidden>
Dungeon Site: Crypt of Whispers
Area: Guard Post - East
Two guards watch the lower door.
</div>

The stair exhales cold air.

*(Status: 10/10) | (XP: 0/300) | (Location: Crypt of Whispers, Hall of Echoes)*`;

        expect(extractHiddenDungeonMapBlocks(text)).toHaveLength(1);
        expect(extractFooterLocation(text)).toBe('Crypt of Whispers, Hall of Echoes');
        expect(getSiteRootFromLocation(extractFooterLocation(text))).toBe('Crypt of Whispers');

        const result = syncDungeonRealityState(null, [assistant(text, { swipe_id: 2 })]);
        expect(result.changed).toBe(true);
        expect(result.capturedChunks).toBe(1);
        expect(result.errors).toEqual([]);
        expect(result.state.sites['crypt of whispers']).toMatchObject({
            siteRoot: 'Crypt of Whispers',
            capturedAt: {
                messageIndex: 0,
                swipeId: 2,
                footerSnapshot: 'Crypt of Whispers, Hall of Echoes',
            },
            statusLog: [],
        });
    });

    it('accepts malformed model closing tags and stores a hidden root [MAP] section', () => {
        const text = `<div hidden data-dungeon-map>
Dungeon Site: Varnholde Crypts
Area: Main Chamber
A desecrated altar.
</div hidden>
*(Location: Varnholde Crypts, Main Chamber)*`;
        const collected = collectDungeonMapCandidates([assistant(text)]);
        expect(collected.errors).toEqual([]);
        expect(collected.maps).toHaveLength(1);
        expect(collected.maps[0].siteRoot).toBe('Varnholde Crypts');

        const root = { comment: 'Varnholde Crypts', content: '[CORE]A crypt.[/CORE]' };
        expect(attachDungeonMapToLocationEntry(root, collected.maps[0])).toBe(true);
        expect(attachDungeonMapToLocationEntry(root, { ...collected.maps[0], content: 'replacement' })).toBe(false);
        expect(extractDungeonMapSection(root.content)).toContain('Area: Main Chamber');
        expect(stripDungeonMapSection(root.content)).toBe('[CORE]A crypt.[/CORE]');
        expect(root.extensions?.multihogDungeonMap).toBeUndefined();
    });

    it('migrates the earlier private-extension attachment into normal lore content', () => {
        const root = {
            comment: 'Varnholde Crypts',
            content: '[CORE]A crypt.[/CORE]',
            extensions: {
                multihogDungeonMap: {
                    siteRoot: 'Varnholde Crypts',
                    content: 'Dungeon Site: Varnholde Crypts\nArea: Reliquary\nA pale shade waits.',
                },
            },
        };
        expect(migrateDungeonMapAttachmentToContent(root)).toBe(true);
        expect(extractDungeonMapSection(root.content)).toContain('A pale shade waits.');
        expect(root.extensions.multihogDungeonMap).toBeUndefined();
    });

    it('assembles an attached root map with descendant Lorebook Agent location state', () => {
        const entries = {
            0: {
                comment: 'Varnholde Crypts',
                content: '[CORE]A mapped crypt.[/CORE]\n\n[MAP]\nDungeon Site: Varnholde Crypts\nArea: Main Chamber\nA desecrated altar.\n[/MAP]',
            },
            1: {
                comment: 'Varnholde Crypts :: Main Chamber',
                content: '[CORE]A stone chamber.[/CORE]\n[Day 1, 08:05] The altar was scorched.',
            },
            2: { comment: 'Oakbridge :: Market', content: '[CORE]A market.[/CORE]' },
        };
        const state = { version: 3, sites: buildDungeonSitesFromLocationEntries(entries, 'Campaign_Locations') };
        const site = resolveActiveDungeonSite(state, 'Varnholde Crypts, Main Chamber');
        expect(site.entryId).toBe('Campaign_Locations::0');
        expect(site.locationEntries.map(row => row.label)).toEqual([
            'Varnholde Crypts',
            'Varnholde Crypts :: Main Chamber',
        ]);
        const injection = buildDungeonRealityInjection(site, 'Varnholde Crypts, Main Chamber');
        expect(injection).toContain('The altar was scorched.');
        expect(injection.match(/A desecrated altar\./g)).toHaveLength(1);
        expect(injection).not.toContain('A market.');
        expect(resolveActiveDungeonSite(state, 'Oakbridge, Market')).toBeNull();
    });

    it('merges follow-up chunks without rewriting or duplicating the skeleton', () => {
        const first = assistant(`<div hidden>Dungeon Site: The Sunken Keep\nArea: Gatehouse\nA barred gate.</div>\n*(Location: The Sunken Keep, Gatehouse)*`);
        const followUp = assistant(`<div hidden>Dungeon Site: The Sunken Keep\nArea: Lower Cistern\nA submerged bell alarm.</div>\n*(Location: The Sunken Keep, Lower Cistern)*`);

        const initial = syncDungeonRealityState(null, [first]);
        const merged = syncDungeonRealityState(initial.state, [first, followUp]);
        const repeated = syncDungeonRealityState(merged.state, [first, followUp]);

        expect(merged.state.sites['sunken keep'].mapChunks).toEqual([
            'Dungeon Site: The Sunken Keep\nArea: Gatehouse\nA barred gate.',
            'Dungeon Site: The Sunken Keep\nArea: Lower Cistern\nA submerged bell alarm.',
        ]);
        expect(repeated.changed).toBe(false);
        expect(repeated.capturedChunks).toBe(0);
    });

    it('parses explicit mutation/addition cues without treating them as map chunks', () => {
        const text = `<div hidden data-dungeon-delta>
Dungeon Site: The Sunken Keep
Mutation: Gatehouse | cleared; alarm bell disabled
Addition: Smuggler Niche - Gatehouse | behind loose stone; contains an oilskin ledger
</div>`;
        expect(extractHiddenDungeonMapBlocks(text)).toEqual([]);
        expect(extractHiddenDungeonDeltaBlocks(text)).toHaveLength(1);
        expect(parseDungeonDeltaBlock(extractHiddenDungeonDeltaBlocks(text)[0])).toEqual({
            siteRoot: 'The Sunken Keep',
            entries: [
                { type: 'mutation', label: 'Gatehouse', state: 'cleared; alarm bell disabled' },
                { type: 'addition', label: 'Smuggler Niche - Gatehouse', detail: 'behind loose stone; contains an oilskin ledger' },
            ],
            errors: [],
        });
    });

    it('appends selected-response deltas once and preserves their capture provenance', () => {
        const map = assistant('<div hidden>Dungeon Site: The Sunken Keep\nArea: Gatehouse\nA barred gate.</div>\n*(Location: The Sunken Keep, Gatehouse)*');
        const change = assistant(`<div hidden data-dungeon-delta>
Dungeon Site: The Sunken Keep
Mutation: Gatehouse | cleared
Addition: Smuggler Niche - Gatehouse | behind loose stone
</div>
The last guard falls and a loose stone reveals a niche.
*(Location: The Sunken Keep, Gatehouse)*`, { swipe_id: 3, send_date: 1234 });

        const captured = syncDungeonRealityState(null, [map, change]);
        const repeated = syncDungeonRealityState(captured.state, [map, change]);
        const log = captured.state.sites['sunken keep'].statusLog;

        expect(captured.capturedDeltas).toBe(2);
        expect(log).toHaveLength(2);
        expect(log[0]).toMatchObject({
            type: 'mutation',
            label: 'Gatehouse',
            state: 'cleared',
            at: { messageIndex: 1, swipeId: 3, sentAt: 1234 },
        });
        expect(log[1]).toMatchObject({
            type: 'addition',
            label: 'Smuggler Niche - Gatehouse',
            detail: 'behind loose stone',
        });
        expect(repeated.changed).toBe(false);
        expect(repeated.capturedDeltas).toBe(0);

        const reoccupied = assistant('<div hidden data-dungeon-delta>Dungeon Site: The Sunken Keep\nMutation: Gatehouse | reoccupied</div>\n*(Location: The Sunken Keep, Gatehouse)*');
        const clearedAgain = assistant('<div hidden data-dungeon-delta>Dungeon Site: The Sunken Keep\nMutation: Gatehouse | cleared</div>\n*(Location: The Sunken Keep, Gatehouse)*');
        const cycled = syncDungeonRealityState(captured.state, [map, change, reoccupied, clearedAgain]);
        expect(cycled.state.sites['sunken keep'].statusLog.map(entry => entry.state || entry.detail)).toEqual([
            'cleared',
            'behind loose stone',
            'reoccupied',
            'cleared',
        ]);
    });

    it('rejects deltas without an immutable site map and reports marker/footer conflicts', () => {
        const orphan = syncDungeonRealityState(null, [
            assistant('<div hidden data-dungeon-delta>Dungeon Site: Ember Mine\nMutation: Lift | disabled</div>\n*(Location: Ember Mine, Lift)*'),
        ]);
        expect(orphan.state).toBeNull();
        expect(orphan.errors.join(' ')).toContain('no captured immutable map exists');

        const conflict = syncDungeonRealityState(null, [
            assistant('<div hidden>Dungeon Site: Ember Mine\nArea: Lift\nFrayed cable.</div>\n*(Location: Blackglass Vault, Lift)*'),
        ]);
        expect(conflict.state).toBeNull();
        expect(conflict.errors.join(' ')).toContain('conflicts with footer site');
    });

    it('falls back to the explicit Dungeon Site marker when a map footer is malformed', () => {
        const result = syncDungeonRealityState(null, [
            assistant('<div hidden>Dungeon Site: Blackglass Vault\nArea: Entry Lock\nPoison needle.</div>'),
        ]);
        expect(result.errors).toEqual([]);
        expect(result.state.sites['blackglass vault'].mapChunks).toHaveLength(1);
    });

    it('keeps uncaptured hidden HTML when no site binding can be derived', () => {
        const raw = '<div hidden>Unlabeled secret material</div>';
        const result = syncDungeonRealityState(null, [assistant(raw)]);
        expect(result.state).toBeNull();
        expect(result.errors).toHaveLength(1);
        expect(stripCapturedDungeonMapBlocks(raw, result.state)).toBe(raw);
    });

    it('activates at site-root level, tolerates light drift, and stops after leaving', () => {
        const result = syncDungeonRealityState(null, [
            assistant('<div hidden>Dungeon Site: The Crypt of Whispers\nArea: Antechamber\nA pit trap.</div>\n*(Location: The Crypt of Whispers, Antechamber)*'),
        ]);

        expect(dungeonLabelsMatch('The Crypt of Whispers', 'Crypt of Whisper')).toBe(true);
        expect(resolveActiveDungeonSite(result.state, 'Crypt of Whisper, Lower Halls')?.siteRoot)
            .toBe('The Crypt of Whispers');
        expect(resolveActiveDungeonSite(result.state, 'Oakbridge, Market Square')).toBeNull();
    });

    it('strips only captured map blocks and builds an internal canon injection', () => {
        const captured = 'Dungeon Site: Ember Mine\nArea: Lift\nThe cable is frayed.';
        const uncaptured = 'Unrelated hidden UI payload';
        const result = syncDungeonRealityState(null, [
            assistant(`<div hidden>${captured}</div>\n*(Location: Ember Mine, Lift)*`),
        ]);
        const mixed = `<div hidden>${captured}</div>visible<div hidden>${uncaptured}</div>`;
        const stripped = stripCapturedDungeonMapBlocks(mixed, result.state);
        expect(stripped).not.toContain(captured);
        expect(stripped).toContain(uncaptured);

        const site = resolveActiveDungeonSite(result.state, 'Ember Mine, Lower Shaft');
        site.statusLog.push({ type: 'mutation', label: 'Lift', state: 'disabled' });
        const injection = buildDungeonRealityInjection(site, 'Ember Mine, Lower Shaft');
        expect(injection).toContain('[DUNGEON_REALITY — INTERNAL GM CANON]');
        expect(injection).toContain(captured);
        expect(injection).toContain('MUTATION — Lift: disabled');
        expect(injection).toContain('Do not treat it as a menu of allowed actions');
    });

    it('strips a valid captured delta cue but keeps malformed or uncaptured cues', () => {
        const map = assistant('<div hidden>Dungeon Site: Ember Mine\nArea: Lift\nFrayed cable.</div>\n*(Location: Ember Mine, Lift)*');
        const deltaBody = 'Dungeon Site: Ember Mine\nMutation: Lift | disabled';
        const delta = assistant(`<div hidden data-dungeon-delta>${deltaBody}</div>\n*(Location: Ember Mine, Lift)*`);
        const captured = syncDungeonRealityState(null, [map, delta]);

        expect(stripCapturedDungeonMapBlocks(delta.mes, captured.state)).not.toContain(deltaBody);
        const malformed = '<div hidden data-dungeon-delta>Dungeon Site: Ember Mine\nLift changed somehow</div>';
        expect(stripCapturedDungeonMapBlocks(malformed, captured.state)).toBe(malformed);
        const uncaptured = '<div hidden data-dungeon-delta>Dungeon Site: Ember Mine\nMutation: Lift | repaired</div>';
        expect(stripCapturedDungeonMapBlocks(uncaptured, captured.state)).toBe(uncaptured);
    });

    it('uses the latest narrator footer and diagnoses obvious high-risk roots', () => {
        const chat = [
            assistant('*(Location: Oakbridge, Market)*'),
            { is_user: true, mes: 'I travel.' },
            assistant('*(Location: Ashen Catacombs, Entry Stair)*'),
        ];
        expect(findLatestDungeonLocation(chat)).toBe('Ashen Catacombs, Entry Stair');
        expect(looksLikeDungeonSite(findLatestDungeonLocation(chat))).toBe(true);
        expect(looksLikeDungeonSite('Oakbridge, Market')).toBe(false);
    });
});
