import { describe, expect, it } from 'vitest';
import {
    AG_CONTROL_KEYS,
    AG_CONTROL_SPECS,
    AG_CONTROL_SUM_CEILING,
    OUTPUT_CAP_BOUNDS,
    OUTPUT_CAP_JOBS,
    analizarAgControl,
    analizarOutputCap,
    clampAgControl,
    clampOutputCap,
    estimarLlamadasDeBucles,
    leerControlesEfectivos,
    outputCapSettingsKey,
    tooltipAgControl,
    validateAgentControlSet,
} from '../../src/state/agent-controls.js';

// T1 (spec 2026-11-08, D-1/D-2/D-3/D-6): módulo PURO de mandos. Cero DOM, cero
// ajustes: solo clamps deterministas, la especificación única de cada mando y los
// números honestos de los dos bucles. Cero VRAM y cero red.

const LITERAL_REINTENTOS = 'Reintentos extra cuando algo sale mal formado. 0 = ninguno: el primer Action mal formado cierra la pasada con error. No gastan vueltas: solo añaden llamadas.';
const LITERAL_MARGEN = 'Tokens reservados antes de partir la auditoría (500-8000, 3000 hoy). Bajarlo hace trozos más grandes y puede dar HTTP 400.';
const LITERAL_SALIDA = '0 = auto: rige la cascada de hoy (8192); el campo del Agente arrastra rastreador y mundo y este techo manda sobre él.';

describe('T1: clampAgControl — un solo sitio de especificación (D-1)', () => {
    it('los tres mandos existen con su defecto y su cota de la spec D-2', () => {
        expect(AG_CONTROL_SPECS[AG_CONTROL_KEYS.agentRetries]).toMatchObject({ default: 2, min: 0, max: 4 });
        expect(AG_CONTROL_SPECS[AG_CONTROL_KEYS.jsonCorrections]).toMatchObject({ default: 2, min: 0, max: 4 });
        expect(AG_CONTROL_SPECS[AG_CONTROL_KEYS.auditChunkBuffer]).toMatchObject({ default: 3000, min: 500, max: 8000, step: 500 });
    });

    it('el 0 de reintento es un valor legítimo: se clampea a 0, NUNCA al defecto (addendum §5)', () => {
        for (const clave of [AG_CONTROL_KEYS.agentRetries, AG_CONTROL_KEYS.jsonCorrections]) {
            expect(clampAgControl(clave, 0), clave).toBe(0);
            expect(clampAgControl(clave, '0'), clave).toBe(0);
            expect(analizarAgControl(clave, 0).estado, clave).toBe('ok');
        }
    });

    it.each([
        ['cadena vacía', ''],
        ['espacios', '   '],
        ['texto', 'muchas'],
        ['nulo', null],
        ['indefinido', undefined],
        ['booleano', true],
        ['decimal', 2.5],
        ['NaN', Number.NaN],
        ['negativo', -3],
    ])('inválido (%s) ⇒ defecto registrado y estado «invalido» (AC1: nunca se guarda)', (_nombre, crudo) => {
        const clave = AG_CONTROL_KEYS.agentRetries;
        const analisis = analizarAgControl(clave, crudo);
        expect(analisis.valor).toBe(AG_CONTROL_SPECS[clave].default);
        expect(analisis.estado).toBe('invalido');
        expect(analisis.motivo.length).toBeGreaterThan(0);
    });

    it('entero fuera de cota ⇒ borde más cercano con estado «recortado»', () => {
        expect(clampAgControl(AG_CONTROL_KEYS.agentRetries, 9)).toBe(4);
        expect(analizarAgControl(AG_CONTROL_KEYS.agentRetries, 9).estado).toBe('recortado');
        expect(clampAgControl(AG_CONTROL_KEYS.auditChunkBuffer, 12000)).toBe(8000);
        expect(clampAgControl(AG_CONTROL_KEYS.auditChunkBuffer, 10)).toBe(500);
        expect(clampAgControl(AG_CONTROL_KEYS.auditChunkBuffer, 2750)).toBe(2750);
    });

    it('el margen de la auditoría NO confunde 0 con «sin margen»: 0 es inválido ⇒ 3000', () => {
        // 0 reintentos significa «ninguno»; 0 de margen partiría la auditoría con
        // el límite entero y el prompt desbordaría el contexto: ahí el 0 no vale.
        expect(analizarAgControl(AG_CONTROL_KEYS.auditChunkBuffer, 0).estado).not.toBe('ok');
        expect(clampAgControl(AG_CONTROL_KEYS.auditChunkBuffer, 0)).toBe(500);
    });

    it('mando desconocido: explota en vez de inventar un defecto', () => {
        expect(() => analizarAgControl('noExiste', 1)).toThrow(/mando desconocido/i);
    });

    it('leer no escribe: el análisis no muta nada ni guarda ajustes', () => {
        const ajustes = { [AG_CONTROL_KEYS.agentRetries]: 7 };
        const copia = JSON.stringify(ajustes);
        leerControlesEfectivos(ajustes);
        analizarAgControl(AG_CONTROL_KEYS.agentRetries, 7);
        expect(JSON.stringify(ajustes)).toBe(copia);
    });
});

