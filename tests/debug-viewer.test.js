import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const viewer = readFileSync(new URL('../debug-viewer.js', import.meta.url), 'utf8');
const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('Context Debugger', () => {
    it('collapses prompt and reply sections by default', () => {
        expect(viewer).toContain("class=\"rpg-debug-section-toggle");
        expect(viewer).toContain('rpg-debug-section-open');
        expect(viewer).toContain('expandedSections.has(key)');
        expect(viewer).toContain('rpg-debug-text-preview');
        expect(viewer).toContain('rpg-debug-expand-all');
        expect(viewer).toContain('rpg-debug-collapse-all');
        expect(viewer).toContain('PREVIEW_CHARS');
    });

    it('scrolls the overlay window instead of nested prompt boxes', () => {
        expect(style).toContain('#rpg-debug-viewer .rpg-debug-content');
        expect(style).toContain('overflow-y: scroll !important');
        expect(style).toContain('.rpg-debug-section:not(.rpg-debug-section-open) .rpg-debug-text');
        expect(style).toContain('overflow: visible !important');
        expect(style).toContain('max-height: none !important');
    });
});
