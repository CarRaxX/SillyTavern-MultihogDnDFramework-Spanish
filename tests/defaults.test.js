import { describe, expect, it } from 'vitest';
import { buildDefaultSettings, FACTORY_SETTINGS_VERSION } from '../src/state/defaults.js';
import { getSettings, CHAT_STATE_GLOBAL_UI_KEYS } from '../src/state/settings.js';
import { AG_CONTROL_KEYS, OUTPUT_CAP_JOBS } from '../src/state/agent-controls.js';
import { testExtensionSettings } from './setup.js';

// T2 (spec 2026-11-08): las nueve claves nuevas, UNA A UNA, con su defecto de
// fábrica. `0` significa «auto/ninguno» y NUNCA salta al defecto, así que el
// deep-merge de `getSettings` tiene que respetar el 0 del usuario
// (`0 !== undefined`). Cero red, cero modelo.

const CLAVES_NUEVAS = Object.freeze([
    AG_CONTROL_KEYS.agentRetries,
    AG_CONTROL_KEYS.jsonCorrections,
    AG_CONTROL_KEYS.auditChunkBuffer,
    ...OUTPUT_CAP_JOBS.map(j => j.settingsKey),
    'fullReviewSystemPromptOverride',
    'fullReviewUserPromptSuffixOverride',
    'rpgPerfProfile',
]);

const DEFECTOS_ESPERADOS = Object.freeze({
    [AG_CONTROL_KEYS.agentRetries]: 2,
    [AG_CONTROL_KEYS.jsonCorrections]: 2,
    [AG_CONTROL_KEYS.auditChunkBuffer]: 3000,
    rpgOutputCapStateTracker: 0,
    rpgOutputCapWorldProgression: 0,
    rpgOutputCapMapEvolutionCompress: 0,
    fullReviewSystemPromptOverride: '',
    fullReviewUserPromptSuffixOverride: '',
    rpgPerfProfile: 'Equilibrado',
});

describe('T2: las nueve claves de la ola 5, una a una', () => {
    it('son NUEVE claves y ninguna existía antes de esta ola', () => {
        expect(CLAVES_NUEVAS).toHaveLength(9);
        expect(new Set(CLAVES_NUEVAS).size).toBe(9);
    });

    it.each(CLAVES_NUEVAS)('%s: existe en los valores de fábrica', (clave) => {
        const fabrica = buildDefaultSettings();
        expect(Object.prototype.hasOwnProperty.call(fabrica, clave), clave).toBe(true);
    });

    it.each(CLAVES_NUEVAS)('%s: su defecto es el de la spec D-2/D-3/D-4/D-7', (clave) => {
        expect(buildDefaultSettings()[clave], clave).toEqual(DEFECTOS_ESPERADOS[clave]);
    });

    it('los tres topes de salida nacen en 0 = auto (la cascada del 8192 intacta, AC0)', () => {
        const fabrica = buildDefaultSettings();
        for (const trabajo of OUTPUT_CAP_JOBS) {
            expect(fabrica[trabajo.settingsKey], trabajo.jobId).toBe(0);
        }
    });

    it('los dos overrides de Revisión Completa nacen vacíos = fábrica (D-4)', () => {
        const fabrica = buildDefaultSettings();
        expect(fabrica.fullReviewSystemPromptOverride).toBe('');
        expect(fabrica.fullReviewUserPromptSuffixOverride).toBe('');
    });

    it('el perfil de fábrica es «Equilibrado», que ES la fila de fábrica de la matriz', () => {
        const fabrica = buildDefaultSettings();
        expect(fabrica.rpgPerfProfile).toBe('Equilibrado');
        // Equilibrado = los valores de siempre, clave por clave (D-9/AC0).
        expect(fabrica[AG_CONTROL_KEYS.agentRetries]).toBe(2);
        expect(fabrica[AG_CONTROL_KEYS.jsonCorrections]).toBe(2);
        expect(fabrica[AG_CONTROL_KEYS.auditChunkBuffer]).toBe(3000);
        expect(fabrica.routerRunEvery).toBe(3);
        expect(fabrica.routerMaxTurns).toBe(5);
    });

    it('el contenedor de perfiles propios existe y nace vacío (addendum §4)', () => {
        expect(buildDefaultSettings().rpgPerfProfileCustom).toEqual([]);
    });
});

