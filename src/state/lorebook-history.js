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
    return [...names].filter(Boolean);
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
