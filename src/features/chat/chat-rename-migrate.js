import { getSettings, saveChatState } from '../../../state-manager.js';
import { runtimeState } from '../../app/runtime-state.js';
import {
    COMPANION_BY_CHAT_KEY,
    MEMO_RECOVERY_KEY,
    moveLocalChatMapEntry,
} from './local-chat-map.js';

/**
 * Strip .jsonl from ST CHAT_RENAMED filenames.
 * @param {string} name
 */
export function stripChatFileExtension(name) {
    return String(name || '').replace(/\.jsonl$/i, '');
}

// saveChatState writes these known fields even for an unseen chat immediately
// after resetUnseenChatState. Unknown future/legacy fields are treated as real
// data so a newer schema can never be silently overwritten by this migrator.
const KNOWN_PARTITION_KEYS = new Set([
    'currentMemo', 'combatDefeatedUi', 'memoPersistedAt', 'memoPersistedBy',
    'memoHistory', 'lastDelta', 'customPortraits', 'customLocationImages',
    'modules', 'blockOrder', 'stockPrompts', 'quests', 'historyIndex',
    'activeRouterKeys', 'activeWorldKeys', 'keywordActivatedKeys', 'routerLog',
    'routerCampaignPrefix', 'routerLookback', 'routerLastRunChatLength',
    'routerLastRunAt', 'pcCharacterBlockSeeded', 'routerDirectPrompt',
    'routerDirectLookback', 'routerDefaultPosition', 'routerDefaultDepth',
    'routerDefaultOrder', 'routerDefaultRole', 'loreInjectionPosition',
    'loreInjectionDepth', 'loreInjectionRole', 'worldProgressionLookback',
    'worldProgressionHistoryLookback', 'worldProgressionInjectionPosition',
    'worldProgressionInjectionDepth', 'worldProgressionInjectionRole',
    'worldProgressionRandomizeNPCs', 'worldProgressionRandomSkeletonNPCCount',
    'worldProgressionRandomNarrativeNPCCount', 'worldProgressionRandomizeLocations',
    'worldProgressionRandomSkeletonLocationCount',
    'worldProgressionRandomNarrativeLocationCount',
    'worldProgressionRandomizeFactions', 'worldProgressionRandomSkeletonFactionCount',
    'worldProgressionRandomNarrativeFactionCount',
    'worldProgressionRandomizeConflicts', 'worldProgressionRandomConflictCount',
    'worldProgressionSkeletonFactions', 'worldProgressionSkeletonLocations',
    'worldProgressionSkeletonNPCs', 'worldProgressionSkeletonConflicts',
    'worldProgressionLastFiredAtMinutes', 'worldProgressionLastFiredPeriodLabel',
    'worldProgressionSkeletonAtmosphereSummary',
    'worldProgressionSkeletonAtmosphereLookback',
    'worldProgressionSkeletonUseExisting', 'worldProgressionSkeletonUseLorebooks',
    'worldProgressionSkeletonLorebookFilter', 'worldProgressionSkeletonLorebookOnly',
    'worldProgressionConsolidateEnabled', 'worldProgressionConsolidateInterval',
    'worldProgressionExclusionList', 'use24hTime', 'useDdMmYyFormat',
    'initialDate', 'initialTime', 'npcRelationshipMax', 'setup', 'campaignBooks',
    'lastImmersionSceneArtPath', 'lastImmersionSceneArtChatLen',
    'playerCharacter', 'adventureCompanion',
]);

const hasItems = (value) => Array.isArray(value) && value.length > 0;
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const hasMapEntries = (value) => value && typeof value === 'object'
    && !Array.isArray(value) && Object.keys(value).length > 0;

/**
 * True when a partition contains campaign state that must not be overwritten.
 * Setup/configuration snapshots and empty defaults do not count. Unknown fields
 * do count, which makes this check fail closed as the schema evolves.
 * @param {any} p
 */
export function partitionHasCampaignSubstance(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return false;

    if (Object.keys(p).some((key) => !KNOWN_PARTITION_KEYS.has(key))) return true;
    if (['currentMemo', 'lastDelta', 'worldProgressionLastFiredPeriodLabel',
        'worldProgressionSkeletonAtmosphereSummary', 'lastImmersionSceneArtPath']
        .some((key) => hasText(p[key]))) return true;
    if (['combatDefeatedUi', 'memoHistory', 'quests', 'activeRouterKeys',
        'activeWorldKeys', 'keywordActivatedKeys', 'routerLog', 'campaignBooks']
        .some((key) => hasItems(p[key]))) return true;
    if (hasMapEntries(p.customPortraits) || hasMapEntries(p.customLocationImages)) return true;
    if (Object.prototype.hasOwnProperty.call(p, 'playerCharacter') && p.playerCharacter != null) return true;
    if ((Number.isFinite(Number(p.historyIndex)) && Number(p.historyIndex) >= 0)
        || (Number(p.routerLastRunChatLength) || 0) > 0
        || (Number(p.routerLastRunAt) || 0) > 0
        || p.pcCharacterBlockSeeded === true
        || (Number.isFinite(Number(p.worldProgressionLastFiredAtMinutes))
            && Number(p.worldProgressionLastFiredAtMinutes) >= 0)
        || p.lastImmersionSceneArtChatLen != null) return true;

    const companion = p.adventureCompanion;
    if (companion != null) {
        if (!companion || typeof companion !== 'object' || Array.isArray(companion)) return true;
        if (hasItems(companion.history)) return true;
        if (Object.keys(companion).some((key) => !['lookback', 'lookbackAll', 'history'].includes(key))) return true;
    }
    return false;
}

