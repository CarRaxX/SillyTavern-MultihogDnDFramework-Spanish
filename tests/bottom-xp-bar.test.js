import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testExtensionSettings } from './setup.js';

vi.mock('../portrait-storage.js', () => ({
    lookupCustomPortraitSrc: () => '',
}));

import { getSettings } from '../state-manager.js';
import { renderBottomXpBar, renderMemoAsCards, renderTabModeView } from '../renderer.js';

const memo = `[XP]
Total: 1,200 / 2,700 XP (Level 3)
[/XP]

[TIME]
08:00 AM, Day 2
[/TIME]`;

beforeEach(() => {
    for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
    localStorage.clear();
});

describe('bottom XP bar', () => {
    it('reuses the normal XP row markup and animation attributes', () => {
        const html = renderBottomXpBar(memo);

        expect(html).toContain('class="rt-bottom-xp-content"');
        expect(html).toContain('class="rt-xp-row"');
        expect(html).toContain('data-xp-current="1200"');
        expect(html).toContain('data-xp-max="2700"');
        expect(html).toContain('data-xp-level="3"');
        expect(html).toContain('XP: <span class="rt-xp-current">1,200</span>');
    });

    it('removes the regular XP card and tab only while bottom mode is enabled', () => {
        const settings = getSettings();
        settings.blockOrder = ['XP', 'TIME'];
        expect(settings.xpBarAtBottom).toBe(true);
        settings.xpBarAtBottom = true;

        const stacked = renderMemoAsCards(memo, null, {});
        const tabs = renderTabModeView(memo, {}, null);
        expect(stacked).not.toContain('data-tag="XP"');
        expect(tabs).not.toContain('data-tag="XP"');
        expect(stacked).toContain('data-tag="TIME"');

        settings.xpBarAtBottom = false;
        expect(renderMemoAsCards(memo, null, {})).toContain('data-tag="XP"');
    });
});
