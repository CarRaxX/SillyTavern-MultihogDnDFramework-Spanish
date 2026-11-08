/**
 * src/state/performance-profiles.js — Perfiles de rendimiento con nombre
 * (ola 5, C10). Módulo PURO: son DATOS que delegan en los aplicadores ya
 * existentes, nunca clamps ni lógica propia (D-7, vetado por AST en T14).
 *
 * Delegación obligatoria (addendum §5 D-6):
 *  - el PAR de ritmo se pide a la tabla canónica de la ola 3 (`getLoreRhythmPreset`
 *    y sus claves `LORE_RHYTHM_SETTINGS_KEYS`);
 *  - los techos salen de `clampPromptCeiling` (ola 4), que es quien conoce sus
 *    cotas y su regla del 0;
 *  - la política de pensamiento pasa por `normalizeThinkingPolicyEntry`, que es
 *    quien rechaza `desactivar` en los seis trabajos de juicio (D5);
 *  - los mandos de bucle/margen y los topes de salida pasan por
 *    `clampAgControl`/`clampOutputCap` (ola 5) y el validador cruzado de la suma
 *    ≤ 12 es `validateAgentControlSet` (D-6), que recorta al escribir.
 *
 * Lo que NO hace este módulo: escribir ajustes, tocar el DOM, llamar al modelo,
 * prometer ahorro de ritmo (la tabla de la ola 3 no tiene ninguna fila más lenta
 * que la de fábrica: `Rapido` conserva el par (3,5) y ahorra apagando el
 * pensamiento en los dos elegibles y topando la salida), ni gobernar el motor, el
 * slot `parallel = 1` o la conexión de ningún trabajo.
 *
 * Los overrides de Revisión Completa NO viajan en perfiles (addendum §4): son
 * texto, no un mando de coste, y viajan con su propio cajón.
 */

import {
    FACTORY_RHYTHM_ID,
    LORE_RHYTHM_PRESETS,
    LORE_RHYTHM_SETTINGS_KEYS,
    clampLoreRhythmCustom,
    factoryRhythmValues,
    getLoreRhythmPreset,
    rhythmPresetEstimate,
} from './lore-rhythm.js';
import { PROMPT_CEILING_SETTINGS_KEYS, clampPromptCeiling } from './prompt-ceilings.js';
import {
    THINKING_JOBS,
    THINKING_MODES,
    THINKING_POLICY_SETTINGS_KEY,
    normalizeThinkingPolicy,
    normalizeThinkingPolicyEntry,
} from './thinking-policy.js';
import {
    AG_CONTROL_KEYS,
    OUTPUT_CAP_JOBS,
    clampAgControl,
    clampOutputCap,
    estimarLlamadasDeBucles,
    outputCapSettingsKey,
    validateAgentControlSet,
} from './agent-controls.js';

/** Ids de máquina (ASCII, sin acentos): son valores persistidos. */
export const PERF_PROFILE_IDS = Object.freeze({
    RAPIDO: 'Rapido',
    EQUILIBRADO: 'Equilibrado',
    CALIDAD: 'Calidad',
});

/** Fila que se muestra cuando nada coincide: se DERIVA, nunca se guarda (D-7). */
export const PERF_PROFILE_CUSTOM_LABEL_ES = 'Personalizado';

/** El perfil de fábrica es el que coincide, clave a clave, con `main`. */
export const PERF_PROFILE_DEFAULT_ID = PERF_PROFILE_IDS.EQUILIBRADO;

/** Tope de longitud del nombre de un perfil propio (addendum §4). */
export const PERF_PROFILE_NAME_MAX = 50;

/** Los tres modos, para fijarlos en la matriz cuando el perfil los gobierna. */
const MODO_HEREDAR = THINKING_MODES.INHERIT;
const MODO_APAGADO = THINKING_MODES.OFF;

/**
 * Política de pensamiento de cada perfil, en la forma que se PERSISTE: solo las
 * entradas distintas de `heredar` (así lo guarda `normalizeThinkingPolicy` de la
 * ola 2, y así un blob de fábrica sigue coincidiendo byte a byte). `Rapido` apaga
 * el pensamiento SOLO en los dos trabajos que lo admiten (D5); `Equilibrado` y
 * `Calidad` no apagan ninguno.
 * @param {string[]} apagados
 * @returns {Record<string, {mode:string,tokens?:number}>}
 */
