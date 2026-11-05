/**
 * src/state/thinking-policy.js — Pensamiento por trabajo (C1).
 *
 * Cada trabajo de fondo puede gobernar el razonamiento del modelo local
 * (llama.cpp) sólo sobre los cuerpos que esta extensión arma por su cuenta
 * (`sendViaOpenAI` y la rama `openai` de `sendAgentTurn`). La política vive en
 * una única clave de ajustes (`localThinkingPolicy`) y su default es `heredar`:
 * cero bytes nuevos en el cuerpo, exactamente el comportamiento de siempre.
 *
 * Los valores de modo son españoles por laudos de la spec (D2/D3); el resto de
 * tokens de máquina (`reasoning_effort`, `chat_template_kwargs`,
 * `reasoning_budget_tokens`, …) se mantienen en inglés.
 */

import { AGENT_CONNECTION_SETUPS } from './connection-setups.js';

/** Estados admisibles de la política (D2). */
export const THINKING_MODES = Object.freeze({
    INHERIT: 'heredar',
    BUDGET: 'presupuesto',
    OFF: 'desactivar',
});

const MODE_VALUES = Object.freeze(Object.values(THINKING_MODES));

/** Rutas efectivas de un trabajo (D8): la política sólo vive en la ruta propia. */
export const THINKING_ROUTES = Object.freeze({
    DIRECT: 'directa',
    ST: 'st',
});

/** Clave de ajustes que guarda la política completa. */
export const THINKING_POLICY_SETTINGS_KEY = 'localThinkingPolicy';

/**
 * Ajuste que decide la fuente de conexión del trabajo. Los trabajos derivados
 * (las dos variantes del rastreador y la compresión del compresor) comparten la
 * conexión del trabajo madre declarado en `connection-setups.js`.
 * @param {{id:string,sourceJob?:string}} job
 */
function connectionSourceKey(job) {
    const setup = AGENT_CONNECTION_SETUPS.find(entry => entry.key === (job.sourceJob || job.id));
    return setup?.settingsKeys?.connectionSource || '';
}

/**
 * Trabajos gobernables y su elegibilidad para `desactivar` (D5).
 * Los trabajos de juicio o narrativa (narrador vía ST, agente de lorebook,
 * mapa, evolución del mundo y revisión completa) nunca admiten `desactivar`.
 */
const JOB_DEFINITIONS = [
    {
        id: 'state_tracker',
        label: 'Rastreador de Estado (transcripción del memo)',
        offEligible: true,
        note: 'Su salida es el memo en texto, no JSON: quitar el pensamiento abarata mucho cada pasada.',
    },
    {
        id: 'tracker_full_review',
        sourceJob: 'state_tracker',
        label: 'Rastreador en modo Revisión de Estado Completa',
        offEligible: false,
        note: 'Reconstruye el memo entero: necesita razonar para no perder secciones.',
    },
    {
        id: 'tracker_audit',
        sourceJob: 'state_tracker',
        label: 'Auditoría de contexto completo del Rastreador',
        offEligible: false,
        note: 'Revisa toda la historia contra el memo: trabajo de juicio.',
    },
    {
        id: 'lorebook_agent',
        label: 'Agente de Lorebook (básico, turno y archivero)',
        offEligible: false,
        note: 'Devuelve JSON de registros: sin pensamiento sube el fallo de contrato.',
    },
    {
        id: 'map_runtime',
        label: 'Actualizador de Mapas',
        offEligible: false,
        note: 'Transacciones JSON sobre el mapa vivo: trabaja mejor con pensamiento.',
    },
    {
        id: 'map_evolution',
        label: 'Evolución de Mapas',
        offEligible: false,
        note: 'Causalidad y hilos abiertos: trabajo de juicio sobre JSON.',
    },
    {
        id: 'map_evolution_compress',
        sourceJob: 'map_evolution',
        label: 'Compresión de historial de Evolución de Mapas',
        offEligible: true,
        note: 'Resume historial ya cerrado: tarea mecánica, buena candidata a sin pensamiento.',
    },
    {
        id: 'world_progression',
        label: 'World Progression',
        offEligible: false,
        note: 'Informe macro del mundo: narrativa y coherencia, necesita razonar.',
    },
];

