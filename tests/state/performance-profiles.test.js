import { describe, expect, it } from 'vitest';
import {
    PERF_PROFILES,
    PERF_PROFILE_DEFAULT_ID,
    PERF_PROFILE_IDS,
    PERF_PROFILE_CUSTOM_LABEL_ES,
    PERF_PROFILE_NAME_MAX,
    PERF_PROFILE_SETTINGS_KEYS,
    borrarPerfilPropio,
    capturarValoresPerfilPropio,
    describePerfProfileDeltas,
    describePerfProfileName,
    estimarCostePerfil,
    getPerfProfile,
    guardarPerfilPropio,
    modosPensamientoPerfil,
    perfProfileValues,
    perfilGobiernaPensamiento,
    previewPerfProfile,
    resolvePerfProfileId,
    resumenMatrizPerfPerfiles,
    validarNombrePerfilPropio,
} from '../../src/state/performance-profiles.js';
import { buildDefaultSettings } from '../../src/state/defaults.js';
import { THINKING_JOB_IDS } from '../../src/state/thinking-policy.js';

// T3 (spec 2026-11-08, D-7/D-8 y addendum §1/§4/§5): la matriz de perfiles son
// DATOS que delegan en los aplicadores de las olas 2-4. Aquí se comprueba la
// matriz mando a mando y que la derivación de «Personalizado» nunca se guarda.

const FABRICA = buildDefaultSettings();
const VALORES = id => perfProfileValues(id, []);

describe('T3: la matriz D-7 son tres filas y nada más', () => {
    it('ids ASCII (tokens de máquina) y etiquetas en español', () => {
        expect(PERF_PROFILES.map(p => p.id)).toEqual(['Rapido', 'Equilibrado', 'Calidad']);
        expect(PERF_PROFILES.map(p => p.label)).toEqual(['Rápido', 'Equilibrado', 'Máxima calidad']);
        expect(PERF_PROFILE_DEFAULT_ID).toBe(PERF_PROFILE_IDS.EQUILIBRADO);
    });

    it('ninguna cuarta fila «Personalizado»: se deriva y no se guarda (D-7)', () => {
        expect(PERF_PROFILES.some(p => p.id === PERF_PROFILE_CUSTOM_LABEL_ES)).toBe(false);
        expect(getPerfProfile(PERF_PROFILE_CUSTOM_LABEL_ES)).toBeNull();
        expect(perfProfileValues(PERF_PROFILE_CUSTOM_LABEL_ES, [])).toBeNull();
    });

    it('cada perfil declara exactamente las claves de la matriz', () => {
        for (const perfil of PERF_PROFILES) {
            expect(Object.keys(perfil.valores).sort()).toEqual([...PERF_PROFILE_SETTINGS_KEYS].sort());
        }
    });
});

