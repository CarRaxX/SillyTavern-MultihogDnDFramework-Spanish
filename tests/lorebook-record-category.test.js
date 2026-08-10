import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inferRecordCategory, resolveRecordCategoryTag } from '../src/state/router-utils.js';

const routerSource = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
const defaultsSource = readFileSync(new URL('../src/state/defaults.js', import.meta.url), 'utf8');

const KNOWN = ['NPC', 'LOC', 'QUEST', 'FAC', 'EVENT', 'WORLD'];

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
});

describe('prompt + router wiring for required category', () => {
    it('ships REQUIRED category guidance in defaults formatting and shared context', () => {
        expect(defaultsSource).toContain('REQUIRED category field');
        expect(defaultsSource).toContain('Labels and');
        expect(defaultsSource).toContain('do NOT choose the book');
        expect(defaultsSource).toContain('MISSING required "category": "NPC"');
    });

    it('text-format commit instructions require category and show NPC+LOC example', () => {
        expect(routerSource).toContain('category is REQUIRED on every record');
        expect(routerSource).toContain('"category": "NPC"');
        expect(routerSource).toContain('"category": "LOC"');
    });

    it('applyAction resolves category via resolveRecordCategoryTag and skips unknown', () => {
        expect(routerSource).toContain('resolveRecordCategoryTag(rec, knownCatTags)');
        expect(routerSource).toContain('missing required category');
        expect(routerSource).not.toContain('idealTargetBook = catName ? (prefix ? `${prefix}_${catMap[catName]}` : catMap[catName]) : baseBook');
    });
});
