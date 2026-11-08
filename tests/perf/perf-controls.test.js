import { createContext, runInContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml } from '../../memo-processor.js';
import { buildDefaultSettings, FULL_REVIEW_STATE_SYSTEM_PROMPT, FULL_REVIEW_USER_PROMPT_SUFFIX } from '../../src/state/defaults.js';
import { AG_CONTROL_KEYS, OUTPUT_CAP_JOBS, OUTPUT_CAP_BOUNDS, estimarLlamadasDeBucles } from '../../src/state/agent-controls.js';
import { PERF_PROFILES, estimarCostePerfil, perfProfileValues, previewPerfProfile } from '../../src/state/performance-profiles.js';
import { PROMPT_CEILING_SETTINGS_KEYS } from '../../src/state/prompt-ceilings.js';
import { LORE_RHYTHM_SETTINGS_KEYS, getLoreRhythmPreset, resolveLoreRhythmId, LORE_RHYTHM_CUSTOM_ID, clampLoreRhythmCustom, rhythmPresetEstimate } from '../../src/state/lore-rhythm.js';
import { resolveThinkingPolicy } from '../../src/state/thinking-policy.js';
import { estimatePromptTokens } from '../../src/state/prompt-ceilings.js';

// T13 (spec 2026-11-08, ola 5, D-9/addendum §1-§2): anclaje numérico de cada
// perfil. Con `PERF_PROFILE=<Rapido|Equilibrado|Calidad>` la suite entera se
// ejecuta anclada al baseline de ese perfil (T15); SIN la variable se comprueba
// además AC0 por SHA-256 contra los prompts medidos en `main=9440ed0` (los
// únicos bytes que viajan por defecto). Nadie flexibiliza ninguna aserción:
// o cuadran los números del addendum, o la suite cae.

const PERF_PERFIL_ACTIVO = (() => {
    const crudo = String(process.env.PERF_PROFILE || '').trim();
    if (!crudo) return null;
    if (!PERF_PROFILES.some(p => p.id === crudo)) {
        throw new Error(`PERF_PROFILE="${crudo}" no es una de las tres matrices (${PERF_PROFILES.map(p => p.id).join('/')})`);
    }
    return crudo;
})();

const PERFILES = PERF_PERFIL_ACTIVO
    ? PERF_PROFILES.filter(p => p.id === PERF_PERFIL_ACTIVO)
    : PERF_PROFILES;

const indexSource = readFileSync(new URL('../../index.js', import.meta.url), 'utf8');
const baseline = JSON.parse(readFileSync(new URL('../fixtures/prompt-token-baseline.json', import.meta.url), 'utf8'));

function extraer(nombre) {
    const inicio = indexSource.search(new RegExp(`function ${nombre}\\(`));
    if (inicio < 0) throw new Error(`Falta ${nombre} en index.js`);
    const despues = indexSource.slice(inicio + 1);
    const siguiente = despues.search(/\n(?:async )?function /);
    return siguiente < 0 ? indexSource.slice(inicio) : indexSource.slice(inicio, inicio + 1 + siguiente);
}

const sha256 = texto => createHash('sha256').update(texto, 'utf8').digest('hex');

/** Las 12 claves que gobierna la matriz, en orden canónico, para el anclaje. */
const CLAVES_GOBERNADAS = [
    LORE_RHYTHM_SETTINGS_KEYS.runEvery, LORE_RHYTHM_SETTINGS_KEYS.maxTurns,
    ...Object.values(PROMPT_CEILING_SETTINGS_KEYS),
    'localThinkingPolicy',
    AG_CONTROL_KEYS.agentRetries, AG_CONTROL_KEYS.jsonCorrections, AG_CONTROL_KEYS.auditChunkBuffer,
    ...OUTPUT_CAP_JOBS.map(t => t.settingsKey),
];

const huellaGobernado = ajustes => sha256(JSON.stringify(
    CLAVES_GOBERNADAS.map(clave => [clave, ajustes?.[clave] ?? null]),
));