describe('T3: addendum §1, fila por fila', () => {
    it('Equilibrado = fábrica, clave por clave (D-9/AC0)', () => {
        const valores = VALORES(PERF_PROFILE_IDS.EQUILIBRADO);
        for (const clave of PERF_PROFILE_SETTINGS_KEYS) {
            const actual = FABRICA[clave];
            const esperado = valores[clave];
            const igual = clave === 'localThinkingPolicy'
                ? JSON.stringify(actual || {}) === JSON.stringify(esperado)
                : actual === esperado;
            expect(igual, `${clave}: fábrica ${JSON.stringify(actual)} ≠ perfil ${JSON.stringify(esperado)}`).toBe(true);
        }
    });

    it('Rapido CONSERVA el par de ritmo de fábrica (3,5): la tabla no tiene fila más lenta', () => {
        const valores = VALORES(PERF_PROFILE_IDS.RAPIDO);
        expect(valores.routerRunEvery).toBe(3);
        expect(valores.routerMaxTurns).toBe(5);
        // Y conserva los techos de fábrica (memo ≈358 tok y respuesta ≈852 tok).
        expect(valores.rpg_ceiling_tracker_memo).toBe(1600);
        expect(valores.rpg_ceiling_world_block).toBe(4096);
        expect(valores.rpg_ceiling_world_history).toBe(5);
    });

    it('Rapido apaga el pensamiento solo en los dos trabajos elegibles (D5)', () => {
        const mapa = VALORES(PERF_PROFILE_IDS.RAPIDO).localThinkingPolicy;
        expect(Object.keys(mapa).sort()).toEqual(['map_evolution_compress', 'state_tracker']);
        for (const jobId of Object.keys(mapa)) {
            expect(mapa[jobId].mode).toBe('desactivar');
            expect(THINKING_JOB_IDS).toContain(jobId);
        }
        const modos = modosPensamientoPerfil(PERF_PROFILE_IDS.RAPIDO);
        expect(modos.lorebook_agent).toBe('heredar');
        expect(modos.world_progression).toBe('heredar');
        expect(Object.keys(modos)).toHaveLength(THINKING_JOB_IDS.length);
    });

    it('Rapido: 1/1 reintentos, margen 3000 (bajarlo arriesga HTTP 400) y salidas 3000/4000/2000', () => {
        const valores = VALORES(PERF_PROFILE_IDS.RAPIDO);
        expect(valores.agenteRetriesExtra).toBe(1);
        expect(valores.jsonCorrectionRetriesExtra).toBe(1);
        expect(valores.rpgAuditChunkBuffer).toBe(3000);
        expect(valores.rpgOutputCapStateTracker).toBe(3000);
        expect(valores.rpgOutputCapWorldProgression).toBe(4000);
        expect(valores.rpgOutputCapMapEvolutionCompress).toBe(2000);
    });

    it('Calidad sube al borde de cada cota y deja la salida en auto', () => {
        const valores = VALORES(PERF_PROFILE_IDS.CALIDAD);
        expect([valores.routerRunEvery, valores.routerMaxTurns]).toEqual([1, 3]);
        expect(valores.rpg_ceiling_tracker_memo).toBe(4000);
        expect(valores.rpg_ceiling_world_block).toBe(8192);
        expect(valores.rpg_ceiling_world_history).toBe(10);
        expect([valores.agenteRetriesExtra, valores.jsonCorrectionRetriesExtra]).toEqual([3, 3]);
        expect(valores.rpgAuditChunkBuffer).toBe(1500);
        for (const clave of ['rpgOutputCapStateTracker', 'rpgOutputCapWorldProgression', 'rpgOutputCapMapEvolutionCompress']) {
            expect(valores[clave], clave).toBe(0);
        }
        expect(valores.localThinkingPolicy).toEqual({});
    });

    it('ningún perfil amplía vueltas fuera de la tabla canónica de la ola 3', () => {
        const pares = PERF_PROFILES.map(p => `${p.valores.routerRunEvery},${p.valores.routerMaxTurns}`);
        for (const par of pares) {
            expect(['1,3', '2,4', '3,5']).toContain(par);
        }
    });

    it('los topes de salida jamás superan las cotas (256-8000) ni el 8000 de la compresión', () => {
        for (const perfil of PERF_PROFILES) {
            expect(perfil.valores.rpgOutputCapMapEvolutionCompress).toBeLessThanOrEqual(8000);
            for (const clave of ['rpgOutputCapStateTracker', 'rpgOutputCapWorldProgression', 'rpgOutputCapMapEvolutionCompress']) {
                const v = perfil.valores[clave];
                expect(v === 0 || (v >= 256 && v <= 8000), `${perfil.id}.${clave}`).toBe(true);
            }
        }
    });

    it('ningún perfil toca motor, slot ni conexión (T14 refuerza por AST)', () => {
        const prohibidas = ['connectionSource', 'openaiModel', 'openaiUrl', 'routerConnectionSource', 'model', 'engine', 'slot', 'parallel', 'apiType'];
        for (const perfil of PERF_PROFILES) {
            for (const clave of prohibidas) {
                expect(perfil.valores, `${perfil.id}.${clave}`).not.toHaveProperty(clave);
            }
        }
    });
});