describe('T1: clampOutputCap — 0 = auto sin tocar la cascada (D-3)', () => {
    it('los tres trabajos con cap son los que hoy NO tienen campo (nada duplicado)', () => {
        expect(OUTPUT_CAP_JOBS.map(j => j.jobId)).toEqual(['state_tracker', 'world_progression', 'map_evolution_compress']);
        expect(OUTPUT_CAP_BOUNDS).toEqual([256, 8000]);
    });

    it('0 → 0 (auto: la cascada de `resolveMaxTokens` queda intacta)', () => {
        for (const job of OUTPUT_CAP_JOBS) {
            expect(clampOutputCap(job.jobId, 0), job.jobId).toBe(0);
            expect(analizarOutputCap(job.jobId, 0).estado, job.jobId).toBe('ok');
        }
    });

    it('trabajo sin cap o desconocido ⇒ 0 = auto, jamás un tope inventado (addendum §5)', () => {
        expect(clampOutputCap('lorebook_agent', 4000)).toBe(0);
        expect(clampOutputCap('narrador', 4000)).toBe(0);
        expect(clampOutputCap('', 4000)).toBe(0);
        expect(outputCapSettingsKey('lorebook_agent')).toBe('');
    });

    it('cap inválido ⇒ aviso y auto, sin escribir (addendum §5)', () => {
        for (const crudo of ['', '   ', 'mucho', null, undefined, true, 1500.5, -10]) {
            const analisis = analizarOutputCap('state_tracker', crudo);
            expect(analisis.valor, String(crudo)).toBe(0);
            expect(analisis.estado, String(crudo)).toBe('invalido');
            expect(analisis.motivo.length).toBeGreaterThan(0);
        }
    });

    it('cap fuera de rango ⇒ borde más cercano con aviso', () => {
        expect(clampOutputCap('state_tracker', 100)).toBe(256);
        expect(clampOutputCap('state_tracker', 9000)).toBe(8000);
        expect(analizarOutputCap('state_tracker', 9000).estado).toBe('recortado');
    });

    it('cada cap tiene su clave de ajustes en inglés (token de máquina)', () => {
        expect(OUTPUT_CAP_JOBS.map(j => j.settingsKey)).toEqual([
            'rpgOutputCapStateTracker',
            'rpgOutputCapWorldProgression',
            'rpgOutputCapMapEvolutionCompress',
        ]);
        for (const job of OUTPUT_CAP_JOBS) {
            expect(outputCapSettingsKey(job.jobId)).toBe(job.settingsKey);
        }
    });
});

describe('T1: leerControlesEfectivos — una lectura para todo el bucle (T8)', () => {
    it('sin claves nuevas cae en los literales de siempre (2/2/3000 y 5 vueltas)', () => {
        expect(leerControlesEfectivos({})).toEqual({
            routerMaxTurns: 5,
            [AG_CONTROL_KEYS.agentRetries]: 2,
            [AG_CONTROL_KEYS.jsonCorrections]: 2,
            [AG_CONTROL_KEYS.auditChunkBuffer]: 3000,
        });
    });

    it('respeta el 0 del usuario en los dos reintentos', () => {
        const leido = leerControlesEfectivos({ [AG_CONTROL_KEYS.agentRetries]: 0, [AG_CONTROL_KEYS.jsonCorrections]: 0 });
        expect(leido[AG_CONTROL_KEYS.agentRetries]).toBe(0);
        expect(leido[AG_CONTROL_KEYS.jsonCorrections]).toBe(0);
    });

    it('un valor basura no rompe el bucle: devuelve mando válido', () => {
        const leido = leerControlesEfectivos({
            routerMaxTurns: 'muchas',
            [AG_CONTROL_KEYS.agentRetries]: 'cero?',
            [AG_CONTROL_KEYS.auditChunkBuffer]: -1,
        });
        expect(leido.routerMaxTurns).toBe(5);
        expect(leido[AG_CONTROL_KEYS.agentRetries]).toBe(2);
        expect(leido[AG_CONTROL_KEYS.auditChunkBuffer]).toBe(3000);
    });
});