/** `aplicarPerfilRendimiento` real (vm) con los módulos puros de verdad. */
function aplicarPerfil(id, base) {
    const ajustes = { ...base };
    const ctx = createContext({
        escapeHtml,
        toastr: Object.assign(() => {}, { warning: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn() }),
        saveSettings: () => {},
        document: { getElementById: () => null, querySelectorAll: () => [], dispatchEvent: () => {} },
        globalThis: {},
        CustomEvent: class { constructor(t) { this.type = t; } },
        perfProfileValues,
        resolveLoreRhythmId,
        LORE_RHYTHM_CUSTOM_ID,
        clampLoreRhythmCustom,
        PROMPT_CEILING_SETTINGS_KEYS,
        AG_CONTROL_KEYS,
        OUTPUT_CAP_JOBS,
        // El aplicador real de la ola 3, replicado desde su tabla canónica:
        // escribe el PAR (runEvery, maxTurns) de la fila, sin guardar.
        applyLoreRhythmPreset: (s, filaId) => {
            const fila = getLoreRhythmPreset(filaId) || getLoreRhythmPreset('cada_3');
            s[LORE_RHYTHM_SETTINGS_KEYS.runEvery] = fila.runEvery;
            s[LORE_RHYTHM_SETTINGS_KEYS.maxTurns] = fila.maxTurns;
            return { runEvery: fila.runEvery, maxTurns: fila.maxTurns };
        },
        validateAgentControlSet: (set) => {
            // Recorte D-6 real simplificado: la suma ≤ 12 nunca se viola con los
            // tres perfiles; se verifica aquí para que un cambio de matriz lo grite.
            const suma = (set.routerMaxTurns ?? 5) + (set[AG_CONTROL_KEYS.agentRetries] ?? 2) + (set[AG_CONTROL_KEYS.jsonCorrections] ?? 2);
            expect(suma, 'D-6: vueltas + reintentos ≤ 12').toBeLessThanOrEqual(12);
            return {
                valido: true, avisos: [], cambios: [],
                valores: {
                    routerMaxTurns: set.routerMaxTurns ?? 5,
                    [AG_CONTROL_KEYS.agentRetries]: set[AG_CONTROL_KEYS.agentRetries] ?? 2,
                    [AG_CONTROL_KEYS.jsonCorrections]: set[AG_CONTROL_KEYS.jsonCorrections] ?? 2,
                },
            };
        },
    });
    runInContext(extraer('aplicarPerfilRendimiento'), ctx);
    const resultado = ctx.aplicarPerfilRendimiento(ajustes, id, []);
    return { ajustes, resultado };
}

/** Baseline numérico del addendum §1-§2 por perfil. */
const BASELINES = {
    Rapido: {
        ritmo: [3, 5],
        reintentos: [1, 1],
        margen: 3000,
        salidas: { state_tracker: 3000, world_progression: 4000, map_evolution_compress: 2000 },
        techos: [1600, 4096, 5],
        bucles: { pasadas: 3, porBucle: 10, normal: 30, limpieza: 30, total: 60 },
        ritmoEstimate: { tipicas: 9, peor: 21 },
    },
    Equilibrado: {
        ritmo: [3, 5],
        reintentos: [2, 2],
        margen: 3000,
        salidas: { state_tracker: 0, world_progression: 0, map_evolution_compress: 0 },
        techos: [1600, 4096, 5],
        bucles: { pasadas: 3, porBucle: 15, normal: 45, limpieza: 45, total: 90 },
        ritmoEstimate: { tipicas: 9, peor: 21 },
    },
    Calidad: {
        ritmo: [1, 3],
        reintentos: [3, 3],
        margen: 1500,
        salidas: { state_tracker: 0, world_progression: 0, map_evolution_compress: 0 },
        techos: [4000, 8192, 10],
        bucles: { pasadas: 10, porBucle: 12, normal: 120, limpieza: 120, total: 240 },
        ritmoEstimate: { tipicas: 30, peor: 50 },
    },
};

