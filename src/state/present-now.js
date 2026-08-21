/**
 * Latest narrator/assistant chat message, walking newest-first.
 * User and system messages are skipped so Present Now stays on the last
 * narrator output instead of emptying when the player sends a turn.
 *
 * @param {Array<{ is_user?: boolean, is_system?: boolean, is_hidden?: boolean, extra?: object }>} chat
 * @param {{ includeHidden?: boolean }} [opts]
 * @returns {object|null}
 */
export function findMostRecentNarratorMessage(chat, { includeHidden = false } = {}) {
    if (!Array.isArray(chat) || chat.length === 0) return null;
    for (let i = chat.length - 1; i >= 0; i--) {
        const msg = chat[i];
        if (!msg || msg.is_user || msg.is_system) continue;
        if (!includeHidden && msg.is_hidden) continue;
        const extra = msg.extra || {};
        if (extra.summary || extra.is_summary || extra.summary_data) continue;
        return msg;
    }
    return null;
}
