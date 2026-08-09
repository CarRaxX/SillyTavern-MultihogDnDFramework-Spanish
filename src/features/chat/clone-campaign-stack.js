import { getRequestHeaders } from '../../../../../../../script.js';

/**
 * Same matching rule as Lorebook Agent / router: exact prefix, or prefix_SingleToken
 * with no further underscores in the suffix.
 * @param {string} bookName
 * @param {string} prefix
 */
export function bookBelongsToPrefix(bookName, prefix) {
    if (!prefix) return false;
    if (bookName === prefix) return true;
    const rest = bookName.startsWith(prefix + '_') ? bookName.slice(prefix.length + 1) : null;
    return rest !== null && !rest.includes('_');
}

/**
 * @param {string} currentPrefix
 * @param {string} bookName
 * @param {string} newPrefix
 */
export function renameBookForPrefix(currentPrefix, bookName, newPrefix) {
    if (bookName === currentPrefix) return newPrefix;
    const suffix = bookName.slice(currentPrefix.length); // includes leading '_'
    return newPrefix + suffix;
}

/**
 * @param {any} ctx
 * @returns {Promise<string[]>}
 */
async function listWorldNames(ctx) {
    if (typeof ctx.updateWorldInfoList === 'function') {
        try { await ctx.updateWorldInfoList(); } catch (_) { /* non-fatal */ }
    }
    if (typeof ctx.getWorldInfoNames === 'function') {
        try {
            const n = ctx.getWorldInfoNames();
            return Array.isArray(n) ? [...n] : [];
        } catch (_) { /* fall through */ }
    }
    return [];
}

/**
 * Best-effort delete of lorebooks created during a failed clone.
 * @param {any} ctx
 * @param {string[]} bookNames
 */
export async function deleteWorldInfoBooks(ctx, bookNames) {
    for (const name of bookNames || []) {
        try {
            await fetch('/api/worldinfo/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ name }),
            });
        } catch (_) { /* best-effort */ }
    }
    if (typeof ctx.updateWorldInfoList === 'function') {
        try { await ctx.updateWorldInfoList(); } catch (_) { /* non-fatal */ }
    }
}

/**
 * Duplicates every lorebook under currentPrefix to newPrefix.
 * @param {string} currentPrefix
 * @param {string} newPrefix
 * @returns {Promise<{
 *   ok: boolean,
 *   cloned: number,
 *   matchingCount: number,
 *   bookRenameMap: Record<string, string>,
 *   createdBookNames: string[],
 *   errors: string[],
 * }>}
 */
export async function cloneCampaignStackToPrefix(currentPrefix, newPrefix) {
    const ctx = SillyTavern.getContext();
    const bookRenameMap = /** @type {Record<string, string>} */ ({});
    const createdBookNames = [];
    const errors = [];

    if (!currentPrefix || !newPrefix) {
        return {
            ok: false,
            cloned: 0,
            matchingCount: 0,
            bookRenameMap,
            createdBookNames,
            errors: ['Missing current or new campaign prefix.'],
        };
    }
    if (currentPrefix === newPrefix) {
        return {
            ok: false,
            cloned: 0,
            matchingCount: 0,
            bookRenameMap,
            createdBookNames,
            errors: ['New prefix is the same as the current prefix.'],
        };
    }

    const allNames = await listWorldNames(ctx);
    const matchingBooks = allNames.filter(n => bookBelongsToPrefix(n, currentPrefix));

    if (matchingBooks.length === 0) {
        return {
            ok: true,
            cloned: 0,
            matchingCount: 0,
            bookRenameMap,
            createdBookNames,
            errors: [],
        };
    }

    let cloned = 0;
    for (const bookName of matchingBooks) {
        const newBookName = renameBookForPrefix(currentPrefix, bookName, newPrefix);
        let bookData = null;
        try {
            bookData = await ctx.loadWorldInfo(bookName);
        } catch (e) {
            errors.push(`Failed to load "${bookName}": ${e?.message || e}`);
            continue;
        }
        if (!bookData) {
            errors.push(`Could not read "${bookName}" — skipping.`);
            continue;
        }

        const cloneData = JSON.parse(JSON.stringify(bookData));
        cloneData.name = newBookName;

        try {
            const res = await fetch('/api/worldinfo/edit', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ name: newBookName, data: cloneData }),
            });
            if (!res.ok) {
                errors.push(`HTTP ${res.status} saving "${newBookName}"`);
                continue;
            }
            if (typeof ctx.saveWorldInfo === 'function') {
                try { await ctx.saveWorldInfo(newBookName, cloneData); } catch (_) { /* non-fatal */ }
            }
            bookRenameMap[bookName] = newBookName;
            createdBookNames.push(newBookName);
            cloned++;
        } catch (e) {
            errors.push(`Failed to write "${newBookName}": ${e?.message || e}`);
        }
    }

    if (typeof ctx.updateWorldInfoList === 'function') {
        try { await ctx.updateWorldInfoList(); } catch (_) { /* non-fatal */ }
    }

    const ok = errors.length === 0 && cloned === matchingBooks.length;
    return {
        ok,
        cloned,
        matchingCount: matchingBooks.length,
        bookRenameMap,
        createdBookNames,
        errors,
    };
}
