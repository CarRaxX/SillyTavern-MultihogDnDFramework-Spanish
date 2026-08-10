import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeGmContent, unwrapManagedSectionContent } from '../src/state/sysprompt-content.js';
import { RT_PROMPTS } from '../constants.js';

describe('system-prompt section content normalization', () => {
    const tag = 'homebrew_and_custom_classes';
    const corrupted = `<homebrew_and_custom_classes>
<homebrew_and_custom_classes>
<homebrew_and_custom_classes>
Non-standard/homebrew classes use thematic BAB progression.
</homebrew_and_custom_classes>
test
</homebrew_and_custom_classes>
test
</homebrew_and_custom_classes>`;

    it('repairs repeated editor wrappers without losing appended instructions', () => {
        expect(normalizeGmContent(tag, corrupted)).toBe(`<homebrew_and_custom_classes>
Non-standard/homebrew classes use thematic BAB progression.
test
test
</homebrew_and_custom_classes>`);
    });

    it('is idempotent across repeated saves', () => {
        const normalized = normalizeGmContent(tag, corrupted);
        expect(normalizeGmContent(tag, normalized)).toBe(normalized);
    });

    it('presents only the editable body when the outer tag is managed', () => {
        expect(unwrapManagedSectionContent(tag, `<${tag}>\nAdd one rule.\n</${tag}>`)).toBe('Add one rule.');
    });

    it('requires a new action after an out-of-range attack attempt', () => {
        const expectedBlock = `<spatial_and_entity_constraints>
Out-of-range attack attempt → note {{user}} couldn't attack due to range; ask for another action. Max active [PARTY] size = 5 + {{user}} (no more added); cap doesn't apply to [BENCHED PARTY].
</spatial_and_entity_constraints>`;
        const sources = [
            RT_PROMPTS['sysprompt.txt'],
            RT_PROMPTS['sysprompt_legacy.txt'],
            readFileSync(new URL('../sysprompt.txt', import.meta.url), 'utf8'),
            readFileSync(new URL('../sysprompt_legacy.txt', import.meta.url), 'utf8'),
        ];

        for (const source of sources) expect(source.replaceAll('\r\n', '\n')).toContain(expectedBlock);
    });

    it('spells out damage types in every shipped combat prompt example', () => {
        const sources = [
            readFileSync(new URL('../constants.js', import.meta.url), 'utf8'),
            readFileSync(new URL('../index.js', import.meta.url), 'utf8'),
            readFileSync(new URL('../sysprompt.txt', import.meta.url), 'utf8'),
            readFileSync(new URL('../sysprompt_legacy.txt', import.meta.url), 'utf8'),
        ];
        const abbreviatedDamage = /\b\d+d\d+(?:[+-]\d+)?\s*[BPS]\b/i;

        for (const source of sources) expect(source).not.toMatch(abbreviatedDamage);
    });
});
