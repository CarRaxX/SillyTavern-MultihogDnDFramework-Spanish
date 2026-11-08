/**
 * src/state/agent-controls.js — Mandos de rendimiento (ola 5, C9).
 *
 * Módulo PURO (patrón thinking-policy.js / lore-rhythm.js / prompt-ceilings.js):
 * cero DOM, cero ajustes, cero red, cero modelo. La especificación de cada mando
 * (defecto, mín, máx, paso, etiqueta y tooltip) se exporta EN UN ÚNICO SITIO
 * (D-1) y de ahí salen a la vez el control, la validación y el `title`.
 *
 * Realidad verificada sobre main=9440ed0 (evidencia `.agents/staging/multihog-perf/
 * ola5-diagnostico-c9-2026-11-08.md`), que es lo que los tooltips prometen:
 *  - `agenteRetriesExtra` manda sobre DOS bucles: el normal (`router.js:2672`) y el
 *    de limpieza (`router.js:2153`, `MAX_CLEANUP_RETRIES`).
 *  - `jsonCorrectionRetriesExtra` manda sobre `MAX_JSON_CORRECTION_RETRIES`
 *    (`router.js:2674`); ahí el contador sube ANTES de la comparación, así que
 *    `0` = cero correcciones.
 *  - Los tres reintentos NO descuentan vuelta (`turns--` / `cleanupTurns--` en el
 *    bucle normal y en el de limpieza: solo devuelven la gastada por el reintento);
 *    subirlos añade llamadas, nunca amplía el presupuesto de vueltas.
 *  - Las vueltas de la limpieza NO tienen constante propia: comparten
 *    `routerMaxTurns` (`router.js:1777`) ⇒ sin mando nuevo (D-2), se gobiernan con
 *    el dial de ritmo de la ola 3.
 *  - `rpgAuditChunkBuffer` es el MARGEN del chunk (el literal 3000), no el límite, y
 *    rige los dos sitios que parten la auditoría (`index.js:3609-3611` y
 *    `index.js:11860-11862`).
 *  - `0` en un tope de salida es «auto»: la cascada de siempre (`resolveMaxTokens`
 *    cae a 8192). Un tope puesto manda sobre esa cascada.
 *
 * Ningún valor se escribe aquí: leer NO escribe (AC0). El llamador decide si
 * persiste el valor efectivo o no escribe nada (AC1: inválido ⇒ aviso y valor
 * válido, nunca guardado).
 */

/** Textos literales del addendum §2 (español estricto). */
const TOOLTIP_REINTENTOS = 'Reintentos extra cuando algo sale mal formado. 0 = ninguno: el primer Action mal formado cierra la pasada con error. No gastan vueltas: solo añaden llamadas.';
const TOOLTIP_MARGEN = 'Tokens reservados antes de partir la auditoría (500-8000, 3000 hoy). Bajarlo hace trozos más grandes y puede dar HTTP 400.';
const TOOLTIP_SALIDA = '0 = auto: rige la cascada de hoy (8192); el campo del Agente arrastra rastreador y mundo y este techo manda sobre él.';

/** Claves de ajustes de los tres mandos de bucle/chunk (D-2). */
export const AG_CONTROL_KEYS = Object.freeze({
    agentRetries: 'agenteRetriesExtra',
    jsonCorrections: 'jsonCorrectionRetriesExtra',
    auditChunkBuffer: 'rpgAuditChunkBuffer',
});

/**
 * Espejo de una clave de ajustes sobre el trabajo de pensamiento (`router.js`
 * lee la de ajustes; el trabajo se nombra en inglés, token de máquina).
 */
