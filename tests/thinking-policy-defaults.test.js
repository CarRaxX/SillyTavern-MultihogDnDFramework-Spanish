import { describe, expect, it } from 'vitest';
import { testExtensionSettings } from './setup.js';
import { buildDefaultSettings } from '../src/state/defaults.js';
import { getSettings } from '../src/state/settings.js';
import { MODULE_NAME } from '../src/state/schema-sections.js';
import { THINKING_JOB_IDS, THINKING_MODES, resolveThinkingPolicy } from '../src/state/thinking-policy.js';

// El default de la política es «no tocar nada» (AC0/D4): la clave existe, pero
// vacía significa que los ocho trabajos heredan el comportamiento de siempre y
// el cuerpo de la petición no gana ni un byte.
function limpio() {
    for (const key of Object.keys(testExtensionSettings)) delete testExtensionSettings[key];
}

describe('localThinkingPolicy en los ajustes por defecto (T2)', () => {
    it('la clave existe y viene vacía: todo heredar', () => {
        const valores = buildDefaultSettings();
        expect(valores.localThinkingPolicy).toEqual({});
        for (const jobId of THINKING_JOB_IDS) {
            expect(resolveThinkingPolicy(valores, jobId)).toEqual({ mode: THINKING_MODES.INHERIT });
        }
    });

    it('unos ajustes sin la clave siguen resolviendo heredar para todo', () => {
        limpio();
        testExtensionSettings[MODULE_NAME] = { settingsVersion: '2026.8.82' };
        const ajustes = getSettings();
        expect(ajustes.localThinkingPolicy).toEqual({});
        for (const jobId of THINKING_JOB_IDS) {
            expect(resolveThinkingPolicy(ajustes, jobId).mode).toBe(THINKING_MODES.INHERIT);
        }
    });
});

describe('Saneado de la política al cargar los ajustes', () => {
    it('convierte «desactivar» en un trabajo de juicio en heredar', () => {
        limpio();
        testExtensionSettings[MODULE_NAME] = {
            localThinkingPolicy: { lorebook_agent: { mode: 'desactivar' }, map_evolution: { mode: 'desactivar' } },
        };
        const ajustes = getSettings();
        expect(ajustes.localThinkingPolicy).toEqual({});
        expect(resolveThinkingPolicy(ajustes, 'lorebook_agent').mode).toBe(THINKING_MODES.INHERIT);
        expect(resolveThinkingPolicy(ajustes, 'map_evolution').mode).toBe(THINKING_MODES.INHERIT);
    });

    it('conserva lo válido y descarta presupuestos basura o trabajos desconocidos', () => {
        limpio();
        testExtensionSettings[MODULE_NAME] = {
            localThinkingPolicy: {
                state_tracker: { mode: 'desactivar' },
                map_evolution_compress: { mode: 'presupuesto', tokens: 2048 },
                tracker_audit: { mode: 'presupuesto', tokens: 0 },
                narrador: { mode: 'desactivar' },
            },
        };
        const ajustes = getSettings();
        expect(ajustes.localThinkingPolicy).toEqual({
            state_tracker: { mode: 'desactivar' },
            map_evolution_compress: { mode: 'presupuesto', tokens: 2048 },
        });
    });

    it('una política corrupta (texto, lista o nula) se convierte en mapa vacío', () => {
        for (const basura of ['desactivar', [], null, 7]) {
            limpio();
            testExtensionSettings[MODULE_NAME] = { localThinkingPolicy: basura };
            expect(getSettings().localThinkingPolicy).toEqual({});
        }
    });

    it('el saneado es idempotente: releer los ajustes no duplica ni cambia nada', () => {
        limpio();
        testExtensionSettings[MODULE_NAME] = {
            localThinkingPolicy: { state_tracker: { mode: 'presupuesto', tokens: 1024 } },
        };
        const primera = JSON.stringify(getSettings().localThinkingPolicy);
        expect(JSON.stringify(getSettings().localThinkingPolicy)).toBe(primera);
    });
});
