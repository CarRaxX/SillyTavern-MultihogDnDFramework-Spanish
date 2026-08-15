import { describe, expect, it } from 'vitest';
import { haystackMatches, tokenizeQuery } from '../src/ui/settings-search.js';

describe('settings search matching', () => {
    it('tokenizes keywords on whitespace and ignores empty queries', () => {
        expect(tokenizeQuery('')).toEqual([]);
        expect(tokenizeQuery('   ')).toEqual([]);
        expect(tokenizeQuery('Chat-Linked')).toEqual(['chat-linked']);
        expect(tokenizeQuery('  chat   link  ')).toEqual(['chat', 'link']);
    });

    it('requires every token to appear in the haystack', () => {
        expect(haystackMatches('Chat-Linked Mode', ['chat', 'link'])).toBe(true);
        expect(haystackMatches('Enable Portraits in Tracker', ['portrait'])).toBe(true);
        expect(haystackMatches('Day/Night Cycle', ['night', 'cycle'])).toBe(true);
        expect(haystackMatches('Day/Night Cycle', ['night', 'combat'])).toBe(false);
        expect(haystackMatches('', ['portrait'])).toBe(false);
        expect(haystackMatches('Anything', [])).toBe(true);
    });

    it('matches help-text phrases that span labels and titles', () => {
        const haystack = [
            'Chat-Linked Mode',
            'When enabled, the tracker state (memo) is automatically saved and restored per chat ID.',
        ].join(' ');
        expect(haystackMatches(haystack, ['chat', 'id'])).toBe(true);
        expect(haystackMatches(haystack, ['lorebook'])).toBe(false);
    });
});
