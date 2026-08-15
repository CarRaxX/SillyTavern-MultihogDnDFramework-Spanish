import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripCoreMarkersForNarrator } from '../src/state/router-utils.js';

const source = readFileSync(new URL('../narrative-hooks.js', import.meta.url), 'utf8');

describe('stripCoreMarkersForNarrator', () => {
    it('removes [CORE]/[/CORE] markers but keeps a blank line as demarcation', () => {
        const input = '[CORE]\nA massive, heavily-fortified armory maintained by Schwarzenegev.\n[/CORE]\n[Day 1, 08:28 AM] SchwarzeNEET acquires the handgun.';
        expect(stripCoreMarkersForNarrator(input)).toBe(
            'A massive, heavily-fortified armory maintained by Schwarzenegev.\n\n[Day 1, 08:28 AM] SchwarzeNEET acquires the handgun.'
        );
    });

    it('handles an inline [CORE]...[/CORE] block with no surrounding newlines (fresh FAC record)', () => {
        expect(stripCoreMarkersForNarrator('[CORE]Founded by ex-mercenaries forty years ago.[/CORE]'))
            .toBe('Founded by ex-mercenaries forty years ago.');
    });

    it('preserves structured NPC field lines inside the (now unwrapped) core block', () => {
        const input = '[CORE]\nSpecies: Human\nAppearance: Tall, scarred.\n[/CORE]\n[Day 1] Meets the party.';
        expect(stripCoreMarkersForNarrator(input)).toBe('Species: Human\nAppearance: Tall, scarred.\n\n[Day 1] Meets the party.');
    });

    it('leaves content untouched when there is no [CORE] block (QUEST/EVENT entries)', () => {
        const input = '[Day 1, 10:00] The party accepts the delivery quest.';
        expect(stripCoreMarkersForNarrator(input)).toBe(input);
    });

    it('hides [MAP] from ordinary narrator lore while retaining visible location history', () => {
        const input = '[CORE]A mapped crypt.[/CORE]\n[MAP]\nArea: Secret Reliquary\nA shade waits.\n[/MAP]\n[Day 1] The altar was scorched.';
        expect(stripCoreMarkersForNarrator(input)).toBe('A mapped crypt.\n\n[Day 1] The altar was scorched.');
    });

    it('passes through falsy input unchanged', () => {
        expect(stripCoreMarkersForNarrator('')).toBe('');
        expect(stripCoreMarkersForNarrator(null)).toBe(null);
    });
});

describe('buildInjectedEntryText (GM/narrator injection) strips CORE markers, router.js agent context does not', () => {
    it('narrative-hooks.js imports stripCoreMarkersForNarrator and applies it before injecting entry content to the narrator', () => {
        expect(source).toContain('stripCoreMarkersForNarrator');
        expect(source).toContain('let content = stripCoreMarkersForNarrator(substituteLoreMacros(entry.content || \'\'));');
    });

    it('the underlying entry.content passed in is never mutated — only a local display copy is stripped', () => {
        // buildInjectedEntryText must read from entry.content but never assign back to it.
        expect(source).not.toMatch(/entry\.content\s*=\s*stripCoreMarkersForNarrator/);
    });
});
