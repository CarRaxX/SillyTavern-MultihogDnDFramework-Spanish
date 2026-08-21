import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RT_PROMPTS } from '../constants.js';

const RULE = "- Simulate every NPC's actions each round; never {{user}}'s actions. Use spells and abilities intelligently, not just cantrips.";

describe('combat flow prompt guidance', () => {
    it('ships intelligent NPC spell and ability use in every prompt source', () => {
        for (const filename of ['sysprompt.txt', 'sysprompt_legacy.txt']) {
            expect(readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8')).toContain(RULE);
            expect(RT_PROMPTS[filename]).toContain(RULE);
        }
    });
});
