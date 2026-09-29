import { describe, expect, it, vi } from 'vitest';

vi.mock('../portraits.js', () => ({
    normalizeLocationPath: (path) => {
        if (!path) return '';
        return String(path).split('::').map(p => p.trim()).filter(Boolean).join(' :: ');
    },
}));

import { resolveCurrentLocationPath, tokenizeLocationText, formatLocationBreadcrumb } from '../location-resolver.js';

describe('location-resolver', () => {
    describe('tokenizeLocationText', () => {
        it('normalizes delimiters and spaces into tokens', () => {
            expect(tokenizeLocationText('Elven Realm :: Monastery, Courtyard / Garden — Inner'))
                .toEqual(['elven', 'realm', 'monastery', 'courtyard', 'garden', 'inner']);
        });

        it('returns empty array for empty or null input', () => {
            expect(tokenizeLocationText('')).toEqual([]);
            expect(tokenizeLocationText(null)).toEqual([]);
        });
    });

    describe('resolveCurrentLocationPath', () => {
        const allPaths = [
            'Kingdom :: Castle :: Courtyard',
            'Kingdom :: Monastery :: Courtyard',
            'Wilderness :: Dark Cave',
            'Underdark :: Cavern :: Shrine',
        ];

        it('resolves exact normalized path match', () => {
            const res = resolveCurrentLocationPath('Kingdom :: Castle :: Courtyard', allPaths);
            expect(res).toBe('Kingdom :: Castle :: Courtyard');
        });

        it('resolves suffix match', () => {
            const res = resolveCurrentLocationPath('Castle Courtyard', allPaths);
            expect(res).toBe('Kingdom :: Castle :: Courtyard');
        });

        it('resolves leaf-only fallback without recursion error', () => {
            // "Monastery Courtyard" should prefer "Kingdom :: Monastery :: Courtyard"
            const res = resolveCurrentLocationPath('Ancient Monastery Courtyard', allPaths);
            expect(res).toBe('Kingdom :: Monastery :: Courtyard');
        });

        it('does not crash with recursion when input has multiple tokens and partial ancestor match', () => {
            // This specific case caused: InternalError: too much recursion
            const paths = [
                'Realm :: Forgotten Monastery :: Courtyard',
                'Dungeon :: Deep Crypt :: Courtyard',
            ];
            const res = resolveCurrentLocationPath('Elven Monastery Courtyard', paths);
            expect(res).toBe('Realm :: Forgotten Monastery :: Courtyard');
        });

        it('falls back to deepest candidate if no ancestor matches', () => {
            const paths = [
                'Zone :: Courtyard',
                'Deep :: Nested :: Underground :: Courtyard',
            ];
            const res = resolveCurrentLocationPath('Unrelated Tokens Courtyard', paths);
            expect(res).toBe('Deep :: Nested :: Underground :: Courtyard');
        });

        it('respects activeLocPaths preference for leaf match', () => {
            const paths = [
                'Kingdom :: Castle :: Courtyard',
                'Kingdom :: Monastery :: Courtyard',
            ];
            const res = resolveCurrentLocationPath('Courtyard', paths, {
                activeLocPaths: ['Kingdom :: Monastery :: Courtyard'],
            });
            expect(res).toBe('Kingdom :: Monastery :: Courtyard');
        });

        it('returns null for empty input or no matching candidates', () => {
            expect(resolveCurrentLocationPath('', allPaths)).toBeNull();
            expect(resolveCurrentLocationPath('Nowhere Land', allPaths)).toBeNull();
            expect(resolveCurrentLocationPath('Castle', [])).toBeNull();
        });
    });

    describe('formatLocationBreadcrumb', () => {
        it('formats breadcrumbs with arrow separators', () => {
            expect(formatLocationBreadcrumb('Kingdom::Castle::Throne Room'))
                .toBe('Kingdom › Castle › Throne Room');
        });

        it('returns empty string for empty path', () => {
            expect(formatLocationBreadcrumb('')).toBe('');
        });
    });
});
