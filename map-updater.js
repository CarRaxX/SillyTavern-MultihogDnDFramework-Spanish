/** Dedicated ongoing dungeon/settlement occupancy updater. */
import {
    getSettings,
    persistMapUpdaterLastRunTimestamp,
    persistMapUpdaterLastRunWatermark,
} from './state-manager.js';
import { sendStateRequest } from './llm-client.js';
import {
    extractCurrentTimeStr,
    findNthUserMessageStartIdx,
    formatAgentChatLogFromIndex,
} from './memo-processor.js';
import {
    applyDungeonMapTransaction,
    formatDungeonMapForUpdater,
    normalizeMapSiteKind,
} from './dungeon-reality.js';
import { isLocationMappingEnabled } from './src/state/section-enabled.js';
import { parseMapArchitectResponse } from './map-architect-parser.js';
import { DEFAULT_MAP_UPDATER_SYSTEM_PROMPT } from './map-updater-prompt.js';
import {
    applyActiveDungeonMapCommit,
    isRouterRunning,
    loadActiveDungeonMapContext,
    restoreCampaignLocationsBook,
    snapshotCampaignLocationsBook,
} from './router.js';
import { isMapEvolutionRunning } from './map-evolution.js';

const MAX_CORRECTION_ATTEMPTS = 2;
const swipeSnapshots = new Map();
let _mapUpdaterRunning = false;
let _mapUpdaterStarting = false;
let _mapUpdaterController = null;

export function isMapUpdaterRunning() {
    return _mapUpdaterRunning;
}

/**
 * Aborts the currently-running Map Updater pass, if any.
 * Same Stop control as Lorebook Agent: kills the in-flight LLM request.
 */
export function stopMapUpdaterPass() {
    if (_mapUpdaterController) {
        _mapUpdaterController.abort();
        _mapUpdaterController = null;
    }
}

function broadcastStep(type, content, metadata = {}) {
    document.dispatchEvent(new CustomEvent('rt_lore_agent_step', {
        detail: { type, content, metadata: { source: 'map_updater', ...metadata }, timestamp: Date.now() },
    }));
}

export function summarizeMapUpdaterOperations(transaction) {
    const ops = Array.isArray(transaction?.operations) ? transaction.operations : [];
    return ops.map(operation => {
        const op = String(operation?.op || '').trim() || 'OP';
        if (op === 'SET_CONNECTION') {
            const from = String(operation?.from || '').trim();
            const to = String(operation?.to || '').trim();
            return [op, from && to ? `${from} → ${to}` : (from || to)].filter(Boolean).join(' ');
        }
        const name = String(operation?.name || operation?.asset_id || operation?.area_id || operation?.to || '').trim();
        const kind = String(operation?.kind || '').trim();
        return `${op}${name ? ` ${name}` : ''}${kind ? ` (${kind})` : ''}`;
    }).join('; ');
}

export function isMapUpdaterNoop(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (value.noop === true) return true;
    return Array.isArray(value.operations) && value.operations.length === 0;
}

function requestSettings(settings) {
    return {
        connectionSource: settings.mapRuntimeConnectionSource || 'default',
        connectionProfileId: settings.mapRuntimeConnectionProfileId || '',
        completionPresetId: settings.mapRuntimeCompletionPresetId || '',
        ollamaUrl: settings.mapRuntimeOllamaUrl || 'http://localhost:11434',
        ollamaModel: settings.mapRuntimeOllamaModel || '',
        openaiUrl: settings.mapRuntimeOpenaiUrl || '',
        openaiKey: settings.mapRuntimeOpenaiKey || '',
        openaiModel: settings.mapRuntimeOpenaiModel || '',
        maxTokens: Math.max(1000, Number(settings.mapUpdaterMaxTokens) || 25000),
        debugMode: !!settings.debugMode,
    };
}

function mapUpdaterLookbackTurns(settings, lookback) {
    const requested = Number(lookback);
    if (Number.isFinite(requested) && requested > 0) return Math.max(1, Math.min(100, requested));
    const router = Number(settings.routerLookback);
    if (Number.isFinite(router) && router > 0) return Math.max(1, Math.min(100, router));
    const architect = Number(settings.mapArchitectLookback);
    if (Number.isFinite(architect) && architect > 0) return Math.max(1, Math.min(100, architect));
    return 4;
}