/** @type {ReadonlyArray<{id:string,label:string,offEligible:boolean,note:string,source:string,modes:ReadonlyArray<string>}>} */
export const THINKING_JOBS = Object.freeze(JOB_DEFINITIONS.map(job => Object.freeze({
    ...job,
    source: connectionSourceKey(job),
    modes: Object.freeze(job.offEligible
        ? [THINKING_MODES.INHERIT, THINKING_MODES.BUDGET, THINKING_MODES.OFF]
        : [THINKING_MODES.INHERIT, THINKING_MODES.BUDGET]),
})));

export const THINKING_JOB_IDS = Object.freeze(THINKING_JOBS.map(job => job.id));

/** @param {unknown} jobId @returns {boolean} */
export function isThinkingJob(jobId) {
    return THINKING_JOB_IDS.includes(String(jobId || ''));
}

/** @param {unknown} jobId */
export function getThinkingJob(jobId) {
    return THINKING_JOBS.find(job => job.id === String(jobId || '')) || null;
}

/** Modos admisibles de un trabajo; trabajo desconocido → solo `heredar`. */
export function allowedThinkingModes(jobId) {
    return getThinkingJob(jobId)?.modes || [THINKING_MODES.INHERIT];
}

/**
 * Valida una entrada suelta de la política (D2). Todo lo que no se entienda
 * devuelve `heredar` por validación, no por convención.
 * @param {unknown} raw
 * @param {string|null} [jobId] Cuando se indica, `desactivar` se rechaza si el trabajo no es elegible (D5)
 * @returns {{mode:string,tokens?:number}}
 */
export function normalizeThinkingPolicyEntry(raw, jobId = null) {
    const mode = typeof raw?.mode === 'string' ? raw.mode.trim() : '';
    if (!MODE_VALUES.includes(mode)) return { mode: THINKING_MODES.INHERIT };
    if (mode === THINKING_MODES.OFF) {
        const allowed = jobId === null
            ? allowedThinkingModes(null).concat(THINKING_MODES.OFF)
            : allowedThinkingModes(jobId);
        if (!allowed.includes(mode)) return { mode: THINKING_MODES.INHERIT };
        return { mode };
    }
    if (mode === THINKING_MODES.BUDGET) {
        const tokens = Number(raw?.tokens);
        if (!Number.isSafeInteger(tokens) || tokens <= 0) return { mode: THINKING_MODES.INHERIT };
        return { mode, tokens };
    }
    return { mode };
}

/**
 * Sanea el mapa completo de la política. Sólo se guardan los trabajos con una
 * política distinta de `heredar`, de modo que un usuario que no mueva nada no
 * añade ni un byte de más a sus ajustes.
 * @param {unknown} raw
 * @returns {Record<string, {mode:string,tokens?:number}>}
 */
export function normalizeThinkingPolicy(raw) {
    const salida = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return salida;
    for (const job of THINKING_JOBS) {
        const entrada = normalizeThinkingPolicyEntry(raw[job.id], job.id);
        if (entrada.mode !== THINKING_MODES.INHERIT) salida[job.id] = entrada;
    }
    return salida;
}

/**
 * Resuelve la política de un trabajo. Acepta el objeto de ajustes completo, el
 * mapa de la política tal cual, o nada (→ `heredar`).
 * @param {unknown} container Ajustes (`{ localThinkingPolicy }`) o el propio mapa
 * @param {string} jobId
 * @returns {{mode:string,tokens?:number}}
 */
export function resolveThinkingPolicy(container, jobId) {
    if (!isThinkingJob(jobId)) return { mode: THINKING_MODES.INHERIT };
    const map = thinkingPolicyMap(container);
    return normalizeThinkingPolicyEntry(map?.[jobId], jobId);
}

