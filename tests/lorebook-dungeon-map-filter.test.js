import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanMessageContent } from '../memo-processor.js';

describe('Lorebook Agent dungeon-map filtering', () => {
    it('removes private map payloads while preserving visible narration', () => {
        const cleaned = cleanMessageContent({
            mes: `The chamber smells of dust.
<div hidden data-dungeon-map>
Dungeon Site: Varnholde Crypts
Area: Secret Reliquary
A shade guards an undiscovered key.
</div hidden>
The altar is visibly scorched.`,
        });

        expect(cleaned).toContain('The chamber smells of dust.');
        expect(cleaned).toContain('The altar is visibly scorched.');
        expect(cleaned).not.toContain('Secret Reliquary');
        expect(cleaned).not.toContain('undiscovered key');
    });

    it('provides [MAP] through active lore rather than duplicate transcript text', () => {
        const routerSource = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
        const hookSource = readFileSync(new URL('../narrative-hooks.js', import.meta.url), 'utf8');
        const immersionSource = readFileSync(new URL('../immersion.js', import.meta.url), 'utf8');
        const defaultsSource = readFileSync(new URL('../src/state/defaults.js', import.meta.url), 'utf8');
        expect(routerSource).toContain('fullId !== activeDungeonEntryId');
        expect(routerSource).toContain('buildDungeonMapCommitSchema()');
        expect(routerSource).toContain("name: 'inspect_map'");
        expect(routerSource).toContain("name: 'list_map_assets'");
        expect(routerSource).toContain('Invalid JSON/map operation, nudging model');
        expect(hookSource).toContain('syncDungeonLoreAgentActivation');
        expect(hookSource).toContain('stripDungeonRealityBlocksFromPrompt');
        expect(routerSource).toContain('const dungeonRealityEnabled = isEffectiveSectionEnabled');
        expect(immersionSource).toContain("isEffectiveSectionEnabled('dungeon_reality_and_hidden_mapping', s)");
        expect(defaultsSource).toContain('private \\`[MAP]...[/MAP]\\`');
        expect(defaultsSource).toContain('identify exactly which mapped creature, trap, object, or area');
        expect(routerSource).toContain('DUNGEON_MAP_TRANSIENT_COMBAT_RULE');
        expect(routerSource).toContain('Never write transient combat into asset.detail or chronicles');
        expect(routerSource).toContain('objective CURRENT occupancy snapshot');
        expect(routerSource).toContain('If only poses/status changed this round, omit the map transaction.');
    });
});