/**
 * Auto-runs use the since-last-run watermark. Manual runs always use lookback
 * (same as Lorebook Agent's play button), even if the watermark already caught up.
 */
export function resolveMapUpdaterStoryWindow(chat, settings, { isManual = false, lookback = null } = {}) {
    const messages = Array.isArray(chat) ? chat : [];
    const turns = mapUpdaterLookbackTurns(settings, lookback);
    if (isManual) {
        return {
            startIdx: findNthUserMessageStartIdx(messages, turns),
            sinceLastRun: false,
        };
    }
    const lastLen = Number(settings.mapUpdaterLastRunChatLength) || 0;
    if (lastLen > 0 && lastLen < messages.length) {
        return { startIdx: lastLen, sinceLastRun: true };
    }
    if (lastLen >= messages.length && messages.length > 0) {
        return { startIdx: messages.length, sinceLastRun: true };
    }
    return {
        startIdx: findNthUserMessageStartIdx(messages, turns),
        sinceLastRun: false,
    };
}

function recentStoryContext(ctx, settings, { isManual = false, lookback = null } = {}) {
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const window = resolveMapUpdaterStoryWindow(chat, settings, { isManual, lookback });
    return formatAgentChatLogFromIndex(chat, window.startIdx, !!settings.routerIncludeHidden, window.sinceLastRun);
}

function currentTimeFrom(settings, recentStory) {
    const timeRegex = /(\d{1,2}:\d{2}\s*(?:AM|PM)?,\s*(?:Day\s*\d+|\d{1,2}\/\d{1,2}\/\d+))/i;
    const narrativeTimeMatch = String(recentStory || '').match(timeRegex);
    const memoTimeMatch = settings.currentMemo?.match(/\[TIME\]([\s\S]*?)\[\/TIME\]/i);
    const cleanMemoTime = memoTimeMatch ? extractCurrentTimeStr(memoTimeMatch[1]) : '';
    return narrativeTimeMatch ? narrativeTimeMatch[1] : cleanMemoTime;
}

function swipeSnapshotKey(ctx, message, swipeId = message?.swipe_id ?? 0) {
    const chatId = ctx.chatId || ctx.getCurrentChatId?.() || '';
    const index = Array.isArray(ctx.chat) ? ctx.chat.indexOf(message) : -1;
    return `${chatId}:${index}:${swipeId}`;
}

function stampTriggerMessage(ctx, snapshot) {
    const trigger = [...(ctx.chat || [])].reverse().find(message => !message?.is_user && !message?.is_system);
    if (!trigger) return;
    trigger.extra = trigger.extra || {};
    trigger.extra.rpgMapUpdaterRanForSwipe = trigger.swipe_id ?? 0;
    swipeSnapshots.set(swipeSnapshotKey(ctx, trigger), snapshot);
}

function formatFailure(errors) {
    return JSON.stringify({
        ok: false,
        retryable: true,
        code: errors?.[0]?.code || 'INVALID_MAP_TRANSACTION',
        errors: errors || [],
        hint: 'Correct only the rejected fields and retry with the same operation_id. Nothing from the rejected commit was written.',
    }, null, 2);
}

function kindRule(kind) {
    return kind === 'SETTLEMENT'
        ? 'SETTLEMENT interiors the party actually enters are OBJECT assets in the current district, not new areas. Named people are CREATURE or GROUP. If CURRENT LOCATION names a more specific interior after the district and that name is not already an OBJECT asset, ADD_ASSET it. The footer is sufficient even when RECENT STORY is empty.'
        : 'If the party enters a newly invented room the map lacks, ADD_AREA from the narrative.';
}

function initialUserPrompt(loaded, recentStory) {
    const kind = normalizeMapSiteKind(loaded.context.document?.kind);
    return `UPDATE THE ATTACHED MAP
Exact site root: ${loaded.context.siteRoot}
Kind: ${kind}
${kindRule(kind)}

## CURRENT LOCATION
${loaded.currentLocation || 'Unknown'}
Parsed from the narrator status footer. A more specific interior on this line is a durable map fact. If RECENT STORY is empty, still apply CURRENT LOCATION.

## CURRENT MAP
${formatDungeonMapForUpdater(loaded.context.document, loaded.currentLocation)}

## RECENT STORY
${recentStory || '(No additional recent context.)'}

Output only the required JSON object. Use {"noop":true} when no durable map fact changed.`;
}

