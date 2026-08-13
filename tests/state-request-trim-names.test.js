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

    it('passes an optional JSON schema through generateRaw for structured requests', async () => {
        let capturedOptions = null;
        globalThis.SillyTavern.getContext = () => ({
            ...originalGetContext(),
            mainApi: 'openai',
            generateRaw: async (opts) => {
                capturedOptions = opts;
                return '{"ok":true}';
            },
        });
        const jsonSchema = { name: 'test', value: { type: 'object' }, returnInvalid: true };

        const result = await sendStateRequest(
            { connectionSource: 'default' },
            'system prompt',
            'user prompt',
            null,
            { jsonSchema },
        );

        expect(capturedOptions.jsonSchema).toBe(jsonSchema);
        expect(result).toBe('{"ok":true}');
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