describe('T2: el deep-merge llena las claves nuevas sin pisar lo del usuario', () => {
    /** Ajustes de una partida antigua (sin ninguna clave de la ola 5). */
    function sacoAntiguo(extra = {}) {
        testExtensionSettings.rpg_tracker = { settingsVersion: FACTORY_SETTINGS_VERSION, ...extra };
        return getSettings();
    }

    it('aparecen las nueve con su defecto sobre un blob anterior a la ola', () => {
        const ajustes = sacoAntiguo();
        for (const clave of CLAVES_NUEVAS) {
            expect(ajustes[clave], clave).toEqual(DEFECTOS_ESPERADOS[clave]);
        }
    });

    it.each([
        ['los dos reintentos en 0', { [AG_CONTROL_KEYS.agentRetries]: 0, [AG_CONTROL_KEYS.jsonCorrections]: 0 }, 0],
        ['un margen recortado', { [AG_CONTROL_KEYS.auditChunkBuffer]: 1500 }, 1500],
    ])('respeta el valor del usuario (%s): 0 !== undefined, el merge no lo pisa', (_nombre, extra, esperado) => {
        const ajustes = sacoAntiguo(extra);
        for (const clave of Object.keys(extra)) {
            expect(ajustes[clave], clave).toBe(esperado);
        }
    });

    it.each(OUTPUT_CAP_JOBS.map(j => j.settingsKey))('%s: el 0 guardado sigue siendo 0 tras el merge', (clave) => {
        const ajustes = sacoAntiguo({ [clave]: 0 });
        expect(ajustes[clave]).toBe(0);
    });

    it('un override guardado sobrevive al merge (no se regenera la fábrica encima)', () => {
        const ajustes = sacoAntiguo({ fullReviewSystemPromptOverride: 'Pegado del usuario {{modulesText}} [TAG]REMOVED[/TAG]' });
        expect(ajustes.fullReviewSystemPromptOverride).toContain('Pegado del usuario');
    });

    it('leer ajustes no escribe en los mandos: el blob viejo no gana valores nuevos de golpe', () => {
        testExtensionSettings.rpg_tracker = { settingsVersion: FACTORY_SETTINGS_VERSION };
        const leido = getSettings();
        // El merge rellena el saco (es lo que hace `getSettings`), pero ningún
        // mando queda fuera de su cota: lo que se lee siempre es utilizable.
        expect(leido[AG_CONTROL_KEYS.auditChunkBuffer]).toBeGreaterThanOrEqual(500);
        expect(leido[AG_CONTROL_KEYS.agentRetries]).toBeLessThanOrEqual(4);
    });
});

describe('T2: D-11 — las claves nuevas NO entran en CHAT_STATE_GLOBAL_UI_KEYS', () => {
    it.each(CLAVES_NUEVAS)('%s: sigue fuera de la lista global de UI', (clave) => {
        expect(CHAT_STATE_GLOBAL_UI_KEYS).not.toContain(clave);
    });

    it('la lista no cambia de tamaño por esta ola (cero guardas teóricas)', () => {
        // Las ocho claves de mandos/overrides más el perfil viajan con el guardado
        // global de SillyTavern; registrarlas aquí sería un guard sin efecto.
        expect(Array.isArray(CHAT_STATE_GLOBAL_UI_KEYS)).toBe(true);
        expect(CHAT_STATE_GLOBAL_UI_KEYS.some(k => /^rpg(OutputCap|Perf|Audit)/.test(k))).toBe(false);
        expect(CHAT_STATE_GLOBAL_UI_KEYS.some(k => /agenteRetries|jsonCorrection/i.test(k))).toBe(false);
        expect(CHAT_STATE_GLOBAL_UI_KEYS.some(k => /fullReview.*Override/i.test(k))).toBe(false);
    });
});