function correctionPrompt(loaded, recentStory, priorOutput, errors, attempt) {
    return `CORRECTION PASS ${attempt}
Your previous map update was rejected. Return a complete corrected JSON object, not a patch. Reuse the same operation_id unless the error says to mint a new one.

Requested site: ${loaded.context.siteRoot}

VALIDATION ERRORS
${formatFailure(errors)}

PREVIOUS OUTPUT
${priorOutput}

## CURRENT LOCATION
${loaded.currentLocation || 'Unknown'}

## CURRENT MAP
${formatDungeonMapForUpdater(loaded.context.document, loaded.currentLocation)}

## RECENT STORY
${recentStory || '(No additional recent context.)'}

Output only the corrected JSON object.`;
}

function finishMapUpdater(ctx, snapshot, { applied = false } = {}) {
    persistMapUpdaterLastRunWatermark(ctx.chat?.length || 0);
    persistMapUpdaterLastRunTimestamp();
    if (applied) stampTriggerMessage(ctx, snapshot);
}

/**
 * Undo a Map Updater write that belonged to an abandoned swipe.
 * @returns {Promise<boolean>}
 */
export async function maybeRollbackMapUpdaterForSwipe(msg) {
    if (!msg?.extra || msg.extra.rpgMapUpdaterRanForSwipe === undefined) return false;
    const currentSwipeId = msg.swipe_id ?? 0;
    if (msg.extra.rpgMapUpdaterRanForSwipe === currentSwipeId) return false;
    if (getSettings().routerSwipeRollback === false) {
        delete msg.extra.rpgMapUpdaterRanForSwipe;
        return false;
    }
    const ctx = SillyTavern.getContext();
    const snapshot = swipeSnapshots.get(swipeSnapshotKey(ctx, msg, msg.extra.rpgMapUpdaterRanForSwipe));
    delete msg.extra.rpgMapUpdaterRanForSwipe;
    if (!snapshot) return false;
    return restoreCampaignLocationsBook(snapshot, ctx);
}

/**
 * One occupancy-maintenance pass for the currently mapped site.
 * Skips when Persistent Maps is off, no map is active, Lorebook Agent is busy, or auto-updates are disabled.
 * @param {{ isManual?: boolean, lookback?: number|null }} [options]
 */