function politicaPensamiento(apagados = []) {
    const crudo = {};
    for (const jobId of apagados) crudo[jobId] = { mode: MODO_APAGADO };
    return normalizeThinkingPolicy(crudo);
}

/**
 * Vista de los ocho modos que FIJA un perfil (D-10): el cajón de pensamiento usa
 * esto para marcar el dial como gobernado por el perfil. Es derivada, no se
 * guarda: lo persistido es el mapa compacto de arriba.
 * @param {string} id
 * @param {Array} [custom]
 * @returns {Record<string,string>} jobId → modo
 */
export function modosPensamientoPerfil(id, custom = []) {
    const mapa = perfProfileValues(id, custom)?.[THINKING_POLICY_SETTINGS_KEY] || {};
    const modos = {};
    for (const trabajo of THINKING_JOBS) {
        modos[trabajo.id] = mapa[trabajo.id]?.mode || MODO_HEREDAR;
    }
    return modos;
}

/**
 * ¿Gobierna el perfil los ocho diables de pensamiento? `Equilibrado` no: deja el
 * dial libre (es la fila de fábrica, D-10). Los otros dos fijan los modos, así
 * que el dial se marca como heredado y vuelve a estar activo si se toca un modo.
 * @param {string} id
 * @returns {boolean}
 */
export function perfilGobiernaPensamiento(id) {
    return id === PERF_PROFILE_IDS.RAPIDO || id === PERF_PROFILE_IDS.CALIDAD;
}

/**
 * Construye los valores de un perfil. Las claves salen de los mapas de cada ola
 * (aquí no se escribe ningún nombre de ajuste a mano) y los valores pasan por su
 * aplicador, de modo que un error en la matriz se corrige solo con la cota real.
 * @param {{ritmo:string,pensamiento:string[],techos?:object,reintentos?:object,margen?:number,salidas?:object}} declaracion
 * @returns {Record<string, unknown>}
 */
function valoresDelPerfil(declaracion) {
    const fila = getLoreRhythmPreset(declaracion.ritmo)
        || getLoreRhythmPreset(FACTORY_RHYTHM_ID)
        || LORE_RHYTHM_PRESETS[LORE_RHYTHM_PRESETS.length - 1];
    const valores = {
        // El PAR de ritmo pasa por el clamp de la ola 3 (cotas 1-6 / 2-8): el
        // perfil no inventa cotas, solo pide una fila de la tabla canónica.
        [LORE_RHYTHM_SETTINGS_KEYS.runEvery]: clampLoreRhythmCustom('runEvery', fila.runEvery),
        [LORE_RHYTHM_SETTINGS_KEYS.maxTurns]: clampLoreRhythmCustom('maxTurns', fila.maxTurns),
        [THINKING_POLICY_SETTINGS_KEY]: politicaPensamiento(declaracion.pensamiento),
    };
    for (const clave of Object.keys(PROMPT_CEILING_SETTINGS_KEYS)) {
        valores[PROMPT_CEILING_SETTINGS_KEYS[clave]] = clampPromptCeiling(clave, declaracion.techos?.[clave]);
    }
    valores[AG_CONTROL_KEYS.agentRetries] = clampAgControl(AG_CONTROL_KEYS.agentRetries, declaracion.reintentos?.agente);
    valores[AG_CONTROL_KEYS.jsonCorrections] = clampAgControl(AG_CONTROL_KEYS.jsonCorrections, declaracion.reintentos?.correcciones);
    valores[AG_CONTROL_KEYS.auditChunkBuffer] = clampAgControl(AG_CONTROL_KEYS.auditChunkBuffer, declaracion.margen);
    for (const trabajo of OUTPUT_CAP_JOBS) {
        valores[trabajo.settingsKey] = clampOutputCap(trabajo.jobId, declaracion.salidas?.[trabajo.jobId]);
    }
    return valores;
}

/**
 * Matriz D-7 (addendum §1). Tres filas y nada más: una cuarta columna
 * «Personalizado» rompería «fábrica = defecto y referencia».
 *  - `Rapido` NO cambia el ritmo: la tabla de la ola 3 no tiene fila más lenta que
 *    la de fábrica (3,5) y bajar `runEvery` a 4-6 sacaría el dial de tabla y
 *    retrasaría el lore. Su ahorro es pensamiento apagado + topes de salida.
 *  - `Calidad` sube al borde de cada cota (4000/8192/10), 3/3/3 de reintentos y
 *    margen 1500; los topes de salida en 0 = auto.
 * Los valores crudos de techos/reintentos/margen/salidas se entregan al aplicador
 * de cada ola: las cotas no se duplican aquí.
 */
