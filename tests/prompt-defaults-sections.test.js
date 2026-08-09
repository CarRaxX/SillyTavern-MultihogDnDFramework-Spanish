import { describe, expect, it } from 'vitest';
import {
    buildBundledPromptsSnapshot,
    formatCoreSectionsSnapshot,
    getLivePromptCategoryBlocks,
    getSnapshotCategoryBlocks,
    PROMPT_DEFAULTS_CATEGORIES,
    resolveCoreSections,
} from '../src/state/factory-and-diff.js';
import { DEFAULT_NPC_SECTIONS, DEFAULT_PC_SECTIONS } from '../src/state/schema-sections.js';

describe('prompt-defaults Character Sheets category', () => {
    it('includes sections in PROMPT_DEFAULTS_CATEGORIES', () => {
        expect(PROMPT_DEFAULTS_CATEGORIES).toContain('sections');
    });

    it('ships Species/Body/Worn Equipment in the bundled sections snapshot', () => {
        const snap = buildBundledPromptsSnapshot();
        expect(snap.sections?.pcCoreSections).toContain('name: Species');
        expect(snap.sections?.pcCoreSections).toContain('name: Body');
        expect(snap.sections?.pcCoreSections).toContain('name: Worn Equipment');
        expect(snap.sections?.npcCoreSections).toContain('name: Species');
        expect(snap.sections?.npcCoreSections).toContain('name: Body');
        expect(snap.sections?.npcCoreSections).toContain('name: Worn Equipment');
        expect(snap.sections?.pcCoreSections).not.toContain('name: Appearance/Species');
        expect(snap.sections?.npcCoreSections).not.toContain('name: Appearance/Species');
    });

    it('fingerprints runtime narrative pacing tags, CYOA builder, and inject contract', () => {
        const snap = buildBundledPromptsSnapshot();
        expect(snap.sysprompt?.narrativePacingModes?.high_agency).toContain('<high_agency_mode_on>');
        expect(snap.sysprompt?.narrativePacingModes?.shorter_outputs).toContain('<output_length>');
        expect(snap.sysprompt?.narrativePacingModes?.downtime).toContain('<slice_of_life_mode_on>');
        expect(snap.sysprompt?.cyoaModeBlock).toContain('<CYOA_mode>');
        expect(snap.sysprompt?.cyoaModeBlock).not.toContain('USER-DEFINED: Use the exact complete choice text');
        expect(snap.sysprompt?.periodicContextInject).toContain('everyTurn: true');
        expect(snap.sysprompt?.periodicContextInject).toContain('CYOA_mode');
        const blocks = getSnapshotCategoryBlocks(snap, 'sysprompt');
        expect(blocks.some(b => b.label === 'narrative pacing: high_agency')).toBe(true);
        expect(blocks.some(b => b.label === 'CYOA mode (injected builder)')).toBe(true);
        expect(blocks.some(b => b.label === 'context inject contract (CYOA + pacing)')).toBe(true);
    });

    it('treats empty stored sections as matching shipped defaults for live impact badges', () => {
        const snap = buildBundledPromptsSnapshot();
        const live = getLivePromptCategoryBlocks({ npcCoreSections: [], pcCoreSections: [] }, 'sections');
        const shipped = getSnapshotCategoryBlocks(snap, 'sections');
        expect(live).toEqual(shipped);
    });

    it('resolveCoreSections falls back to defaults for empty arrays', () => {
        expect(resolveCoreSections([], DEFAULT_PC_SECTIONS)).toBe(DEFAULT_PC_SECTIONS);
        expect(resolveCoreSections(DEFAULT_PC_SECTIONS, DEFAULT_PC_SECTIONS)).toBe(DEFAULT_PC_SECTIONS);
    });

    it('formatCoreSectionsSnapshot is stable and includes descriptions', () => {
        const text = formatCoreSectionsSnapshot(DEFAULT_PC_SECTIONS);
        expect(text).toContain('id: sec_body');
        expect(text).toContain('Do NOT describe clothing, armor, or worn gear here');
        expect(text.split('---').length).toBeGreaterThan(1);
    });
});
