/**
 * src/state/lore-rhythm.js — Ritmo único del Agente de Lorebook (ola 3, C2+C6).
 *
 * Un solo dial gobierna el PAR coherente (routerRunEvery, routerMaxTurns): la
 * frecuencia y las vueltas del bucle texto-acción NO son dialables independientes
 * (laudo del oráculo). Cada fila de la tabla canónica cumple la regla
 * `maxTurns = runEvery + 2`: un commit por pasada + un turno investigado por
 * mensaje acumulado + un margen.
 *
 * Módulo PURO y congelado (patrón thinking-policy.js): sin imports, sin estado,
 * sin tocar ajustes. El render lee; solo el cambio de dial o de un campo suelto
 * escribe. Los valores guardados que no coinciden EXACTAMENTE con una fila son
 * «Personalizado (avanzado)» y jamás se reescriben (AC0).
 */

/** Cuarta opción del dial: valores sueltos del usuario, fuera de tabla. */
export const LORE_RHYTHM_CUSTOM_ID = 'personalizado';

/**
 * Tabla canónica (D-1). Cada fila se escribe en UNA línea con el literal
 * `runEvery: N, maxTurns: M` para que AC3 (grep de unicidad) sea determinista.
 * La fila `factory` es la única que coincide con buildDefaultSettings(): (3,5).
 */
export const LORE_RHYTHM_PRESETS = Object.freeze([
    Object.freeze({ id: 'cada_turno', runEvery: 1, maxTurns: 3, label: 'Cada turno (máximo detalle)' }),
    Object.freeze({ id: 'cada_2', runEvery: 2, maxTurns: 4, label: 'Cada 2 turnos (equilibrado)' }),
    Object.freeze({ id: 'cada_3', runEvery: 3, maxTurns: 5, label: 'Cada 3 turnos (ahorrativo)' }),
]);

/** Fila de fábrica (la posición del dial que muestra los valores de siempre). */
export const FACTORY_RHYTHM_ID = 'cada_3';

/** Cotas de los dos campos sueltos en modo personalizado (D-2). */
export const LORE_RHYTHM_CUSTOM_BOUNDS = Object.freeze({
    runEvery: Object.freeze([1, 6]),
    maxTurns: Object.freeze([2, 8]),
});

/** Claves de ajustes que escribe el dial. */
export const LORE_RHYTHM_SETTINGS_KEYS = Object.freeze({
    runEvery: 'routerRunEvery',
    maxTurns: 'routerMaxTurns',
});

/**
 * @param {unknown} valor
 * @returns {number|null} Entero seguro o null. Vacío, nulo o booleano NUNCA son
 * cero: se devuelven null para que el llamador ignore el campo en vez de
 * escribir un ritmo falso (AC0: leer no escribe).
 */
function enteroSeguro(valor) {
    if (valor === null || valor === undefined || typeof valor === 'boolean') return null;
    if (typeof valor === 'string' && valor.trim() === '') return null;
    const n = Number(valor);
    return Number.isSafeInteger(n) ? n : null;
}

/**
 * Id de la fila de tabla que describen unos ajustes, o `personalizado` si no
 * coinciden EXACTAMENTE con ninguna fila (D-2). Leer no escribe: la función no
 * muta la entrada ni inventa valores por defecto.
 * @param {unknown} ajustes Objeto de ajustes (o cualquier objeto con las dos claves)
 * @returns {string} id de `LORE_RHYTHM_PRESETS` o `LORE_RHYTHM_CUSTOM_ID`
 */
export function resolveLoreRhythmId(ajustes) {
    if (!ajustes || typeof ajustes !== 'object') return LORE_RHYTHM_CUSTOM_ID;
    const runEvery = enteroSeguro(ajustes[LORE_RHYTHM_SETTINGS_KEYS.runEvery]);
    const maxTurns = enteroSeguro(ajustes[LORE_RHYTHM_SETTINGS_KEYS.maxTurns]);
    if (runEvery === null || maxTurns === null) return LORE_RHYTHM_CUSTOM_ID;
    const fila = LORE_RHYTHM_PRESETS.find(
        preset => preset.runEvery === runEvery && preset.maxTurns === maxTurns,
    );
    return fila ? fila.id : LORE_RHYTHM_CUSTOM_ID;
}

/**
 * Fila de tabla por id; `personalizado` o id desconocido devuelven null.
 * @param {unknown} id
 * @returns {ReadonlyObject|null}
 */
export function getLoreRhythmPreset(id) {
    return LORE_RHYTHM_PRESETS.find(preset => preset.id === String(id || '')) || null;
}

/**
 * Coste estimado de una fila sobre 10 turnos (D-1), para tooltips honestos:
 *  - pasadas: ⌊10 / runEvery⌋
 *  - típicas: pasadas × 3 (investigación + commit; la pasada cierra al primer
 *    commit validado y el tick se resetea tras cada pasada)
 *  - peor: pasadas × (maxTurns + 2) (todas las vueltas gastadas; los 2
 *    reintentos de agente no consumen vuelta, así que no cuentan)
 * @param {unknown} fila Fila de la tabla (o cualquier objeto con las dos claves)
 * @returns {{turnos:number,pasadas:number,tipicas:number,peor:number}}
 */
export function rhythmPresetEstimate(fila) {
    const runEvery = enteroSeguro(fila?.runEvery);
    const maxTurns = enteroSeguro(fila?.maxTurns);
    if (!runEvery || runEvery < 1 || maxTurns === null || maxTurns < 1) {
        return { turnos: 10, pasadas: 0, tipicas: 0, peor: 0 };
    }
    const pasadas = Math.floor(10 / runEvery);
    return { turnos: 10, pasadas, tipicas: pasadas * 3, peor: pasadas * (maxTurns + 2) };
}

/**
 * Clamp del módulo para los dos campos sueltos (D-2). Devuelve el entero tal
 * cual si ya está en cota, el valor recortado si se pasa, y null si no es un
 * entero utilizable (vacío, texto, decimal): el llamador decide ignorar o
 * repintar — el módulo nunca escribe nada.
 * @param {'runEvery'|'maxTurns'} campo
 * @param {unknown} valor
 * @returns {number|null}
 */
export function clampLoreRhythmCustom(campo, valor) {
    const cota = LORE_RHYTHM_CUSTOM_BOUNDS[campo];
    if (!cota) return null;
    const n = enteroSeguro(valor);
    if (n === null) return null;
    return Math.min(Math.max(n, cota[0]), cota[1]);
}

/** Los valores de fábrica que aplica el botón «Restaurar» (AC4): fila FACTORY. */
export function factoryRhythmValues() {
    const fila = getLoreRhythmPreset(FACTORY_RHYTHM_ID) || LORE_RHYTHM_PRESETS[LORE_RHYTHM_PRESETS.length - 1];
    return { runEvery: fila.runEvery, maxTurns: fila.maxTurns };
}