const MATRIZ = Object.freeze([
    Object.freeze({
        id: PERF_PROFILE_IDS.RAPIDO,
        label: 'Rápido',
        resumen: 'Ritmo de fábrica, pensamiento apagado en los dos trabajos que lo admiten y salida topada.',
        tooltip: 'NO cambia el ritmo: sigue (3,5), ≈9 llamadas (≤21) por 10 turnos, igual que fábrica. Ahorra apagando el pensamiento en los dos trabajos que lo admiten y topando la salida.',
        filaRitmo: FACTORY_RHYTHM_ID,
        declaracion: {
            ritmo: FACTORY_RHYTHM_ID,
            pensamiento: ['state_tracker', 'map_evolution_compress'],
            reintentos: { agente: 1, correcciones: 1 },
            margen: 3000,
            salidas: { state_tracker: 3000, world_progression: 4000, map_evolution_compress: 2000 },
        },
    }),
    Object.freeze({
        id: PERF_PROFILE_IDS.EQUILIBRADO,
        label: 'Equilibrado',
        resumen: 'Los valores de siempre, clave por clave: no cambia ni un byte de la salida.',
        tooltip: 'Fábrica: ritmo (3,5), pensamiento en Heredar, techos 1600/4096/5, 2/2 reintentos, margen 3000 y salida en auto (rige la cascada de 8192).',
        filaRitmo: FACTORY_RHYTHM_ID,
        declaracion: {
            ritmo: FACTORY_RHYTHM_ID,
            pensamiento: [],
            reintentos: {},
            margen: undefined,
            salidas: {},
        },
    }),
    Object.freeze({
        id: PERF_PROFILE_IDS.CALIDAD,
        label: 'Máxima calidad',
        resumen: 'Todo al borde de su cota: el agente corre cada turno y los bloques viajan enteros.',
        tooltip: '(1,3) ≈30 (≤50) por 10 turnos, ~3,3× que fábrica. Techos al borde (4000/8192/10), 3/3/3 reintentos y margen 1500; salida en auto. Nunca amplía vueltas por encima de su tabla.',
        filaRitmo: 'cada_turno',
        declaracion: {
            ritmo: 'cada_turno',
            pensamiento: [],
            techos: { trackerMemo: 4000, worldBlock: 8192, worldHistory: 10 },
            reintentos: { agente: 3, correcciones: 3 },
            margen: 1500,
            salidas: {},
        },
    }),
]);

/** @type {ReadonlyArray<ReadonlyObject>} Matriz con los valores ya delegados. */
export const PERF_PROFILES = Object.freeze(MATRIZ.map(fila => Object.freeze({
    id: fila.id,
    label: fila.label,
    resumen: fila.resumen,
    tooltip: fila.tooltip,
    filaRitmo: fila.filaRitmo,
    valores: Object.freeze(valoresDelPerfil(fila.declaracion)),
})));

export const PERF_PROFILE_LABELS_ES = Object.freeze(
    PERF_PROFILES.reduce((acc, perfil) => ({ ...acc, [perfil.id]: perfil.label }), {}),
);

/**
 * Claves que gobierna un perfil (la matriz es exacta sobre ESTAS y solo sobre
 * estas). Son doce, no once: dos de ritmo + una de pensamiento + tres de techos +
 * tres de mandos + tres de salida. El addendum §4 dice «11»; la diferencia es que
 * aquí `localThinkingPolicy` cuenta como una sola clave (mapa de los ocho
 * trabajos) y los tres topes de salida cuentan como tres (así lo fija D-7 y el
 * addendum §5). Se compara sobre esta lista, no sobre un número escrito a mano.
 */
export const PERF_PROFILE_SETTINGS_KEYS = Object.freeze([
    ...Object.values(LORE_RHYTHM_SETTINGS_KEYS),
    THINKING_POLICY_SETTINGS_KEY,
    ...Object.values(PROMPT_CEILING_SETTINGS_KEYS),
    ...Object.values(AG_CONTROL_KEYS),
    ...OUTPUT_CAP_JOBS.map(j => j.settingsKey),
]);

