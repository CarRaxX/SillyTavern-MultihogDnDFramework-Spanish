import { describe, expect, it, beforeEach } from 'vitest';
import { getSettings, saveChatState, snapshotStockPromptsForProfile } from '../state-manager.js';
import { testExtensionSettings } from './setup.js';

describe('saveChatState', () => {
    beforeEach(() => {
        for (const key of Object.keys(testExtensionSettings)) {
            delete testExtensionSettings[key];
        }
    });

    it('snapshots stock prompts via snapshotStockPromptsForProfile without throwing', () => {
        const s = getSettings();
        s.chatLinkEnabled = true;
        s.currentMemo = 'test-memo';
        s.combatDefeatedUi = [{ name: 'Bandit', content: 'Bandit: 0/18 HP\nStatus: Defeated' }];
        s.modules = { character: true };
        s.stockPrompts = { character: 'custom prompt' };

        expect(() => saveChatState('vitest-chat', { skipDiskWrite: true })).not.toThrow();

        const part = getSettings().chatStates['vitest-chat'];
        expect(part.currentMemo).toBe('test-memo');
        expect(part.combatDefeatedUi).toEqual(s.combatDefeatedUi);
        expect(part.combatDefeatedUi).not.toBe(s.combatDefeatedUi);
        expect(part.stockPrompts.character).toBe('custom prompt');
        // merged with defaults — more keys than the one override
        expect(Object.keys(part.stockPrompts).length).toBeGreaterThan(1);
        expect(snapshotStockPromptsForProfile({ character: 'x' }).character).toBe('x');
    });

    it('keeps custom tracker definitions global while preserving legacy chat-linked modules', () => {
        const s = getSettings();
        s.customFields = [];
        delete s.customFieldsGlobalizedVersion;
        s.chatStates = {
            alpha: { customFields: [{ tag: 'ALPHA_TRACKER', label: 'Alpha', enabled: true }] },
            beta: { customFields: [{ tag: 'BETA_TRACKER', label: 'Beta', enabled: true }] },
        };

        const migrated = getSettings();
        expect(migrated.customFields.map(field => field.tag)).toEqual(['ALPHA_TRACKER', 'BETA_TRACKER']);
        expect(migrated.chatStates.alpha.customFields).toBeUndefined();
        expect(migrated.chatStates.beta.customFields).toBeUndefined();

        saveChatState('fresh-chat', { skipDiskWrite: true });
        expect(migrated.chatStates['fresh-chat'].customFields).toBeUndefined();
    });

    it('snapshots NPC relationship values and logs into the chat partition', () => {
        const s = getSettings();
        s.npcRelationshipValues = {
            'Eldoria_NPCs::7': { friendship: 18, affection: -4 },
        };
        s.npcRelationshipLog = {
            'Eldoria_NPCs::7': [{ timestamp: 1, field: 'friendship', delta: 3, newValue: 18, source: 'agent' }],
        };

        saveChatState('rel-chat', { skipDiskWrite: true });

        const part = s.chatStates['rel-chat'];
        expect(part.npcRelationshipValues).toEqual(s.npcRelationshipValues);
        expect(part.npcRelationshipValues).not.toBe(s.npcRelationshipValues);
        expect(part.npcRelationshipLog).toEqual(s.npcRelationshipLog);
        expect(part.npcRelationshipLog).not.toBe(s.npcRelationshipLog);

        s.npcRelationshipValues['Eldoria_NPCs::7'].friendship = 99;
        expect(part.npcRelationshipValues['Eldoria_NPCs::7'].friendship).toBe(18);
    });

    it('preserves dungeon reality authored directly in the chat partition', () => {
        const s = getSettings();
        s.chatStates['vitest-chat'] = {
            dungeonReality: {
                version: 1,
                sites: {
                    'ember mine': {
                        siteRoot: 'Ember Mine',
                        mapChunks: ['Area: Lift'],
                        statusLog: [],
                    },
                },
            },
        };

        saveChatState('vitest-chat', { skipDiskWrite: true });

        expect(s.chatStates['vitest-chat'].dungeonReality.sites['ember mine'].mapChunks)
            .toEqual(['Area: Lift']);
    });

    it('snapshots the full Control Room and tracker-module setup only when opted in', () => {
        const s = getSettings();
        s.chatSetupLinkEnabled = true;
        s.customFields = [{ tag: 'REPUTATION', label: 'Reputation', enabled: true }];
        s.customSyspromptLibrary = [{ id: 'law', tag: 'law', content: 'Custom law' }];
        s.syspromptSectionOrder = ['lib:law'];
        s.systemPromptTemplate = 'Per-chat extractor';

        saveChatState('locked-chat', { skipDiskWrite: true });

        const setup = s.chatStates['locked-chat'].setup;
        expect(setup.customFieldStates.REPUTATION).toBe(true);
        expect(setup.syspromptSnippetStates.law).toBe(false);
        expect(setup.syspromptSectionOrder).toEqual(['lib:law']);
        expect(setup.systemPromptTemplate).toBe('Per-chat extractor');
        expect(setup.cyoaConfig.slots).toBeDefined();
        expect(setup.cyoaConfig.presets).toBeDefined();
        expect(setup.cyoaConfig.buttonColor).toBeUndefined();
        expect(setup.cyoaConfig.mechBgOpacity).toBeUndefined();
        expect(s.trackerModuleDatabase[0].tag).toBe('REPUTATION');
        expect(s.syspromptSnippetDatabase[0].content).toBe('Custom law');
    });
});