describe('T3: delegación — sin clamps propios, los aplicadores deciden (D-6/addendum §5)', () => {
    it('un perfil propio con valores pasados de cota entra CLAMPEADO por los de siempre', () => {
        const custom = [{
            nombre: 'Manual',
            valores: {
                routerRunEvery: 99,
                routerMaxTurns: 99,
                rpg_ceiling_tracker_memo: 999999,
                rpg_ceiling_world_block: 7,
                rpg_ceiling_world_history: 0,
                agenteRetriesExtra: 40,
                rpgOutputCapStateTracker: 12000,
                localThinkingPolicy: { lorebook_agent: { mode: 'desactivar' } },
            },
        }];
        const valores = perfProfileValues('Manual', custom);
        expect(valores.routerRunEvery).toBe(6);        // cota ola 3
        expect(valores.routerMaxTurns).toBe(8);        // cota ola 3
        expect(valores.rpg_ceiling_tracker_memo).toBe(4000);  // cota ola 4
        expect(valores.rpg_ceiling_world_block).toBe(2048);
        expect(valores.rpg_ceiling_world_history).toBe(0);    // 0 = sin techo, respeta
        expect(valores.agenteRetriesExtra).toBe(4);            // cota ola 5
        expect(valores.rpgOutputCapStateTracker).toBe(8000);
        // D5: «desactivar» en un trabajo de juicio lo tira el aplicador de la ola 2.
        expect(valores.localThinkingPolicy).toEqual({});
    });

    it('el 0 de un perfil propio sigue siendo auto, no el defecto', () => {
        const valores = perfProfileValues('Cero', [{ nombre: 'Cero', valores: { rpgOutputCapWorldProgression: 0, agenteRetriesExtra: 0 } }]);
        expect(valores.rpgOutputCapWorldProgression).toBe(0);
        expect(valores.agenteRetriesExtra).toBe(0);
    });
});

describe('T3: resolver el perfil desde los ajustes (D-7)', () => {
    it('fábrica ⇒ Equilibrado; cada fila ⇒ la suya', () => {
        expect(resolvePerfProfileId(FABRICA)).toBe(PERF_PROFILE_IDS.EQUILIBRADO);
        for (const perfil of PERF_PROFILES) {
            expect(resolvePerfProfileId({ ...FABRICA, ...perfil.valores }), perfil.id).toBe(perfil.id);
        }
    });

    it('una mezcla cualquiera ⇒ null y la interfaz dice «Personalizado» sin guardarlo', () => {
        const mezcla = { ...FABRICA, ...VALORES(PERF_PROFILE_IDS.RAPIDO), rpgAuditChunkBuffer: 2000 };
        expect(resolvePerfProfileId(mezcla)).toBeNull();
        expect(describePerfProfileName(mezcla)).toBe(PERF_PROFILE_CUSTOM_LABEL_ES);
    });

    it('un blob antiguo (claves ausentes) se lee con los aplicadores y sale Equilibrado', () => {
        expect(resolvePerfProfileId({})).toBe(PERF_PROFILE_IDS.EQUILIBRADO);
    });

    it('empate entre dos nombres: gana el anterior en orden alfabético (addendum §4)', () => {
        const valores = capturarValoresPerfilPropio({ ...FABRICA, ...VALORES(PERF_PROFILE_IDS.RAPIDO) });
        const custom = [{ nombre: 'Zeta', valores }, { nombre: 'Alfa', valores }];
        expect(resolvePerfProfileId({ ...FABRICA, ...valores }, custom)).toBe('Alfa');
    });

    it('un perfil propio que coincide con la fábrica EMPATA con Equilibrado: gana el alfabético (§4)', () => {
        const valores = capturarValoresPerfilPropio(FABRICA);
        expect(resolvePerfProfileId(FABRICA, [{ nombre: 'Mi copia', valores }])).toBe(PERF_PROFILE_IDS.EQUILIBRADO);
        // Un nombre anterior en el alfabeto sí ganaría el empate.
        expect(resolvePerfProfileId(FABRICA, [{ nombre: 'Alpha', valores }])).toBe('Alpha');
    });
});