export async function runMapUpdaterPass({ isManual = false, lookback = null } = {}) {
    const settings = getSettings();
    if (settings.mapUpdaterEnabled === false && !isManual) return { skipped: 'disabled' };
    if (!isLocationMappingEnabled(settings)) return { skipped: 'location_mapping_off' };
    if (_mapUpdaterRunning || _mapUpdaterStarting || isRouterRunning() || isMapEvolutionRunning()) return { skipped: 'busy' };

    const ctx = SillyTavern.getContext();
    _mapUpdaterStarting = true;
    try {
        const loaded = await loadActiveDungeonMapContext();
        if (!loaded?.context) return { skipped: 'no_active_map' };
        if (_mapUpdaterRunning || isRouterRunning() || isMapEvolutionRunning()) return { skipped: 'busy' };

        _mapUpdaterRunning = true;
        if (_mapUpdaterController) _mapUpdaterController.abort();
        _mapUpdaterController = new AbortController();
        const signal = _mapUpdaterController.signal;
        document.dispatchEvent(new CustomEvent('rt_map_updater_status', { detail: { running: true } }));
        broadcastStep('start', 'Initializing Map Updater...');

        const kind = normalizeMapSiteKind(loaded.context.document?.kind);
        broadcastStep('thought', `Site: ${loaded.context.siteRoot} (${kind})\nCurrent location: ${loaded.currentLocation || 'Unknown'}`);

        const snapshot = await snapshotCampaignLocationsBook();
        const recentStory = recentStoryContext(ctx, settings, { isManual, lookback });
        const systemPrompt = String(settings.mapUpdaterSystemPrompt || DEFAULT_MAP_UPDATER_SYSTEM_PROMPT).trim();
        let prompt = initialUserPrompt(loaded, recentStory);
        let lastIssues = [];

        for (let attempt = 0; attempt <= MAX_CORRECTION_ATTEMPTS; attempt++) {
            if (signal.aborted) {
                const abortError = new Error('The operation was aborted.');
                abortError.name = 'AbortError';
                throw abortError;
            }
            if (!isLocationMappingEnabled(getSettings())) {
                stopMapUpdaterPass();
                return { skipped: 'location_mapping_off' };
            }
            if (attempt > 0) broadcastStep('thought', `Correction pass ${attempt}...`);
            else broadcastStep('thought', 'Requesting occupancy update...');
            const output = await sendStateRequest(requestSettings(settings), systemPrompt, prompt, signal);
            const parsed = parseMapArchitectResponse(output);
            if (!parsed.value) {
                lastIssues = [{ code: 'INVALID_JSON', path: '$', hint: parsed.error || 'No JSON object was found.' }];
                if (attempt < MAX_CORRECTION_ATTEMPTS) {
                    prompt = correctionPrompt(loaded, recentStory, output, lastIssues, attempt + 1);
                    continue;
                }
                break;
            }
            if (isMapUpdaterNoop(parsed.value)) {
                finishMapUpdater(ctx, snapshot, { applied: false });
                if (settings.debugMode) console.log('[RPG Tracker] Map Updater: noop.');
                broadcastStep('finish', 'Noop — no durable map fact changed.');
                return { ok: true, noop: true };
            }
            const validation = applyDungeonMapTransaction(loaded.context.document, parsed.value);
            if (!validation.ok) {
                lastIssues = validation.errors || [];
                if (attempt < MAX_CORRECTION_ATTEMPTS) {
                    prompt = correctionPrompt(loaded, recentStory, output, lastIssues, attempt + 1);
                    continue;
                }
                break;
            }
            broadcastStep('result', summarizeMapUpdaterOperations(parsed.value) || 'Transaction accepted.');
            const currentTime = currentTimeFrom(settings, recentStory);
            const mapResult = await applyActiveDungeonMapCommit(parsed.value, loaded.context, loaded.books, currentTime);
            if (!mapResult.ok) {
                lastIssues = mapResult.errors || [{ code: mapResult.code || 'MAP_COMMIT_FAILED', path: 'map', hint: 'Persistence rejected the transaction.' }];
                if (attempt < MAX_CORRECTION_ATTEMPTS && mapResult.retryable !== false) {
                    prompt = correctionPrompt(loaded, recentStory, output, lastIssues, attempt + 1);
                    continue;
                }
                break;
            }
            finishMapUpdater(ctx, snapshot, { applied: true });
            if (settings.debugMode) {
                console.log('[RPG Tracker] Map Updater applied', mapResult.operationId || parsed.value.operation_id);
            }
            if (mapResult.alreadyApplied) {
                broadcastStep('finish', 'Already applied.');
            } else {
                const n = Array.isArray(parsed.value.operations) ? parsed.value.operations.length : 0;
                broadcastStep('finish', `Applied ${n} operation${n === 1 ? '' : 's'}.`);
            }
            return { ok: true, result: mapResult };
        }

        const concise = lastIssues.slice(0, 8).map(issue => `${issue.code} at ${issue.path}: ${issue.hint}`).join('; ');
        console.warn('[RPG Tracker] Map Updater could not apply a valid transaction:', concise || 'unknown error');
        persistMapUpdaterLastRunWatermark(ctx.chat?.length || 0);
        persistMapUpdaterLastRunTimestamp();
        broadcastStep('error', concise || 'Validation failure.');
        return { ok: false, errors: lastIssues };
    } catch (error) {
        if (error?.name === 'AbortError') {
            console.log('[RPG Tracker] Map Updater aborted by user.');
            if (_mapUpdaterRunning) broadcastStep('error', 'Stopped by user.');
            return { skipped: 'stopped' };
        }
        console.error('[RPG Tracker] Map Updater failed:', error);
        if (_mapUpdaterRunning) broadcastStep('error', String(error?.message || error));
        return { ok: false, error: String(error?.message || error) };
    } finally {
        _mapUpdaterStarting = false;
        if (_mapUpdaterRunning) {
            _mapUpdaterRunning = false;
            _mapUpdaterController = null;
            document.dispatchEvent(new CustomEvent('rt_map_updater_status', { detail: { running: false } }));
        }
    }
}