describe('T1: validateAgentControlSet — la suma ≤ 12 solo al escribir (D-6)', () => {
    it('el ejemplo de la spec: 5/4/4 ⇒ 5/4/3', () => {
        const r = validateAgentControlSet({ routerMaxTurns: 5, [AG_CONTROL_KEYS.agentRetries]: 4, [AG_CONTROL_KEYS.jsonCorrections]: 4 });
        expect(r.suma).toBeLessThanOrEqual(AG_CONTROL_SUM_CEILING);
        expect(r.valores).toEqual({ routerMaxTurns: 5, [AG_CONTROL_KEYS.agentRetries]: 4, [AG_CONTROL_KEYS.jsonCorrections]: 3 });
        expect(r.cambios).toEqual([{ clave: AG_CONTROL_KEYS.jsonCorrections, de: 4, a: 3 }]);
        expect(r.avisos.length).toBe(1);
    });

    it('primero se bajan las correcciones de JSON y solo después los reintentos del Agente', () => {
        const r = validateAgentControlSet({ routerMaxTurns: 8, [AG_CONTROL_KEYS.agentRetries]: 4, [AG_CONTROL_KEYS.jsonCorrections]: 4 });
        expect(r.valores[AG_CONTROL_KEYS.jsonCorrections]).toBe(0);
        expect(r.valores[AG_CONTROL_KEYS.agentRetries]).toBe(4);
        expect(r.valores.routerMaxTurns).toBe(8);
        const r2 = validateAgentControlSet({ routerMaxTurns: 11, [AG_CONTROL_KEYS.agentRetries]: 4, [AG_CONTROL_KEYS.jsonCorrections]: 4 });
        expect(r2.valores[AG_CONTROL_KEYS.jsonCorrections]).toBe(0);
        expect(r2.valores[AG_CONTROL_KEYS.agentRetries]).toBe(1);
        expect(r2.suma).toBe(12);
    });

    it('routerMaxTurns NUNCA se recorta: es del dial de ritmo (ola 3)', () => {
        for (const vueltas of [2, 5, 8]) {
            const r = validateAgentControlSet({ routerMaxTurns: vueltas, [AG_CONTROL_KEYS.agentRetries]: 4, [AG_CONTROL_KEYS.jsonCorrections]: 4 });
            expect(r.valores.routerMaxTurns).toBe(vueltas);
            expect(r.cambios.every(c => c.clave !== 'routerMaxTurns')).toBe(true);
            expect(r.suma).toBeLessThanOrEqual(AG_CONTROL_SUM_CEILING);
        }
    });

    it('con las dos columnas en 0 y muchas vueltas no hay a quién recortar: aviso sin bucle infinito', () => {
        const r = validateAgentControlSet({ routerMaxTurns: 8, [AG_CONTROL_KEYS.agentRetries]: 0, [AG_CONTROL_KEYS.jsonCorrections]: 0 });
        expect(r.valores).toEqual({ routerMaxTurns: 8, [AG_CONTROL_KEYS.agentRetries]: 0, [AG_CONTROL_KEYS.jsonCorrections]: 0 });
        expect(r.cambios).toEqual([]);
    });

    it('idempotente: recortar dos veces el resultado no vuelve a cambiar nada', () => {
        const una = validateAgentControlSet({ routerMaxTurns: 5, [AG_CONTROL_KEYS.agentRetries]: 4, [AG_CONTROL_KEYS.jsonCorrections]: 4 });
        const dos = validateAgentControlSet(una.valores);
        expect(dos.valido).toBe(true);
        expect(dos.cambios).toEqual([]);
        expect(dos.valores).toEqual(una.valores);
    });

    it('una suma legítima no escribe ni avisa nada', () => {
        const r = validateAgentControlSet({ routerMaxTurns: 5, [AG_CONTROL_KEYS.agentRetries]: 2, [AG_CONTROL_KEYS.jsonCorrections]: 2 });
        expect(r.valido).toBe(true);
        expect(r.avisos).toEqual([]);
        expect(r.cambios).toEqual([]);
    });
});

