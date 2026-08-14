import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMapArchitectResponse } from '../map-architect-parser.js';
import { MAP_ARCHITECT_JSON_SCHEMA } from '../map-architect-schema.js';
import { DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT } from '../map-architect-prompt.js';

describe('Map Architect component', () => {
    it('recovers a valid JSON object from a fenced response', () => {
        const result = parseMapArchitectResponse('```json\n{"version":3,"site":"Crypt","areas":[],"assets":[]}\n```');
        expect(result.error).toBeNull();
        expect(result.value.site).toBe('Crypt');
    });

    it('reports malformed JSON so it can be fed into a correction pass', () => {
        const result = parseMapArchitectResponse('{"version":3,"areas":[');
        expect(result.value).toBeNull();
        expect(result.error).toMatch(/incomplete|Invalid JSON/i);
    });

    it('registers a hidden narrator tool and a dedicated connection path', () => {
        const hooks = readFileSync(new URL('../narrative-hooks.js', import.meta.url), 'utf8');
        const architect = readFileSync(new URL('../map-architect.js', import.meta.url), 'utf8');
        expect(hooks).toContain("name: 'CreateDungeonMap'");
        expect(hooks).toContain('Generating a location map for');
        expect(hooks).toContain("isEffectiveSectionEnabled('dungeon_reality_and_hidden_mapping'");
        expect(architect).toContain('MAX_CORRECTION_ATTEMPTS = 2');
        expect(architect).toContain('persistArchitectDungeonMap');
        expect(architect).toContain('mapArchitectConnectionSource');
        expect(architect).toContain('{ jsonSchema: MAP_ARCHITECT_JSON_SCHEMA }');
        expect(architect).toContain('throw mapArchitectFailure');
        expect(architect).toContain('Location map ready for');
        expect(architect).toContain('Location map generation failed for');
    });

    it('defines the complete structured map response contract', () => {
        expect(MAP_ARCHITECT_JSON_SCHEMA.name).toBe('dungeon_map_v3');
        expect(MAP_ARCHITECT_JSON_SCHEMA.returnInvalid).toBe(true);
        expect(MAP_ARCHITECT_JSON_SCHEMA.value.required).toEqual(['version', 'site', 'areas', 'assets']);
        expect(MAP_ARCHITECT_JSON_SCHEMA.value.properties.areas.items.required).toContain('connections');
        expect(MAP_ARCHITECT_JSON_SCHEMA.value.properties.assets.items.required).toContain('origin');
    });

    it('tells the architect to populate incidental objects instead of leaving them for later', () => {
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('Do not contradict established campaign facts');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('do not leave the map sparse for later invention');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).not.toContain('need not pre-invent');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('Occasional hub/nexus layouts are welcome');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('one area may have many routes');
    });
});
