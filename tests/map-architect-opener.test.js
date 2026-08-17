import { describe, expect, it } from 'vitest';
import {
    parseCreateAreaMapCommand,
    stripCreateAreaMapCommand,
    createAreaMapCommandIsComplete,
    isMapArchitectTextOpener,
    normalizeMapArchitectOpener,
    MAP_ARCHITECT_TEXT_OPENER_RULES,
} from '../map-architect-opener.js';

describe('Map Architect text opener', () => {
    it('parses keyed CREATE_AREA_MAP fences and discards prose after the block', () => {
        const parsed = parseCreateAreaMapCommand(`The doors of the abbey wait.

[CREATE_AREA_MAP]
site: Abbey Undercroft
entrance: Cellar Landing
kind: DUNGEON
scale: medium
premise: Abandoned crypt. Ghouls. Do not contradict the cracked west stair.
[/CREATE_AREA_MAP]

You step into a made-up throne room.`);

        expect(parsed.preamble).toBe('The doors of the abbey wait.');
        expect(parsed.args).toEqual({
            site: 'Abbey Undercroft',
            entrance: 'Cellar Landing',
            kind: 'DUNGEON',
            scale: 'MEDIUM',
            premise: 'Abandoned crypt. Ghouls. Do not contradict the cracked west stair.',
        });
        expect(createAreaMapCommandIsComplete(parsed.args)).toBe(true);

        const stripped = stripCreateAreaMapCommand(parsed.raw ? `The doors of the abbey wait.

[CREATE_AREA_MAP]
site: Abbey Undercroft
entrance: Cellar Landing
kind: DUNGEON
scale: MEDIUM
premise: Abandoned crypt. Ghouls. Do not contradict the cracked west stair.
[/CREATE_AREA_MAP]

You step into a made-up throne room.` : '');
        expect(stripped.text).toBe('The doors of the abbey wait.');
        expect(stripped.command.args.site).toBe('Abbey Undercroft');
    });

    it('accepts JSON inside the fence and multiline premises', () => {
        const parsed = parseCreateAreaMapCommand(`[CREATE_AREA_MAP]
{"site":"Riverford","entrance":"North Gate","kind":"SETTLEMENT","scale":"LARGE","premise":"River town."}
[/CREATE_AREA_MAP]`);
        expect(parsed.args.kind).toBe('SETTLEMENT');
        expect(parsed.args.scale).toBe('LARGE');
        expect(parsed.args.site).toBe('Riverford');

        const multi = parseCreateAreaMapCommand(`[CREATE_AREA_MAP]
site: Riverford
entrance: Docks
kind: SETTLEMENT
premise: Line one
Line two
[/CREATE_AREA_MAP]`);
        expect(multi.args.premise).toBe('Line one\nLine two');
        expect(stripCreateAreaMapCommand('[CREATE_AREA_MAP]\nsite: X\n[/CREATE_AREA_MAP]').text).toBe('\u200b');
    });

    it('treats tool as the default opener and keeps text-mode prompt rules distinct', () => {
        expect(isMapArchitectTextOpener({})).toBe(false);
        expect(isMapArchitectTextOpener({ mapArchitectOpener: 'text' })).toBe(true);
        expect(normalizeMapArchitectOpener('TEXT')).toBe('text');
        expect(MAP_ARCHITECT_TEXT_OPENER_RULES).toContain('[CREATE_AREA_MAP]');
        expect(MAP_ARCHITECT_TEXT_OPENER_RULES).toContain('Then STOP');
        expect(MAP_ARCHITECT_TEXT_OPENER_RULES).not.toContain('CreateAreaMap');
    });
});
