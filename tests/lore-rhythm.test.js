import { describe, expect, it } from 'vitest';
import { buildDefaultSettings } from '../src/state/defaults.js';
import {
    FACTORY_RHYTHM_ID,
    LORE_RHYTHM_CUSTOM_BOUNDS,
    LORE_RHYTHM_CUSTOM_ID,
    LORE_RHYTHM_PRESETS,
    clampLoreRhythmCustom,
    factoryRhythmValues,
    getLoreRhythmPreset,
    resolveLoreRhythmId,
    rhythmPresetEstimate,
} from '../src/state/lore-rhythm.js';

// T2: la tabla canónica D-1 es la única fuente del par (frecuencia, vueltas).
// Todo lo que aquí se comprueba es puro: sin ajustes guardados, sin DOM, sin red.
describe('Tabla canónica del ritmo (D-1)', () => {
    it('tres filas con ids y etiquetas únicas en español', () => {
        expect(LORE_RHYTHM_PRESETS).toHaveLength(3);
        const ids = LORE_RHYTHM_PRESETS.map(fila => fila.id);
        expect(new Set(ids).size).toBe(3);
        const etiquetas = LORE_RHYTHM_PRESETS.map(fila => fila.label);
        expect(new Set(etiquetas).size).toBe(3);
        // Etiquetas literales de la tabla D-1 (español): cadencia + calificación.
        expect(etiquetas).toEqual([
            'Cada turno (máximo detalle)',
            'Cada 2 turnos (equilibrado)',
            'Cada 3 turnos (ahorrativo)',
        ]);
    });

    it('regla canónica: maxTurns = runEvery + 2 en todas las filas', () => {
        for (const fila of LORE_RHYTHM_PRESETS) {
            expect(fila.maxTurns, fila.id).toBe(fila.runEvery + 2);
        }
    });

    it('los pares de la tabla son exactamente (1,3) (2,4) (3,5)', () => {
        expect(LORE_RHYTHM_PRESETS.map(fila => [fila.runEvery, fila.maxTurns]))
            .toEqual([[1, 3], [2, 4], [3, 5]]);
    });

    it('las filas están congeladas: nadie puede reescribir la tabla en runtime', () => {
        for (const fila of LORE_RHYTHM_PRESETS) expect(Object.isFrozen(fila)).toBe(true);
    });
});

describe('Paridad con los valores de fábrica reales (AC2/AC4)', () => {
    it('la fila de fábrica coincide con buildDefaultSettings() tal cual', () => {
        const valores = buildDefaultSettings();
        const fila = getLoreRhythmPreset(FACTORY_RHYTHM_ID);
        expect(fila).not.toBeNull();
        // Anclaje al valor REAL de defaults, no a un número inventado.
        expect(fila.runEvery).toBe(valores.routerRunEvery);
        expect(fila.maxTurns).toBe(valores.routerMaxTurns);
        expect(resolveLoreRhythmId(valores)).toBe(FACTORY_RHYTHM_ID);
    });

    it('el par de fábrica es (3,5): coincide con la fila ahorrativa', () => {
        const valores = buildDefaultSettings();
        expect([valores.routerRunEvery, valores.routerMaxTurns]).toEqual([3, 5]);
        expect(factoryRhythmValues()).toEqual({ runEvery: 3, maxTurns: 5 });
    });
});

describe('resolveLoreRhythmId (D-2/D-3)', () => {
    it('los valores heredados del defecto (1,5) son personalizado', () => {
        expect(resolveLoreRhythmId({ routerRunEvery: 1, routerMaxTurns: 5 })).toBe(LORE_RHYTHM_CUSTOM_ID);
    });

    it('cada fila de la tabla resuelve su propio id', () => {
        for (const fila of LORE_RHYTHM_PRESETS) {
            expect(resolveLoreRhythmId({ routerRunEvery: fila.runEvery, routerMaxTurns: fila.maxTurns })).toBe(fila.id);
        }
    });

    it('todo lo inentendible es personalizado sin inventar valores', () => {
        for (const basura of [undefined, null, {}, 'nada', [], { routerRunEvery: 1 }, { routerRunEvery: 'x', routerMaxTurns: 5 }, { routerRunEvery: 1.5, routerMaxTurns: 3.5 }]) {
            expect(resolveLoreRhythmId(basura)).toBe(LORE_RHYTHM_CUSTOM_ID);
        }
    });

    it('pura: no muta los ajustes que le pasan', () => {
        const ajustes = { routerRunEvery: 1, routerMaxTurns: 5, otro: 'valor' };
        const antes = JSON.stringify(ajustes);
        resolveLoreRhythmId(ajustes);
        expect(JSON.stringify(ajustes)).toBe(antes);
    });
});

describe('Cotas del modo personalizado (D-2)', () => {
    it('runEvery 1-6 y maxTurns 2-8: dentro se conserva, fuera se recorta', () => {
        expect(clampLoreRhythmCustom('runEvery', 6)).toBe(6);
        expect(clampLoreRhythmCustom('runEvery', 0)).toBe(1);
        expect(clampLoreRhythmCustom('runEvery', 50)).toBe(6);
        expect(clampLoreRhythmCustom('maxTurns', 2)).toBe(2);
        expect(clampLoreRhythmCustom('maxTurns', 1)).toBe(2);
        expect(clampLoreRhythmCustom('maxTurns', 10)).toBe(8);
    });

    it('vacío, texto o decimal devuelven null: el llamador ignora, no escribe', () => {
        for (const basura of ['', '   ', 'abc', null, undefined, 2.5, NaN]) {
            expect(clampLoreRhythmCustom('runEvery', basura)).toBeNull();
            expect(clampLoreRhythmCustom('maxTurns', basura)).toBeNull();
        }
        expect(clampLoreRhythmCustom('inexistente', 3)).toBeNull();
    });

    it('las cotas declaradas son 1-6 y 2-8 y están congeladas', () => {
        expect(LORE_RHYTHM_CUSTOM_BOUNDS.runEvery).toEqual([1, 6]);
        expect(LORE_RHYTHM_CUSTOM_BOUNDS.maxTurns).toEqual([2, 8]);
        expect(Object.isFrozen(LORE_RHYTHM_CUSTOM_BOUNDS.runEvery)).toBe(true);
    });
});

describe('Estimación de llamadas por 10 turnos (D-1)', () => {
    it('⌊10/runEvery⌋ pasadas; típicas ×3; peor ×(maxTurns+2)', () => {
        const [una, dos, tres] = LORE_RHYTHM_PRESETS;
        expect(rhythmPresetEstimate(una)).toEqual({ turnos: 10, pasadas: 10, tipicas: 30, peor: 50 });
        expect(rhythmPresetEstimate(dos)).toEqual({ turnos: 10, pasadas: 5, tipicas: 15, peor: 30 });
        expect(rhythmPresetEstimate(tres)).toEqual({ turnos: 10, pasadas: 3, tipicas: 9, peor: 21 });
    });

    it('fila basura da ceros en lugar de prometer costes falsos', () => {
        for (const basura of [undefined, null, {}, { runEvery: 0, maxTurns: 2 }, { runEvery: 'a', maxTurns: 'b' }]) {
            const est = rhythmPresetEstimate(basura);
            expect(est.pasadas).toBe(0);
            expect(est.tipicas).toBe(0);
            expect(est.peor).toBe(0);
        }
    });
});
