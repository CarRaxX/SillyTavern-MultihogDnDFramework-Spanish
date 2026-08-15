import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT } from '../map-evolution-prompt.js';
import { DEFAULT_MAP_UPDATER_SYSTEM_PROMPT } from '../map-updater-prompt.js';
import {
    filterSitesByRoots,
    pickSitesForEvolutionTick,
    resolvePlayerBubble,
    siteEvolutionDue,
    stampEvolutionLastFired,
    summarizeEvolutionDigest,
    summarizeMapEvolutionSchedule,
} from '../map-evolution-lib.js';

const tomb = {
    siteRoot: 'Forgotten Tomb',
    document: {
        site: 'Forgotten Tomb',
        kind: 'DUNGEON',
        areas: [{ id: 'threshold', name: 'Threshold', knowledge: 'VISITED' }],
        assets: [
            { id: 'odran', name: 'Odran', kind: 'CREATURE', state: 'ACTIVE', faction: 'Keepers of the Drowned Stone' },
            { id: 'ash-wight', name: 'Ash Wight', kind: 'CREATURE', state: 'DESTROYED' },
        ],
    },
};
const hall = {
    siteRoot: 'Hall of the Ember-Ancestors',
    document: {
        site: 'Hall of the Ember-Ancestors',
        kind: 'DUNGEON',
        areas: [{ id: 'nave', name: 'Nave', knowledge: 'UNREVEALED' }],
        assets: [],
    },
};
const docks = {
    siteRoot: 'Morrowfen',
    document: {
        site: 'Morrowfen',
        kind: 'SETTLEMENT',
        areas: [{ id: 'docks', name: 'Docks', knowledge: 'VISITED' }],
        assets: [{ id: 'harbor-watch', name: 'Harbor Watch', kind: 'GROUP', state: 'ACTIVE', faction: 'Morrowfen Watch' }],
    },
};