export const AG_CONTROL_SPECS = Object.freeze({
    [AG_CONTROL_KEYS.agentRetries]: Object.freeze({
        key: AG_CONTROL_KEYS.agentRetries,
        default: 2,
        min: 0,
        max: 4,
        step: 1,
        ceroEsValor: true,
        label: 'Reintentos extra del Agente (normal y limpieza)',
        tooltip: `${TOOLTIP_REINTENTOS} Este mando manda sobre DOS bucles a la vez —el normal y el de limpieza del final—, así que en el peor caso suma llamadas en los dos.`,
    }),
    [AG_CONTROL_KEYS.jsonCorrections]: Object.freeze({
        key: AG_CONTROL_KEYS.jsonCorrections,
        default: 2,
        min: 0,
        max: 4,
        step: 1,
        label: 'Correcciones de JSON mal formado',
        ceroEsValor: true,
        tooltip: `${TOOLTIP_REINTENTOS} Esas correcciones sí gastan vuelta: cada una consume una de las vueltas disponibles pidiendo el JSON corregido.`,
    }),
    [AG_CONTROL_KEYS.auditChunkBuffer]: Object.freeze({
        key: AG_CONTROL_KEYS.auditChunkBuffer,
        default: 3000,
        min: 500,
        max: 8000,
        step: 500,
        label: 'Margen de la auditoría (tokens)',
        tooltip: `${TOOLTIP_MARGEN} Rige los dos sitios que parten la auditoría: la de contexto completo del Rastreador y la «Full Audit» del Agente de Lorebook. El límite resulta de restar este margen al contexto.`,
    }),
});

/**
 * Topes de salida por trabajo (D-3). SOLO los tres que hoy no tienen campo:
 * los otros cuatro (Agente, Map Architect, Map Updater, Map Evolution) ya tienen
 * el suyo y aquí no se duplica ningún cap.
 */
export const OUTPUT_CAP_JOBS = Object.freeze([
    Object.freeze({
        jobId: 'state_tracker',
        settingsKey: 'rpgOutputCapStateTracker',
        label: 'Rastreador de Estado (transcripción del memo)',
        tooltip: `${TOOLTIP_SALIDA} 256-8000 tokens.`,
    }),
    Object.freeze({
        jobId: 'world_progression',
        settingsKey: 'rpgOutputCapWorldProgression',
        label: 'World Progression',
        tooltip: `${TOOLTIP_SALIDA} 256-8000 tokens.`,
    }),
    Object.freeze({
        jobId: 'map_evolution_compress',
        settingsKey: 'rpgOutputCapMapEvolutionCompress',
        label: 'Compresión de Evolución de Mapas',
        tooltip: `${TOOLTIP_SALIDA} 256-8000 tokens. La compresión ya se topa a 8000 dentro de su propio trabajo: este mando NUNCA sube ese tope.`,
    }),
]);

/** Cota común de los topes de salida. `0` = auto vive FUERA a propósito. */
export const OUTPUT_CAP_BOUNDS = Object.freeze([256, 8000]);

/** @type {ReadonlyMap<string, {jobId:string,settingsKey:string,label:string,tooltip:string}>} */
const CAPS_POR_TRABAJO = new Map(OUTPUT_CAP_JOBS.map(j => [j.jobId, j]));

/** Clave de ajustes de un trabajo, o '' si el trabajo no tiene cap (sin cap = auto). */
export function outputCapSettingsKey(jobId) {
    return CAPS_POR_TRABAJO.get(String(jobId || ''))?.settingsKey || '';
}

/**
 * Entero seguro o null. Vacío, nulo, booleano o decimal NUNCA son cero: se
 * devuelven null para que el llamador ignore el campo en vez de escribir un
 * mando falso (AC0: leer no escribe).
 * @param {unknown} valor
 * @returns {number|null}
 */
function enteroSeguro(valor) {
    if (valor === null || valor === undefined || typeof valor === 'boolean') return null;
    if (typeof valor === 'string' && valor.trim() === '') return null;
    const n = Number(valor);
    return Number.isSafeInteger(n) ? n : null;
}

