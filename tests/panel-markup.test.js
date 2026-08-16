import { describe, expect, it } from 'vitest';
import { buildPanelMarkup } from '../src/ui/panel/panel-markup.js';

describe('panel markup', () => {
    it('includes the tracker and Agent roots with supplied setting values', () => {
        const markup = buildPanelMarkup({
            agentPanelCollapsedClass: 'rt-panel-collapsed ',
            settings: {
                enabled: true,
                currentMemo: 'Saved memo',
                lastDelta: '',
                trackerTheme: 'rt-theme-native',
            },
        });

        expect(markup).toContain('id="rpg-tracker-memo"');
        expect(markup).toContain('Saved memo');
        expect(markup).toContain('id="rpg-tracker-agent"');
        expect(markup).toContain('rt-panel-collapsed');
        expect(markup).toContain('id="rpg-tracker-settings-btn"');
        expect(markup.indexOf('rpg-tracker-settings-btn')).toBeLessThan(markup.indexOf('rpg-tracker-help-btn'));
        expect(markup).toContain('id="rt-agent-router-manual-run"');
        expect(markup).toContain('id="rt-research-lorebook"');
        expect(markup).toContain('id="rt-research-map-updater"');
        expect(markup).toContain('id="rt-research-map-evolution"');
        expect(markup).toContain('<b>Map Updater</b>');
        expect(markup).toContain('<b>Map Evolution</b>');
        expect(markup).toContain('id="rt-agent-map-evo-header"');
        expect(markup).toContain('id="rt-agent-map-evo-testing-ground"');
        expect(markup).toContain('id="rt-agent-map-evo-drawer"');
        expect(markup).toContain('id="rt-agent-map-evo-tick-scope"');
        expect(markup).toContain('id="rt-agent-world-locations"');
        expect(markup.indexOf('rt-agent-map-evo-header')).toBeLessThan(markup.indexOf('rt-agent-world-header'));
        expect(markup).toContain('Visuals/Map');
        expect(markup).not.toContain('>Visualization Mode<');
    });

    it('renders Map Evolution and World Progression agent controls from settings', () => {
        const markup = buildPanelMarkup({
            agentPanelCollapsedClass: '',
            settings: {
                enabled: true,
                currentMemo: '',
                lastDelta: '',
                agentMapEvolutionOpen: true,
                mapEvolutionEnabled: true,
                mapEvolutionIntervalHours: 6,
                mapEvolutionTickScope: 'count',
                mapEvolutionTickCount: 2,
                mapEvolutionTickRandomize: false,
                agentWorldOpen: true,
                worldProgressionEnabled: true,
                worldProgressionIntervalHours: 12,
                worldProgressionLocationsPerReport: 5,
            },
        });

        expect(markup).toContain('id="rt-agent-map-evo-interval" value="6"');
        expect(markup).toContain('id="rt-agent-map-evo-tick-count" value="2"');
        expect(markup).toContain('option value="count" selected');
        expect(markup).toContain('id="rt-agent-map-evo-n-row" style="display:flex;');
        expect(markup).toContain('id="rt-agent-world-locations" value="5"');
        expect(markup).toContain('id="rt-agent-world-interval" value="12"');
    });
});