/** Perfil de matriz por id, o null. */
export function getPerfProfile(id) {
    return PERF_PROFILES.find(perfil => perfil.id === String(id || '')) || null;
}

/** Perfil propio (addendum §4) por nombre, o null. */
export function getPerfProfileCustom(lista, nombre) {
    const limpio = String(nombre || '').trim();
    if (!Array.isArray(lista)) return null;
    return lista.find(perfil => String(perfil?.nombre || '').trim() === limpio) || null;
}

/**
 * Valores efectivos de un perfil (matriz o propio) sobre un contenedor de
 * ajustes, ya pasados por los aplicadores de cada ola. `null` si el nombre no es
 * de nadie: el llamador no escribe nada (AC0).
 * @param {string} id Id de matriz o nombre propio
 * @param {Array} [custom] Lista de perfiles propios (`rpgPerfProfileCustom`)
 * @returns {Record<string,unknown>|null}
 */
export function perfProfileValues(id, custom = []) {
    const deMatriz = getPerfProfile(id);
    if (deMatriz) return { ...deMatriz.valores };
    const propio = getPerfProfileCustom(custom, id);
    if (!propio) return null;
    const reconstruido = valoresDesdeClaves(propio.valores || {});
    return reconstruido;
}

/**
 * Vuelve a pasar por los aplicadores las claves de un perfil propio: un perfil
 * guardado a mano o importado no puede colar valores fuera de cota (el mismo
 * camino que la matriz, cero lógica paralela).
 * @param {Record<string, unknown>} claves
 * @returns {Record<string, unknown>}
 */
function valoresDesdeClaves(claves) {
    const salida = {};
    for (const clave of PERF_PROFILE_SETTINGS_KEYS) {
        if (!(clave in claves)) continue;
        salida[clave] = lecturaClaveEfectiva(claves, clave);
    }
    return salida;
}

/**
 * Comparación exacta (addendum §4): igualdad clave a clave DESPUÉS de su clamp.
 * `undefined` en el contenedor se lee como el defecto del aplicador, así que un
 * blob antiguo coincide con la fila de fábrica.
 * @param {unknown} settings
 * @param {Record<string,unknown>} valores
 * @returns {boolean}
 */
function coincideConPerfil(settings, valores) {
    for (const clave of PERF_PROFILE_SETTINGS_KEYS) {
        if (!(clave in valores)) return false;
        const esperado = valores[clave];
        const actual = lecturaClaveEfectiva(settings, clave);
        if (clave === THINKING_POLICY_SETTINGS_KEY) {
            if (JSON.stringify(ordenado(actual)) !== JSON.stringify(ordenado(esperado))) return false;
        } else if (actual !== esperado) {
            return false;
        }
    }
    return true;
}

/** Lee una clave de la matriz ya pasada por su aplicador (sin escribir nada). */
function lecturaClaveEfectiva(settings, clave) {
    if (clave === LORE_RHYTHM_SETTINGS_KEYS.runEvery || clave === LORE_RHYTHM_SETTINGS_KEYS.maxTurns) {
        const campo = clave === LORE_RHYTHM_SETTINGS_KEYS.runEvery ? 'runEvery' : 'maxTurns';
        const recortado = clampLoreRhythmCustom(campo, settings?.[clave]);
        // El clamp de la ola 3 devuelve null con clave ausente o basura: ahí la
        // lectura correcta es la fila de fábrica (el deep-merge de `getSettings`
        // siempre la trae), no «no coincide con nada».
        return recortado === null ? factoryRhythmValues()[campo] : recortado;
    }
    if (clave === THINKING_POLICY_SETTINGS_KEY) return normalizeThinkingPolicy(settings?.[clave] || {});
    if (Object.values(PROMPT_CEILING_SETTINGS_KEYS).includes(clave)) {
        const nombre = Object.keys(PROMPT_CEILING_SETTINGS_KEYS).find(k => PROMPT_CEILING_SETTINGS_KEYS[k] === clave);
        return clampPromptCeiling(nombre, settings?.[clave]);
    }
    if (Object.values(AG_CONTROL_KEYS).includes(clave)) return clampAgControl(clave, settings?.[clave]);
    if (OUTPUT_CAP_JOBS.some(j => j.settingsKey === clave)) {
        const trabajo = OUTPUT_CAP_JOBS.find(j => j.settingsKey === clave);
        return clampOutputCap(trabajo.jobId, settings?.[clave]);
    }
    return settings?.[clave];
}

