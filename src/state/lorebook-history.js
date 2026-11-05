/** Returns true when a lorebook belongs to one campaign prefix. */
export function bookBelongsToCampaignPrefix(bookName, prefix) {
    if (!prefix) return false;
    const lowerBook = String(bookName).toLowerCase();
    const lowerPrefix = String(prefix).toLowerCase();
    if (lowerBook === lowerPrefix) return true;
    const rest = lowerBook.startsWith(`${lowerPrefix}_`)
        ? lowerBook.slice(lowerPrefix.length + 1)
        : null;
    return rest !== null && !rest.includes('_');
}

/** Lorebook names explicitly represented by a history state. */
export function getLorebookSnapshotNames(snapshot = {}) {
    const names = new Set(Array.isArray(snapshot.campaignBookNames) ? snapshot.campaignBookNames : []);
    for (const name of Object.keys(snapshot.bookSnapshots || {})) names.add(name);
    // Formato 2 (spec 2026-11-05, D1-A): las huellas cubren TODOS los libros de la
    // campaña aunque no guarden copia. Sin unirlas aquí, un libro intacto sin copia
    // parecería "creado por el paso" y el deshacer lo borraría.
    for (const name of Object.keys(snapshot.bookFingerprintsPre || {})) names.add(name);
    // Ownership list is part of the pre-pass baseline so a temporarily undiscovered
    // owned book is never treated as "created" and deleted on undo.
    for (const name of Array.isArray(snapshot.campaignBooks) ? snapshot.campaignBooks : []) {
        if (name) names.add(name);
    }
    return [...names].filter(Boolean);
}

/**
 * Nombres de los libros que una entrada del historial representa, sin duplicados
 * y sin orden garantizado. Equivale a `getLorebookSnapshotNames` y existe como
 * nombre explícito del formato 2.
 * @param {any} entry
 * @returns {string[]}
 */
export function getEntryBookNames(entry = {}) {
    return getLorebookSnapshotNames(entry);
}

/**
 * True cuando la entrada puede devolverse al estado anterior al paso.
 * Reglas de la spec 2026-11-05 (D1/D6, R3):
 *   - con cualquier copia textual, es restaurable (formato 1 o 2);
 *   - una entrada cerrada en formato 2 sin copias también lo es: el paso no tocó
 *     ningún libro y el deshacer sólo reponen los metadatos;
 *   - una entrada sin cerrar (`finalized: false`) y sin copias NO lo es: se quedó
 *     a medias y no hay preimagen que restaurar.
 * @param {any} entry
 * @returns {boolean}
 */
export function isEntryRestorable(entry = {}) {
    if (!entry || typeof entry !== 'object') return false;
    if (Object.keys(entry.bookSnapshots || {}).length > 0) return true;
    if (entry.finalized === false) return false;
    if (entry.snapshotFormat === 2) return true;
    // Formato antiguo: se restaura tal cual mientras exista su bloque de copias.
    return Object.prototype.hasOwnProperty.call(entry, 'bookSnapshots');
}

/**
 * Preimagen guardada de un libro, o null si la entrada no la conserva (el paso no
 * lo cambió). El deshacer NUNCA toca un libro sin preimagen.
 * @param {any} entry
 * @param {string} bookName
 * @returns {any|null}
 */
export function getBookPreimage(entry = {}, bookName = '') {
    const copias = entry?.bookSnapshots;
    if (!copias || typeof copias !== 'object') return null;
    return Object.prototype.hasOwnProperty.call(copias, bookName) ? copias[bookName] : null;
}

/**
 * Libros cuyo contenido cambió entre dos mapas de huellas: difiere la huella,
 * aparece el libro (creado) o desaparece (borrado por el paso).
 * @param {Record<string,string>|null|undefined} preHuellas
 * @param {Record<string,string>|null|undefined} postHuellas
 * @returns {string[]}
 */
export function changedBooksFromFingerprints(preHuellas, postHuellas) {
    const pre = preHuellas && typeof preHuellas === 'object' ? preHuellas : {};
    const post = postHuellas && typeof postHuellas === 'object' ? postHuellas : {};
    return [...new Set([...Object.keys(pre), ...Object.keys(post)])]
        .filter(name => pre[name] !== post[name]);
}


/**
 * True when a Lorebook Agent history/redo entry belongs to the active chat.
 * Prefer chatId; legacy snapshots without chatId fall back to campaign prefix.
 */
export function isLoreHistoryEntryForChat(entry, { chatId = null, campaignPrefix = '' } = {}) {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.chatId != null && String(entry.chatId).length > 0 && chatId != null && String(chatId).length > 0) {
        return String(entry.chatId) === String(chatId);
    }
    if (!entry.chatId && entry.campaignPrefix && campaignPrefix) {
        return String(entry.campaignPrefix).toLowerCase() === String(campaignPrefix).toLowerCase();
    }
    return false;
}

/** True only when both halves of a redo pair belong to the active chat. */
export function isLoreRedoEntryForChat(entry, scope = {}) {
    return !!entry
        && isLoreHistoryEntryForChat(entry.prePassSnapshot, scope)
        && isLoreHistoryEntryForChat(entry.postPassState, scope);
}

/** Index of the newest history entry that may be undone in the active chat. */
export function findLoreHistoryIndexForChat(history = [], scope = {}) {
    if (!Array.isArray(history)) return -1;
    return history.findIndex(entry => isLoreHistoryEntryForChat(entry, scope));
}

/**
 * Remove the rolled-back entry and any newer entries for the same chat while
 * preserving interleaved history from every other chat.
 */
export function trimLoreHistoryForRollback(history = [], index = -1) {
    if (!Array.isArray(history)) return [];
    if (index < 0 || index >= history.length) return [...history];
    const target = history[index];
    const scope = {
        chatId: target?.chatId ?? null,
        campaignPrefix: target?.campaignPrefix || '',
    };
    return history.filter((entry, entryIndex) =>
        entryIndex > index || !isLoreHistoryEntryForChat(entry, scope));
}

function bookNamesFromLogEntries(entries = []) {
    const names = new Set();
    for (const entry of entries) {
        for (const id of entry?.record || []) {
            const name = String(id || '').split('::')[0];
            if (name) names.add(name);
        }
    }
    return names;
}

/**
 * Identifies books that a pass created without treating every campaign-prefixed
 * book as disposable. New snapshots carry an exact list. Legacy snapshots fall
 * back to the pass's recorded entry IDs, which is deliberately conservative.
 */
export function getCreatedLorebookNames({ snapshot = {}, currentNames = [], currentRouterLog = [], historyIndex = 0, prefix = '' } = {}) {
    const currentSet = new Set(currentNames);
    const prePassSet = new Set(getLorebookSnapshotNames(snapshot));

    if (Array.isArray(snapshot.createdBookNames)) {
        return snapshot.createdBookNames.filter(name =>
            currentSet.has(name)
            && !prePassSet.has(name)
            && bookBelongsToCampaignPrefix(name, prefix));
    }

    let passLogEntries;
    if (Array.isArray(snapshot.routerLog)) {
        const addedCount = Math.max(0, currentRouterLog.length - snapshot.routerLog.length);
        passLogEntries = currentRouterLog.slice(0, addedCount);
    } else {
        // Compatibility for snapshots made before routerLog was captured.
        passLogEntries = currentRouterLog.slice(0, Math.max(1, historyIndex + 1));
    }

    const referenced = bookNamesFromLogEntries(passLogEntries);
    return [...referenced].filter(name =>
        currentSet.has(name)
        && !prePassSet.has(name)
        && bookBelongsToCampaignPrefix(name, prefix));
}
