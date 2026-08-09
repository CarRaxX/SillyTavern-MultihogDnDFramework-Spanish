import { beforeEach, describe, expect, it } from 'vitest';
import {
    buildDefaultSettings,
    compactLorebookPromptTemplate,
    FACTORY_SETTINGS_VERSION,
    prepareShippedLorebookPromptTemplate,
} from '../src/state/defaults.js';
import { buildBundledPromptsSnapshot } from '../src/state/factory-and-diff.js';
import {
    expandLorebookPromptTemplate,
    resetLorebookPromptTemplates,
} from '../src/state/lorebook-prompt-templates.js';
import { getSettings } from '../src/state/settings.js';
import { MODULE_NAME } from '../src/state/schema-sections.js';
import { testExtensionSettings } from './setup.js';

describe('Lorebook prompt templates', () => {
    beforeEach(() => {
        for (const key of Object.keys(testExtensionSettings)) {
            delete testExtensionSettings[key];
        }
    });

    it('removes empty spacer lines from every shipped Lorebook prompt', () => {
        const defaults = buildDefaultSettings();
        const prompts = [
            defaults.routerBasicSystemPromptTemplate,
            defaults.routerSystemPromptTemplate,
            defaults.routerModularPromptTemplate,
            defaults.routerAgentSharedContextTemplate,
        ];

        for (const prompt of prompts) {
            expect(prompt).not.toMatch(/\n[ \t]*\n/);
            expect(prompt).toBe(compactLorebookPromptTemplate(prompt));
            expect(prompt).toBe(prepareShippedLorebookPromptTemplate(prompt));
        }
        expect(defaults.routerSystemPromptTemplate).toContain('[Day N, HH:MM AM/PM]');
    });

    it('keeps user prompt and module edits intact during normal settings reads', () => {
        const custom = {
            settingsVersion: FACTORY_SETTINGS_VERSION,
            routerBasicSystemPromptTemplate: 'custom basic',
            routerSystemPromptTemplate: 'custom agent base',
            routerModularPromptTemplate: 'custom modular',
            routerAgentSharedContextTemplate: 'custom shared context',
            routerModules: {
                npc: { enabled: true, tag: 'NPC', format: 'custom format', instruction: 'custom NPC instruction' },
            },
        };
        testExtensionSettings[MODULE_NAME] = custom;

        const settings = getSettings();

        expect(settings.routerBasicSystemPromptTemplate).toBe('custom basic');
        expect(settings.routerSystemPromptTemplate).toBe('custom agent base');
        expect(settings.routerModularPromptTemplate).toBe('custom modular');
        expect(settings.routerAgentSharedContextTemplate).toBe('custom shared context');
        expect(settings.routerModules.npc.instruction).toBe('custom NPC instruction');
        expect(settings.routerModules.npc.format).toBe('custom format');
    });

    it('resets both Basic Mode sources without overwriting Agent Mode', () => {
        const defaults = buildDefaultSettings();
        const settings = {
            routerBasicSystemPromptTemplate: 'custom basic',
            routerSystemPromptTemplate: 'custom agent base',
            routerModularPromptTemplate: 'custom modular',
            routerAgentSharedContextTemplate: 'custom shared context',
        };

        resetLorebookPromptTemplates(settings, 'basic', defaults);

        expect(settings.routerBasicSystemPromptTemplate).toBe(defaults.routerBasicSystemPromptTemplate);
        expect(settings.routerSystemPromptTemplate).toBe('custom agent base');
        expect(settings.routerModularPromptTemplate).toBe(defaults.routerModularPromptTemplate);
        expect(settings.routerAgentSharedContextTemplate).toBe('custom shared context');
    });

    it('resets both Agent Mode editors without writing into the Basic Mode field', () => {
        const defaults = buildDefaultSettings();
        const settings = {
            routerBasicSystemPromptTemplate: 'custom basic',
            routerSystemPromptTemplate: 'custom agent base',
            routerModularPromptTemplate: 'custom modular',
            routerAgentSharedContextTemplate: 'custom shared context',
        };

        resetLorebookPromptTemplates(settings, 'agent', defaults);

        expect(settings.routerBasicSystemPromptTemplate).toBe('custom basic');
        expect(settings.routerSystemPromptTemplate).toBe(defaults.routerSystemPromptTemplate);
        expect(settings.routerModularPromptTemplate).toBe('custom modular');
        expect(settings.routerAgentSharedContextTemplate).toBe(defaults.routerAgentSharedContextTemplate);
    });

    it('resets all four templates only when the prompt-update flow selects Lorebook Agent', () => {
        const defaults = buildDefaultSettings();
        const settings = {
            routerBasicSystemPromptTemplate: 'custom basic',
            routerSystemPromptTemplate: 'custom agent base',
            routerModularPromptTemplate: 'custom modular',
            routerAgentSharedContextTemplate: 'custom shared context',
            unrelatedSetting: 'keep me',
        };

        resetLorebookPromptTemplates(settings, 'all', defaults);

        expect(settings.routerBasicSystemPromptTemplate).toBe(defaults.routerBasicSystemPromptTemplate);
        expect(settings.routerSystemPromptTemplate).toBe(defaults.routerSystemPromptTemplate);
        expect(settings.routerModularPromptTemplate).toBe(defaults.routerModularPromptTemplate);
        expect(settings.routerAgentSharedContextTemplate).toBe(defaults.routerAgentSharedContextTemplate);
        expect(settings.unrelatedSetting).toBe('keep me');
    });

    it('applies the exact Lorebook defaults acknowledged by the update dialog', () => {
        const settings = {
            routerBasicSystemPromptTemplate: 'old basic',
            routerSystemPromptTemplate: 'old agent base',
            routerModularPromptTemplate: 'old modular',
            routerAgentSharedContextTemplate: 'old shared context',
        };

        resetLorebookPromptTemplates(settings, 'all');
        const acknowledged = buildBundledPromptsSnapshot().lorebook;

        expect(settings.routerBasicSystemPromptTemplate).toBe(acknowledged.routerBasicSystemPromptTemplate);
        expect(settings.routerSystemPromptTemplate).toBe(acknowledged.routerSystemPromptTemplate);
        expect(settings.routerModularPromptTemplate).toBe(acknowledged.routerModularPromptTemplate);
        expect(settings.routerAgentSharedContextTemplate).toBe(acknowledged.routerAgentSharedContextTemplate);
    });

    it('expands request-time values without mutating stored text or consuming ST macros', () => {
        const stored = 'Limit {{maxActivations}} for {{user}}; keep {{futureToken}}.';
        const expanded = expandLorebookPromptTemplate(stored, { maxActivations: 12 });

        expect(expanded).toBe('Limit 12 for {{user}}; keep {{futureToken}}.');
        expect(stored).toBe('Limit {{maxActivations}} for {{user}}; keep {{futureToken}}.');
    });

    it('keeps runtime-dependent instructions as placeholders in shipped defaults', () => {
        const defaults = buildDefaultSettings();

        expect(defaults.routerBasicSystemPromptTemplate).toContain('{{modularPrompt}}');
        expect(defaults.routerModularPromptTemplate).toContain('{{formatLines}}');
        expect(defaults.routerBasicSystemPromptTemplate).toContain('{{maxActivations}}');
        expect(defaults.routerBasicSystemPromptTemplate).toContain('{{eligibleCoreFields}}');
        expect(defaults.routerBasicSystemPromptTemplate).toContain('{{autoPassRestriction}}');
        expect(defaults.routerBasicSystemPromptTemplate).toContain('{{combatProfileGuidance}}');
        expect(defaults.routerAgentSharedContextTemplate).toContain('{{fieldInstructions}}');
        expect(defaults.routerAgentSharedContextTemplate).toContain('{{campaignRoot}}');
        expect(defaults.routerAgentSharedContextTemplate).toContain('{{relSection}}');
    });

    it('composes all Basic and Agent runtime fields while leaving only SillyTavern macros', () => {
        const defaults = buildDefaultSettings();
        const formatLines = '- [[NPC: Name | Description | Keywords]]\n- [[CLUE: Name | Details | Keywords]]';
        const modularPrompt = expandLorebookPromptTemplate(defaults.routerModularPromptTemplate, { formatLines });
        const common = {
            maxActivations: 11,
            relSection: '## NPC RELATIONSHIPS\nRelationship rules.',
            eligibleCoreFields: 'Personality, Combat Profile',
            autoPassRestriction: ' Automatic-pass restriction.',
            existingNpcNudge: ' Existing-NPC chronicle rule.',
            combatProfileGuidance: 'Combat-profile rules.',
        };
        const basic = expandLorebookPromptTemplate(defaults.routerBasicSystemPromptTemplate, {
            ...common,
            modularPrompt,
            sectionNames: 'Species, Body, Personality',
            example: 'Example output.',
        });
        const agent = expandLorebookPromptTemplate(defaults.routerAgentSharedContextTemplate, {
            ...common,
            campaignRoot: 'Shadowfell',
            campaignNpcBook: 'Shadowfell_NPCs',
            campaignLocBook: 'Shadowfell_Locations',
            fieldInstructions: '- NPC: dynamic instruction\n- CLUE: custom instruction',
        });

        expect(basic).toContain('[[CLUE: Name | Details | Keywords]]');
        expect(basic).toContain('You are limited to **11 active entries**');
        expect(agent).toContain('Campaign Root: "Shadowfell"');
        expect(agent).toContain('- CLUE: custom instruction');
        for (const prompt of [basic, agent]) {
            expect(prompt).not.toMatch(/\n[ \t]*\n/);
            expect(prompt.match(/\{\{(?!user\b|char\b)[a-zA-Z0-9_]+\}\}/g)).toBeNull();
        }
    });
});
