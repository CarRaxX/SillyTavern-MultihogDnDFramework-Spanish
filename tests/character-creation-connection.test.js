import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { testExtensionSettings } from './setup.js';

vi.mock('../portrait-storage.js', () => ({
    lookupCustomPortraitSrc: () => '',
}));

import { renderMemoAsCards } from '../renderer.js';
import {
    getCharacterCreationConnectionSettings,
    resolveCharacterCreationProfileId,
} from '../character-creation-connection.js';

describe('shared Character Creation connection', () => {
    it('keeps a shortcut on onboarding and centralizes the shared controls in settings', () => {
        for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
        const html = renderMemoAsCards('', null, {});
        const settingsHtml = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');

        expect(html).toContain('Character Creation Connection');
        expect(html).toContain('Shared by Character Creator, Instant Action, and Other Ways to Begin');
        expect(html).toContain('rt-open-character-creation-connection-settings');
        expect(html).toContain('Connections &amp; Models');
        [
            'rt-character-creation-connection-source',
            'rt-character-creation-connection-profile',
            'rt-character-creation-ollama-url',
            'rt-character-creation-ollama-model',
            'rt-character-creation-openai-url',
            'rt-character-creation-openai-key',
            'rt-character-creation-openai-model',
            'rt-character-creation-openai-model-manual',
            'rt-character-creation-completion-preset',
        ].forEach(id => {
            expect(settingsHtml).toContain(`id="${id}"`);
            expect(html).not.toContain(`id="${id}"`);
        });

        expect(html.indexOf('Character Creation Connection')).toBeGreaterThan(html.indexOf('Narrator Configuration'));
        const narratorStart = html.indexOf('<div class="rt-onboarding-secondary rt-onboarding-drawer rt-onboarding-narrator-drawer">');
        const shortcutStart = html.indexOf('<div class="rt-onboarding-connection-shortcut"');
        const narratorMarkup = html.slice(narratorStart, shortcutStart);
        expect((narratorMarkup.match(/<div\b/g) || []).length).toBe((narratorMarkup.match(/<\/div>/g) || []).length);
        expect(settingsHtml).toContain('rt-character-creation-connection-controls');
    });

    it('maps the shared settings into the LLM request shape', () => {
        expect(getCharacterCreationConnectionSettings({
            characterCreationConnectionSource: 'openai',
            characterCreationConnectionProfileId: 'creator-profile',
            characterCreationCompletionPresetId: 'creator-preset',
            characterCreationOllamaUrl: 'http://ollama.test',
            characterCreationOllamaModel: 'creator-ollama',
            characterCreationOpenaiUrl: 'https://api.test',
            characterCreationOpenaiKey: 'secret',
            characterCreationOpenaiModel: 'creator-model',
            maxTokens: 1234,
            debugMode: true,
        })).toEqual({
            connectionSource: 'openai',
            connectionProfileId: 'creator-profile',
            completionPresetId: 'creator-preset',
            ollamaUrl: 'http://ollama.test',
            ollamaModel: 'creator-ollama',
            openaiUrl: 'https://api.test',
            openaiKey: 'secret',
            openaiModel: 'creator-model',
            maxTokens: 1234,
            debugMode: true,
        });
    });

    it('stores internal profile IDs and migrates the old display-name value', () => {
        const profiles = [
            { id: 'profile-combat-id', name: 'COMBAT' },
            { id: 'profile-sonnet-id', name: 'Sonnet 5' },
        ];

        expect(resolveCharacterCreationProfileId('Sonnet 5', profiles)).toBe('profile-sonnet-id');
        expect(resolveCharacterCreationProfileId('profile-combat-id', profiles)).toBe('profile-combat-id');
        expect(resolveCharacterCreationProfileId('Missing Profile', profiles)).toBe('');

        const source = readFileSync(new URL('../character-creation-connection.js', import.meta.url), 'utf8');
        expect(source).toContain('service.handleDropdown(');
        expect(source).toContain("selectedProfile?.id || ''");
    });

    it('routes Character Creator, Instant Action, and Other Ways through the shared overlay', () => {
        const creator = readFileSync(new URL('../character-creator.js', import.meta.url), 'utf8');
        const cards = readFileSync(new URL('../src/ui/panel/card-events.js', import.meta.url), 'utf8');
        const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

        expect(creator.match(/connectionSettings: getCharacterCreationConnectionSettings\(s\)/g)?.length).toBeGreaterThanOrEqual(3);
        expect(cards.match(/connectionSettings: getCharacterCreationConnectionSettings\(getSettings\(\)\)/g)?.length).toBe(3);
        expect(index).toContain("sendStateRequest(options.connectionSettings || settings, systemPrompt, userPrompt, signal, { stream: true, debugSource: 'Tracker' })");
    });
});