/**
 * Análisis completo de un mando (D-1): valor efectivo + estado + motivo en
 * español. En los dos mandos de reintento `0` es un valor legítimo y se respeta
 * (NO salta al defecto); en el margen de la auditoría el 0 está fuera de cota
 * (partiría la auditoría con el contexto entero y arriesga HTTP 400).
 *  - 'ok'         → el valor ya era válido tal cual
 *  - 'recortado'  → número entero fuera de cota: manda el borde más cercano
 *  - 'invalido'   → no es un entero utilizable: el valor efectivo es el defecto y
 *                   el llamador NO debe escribir nada (AC1)
 * @param {string} clave Una de `AG_CONTROL_KEYS`
 * @param {unknown} crudo
 * @returns {{valor:number,estado:'ok'|'recortado'|'invalido',motivo:string,especificacion:ReadonlyObject}}
 */
export function analizarAgControl(clave, crudo) {
    const spec = AG_CONTROL_SPECS[String(clave || '')];
    if (!spec) throw new Error(`analizarAgControl: mando desconocido "${String(clave)}"`);
    const n = enteroSeguro(crudo);
    if (n === null) {
        return { valor: spec.default, estado: 'invalido', motivo: 'No es un número entero: se usa el valor de fábrica y no se guarda nada.', especificacion: spec };
    }
    if (n === 0 && spec.ceroEsValor) return { valor: 0, estado: 'ok', motivo: '', especificacion: spec };
    if (n < 0) return { valor: spec.default, estado: 'invalido', motivo: 'Negativo: se usa el valor de fábrica y no se guarda nada.', especificacion: spec };
    if (n < spec.min) return { valor: spec.min, estado: 'recortado', motivo: `Por debajo de la cota: se queda en ${spec.min}.`, especificacion: spec };
    if (n > spec.max) return { valor: spec.max, estado: 'recortado', motivo: `Por encima de la cota: se queda en ${spec.max}.`, especificacion: spec };
    return { valor: n, estado: 'ok', motivo: '', especificacion: spec };
}

/**
 * Valor efectivo de un mando: entero seguro clampeado; inválido ⇒ defecto.
 * Nunca lanza ni escribe.
 * @param {string} clave
 * @param {unknown} crudo
 * @returns {number}
 */
export function clampAgControl(clave, crudo) {
    return analizarAgControl(clave, crudo).valor;
}

/**
 * Análisis de un tope de salida por trabajo (D-3).
 *  - `0` → 0 = auto (la cascada de siempre, intacta)
 *  - trabajo sin cap o desconocido → 0 = auto (jamás un tope inventado)
 *  - entero fuera de [256,8000] → borde más cercano, con aviso
 *  - no entero → 'invalido' (el llamador no escribe) y efectivo 0 = auto
 * @param {string} jobId
 * @param {unknown} crudo
 * @returns {{valor:number,estado:'ok'|'recortado'|'invalido',motivo:string,trabajo:ReadonlyObject|null}}
 */
export function analizarOutputCap(jobId, crudo) {
    const trabajo = CAPS_POR_TRABAJO.get(String(jobId || '')) || null;
    if (!trabajo) {
        return { valor: 0, estado: 'ok', motivo: '', trabajo: null };
    }
    const n = enteroSeguro(crudo);
    if (n === null) {
        return { valor: 0, estado: 'invalido', motivo: 'No es un número entero: se queda en auto (0) y no se guarda nada.', trabajo };
    }
    if (n === 0) return { valor: 0, estado: 'ok', motivo: '', trabajo };
    const [min, max] = OUTPUT_CAP_BOUNDS;
    if (n < 0) return { valor: 0, estado: 'invalido', motivo: 'Negativo: se queda en auto (0) y no se guarda nada.', trabajo };
    if (n < min) return { valor: min, estado: 'recortado', motivo: `Por debajo de la cota: se queda en ${min}.`, trabajo };
    if (n > max) return { valor: max, estado: 'recortado', motivo: `Por encima de la cota: se queda en ${max}.`, trabajo };
    return { valor: n, estado: 'ok', motivo: '', trabajo };
}

