import { describe, expect, it } from 'vitest';
import {
    applyDungeonMapTransaction,
    buildDungeonRealityInjection,
    buildDungeonMapCommitSchema,
    attachDungeonMapToLocationEntry,
    buildDungeonSitesFromLocationEntries,
    collectDungeonMapCandidates,
    dungeonLabelsMatch,
    extractDungeonMapSection,
    extractFooterLocation,
    extractHiddenDungeonDeltaBlocks,
    extractHiddenDungeonMapBlocks,
    findLatestDungeonLocation,
    formatDungeonMapForNarrator,
    formatDungeonMapForUpdater,
    getSiteRootFromLocation,
    looksLikeDungeonSite,
    migrateDungeonMapAttachmentToContent,
    migrateDungeonMapSectionToStructured,
    parseDungeonMapDocument,
    parseDungeonDeltaBlock,
    reconcileDungeonMapAreaKnowledge,
    resolveActiveDungeonSite,
    stripCapturedDungeonMapBlocks,
    stripDungeonRealityBlocksFromPrompt,
    stripDungeonMapSection,
    syncDungeonRealityState,
    validateDungeonMapArchitecture,
} from '../dungeon-reality.js';

const connectedArchitectMap = {
    version: 3,
    site: 'Abbey Undercroft',
    areas: [
        {
            id: 'cellar-landing',
            name: 'Cellar Landing',
            knowledge: 'VISITED',
            geometry: ['A low flagstone landing.'],
            connections: [{ to: 'crypt-passage', state: 'LOCKED', detail: 'Iron-banded door between the landing and passage.' }],
        },
        {
            id: 'crypt-passage',
            name: 'Crypt Passage',
            knowledge: 'UNREVEALED',
            geometry: ['A barrel-vaulted corridor.'],
            connections: [{ to: 'cellar-landing', state: 'LOCKED', detail: 'Iron-banded door between the landing and passage.' }],
        },
    ],
    assets: [{
        id: 'listening-ghoul',
        kind: 'CREATURE',
        name: 'Listening Ghoul',
        location: 'crypt-passage',
        state: 'ACTIVE',
        knowledge: 'UNREVEALED',
        detail: 'Waits behind a fallen arch.',
        origin: 'INITIAL_MAP',
    }],
};

