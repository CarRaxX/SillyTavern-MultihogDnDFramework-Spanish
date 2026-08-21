import { describe, expect, it } from 'vitest';
import { getCardAppearanceSynopsis, getCardListFirstSentence, getCardLibraryBlurb } from '../src/ui/panel/card-synopsis.js';

describe('getCardAppearanceSynopsis', () => {
    it('joins Species + Body when Body content is on the following line', () => {
        const bio = [
            'Species: Human female.',
            'Body:',
            'Ianthe possesses a lithe, athletic build with pale skin and sharp emerald eyes.',
            'Equipment:',
            'Silver plate armor.',
            'Personality: Stoic.',
        ].join('\n');
        const desc = getCardAppearanceSynopsis(bio);
        expect(desc).toContain('Human female.');
        expect(desc).toContain('lithe, athletic build');
        expect(desc).not.toContain('Silver plate');
        expect(desc).not.toContain('Stoic');
    });

    it('joins Species + Body for NPC [CORE] blocks', () => {
        const bio = `[CORE]
Species: Fey / Wood Nymph
Body: Lithe and ethereal frame with long pink hair.
Equipment: Leaf-woven dress.
Personality: Kind.
[/CORE]`;
        expect(getCardAppearanceSynopsis(bio)).toBe('Fey / Wood Nymph — Lithe and ethereal frame with long pink hair.');
    });

    it('falls back to legacy Appearance/Species without matching Species inside it', () => {
        const bio = 'Appearance/Species: Tall human with a scar.\nPersonality: Stoic.\n';
        expect(getCardAppearanceSynopsis(bio)).toBe('Tall human with a scar.');
    });
});

describe('getCardListFirstSentence', () => {
    it('keeps only the first sentence of a Species+Body synopsis', () => {
        const bio = [
            'Species: Bound dwarven forge spirit and ancestral stone warden.',
            'Body: Concealed within the hollow subterranean void of a mountain.',
            'Personality: Stern.',
        ].join('\n');
        expect(getCardListFirstSentence(bio)).toBe('Bound dwarven forge spirit and ancestral stone warden.');
    });

    it('falls back to the clause before an em dash when there is no terminator', () => {
        const bio = `[CORE]
Species: Fey / Wood Nymph
Body: Lithe and ethereal frame with long pink hair.
[/CORE]`;
        expect(getCardListFirstSentence(bio)).toBe('Fey / Wood Nymph');
    });
});

describe('getCardLibraryBlurb', () => {
    it('keeps the full appearance and personality for the tall library row', () => {
        const bio = [
            'Species: Bound dwarven forge spirit and ancestral stone warden.',
            'Body: Concealed within the hollow subterranean void of a mountain.',
            'Personality: Stern, loyal, and slow to trust strangers.',
        ].join('\n');
        const blurb = getCardLibraryBlurb(bio);
        expect(blurb).toContain('Bound dwarven forge spirit and ancestral stone warden.');
        expect(blurb).toContain('Concealed within the hollow subterranean void');
        expect(blurb).toContain('Stern, loyal, and slow to trust strangers.');
    });
});