/**
 * Tope de salida efectivo de un trabajo: `0` = auto; trabajo desconocido → 0.
 * @param {string} jobId
 * @param {unknown} crudo
 * @returns {number}
 */
export function clampOutputCap(jobId, crudo) {
    return analizarOutputCap(jobId, crudo).valor;
}

/**
 * Lectura de los valores EFECTIVOS de todos los mandos (ya clampeados) más las
 * vueltas compartidas por los dos bucles. Es lo único que debe leer un bucle:
 * una vez antes del `while`, para que mover un mando a mitad de pasada no cambie
 * los límites de esa pasada (T8).
 * @param {unknown} settings
 * @returns {{routerMaxTurns:number,agenteRetriesExtra:number,jsonCorrectionRetriesExtra:number,rpgAuditChunkBuffer:number}}
 */
export function leerControlesEfectivos(settings) {
    const maxTurns = enteroSeguro(settings?.routerMaxTurns);
    return {
        routerMaxTurns: maxTurns && maxTurns > 0 ? maxTurns : 5,
        [AG_CONTROL_KEYS.agentRetries]: clampAgControl(AG_CONTROL_KEYS.agentRetries, settings?.[AG_CONTROL_KEYS.agentRetries]),
        [AG_CONTROL_KEYS.jsonCorrections]: clampAgControl(AG_CONTROL_KEYS.jsonCorrections, settings?.[AG_CONTROL_KEYS.jsonCorrections]),
        [AG_CONTROL_KEYS.auditChunkBuffer]: clampAgControl(AG_CONTROL_KEYS.auditChunkBuffer, settings?.[AG_CONTROL_KEYS.auditChunkBuffer]),
    };
}

/** Techo de la suma D-6: vueltas + las dos columnas de reintento. */
export const AG_CONTROL_SUM_CEILING = 12;

/**
 * Validador cruzado (D-6): `routerMaxTurns + agenteRetriesExtra +
 * jsonCorrectionRetriesExtra ≤ 12`. Se aplica SOLO al escribir. Recorte
 * determinista: mientras la suma pase de 12 se baja primero
 * `jsonCorrectionRetriesExtra` y después `agenteRetriesExtra` (mínimo 0);
 * `routerMaxTurns` NUNCA se toca (es del dial de ritmo, ola 3).
 * Ej: 5/4/4 ⇒ 5/4/3.
 * @param {{routerMaxTurns?:unknown,agenteRetriesExtra?:unknown,jsonCorrectionRetriesExtra?:unknown}} efectivos
 * @returns {{valido:boolean,avisos:string[],cambios:Array<{clave:string,de:number,a:number}>,valores:{routerMaxTurns:number,agenteRetriesExtra:number,jsonCorrectionRetriesExtra:number},suma:number}}
 */
