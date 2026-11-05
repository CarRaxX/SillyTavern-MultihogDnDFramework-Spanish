import { trimMemoAndMapHistory } from './dungeon-map-history.js';

export const HISTORY_ENTRY_LIMIT = 20;
export const LOREBOOK_ROLLBACK_LIMIT = 5;

/** Bound memo/map snapshots and recent activity logs stored in settings. */
export function trimStoredHistories(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    let changed = trimMemoAndMapHistory(snapshot);
    for (const key of ['routerLog', 'routerHistory']) {
        const limit = key === 'routerHistory' ? LOREBOOK_ROLLBACK_LIMIT : HISTORY_ENTRY_LIMIT;
        if (Array.isArray(snapshot[key]) && snapshot[key].length > limit) {
            snapshot[key].length = limit;
            changed = true;
        }
    }
    for (const log of Object.values(snapshot.npcRelationshipLog || {})) {
        if (Array.isArray(log) && log.length > HISTORY_ENTRY_LIMIT) {
            log.length = HISTORY_ENTRY_LIMIT;
            changed = true;
        }
    }
    const companionHistory = snapshot.adventureCompanion?.history;
    if (Array.isArray(companionHistory) && companionHistory.length > HISTORY_ENTRY_LIMIT) {
        companionHistory.splice(0, companionHistory.length - HISTORY_ENTRY_LIMIT);
        changed = true;
    }
    return changed;
}

/** Días de inactividad antes de que una partición de `chatStates` sea podable (D4). */
export const CHAT_STATE_INACTIVITY_DAYS = 120;
/** Nunca se poda hasta dejar menos de esta cantidad de particiones (red de seguridad). */
export const CHAT_STATE_MIN_RETAINED = 5;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Último uso conocido de una partición. Sin estampa (`lastSeenAt`, o su predecesora
 * `memoPersistedAt`) la partición NO es podable: sin prueba de inactividad no se
 * borra nada.
 * @param {any} chatState
 * @returns {number}
 */
function ultimoUso(chatState) {
    const estampa = Number(chatState?.lastSeenAt) || Number(chatState?.memoPersistedAt) || 0;
    return Number.isFinite(estampa) ? estampa : 0;
}

/**
 * Ids de `chatStates` inactivos hace más de `dias`, del más antiguo al más nuevo.
 * @param {Record<string, any>} chatStates
 * @param {{ ahora?: number, dias?: number, chatIdActivo?: string|null }} [opts]
 * @returns {string[]}
 */
export function inactiveChatStateIds(chatStates, { ahora = Date.now(), dias = CHAT_STATE_INACTIVITY_DAYS, chatIdActivo = null } = {}) {
    if (!chatStates || typeof chatStates !== 'object') return [];
    const umbral = dias * MS_POR_DIA;
    return Object.entries(chatStates)
        .filter(([chatId, estado]) => {
            if (chatId === chatIdActivo) return false;
            const uso = ultimoUso(estado);
            return uso > 0 && (ahora - uso) > umbral;
        })
        .sort(([, a], [, b]) => ultimoUso(a) - ultimoUso(b))
        .map(([chatId]) => chatId);
}

/**
 * Poda los `chatStates` de chats cerrados hace meses (D4).
 *
 * ESTÁ IMPLEMENTADA Y PROBADA PERO NO ACTIVADA: nadie la llama en el arranque ni en
 * el flujo de guardado. La decisión de podar es del operador (D4 aplazado en la spec
 * 2026-11-05); lo único que se escribe hoy es la estampa `lastSeenAt` para que algún
 * día pueda decidirse con datos.
 * @param {Record<string, any>} settings
 * @param {{ ahora?: number, dias?: number, chatIdActivo?: string|null, minimoConservar?: number }} [opts]
 * @returns {string[]} ids eliminados
 */
export function pruneInactiveChatStates(settings, { ahora = Date.now(), dias = CHAT_STATE_INACTIVITY_DAYS, chatIdActivo = null, minimoConservar = CHAT_STATE_MIN_RETAINED } = {}) {
    const chatStates = settings?.chatStates;
    if (!chatStates || typeof chatStates !== 'object') return [];
    const total = Object.keys(chatStates).length;
    const poda = inactiveChatStateIds(chatStates, { ahora, dias, chatIdActivo })
        .slice(0, Math.max(0, total - minimoConservar));
    for (const chatId of poda) delete chatStates[chatId];
    return poda;
}
