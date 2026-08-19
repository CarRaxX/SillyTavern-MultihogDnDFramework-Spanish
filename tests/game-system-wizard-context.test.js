import { describe, expect, it, vi } from 'vitest';
import {
    buildGameSystemWizardLoreContext,
    buildGameSystemWizardModuleExamplesContext,
    buildGameSystemWizardStoryContext,
    listGameSystemWizardModuleExampleOptions,
    normalizeGameSystemWizardContextPrefs,
    normalizeGameSystemWizardModuleExampleKeys,
} from '../src/features/game-system-wizard-context.js';

const chat = [
    { is_user: true, name: 'Player', mes: 'We discovered a cursed winter.' },
    { is_user: false, name: 'GM', mes: 'The cold worsens every hour.' },
    { is_system: true, mes: 'Hidden system message' },
    { is_user: true, name: 'Player', mes: 'I light a fire.' },
];

const baseSettings = {
    modules: {},
    stockPrompts: { character: 'CHARACTER prompt text' },
    customFields: [{ enabled: true, tag: 'hunger', label: 'Hunger', prompt: 'Track hunger', template: '[HUNGER]' }],
    customSyspromptLibrary: [{
        id: 'lib-1',
        enabled: true,
        tag: 'radiation',
        description: 'Radiation rules',
        content: '<radiation>Stay out of the glow.</radiation>',
    }],
};

describe('Game System Wizard context controls', () => {
    it('includes only the requested number of ordinary chat messages', () => {
        const context = buildGameSystemWizardStoryContext(chat, {
            gameSystemWizardLookback: 2,
            gameSystemWizardLookbackAll: false,
        });

        expect(context).not.toContain('cursed winter');
        expect(context).toContain('The cold worsens every hour.');
        expect(context).toContain('I light a fire.');
        expect(context).not.toContain('Hidden system message');
    });

    it('supports entire-chat lookback and a zero-message opt-out', () => {
        expect(buildGameSystemWizardStoryContext(chat, {
            gameSystemWizardLookback: 0,
            gameSystemWizardLookbackAll: false,
        })).toBe('');
        expect(buildGameSystemWizardStoryContext(chat, {
            gameSystemWizardLookback: 0,
            gameSystemWizardLookbackAll: true,
        })).toContain('We discovered a cursed winter.');
    });

    it('loads only active Lorebook Agent entries when lore injection is enabled', async () => {
        const loadWorldInfo = vi.fn(async () => ({
            entries: {
                7: { comment: '[Active] Frost Court', content: 'Winter spirits rule the valley.' },
            },
        }));
        const context = await buildGameSystemWizardLoreContext({
            gameSystemWizardInjectLore: true,
            activeRouterKeys: ['Campaign_NPCs::7'],
        }, { loadWorldInfo });

        expect(context).toContain('### Frost Court');
        expect(context).toContain('Winter spirits rule the valley.');
        expect(loadWorldInfo).toHaveBeenCalledWith('Campaign_NPCs');
        expect(await buildGameSystemWizardLoreContext({
            gameSystemWizardInjectLore: false,
            activeRouterKeys: ['Campaign_NPCs::7'],
        }, { loadWorldInfo })).toBe('');
    });

    it('normalizes all persisted context preferences', () => {
        expect(normalizeGameSystemWizardContextPrefs({
            ...baseSettings,
            gameSystemWizardLookback: 999,
            gameSystemWizardLookbackAll: true,
            gameSystemWizardInjectLore: true,
            gameSystemWizardInjectMemo: true,
            gameSystemWizardInjectModulePrompts: true,
            gameSystemWizardModuleExampleKeys: ['stock:CHARACTER', 'field:HUNGER', 'sysprompt:lib-1', 'bogus'],
        })).toEqual({
            lookback: 200,
            lookbackAll: true,
            injectLore: true,
            injectMemo: true,
            injectModulePrompts: true,
            moduleExampleKeys: ['stock:CHARACTER', 'field:HUNGER', 'sysprompt:lib-1'],
        });
    });

    it('lists injectable module example options from enabled modules only', () => {
        const options = listGameSystemWizardModuleExampleOptions(baseSettings);
        expect(options.some(option => option.key === 'stock:CHARACTER')).toBe(true);
        expect(options.some(option => option.key === 'field:HUNGER')).toBe(true);
        expect(options.some(option => option.key === 'sysprompt:lib-1')).toBe(true);
    });

    it('omits module prompts unless opted in and selected', () => {
        expect(buildGameSystemWizardModuleExamplesContext(baseSettings)).toBe('');
        expect(buildGameSystemWizardModuleExamplesContext({
            ...baseSettings,
            gameSystemWizardInjectModulePrompts: true,
            gameSystemWizardModuleExampleKeys: [],
        })).toBe('');
        const context = buildGameSystemWizardModuleExamplesContext({
            ...baseSettings,
            gameSystemWizardInjectModulePrompts: true,
            gameSystemWizardModuleExampleKeys: ['stock:CHARACTER'],
        });
        expect(context).toContain('FORMATTING EXAMPLES ONLY');
        expect(context).toContain('CHARACTER prompt text');
        expect(context).not.toContain('Track hunger');
    });

    it('filters stored module example keys to currently available options', () => {
        const allowed = listGameSystemWizardModuleExampleOptions(baseSettings).map(option => option.key);
        expect(normalizeGameSystemWizardModuleExampleKeys({
            gameSystemWizardModuleExampleKeys: ['stock:CHARACTER', 'field:MISSING'],
        }, allowed)).toEqual(['stock:CHARACTER']);
    });
});