/** Mapa ordenado por clave, para comparar políticas sin depender del orden. */
function ordenado(mapa) {
    if (!mapa || typeof mapa !== 'object') return {};
    const salida = {};
    for (const clave of Object.keys(mapa).sort()) salida[clave] = mapa[clave];
    return salida;
}

/**
 * Qué perfil describe los ajustes de ahora mismo. Coincidencia EXACTA sobre las
 * claves de la matriz; si empatan dos nombres (posible con perfiles propios),
 * gana el anterior en orden alfabético (addendum §4). Sin coincidencia devuelve
 * null y la interfaz muestra `PERF_PROFILE_CUSTOM_LABEL_ES` sin guardarlo (D-7).
 * @param {unknown} settings
 * @param {Array} [custom]
 * @returns {string|null}
 */
export function resolvePerfProfileId(settings, custom = []) {
    const candidatos = [];
    for (const perfil of PERF_PROFILES) {
        if (coincideConPerfil(settings, perfil.valores)) candidatos.push(perfil.id);
    }
    for (const propio of (Array.isArray(custom) ? custom : [])) {
        const nombre = String(propio?.nombre || '').trim();
        if (!nombre) continue;
        if (coincideConPerfil(settings, valoresDesdeClaves(propio.valores || {}))) candidatos.push(nombre);
    }
    if (!candidatos.length) return null;
    return candidatos.slice().sort((a, b) => String(a).localeCompare(String(b)))[0];
}

/** Nombre que ve el usuario en el selector: el perfil o «Personalizado». */
export function describePerfProfileName(settings, custom = []) {
    const id = resolvePerfProfileId(settings, custom);
    if (!id) return PERF_PROFILE_CUSTOM_LABEL_ES;
    return PERF_PROFILE_LABELS_ES[id] || id;
}

/** Etiqueta en español de una clave de la matriz (para el resumen `actual→nuevo`). */
export function etiquetaClavePerfPerfil(clave) {
    if (clave === LORE_RHYTHM_SETTINGS_KEYS.runEvery) return 'Frecuencia del agente (cada N mensajes)';
    if (clave === LORE_RHYTHM_SETTINGS_KEYS.maxTurns) return 'Vueltas por pasada';
    if (clave === THINKING_POLICY_SETTINGS_KEY) return 'Pensamiento por trabajo';
    const techos = {
        [PROMPT_CEILING_SETTINGS_KEYS.trackerMemo]: 'Techo del memo de estado',
        [PROMPT_CEILING_SETTINGS_KEYS.worldBlock]: 'Techo del bloque de mundo',
        [PROMPT_CEILING_SETTINGS_KEYS.worldHistory]: 'Reportes históricos de mundo',
    };
    if (techos[clave]) return techos[clave];
    const mandos = {
        [AG_CONTROL_KEYS.agentRetries]: 'Reintentos extra del Agente',
        [AG_CONTROL_KEYS.jsonCorrections]: 'Correcciones de JSON',
        [AG_CONTROL_KEYS.auditChunkBuffer]: 'Margen de la auditoría',
    };
    if (mandos[clave]) return mandos[clave];
    const salida = OUTPUT_CAP_JOBS.find(j => j.settingsKey === clave);
    if (salida) return `Salida: ${salida.label}`;
    return clave;
}

/** Valor legible en español (los tokens de máquina siguen en inglés). */
export function formatearValorPerfPerfil(clave, valor) {
    if (clave === THINKING_POLICY_SETTINGS_KEY) {
        const mapa = valor && typeof valor === 'object' ? valor : {};
        const encendidos = THINKING_JOBS
            .filter(trabajo => mapa[trabajo.id]?.mode && mapa[trabajo.id].mode !== MODO_HEREDAR)
            .map(trabajo => `${trabajo.id}: ${mapa[trabajo.id].mode}`);
        return encendidos.length ? encendidos.join(' · ') : 'todo en heredar';
    }
    if (valor === 0 && OUTPUT_CAP_JOBS.some(j => j.settingsKey === clave)) return '0 (auto)';
    return String(valor ?? '');
}

/**
 * Resumen `actual → nuevo` para la confirmación de D-8: una fila por clave de la
 * matriz que SÍ cambia. Las claves que quedan igual no salen (el usuario no tiene
 * que leer ocho líneas de «igual»).
 * @param {unknown} settings
 * @param {string} id
 * @param {Array} [custom]
 * @returns {Array<{clave:string,etiqueta:string,actual:string,nuevo:string,cambia:boolean}>}
 */
