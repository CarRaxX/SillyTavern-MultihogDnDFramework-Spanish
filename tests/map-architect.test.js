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

    it('defaults Map Architect max output tokens to 25000 without capping below that', () => {
        const defaults = readFileSync(new URL('../src/state/defaults.js', import.meta.url), 'utf8');
        const architect = readFileSync(new URL('../map-architect.js', import.meta.url), 'utf8');
        const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        const profiles = readFileSync(new URL('../src/state/profiles.js', import.meta.url), 'utf8');
        const settingsMarkup = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
        expect(defaults).toContain('mapArchitectMaxTokens: 25000');
        expect(architect).toContain('Number(settings.mapArchitectMaxTokens) || 25000');
        expect(architect).toContain('stream: true');
        expect(index).toContain('settings.mapArchitectMaxTokens ?? 25000');
        expect(index).toContain('Math.min(32000, parseInt(String($(this).val()), 10) || 25000)');
        expect(profiles).toContain('mapArchitectMaxTokens: s.mapArchitectMaxTokens ?? 25000');
        expect(settingsMarkup).toMatch(/id="rpg_map_architect_max_tokens"[^>]*max="32000"/);
        expect(settingsMarkup).toContain('<b>Persistent Maps</b>');
        expect(settingsMarkup).toContain('<b>Map Architect</b>');
        expect(settingsMarkup).not.toContain('<b>Architect Prompt</b>');
        expect(defaults).not.toContain('mapArchitectMaxTokens: 6000');
        expect(index).not.toContain('mapArchitectMaxTokens ?? 6000');
        const settingsSource = readFileSync(new URL('../src/state/settings.js', import.meta.url), 'utf8');
        expect(settingsSource).toContain('mapArchitectMaxTokensFloored');
        expect(settingsSource).toContain('architectTokens < 25000');
        expect(defaults).not.toContain('mapArchitectMaxTokensFloored');
        expect(defaults).not.toContain('keywordOverflowMigratedTo6');
        expect(defaults).not.toContain('maxActiveKeysMigratedTo12');
    });

    it('registers a hidden narrator tool and a dedicated connection path', () => {
        const hooks = readFileSync(new URL('../narrative-hooks.js', import.meta.url), 'utf8');
        const architect = readFileSync(new URL('../map-architect.js', import.meta.url), 'utf8');
        const router = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
        expect(hooks).toContain('Copy the Location footer segment that names this mapped dungeon/settlement');
        expect(architect).toContain('mapSiteFooterMismatchHint');
        expect(architect).toContain('Live location footer:');
        expect(router).toContain('mapSiteFooterMismatchHint(site, currentLocation)');
        expect(hooks).toContain("unregisterFunctionTool('CreateDungeonMap')");
        expect(hooks).toContain("enum: ['LOW', 'MODERATE', 'HIGH', 'DEADLY']");
        expect(hooks).toContain("enum: ['DUNGEON', 'SETTLEMENT']");
        expect(hooks).toContain('Generating a location map for');
        expect(hooks).toContain('isMapArchitectTextOpener(settings)');
        expect(hooks).toContain('applyMapArchitectTextOpenerCyoaCaveat');
        expect(hooks).toContain("ctx.generate('continue')");
        expect(hooks).toContain('clearAssistantReasoning(message)');
        expect(hooks).toContain('seedMapArchitectContinueText');
        expect(hooks).toContain('buildMapArchitectContinueBrief');
        expect(hooks).toContain('!narrationContinue');
        expect(hooks).toContain('maybeRunMapArchitectTextOpener');
        expect(hooks).toContain('findCreateAreaMapCandidate');
        expect(hooks).toContain('export async function onMapArchitectAssistantMessage');
        expect(hooks).toContain("source: 'generation_ended'");
        expect(hooks).toContain('if (dryRun === true)');
        expect(hooks).toContain('cleanMessageContent(message)');
        expect(hooks).toContain("logMapArchitectTextOpener('running'");
        expect(hooks).toContain("['impersonate', 'quiet']");
        expect(hooks).not.toContain("['swipe', 'regenerate', 'impersonate', 'quiet']");
        const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        expect(index).toContain('onMapArchitectAssistantMessage');
        expect(hooks).toContain('export function syncLocationMappingRuntime()');
        expect(hooks).toContain('stopMapUpdaterPass()');
        expect(hooks).toContain('stopMapEvolutionPass()');
        expect(hooks).toContain('runtimeState.hasActiveDungeonMap = false');
        expect(architect).toContain('MAX_CORRECTION_ATTEMPTS = 2');
        expect(architect).toContain('persistArchitectDungeonMap');
        expect(architect).toContain('mapArchitectConnectionSource');
        expect(architect).not.toContain('mapRuntimeConnectionSource');
        expect(architect).toContain("{ jsonSchema: MAP_ARCHITECT_JSON_SCHEMA, stream: true, debugSource: 'Map Architect' }");
        expect(architect).toContain('CreateAreaMap');
        expect(architect).toContain('Threat: ${args.threat}');
        expect(architect).not.toContain('CreateDungeonMap');
        expect(architect).toContain('Location map ready for');
        expect(architect).toContain('Location map generation failed for');
    });

    it('defines the complete structured map response contract', () => {
        expect(MAP_ARCHITECT_JSON_SCHEMA.name).toBe('dungeon_map_v3');
        expect(MAP_ARCHITECT_JSON_SCHEMA.returnInvalid).toBe(true);
        expect(MAP_ARCHITECT_JSON_SCHEMA.value.required).toEqual(['version', 'site', 'areas', 'assets']);
        expect(MAP_ARCHITECT_JSON_SCHEMA.value.properties.areas.items.required).toContain('connections');
        expect(MAP_ARCHITECT_JSON_SCHEMA.value.properties.assets.items.required).toContain('origin');
        expect(MAP_ARCHITECT_JSON_SCHEMA.value.properties.kind.enum).toEqual(['DUNGEON', 'SETTLEMENT']);
        expect(MAP_ARCHITECT_JSON_SCHEMA.value.properties.threat.enum).toEqual(['LOW', 'MODERATE', 'HIGH', 'DEADLY']);
    });

    it('tells the architect to populate incidental objects instead of leaving them for later', () => {
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('Write every human-readable string in the same language and script');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('Do not translate, transliterate, expand, or retitle them');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('human-readable strings in the campaign language');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('Threat is a site fact, never matched to party level');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('Scale is size, not danger');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('"threat":"HIGH"');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).not.toContain('need not pre-invent');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('Occasional hub/nexus layouts are welcome');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('one area may have many routes');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('KIND: DUNGEON');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('KIND: SETTLEMENT');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('Areas are districts, gates, plazas');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('The narrator will invent those granular locations during play');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('"kind":"DUNGEON"');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('"kind":"SETTLEMENT"');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('a neutralized mechanism is DEACTIVATED');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('"origin":"INITIAL_MAP"');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('"state":"LOCKED"');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('Never make a chapel, inn, shop, or house its own settlement area');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('Never use kind NPC');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('ONE GROUP asset with optional integer count');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('"count":6');
        expect(DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).toContain('Never split a pack into many identical CREATURE assets');
        expect(MAP_ARCHITECT_JSON_SCHEMA.value.properties.assets.items.properties.count).toMatchObject({
            type: 'integer', minimum: 1, maximum: 99,
        });
    });
});
