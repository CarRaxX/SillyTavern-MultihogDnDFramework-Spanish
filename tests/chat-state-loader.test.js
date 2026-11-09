import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createChatStateLoader } from '../src/features/chat/chat-state-loader.js';
import { getSettings } from '../src/state/settings.js';
import { MODULE_NAME } from '../src/state/schema-sections.js';
import { testExtensionSettings } from './setup.js';

describe('chat state loader', () => {
    it('returns a callable loader function', () => {
        expect(typeof createChatStateLoader({})).toBe('function');
    });

    it('re-probes the mapped site after a chat load even if Lorebook Agent is closed', () => {
        const source = readFileSync(new URL('../src/features/chat/chat-state-loader.js', import.meta.url), 'utf8');
        expect(source).toContain('runtimeState.refreshImmersionView');
    });

    it('restores per-chat relationship maps when the partition has them', () => {
        const source = readFileSync(new URL('../src/features/chat/chat-state-loader.js', import.meta.url), 'utf8');
        expect(source).toContain('s.npcRelationshipValues = JSON.parse(JSON.stringify(saved.npcRelationshipValues || {}))');
        expect(source).toContain('s.npcRelationshipLog = JSON.parse(JSON.stringify(saved.npcRelationshipLog || {}))');
        expect(source).toContain("hasOwnProperty.call(saved, 'npcRelationshipValues')");
        expect(source).toContain("hasOwnProperty.call(saved, 'npcRelationshipLog')");
    });

    it('restores Map Updater exit bookkeeping from the active chat partition', () => {
        const source = readFileSync(new URL('../src/features/chat/chat-state-loader.js', import.meta.url), 'utf8');
        expect(source).toContain("s.mapUpdaterLastSiteRoot = saved.mapUpdaterLastSiteRoot || ''");
        expect(source).toContain("s.mapUpdaterPendingExitRoot = saved.mapUpdaterPendingExitRoot || ''");
    });
});

// Oleada 8 (D-37/D-40): los techos de expediente y de contexto global son preferencia
// GLOBAL del motor y el cargador no puede restaurarlos desde la partición del chat.
// Este describe EJECUTA el cargador real (a diferencia de los cuatro it() de texto de
// arriba), según el patrón probado de tests/visualization-persistence.test.js:57-83.
describe('chat state loader: techos globales que Chat Link no pisa (Oleada 8)', () => {
    /**
     * Arnés con `$` de memoria (D-40): cada selector devuelve una cadena de métodos
     * que se devuelve a sí misma y `.val(v)` con un argumento anota lo pintado en
     * `painted[selector]`. El Proxy que lo traga todo del arnés original no vale aquí:
     * AC-3 necesita leer el valor pintado. Ajustes vivos de partida: 10000 / 8000.
     */
    function harness() {
        const painted = {};
        const chainFor = (selector) => {
            const chain = () => chain;
            chain.val = (...args) => { if (args.length === 1) painted[selector] = args[0]; return chain; };
            for (const method of ['prop', 'toggle', 'css', 'find', 'text', 'show', 'hide']) {
                chain[method] = () => chain;
            }
            return chain;
        };
        vi.stubGlobal('$', (selector) => chainFor(String(selector)));
        vi.stubGlobal('document', { getElementById: () => null });
        const deps = Object.fromEntries([
            'applyChatNpcRelMaxSettings', 'applyChatTimeFormatSettings', 'hydrateImmersionSceneArtPath',
            'refreshOrderList', 'resetAutoGenerationTracking', 'sanitizeRouterState',
            'scheduleAgentManifestRefresh', 'scheduleAutoApply', 'scheduleDeferred', 'syncMemoView',
            'syncLocationImageDependentUi', 'syncNpcPortraitDependentUi',
        ].map(name => [name, () => {}]));
        const load = createChatStateLoader({ ...deps, getSettings,
            applyQuestSyncAndStripMemo: memo => memo, isAgentPanelVisible: () => false,
            loadStockPromptsFromProfile: value => value,
        });
        const s = getSettings();
        Object.assign(s, { worldProgressionDossierMaxChars: 10000, worldProgressionGlobalMaxChars: 8000 });
        return { s, load, painted };
    }

    afterEach(() => {
        delete testExtensionSettings[MODULE_NAME];
        vi.unstubAllGlobals();
    });

    it('AC-1: a snapshot without the ceilings leaves the live 10000/8000 untouched', () => {
        // Snapshot como los doce del servidor: partición anterior a la Oleada 6a, sin las claves.
        const { s, load } = harness();
        s.chatStates = { A: { currentMemo: 'A' } };
        expect(load('A')).toBe(true);
        expect(getSettings().worldProgressionDossierMaxChars).toBe(10000);
        expect(getSettings().worldProgressionGlobalMaxChars).toBe(8000);
    });

    it('AC-2: a snapshot poisoned with per-chat ceilings is still not restored', () => {
        const { s, load } = harness();
        s.chatStates = { B: { currentMemo: 'B', worldProgressionDossierMaxChars: 12345, worldProgressionGlobalMaxChars: 9999 } };
        expect(load('B')).toBe(true);
        expect(getSettings().worldProgressionDossierMaxChars).toBe(10000);
        expect(getSettings().worldProgressionGlobalMaxChars).toBe(8000);
        // El cargador no escribe en `saved`: la partición conserva sus claves espurias.
        expect(getSettings().chatStates.B.worldProgressionDossierMaxChars).toBe(12345);
        expect(getSettings().chatStates.B.worldProgressionGlobalMaxChars).toBe(9999);
    });

    it('AC-3: the drawer paints the live settings, never the partition nor the defaults', () => {
        const { s, load, painted } = harness();
        s.chatStates = { B: { currentMemo: 'B', worldProgressionDossierMaxChars: 12345, worldProgressionGlobalMaxChars: 9999 } };
        expect(load('B')).toBe(true);
        // Ni 12345/9999 (partición) ni 20000/12000 (defaults del ?? del pintado).
        expect(painted['#rpg_world_progression_dossier_max_chars']).toBe(10000);
        expect(painted['#rpg_world_progression_global_max_chars']).toBe(8000);
    });

    it('AC-4: saveChatState never captures the ceilings — anti-relapse lock on source text', () => {
        const source = readFileSync(new URL('../src/state/chat-persistence.js', import.meta.url), 'utf8');
        expect(source).not.toContain('worldProgressionDossierMaxChars');
        expect(source).not.toContain('worldProgressionGlobalMaxChars');
    });
});
