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
        expect(markup).toContain('<b>Map Updater</b>');
        expect(markup).toContain('Visuals/Map');
        expect(markup).not.toContain('>Visualization Mode<');
    });
});
