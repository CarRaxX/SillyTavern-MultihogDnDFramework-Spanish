import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

import { getEffectiveRouterCampaignPrefix, getSettings, sanitizeCampaignPrefixString } from '../state-manager.js';
import { preserveCampaignPrefixAfterRename } from '../src/features/chat/chat-rename-migrate.js';
import { testExtensionSettings } from './setup.js';

describe('getEffectiveRouterCampaignPrefix', () => {
    beforeEach(() => {
        for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
        const base = SillyTavern.getContext();
        SillyTavern.getContext = () => ({
            ...base,
            chatId: 'Active Chat',
            getCurrentChatId: () => 'Active Chat',
        });
    });

    it('derives from chat id when no override is set', () => {
        getSettings();
        expect(getEffectiveRouterCampaignPrefix('My Campaign')).toBe('My_Campaign');
    });

    it('applies an anchored override only to the anchored chat', () => {
        const s = getSettings();
        s.routerCampaignPrefixOverride = 'EpicQuest';
        s.routerCampaignPrefixOverrideAnchorChatId = 'Chat A';

        expect(getEffectiveRouterCampaignPrefix('Chat A')).toBe('EpicQuest');
        expect(getEffectiveRouterCampaignPrefix('Chat B')).toBe('Chat_B');
    });

    it('legacy unanchored override applies only to the active chat', () => {
        const s = getSettings();
        s.routerCampaignPrefixOverride = 'SharedStack';
        s.routerCampaignPrefixOverrideAnchorChatId = '';

        expect(getEffectiveRouterCampaignPrefix('Active Chat')).toBe('SharedStack');
        expect(getEffectiveRouterCampaignPrefix('Other Chat')).toBe('Other_Chat');
    });
});

describe('preserveCampaignPrefixAfterRename', () => {
    beforeEach(() => {
        for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
    });

    it('pins the old lorebook prefix so rename does not split the stack', () => {
        const s = getSettings();
        s.chatStates = {
            'Renamed Chat': {
                currentMemo: 'alive',
                campaignBooks: ['Old_Chat_NPCs', 'Old_Chat_Locations'],
                routerCampaignPrefix: 'Old_Chat',
                activeRouterKeys: ['Old_Chat_NPCs::0'],
            },
        };

        expect(preserveCampaignPrefixAfterRename(s, 'Old Chat', 'Renamed Chat')).toBe(true);
        expect(s.routerCampaignPrefixOverride).toBe('Old_Chat');
        expect(s.routerCampaignPrefixOverrideAnchorChatId).toBe('Renamed Chat');
        expect(s.routerCampaignPrefix).toBe('Old_Chat');
        expect(getEffectiveRouterCampaignPrefix('Renamed Chat')).toBe('Old_Chat');
        expect(getEffectiveRouterCampaignPrefix('Unrelated')).toBe(
            sanitizeCampaignPrefixString('Unrelated'),
        );
    });

    it('binds a legacy unanchored override to the renamed chat', () => {
        const s = getSettings();
        s.routerCampaignPrefixOverride = 'CustomPrefix';
        s.routerCampaignPrefixOverrideAnchorChatId = '';
        s.chatStates = {
            'Renamed Chat': {
                campaignBooks: ['CustomPrefix_NPCs'],
                routerCampaignPrefix: 'CustomPrefix',
            },
        };

        expect(preserveCampaignPrefixAfterRename(s, 'Old Chat', 'Renamed Chat')).toBe(true);
        expect(s.routerCampaignPrefixOverrideAnchorChatId).toBe('Renamed Chat');
        expect(getEffectiveRouterCampaignPrefix('Renamed Chat')).toBe('CustomPrefix');
        expect(getEffectiveRouterCampaignPrefix('Other')).toBe('Other');
    });

    it('does not pin when there is no linked lore stack', () => {
        const s = getSettings();
        s.chatStates = {
            'Renamed Chat': {
                currentMemo: 'story only',
                campaignBooks: [],
                activeRouterKeys: [],
                routerCampaignPrefix: '',
            },
        };

        expect(preserveCampaignPrefixAfterRename(s, 'Old Chat', 'Renamed Chat')).toBe(false);
        expect(s.routerCampaignPrefixOverride).toBe('');
        expect(s.routerCampaignPrefixOverrideAnchorChatId).toBe('');
    });
});

describe('prefix override wiring', () => {
    it('Branch Campaign pins an unanchored override to the source chat', () => {
        const source = readFileSync(new URL('../src/features/chat/branch-campaign.js', import.meta.url), 'utf8');
        expect(source).toContain('routerCampaignPrefixOverrideAnchorChatId = oldId');
        expect(source).toContain('Keep Campaign Prefix Override on the SOURCE chat');
    });

    it('settings UI anchors override edits to the current chat', () => {
        const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        expect(source).toContain('routerCampaignPrefixOverrideAnchorChatId');
        expect(source).toContain('settings.routerCampaignPrefix = getEffectiveRouterCampaignPrefix(chatId)');
    });
});
