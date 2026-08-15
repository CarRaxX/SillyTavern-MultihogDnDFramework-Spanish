import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sanitizeRouterState, computeUnpinnedActiveCount } from '../src/state/router-utils.js';

const routerSource = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
const panelBuilderSource = readFileSync(new URL('../src/ui/panel/panel-builder.js', import.meta.url), 'utf8');
const panelRouterSource = readFileSync(new URL('../src/ui/panel/panel-router-view.js', import.meta.url), 'utf8');
const defaultsSource = readFileSync(new URL('../src/state/defaults.js', import.meta.url), 'utf8');

describe('pinnedRouterKeys sanitize + budget helper', () => {
    it('defaults pinnedRouterKeys to an empty array', () => {
        expect(defaultsSource).toContain('pinnedRouterKeys: []');
    });

    it('sanitizeRouterState keeps valid pinned ids and drops malformed ones', () => {
        const s = {
            pinnedRouterKeys: ['Campaign_NPCs::12', 'bad', null, 'Also_Good::3'],
            activeRouterKeys: ['Campaign_NPCs::12'],
        };
        sanitizeRouterState(s);
        expect(s.pinnedRouterKeys).toEqual(['Campaign_NPCs::12', 'Also_Good::3']);
    });

    it('sanitizeRouterState initializes pinnedRouterKeys when missing', () => {
        const s = { activeRouterKeys: [] };
        sanitizeRouterState(s);
        expect(s.pinnedRouterKeys).toEqual([]);
    });

    it('computeUnpinnedActiveCount excludes pinned ids from the budget', () => {
        expect(computeUnpinnedActiveCount(
            ['A::1', 'B::2', 'C::3'],
            ['B::2']
        )).toBe(2);
        expect(computeUnpinnedActiveCount(['A::1'], [])).toBe(1);
        expect(computeUnpinnedActiveCount(null, ['A::1'])).toBe(0);
        expect(computeUnpinnedActiveCount(['A::1', 'B::2'], ['A::1', 'B::2'])).toBe(0);
    });
});

describe('router.js pin enforcement', () => {
    it('exports setLorebookEntryPinned and uses it to activate on pin', () => {
        expect(routerSource).toContain('export function setLorebookEntryPinned(id, pinned)');
        expect(routerSource).toContain('// Pin implies active');
    });

    it('getLorebookManifest exposes is_pinned and reconciles pinned into active pools', () => {
        expect(routerSource).toContain('is_pinned: pinnedSet.has(id)');
        expect(routerSource).toContain('// Reconcile pinned entries into the active pools');
    });

    it('applyAction silently ignores deactivate for pinned entries', () => {
        expect(routerSource).toContain('// Remove deactivations — pinned entries are immune (silent no-op)');
        expect(routerSource).toContain('newActive = newActive.filter(k => !deactivate.includes(k) || pinnedSet.has(k));');
        expect(routerSource).toContain('newWorldActive = newWorldActive.filter(k => !deactivate.includes(k) || pinnedSet.has(k));');
    });

    it('budget accounting excludes the location-owned active map root', () => {
        expect(routerSource).toContain("const budgetActiveKeys = (settings.activeRouterKeys || []).filter(id => id !== activeDungeonEntryId);");
        expect(routerSource).toContain('computeUnpinnedActiveCount(budgetActiveKeys, settings.pinnedRouterKeys)');
        expect(routerSource).toContain('Active entries: ${activeCount} / ${maxActive}');
    });

    it('keyword auto-expire and overflow eviction skip pinned ids', () => {
        expect(routerSource).toContain('if (pinnedSet.has(id)) continue; // user-pinned entries never auto-expire');
        expect(routerSource).toContain('if (pinnedSet.has(id)) continue; // never evict user-pinned entries');
    });

    it('delete/consolidate paths strip pinnedRouterKeys', () => {
        expect(routerSource).toContain('settings.pinnedRouterKeys = settings.pinnedRouterKeys.filter(k => k !== id);');
        expect(routerSource).toMatch(/settings\.pinnedRouterKeys\s*=\s*\(settings\.pinnedRouterKeys\s*\|\|\s*\[\]\)\s*\n?\s*\.filter\(k\s*=>\s*k\s*!==\s*targetId\)/);
    });
});

describe('Lorebook Agent pin UI wiring', () => {
    it('tree entry header includes a thumbtack pin button and green status for pinned', () => {
        expect(panelBuilderSource).toContain('rt-agent-entry-pin');
        expect(panelBuilderSource).toContain('fa-thumbtack');
        expect(panelBuilderSource).toContain("? '#34a853'");
        expect(panelBuilderSource).toContain("? 'Pinned — always active'");
        expect(panelBuilderSource).toContain('setLorebookEntryPinned(item.id, nextPinned)');
    });

    it('NPC card grid includes a pin action and pinned status badge', () => {
        expect(panelBuilderSource).toContain('rt-npc-pin');
        expect(panelBuilderSource).toContain('📌 Pinned');
    });

    it('Active Lore Keys pills color pinned entries green and expose Unpin instead of Deactivate', () => {
        expect(panelRouterSource).toContain('rt-router-unpin-key');
        expect(panelRouterSource).toContain('📌 Pinned — always active');
        expect(panelRouterSource).toContain("title=\"Unpin\"");
        expect(panelRouterSource).toContain('setLorebookEntryPinned(key, false)');
        expect(panelRouterSource).toContain('rgba(52, 168, 83, 0.65)');
    });
});