describe(`T13 · D-9 ancla numérica (${PERF_PERFIL_ACTIVO ? `PERF_PROFILE=${PERF_PERFIL_ACTIVO}` : 'sin PERF_PROFILE: las tres matrices'})`, () => {
    describe.each(PERFILES)('perfil %s', (perfil) => {
        const esperado = BASELINES[perfil.id];
        const { ajustes } = aplicarPerfil(perfil.id, buildDefaultSettings());

        it('el ritmo aplicado es exactamente el de la matriz §1', () => {
            expect(ajustes[LORE_RHYTHM_SETTINGS_KEYS.runEvery]).toBe(esperado.ritmo[0]);
            expect(ajustes[LORE_RHYTHM_SETTINGS_KEYS.maxTurns]).toBe(esperado.ritmo[1]);
        });

        it('las llamadas máximas de LOS DOS BUCLES cuadran con el addendum §2', () => {
            const est = estimarLlamadasDeBucles({
                runEvery: ajustes[LORE_RHYTHM_SETTINGS_KEYS.runEvery],
                maxTurns: ajustes[LORE_RHYTHM_SETTINGS_KEYS.maxTurns],
                [AG_CONTROL_KEYS.agentRetries]: ajustes[AG_CONTROL_KEYS.agentRetries],
            });
            expect(est).toMatchObject(esperado.bucles);
            // El mismo mando gobierna los dos bucles: normal y limpieza cuestan igual.
            expect(est.normal).toBe(est.limpieza);
            expect(est.total).toBe(est.normal + est.limpieza);
        });

        it('el coste del preview ES la misma estimación (una sola fuente)', () => {
            const vista = previewPerfProfile(buildDefaultSettings(), perfil.id, []);
            expect(vista.coste).toMatchObject(esperado.bucles);
            expect(vista.coste.normal).toBe(
                estimarLlamadasDeBucles({
                    runEvery: ajustes[LORE_RHYTHM_SETTINGS_KEYS.runEvery],
                    maxTurns: ajustes[LORE_RHYTHM_SETTINGS_KEYS.maxTurns],
                    [AG_CONTROL_KEYS.agentRetries]: ajustes[AG_CONTROL_KEYS.agentRetries],
                }).normal,
            );
            expect(estimarCostePerfil(perfil.id)).toMatchObject(esperado.bucles);
        });

        it('el estimador del ritmo de la ola 3 coincide con el tooltip (≈típicas ≤peor)', () => {
            const est = rhythmPresetEstimate({
                runEvery: ajustes[LORE_RHYTHM_SETTINGS_KEYS.runEvery],
                maxTurns: ajustes[LORE_RHYTHM_SETTINGS_KEYS.maxTurns],
            });
            expect(est.tipicas).toBe(esperado.ritmoEstimate.tipicas);
            expect(est.peor).toBe(esperado.ritmoEstimate.peor);
        });

        it('los reintentos y el margen son los de la matriz §1 y nunca amplían vueltas', () => {
            expect(ajustes[AG_CONTROL_KEYS.agentRetries]).toBe(esperado.reintentos[0]);
            expect(ajustes[AG_CONTROL_KEYS.jsonCorrections]).toBe(esperado.reintentos[1]);
            expect(ajustes[AG_CONTROL_KEYS.auditChunkBuffer]).toBe(esperado.margen);
            // El peor caso del ritmo NO crece con los reintentos (addendum: solo
            // añaden llamadas dentro de la vuelta, nunca vueltas nuevas).
            const peorRitmo = rhythmPresetEstimate({
                runEvery: ajustes[LORE_RHYTHM_SETTINGS_KEYS.runEvery],
                maxTurns: ajustes[LORE_RHYTHM_SETTINGS_KEYS.maxTurns],
            }).peor;
            expect(peorRitmo).toBe(esperado.ritmoEstimate.peor);
        });

        it('cada tope de salida es 0 (auto) o un valor ≤ 8000: la salida nunca supera a fábrica', () => {
            for (const trabajo of OUTPUT_CAP_JOBS) {
                const valor = ajustes[trabajo.settingsKey];
                expect(valor, trabajo.jobId).toBe(esperado.salidas[trabajo.jobId]);
                if (valor !== 0) {
                    expect(valor, trabajo.jobId).toBeGreaterThanOrEqual(OUTPUT_CAP_BOUNDS[0]);
                    // AC0/D-9: con cap la salida mando es MENOS que la cascada de
                    // fábrica (8192); el cap nunca puede ampliar la salida.
                    expect(valor, trabajo.jobId).toBeLessThan(8192);
                }
            }
        });

        it('los techos de ola 4 salen de su cota: Rápido conserva y Calidad sube al borde', () => {
            const claves = Object.values(PROMPT_CEILING_SETTINGS_KEYS);
            const aplicado = claves.map(k => ajustes[k]);
            expect(aplicado).toEqual(esperado.techos);
            const fabrica = buildDefaultSettings();
            for (const k of claves) {
                // Ningún perfil puede bajar un techo por debajo de la fábrica (AC0).
                expect(ajustes[k] >= fabrica[k], `${k} no puede bajar de fábrica`).toBe(true);
            }
        });

        it('el pensamiento solo apaga los dos trabajos con offEligible (D5)', () => {
            const politica = ajustes.localThinkingPolicy;
            if (perfil.id === 'Rapido') {
                expect(resolveThinkingPolicy({ localThinkingPolicy: politica }, 'state_tracker').mode).toBe('desactivar');
                expect(resolveThinkingPolicy({ localThinkingPolicy: politica }, 'map_evolution_compress').mode).toBe('desactivar');
                for (const trabajo of ['lorebook_agent', 'world_progression', 'map_architect', 'map_updater', 'map_evolution', 'state_tracker_companion']) {
                    expect(resolveThinkingPolicy({ localThinkingPolicy: politica }, trabajo).mode, trabajo).toBe('heredar');
                }
            } else {
                expect(politica).toEqual({});
            }
        });

        it('con el margen del perfil, el prompt de Revisión Completa cabe en contextSize', () => {
            // Mismo cálculo que los dos sitios del chunk: Math.max(1000, límite − margen).
            const contextSize = 32000;
            const chunk = Math.max(1000, contextSize - ajustes[AG_CONTROL_KEYS.auditChunkBuffer]);
            const tokensPrompt = estimatePromptTokens(FULL_REVIEW_STATE_SYSTEM_PROMPT)
                + estimatePromptTokens(FULL_REVIEW_USER_PROMPT_SUFFIX);
            expect(tokensPrompt).toBeLessThan(chunk);
            // Y el techo gobernable del system (ola 4) sigue por debajo del chunk.
            expect(ajustes[PROMPT_CEILING_SETTINGS_KEYS.worldBlock]).toBeLessThan(chunk);
        });
    });

    it('Rapido cuesta lo mismo que fábrica en ritmo y solo ahorra por pensamiento y salidas (§2)', () => {
        const rapido = BASELINES.Rapido;
        const eq = BASELINES.Equilibrado;
        expect(rapido.ritmo).toEqual(eq.ritmo);
        expect(rapido.ritmoEstimate).toEqual(eq.ritmoEstimate);
        expect(rapido.bucles.total).toBeLessThanOrEqual(eq.bucles.total);
    });

    it('Calidad sale ~3,3× sobre las llamadas típicas del ritmo (§2) sin pasar de su tabla', () => {
        const ratio = BASELINES.Calidad.ritmoEstimate.tipicas / BASELINES.Equilibrado.ritmoEstimate.tipicas;
        expect(ratio).toBeCloseTo(10 / 3, 1);
        expect(BASELINES.Calidad.ritmoEstimate.peor).toBe(50);
        expect(BASELINES.Calidad.ritmo[0]).toBe(1);
        expect(BASELINES.Calidad.ritmo[1]).toBe(3);
    });
});