/**
 * True when a partition has no campaign substance. Setup-only shells count as empty.
 * @param {any} p
 */
export function partitionLooksEmpty(p) {
    return !partitionHasCampaignSubstance(p);
}

/**
 * Migrate Multihog per-chat stores when SillyTavern renames a chat file.
 * Moves (not copies) chatStates + local maps so the new name keeps the campaign.
 *
 * @param {{ oldFileName?: string, newFileName?: string }} detail
 * @param {{
 *   saveSettings: (force?: boolean) => Promise<void>|void,
 *   loadChatState: (chatId: string) => boolean,
 * }} deps
 */
export async function onChatRenamedMigrate(detail, deps) {
    const { saveSettings, loadChatState } = deps;
    const oldId = stripChatFileExtension(detail?.oldFileName);
    let newId = stripChatFileExtension(detail?.newFileName);
    // ST may emit the pre-sanitize name in CHAT_RENAMED while getCurrentChatId()
    // already reflects the server-sanitized file after reloadCurrentChat().
    const ctx = SillyTavern.getContext();
    const liveId = ctx.getCurrentChatId?.() || ctx.chatId || null;
    if (liveId && oldId && liveId !== oldId) {
        newId = String(liveId);
    }
    if (!oldId || !newId || oldId === newId) return;

    const s = getSettings();
    if (!s.chatStates) s.chatStates = {};

    const hasOld = Object.prototype.hasOwnProperty.call(s.chatStates, oldId);
    const hasNew = Object.prototype.hasOwnProperty.call(s.chatStates, newId);
    const pendingReset = runtimeState.pendingUnseenChatReset;
    const resetMatchesRename = pendingReset?.oldId === oldId && pendingReset?.newId === newId;
    if (resetMatchesRename) runtimeState.pendingUnseenChatReset = null;

    let migratedPartition = false;
    let partitionCollision = false;
    if (hasOld && !hasNew) {
        s.chatStates[newId] = s.chatStates[oldId];
        delete s.chatStates[oldId];
        migratedPartition = true;
    } else if (hasOld && hasNew) {
        // Replace only the exact shell this session observed reset during the
        // oldId -> newId switch. Content alone cannot distinguish a race shell
        // from a legitimate configured-but-unstarted destination campaign.
        const oldHasSubstance = partitionHasCampaignSubstance(s.chatStates[oldId]);
        const newLooksEmpty = partitionLooksEmpty(s.chatStates[newId]);
        if (resetMatchesRename && oldHasSubstance && newLooksEmpty) {
            s.chatStates[newId] = s.chatStates[oldId];
            delete s.chatStates[oldId];
            migratedPartition = true;
        } else {
            partitionCollision = true;
            console.warn(
                `[RPG Tracker] CHAT_RENAMED: both chatStates["${oldId}"] and chatStates["${newId}"] may contain real data; preserving both.`,
            );
            toastr['warning'](
                `Chat renamed to "${newId}", but Multihog could not prove the existing destination was an empty rename shell. Both partitions were preserved; old key "${oldId}" was not deleted.`,
                'Chat Rename',
                { timeOut: 10000 },
            );
        }
    } else if (!hasOld && hasNew) {
        // Already under new key (e.g. Branch Campaign seeded then renamed).
    }

    // A genuine partition collision may represent two different chats, so keep
    // both local-map entries untouched. Otherwise move only into an unused key;
    // moveLocalChatMapEntry itself preserves both sides on a local-only collision.
    let localMapCollision = false;
    if (!partitionCollision) {
        localMapCollision = [COMPANION_BY_CHAT_KEY, MEMO_RECOVERY_KEY]
            .map((key) => moveLocalChatMapEntry(key, oldId, newId))
            .includes('collision');
    }
    if (localMapCollision) {
        console.warn(`[RPG Tracker] CHAT_RENAMED: browser-local data exists for both "${oldId}" and "${newId}"; preserving both.`);
        toastr['warning'](
            `Browser-local Multihog data already existed for "${newId}". Both old and new copies were preserved.`,
            'Chat Rename',
            { timeOut: 10000 },
        );
    }

    let settingsChanged = migratedPartition;
    if (s.routerCampaignPrefixOverrideAnchorChatId === oldId) {
        s.routerCampaignPrefixOverrideAnchorChatId = newId;
        settingsChanged = true;
    }

    if (runtimeState.currentChatId === oldId) {
        runtimeState.currentChatId = newId;
    }

    // If we are on the renamed chat, ensure live state matches the migrated partition.
    const activeId = ctx.getCurrentChatId?.() || ctx.chatId || runtimeState.currentChatId;
    if (activeId === newId && migratedPartition && typeof loadChatState === 'function') {
        loadChatState(newId);
    } else if (activeId === newId && migratedPartition && s.chatLinkEnabled) {
        saveChatState(newId, { skipDiskWrite: true });
    }

    if (settingsChanged) {
        try {
            await Promise.resolve(saveSettings(true));
        } catch (err) {
            console.warn('[RPG Tracker] CHAT_RENAMED save failed:', err);
        }
    }

    if (migratedPartition) {
        toastr['info'](
            `Multihog campaign data followed the rename: "${oldId}" -> "${newId}".`,
            'Chat Rename',
            { timeOut: 6000 },
        );
    }
}