describe('T1: números reales de los DOS bucles para tooltips y para T13', () => {
    it('fábrica (3,5) con 2 reintentos: 15 llamadas por bucle, 3 pasadas, 90 en total', () => {
        const est = estimarLlamadasDeBucles({ runEvery: 3, maxTurns: 5, [AG_CONTROL_KEYS.agentRetries]: 2 });
        expect(est).toEqual({ turnos: 10, pasadas: 3, porBucle: 15, normal: 45, limpieza: 45, total: 90 });
    });

    it('0 reintentos = una llamada por vuelta (el throw del primer fallo)', () => {
        const est = estimarLlamadasDeBucles({ runEvery: 3, maxTurns: 5, [AG_CONTROL_KEYS.agentRetries]: 0 });
        expect(est.porBucle).toBe(5);
        expect(est.total).toBe(30);
    });

    it('los dos bucles comparten mando y presupuesto de vueltas (D-2: sin mando propio)', () => {
        const est = estimarLlamadasDeBucles({ runEvery: 1, maxTurns: 3, [AG_CONTROL_KEYS.agentRetries]: 3 });
        expect(est.normal).toBe(est.limpieza);
        expect(est.pasadas).toBe(10);
        expect(est.porBucle).toBe(12);
    });

    it('valores basura no revientan el tooltip', () => {
        expect(estimarLlamadasDeBucles({}).pasadas).toBe(3);
        expect(estimarLlamadasDeBucles({ runEvery: 0, maxTurns: null }).porBucle).toBe(15);
    });
});

describe('T1: textos en español con los literales del addendum §2', () => {
    it('el tooltip de los reintentos es el literal y avisa de los DOS bucles', () => {
        const t = AG_CONTROL_SPECS[AG_CONTROL_KEYS.agentRetries].tooltip;
        expect(t).toContain(LITERAL_REINTENTOS);
        expect(t).toContain('DOS bucles');
        expect(t).toContain('el normal y el de limpieza');
        expect(AG_CONTROL_SPECS[AG_CONTROL_KEYS.jsonCorrections].tooltip).toContain(LITERAL_REINTENTOS);
    });

    it('el margen cita el rango y el HTTP 400 (literal)', () => {
        expect(AG_CONTROL_SPECS[AG_CONTROL_KEYS.auditChunkBuffer].tooltip).toContain(LITERAL_MARGEN);
    });

    it('cada tope de salida cita la cascada del 8192 (literal) y su cota', () => {
        for (const job of OUTPUT_CAP_JOBS) {
            expect(job.tooltip, job.jobId).toContain(LITERAL_SALIDA);
            expect(job.tooltip, job.jobId).toContain('256-8000');
        }
        const compresion = OUTPUT_CAP_JOBS.find(j => j.jobId === 'map_evolution_compress');
        expect(compresion.tooltip).toContain('NUNCA sube ese tope');
    });

    it('tooltipAgControl añade los números de la posición y el aviso del recorte', () => {
        const base = tooltipAgControl(AG_CONTROL_KEYS.auditChunkBuffer);
        expect(base).toContain('Rango 500-8000, paso 500; defecto 3000.');
        const recortado = analizarAgControl(AG_CONTROL_KEYS.auditChunkBuffer, 12000);
        expect(tooltipAgControl(AG_CONTROL_KEYS.auditChunkBuffer, recortado)).toContain('se queda en 8000');
        expect(tooltipAgControl('nada')).toBe('');
    });

    it('los textos en español llevan acentos y las claves de máquina son ASCII', () => {
        const tooltips = Object.values(AG_CONTROL_SPECS).map(s => s.tooltip).concat(OUTPUT_CAP_JOBS.map(j => j.tooltip));
        for (const texto of tooltips) {
            expect(texto, texto).toMatch(/[ÁÉÍÓÚÑáéíóúñ]/);
        }
        for (const clave of Object.keys(AG_CONTROL_SPECS).concat(OUTPUT_CAP_JOBS.map(j => j.settingsKey))) {
            expect(clave, clave).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
        }
    });
});