describe('AC0 (solo sin PERF_PROFILE): los bytes de fábrica, sellados con SHA-256', () => {
    it.skipIf(!!PERF_PERFIL_ACTIVO)('los dos prompts de Revisión Completa son los medidos en main=9440ed0', () => {
        // Ancla: `tests/fixtures/prompt-token-baseline.json` → ola5_T4 (chars) y
        // los digests tomados de las constantes SIN tocar desde main=9440ed0.
        expect(baseline.ola5_T4_prompts_full_review.medido_en).toBe('main=9440ed0');
        expect(FULL_REVIEW_STATE_SYSTEM_PROMPT.length).toBe(baseline.prompts.full_review_state_system.chars);
        expect(FULL_REVIEW_USER_PROMPT_SUFFIX.length).toBe(baseline.prompts.full_review_user_suffix.chars);
        expect(sha256(FULL_REVIEW_STATE_SYSTEM_PROMPT))
            .toBe('b6fbee8a8b82fcce807c95dda5a1362a727398986873160c79cf59507e3bb583');
        expect(sha256(FULL_REVIEW_USER_PROMPT_SUFFIX))
            .toBe('b0c7805ef1a957d3a68016bd0082ce04723a8ac0db1a5eac22a2c3a0d0590175');
    });

    it.skipIf(!!PERF_PERFIL_ACTIVO)('aplicar «Equilibrado» deja las 12 claves gobernadas byte a byte (D-9)', () => {
        const { ajustes } = aplicarPerfil('Equilibrado', buildDefaultSettings());
        expect(huellaGobernado(ajustes)).toBe(huellaGobernado(buildDefaultSettings()));
    });

    it.skipIf(!!PERF_PERFIL_ACTIVO)('sin tocar nada, la huella gobernable de fábrica es estable', () => {
        // Doble lectura: la huella no cambia entre dos llamadas (el render no escribe, AC0).
        expect(huellaGobernado(buildDefaultSettings())).toBe(huellaGobernado(buildDefaultSettings()));
    });
});
