import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findMostRecentNarratorMessage } from '../src/state/present-now.js';

describe('findMostRecentNarratorMessage', () => {
    it('skips a trailing user message and keeps the previous narrator output', () => {
        const chat = [
            { is_user: false, mes: 'Megumi waits in the office.' },
            { is_user: true, mes: '*heads to the guidance office*' },
        ];
        expect(findMostRecentNarratorMessage(chat)?.mes).toBe('Megumi waits in the office.');
    });

    it('returns the latest assistant message when that is the tail', () => {
        const chat = [
            { is_user: true, mes: 'I look around.' },
            { is_user: false, mes: 'Darukawa Megumi looks up from her desk.' },
        ];
        expect(findMostRecentNarratorMessage(chat)?.mes).toBe('Darukawa Megumi looks up from her desk.');
    });

    it('skips system, hidden, and summary messages', () => {
        const chat = [
            { is_user: false, mes: 'Keep this narrator beat.' },
            { is_system: true, mes: 'system note' },
            { is_user: false, is_hidden: true, mes: 'hidden swipe' },
            { is_user: false, extra: { is_summary: true }, mes: 'Summary of past events.' },
            { is_user: true, mes: 'continue' },
        ];
        expect(findMostRecentNarratorMessage(chat)?.mes).toBe('Keep this narrator beat.');
    });

    it('returns null when the chat has no narrator output', () => {
        expect(findMostRecentNarratorMessage([{ is_user: true, mes: 'hello' }])).toBeNull();
        expect(findMostRecentNarratorMessage([])).toBeNull();
        expect(findMostRecentNarratorMessage(null)).toBeNull();
    });
});

describe('Present Now scanner wiring', () => {
    it('reads narrator text via findMostRecentNarratorMessage and does not stop at user turns', () => {
        const router = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
        expect(router).toContain("import { findMostRecentNarratorMessage } from './src/state/present-now.js'");
        expect(router).toContain('findMostRecentNarratorMessage(chat, { includeHidden })');
        expect(router).not.toContain('if (msg.is_user) break');
        expect(router).toContain('User messages are never scanned');
    });
});
