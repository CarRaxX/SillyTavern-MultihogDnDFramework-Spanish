import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RT_PROMPTS } from '../constants.js';

const RULE = "Multi-die damage: use the current line's matching die, then that label from successive lines, consuming each (2d8 = current d8 + next d8).";
const BLOCK_START = `<rng_system>
- [RNG_QUEUE v7.0] is the sole RNG mechanic — internal physics, never revealed or explained.
<rng_queue_instructions>
- Pop lines in order (1, 2, 3...). Each line has labeled dice (d20=, d4=, d6=, d8=, d10=, d12=). Queue length 12, wraps back to start on exhaustion.`;
const normalizeEol = (text) => String(text || '').replace(/\r\n/g, '\n');

describe('RNG queue multi-die damage guidance', () => {
    it('ships the concise rule in modern and legacy prompt sources', () => {
        for (const filename of ['sysprompt.txt', 'sysprompt_legacy.txt']) {
            const standalone = normalizeEol(readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8'));
            const bundled = normalizeEol(RT_PROMPTS[filename]);
            expect(standalone).toContain(BLOCK_START);
            expect(standalone).toContain(RULE);
            expect(bundled).toContain(BLOCK_START);
            expect(bundled).toContain(RULE);
        }
    });
});
