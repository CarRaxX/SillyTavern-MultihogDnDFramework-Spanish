import { createBranch } from '../../../../../../bookmarks.js';
import { saveItemizedPrompts } from '../../../../../../itemized-prompts.js';
import { getSettings, sanitizeCampaignPrefixString, saveChatState } from '../../../state-manager.js';
import { snapshotPortraitMapsForChat } from '../../../portrait-storage.js';
import { runtimeState } from '../../app/runtime-state.js';
import {
    cloneCampaignStackToPrefix,
    deleteWorldInfoBooks,
} from './clone-campaign-stack.js';
import {
    COMPANION_BY_CHAT_KEY,
    MEMO_RECOVERY_KEY,
    copyLocalChatMapEntry,
} from './local-chat-map.js';

/** @type {Set<string>} */
const _pendingBranchSeeds = new Set();

/**
 * True while a Branch Campaign seed for this chat id is in flight / just completed.
 * Prevents onChatChanged from treating the branch as an unseen empty chat.
 * @param {string|null|undefined} chatId
 */
export function isBranchSeedInProgress(chatId) {
    return !!(chatId && _pendingBranchSeeds.has(String(chatId)));
}

/**
 * @param {string} chatId
 */
export function clearBranchSeedGuard(chatId) {
    if (chatId) _pendingBranchSeeds.delete(String(chatId));
}

/**
 * Remap `book::uid` style keys using a book rename map.
 * @param {string[]} list
 * @param {Record<string, string>} bookRenameMap
 */
export function remapBookKeyedList(list, bookRenameMap) {
    if (!Array.isArray(list) || !bookRenameMap || !Object.keys(bookRenameMap).length) {
        return Array.isArray(list) ? [...list] : [];
    }
    return list.map((k) => {
        const key = String(k || '');
        const idx = key.indexOf('::');
        if (idx < 0) return bookRenameMap[key] || key;
        const book = key.slice(0, idx);
        const rest = key.slice(idx);
        const newBook = bookRenameMap[book];
        return newBook ? newBook + rest : key;
    });
}

/**
 * @param {any[]} log
 * @param {Record<string, string>} bookRenameMap
 */
function remapRouterLog(log, bookRenameMap) {
    if (!Array.isArray(log) || !bookRenameMap || !Object.keys(bookRenameMap).length) {
        return Array.isArray(log) ? JSON.parse(JSON.stringify(log)) : [];
    }
    const keyFields = ['activate', 'deactivate', 'record', 'delete', 'rewrite', 'consolidate', 'rename'];
    return log.map((entry) => {
        const copy = { ...entry };
        for (const f of keyFields) {
            if (Array.isArray(copy[f])) copy[f] = remapBookKeyedList(copy[f], bookRenameMap);
        }
        return copy;
    });
}

/**
 * Deep-copy Multihog chatStates[oldId] → chatStates[newId], remapping lorebook names.
 * Never mutates the source partition.
 * @param {object} s
 * @param {string} oldId
 * @param {string} newId
 * @param {string} newPrefix
 * @param {Record<string, string>} bookRenameMap
 */
export function copyChatStatePartition(s, oldId, newId, newPrefix, bookRenameMap = {}) {
    if (!s.chatStates) s.chatStates = {};
    const source = s.chatStates[oldId];
    if (!source) {
        throw new Error(`No Multihog chat state found for "${oldId}".`);
    }
    const copy = JSON.parse(JSON.stringify(source));
    if (newPrefix) copy.routerCampaignPrefix = newPrefix;

    if (Array.isArray(copy.campaignBooks) && Object.keys(bookRenameMap).length) {
        copy.campaignBooks = copy.campaignBooks.map((n) => bookRenameMap[n] || n);
    }
    copy.activeRouterKeys = remapBookKeyedList(copy.activeRouterKeys, bookRenameMap);
    copy.activeWorldKeys = remapBookKeyedList(copy.activeWorldKeys, bookRenameMap);
    copy.keywordActivatedKeys = remapBookKeyedList(copy.keywordActivatedKeys, bookRenameMap);
    copy.routerLog = remapRouterLog(copy.routerLog, bookRenameMap);

    s.chatStates[newId] = copy;
    return copy;
}

