import { describe, expect, it, afterEach } from 'vitest';
import { sendStateRequest } from '../llm-client.js';

const originalGetContext = globalThis.SillyTavern.getContext;

afterEach(() => {
    globalThis.SillyTavern.getContext = originalGetContext;
});

describe('sendStateRequest default (generateRaw) mode disables trimNames', () => {
    it('passes trimNames: false to generateRaw so ST never silently deletes a structured response', async () => {
        let capturedOptions = null;
        globalThis.SillyTavern.getContext = () => ({
            ...originalGetContext(),
            generateRaw: async (opts) => {
                capturedOptions = opts;
                // Simulate a character-sheet response that happens to start with the
                // persona's own name followed by a colon — exactly the shape ST's
                // cleanUpMessage(trimWrongNames: true) would otherwise wipe entirely.
                return 'Hyperion Blackwood: a grim mercenary...';
            },
        });

        const result = await sendStateRequest(
            { connectionSource: 'default' },
            'system prompt',
            'user prompt',
        );

        expect(capturedOptions).toBeTruthy();
        expect(capturedOptions.trimNames).toBe(false);
        expect(result).toBe('Hyperion Blackwood: a grim mercenary...');
    });

    it('reads raw Main API data for structured requests without sending provider-level schema', async () => {
        let capturedOptions = null;
        globalThis.SillyTavern.getContext = () => ({
            ...originalGetContext(),
            mainApi: 'openai',
            generateRaw: async () => {
                throw new Error('generateRaw cleanup path must not be used');
            },
            generateRawData: async (opts) => {
                capturedOptions = opts;
                return { choices: [{ message: { content: '{"ok":true}' } }] };
            },
            extractMessageFromData: raw => raw.choices[0].message.content,
        });
        const jsonSchema = { name: 'test', value: { type: 'object' }, returnInvalid: true };

        const result = await sendStateRequest(
            { connectionSource: 'default' },
            'system prompt',
            'user prompt',
            null,
            { jsonSchema },
        );

        expect(capturedOptions.jsonSchema).toBeNull();
        expect(result).toBe('{"ok":true}');
    });

    it('recovers reasoning-only raw responses for downstream parsing and validation', async () => {
        globalThis.SillyTavern.getContext = () => ({
            ...originalGetContext(),
            mainApi: 'openai',
            generateRawData: async () => ({
                choices: [{ message: { content: '', reasoning_content: '{"version":3}' } }],
            }),
            extractMessageFromData: () => '',
        });

        const result = await sendStateRequest(
            { connectionSource: 'default' },
            'system prompt',
            'user prompt',
            null,
            { jsonSchema: { name: 'test', value: { type: 'object' } } },
        );

        expect(result).toBe('{"version":3}');
    });

    it('passes JSON schema to profile requests and serializes structured content', async () => {
        let capturedOverride = null;
        const jsonSchema = { name: 'test', value: { type: 'object' } };
        globalThis.SillyTavern.getContext = () => ({
            ...originalGetContext(),
            ConnectionManagerRequestService: {
                getProfile: () => ({ preset: '' }),
                sendRequest: async (_profileId, _messages, _maxTokens, _options, override) => {
                    capturedOverride = override;
                    return { content: { ok: true }, reasoning: '' };
                },
            },
        });

        const result = await sendStateRequest(
            { connectionSource: 'profile', connectionProfileId: 'profile-1' },
            'system prompt',
            'user prompt',
            null,
            { jsonSchema },
        );

        expect(capturedOverride).toEqual({ json_schema: jsonSchema });
        expect(result).toBe('{"ok":true}');
    });
});
