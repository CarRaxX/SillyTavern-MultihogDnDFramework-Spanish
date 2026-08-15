import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    buildWorldProgressionLocationDossiers,
    extractWorldReportForLocation,
    normalizeWorldReportMetadata,
    selectPendingWorldReportsForLocation,
    selectWorldProgressionLocations,
    stampLocationAdvancement,
    WORLD_REPORT_METADATA_KEY,
} from '../world-progression-lib.js';
import { DEFAULT_WORLD_PROGRESSION_SYSTEM_PROMPT } from '../world-progression-prompt.js';

const books = {
    Campaign_LOC: {
        entries: {
            1: {
                comment: 'Morrowfen',
                key: ['morrowfen'],
                content: `A tidal trade town governed by competing ward councils.
[MAP]
{"version":3,"site":"Morrowfen","assets":[{"id":"harbor-watch"}]}
[/MAP]`,
            },
            2: {
                comment: 'Morrowfen :: Docks',
                key: ['docks'],
                content: 'Warehouses and fish markets line the flood-prone quay.',
            },
            3: {
                comment: 'Glassmere',
                key: ['glassmere'],
                content: 'A lake settlement supported by reed farms.',
            },
        },
    },
    Campaign_NPC: {
        entries: {
            1: { comment: 'Captain Ilyra', key: ['ilyra'], content: 'Commands the Morrowfen harbor watch from the Docks.' },
            2: { comment: 'Remote Hermit', key: ['hermit'], content: 'Lives alone beyond the northern glaciers.' },
        },
    },
    Campaign_FAC: {
        entries: {
            1: { comment: 'Salt Compact', key: ['salt compact'], content: 'Controls Morrowfen shipping contracts.' },
            2: { comment: 'Sun Court', key: ['sun court'], content: 'A regional power contesting trade routes.' },
        },
    },
    Campaign_Skeleton: {
        entries: {
            1: { comment: 'Morrowfen', content: 'An obsolete Day 0 seed.', extensions: { rpgCategory: 'LOC' } },
            2: { comment: 'Old Barrow', content: 'An isolated burial hill.', extensions: { rpgCategory: 'LOC' } },
            3: { comment: 'Captain Ilyra', content: 'An obsolete NPC seed in Morrowfen.', extensions: { rpgCategory: 'NPC' } },
        },
    },
    Campaign_World: {
        entries: {
            1: { comment: 'Day 1', content: 'Historical report.' },
        },
    },
};

describe('location-centric World Progression', () => {
    it('builds complete location dossiers while stripping maps and treating entities as constraints', () => {
        const result = buildWorldProgressionLocationDossiers(books, { prefix: 'Campaign' });
        const morrowfen = result.dossiers.find(dossier => dossier.name === 'Morrowfen');

        expect(morrowfen.text).toContain('Morrowfen :: Docks');
        expect(morrowfen.text).toContain('Captain Ilyra');
        expect(morrowfen.text).toContain('READ-ONLY CONSTRAINTS');
        expect(morrowfen.text).not.toContain('[MAP]');
        expect(morrowfen.text).not.toContain('harbor-watch');
        expect(morrowfen.text).not.toContain('obsolete Day 0 seed');
        expect(morrowfen.text).not.toContain('obsolete NPC seed');
        expect(morrowfen.hasNarrativeLore).toBe(true);
        expect(result.dossiers.some(dossier => dossier.name === 'Old Barrow')).toBe(true);
        expect(result.globalContext).toContain('Sun Court');
        expect(result.globalContext).not.toContain('Remote Hermit');
    });

    it('rotates oldest-unadvanced locations first and only randomizes equal cohorts', () => {
        const dossiers = buildWorldProgressionLocationDossiers(books, { prefix: 'Campaign' }).dossiers;
        const selected = selectWorldProgressionLocations(dossiers, {
            count: 2,
            lastAdvanced: { morrowfen: 'Day 3, 08:00', glassmere: 'Day 2, 08:00' },
            randomize: false,
        });
        expect(selected.map(dossier => dossier.name)).toEqual(['Old Barrow', 'Glassmere']);

        const stamped = stampLocationAdvancement({}, ['Morrowfen', 'Old Barrow'], 'Day 4, 08:00');
        expect(stamped).toEqual({ morrowfen: 'Day 4, 08:00', 'old barrow': 'Day 4, 08:00' });
    });

    it('routes prose by location section plus wider currents, never by entity mentions', () => {
        const report = `## Morrowfen
Dock labor slows as food prices rise and ward councils lose legitimacy.

## Glassmere
Reed harvests recover after the floodwater recedes.

## Wider Currents
A colder trade wind reverses the prior season's migration pattern.`;
        const excerpt = extractWorldReportForLocation(report, 'Morrowfen', ['Morrowfen', 'Glassmere']);
        expect(excerpt).toContain('Dock labor slows');
        expect(excerpt).toContain('colder trade wind');
        expect(excerpt).not.toContain('Reed harvests recover');

        expect(extractWorldReportForLocation('Captain Ilyra travels north.', 'Morrowfen', [])).toBe('');
    });

    it('keeps older targeted location pressure visible without replaying applied reports', () => {
        const reports = [
            {
                reportId: 'World::1',
                selectedLocations: ['Morrowfen'],
                content: '## Morrowfen\nA dock strike begins.\n\n## Wider Currents\nCredit tightens.',
            },
            ...[2, 3, 4, 5, 6].map(index => ({
                reportId: `World::${index}`,
                selectedLocations: ['Glassmere'],
                content: `## Glassmere\nReeds change ${index}.\n\n## Wider Currents\nCurrent ${index}.`,
            })),
        ];
        const pending = selectPendingWorldReportsForLocation(reports, 'Morrowfen', {
            lookback: 2,
            applied: { 'World::5': { status: 'considered' } },
        });
        expect(pending.map(report => report.reportId)).toEqual(['World::1', 'World::6']);
        expect(pending[0].excerpt).toContain('dock strike begins');
        expect(pending[1].excerpt).toContain('Current 6');
    });

    it('keeps report semantics as prose while storing only identity and routing metadata', () => {
        const entry = {
            comment: 'Day 4, 08:00',
            extensions: {
                [WORLD_REPORT_METADATA_KEY]: {
                    reportId: 'Campaign_World::12',
                    periodLabel: 'Day 4, 08:00',
                    selectedLocations: ['Morrowfen'],
                },
            },
        };
        expect(normalizeWorldReportMetadata(entry, 'Campaign_World', '12')).toEqual({
            reportId: 'Campaign_World::12',
            periodLabel: 'Day 4, 08:00',
            selectedLocations: ['Morrowfen'],
        });
        expect(DEFAULT_WORLD_PROGRESSION_SYSTEM_PROMPT).toContain('directional macro pressures');
        expect(DEFAULT_WORLD_PROGRESSION_SYSTEM_PROMPT).toContain('reverse abruptly');
        expect(DEFAULT_WORLD_PROGRESSION_SYSTEM_PROMPT).toContain('not JSON');
    });

    it('removes eager fan-out and entity pools from runtime wiring', () => {
        const router = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
        const hooks = readFileSync(new URL('../narrative-hooks.js', import.meta.url), 'utf8');
        expect(router).toContain('buildWorldProgressionLocationDossiers');
        expect(router).toContain('LOCATION-CENTRIC RUNTIME CONTRACT');
        expect(router).not.toContain('DESIGNATED ENTITIES FOR THIS PERIOD');
        expect(router).not.toContain('skeletonNpcNames');
        expect(hooks).not.toContain('groundMapsAfterWorldProgression');
    });
});