export function describePerfProfileDeltas(settings, id, custom = []) {
    const valores = perfProfileValues(id, custom);
    if (!valores) return [];
    const deltas = [];
    for (const clave of PERF_PROFILE_SETTINGS_KEYS) {
        if (!(clave in valores)) continue;
        const actual = lecturaClaveEfectiva(settings, clave);
        const nuevo = valores[clave];
        const mismo = clave === THINKING_POLICY_SETTINGS_KEY
            ? JSON.stringify(ordenado(actual)) === JSON.stringify(ordenado(nuevo))
            : actual === nuevo;
        deltas.push({
            clave,
            etiqueta: etiquetaClavePerfPerfil(clave),
            actual: formatearValorPerfPerfil(clave, actual),
            nuevo: formatearValorPerfPerfil(clave, nuevo),
            cambia: !mismo,
        });
    }
    return deltas;
}

/**
 * Vista previa completa para el `Popup` de D-8 (getters + etiqueta de la matriz).
 * El botón se llama así: «Aplicar perfil» es acción explícita, nunca un efecto
 * secundario de abrir los ajustes (D-8).
 * @param {unknown} settings
 * @param {string} id
 * @param {Array} [custom]
 * @returns {{perfil:{id:string,label:string,resumen:string,tooltip:string},aplicable:boolean,deltas:Array,queCambian:Array,avisos:string[],coste:object}}
 */
export function previewPerfProfile(settings, id, custom = []) {
    const deMatriz = getPerfProfile(id);
    const propio = deMatriz ? null : getPerfProfileCustom(custom, id);
    const valores = perfProfileValues(id, custom);
    const avisos = [];
    if (!valores) {
        return {
            perfil: { id: String(id || ''), label: String(id || ''), resumen: '', tooltip: '' },
            aplicable: false, deltas: [], queCambian: [],
            avisos: ['Ese perfil no existe: no se cambia nada.'],
            coste: estimarLlamadasDeBucles({}),
        };
    }
    const deltas = describePerfProfileDeltas(settings, id, custom);
    // D-6: la suma ≤ 12 se comprueba aquí (y se aplica al escribir), para que la
    // confirmación muestre lo que de verdad se va a guardar.
    const efectivos = {
        routerMaxTurns: valores[LORE_RHYTHM_SETTINGS_KEYS.maxTurns],
        [AG_CONTROL_KEYS.agentRetries]: valores[AG_CONTROL_KEYS.agentRetries],
        [AG_CONTROL_KEYS.jsonCorrections]: valores[AG_CONTROL_KEYS.jsonCorrections],
    };
    const validacion = validateAgentControlSet(efectivos);
    for (const cambio of validacion.cambios) {
        avisos.push(`Para respetar el tope de 12 entre vueltas y reintentos, ${etiquetaClavePerfPerfil(cambio.clave)} queda en ${cambio.a}.`);
    }
    const coste = estimarLlamadasDeBucles({
        runEvery: valores[LORE_RHYTHM_SETTINGS_KEYS.runEvery],
        maxTurns: validacion.valores.routerMaxTurns,
        [AG_CONTROL_KEYS.agentRetries]: validacion.valores[AG_CONTROL_KEYS.agentRetries],
    });
    return {
        perfil: deMatriz || {
            id: String(propio?.nombre || id),
            label: String(propio?.nombre || id),
            resumen: 'Perfil propio guardado por ti.',
            tooltip: 'Tus valores, repasados por los mismos clamps que la matriz.',
        },
        aplicable: true,
        deltas,
        queCambian: deltas.filter(d => d.cambia),
        avisos,
        coste,
    };
}

/**
 * Valida el nombre de un perfil propio (addendum §4): vacío, duplicado, igual a
 * una de las tres matrices o larguísimo se rechazan. Se compara con ids y
 * etiquetas para que «Rápido» y `Rapido` no cuelen dos filas distintas.
 * @param {unknown} nombre
 * @param {Array} [custom]
 * @returns {{valido:boolean,limpio:string,motivo:string}}
 */