describe('T3: resumen de deltas para la confirmación (D-8)', () => {
    it('de fábrica a Equilibrado no cambia NADA', () => {
        expect(describePerfProfileDeltas(FABRICA, PERF_PROFILE_IDS.EQUILIBRADO).every(d => !d.cambia)).toBe(true);
        expect(describePerfProfileDeltas(FABRICA, 'Nadie').length).toBe(0);
    });

    it('de fábrica a Rapido cambian seis mandos, con «actual → nuevo» legible', () => {
        const cambian = describePerfProfileDeltas(FABRICA, PERF_PROFILE_IDS.RAPIDO).filter(d => d.cambia);
        expect(cambian.map(d => d.clave).sort()).toEqual([
            'agenteRetriesExtra',
            'jsonCorrectionRetriesExtra',
            'localThinkingPolicy',
            'rpgOutputCapMapEvolutionCompress',
            'rpgOutputCapStateTracker',
            'rpgOutputCapWorldProgression',
        ].sort());
        const salida = cambian.find(d => d.clave === 'rpgOutputCapStateTracker');
        expect(salida.actual).toBe('0 (auto)');
        expect(salida.nuevo).toBe('3000');
        expect(salida.etiqueta).toBe('Salida: Rastreador de Estado (transcripción del memo)');
        const pensamiento = cambian.find(d => d.clave === 'localThinkingPolicy');
        expect(pensamiento.actual).toBe('todo en heredar');
        expect(pensamiento.nuevo).toContain('state_tracker: desactivar');
    });

    it('de fábrica a Calidad cambian ritmo, techos, reintentos y margen', () => {
        const cambian = describePerfProfileDeltas(FABRICA, PERF_PROFILE_IDS.CALIDAD).filter(d => d.cambia).map(d => d.clave);
        expect(cambian).toEqual(expect.arrayContaining([
            'routerRunEvery', 'routerMaxTurns',
            'rpg_ceiling_tracker_memo', 'rpg_ceiling_world_block', 'rpg_ceiling_world_history',
            'agenteRetriesExtra', 'jsonCorrectionRetriesExtra', 'rpgAuditChunkBuffer',
        ]));
        expect(cambian).not.toContain('rpgOutputCapStateTracker');
    });

    it('las etiquetas están en español y las claves de máquina son ASCII', () => {
        for (const delta of describePerfProfileDeltas(FABRICA, PERF_PROFILE_IDS.CALIDAD)) {
            expect(delta.etiqueta, delta.clave).toMatch(/agente|Vueltas|Pensamiento|Techo|Margen|Salida|Reportes|Correcciones/i);
            expect(delta.etiqueta, delta.clave).not.toMatch(/^[a-z_]+$/);
            expect(delta.clave).toMatch(/^[A-Za-z0-9_]+$/);
        }
    });
});

describe('T3: D-6 y D-10 en la vista previa', () => {
    it('un perfil propio que pasa de 12 entre vueltas y reintentos avisa y recorta (solo al escribir)', () => {
        const custom = [{
            nombre: 'Pasado',
            valores: { ...capturarValoresPerfilPropio(FABRICA), routerMaxTurns: 8, agenteRetriesExtra: 4, jsonCorrectionRetriesExtra: 4 },
        }];
        const vista = previewPerfProfile(FABRICA, 'Pasado', custom);
        expect(vista.aplicable).toBe(true);
        expect(vista.avisos.join(' ')).toMatch(/12/);
        expect(vista.coste.porBucle).toBe(8 * (1 + 4)); // las vueltas no se tocan
    });

    it('los tres perfiles de matriz cumplen el tope de 12 sin recorte', () => {
        for (const perfil of PERF_PROFILES) {
            const vista = previewPerfProfile(FABRICA, perfil.id);
            expect(vista.avisos, perfil.id).toEqual([]);
            const v = perfil.valores;
            expect(v.routerMaxTurns + v.agenteRetriesExtra + v.jsonCorrectionRetriesExtra).toBeLessThanOrEqual(12);
        }
    });

    it('el dial de pensamiento solo queda libre en Equilibrado (D-10)', () => {
        expect(perfilGobiernaPensamiento(PERF_PROFILE_IDS.EQUILIBRADO)).toBe(false);
        expect(perfilGobiernaPensamiento(PERF_PROFILE_IDS.RAPIDO)).toBe(true);
        expect(perfilGobiernaPensamiento(PERF_PROFILE_IDS.CALIDAD)).toBe(true);
    });

    it('un perfil inexistente no es aplicable y avisa sin tocar nada', () => {
        const vista = previewPerfProfile(FABRICA, 'Fantasma');
        expect(vista.aplicable).toBe(false);
        expect(vista.avisos[0]).toMatch(/no existe/);
    });
});

