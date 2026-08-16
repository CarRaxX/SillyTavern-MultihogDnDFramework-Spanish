import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    buildRouterCategoryMap,
    getEnabledRouterCategoryTags,
    inferRecordCategory,
    resolveRecordCategoryTag,
} from '../src/state/router-utils.js';

const routerSource = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
const defaultsSource = readFileSync(new URL('../src/state/defaults.js', import.meta.url), 'utf8');

const KNOWN = ['NPC', 'LOC', 'QUEST', 'FAC', 'EVENT', 'WORLD'];
const CUSTOM_ONLY_SETTINGS = {
    routerModules: {
        npc: { enabled: false, tag: 'NPC' },
        loc: { enabled: false, tag: 'LOC' },
        fac: { enabled: false, tag: 'FAC' },
        quest: { enabled: false, tag: 'QUEST' },
        event: { enabled: false, tag: 'EVENT' },
        world: { enabled: false, tag: 'WORLD' },
    },
    routerCustomTags: [{ tag: 'HOMEBREW' }],
};

describe('inferRecordCategory', () => {
    it('infers LOC from :: hierarchy labels', () => {
        expect(inferRecordCategory({
            label: 'Kalvermoor :: The Handler\'s Rest',
            content: '[CORE]\nA weathered oak tavern.\n[/CORE]',
        })).toBe('LOC');
    });

    it('infers NPC from structured CORE field headers', () => {
        expect(inferRecordCategory({
            label: 'Lissa',
            content: '[CORE]\nSpecies: Human\nPersonality: Practical\nStrengths:\n- Expert rope maintenance\n[/CORE]',
        })).toBe('NPC');
    });

    it('infers EVENT from timestamped labels', () => {
        expect(inferRecordCategory({
            label: '[Day 1, 08:50 AM] Boe explained the economy',
            content: 'Visitors keep coming to the Long Ring.',
        })).toBe('EVENT');
    });

    it('returns null when signals are weak', () => {
        expect(inferRecordCategory({
            label: 'Long Ring of Kalvermoor',
            content: '[Day 1, 08:20 AM] The runner remains trapped.',
        })).toBeNull();
        expect(inferRecordCategory({
            label: 'Iron Syndicate',
            content: '[CORE]\nAn industrial authority.\n[/CORE]',
        })).toBeNull();
    });
});

describe('resolveRecordCategoryTag', () => {
    it('prefers an explicit category over inference', () => {
        expect(resolveRecordCategoryTag({
            label: 'Kalvermoor :: The Ring',
            category: 'LOC',
            content: '[CORE]\nSpecies: Human\n[/CORE]',
        }, KNOWN)).toEqual({ tag: 'LOC', inferred: false });
    });

    it('infers when category is omitted', () => {
        expect(resolveRecordCategoryTag({
            label: 'Lissa',
            content: '[CORE]\nSpecies: Human\nPersonality: Guarded\n[/CORE]',
        }, KNOWN)).toEqual({ tag: 'NPC', inferred: true });
    });

    it('returns null when nothing matches (no bare-book dump)', () => {
        expect(resolveRecordCategoryTag({
            label: 'Long Ring of Kalvermoor',
            content: 'Some chronicle text without signals.',
        }, KNOWN)).toEqual({ tag: null, inferred: false });
    });

    it('uses an unambiguous custom-only fallback when category is omitted', () => {
        expect(resolveRecordCategoryTag({
            label: 'Homebrew Armorer',
            content: 'A custom crafting specialization.',
        }, ['HOMEBREW', 'WORLD'], 'HOMEBREW')).toEqual({ tag: 'HOMEBREW', inferred: true });
    });

    it('replaces a disabled stock category when the custom destination is unambiguous', () => {
        expect(resolveRecordCategoryTag({
            label: 'Homebrew Armorer',
            category: 'NPC',
            content: 'A custom crafting specialization.',
        }, ['HOMEBREW', 'WORLD'], 'HOMEBREW')).toEqual({ tag: 'HOMEBREW', inferred: true });
    });

    it('does not let a custom substring tag steal an exact WORLD category', () => {
        // applyAction appends WORLD after custom tags; first-match includes()
        // previously routed World Progression reports into e.g. prefix_Or.
        expect(resolveRecordCategoryTag({
            label: 'Day 3 Morning',
            category: 'WORLD',
            content: '## Morrowfen\nPressure builds at the docks.',
        }, ['OR', 'WORLD'])).toEqual({ tag: 'WORLD', inferred: false });
        expect(resolveRecordCategoryTag({
            label: 'Day 3 Morning',
            category: 'WORLD',
            content: '## Morrowfen\nPressure builds at the docks.',
        }, ['WO', 'WORLD'])).toEqual({ tag: 'WORLD', inferred: false });
    });

    it('prefers an exact custom tag over an earlier substring custom tag', () => {
        expect(resolveRecordCategoryTag({
            label: 'Custom ritual',
            category: 'HOMEBREW',
            content: 'A local rite.',
        }, ['ME', 'HOMEBREW'])).toEqual({ tag: 'HOMEBREW', inferred: false });
    });

    it('still fuzzy-matches LOCATION to LOC when no exact tag exists', () => {
        expect(resolveRecordCategoryTag({
            label: 'Kalvermoor :: The Ring',
            category: 'LOCATION',
            content: '[CORE]\nA ring.\n[/CORE]',
        }, ['LOC', 'WORLD'])).toEqual({ tag: 'LOC', inferred: false });
    });
});

describe('custom-only category configuration', () => {
    it('exposes only the custom tag when every stock module is disabled', () => {
        expect(getEnabledRouterCategoryTags(CUSTOM_ONLY_SETTINGS)).toEqual(['HOMEBREW']);
    });

    it('builds a writable map containing only the custom lorebook', () => {
        expect(buildRouterCategoryMap(CUSTOM_ONLY_SETTINGS)).toEqual({ HOMEBREW: 'Homebrew' });
    });
});

describe('prompt + router wiring for required category', () => {
    it('ships REQUIRED category guidance in defaults formatting and shared context', () => {
        expect(defaultsSource).toContain('REQUIRED category field');
        expect(defaultsSource).toContain('Labels and');
        expect(defaultsSource).toContain('do NOT choose the book');
        expect(defaultsSource).toContain('MISSING required "category": "NPC"');
    });

    it('builds text-format commit instructions from the live category list', () => {
        expect(routerSource).toContain('category is REQUIRED and must use one of these enabled values');
        expect(routerSource).toContain('const categoryChoiceText = categoryEnum.map');
        expect(routerSource).toContain('AVAILABLE RECORD CATEGORIES (AUTHORITATIVE FOR THIS PASS)');
        expect(routerSource).not.toContain('NPC|LOC|FAC|QUEST|EVENT');
    });

    it('applyAction resolves category via resolveRecordCategoryTag and skips unknown', () => {
        expect(routerSource).toContain('resolveRecordCategoryTag(rec, knownCatTags, unambiguousFallbackTag)');
        expect(routerSource).toContain('missing or unrecognized category');
        expect(routerSource).toContain('const writableCategoryMap = buildRouterCategoryMap(settings)');
        expect(routerSource).not.toContain('idealTargetBook = catName ? (prefix ? `${prefix}_${catMap[catName]}` : catMap[catName]) : baseBook');
    });
});