/**
 * One-button Branch Campaign: ST transcript branch + Multihog partition copy + lore stack clone.
 * Preserves chat A intact (copy, not move).
 * @param {{ saveSettings: (force?: boolean) => Promise<void>|void }} deps
 */
export async function branchCampaignChat(deps) {
    const { saveSettings } = deps;
    const s = getSettings();
    const ctx = SillyTavern.getContext();
    const title = 'Branch Campaign';

    if (!s.chatLinkEnabled) {
        toastr['warning'](
            'Turn on Chat-Linked Mode first so campaign state can be copied to the branch.',
            title,
        );
        return null;
    }

    const oldId = runtimeState.currentChatId
        || ctx.getCurrentChatId?.()
        || ctx.chatId
        || null;
    if (!oldId) {
        toastr['warning']('No active chat to branch from.', title);
        return null;
    }

    const chat = ctx.chat;
    if (!Array.isArray(chat) || chat.length === 0) {
        toastr['warning']('The chat is empty — nothing to branch.', title);
        return null;
    }

    const hasCharacterOrGroup = ctx.characterId !== undefined || !!ctx.groupId;
    if (!hasCharacterOrGroup) {
        toastr['info']('No character selected.', title);
        return null;
    }

    const currentPrefix = (s.routerCampaignPrefix || getSettings().routerCampaignPrefix || '').trim()
        || sanitizeCampaignPrefixString(oldId);
    const confirmHtml = `
        <div style="text-align:left;font-size:0.9em;line-height:1.5;">
            <p>This creates a SillyTavern <b>branch chat</b> from the current transcript and copies all Multihog D&amp;D data onto it.</p>
            <ul style="margin:8px 0 0 1.2em;padding:0;">
                <li>Tracker memo, quests, portraits maps, setup lock, companion history</li>
                <li>Campaign lorebooks cloned under a new prefix (when a stack exists)</li>
                <li>Original chat <code>${escapeHtml(oldId)}</code> stays intact</li>
            </ul>
            <p style="margin-top:8px;opacity:0.8;">You will be switched to the new branch when it finishes.</p>
        </div>
    `;
    let confirmed = false;
    try {
        confirmed = await ctx.Popup.show.confirm(title, confirmHtml, {
            okButton: 'Branch Campaign',
            cancelButton: 'Cancel',
        });
    } catch (_) {
        return null;
    }
    if (!confirmed) return null;

    // ── Freeze chat A ──────────────────────────────────────────────────────────
    if (typeof globalThis._rpgFlushRawMemoChanges === 'function') {
        globalThis._rpgFlushRawMemoChanges();
    }
    if (typeof globalThis._rpgFlushAdventureCompanionForChat === 'function') {
        globalThis._rpgFlushAdventureCompanionForChat(oldId);
    }
    snapshotPortraitMapsForChat(s, oldId);
    saveChatState(oldId, { skipDiskWrite: true });
    await Promise.resolve(saveSettings(true));

    // Re-read after flush/save
    if (!s.chatStates?.[oldId]) {
        toastr['error']('Could not snapshot Multihog state for the current chat.', title);
        return null;
    }

    // ── Create ST transcript branch (do not open yet) ──────────────────────────
    const mesId = chat.length - 1;
    let newChatId = null;
    try {
        newChatId = await createBranch(mesId);
    } catch (e) {
        console.error('[RPG Tracker] createBranch failed:', e);
        toastr['error'](`Branch creation failed: ${e?.message || e}`, title);
        return null;
    }
    if (!newChatId) {
        toastr['error']('SillyTavern could not create a branch chat.', title);
        return null;
    }

    _pendingBranchSeeds.add(String(newChatId));
    const newPrefix = sanitizeCampaignPrefixString(newChatId);
    let bookRenameMap = {};
    let createdBookNames = [];

    try {
        // ── Clone lore stack (optional if no books) ────────────────────────────
        const sourcePrefix = (s.chatStates[oldId]?.routerCampaignPrefix || currentPrefix || '').trim()
            || sanitizeCampaignPrefixString(oldId);

        if (sourcePrefix && newPrefix && sourcePrefix !== newPrefix) {
            toastr['info'](`Cloning lorebooks ${sourcePrefix} → ${newPrefix}…`, title);
            const cloneResult = await cloneCampaignStackToPrefix(sourcePrefix, newPrefix);
            if (cloneResult.matchingCount > 0 && !cloneResult.ok) {
                await deleteWorldInfoBooks(ctx, cloneResult.createdBookNames);
                throw new Error(
                    `Lorebook clone incomplete (${cloneResult.cloned}/${cloneResult.matchingCount}). `
                    + (cloneResult.errors.slice(0, 3).join('; ') || 'Unknown error'),
                );
            }
            bookRenameMap = cloneResult.bookRenameMap || {};
            createdBookNames = cloneResult.createdBookNames || [];
        }

        // ── Deep-copy Multihog partition ───────────────────────────────────────
        copyChatStatePartition(s, oldId, newChatId, newPrefix, bookRenameMap);
        copyLocalChatMapEntry(COMPANION_BY_CHAT_KEY, oldId, newChatId);
        copyLocalChatMapEntry(MEMO_RECOVERY_KEY, oldId, newChatId);

        // Keep Campaign Prefix Override on the SOURCE chat. Otherwise the branch
        // inherits a global/legacy override and keeps writing into the original
        // lorebook stack while cloned books under newPrefix sit unused.
        const ov = (s.routerCampaignPrefixOverride || '').trim();
        if (ov) {
            const anchor = (s.routerCampaignPrefixOverrideAnchorChatId || '').trim();
            if (!anchor || anchor === newChatId) {
                s.routerCampaignPrefixOverrideAnchorChatId = oldId;
            }
        }

        let saved = false;
        try {
            await Promise.resolve(saveSettings(true));
            saved = true;
        } catch (e1) {
            console.warn('[RPG Tracker] Branch settings save retry:', e1);
            try {
                await Promise.resolve(saveSettings(true));
                saved = true;
            } catch (e2) {
                throw new Error(`Could not persist Multihog branch data: ${e2?.message || e2}`);
            }
        }
        if (!saved || !s.chatStates?.[newChatId]) {
            throw new Error('Multihog branch partition missing after save.');
        }

        // ── Open branch ────────────────────────────────────────────────────────
        try {
            await saveItemizedPrompts(newChatId);
        } catch (_) { /* non-fatal */ }

        if (ctx.groupId) {
            await ctx.openGroupChat(ctx.groupId, newChatId);
        } else {
            await ctx.openCharacterChat(newChatId);
        }

        const loreNote = createdBookNames.length
            ? ` Lorebooks cloned under prefix "${newPrefix}".`
            : (newPrefix ? ` Prefix "${newPrefix}".` : '');
        toastr['success'](
            `Branched to "${newChatId}". Multihog data copied; original chat preserved.${loreNote}`,
            title,
            { timeOut: 9000 },
        );
        return newChatId;
    } catch (err) {
        console.error('[RPG Tracker] Branch Campaign failed:', err);
        if (createdBookNames.length) {
            await deleteWorldInfoBooks(ctx, createdBookNames);
        }
        if (s.chatStates?.[newChatId]) {
            // Only remove the seed we just wrote; never touch chat A.
            delete s.chatStates[newChatId];
            try { await Promise.resolve(saveSettings(true)); } catch (_) { /* non-fatal */ }
        }
        toastr['error'](
            `${err?.message || err}\nST branch file "${newChatId}" may exist — open it manually after fixing, or delete it.`,
            title,
            { timeOut: 12000 },
        );
        return null;
    } finally {
        // Keep guard briefly so CHAT_CHANGED during open still sees the seed intent;
        // clear on next tick after open settles.
        setTimeout(() => clearBranchSeedGuard(newChatId), 3000);
    }
}

/**
 * @param {string} text
 */
function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export {
    COMPANION_BY_CHAT_KEY,
    MEMO_RECOVERY_KEY,
    copyLocalChatMapEntry,
    moveLocalChatMapEntry,
} from './local-chat-map.js';