describe('Map Evolution', () => {
    it('ships a dedicated prompt that occupancy never sees', () => {
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('You are Map Evolution');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('evidence "EVOLVED"');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('PLAYER BUBBLE');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('Do not ADD_AREA');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('Local change is the default');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('not a permission gate');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('directional prose, not explicit map deltas');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('report_outcomes');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('already_realized_by_play');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('logical and narrative sense');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('neither is preferred');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('or larger unrest');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).not.toMatch(/SETTLEMENT: restlessness/);
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).not.toContain('not chaos by default');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).not.toContain('Do not invent raids');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).not.toContain('own factions');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).not.toContain('WP is primary');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('"op":"MOVE_ASSET"');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('Never write MOVE_ASSET with "location"');
        expect(DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).toContain('MOVE_ASSET uses to (required)');
        expect(DEFAULT_MAP_UPDATER_SYSTEM_PROMPT).not.toContain('Map Evolution');
        expect(DEFAULT_MAP_UPDATER_SYSTEM_PROMPT).not.toContain('EVOLVED');
        expect(DEFAULT_MAP_UPDATER_SYSTEM_PROMPT).not.toContain('World Report');
    });

    it('summarizes a sequential digest without dumping operations JSON', () => {
        const line = summarizeEvolutionDigest('Forgotten Tomb', {
            operations: [
                { op: 'SET_ASSET', asset_id: 'odran', state: 'FLEEING' },
                { op: 'REMOVE_ASSET', asset_id: 'odran' },
            ],
        });
        expect(line).toContain('Forgotten Tomb:');
        expect(line).toContain('odran FLEEING');
        expect(line).toContain('odran left the site');
        expect(line).not.toContain('"op"');
    });

    it('freezes the current area as the player bubble', () => {
        const bubble = resolvePlayerBubble({
            site: 'Forgotten Tomb',
            areas: [
                { id: 'threshold', name: 'Threshold' },
                { id: 'ossuary', name: 'Ossuary' },
            ],
            assets: [],
        }, 'Forgotten Tomb, Threshold', { combatActive: true });
        expect(bubble.frozenAreaIds).toEqual(['threshold']);
        expect(bubble.combatActive).toBe(true);
        expect(bubble.area.id).toBe('threshold');
    });

    it('stamps a first-visit baseline and later fires on elapsed in-world hours', () => {
        expect(siteEvolutionDue(null, 8 * 60, 4)).toEqual({ due: false, baseline: true });
        expect(siteEvolutionDue(8 * 60, 8 * 60 + 3 * 60, 4)).toEqual({ due: false, baseline: false });
        expect(siteEvolutionDue(8 * 60, 8 * 60 + 4 * 60, 4)).toEqual({ due: true, baseline: false });
    });

    it('summarizes last/next Evolution times like World Progression', () => {
        expect(summarizeMapEvolutionSchedule({}, { intervalHours: 4, currentMinutes: 8 * 60 })).toEqual({
            lastMins: -1,
            nextMins: 12 * 60,
        });
        expect(summarizeMapEvolutionSchedule({
            hall: 'Day 1, 08:00',
            docks: 'Day 1, 12:00',
        }, { intervalHours: 4, currentMinutes: 16 * 60 })).toEqual({
            lastMins: 12 * 60,
            nextMins: 12 * 60,
        });
        const stamped = stampEvolutionLastFired({}, ['Hall of the Ember-Ancestors', 'Morrowfen'], 'Day 2, 04:00');
        expect(stamped['hall of the ember ancestors']).toBe('Day 2, 04:00');
        expect(stamped.morrowfen).toBe('Day 2, 04:00');
        expect(Object.keys(stamped)).toHaveLength(2);
    });

    it('filters mapped sites by selected roots', () => {
        expect(filterSitesByRoots([tomb, hall, docks], ['Morrowfen']).map(site => site.siteRoot)).toEqual(['Morrowfen']);
        expect(filterSitesByRoots([tomb, hall], [])).toEqual([]);
    });

    it('picks the active site only for the active tick scope', () => {
        const lastFiredMinutesFor = () => 0;
        const picked = pickSitesForEvolutionTick([tomb, hall, docks], {
            scope: 'active',
            currentRoot: 'Forgotten Tomb',
            lastFiredMinutesFor,
            currentMinutes: 8 * 60,
            intervalHours: 4,
        });
        expect(picked.due.map(site => site.siteRoot)).toEqual(['Forgotten Tomb']);
        expect(picked.baseline).toEqual([]);
    });

    it('takes N due maps, or all due when count is 0, without spending slots on baselines', () => {
        const lastFiredMinutesFor = root => ({
            'Forgotten Tomb': -1,
            'Hall of the Ember-Ancestors': 0,
            Morrowfen: 60,
        }[root]);
        const counted = pickSitesForEvolutionTick([tomb, hall, docks], {
            scope: 'count',
            count: 1,
            randomize: false,
            lastFiredMinutesFor,
            currentMinutes: 8 * 60,
            intervalHours: 4,
        });
        expect(counted.baseline.map(site => site.siteRoot)).toEqual(['Forgotten Tomb']);
        expect(counted.due.map(site => site.siteRoot)).toEqual(['Hall of the Ember-Ancestors']);

        const allDue = pickSitesForEvolutionTick([tomb, hall, docks], {
            scope: 'count',
            count: 0,
            randomize: false,
            lastFiredMinutesFor,
            currentMinutes: 8 * 60,
            intervalHours: 4,
        });
        expect(allDue.due.map(site => site.siteRoot)).toEqual(['Hall of the Ember-Ancestors', 'Morrowfen']);
    });

    it('randomizes due maps when asked, otherwise oldest-due first', () => {
        const lastFiredMinutesFor = root => ({
            'Forgotten Tomb': 120,
            'Hall of the Ember-Ancestors': 0,
            Morrowfen: 60,
        }[root]);
        const oldest = pickSitesForEvolutionTick([tomb, hall, docks], {
            scope: 'count',
            count: 2,
            randomize: false,
            lastFiredMinutesFor,
            currentMinutes: 8 * 60,
            intervalHours: 4,
        });
        expect(oldest.due.map(site => site.siteRoot)).toEqual(['Hall of the Ember-Ancestors', 'Morrowfen']);

        const randomized = pickSitesForEvolutionTick([tomb, hall, docks], {
            scope: 'count',
            count: 1,
            randomize: true,
            lastFiredMinutesFor,
            currentMinutes: 8 * 60,
            intervalHours: 4,
            random: () => 0,
        });
        expect(randomized.due).toHaveLength(1);
        expect(['Forgotten Tomb', 'Hall of the Ember-Ancestors', 'Morrowfen']).toContain(randomized.due[0].siteRoot);
    });

    it('evolves only the selected checklist, and nothing when the checklist is empty', () => {
        const lastFiredMinutesFor = () => 0;
        const selected = pickSitesForEvolutionTick([tomb, hall, docks], {
            scope: 'selected',
            count: 0,
            selectedRoots: ['Morrowfen'],
            lastFiredMinutesFor,
            currentMinutes: 8 * 60,
            intervalHours: 4,
        });
        expect(selected.due.map(site => site.siteRoot)).toEqual(['Morrowfen']);

        const empty = pickSitesForEvolutionTick([tomb, hall, docks], {
            scope: 'selected',
            selectedRoots: [],
            lastFiredMinutesFor,
            currentMinutes: 8 * 60,
            intervalHours: 4,
        });
        expect(empty.pool).toEqual([]);
        expect(empty.due).toEqual([]);
        expect(empty.baseline).toEqual([]);
    });

    it('keeps Evolution sequential, occupancy-separate, and wired through the pipeline', () => {
        const evolution = readFileSync(new URL('../map-evolution.js', import.meta.url), 'utf8');
        const updater = readFileSync(new URL('../map-updater.js', import.meta.url), 'utf8');
        const hooks = readFileSync(new URL('../narrative-hooks.js', import.meta.url), 'utf8');
        const settingsMarkup = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
        const panelMarkup = readFileSync(new URL('../src/ui/panel/panel-markup.js', import.meta.url), 'utf8');
        const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

        expect(evolution).not.toContain("trigger === 'world_progression'");
        expect(evolution).toContain('restock and new occupants are expected');
        expect(evolution).toContain('directional prose, not explicit deltas');
        expect(evolution).toContain('pendingWorldReportsForSite');
        expect(evolution).toContain('mapEvolutionWorldReportApplications');
        expect(evolution).toContain('delete transaction.report_outcomes');
        expect(evolution).toContain('siteRoots');
        expect(evolution).toContain('listMappedEvolutionSites');
        expect(evolution).toContain("scope === 'active'");
        expect(evolution).toContain('for (const site of [...baselineOnly, ...toEvolve])');
        expect(evolution).toContain('Field reminder: MOVE_ASSET uses "to"');
        expect(evolution).not.toContain('groundMapsAfterWorldProgression');
        expect(evolution).toContain('export async function maybeRunMapEvolution');
        expect(evolution).toContain("from './map-evolution-lib.js'");
        expect(evolution).not.toContain("from './map-updater.js'");

        expect(updater).toContain('isMapEvolutionRunning()');
        expect(updater).not.toContain('EVOLVED');
        expect(updater).not.toContain('groundMapsAfterWorldProgression');

        expect(hooks).toContain('await runMapUpdaterPass()');
        expect(hooks.indexOf('await runMapUpdaterPass()')).toBeLessThan(hooks.indexOf('await maybeRunWorldProgression()'));
        expect(hooks.indexOf('await maybeRunWorldProgression()')).toBeLessThan(hooks.indexOf('await maybeRunMapEvolution()'));
        expect(hooks).not.toContain('groundMapsAfterWorldProgression');
        expect(hooks).toContain('maybeRollbackMapEvolutionForSwipe');
        expect(hooks).toContain('stopMapEvolutionPass()');

        expect(settingsMarkup).toContain('<b>Map Evolution</b>');
        expect(settingsMarkup).toContain('id="rpg_map_evolution_enabled"');
        expect(settingsMarkup).toContain('id="rpg_map_evolution_interval_hours"');
        expect(settingsMarkup).toContain('id="rpg_map_evolution_world_report_lookback"');
        expect(settingsMarkup).toContain('Reports never trigger an immediate map fan-out');
        expect(settingsMarkup).toContain('id="rpg_map_evolution_tick_scope"');
        expect(settingsMarkup).toContain('id="rpg_map_evolution_tick_count"');
        expect(settingsMarkup).toContain('id="rpg_map_evolution_tick_randomize"');
        expect(settingsMarkup).toContain('id="rpg_map_evolution_selected_list"');
        expect(settingsMarkup).toContain('id="rpg_map_evolution_evolve_now"');
        expect(settingsMarkup).toContain('id="rpg_map_evolution_last_fired"');
        expect(settingsMarkup).toContain('id="rpg_map_evolution_next_report_val"');
        expect(settingsMarkup).toContain('id="rpg_map_evolution_btn_override_next"');
        expect(settingsMarkup).toContain('id="rpg_map_evolution_reset_timeline"');
        expect(settingsMarkup).toContain('<b style="font-size:0.9em; flex:1;">Run now</b>');
        expect(settingsMarkup).toContain('does not require Selected maps');
        expect(indexSource).not.toContain("$('#rpg_map_evolution_selected_row').toggle(scope === 'selected')");
        expect(indexSource).toContain("$('#rpg_map_evolution_interval_selected_hint').toggle(scope === 'selected')");
        expect(settingsMarkup).toMatch(/id="rpg_map_evolution_max_tokens"[^>]*max="32000"/);
        expect(evolution).toContain('Number(settings.mapEvolutionMaxTokens) || 25000');
        expect(evolution).toContain('mapRuntimeConnectionSource');
        expect(evolution).not.toContain('mapArchitectConnectionSource');
        expect(panelMarkup).toContain('id="rt-research-map-evolution"');
        expect(indexSource).toContain('rpg_map_evolution_evolve_now');
        expect(indexSource).toContain('listMappedEvolutionSites');
        expect(indexSource).toContain('mapEvolutionTickScope');
    });
});