describe('T3: perfiles propios (addendum §4)', () => {
    it('rechaza nombre vacío, duplicado, de matriz, «Personalizado» y larguísimo', () => {
        expect(validarNombrePerfilPropio('   ').motivo).toMatch(/vacío/);
        expect(validarNombrePerfilPropio('Rapido').motivo).toMatch(/matrices/);
        expect(validarNombrePerfilPropio('Máxima calidad').motivo).toMatch(/matrices/);
        expect(validarNombrePerfilPropio(PERF_PROFILE_CUSTOM_LABEL_ES).motivo).toMatch(/reservado/);
        expect(validarNombrePerfilPropio('x'.repeat(PERF_PROFILE_NAME_MAX + 1)).motivo).toMatch(/50/);
        expect(validarNombrePerfilPropio('Mi fila', [{ nombre: 'Mi fila', valores: {} }]).motivo).toMatch(/Ya tienes/);
        expect(validarNombrePerfilPropio('Mi fila').valido).toBe(true);
    });

    it('guardar no muta la lista de entrada y sustituye el mismo nombre', () => {
        const inicial = [{ nombre: 'Uno', valores: { rpgAuditChunkBuffer: 1500 } }];
        const congelado = JSON.stringify(inicial);
        const primero = guardarPerfilPropio(inicial, 'Dos', FABRICA);
        expect(JSON.stringify(inicial)).toBe(congelado);
        expect(primero.lista.map(p => p.nombre)).toEqual(['Uno', 'Dos']);
        const segundo = guardarPerfilPropio(primero.lista, 'Dos', { ...FABRICA, rpgAuditChunkBuffer: 500 });
        expect(segundo.lista.map(p => p.nombre)).toEqual(['Uno', 'Dos']);
        expect(segundo.lista.find(p => p.nombre === 'Dos').valores.rpgAuditChunkBuffer).toBe(500);
    });

    it('guardar rechaza nombre inválido devolviendo la lista intacta', () => {
        const inicial = [{ nombre: 'Uno', valores: {} }];
        const r = guardarPerfilPropio(inicial, 'Equilibrado', FABRICA);
        expect(r.motivo).toMatch(/matrices/);
        expect(r.lista).toEqual(inicial);
    });

    it('borrar es idempotente y avisa de si hubo algo que borrar', () => {
        const inicial = [{ nombre: 'Uno', valores: {} }, { nombre: 'Dos', valores: {} }];
        const una = borrarPerfilPropio(inicial, 'Uno');
        expect(una.eliminado).toBe(true);
        expect(una.lista.map(p => p.nombre)).toEqual(['Dos']);
        const dosVeces = borrarPerfilPropio(una.lista, 'Uno');
        expect(dosVeces.eliminado).toBe(false);
        expect(dosVeces.lista).toEqual(una.lista);
    });

    it('la captura de un perfil propio solo toma las claves de la matriz (sin overrides FR)', () => {
        const valores = capturarValoresPerfilPropio({ ...FABRICA, fullReviewSystemPromptOverride: 'texto' });
        expect(Object.keys(valores).sort()).toEqual([...PERF_PROFILE_SETTINGS_KEYS].sort());
        expect(valores).not.toHaveProperty('fullReviewSystemPromptOverride');
    });
});

describe('T3: costes honestos para los tooltips', () => {
    it('Rapido hace MENOS llamadas que Equilibrado y Calidad muchas más (~3,3× fábrica)', () => {
        const rap = estimarCostePerfil(PERF_PROFILE_IDS.RAPIDO);
        const eq = estimarCostePerfil(PERF_PROFILE_IDS.EQUILIBRADO);
        const cal = estimarCostePerfil(PERF_PROFILE_IDS.CALIDAD);
        expect(rap.total).toBeLessThan(eq.total);
        expect(cal.pasadas / eq.pasadas).toBeCloseTo(10 / 3, 1); // ~3,3× las pasadas de fábrica
        expect(cal.normal).toBe(10 * 3 * (1 + 3));
    });

    it('el resumen de la matriz trae coste de ritmo y de llamadas por fila', () => {
        const resumen = resumenMatrizPerfPerfiles();
        expect(resumen).toHaveLength(3);
        for (const fila of resumen) {
            expect(fila.coste).toHaveProperty('pasadas');
            expect(fila.llamadas).toHaveProperty('total');
            expect(fila.tooltip.length).toBeGreaterThan(40);
        }
    });
});