export function validarNombrePerfilPropio(nombre, custom = []) {
    const limpio = String(nombre ?? '').trim();
    if (!limpio) return { valido: false, limpio, motivo: 'El nombre no puede estar vacío.' };
    if (limpio.length > PERF_PROFILE_NAME_MAX) {
        return { valido: false, limpio, motivo: `Como mucho ${PERF_PROFILE_NAME_MAX} caracteres.` };
    }
    if (limpio === PERF_PROFILE_CUSTOM_LABEL_ES) {
        return { valido: false, limpio, motivo: '«Personalizado» está reservado: lo deriva la interfaz.' };
    }
    const tomado = PERF_PROFILES.some(perfil => perfil.id === limpio || perfil.label === limpio);
    if (tomado) return { valido: false, limpio, motivo: 'Ese nombre es de una de las tres matrices.' };
    const repetido = Array.isArray(custom) && custom.some(p => String(p?.nombre || '').trim() === limpio);
    if (repetido) return { valido: false, limpio, motivo: 'Ya tienes un perfil con ese nombre.' };
    return { valido: true, limpio, motivo: '' };
}

/**
 * Captura de los ajustes actuales como perfil propio (addendum §4): solo las
 * claves de la matriz, cada una con su valor ya efectivo. No lleva overrides de
 * Revisión Completa (no viajan en perfiles).
 * @param {unknown} settings
 * @returns {Record<string,unknown>}
 */
export function capturarValoresPerfilPropio(settings) {
    const valores = {};
    for (const clave of PERF_PROFILE_SETTINGS_KEYS) valores[clave] = lecturaClaveEfectiva(settings, clave);
    return valores;
}

/**
 * Devuelve la NUEVA lista con el perfil guardado (no muta la entrada: el llamador
 * decide si persiste). Si el nombre ya estaba, se sustituye su contenido.
 * @param {Array} custom
 * @param {string} nombre
 * @param {unknown} settings
 * @returns {{lista:Array,motivo:string}}
 */
export function guardarPerfilPropio(custom, nombre, settings) {
    const chequeo = validarNombrePerfilPropio(nombre, Array.isArray(custom) ? custom.filter(p => String(p?.nombre || '').trim() !== String(nombre).trim()) : []);
    if (!chequeo.valido) return { lista: Array.isArray(custom) ? custom.slice() : [], motivo: chequeo.motivo };
    const entrada = { nombre: chequeo.limpio, valores: capturarValoresPerfilPropio(settings) };
    const resto = (Array.isArray(custom) ? custom : []).filter(p => String(p?.nombre || '').trim() !== chequeo.limpio);
    return { lista: resto.concat([entrada]), motivo: '' };
}

/**
 * Devuelve la NUEVA lista sin ese perfil. Borrar pide confirmación al llamador
 * (addendum §4); aquí solo se calcula el resultado, que es idempotente: borrar
 * dos veces el mismo nombre no cambia nada más.
 * @param {Array} custom
 * @param {string} nombre
 * @returns {{lista:Array,eliminado:boolean}}
 */
export function borrarPerfilPropio(custom, nombre) {
    const limpio = String(nombre || '').trim();
    const lista = Array.isArray(custom) ? custom : [];
    const sin = lista.filter(p => String(p?.nombre || '').trim() !== limpio);
    return { lista: sin, eliminado: sin.length !== lista.length };
}

/**
 * Coste honesto del perfil sobre 10 turnos, derivado de la tabla de la ola 3 y de
 * los reintentos de la matriz (D-2: los reintentos añaden llamadas, no vueltas).
 * @param {string} id
 * @param {Array} [custom]
 * @returns {object}
 */
export function estimarCostePerfil(id, custom = []) {
    const valores = perfProfileValues(id, custom);
    if (!valores) return estimarLlamadasDeBucles({});
    return estimarLlamadasDeBucles({
        runEvery: valores[LORE_RHYTHM_SETTINGS_KEYS.runEvery],
        maxTurns: valores[LORE_RHYTHM_SETTINGS_KEYS.maxTurns],
        [AG_CONTROL_KEYS.agentRetries]: valores[AG_CONTROL_KEYS.agentRetries],
    });
}

/** Comparativa de las tres filas para el tooltip del selector. */
export function resumenMatrizPerfPerfiles() {
    return PERF_PROFILES.map(perfil => ({
        id: perfil.id,
        label: perfil.label,
        tooltip: perfil.tooltip,
        coste: rhythmPresetEstimate(getLoreRhythmPreset(perfil.filaRitmo)),
        llamadas: estimarCostePerfil(perfil.id),
    }));
}
