import { describe, expect, it } from 'vitest';
import {
    bookBelongsToPrefix,
    findCloneDestinationCollisions,
    plannedCloneDestinations,
    renameBookForPrefix,
} from '../src/features/chat/clone-campaign-stack-utils.js';

describe('bookBelongsToPrefix', () => {
    it('matches exact prefix and single-token suffix books', () => {
        expect(bookBelongsToPrefix('Eldoria', 'Eldoria')).toBe(true);
        expect(bookBelongsToPrefix('Eldoria_NPCs', 'Eldoria')).toBe(true);
        expect(bookBelongsToPrefix('Eldoria_World_Chronicle', 'Eldoria')).toBe(false);
        expect(bookBelongsToPrefix('Other_NPCs', 'Eldoria')).toBe(false);
    });

    it('matches case-insensitively like the Lorebook Agent router', () => {
        expect(bookBelongsToPrefix('eldoria_NPCs', 'Eldoria')).toBe(true);
        expect(bookBelongsToPrefix('ELDORIA', 'eldoria')).toBe(true);
    });
});

describe('renameBookForPrefix', () => {
    it('renames root and category books under the new prefix', () => {
        expect(renameBookForPrefix('Eldoria', 'Eldoria', 'Eldoria_Branch')).toBe('Eldoria_Branch');
        expect(renameBookForPrefix('Eldoria', 'Eldoria_NPCs', 'Eldoria_Branch')).toBe('Eldoria_Branch_NPCs');
    });

    it('preserves suffix casing when the source prefix casing differs', () => {
        expect(renameBookForPrefix('eldoria', 'Eldoria_NPCs', 'Branch')).toBe('Branch_NPCs');
    });
});

describe('clone destination collision preflight', () => {
    it('plans destinations for every source book', () => {
        expect(plannedCloneDestinations(
            ['Eldoria', 'Eldoria_NPCs', 'Eldoria_Locations'],
            'Eldoria',
            'Branch',
        )).toEqual(['Branch', 'Branch_NPCs', 'Branch_Locations']);
    });

    it('detects existing destination books case-insensitively before any write', () => {
        const destinations = plannedCloneDestinations(
            ['Eldoria_NPCs', 'Eldoria_Locations'],
            'Eldoria',
            'Branch',
        );
        expect(findCloneDestinationCollisions(destinations, [
            'Other_NPCs',
            'branch_npcs',
            'Branch_Locations',
        ])).toEqual(['branch_npcs', 'Branch_Locations']);
    });

    it('returns no collisions when destinations are free', () => {
        const destinations = plannedCloneDestinations(['Eldoria_NPCs'], 'Eldoria', 'Fresh');
        expect(findCloneDestinationCollisions(destinations, ['Eldoria_NPCs', 'Other'])).toEqual([]);
    });
});