describe('Map Architect validation', () => {
    it('accepts a connected graph even when its entrance route is locked', () => {
        const result = validateDungeonMapArchitecture(connectedArchitectMap, {
            site: 'Abbey Undercroft',
            entrance: 'Cellar Landing',
        });
        expect(result.valid).toBe(true);
        expect(result.document.areas).toHaveLength(2);
    });

    it('rejects omitted reverse passages and orphaned areas with correction hints', () => {
        const broken = structuredClone(connectedArchitectMap);
        broken.areas[1].connections = [];
        const result = validateDungeonMapArchitecture(broken, {
            site: 'Abbey Undercroft',
            entrance: 'Cellar Landing',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.map(error => error.code)).toEqual(expect.arrayContaining([
            'AREA_WITHOUT_CONNECTION',
            'MISSING_RECIPROCAL_CONNECTION',
        ]));
    });

    it('rejects unknown asset locations before persistence', () => {
        const broken = structuredClone(connectedArchitectMap);
        broken.assets[0].location = 'missing-room';
        const result = validateDungeonMapArchitecture(broken, { site: 'Abbey Undercroft', entrance: 'Cellar Landing' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(error => error.code === 'UNKNOWN_ASSET_LOCATION')).toBe(true);
    });

    it('uses district-scale area counts for SETTLEMENT maps and stamps kind', () => {
        const names = ['Gate', 'Market', 'Docks', 'Temple Ward', 'Old Town', 'Keep'];
        const areas = names.map((name, index) => {
            const id = name.toLowerCase().replace(/\s+/g, '-');
            const other = names.filter((_, otherIndex) => otherIndex !== index).map(label => ({
                to: label.toLowerCase().replace(/\s+/g, '-'),
                state: 'OPEN',
                detail: 'Street',
            }));
            return {
                id,
                name,
                knowledge: index === 0 ? 'VISITED' : 'UNREVEALED',
                geometry: [`The ${name} district.`],
                connections: other.slice(0, 1),
            };
        });
        areas.forEach((area, index) => {
            const target = areas[(index + 1) % areas.length];
            area.connections = [{ to: target.id, state: 'OPEN', detail: 'Main road' }];
        });
        areas.forEach((area, index) => {
            const source = areas[(index + areas.length - 1) % areas.length];
            if (!area.connections.some(connection => connection.to === source.id)) {
                area.connections.push({ to: source.id, state: 'OPEN', detail: 'Main road' });
            }
        });
        const settlement = {
            version: 3,
            site: 'Riverford',
            kind: 'SETTLEMENT',
            areas,
            assets: [],
        };
        const result = validateDungeonMapArchitecture(settlement, {
            site: 'Riverford',
            entrance: 'Gate',
            scale: 'MEDIUM',
            kind: 'SETTLEMENT',
        });
        expect(result.valid).toBe(true);
        expect(result.document.kind).toBe('SETTLEMENT');
        expect(result.document.areas).toHaveLength(6);

        const tooSmall = structuredClone(settlement);
        tooSmall.areas = settlement.areas.slice(0, 4);
        tooSmall.areas.forEach((area) => {
            area.connections = area.connections.filter(connection => tooSmall.areas.some(candidate => candidate.id === connection.to));
        });
        expect(validateDungeonMapArchitecture(tooSmall, {
            site: 'Riverford',
            entrance: 'Gate',
            scale: 'MEDIUM',
            kind: 'SETTLEMENT',
        }).errors.some(error => error.code === 'SCALE_AREA_COUNT')).toBe(true);
    });

    it('tells the narrator that settlement maps are district-scale', () => {
        const injection = buildDungeonRealityInjection({
            siteRoot: 'Riverford',
            mapChunks: [JSON.stringify({
                version: 3,
                site: 'Riverford',
                kind: 'SETTLEMENT',
                areas: [
                    { id: 'gate', name: 'Gate', knowledge: 'VISITED', geometry: ['A timber palisade gate.'], connections: [{ to: 'market', state: 'OPEN', detail: 'Cobbled road' }] },
                    { id: 'market', name: 'Market', knowledge: 'DISCOVERED', geometry: ['Open stalls around a well.'], connections: [{ to: 'gate', state: 'OPEN', detail: 'Cobbled road' }] },
                ],
                assets: [],
            })],
            locationEntries: [],
            statusLog: [],
        }, 'Riverford, Gate');
        expect(injection).toContain('district-scale settlement canon');
        expect(injection).toContain('invent granular interiors');
        expect(injection).toContain('name it in the Location footer');
        expect(injection).toContain('Map kind: SETTLEMENT (district-scale)');
        expect(injection).not.toContain('room-scale interior canon');
    });
});

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
        const stored = parseDungeonMapDocument(extractDungeonMapSection(root.content)).document;
        expect(stored).toMatchObject({
            version: 3,
            site: 'Varnholde Crypts',
            areas: [{ id: 'main-chamber', name: 'Main Chamber' }],
        });
        expect(stored.areas[0].geometry).toContain('A desecrated altar.');
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

    it('migrates prose maps into structured geometry and movable assets without losing facts', () => {
        const root = {
            comment: 'Abbey Undercroft',
            content: `[CORE]A mapped site.[/CORE]\n\n[MAP]\nDungeon Site: Abbey Undercroft

Area: Crypt Passage - East
- 10-foot-wide corridor with a collapsed arch.
- One ghoul crouches behind the collapsed arch.
- North wall: rotten tapestry conceals Ossuary Behind Rotten Tapestry.

Area: Ossuary Behind Rotten Tapestry
- Three ossuary boxes rest on a stone shelf.
[/MAP]`,
        };
        expect(migrateDungeonMapSectionToStructured(root)).toBe(true);
        const map = parseDungeonMapDocument(extractDungeonMapSection(root.content)).document;
        expect(map.version).toBe(3);
        expect(map.areas.map(area => area.id)).toEqual(['crypt-passage-east', 'ossuary-behind-rotten-tapestry']);
        expect(map.areas[0].geometry).toContain('10-foot-wide corridor with a collapsed arch.');
        expect(map.areas[0].connections).toContainEqual({ to: 'ossuary-behind-rotten-tapestry', state: 'OPEN', detail: '' });
        expect(map.assets).toContainEqual(expect.objectContaining({
            id: 'ghoul',
            kind: 'CREATURE',
            location: 'crypt-passage-east',
            state: 'ACTIVE',
        }));
    });

    it('renders structured maps as compact prose with visible assets and deduplicated routes', () => {
        const map = {
            version: 3,
            site: 'Abbey Undercroft',
            areas: [
                { id: 'landing', name: 'Cellar Landing', knowledge: 'VISITED', geometry: ['Low oak beams cross the ceiling.'], connections: [{ to: 'crypt', state: 'OPEN', detail: 'Iron-banded door' }] },
                { id: 'crypt', name: 'Crypt Passage', knowledge: 'DISCOVERED', geometry: ['A collapsed arch provides cover.'], connections: [{ to: 'landing', state: 'OPEN', detail: 'Iron-banded door' }] },
            ],
            assets: [{ id: 'ghoul', kind: 'CREATURE', name: 'Crypt Ghoul', location: 'crypt', state: 'DESTROYED', knowledge: 'KNOWN', detail: 'Smoldering remains beneath the arch.', origin: 'INITIAL_MAP' }],
        };
        const raw = JSON.stringify(map, null, 2);
        const readable = formatDungeonMapForNarrator(map);
        expect(readable).toContain('Area: Cellar Landing [VISITED]');
        expect(readable).toContain('Cellar Landing <-> Crypt Passage [OPEN] — Iron-banded door');
        expect(readable.match(/Cellar Landing <-> Crypt Passage/g)).toHaveLength(1);
        expect(readable).toContain('Crypt Ghoul [CREATURE / DESTROYED / KNOWN] — Smoldering remains beneath the arch.');
        expect(readable).not.toContain('"version"');
        expect(readable.length).toBeLessThan(raw.length * 0.7);
    });

    it('uses explicit child chronicles once when establishing current state from a legacy map', () => {
        const root = {
            comment: 'Abbey Undercroft',
            content: '[CORE]A mapped site.[/CORE]\n[MAP]\nDungeon Site: Abbey Undercroft\nArea: Crypt Passage - East\n- One ghoul crouches behind the arch.\n[/MAP]',
        };
        const entries = {
            0: root,
            1: {
                comment: 'Abbey Undercroft :: Crypt Passage - East',
                content: '[CORE]A stone corridor.[/CORE]\n[Day 1, 08:33 AM] The ghoul was destroyed by a point-blank Guiding Bolt.',
            },
        };
        expect(reconcileDungeonMapAreaKnowledge(root, entries)).toBe(true);
        const map = parseDungeonMapDocument(extractDungeonMapSection(root.content)).document;
        expect(map.areas[0].knowledge).toBe('VISITED');
        expect(map.assets[0]).toMatchObject({ state: 'DESTROYED', knowledge: 'KNOWN' });
        expect(map.assets[0].detail).toContain('destroyed by a point-blank Guiding Bolt');

        // Once structured, historical inference does not overwrite newer map truth.
        map.assets[0].state = 'ACTIVE';
        root.content = root.content.replace(/\[MAP\][\s\S]*?\[\/MAP\]/, `[MAP]\n${JSON.stringify(map)}\n[/MAP]`);
        expect(reconcileDungeonMapAreaKnowledge(root, entries)).toBe(false);
        expect(parseDungeonMapDocument(extractDungeonMapSection(root.content)).document.assets[0].state).toBe('ACTIVE');
    });

    it('applies validated asset movement/current-state updates and resolves chronicles', () => {
        const map = {
            version: 3,
            site: 'Abbey Undercroft',
            areas: [
                { id: 'crypt-passage', name: 'Crypt Passage', knowledge: 'VISITED', geometry: [], connections: [{ to: 'cellar', state: 'OPEN', detail: '' }] },
                { id: 'cellar', name: 'Cellar Landing', knowledge: 'VISITED', geometry: [], connections: [{ to: 'crypt-passage', state: 'OPEN', detail: '' }] },
            ],
            assets: [
                { id: 'crypt-ghoul', kind: 'CREATURE', name: 'Crypt Ghoul', location: 'crypt-passage', state: 'ACTIVE', knowledge: 'KNOWN', detail: '', origin: 'INITIAL_MAP', behavior: 'On alarm, move toward the cellar.' },
            ],
        };
        const moved = applyDungeonMapTransaction(map, {
            operation_id: 'day1-0832-ghoul-moves',
            operations: [{ op: 'MOVE_ASSET', evidence: 'AUTONOMOUS', asset_id: 'crypt-ghoul', from: 'crypt-passage', to: 'cellar', state: 'ALERT' }],
            chronicles: [],
        });
        expect(moved.ok).toBe(true);
        expect(moved.document.assets[0]).toMatchObject({ location: 'cellar', state: 'ALERT' });
        expect(map.assets[0].location).toBe('crypt-passage');

        const destroyed = applyDungeonMapTransaction(moved.document, {
            operation_id: 'day1-0833-ghoul-destroyed',
            operations: [{ op: 'SET_ASSET', evidence: 'CONFIRMED', asset_id: 'crypt-ghoul', state: 'DESTROYED', knowledge: 'KNOWN', detail: 'Smoldering remains on the landing.' }],
            chronicles: [{ area_id: 'cellar', text: 'The crypt ghoul was destroyed.' }],
        });
        expect(destroyed.ok).toBe(true);
        expect(destroyed.document.assets[0].state).toBe('DESTROYED');
        expect(destroyed.document.areas.find(area => area.id === 'cellar').knowledge).toBe('VISITED');
        expect(destroyed.chronicles).toEqual([{ areaId: 'cellar', areaName: 'Cellar Landing', text: 'The crypt ghoul was destroyed.' }]);
    });

    it('marks a chronicled area visited in the pure transaction result', () => {
        const map = {
            version: 3,
            site: 'Abbey Undercroft',
            areas: [{ id: 'cellar', name: 'Cellar Landing', knowledge: 'UNREVEALED', geometry: [], connections: [] }],
            assets: [],
        };
        const applied = applyDungeonMapTransaction(map, {
            operation_id: 'day1-0813-enter-cellar',
            operations: [{ op: 'SET_AREA', evidence: 'CONFIRMED', area_id: 'cellar', geometry_append: ['Loose stones were braced.'] }],
            chronicles: [{ area_id: 'cellar', text: 'The party entered the cellar and braced its loose stones.' }],
        });
        expect(applied.ok).toBe(true);
        expect(applied.document.areas[0].knowledge).toBe('VISITED');
        expect(map.areas[0].knowledge).toBe('UNREVEALED');
    });

    it('requires blocked geometry to be changed before an asset traverses it', () => {
        const map = {
            version: 3,
            site: 'Abbey Undercroft',
            areas: [
                { id: 'vault', name: 'Vault', knowledge: 'VISITED', geometry: [], connections: [{ to: 'sanctum', state: 'LOCKED', detail: 'Iron gate' }] },
                { id: 'sanctum', name: 'Sanctum', knowledge: 'UNREVEALED', geometry: [], connections: [{ to: 'vault', state: 'LOCKED', detail: 'Iron gate' }] },
            ],
            assets: [{ id: 'wight', kind: 'CREATURE', name: 'Wight', location: 'sanctum', state: 'ACTIVE', knowledge: 'UNREVEALED', detail: '', origin: 'INITIAL_MAP' }],
        };
        const blocked = applyDungeonMapTransaction(map, {
            operation_id: 'day1-0900-invalid-gate-move',
            operations: [{ op: 'MOVE_ASSET', evidence: 'CONFIRMED', asset_id: 'wight', to: 'vault' }],
        });
        expect(blocked.ok).toBe(false);
        expect(blocked.errors[0].code).toBe('CONNECTION_NOT_TRAVERSABLE');

        const openedThenMoved = applyDungeonMapTransaction(map, {
            operation_id: 'day1-0900-open-gate-move',
            operations: [
                { op: 'SET_CONNECTION', evidence: 'CONFIRMED', from: 'sanctum', to: 'vault', state: 'OPEN' },
                { op: 'MOVE_ASSET', evidence: 'CONFIRMED', asset_id: 'wight', to: 'vault' },
            ],
        });
        expect(openedThenMoved.ok).toBe(true);
        expect(openedThenMoved.document.assets[0].location).toBe('vault');
    });

    it('rejects semantic map errors with precise retry guidance and no partial mutation', () => {
        const map = {
            version: 3,
            site: 'Abbey Undercroft',
            areas: [{ id: 'crypt-passage', name: 'Crypt Passage', knowledge: 'VISITED', geometry: [], connections: [] }],
            assets: [{ id: 'crypt-ghoul', kind: 'CREATURE', name: 'Crypt Ghoul', location: 'crypt-passage', state: 'ACTIVE', knowledge: 'KNOWN', detail: '', origin: 'INITIAL_MAP' }],
        };
        const failed = applyDungeonMapTransaction(map, {
            operation_id: 'day1-0834-bad-move',
            operations: [{ op: 'MOVE_ASSET', evidence: 'CONFIRMED', asset_id: 'crypt-ghoul', from: 'wrong-room', to: 'missing-room' }],
        });
        expect(failed.ok).toBe(false);
        expect(failed.retryable).toBe(true);
        expect(failed.errors.map(error => error.code)).toContain('AREA_NOT_FOUND');
        expect(map.assets[0].location).toBe('crypt-passage');

        const autonomous = applyDungeonMapTransaction(map, {
            operation_id: 'day1-0834-unprompted-alert',
            operations: [{ op: 'SET_ASSET', evidence: 'AUTONOMOUS', asset_id: 'crypt-ghoul', state: 'ALERT' }],
        });
        expect(autonomous.ok).toBe(false);
        expect(autonomous.errors[0]).toMatchObject({ code: 'AUTONOMY_NOT_ALLOWED' });
    });

    it('rejects likely duplicate new enemies unless distinctness is explicit', () => {
        const map = {
            version: 3,
            site: 'Abbey Undercroft',
            areas: [{ id: 'crypt', name: 'Crypt', knowledge: 'VISITED', geometry: [], connections: [] }],
            assets: [{ id: 'crypt-ghoul', kind: 'CREATURE', name: 'Crypt Ghoul', location: 'crypt', state: 'ACTIVE', knowledge: 'KNOWN', detail: '', origin: 'INITIAL_MAP' }],
        };
        const duplicate = applyDungeonMapTransaction(map, {
            operation_id: 'day1-0835-ghoul',
            operations: [{ op: 'ADD_ASSET', evidence: 'CONFIRMED', name: 'Crypt Ghoul', kind: 'CREATURE', location: 'crypt', state: 'ACTIVE', knowledge: 'KNOWN' }],
        });
        expect(duplicate.ok).toBe(false);
        expect(duplicate.errors[0]).toMatchObject({ code: 'POSSIBLE_DUPLICATE_ASSET' });
        expect(duplicate.errors[0].candidates[0].id).toBe('crypt-ghoul');
    });

    it('creates stable IDs for narrator-resolved temporary assets', () => {
        const map = {
            version: 3,
            site: 'Abbey Undercroft',
            areas: [{ id: 'crypt', name: 'Crypt', knowledge: 'VISITED', geometry: [], connections: [] }],
            assets: [],
        };
        const added = applyDungeonMapTransaction(map, {
            operation_id: 'day1-0840-summoned-spirit',
            operations: [{
                op: 'ADD_ASSET', evidence: 'CONFIRMED', name: 'Summoned Spirit', kind: 'CREATURE',
                location: 'crypt', state: 'ACTIVE', knowledge: 'KNOWN', origin: 'PLAYER_RESOLVED',
                owner: 'Silvan Starweaver', duration: '10 minutes',
            }],
        });
        expect(added.ok).toBe(true);
        expect(added.createdAssets).toEqual([{ id: 'summoned-spirit', name: 'Summoned Spirit' }]);
        expect(added.document.assets[0]).toMatchObject({
            id: 'summoned-spirit', owner: 'Silvan Starweaver', duration: '10 minutes', origin: 'PLAYER_RESOLVED',
        });
    });

    it('defaults omitted map evidence to CONFIRMED and coerces NPC kind to CREATURE', () => {
        const map = {
            version: 3,
            site: 'Morrowfen',
            kind: 'SETTLEMENT',
            areas: [{ id: 'shrine-quarter', name: 'Shrine Quarter', knowledge: 'VISITED', geometry: [], connections: [] }],
            assets: [{ id: 'shrine-ossuary-keepers', kind: 'GROUP', name: 'Keepers of the Drowned Stone', location: 'shrine-quarter', state: 'ACTIVE', knowledge: 'UNREVEALED', detail: '', origin: 'INITIAL_MAP' }],
        };
        const added = applyDungeonMapTransaction(map, {
            operation_id: 'morrowfen-shrine-chapel-entry',
            operations: [
                {
                    op: 'ADD_ASSET', name: 'Chapel of the Drowned Stone', kind: 'OBJECT',
                    location: 'shrine-quarter', state: 'ACTIVE', knowledge: 'KNOWN',
                    detail: 'Dry stone chapel with reed mats.',
                },
                {
                    op: 'ADD_ASSET', name: 'Odran', kind: 'NPC',
                    location: 'shrine-quarter', state: 'ACTIVE', knowledge: 'KNOWN',
                    detail: 'Elderly gray-hooded priest in the chapel.',
                    distinct_from: [],
                },
            ],
            chronicles: [{ area_id: 'shrine-quarter', text: 'Entered the Chapel of the Drowned Stone.' }],
        });
        expect(added.ok).toBe(true);
        expect(added.createdAssets).toEqual([
            { id: 'chapel-of-the-drowned-stone', name: 'Chapel of the Drowned Stone' },
            { id: 'odran', name: 'Odran' },
        ]);
        expect(added.document.assets.find(asset => asset.id === 'chapel-of-the-drowned-stone')).toMatchObject({
            kind: 'OBJECT', knowledge: 'KNOWN', origin: 'NARRATOR_ESTABLISHED',
        });
        expect(added.document.assets.find(asset => asset.id === 'odran')).toMatchObject({
            kind: 'CREATURE', knowledge: 'KNOWN', origin: 'NARRATOR_ESTABLISHED',
        });
    });

    it('accepts type/asset-wrapped ADD_ASSET operations', () => {
        const map = {
            version: 3,
            site: 'Morrowfen',
            areas: [{ id: 'shrine-quarter', name: 'Shrine Quarter', knowledge: 'VISITED', geometry: [], connections: [] }],
            assets: [],
        };
        const applied = applyDungeonMapTransaction(map, {
            operation_id: 'day1-1557-chapel-drowned-stone',
            operations: [
                {
                    type: 'ADD_ASSET',
                    asset: {
                        kind: 'OBJECT',
                        name: 'Chapel of the Drowned Stone',
                        location: 'shrine-quarter',
                        state: 'ACTIVE',
                        knowledge: 'KNOWN',
                        detail: 'Narrow stone sanctuary tucked behind iron votive screens.',
                    },
                },
                {
                    type: 'ADD_ASSET',
                    asset: {
                        kind: 'CREATURE',
                        name: 'Priest Odran',
                        location: 'shrine-quarter',
                        state: 'ACTIVE',
                        knowledge: 'KNOWN',
                        detail: 'Elderly gray-hooded priest tending the chapel.',
                    },
                },
            ],
            chronicles: [{ area_id: 'shrine-quarter', text: 'Entered the Chapel of the Drowned Stone and met Priest Odran.' }],
        });
        expect(applied.ok).toBe(true);
        expect(applied.document.assets.map(asset => asset.name)).toEqual([
            'Chapel of the Drowned Stone',
            'Priest Odran',
        ]);
        expect(applied.document.assets[0]).toMatchObject({ kind: 'OBJECT', location: 'shrine-quarter', knowledge: 'KNOWN' });
        expect(applied.document.assets[1]).toMatchObject({ kind: 'CREATURE', location: 'shrine-quarter' });
    });

    it('accepts chronicle.area as an alias for area_id', () => {
        const map = {
            version: 3,
            site: 'Morrowfen',
            areas: [{ id: 'shrine-quarter', name: 'Shrine Quarter', knowledge: 'VISITED', geometry: [], connections: [] }],
            assets: [],
        };
        const applied = applyDungeonMapTransaction(map, {
            operation_id: 'day1-1557-chapel-drowned-stone',
            operations: [{
                op: 'ADD_ASSET', kind: 'OBJECT', name: 'Chapel of the Drowned Stone',
                location: 'shrine-quarter', state: 'ACTIVE', knowledge: 'KNOWN',
            }],
            chronicles: [{ area: 'shrine-quarter', text: 'Entered the Chapel of the Drowned Stone and received shelter from Odran.' }],
        });
        expect(applied.ok).toBe(true);
        expect(applied.chronicles).toEqual([{
            areaId: 'shrine-quarter',
            areaName: 'Shrine Quarter',
            text: 'Entered the Chapel of the Drowned Stone and received shelter from Odran.',
        }]);
    });

    it('ships a strict conditional map commit schema', () => {
        const schema = buildDungeonMapCommitSchema();
        expect(schema.additionalProperties).toBe(false);
        expect(schema.required).toEqual(['operation_id', 'operations']);
        expect(schema.properties.operations.items.oneOf).toHaveLength(7);
        expect(schema.properties.operations.items.oneOf.every(item => item.additionalProperties === false)).toBe(true);
        expect(schema.description).toContain('Do not include transient combat poses');
        const setAsset = schema.properties.operations.items.oneOf.find(item => item.properties.op.enum.includes('SET_ASSET'));
        expect(setAsset.properties.detail.description).toContain('Never HP, targeting, mid-round poses');
        expect(schema.properties.chronicles.description).toContain('Not turn-by-turn combat choreography');
    });

    it('formats a compact occupancy snapshot for the Map Updater', () => {
        const snapshot = formatDungeonMapForUpdater({
            version: 3,
            site: 'Abbey Undercroft',
            kind: 'DUNGEON',
            areas: [{
                id: 'cellar-landing',
                name: 'Cellar Landing',
                knowledge: 'VISITED',
                geometry: ['A damp stair landing.'],
                connections: [{ to: 'crypt-passage-east', state: 'OPEN' }],
            }],
            assets: [{
                id: 'crypt-ghoul',
                kind: 'CREATURE',
                name: 'Crypt Ghoul',
                location: 'cellar-landing',
                state: 'ACTIVE',
                knowledge: 'UNREVEALED',
            }],
        }, 'Abbey Undercroft, Cellar Landing');
        expect(snapshot).toContain('KIND: DUNGEON');
        expect(snapshot).toContain('cellar-landing | Cellar Landing | VISITED');
        expect(snapshot).toContain('crypt-ghoul | CREATURE | Crypt Ghoul');
        expect(snapshot).toContain('A damp stair landing.');
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
        expect(injection).not.toContain('A stone chamber.');
        expect(injection).not.toContain('A mapped crypt.');
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

    it('binds a structured JSON map by its site field when no footer is available', () => {
        const body = JSON.stringify({
            version: 3,
            site: 'Blackglass Vault',
            areas: [{ id: 'entry-lock', name: 'Entry Lock', knowledge: 'UNREVEALED', geometry: ['A poison needle.'], connections: [] }],
            assets: [],
        });
        const collected = collectDungeonMapCandidates([assistant(`<div hidden data-dungeon-map>${body}</div>`)]);
        expect(collected.errors).toEqual([]);
        expect(collected.maps[0].siteRoot).toBe('Blackglass Vault');
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
        expect(resolveActiveDungeonSite(result.state, 'Forest Near the Crypt of Whispers')).toBeNull();
        expect(resolveActiveDungeonSite(result.state, 'The Crypt of Whispers')).toBeTruthy();
        expect(dungeonLabelsMatch('Forest Near the Crypt of Whispers', 'The Crypt of Whispers')).toBe(false);
        expect(resolveActiveDungeonSite(result.state, 'Whispering Woods, Crypt of Whispers')?.siteRoot)
            .toBe('The Crypt of Whispers');
        expect(resolveActiveDungeonSite(result.state, 'Whispering Woods, Crypt of Whispers, Antechamber')?.siteRoot)
            .toBe('The Crypt of Whispers');
        expect(looksLikeDungeonSite('Whispering Woods, Forgotten Tomb')).toBe(true);
    });

    it('prefers a nested mapped dungeon over a mapped outer region', () => {
        const entries = {
            0: {
                comment: 'Whispering Woods',
                content: '[CORE]A mapped forest.[/CORE]\n[MAP]\nDungeon Site: Whispering Woods\nArea: Trailhead\nA deer path.\n[/MAP]',
            },
            1: {
                comment: 'Forgotten Tomb',
                content: '[CORE]A mapped tomb.[/CORE]\n[MAP]\nDungeon Site: Forgotten Tomb\nArea: Antechamber\nA sealed door.\n[/MAP]',
            },
        };
        const state = { version: 3, sites: buildDungeonSitesFromLocationEntries(entries, 'Campaign_Locations') };
        expect(resolveActiveDungeonSite(state, 'Whispering Woods, Trailhead')?.siteRoot).toBe('Whispering Woods');
        expect(resolveActiveDungeonSite(state, 'Whispering Woods, Forgotten Tomb')?.siteRoot).toBe('Forgotten Tomb');
        expect(resolveActiveDungeonSite(state, 'Forest Near the Forgotten Tomb')).toBeNull();
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
        expect(injection).toContain('Dungeon Site: Ember Mine');
        expect(injection).toContain('Area: Lift [UNREVEALED]');
        expect(injection).toContain('The cable is frayed.');
        expect(injection).toContain('MUTATION — Lift: disabled');
        expect(injection).toContain('Do not treat it as a menu of allowed actions');
        expect(injection).toContain('resolved story events override stale positions/states');
        expect(injection).toContain('room-scale interior canon');
        expect(injection).toContain('you may add a room or incidental feature');
        expect(injection).not.toContain('do not invent missing rooms');
        expect(injection).not.toContain('current operational snapshot');
    });

    it('never sends stored structured JSON to the narrator', () => {
        const raw = JSON.stringify({
            version: 3,
            site: 'Blackglass Vault',
            areas: [{ id: 'entry', name: 'Entry Lock', knowledge: 'VISITED', geometry: ['A narrow stone lock chamber.'], connections: [] }],
            assets: [{ id: 'needle', kind: 'TRAP', name: 'Poison Needle', location: 'entry', state: 'ARMED', knowledge: 'SUSPECTED', detail: 'Set inside the lock.', origin: 'INITIAL_MAP' }],
        }, null, 2);
        const injection = buildDungeonRealityInjection({
            siteRoot: 'Blackglass Vault',
            mapChunks: [raw],
            locationEntries: [],
            statusLog: [],
        }, 'Blackglass Vault, Entry Lock');
        expect(injection).toContain('Poison Needle [TRAP / ARMED / SUSPECTED]');
        expect(injection).not.toContain('"version"');
        expect(injection).not.toContain('"assets"');
        expect(injection.length).toBeLessThan(raw.length + 900);
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

    it('removes all hidden map and delta blocks when the component is disabled', () => {
        const storedEntry = {
            comment: 'Ember Mine',
            content: '[CORE]\nA mapped mine.\n[/CORE]\n\n[MAP]\n{"version":3,"site":"Ember Mine","areas":[],"assets":[]}\n[/MAP]',
        };
        const storedContentBefore = storedEntry.content;
        const prompt = [
            {
                role: 'assistant',
                mes: '<div hidden data-dungeon-map>{"version":3,"site":"Ember Mine"}</div>Visible map prose',
            },
            {
                role: 'assistant',
                content: [{ type: 'text', text: '<div hidden data-dungeon-delta>Dungeon Site: Ember Mine\nMutation: Lift | cleared</div>Keep this' }],
            },
            {
                name: 'Dungeon Reality',
                mes: '[DUNGEON_REALITY — INTERNAL GM CANON]\nSite: Ember Mine\n[/DUNGEON_REALITY]',
            },
            { role: 'system', content: '<div hidden data-other-private>Keep unrelated hidden data</div>' },
        ];

        stripDungeonRealityBlocksFromPrompt(prompt);

        expect(prompt[0].mes).toBe('Visible map prose');
        expect(prompt[1].content[0].text).toBe('Keep this');
        expect(prompt.some(message => message.name === 'Dungeon Reality')).toBe(false);
        expect(prompt.at(-1).content).toContain('data-other-private');
        expect(storedEntry.content).toBe(storedContentBefore);
        expect(extractDungeonMapSection(storedEntry.content)).toContain('"site":"Ember Mine"');
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
