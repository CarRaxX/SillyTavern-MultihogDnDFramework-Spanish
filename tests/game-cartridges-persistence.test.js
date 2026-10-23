import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('../../../../script.js', () => ({
    getRequestHeaders: () => ({}),
}));
vi.mock('../../../utils.js', () => ({
    getSortableDelay: () => 0,
}));
vi.mock('../../../popup.js', () => ({
    POPUP_RESULT: { AFFIRMATIVE: 1, NEGATIVE: 0 },
}));

import {
    getSettings,
    buildDefaultSettings,
    applyDeletedCustomTagTombstones,
    recordDeletedCustomTags,
    syncChatSetupCatalogs,
    saveChatState,
} from '../state-manager.js';
import { loadCartridge, applyCartridgePayload } from '../game-cartridges.js';
import { createChatStateLoader } from '../src/features/chat/chat-state-loader.js';
import { runtimeState } from '../src/app/runtime-state.js';
import { configureRuntimeActions } from '../src/app/runtime-bridge.js';
import { testExtensionSettings } from './setup.js';

describe('Game Cartridges persistence & catalog synchronization', () => {
    beforeEach(() => {
        globalThis.localStorage.clear();
        globalThis.toastr = {
            success: () => {},
            info: () => {},
            warning: () => {},
            error: () => {},
        };
        const makeJQueryDummy = () => new Proxy({}, {
            get: () => () => makeJQueryDummy(),
        });
        globalThis.$ = () => makeJQueryDummy();
        globalThis.document = {
            getElementById: () => null,
            querySelectorAll: () => [],
        };
        for (const key of Object.keys(testExtensionSettings)) {
            delete testExtensionSettings[key];
        }
        Object.assign(testExtensionSettings, buildDefaultSettings());
        runtimeState.currentChatId = 'test-cartridge-chat';

        configureRuntimeActions({
            saveSettings: () => {},
            refreshRenderedView: () => {},
            autoApplySysprompt: async () => {},
            syncMemoView: () => {},
        });

        const ctx = SillyTavern.getContext();
        globalThis.SillyTavern.getContext = () => ({
            ...ctx,
            Popup: {
                show: {
                    confirm: async () => 1,
                },
            },
        });
    });

    it('clears deleted-custom-tag tombstones from localStorage when loading a cartridge', async () => {
        // Simular que ARCANE_CORE fue borrado previamente y tiene lápida en localStorage
        recordDeletedCustomTags(['ARCANE_CORE']);
        expect(JSON.parse(globalThis.localStorage.getItem('rpg_tracker_deleted_custom_tags'))).toContain('ARCANE_CORE');

        const cartridge = {
            id: 'cart-1',
            name: 'Prisma Álmico',
            payload: {
                modules: { character: true, combat: true, inventory: true },
                blockOrder: ['CHARACTER', 'ARCANE_CORE', 'INVENTORY', 'COMBAT'],
                customFields: [
                    { tag: 'ARCANE_CORE', label: 'Prisma Álmico', enabled: true, scope: 'chat' },
                ],
            },
        };

        // Simular popup confirmando carga
        globalThis.SillyTavern.getContext().Popup = {
            show: {
                confirm: async () => 1,
            },
        };

        await loadCartridge(cartridge);

        // La lápida de ARCANE_CORE debe haber sido eliminada de localStorage
        const tombstones = globalThis.localStorage.getItem('rpg_tracker_deleted_custom_tags');
        expect(tombstones).toBeNull();

        // En el arranque, applyDeletedCustomTagTombstones() no debe borrar ARCANE_CORE
        const s = getSettings();
        const changed = applyDeletedCustomTagTombstones();
        expect(changed).toBe(false);
        expect(s.customFields.some(f => f.tag === 'ARCANE_CORE')).toBe(true);
        expect(s.blockOrder).toContain('ARCANE_CORE');
    });

    it('synchronizes trackerModuleDatabase so custom fields persist in catalog', async () => {
        const cartridge = {
            id: 'cart-2',
            name: 'Mundo Mágico',
            payload: {
                customFields: [
                    { tag: 'MANA', label: 'Reserva de Maná', enabled: true, scope: 'chat' },
                ],
            },
        };

        globalThis.SillyTavern.getContext().Popup = {
            show: { confirm: async () => 1 },
        };

        await loadCartridge(cartridge);

        const s = getSettings();
        expect(s.trackerModuleDatabase.some(f => f.tag === 'MANA')).toBe(true);
    });

    it('snapshots cartridge setup into active chat partition under chatSetupLinkEnabled', async () => {
        const s = getSettings();
        s.chatLinkEnabled = true;
        s.chatSetupLinkEnabled = true;
        runtimeState.currentChatId = 'campaña-activa';

        const cartridge = {
            id: 'cart-3',
            name: 'Aventura Oscura',
            payload: {
                modules: { character: true, combat: false, inventory: true, quests: true },
                blockOrder: ['CHARACTER', 'SANITY', 'INVENTORY', 'QUESTS'],
                customFields: [
                    { tag: 'SANITY', label: 'Cordura', enabled: true, scope: 'chat' },
                ],
            },
        };

        globalThis.SillyTavern.getContext().Popup = {
            show: { confirm: async () => 1 },
        };

        await loadCartridge(cartridge);

        // La partición de chatStates debe contener el setup actualizado del cartucho
        const chatPartition = s.chatStates?.['campaña-activa'];
        expect(chatPartition).toBeDefined();
        expect(chatPartition.setup).toBeDefined();
        expect(chatPartition.setup.customFieldStates?.SANITY).toBe(true);
        expect(chatPartition.setup.blockOrder).toEqual(['CHARACTER', 'SANITY', 'INVENTORY', 'QUESTS']);
        expect(chatPartition.setup.modules?.combat).toBe(false);
    });

    it('survives simulated F5 / reboot without losing custom modules or reverting to factory stock', async () => {
        const s = getSettings();
        s.chatLinkEnabled = true;
        s.chatSetupLinkEnabled = true;
        const chatId = 'reboot-test-chat';
        runtimeState.currentChatId = chatId;

        // Cargar cartucho con ARCANE_CORE
        const cartridge = {
            id: 'cart-prisma',
            name: 'Prisma Álmico',
            payload: {
                modules: { character: true, inventory: true, combat: true, spells: false, abilities: false },
                blockOrder: ['CHARACTER', 'ARCANE_CORE', 'INVENTORY', 'COMBAT'],
                customFields: [
                    { tag: 'ARCANE_CORE', label: 'Prisma Álmico', enabled: true, scope: 'chat' },
                ],
            },
        };

        globalThis.SillyTavern.getContext().Popup = {
            show: { confirm: async () => 1 },
        };

        await loadCartridge(cartridge);

        // Simular ciclo de inicio / reboot:
        // 1. Ejecutar applyDeletedCustomTagTombstones()
        const tombstoneWipe = applyDeletedCustomTagTombstones();
        expect(tombstoneWipe).toBe(false);

        // 2. Ejecutar loadChatState() como hace index.js en el arranque
        const loadChatState = createChatStateLoader({
            applyChatNpcRelMaxSettings: () => {},
            applyChatTimeFormatSettings: () => {},
            applyQuestSyncAndStripMemo: m => m,
            disableManagedEntries: async () => {},
            extractCurrentTimeStr: () => '',
            formatInWorldTime: () => '',
            getSettings,
            hydrateImmersionSceneArtPath: () => {},
            isAgentPanelVisible: () => false,
            loadStockPromptsFromProfile: p => p,
            parseInWorldTime: () => ({}),
            refreshOrderList: () => {},
            resetAutoGenerationTracking: () => {},
            sanitizeRouterState: () => {},
            scheduleAgentManifestRefresh: () => {},
            scheduleAutoApply: () => {},
            scheduleDeferred: fn => fn(),
            syncLocationImageDependentUi: () => {},
            syncMemoView: () => {},
            syncNpcPortraitDependentUi: () => {},
        });

        const restored = loadChatState(chatId);
        expect(restored).toBe(true);

        // Verificar que ARCANE_CORE sigue vivo y activo
        expect(s.customFields.some(f => f.tag === 'ARCANE_CORE' && f.enabled)).toBe(true);
        expect(s.blockOrder).toEqual(['CHARACTER', 'ARCANE_CORE', 'INVENTORY', 'COMBAT']);
        expect(s.modules.spells).toBe(false);
        expect(s.modules.abilities).toBe(false);
    });

    it('applyCartridgePayload cleans tombstones and syncs catalogs', () => {
        recordDeletedCustomTags(['ANIMA']);
        const s = getSettings();

        applyCartridgePayload(s, {
            customFields: [{ tag: 'ANIMA', label: 'Ánima', enabled: true, scope: 'chat' }],
        });

        expect(globalThis.localStorage.getItem('rpg_tracker_deleted_custom_tags')).toBeNull();
        expect(s.trackerModuleDatabase.some(f => f.tag === 'ANIMA')).toBe(true);
        expect(s.customFields.some(f => f.tag === 'ANIMA')).toBe(true);
    });

    it('importModulesFromJson synchronizes catalogs and active chat partition', async () => {
        const s = getSettings();
        s.chatLinkEnabled = true;
        s.chatSetupLinkEnabled = true;
        runtimeState.currentChatId = 'import-json-chat';

        const jsonString = JSON.stringify({
            format: 'multihog-custom-module',
            modules: [
                { tag: 'ESTIGMA', label: 'Estigma Demoníaco', prompt: 'Rastrea estigmas', icon: '👁️' },
            ],
        });

        const { importModulesFromJson } = await import('../ui-editors.js');
        await importModulesFromJson(jsonString);

        expect(s.trackerModuleDatabase.some(f => f.tag === 'ESTIGMA')).toBe(true);
        const chatPartition = s.chatStates?.['import-json-chat'];
        expect(chatPartition?.setup?.customFieldStates?.ESTIGMA).toBe(true);
        expect(chatPartition?.setup?.blockOrder).toContain('ESTIGMA');
    });
});
