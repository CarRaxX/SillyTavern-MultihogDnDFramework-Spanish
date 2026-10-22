import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../../script.js', () => ({
    getRequestHeaders: () => ({}),
}));

import { resolveEntityDisplayName, blockToItems } from '../renderer.js';
import { extractCharNameFromMemo } from '../character-creator.js';
import { lookupCustomPortraitSrc } from '../portrait-storage.js';

describe('user macro resolution and zero-hardcoding', () => {
    const originalST = globalThis.SillyTavern;

    beforeEach(() => {
        globalThis.SillyTavern = {
            getContext: () => ({
                extensionSettings: {},
                name2: 'Kaelen',
                substituteParams: (str) => String(str).replace(/\{\{user\}\}/gi, 'Kaelen'),
            }),
        };
    });

    afterEach(() => {
        if (originalST) {
            globalThis.SillyTavern = originalST;
        } else {
            delete globalThis.SillyTavern;
        }
    });

    it('resolves {{user}} dynamically to active username in resolveEntityDisplayName', () => {
        expect(resolveEntityDisplayName('{{user}} (Forastero)')).toBe('Kaelen (Forastero)');
        expect(resolveEntityDisplayName('Elena (Guerrera)')).toBe('Elena (Guerrera)');
    });

    it('renders resolved username in character cards without literal {{user}} token', () => {
        const content = `{{user}} (Forastero): 12/12 HP
- Fuerza: ((BAR)) 15/100 (Novato)
- Resistencia: ((BAR)) 12/100 (Novato)`;
        const items = blockToItems('CHARACTER', content);
        expect(items.length).toBe(1);
        expect(items[0]).toContain('Kaelen (Forastero)');
        expect(items[0]).not.toContain('{{user}}');
    });

    it('resolves {{user}} to active username in extractCharNameFromMemo instead of returning literal macro', () => {
        const memoWithMacro = `[CHARACTER]
{{user}} (Forastero): 12/12 HP
- Fuerza: ((BAR)) 15/100 (Novato)
[/CHARACTER]`;
        expect(extractCharNameFromMemo(memoWithMacro)).toBe('Kaelen');

        const memoWithExplicitName = `[CHARACTER]
Thorne (Paladín): 30/30 HP
- Fuerza: ((BAR)) 45/100 (Firme)
[/CHARACTER]`;
        expect(extractCharNameFromMemo(memoWithExplicitName)).toBe('Thorne');
    });

    it('bridges portrait lookup bidirectionally between {{user}} and active persona name', () => {
        const settingsWithMacroAvatar = {
            customPortraits: {
                '{{user}}': 'data:image/png;base64,avatarUserMacro',
            },
        };
        // Searching with active user name resolves to the {{user}} portrait
        const foundByName = lookupCustomPortraitSrc(settingsWithMacroAvatar, 'Kaelen');
        expect(foundByName).toBe('data:image/png;base64,avatarUserMacro');

        const settingsWithNameAvatar = {
            customPortraits: {
                'Kaelen': 'data:image/png;base64,avatarKaelen',
            },
        };
        // Searching with {{user}} resolves to Kaelen portrait
        const foundByMacro = lookupCustomPortraitSrc(settingsWithNameAvatar, '{{user}}');
        expect(foundByMacro).toBe('data:image/png;base64,avatarKaelen');
    });
});
