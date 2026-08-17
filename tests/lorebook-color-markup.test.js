import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    cleanMessageContent,
    sanitizeLorebookRecordContent,
    isStrippableBareBracketLine,
    repairJsonColorAttributes,
    parseJsonWithColorRepair,
} from '../memo-processor.js';
import { mergePreservedColorMarkup, restoreFontColorWraps } from '../src/state/router-utils.js';
import { LOREBOOK_FULL_AUDIT_INSTRUCTION } from '../src/state/module-instructions.js';

const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

describe('Lorebook Agent color markup', () => {
    it('cleanMessageContent keeps <font color> tags while stripping other HTML', () => {
        const cleaned = cleanMessageContent({
            mes: `<p><font color=#ff5555>Elara</font> draws a <b>blade</b>.</p>`,
        });
        expect(cleaned).toContain('<font color=#ff5555>Elara</font>');
        expect(cleaned).toContain('draws a blade');
        expect(cleaned).not.toContain('<p>');
        expect(cleaned).not.toContain('<b>');
    });

    it('cleanMessageContent still removes dungeon-map payloads', () => {
        const cleaned = cleanMessageContent({
            mes: `<font color=#a335ee>Marcus</font>
<div hidden data-dungeon-map>Secret Reliquary</div hidden>
The altar is scorched.`,
        });
        expect(cleaned).toContain('<font color=#a335ee>Marcus</font>');
        expect(cleaned).toContain('The altar is scorched.');
        expect(cleaned).not.toContain('Secret Reliquary');
    });

    it('sanitizeLorebookRecordContent keeps hex color and rarity tokens', () => {
        const kept = sanitizeLorebookRecordContent(`[CORE]
Color Code: [#ff5555]
[#a335ee]
[Epic]
Body: A tall elf
[/CORE]
[Day 1]`);
        expect(kept).toContain('[#ff5555]');
        expect(kept).toContain('[#a335ee]');
        expect(kept).toContain('[Epic]');
        expect(kept).toContain('Body: A tall elf');
        expect(kept).not.toMatch(/^\[Day 1\]$/m);
        expect(isStrippableBareBracketLine('[Day 1]')).toBe(true);
        expect(isStrippableBareBracketLine('[#ff5555]')).toBe(false);
        expect(isStrippableBareBracketLine('[Legendary]')).toBe(false);
    });

    it('repairs quoted font color attributes so tool-call JSON can parse', () => {
        const raw = '{"core":[{"id":"Elara","field":"Color Code","content":"<font color=\\"#ff5555\\">Elara</font>"}]}';
        expect(JSON.parse(raw).core[0].content).toContain('#ff5555');

        const broken = '{"core":[{"id":"Elara","field":"Color Code","content":"<font color="#ff5555">Elara</font>"}]}';
        expect(() => JSON.parse(broken)).toThrow();
        const repaired = repairJsonColorAttributes(broken);
        expect(repaired).toContain('<font color=#ff5555>');
        const parsed = parseJsonWithColorRepair(broken);
        expect(parsed.ok).toBe(true);
        expect(parsed.value.core[0].content).toBe('<font color=#ff5555>Elara</font>');
    });

    it('restores font wraps when Full Audit rewrites CORE as plain text', () => {
        const oldCore = `Species: Elf
Body: <font color=#ff5555>A tall red-haired elf</font>
Color Code: #ff5555
Personality: Calm`;
        const newCore = `Species: Elf
Body: A tall red-haired elf
Personality: Calm`;
        const merged = mergePreservedColorMarkup(oldCore, newCore, { extraHeaders: ['Color Code'] });
        expect(merged).toContain('<font color=#ff5555>A tall red-haired elf</font>');
        expect(merged).toContain('Color Code: #ff5555');
        expect(restoreFontColorWraps(
            '<font color=#0070dd>Marcus</font>',
            'Marcus draws steel',
        )).toContain('<font color=#0070dd>Marcus</font>');
    });

    it('Full Audit passes a preserve-color instruction into the Lorebook Agent', () => {
        expect(LOREBOOK_FULL_AUDIT_INSTRUCTION).toContain('<font color=#RRGGBB>');
        expect(indexSource).toContain('runRouterPass(null, LOREBOOK_FULL_AUDIT_INSTRUCTION, null, true, [], overrideChatLog)');
    });
});
