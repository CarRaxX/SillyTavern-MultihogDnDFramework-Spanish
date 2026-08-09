import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('new-chat Narrator Configuration inheritance', () => {
    it('clears unseen-chat story state without restoring factory setup', () => {
        const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        const resetStart = source.indexOf('function resetUnseenChatState(s) {');
        const resetEnd = source.indexOf('async function refreshExtensionPrompt()', resetStart);

        expect(resetStart).toBeGreaterThan(-1);
        expect(resetEnd).toBeGreaterThan(resetStart);

        const resetSource = source.slice(resetStart, resetEnd);
        expect(resetSource).toContain("s.currentMemo = '';");
        expect(resetSource).not.toContain('resetChatSetupToStock');
        expect(resetSource).toContain('clearChatBoundActivations(s)');
        expect(source).toContain('a new chat inherits that configuration');
    });
});
