/** World Skeleton lorebooks are hidden from Lorebook Agent tools and the keyring. */
export function isSkeletonBookName(bookName) {
    return String(bookName || '').toLowerCase().endsWith('_skeleton');
}

/**
 * True when the query is a dumped list of names rather than one keyword/phrase.
 * Existence checks belong on ARCHIVE INDEX, not grep_lore.
 */
export function isConcatenatedNameDump(query) {
    const raw = String(query || '').trim();
    if (!raw) return false;
    const commaParts = raw.split(/\s*,\s*/).filter(Boolean);
    if (commaParts.length >= 3) return true;
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length < 8) return false;
    const titled = words.filter(word => /^[A-Z]/.test(word));
    const lowercase = words.filter(word => /^[a-z]/.test(word));
    return titled.length >= 5 && lowercase.length <= 2;
}

const EXISTENCE_GREP_HINT = 'Do not grep to check whether entries exist. ACTIVE MEMORY, NEWLY ACTIVATED THIS TURN, and ARCHIVE INDEX are the complete catalog (ARCHIVE INDEX includes Book::UID, label, and keywords). If a name is not listed, it does not exist — record it. grep_lore takes one keyword or phrase, not a list of names.';

/**
 * Builds the summary "Keyring" text for archive (inactive) entries only.
 * Active entries are excluded to avoid double-listing them in the agent context.
 * @param {object} allBooks
 * @param {string[]} activeKeys - IDs currently in activeRouterKeys (Book::uid format).
 */
export function buildKeyringText(allBooks, activeKeys = []) {
    const activeSet = new Set(activeKeys);
    const lines = [];
    for (const [bookName, bookData] of Object.entries(allBooks || {})) {
        if (isSkeletonBookName(bookName)) continue;
        if (!bookData || !bookData.entries) continue;
        for (const [uid, entry] of Object.entries(bookData.entries)) {
            if (activeSet.has(`${bookName}::${uid}`)) continue;
            const keys = (entry.key || []).join(', ');
            const label = entry.comment || entry.key?.[0] || 'Unnamed';
            lines.push(`[ARCHIVE] ${bookName}::${uid} | Label: ${label} | Keys: [${keys}]`);
        }
    }
    return lines.join('\n');
}

/**
 * Search labels and bodies. Never used to prove that a name is absent — the keyring already lists every entry.
 * @param {object} allBooks
 * @param {string} query
 * @returns {string[]}
 */
export function grepLoreInBooks(allBooks, query) {
    if (isConcatenatedNameDump(query)) return [EXISTENCE_GREP_HINT];
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const hits = [];
    for (const [name, book] of Object.entries(allBooks || {})) {
        if (isSkeletonBookName(name)) continue;
        for (const [uid, entry] of Object.entries(book.entries || {})) {
            const keys = Array.isArray(entry.key) ? entry.key.join(' ') : '';
            const haystack = `${entry.content || ''} ${entry.comment || ''} ${keys}`.toLowerCase();
            if (haystack.includes(q)) {
                hits.push(`[${name}::${uid}] "${entry.comment || uid}": ${(entry.content || '').substring(0, 120)}...`);
            }
        }
    }
    return hits;
}