/**
 * Extrae el mapa de la política del contenedor que se le pase.
 * @param {unknown} container
 * @returns {Record<string, unknown>}
 */
export function thinkingPolicyMap(container) {
    if (!container || typeof container !== 'object') return {};
    const directo = container[THINKING_POLICY_SETTINGS_KEY];
    if (directo && typeof directo === 'object' && !Array.isArray(directo)) return directo;
    if (THINKING_JOB_IDS.some(id => container[id] !== undefined)) return container;
    return {};
}

/**
 * Traduce la política al cuerpo de la petición (D3). Con `heredar` no toca el
 * objeto: ni añade, ni reordena, ni normaliza un solo byte (D4).
 * @param {Record<string, unknown>} body Cuerpo recién armado por la llamada
 * @param {unknown} policy Entrada de política (cruda o ya saneada)
 * @param {string|null} [jobId] Trabajo de referencia para revalidar `desactivar`
 * @returns {Record<string, unknown>} El mismo cuerpo, con los campos que toquen
 */
export function applyThinkingPolicyToBody(body, policy, jobId = null) {
    if (!body || typeof body !== 'object') return body;
    const entry = normalizeThinkingPolicyEntry(policy, jobId);

    if (entry.mode === THINKING_MODES.OFF) {
        body.reasoning_effort = 'none';
        body.chat_template_kwargs = { ...(body.chat_template_kwargs || {}), enable_thinking: false };
        return body;
    }

    if (entry.mode === THINKING_MODES.BUDGET) {
        // `reasoning_budget_tokens` es el nombre canónico de llama.cpp; el alias
        // cubre binarios viejos que sólo leían `thinking_budget_tokens`.
        // Nunca `reasoning_budget_message`: añadiría texto a la salida.
        body.reasoning_budget_tokens = entry.tokens;
        body.thinking_budget_tokens = entry.tokens;
        return body;
    }

    return body;
}

/**
 * Ruta efectiva del trabajo (D8): con la fuente «OpenAI compatible» el cuerpo es
 * propio y la política aplica; con `default`/`profile` manda SillyTavern y la
 * política queda inerte.
 * @param {unknown} connectionSource
 * @returns {{key:string,label:string,tooltip:string,controlable:boolean}}
 */
export function describeThinkingRoute(connectionSource) {
    const directa = String(connectionSource || '').trim() === 'openai';
    return directa
        ? {
            key: THINKING_ROUTES.DIRECT,
            label: 'Ruta directa',
            tooltip: 'Cuerpo armado por la extensión: la política de pensamiento se aplica de verdad.',
            controlable: true,
        }
        : {
            key: THINKING_ROUTES.ST,
            label: 'Ruta SillyTavern',
            tooltip: 'Manda SillyTavern: la política queda inerte y se aplica el presupuesto global de «Custom Include Body». Para gobernar este trabajo, pon su conexión en «OpenAI compatible».',
            controlable: false,
        };
}

/**
 * Texto en español del estado efectivo de un trabajo, para el log de depuración
 * y para la fila de ruta efectiva del cajón (D8).
 * @param {unknown} container
 * @param {string} jobId
 * @param {unknown} connectionSource
 * @returns {{policy:{mode:string,tokens?:number},route:{key:string,label:string,tooltip:string,controlable:boolean},text:string}}
 */
export function describeThinkingEffect(container, jobId, connectionSource) {
    const policy = resolveThinkingPolicy(container, jobId);
    const route = describeThinkingRoute(connectionSource);
    const politica = policy.mode === THINKING_MODES.BUDGET
        ? `${policy.mode} (${policy.tokens} tokens)`
        : policy.mode;
    return {
        policy,
        route,
        text: route.controlable
            ? `política «${politica}» activa en la ruta directa`
            : `política «${politica}» inerte: ${route.label}`,
    };
}