export function validateAgentControlSet(efectivos = {}) {
    const valores = {
        [AG_CONTROL_KEYS.agentRetries]: clampAgControl(AG_CONTROL_KEYS.agentRetries, efectivos?.[AG_CONTROL_KEYS.agentRetries]),
        [AG_CONTROL_KEYS.jsonCorrections]: clampAgControl(AG_CONTROL_KEYS.jsonCorrections, efectivos?.[AG_CONTROL_KEYS.jsonCorrections]),
    };
    // Las vueltas no son un mando de esta ola: se leen tal cual (con su defecto 5).
    const vueltas = enteroSeguro(efectivos?.routerMaxTurns);
    valores.routerMaxTurns = vueltas && vueltas > 0 ? vueltas : 5;

    const avisos = [];
    const cambios = [];
    const suma = () => valores.routerMaxTurns
        + valores[AG_CONTROL_KEYS.agentRetries]
        + valores[AG_CONTROL_KEYS.jsonCorrections];
    while (suma() > AG_CONTROL_SUM_CEILING) {
        if (valores[AG_CONTROL_KEYS.jsonCorrections] > 0) {
            const de = valores[AG_CONTROL_KEYS.jsonCorrections];
            valores[AG_CONTROL_KEYS.jsonCorrections] = de - 1;
            cambios.push({ clave: AG_CONTROL_KEYS.jsonCorrections, de, a: valores[AG_CONTROL_KEYS.jsonCorrections] });
            continue;
        }
        if (valores[AG_CONTROL_KEYS.agentRetries] > 0) {
            const de = valores[AG_CONTROL_KEYS.agentRetries];
            valores[AG_CONTROL_KEYS.agentRetries] = de - 1;
            cambios.push({ clave: AG_CONTROL_KEYS.agentRetries, de, a: valores[AG_CONTROL_KEYS.agentRetries] });
            continue;
        }
        break; // Con las dos columnas en 0 ya no hay a quién recortar.
    }
    if (cambios.length) {
        avisos.push(`La suma de vueltas y reintentos (${suma()} tras el recorte) no puede pasar de ${AG_CONTROL_SUM_CEILING}: se han bajado los reintentos extra. Las vueltas del dial de ritmo no se tocan.`);
    }
    return { valido: cambios.length === 0, avisos, cambios, valores, suma: suma() };
}

/**
 * Coste honesto de los dos bucles en 10 turnos, para tooltips y para la suite
 * de rendimiento (T13). Semántica real del código:
 *  - cada vuelta del `while` es UNA llamada;
 *  - un reintento devuelve la vuelta gastada (`turns--`), así que por vuelta del
 *    presupuesto caben `1 + reintentosExtra` llamadas;
 *  - las correcciones de JSON NO devuelven vuelta: consumen las del presupuesto;
 *  - `pasadas = ⌊10 / runEvery⌋` (misma fórmula que `rhythmPresetEstimate`).
 * @param {{runEvery?:number,maxTurns?:number,agenteRetriesExtra?:number}} set
 * @returns {{turnos:number,pasadas:number,porBucle:number,normal:number,limpieza:number,total:number}}
 */
export function estimarLlamadasDeBucles(set = {}) {
    const runEvery = enteroSeguro(set.runEvery);
    const maxTurns = enteroSeguro(set.maxTurns);
    const reintentos = enteroSeguro(set[AG_CONTROL_KEYS.agentRetries]) ?? AG_CONTROL_SPECS[AG_CONTROL_KEYS.agentRetries].default;
    const frecuencia = runEvery && runEvery > 0 ? runEvery : 3;
    const vueltas = maxTurns && maxTurns > 0 ? maxTurns : 5;
    const pasadas = Math.floor(10 / frecuencia);
    const porBucle = vueltas * (1 + Math.max(0, reintentos));
    return {
        turnos: 10,
        pasadas,
        porBucle,
        normal: pasadas * porBucle,
        limpieza: pasadas * porBucle, // el mismo mando gobierna los dos bucles
        total: pasadas * porBucle * 2,
    };
}

/**
 * Texto en español del mando, para el `title` del control: el literal de la
 * especificación más los números reales de la posición actual (AC1: tooltips con
 * números reales, nunca promesas).
 * @param {string} clave
 * @param {{valor:number,estado:string}} analisis Resultado de `analizarAgControl`
 * @param {string} [extra]
 * @returns {string}
 */
export function tooltipAgControl(clave, analisis = null, extra = '') {
    const spec = AG_CONTROL_SPECS[String(clave || '')];
    if (!spec) return '';
    const partes = [spec.tooltip, `Rango ${spec.min}-${spec.max}, paso ${spec.step}; defecto ${spec.default}.`];
    if (analisis && analisis.estado === 'recortado') partes.push(analisis.motivo);
    if (analisis && analisis.estado === 'invalido') partes.push(analisis.motivo);
    if (extra) partes.push(extra);
    return partes.join(' ');
}
