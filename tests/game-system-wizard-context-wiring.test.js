import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../game-systems.js', import.meta.url), 'utf8');

describe('Game System Wizard context wiring', () => {
    it('offers chat, Lorebook Agent, State Tracker, and module example context controls', () => {
        expect(source).toContain('id="rt_gs_wizard_lookback"');
        expect(source).toContain('id="rt_gs_wizard_lookback_all"');
        expect(source).toContain('id="rt_gs_wizard_inject_lore"');
        expect(source).toContain('id="rt_gs_wizard_inject_memo"');
        expect(source).toContain("idPrefix: 'rt_gs_wizard'");
        expect(source).toContain('id="rt_gs_preview_lookback"');
        expect(source).toContain('id="rt_gs_preview_inject_lore"');
        expect(source).toContain('id="rt_gs_preview_inject_memo"');
        expect(source).toContain("idPrefix: 'rt_gs_preview'");
        expect(source).toContain('renderGameSystemWizardModuleExamplePickerHtml');
        expect(source).toContain('data-module-example-key');
    });

    it('injects selected context into every mechanic-generation path', () => {
        expect(source.match(/await buildWizardMechanicUserPrompt\(settings,/g)).toHaveLength(5);
        expect(source).toContain('buildGameSystemWizardModuleExamplesContext');
        expect(source).toContain('ACTIVE LOREBOOK AGENT CONTEXT');
        expect(source).toContain('CURRENT STATE TRACKER MEMO');
        expect(source).not.toContain('buildExistingTagsContext');
    });
});
