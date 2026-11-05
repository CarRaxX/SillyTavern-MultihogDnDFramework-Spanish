import { beforeEach, describe, expect, it } from 'vitest';
import { getSettings, saveChatState } from '../state-manager.js';
import {
    CHAT_STATE_INACTIVITY_DAYS,
    CHAT_STATE_MIN_RETAINED,
    inactiveChatStateIds,
    pruneInactiveChatStates,
} from '../src/state/history-retention.js';
import { migrateCustomFields } from '../src/state/settings.js';
import { MODULE_NAME } from '../src/state/schema-sections.js';
import { testExtensionSettings } from './setup.js';

// Spec 2026-11-05 (D4): `chatStates` ocupa 532 KB de chats cerrados hace meses. Esta
// ola sólo ESTAMPA la última vez que se usa cada partición; la poda queda escrita y
// probada, pero sin activar (decisión del operador).
const DIA = 24 * 60 * 60 * 1000;

describe('Estampa de actividad en saveChatState', () => {
    beforeEach(() => {
        for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
    });

    it('anota lastSeenAt al guardar la partición normal', () => {
        const s = getSettings();
        s.memoHistory = [];
        s.chatStates = {};
        const antes = Date.now();
        saveChatState('campaña-viva', { skipDiskWrite: true });
        const estampa = s.chatStates['campaña-viva'].lastSeenAt;
        expect(Number.isFinite(estampa)).toBe(true);
        expect(estampa).toBeGreaterThanOrEqual(antes);
        expect(estampa).toBeLessThanOrEqual(Date.now());
    });

    it('refresca la estampa en cada guardado', () => {
        const s = getSettings();
        s.memoHistory = [];
        s.chatStates = { 'campaña-viva': { lastSeenAt: Date.now() - 400 * DIA } };
        saveChatState('campaña-viva', { skipDiskWrite: true });
        expect(s.chatStates['campaña-viva'].lastSeenAt).toBeGreaterThan(Date.now() - DIA);
    });
});

describe('Poda de chatStates inactivos (implementada, sin activar)', () => {
    const particion = (ultimoUso) => ({ lastSeenAt: ultimoUso, currentMemo: 'estado' });
    const ahora = 1_800_000_000_000;
    const settingsCon = usos => ({
        chatStates: Object.fromEntries(Object.entries(usos).map(([id, dias]) => [id, particion(ahora - dias * DIA)])),
    });

    it('no poda lo que no tiene prueba de actividad', () => {
        const settings = { chatStates: { 'sin-estampa': { currentMemo: 'viejísimo' }, 'con-estampa': particion(ahora - 400 * DIA) } };
        expect(inactiveChatStateIds(settings.chatStates, { ahora })).toEqual(['con-estampa']);
        // Sin estampa no se puede probar inactividad: se conserva.
        expect(pruneInactiveChatStates({ chatStates: { viejo: { currentMemo: 'x' } } }, { ahora, minimoConservar: 0 }))
            .toEqual([]);
    });

    it('lista sólo los que superan el umbral, del más antiguo al más nuevo', () => {
        const settings = settingsCon({ A: 400, B: 10, C: 200, D: CHAT_STATE_INACTIVITY_DAYS });
        expect(inactiveChatStateIds(settings.chatStates, { ahora })).toEqual(['A', 'C']);
    });

    it('respeta el chat activo y el mínimo de particiones conservadas', () => {
        const settings = settingsCon({ A: 400, B: 300, C: 200, ACTIVO: 400 });
        expect(pruneInactiveChatStates(settings, { ahora, chatIdActivo: 'ACTIVO' })).toEqual([]);
        // Con el mínimo bajado se van los inactivos menos el activo, por antigüedad.
        const podados = pruneInactiveChatStates(settings, { ahora, chatIdActivo: 'ACTIVO', minimoConservar: 1 });
        expect(podados).toEqual(['A', 'B', 'C']);
        expect(Object.keys(settings.chatStates)).toEqual(['ACTIVO']);
    });

    it('no poda nada si eso bajaría del mínimo conservado', () => {
        const settings = settingsCon({ A: 400, B: 400, C: 400 });
        expect(pruneInactiveChatStates(settings, { ahora, minimoConservar: CHAT_STATE_MIN_RETAINED })).toEqual([]);
        expect(Object.keys(settings.chatStates)).toHaveLength(3);
    });

    it('el flujo de arranque NO poda: migrateCustomFields deja los chatStates intactos', () => {
        const settings = settingsCon({ A: 900, B: 800, C: 700, ACTIVO: 1 });
        globalThis.SillyTavern = { getContext: () => ({ extensionSettings: { [MODULE_NAME]: settings } }) };
        try {
            migrateCustomFields();
            // D4 aplazado: la poda existe en código pero nadie la llama; los chats
            // cerrados hace meses siguen en su sitio.
            expect(Object.keys(settings.chatStates).sort()).toEqual(['A', 'ACTIVO', 'B', 'C']);
        } finally {
            delete globalThis.SillyTavern;
        }
    });

    it('ninguna ruta de producción llama a pruneInactiveChatStates', async () => {
        // Salvaguardia del aplazamiento: si alguien la activa en el futuro, este test
        // debe borrarse a propósito y con decisión del operador.
        const modulos = await Promise.all([
            import('../src/state/settings.js?raw'),
            import('../src/state/chat-persistence.js?raw'),
            import('../index.js?raw'),
            import('../router.js?raw'),
        ]);
        for (const modulo of modulos) {
            expect(modulo.default).not.toMatch(/pruneInactiveChatStates\s*\(/);
        }
    });
});
