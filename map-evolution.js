/**
 * Map Evolution — off-screen site simulation and World Progression grounding.
 *
 * Separate module from Map Updater occupancy: own prompt, own cadence, same
 * transaction API. Never mixed into the occupancy request.
 */
import {
    getSettings,
    persistMapEvolutionState,
} from './state-manager.js';
import { sendStateRequest, isCombatActive } from './llm-client.js';
import { extractCurrentTimeStr } from './memo-processor.js';
import {
    applyDungeonMapTransaction,
    formatDungeonMapForEvolution,
    normalizeDungeonLabel,
    normalizeMapSiteKind,
    resolveCurrentMapPlacement,
} from './dungeon-reality.js';
import { isLocationMappingEnabled } from './src/state/section-enabled.js';
import { parseMapArchitectResponse } from './map-architect-parser.js';
import { DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT } from './map-evolution-prompt.js';
import {
    filterSitesByRoots,
    isEvolutionNoop,
    normalizeEvolutionTickScope,
    orderMappedSitesForEvolution,
    pickSitesForEvolutionTick,
    reportMentionsLabel,
    resolvePlayerBubble,
    selectMappedSitesForWorldReport,
    siteEvolutionDue,
    summarizeEvolutionDigest,
} from './map-evolution-lib.js';
import {
    applyDungeonMapCommit,
    isRouterRunning,
    loadAllMappedSiteContexts,
    parseInWorldMinutes,
    restoreCampaignLocationsBook,
    snapshotCampaignLocationsBook,
} from './router.js';

export {
    filterSitesByRoots,
    normalizeEvolutionTickScope,
    orderMappedSitesForEvolution,
    pickSitesForEvolutionTick,
    reportMentionsLabel,
    resolvePlayerBubble,
    selectMappedSitesForWorldReport,
    siteEvolutionDue,
    summarizeEvolutionDigest,
};

const MAX_CORRECTION_ATTEMPTS = 2;
const swipeSnapshots = new Map();
let _mapEvolutionRunning = false;
let _mapEvolutionStarting = false;
let _mapEvolutionController = null;

export function isMapEvolutionRunning() {
    return _mapEvolutionRunning;
}

export function stopMapEvolutionPass() {
    if (_mapEvolutionController) {
        _mapEvolutionController.abort();
        _mapEvolutionController = null;
    }
}

function broadcastStep(type, content, metadata = {}) {
    document.dispatchEvent(new CustomEvent('rt_lore_agent_step', {
        detail: { type, content, metadata: { source: 'map_evolution', ...metadata }, timestamp: Date.now() },
    }));
}

function requestSettings(settings) {
    return {
        connectionSource: settings.mapArchitectConnectionSource || 'default',
        connectionProfileId: settings.mapArchitectConnectionProfileId || '',
        completionPresetId: settings.mapArchitectCompletionPresetId || '',
        ollamaUrl: settings.mapArchitectOllamaUrl || 'http://localhost:11434',
        ollamaModel: settings.mapArchitectOllamaModel || '',
        openaiUrl: settings.mapArchitectOpenaiUrl || '',
        openaiKey: settings.mapArchitectOpenaiKey || '',
        openaiModel: settings.mapArchitectOpenaiModel || '',
        maxTokens: Math.max(1000, Number(settings.mapEvolutionMaxTokens) || 25000),
        debugMode: !!settings.debugMode,
    };
}

function currentTimeFrom(settings) {
    const memoTimeMatch = settings.currentMemo?.match(/\[TIME\]([\s\S]*?)\[\/TIME\]/i);
    return memoTimeMatch ? extractCurrentTimeStr(memoTimeMatch[1]) : '';
}

function lastFiredMinutesForSite(settings, siteRoot) {
    const key = normalizeDungeonLabel(siteRoot);
    const label = settings.mapEvolutionLastFiredBySite?.[key] || '';
    return label ? parseInWorldMinutes(label) : -1;
}

function stampSiteFired(settings, siteRoot, timeLabel) {
    const key = normalizeDungeonLabel(siteRoot);
    if (!settings.mapEvolutionLastFiredBySite || typeof settings.mapEvolutionLastFiredBySite !== 'object') {
        settings.mapEvolutionLastFiredBySite = {};
    }
    settings.mapEvolutionLastFiredBySite[key] = timeLabel;
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

function kindPolicy(kind) {
    return kind === 'SETTLEMENT'
        ? 'SETTLEMENT: World Report is primary. Do not invent a coup, occupation, or named arrival the report did not mention. Interiors are OBJECT assets in a district, not new areas.'
        : 'DUNGEON: local restlessness is allowed in UNREVEALED or vacated rooms. Do not revive DESTROYED/DEAD assets.';
}

function triggerHeadline(trigger) {
    if (trigger === 'world_progression') return 'WORLD PROGRESSION GROUNDING';
    if (trigger === 'site_exit') return 'SITE EXIT RESTOCK / DECAY';
    if (trigger === 'manual') return 'MANUAL MAP EVOLUTION';
    return 'INTERVAL RESTLESSNESS';
}

function initialUserPrompt({ site, trigger, worldReport, digest, bubble, currentLocation, partyIsHere }) {
    const kind = normalizeMapSiteKind(site.document?.kind);
    const bubbleLine = bubble.area
        ? `${bubble.area.id} (${bubble.area.name})${bubble.combatActive ? ' — combat is active' : ''}`
        : '(Party is not inside this site. No freeze.)';
    const reportBlock = String(worldReport || '').trim()
        ? worldReport.trim()
        : '(No World Report for this pass.)';
    const digestBlock = String(digest || '').trim() || '(None yet this period.)';
    return `${triggerHeadline(trigger)}
Exact site root: ${site.siteRoot}
Kind: ${kind}
${kindPolicy(kind)}

## PLAYER BUBBLE (FROZEN)
${partyIsHere ? bubbleLine : '(Party is not inside this site. No freeze.)'}
Do not MOVE, ADD, SET, or REMOVE assets in the frozen area. Do not SET_CONNECTION or SET_AREA on it.

## CURRENT LOCATION
${currentLocation || 'Unknown'}

## CURRENT MAP
${formatDungeonMapForEvolution(site.document, partyIsHere ? currentLocation : '')}

## WORLD REPORT
${reportBlock}

## PRIOR EVOLUTION THIS PERIOD
${digestBlock}

Output only the required JSON object. Use {"noop":true} when this site is unaffected.`;
}

function correctionPrompt({ site, trigger, worldReport, digest, bubble, currentLocation, partyIsHere, priorOutput, errors, attempt }) {
    return `CORRECTION PASS ${attempt}
Your previous map evolution was rejected. Return a complete corrected JSON object, not a patch. Reuse the same operation_id unless the error says to mint a new one.

Requested site: ${site.siteRoot}

VALIDATION ERRORS
${formatFailure(errors)}

PREVIOUS OUTPUT
${priorOutput}

${initialUserPrompt({ site, trigger, worldReport, digest, bubble, currentLocation, partyIsHere })}`;
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
    trigger.extra.rpgMapEvolutionRanForSwipe = trigger.swipe_id ?? 0;
    swipeSnapshots.set(swipeSnapshotKey(ctx, trigger), snapshot);
}

export async function maybeRollbackMapEvolutionForSwipe(msg) {
    if (!msg?.extra || msg.extra.rpgMapEvolutionRanForSwipe === undefined) return false;
    const currentSwipeId = msg.swipe_id ?? 0;
    if (msg.extra.rpgMapEvolutionRanForSwipe === currentSwipeId) return false;
    if (getSettings().routerSwipeRollback === false) {
        delete msg.extra.rpgMapEvolutionRanForSwipe;
        return false;
    }
    const ctx = SillyTavern.getContext();
    const snapshot = swipeSnapshots.get(swipeSnapshotKey(ctx, msg, msg.extra.rpgMapEvolutionRanForSwipe));
    delete msg.extra.rpgMapEvolutionRanForSwipe;
    if (!snapshot) return false;
    return restoreCampaignLocationsBook(snapshot, ctx);
}

function activeSiteFrom(loaded, currentLocation) {
    if (!loaded?.sites?.length) return null;
    const here = loaded.sites.find(site =>
        site.siteRoot && currentLocation && normalizeDungeonLabel(currentLocation).includes(normalizeDungeonLabel(site.siteRoot)),
    );
    if (here) return here;
    return loaded.sites.find(site => {
        const placement = resolveCurrentMapPlacement(site.document, currentLocation);
        return !!placement.area;
    }) || null;
}

async function evolveOneSite({
    site,
    books,
    trigger,
    worldReport,
    digest,
    currentLocation,
    currentTime,
    settings,
    signal,
    snapshot,
    ctx,
}) {
    const partyIsHere = !!(currentLocation && (
        normalizeDungeonLabel(currentLocation).includes(normalizeDungeonLabel(site.siteRoot))
        || resolveCurrentMapPlacement(site.document, currentLocation).area
    ));
    const combatActive = partyIsHere && isCombatActive(settings.currentMemo);
    const bubble = partyIsHere
        ? resolvePlayerBubble(site.document, currentLocation, { combatActive })
        : { frozenAreaIds: [], combatActive: false, area: null };
    const frozenAreaIds = bubble.frozenAreaIds;
    const systemPrompt = String(settings.mapEvolutionSystemPrompt || DEFAULT_MAP_EVOLUTION_SYSTEM_PROMPT).trim();
    let prompt = initialUserPrompt({
        site, trigger, worldReport, digest, bubble, currentLocation, partyIsHere,
    });
    let lastIssues = [];
    let lastOutput = '';

    for (let attempt = 0; attempt <= MAX_CORRECTION_ATTEMPTS; attempt++) {
        if (signal.aborted) {
            const abortError = new Error('The operation was aborted.');
            abortError.name = 'AbortError';
            throw abortError;
        }
        if (!isLocationMappingEnabled(getSettings())) {
            stopMapEvolutionPass();
            return { skipped: 'location_mapping_off' };
        }
        if (attempt > 0) broadcastStep('thought', `${site.siteRoot}: correction pass ${attempt}...`);
        else broadcastStep('thought', `${site.siteRoot}: requesting evolution (${trigger})...`);
        const output = await sendStateRequest(requestSettings(settings), systemPrompt, prompt, signal);
        lastOutput = output;
        const parsed = parseMapArchitectResponse(output);
        if (!parsed.value) {
            lastIssues = [{ code: 'INVALID_JSON', path: '$', hint: parsed.error || 'No JSON object was found.' }];
            if (attempt < MAX_CORRECTION_ATTEMPTS) {
                prompt = correctionPrompt({
                    site, trigger, worldReport, digest, bubble, currentLocation, partyIsHere,
                    priorOutput: output, errors: lastIssues, attempt: attempt + 1,
                });
                continue;
            }
            break;
        }
        if (isEvolutionNoop(parsed.value)) {
            return { ok: true, noop: true, siteRoot: site.siteRoot };
        }
        const validation = applyDungeonMapTransaction(site.document, parsed.value, { frozenAreaIds });
        if (!validation.ok) {
            lastIssues = validation.errors || [];
            if (attempt < MAX_CORRECTION_ATTEMPTS) {
                prompt = correctionPrompt({
                    site, trigger, worldReport, digest, bubble, currentLocation, partyIsHere,
                    priorOutput: output, errors: lastIssues, attempt: attempt + 1,
                });
                continue;
            }
            break;
        }
        const mapResult = await applyDungeonMapCommit(
            parsed.value,
            site,
            books,
            currentTime,
            { requireActive: false, frozenAreaIds },
        );
        if (!mapResult.ok) {
            lastIssues = mapResult.errors || [{ code: mapResult.code || 'MAP_COMMIT_FAILED', path: 'map', hint: 'Persistence rejected the transaction.' }];
            if (attempt < MAX_CORRECTION_ATTEMPTS && mapResult.retryable !== false) {
                prompt = correctionPrompt({
                    site, trigger, worldReport, digest, bubble, currentLocation, partyIsHere,
                    priorOutput: output, errors: lastIssues, attempt: attempt + 1,
                });
                continue;
            }
            break;
        }
        if (mapResult.alreadyApplied) {
            broadcastStep('finish', `${site.siteRoot}: already applied.`);
        } else {
            const n = Array.isArray(parsed.value.operations) ? parsed.value.operations.length : 0;
            broadcastStep('result', summarizeEvolutionDigest(site.siteRoot, parsed.value));
            broadcastStep('finish', `${site.siteRoot}: applied ${n} operation${n === 1 ? '' : 's'}.`);
        }
        stampTriggerMessage(ctx, snapshot);
        return {
            ok: true,
            siteRoot: site.siteRoot,
            result: mapResult,
            transaction: parsed.value,
            digestLine: summarizeEvolutionDigest(site.siteRoot, parsed.value),
        };
    }

    const concise = lastIssues.slice(0, 8).map(issue => `${issue.code} at ${issue.path}: ${issue.hint}`).join('; ');
    console.warn('[RPG Tracker] Map Evolution could not apply a valid transaction for', site.siteRoot, concise || lastOutput);
    broadcastStep('error', `${site.siteRoot}: ${concise || 'Validation failure.'}`);
    return { ok: false, siteRoot: site.siteRoot, errors: lastIssues };
}

function resolveSitesForPass(loaded, {
    trigger, worldReport, isManual, siteRoots, currentLocation, settings, currentMinutes,
}) {
    const sites = loaded.sites || [];
    if (trigger === 'world_progression') {
        return orderMappedSitesForEvolution(selectMappedSitesForWorldReport(sites, worldReport));
    }
    if (trigger === 'site_exit') {
        const departed = String(settings.mapEvolutionPendingExitRoot || '').trim();
        return sites.filter(site => dungeonRootsEqual(site.siteRoot, departed));
    }
    if (isManual || trigger === 'manual') {
        if (Array.isArray(siteRoots)) {
            return filterSitesByRoots(sites, siteRoots);
        }
        const active = activeSiteFrom(loaded, currentLocation);
        return active ? [active] : [];
    }
    const active = activeSiteFrom(loaded, currentLocation);
    const picked = pickSitesForEvolutionTick(sites, {
        scope: settings.mapEvolutionTickScope,
        count: settings.mapEvolutionTickCount,
        randomize: settings.mapEvolutionTickRandomize !== false,
        selectedRoots: settings.mapEvolutionSelectedRoots,
        currentRoot: active?.siteRoot || '',
        lastFiredMinutesFor: root => lastFiredMinutesForSite(settings, root),
        currentMinutes,
        intervalHours: settings.mapEvolutionIntervalHours,
    });
    return [...picked.baseline, ...picked.due];
}

function dungeonRootsEqual(left, right) {
    const a = normalizeDungeonLabel(left);
    const b = normalizeDungeonLabel(right);
    return !!a && a === b;
}

/**
 * One Map Evolution pass. Sequential per selected site; never dumps every map
 * into a single prompt.
 *
 * @param {{
 *   trigger?: 'world_progression'|'interval'|'site_exit'|'manual',
 *   worldReport?: string,
 *   periodLabel?: string,
 *   isManual?: boolean,
 *   siteRoots?: string[],
 * }} [options]
 */
export async function runMapEvolutionPass({
    trigger = 'interval',
    worldReport = '',
    periodLabel = '',
    isManual = false,
    siteRoots = null,
} = {}) {
    const settings = getSettings();
    if (settings.mapEvolutionEnabled === false && !isManual) return { skipped: 'disabled' };
    if (!isLocationMappingEnabled(settings)) return { skipped: 'location_mapping_off' };
    if (_mapEvolutionRunning || _mapEvolutionStarting || isRouterRunning()) {
        return { skipped: 'busy' };
    }

    const ctx = SillyTavern.getContext();
    _mapEvolutionStarting = true;
    try {
        const loaded = await loadAllMappedSiteContexts();
        if (!loaded?.sites?.length) return { skipped: 'no_maps' };

        const currentLocation = loaded.currentLocation || '';
        const currentTime = periodLabel || currentTimeFrom(settings);
        const currentMinutes = parseInWorldMinutes(currentTime);
        const selected = resolveSitesForPass(loaded, {
            trigger, worldReport, isManual, siteRoots, currentLocation, settings, currentMinutes,
        });
        if (!selected.length) return { skipped: 'no_matching_sites' };

        const baselineOnly = selected.filter(site => site.stampBaselineOnly);
        const toEvolve = selected.filter(site => !site.stampBaselineOnly);
        if (baselineOnly.length && !toEvolve.length) {
            for (const site of baselineOnly) stampSiteFired(settings, site.siteRoot, currentTime);
            persistMapEvolutionState();
            return { ok: true, baseline: true, sites: baselineOnly.map(site => site.siteRoot) };
        }

        _mapEvolutionRunning = true;
        if (_mapEvolutionController) _mapEvolutionController.abort();
        _mapEvolutionController = new AbortController();
        const signal = _mapEvolutionController.signal;
        document.dispatchEvent(new CustomEvent('rt_map_evolution_status', { detail: { running: true } }));
        broadcastStep('start', `Initializing Map Evolution (${trigger})...`);

        const snapshot = await snapshotCampaignLocationsBook();
        const digestLines = [];
        const results = [];
        const books = loaded.books;

        for (const site of [...baselineOnly, ...toEvolve]) {
            if (site.stampBaselineOnly) {
                stampSiteFired(settings, site.siteRoot, currentTime);
                continue;
            }
            const siteResult = await evolveOneSite({
                site,
                books,
                trigger,
                worldReport,
                digest: digestLines.join('\n'),
                currentLocation,
                currentTime,
                settings,
                signal,
                snapshot,
                ctx,
            });
            results.push(siteResult);
            if (siteResult?.digestLine) digestLines.push(siteResult.digestLine);
            if (siteResult?.ok) stampSiteFired(settings, site.siteRoot, currentTime);
        }

        persistMapEvolutionState();
        const applied = results.filter(row => row?.ok && !row.noop).length;
        const noops = results.filter(row => row?.noop).length;
        const failed = results.filter(row => row && row.ok === false).length;
        broadcastStep('finish', `Map Evolution: ${applied} applied, ${noops} noop, ${failed} failed.`);
        return { ok: failed === 0, results, applied, noops, failed };
    } catch (error) {
        if (error?.name === 'AbortError') {
            console.log('[RPG Tracker] Map Evolution aborted by user.');
            if (_mapEvolutionRunning) broadcastStep('error', 'Stopped by user.');
            return { skipped: 'stopped' };
        }
        console.error('[RPG Tracker] Map Evolution failed:', error);
        if (_mapEvolutionRunning) broadcastStep('error', String(error?.message || error));
        return { ok: false, error: String(error?.message || error) };
    } finally {
        _mapEvolutionStarting = false;
        if (_mapEvolutionRunning) {
            _mapEvolutionRunning = false;
            _mapEvolutionController = null;
            document.dispatchEvent(new CustomEvent('rt_map_evolution_status', { detail: { running: false } }));
        }
    }
}

/** Ground maps from a freshly written World Report. Sequential, filtered. */
export async function groundMapsAfterWorldProgression(wpResult) {
    if (!wpResult?.ok || !String(wpResult.reportContent || '').trim()) {
        return { skipped: 'no_report' };
    }
    return runMapEvolutionPass({
        trigger: 'world_progression',
        worldReport: wpResult.reportContent,
        periodLabel: wpResult.periodLabel || '',
    });
}

/**
 * Interval restlessness for the configured map pool, plus one pass when the party just left a mapped site.
 */
export async function maybeRunMapEvolution() {
    const settings = getSettings();
    if (settings.mapEvolutionEnabled === false) return { skipped: 'disabled' };
    if (!isLocationMappingEnabled(settings)) return { skipped: 'location_mapping_off' };

    const loaded = await loadAllMappedSiteContexts();
    const currentLocation = loaded?.currentLocation || '';
    const active = loaded ? activeSiteFrom(loaded, currentLocation) : null;
    const currentRoot = active?.siteRoot || '';
    const previousRoot = String(settings.mapEvolutionLastSiteRoot || '').trim();

    let exitResult = null;
    if (previousRoot && !dungeonRootsEqual(previousRoot, currentRoot)) {
        const already = lastFiredMinutesForSite(settings, previousRoot);
        const now = parseInWorldMinutes(currentTimeFrom(settings));
        if (!(Number.isFinite(already) && already >= 0 && already === now)) {
            settings.mapEvolutionPendingExitRoot = previousRoot;
            exitResult = await runMapEvolutionPass({ trigger: 'site_exit' });
        }
        settings.mapEvolutionPendingExitRoot = '';
    }
    settings.mapEvolutionLastSiteRoot = currentRoot;
    persistMapEvolutionState();

    const scope = normalizeEvolutionTickScope(settings.mapEvolutionTickScope);
    if (!currentRoot && scope === 'active') return exitResult || { skipped: 'no_active_map' };
    const intervalResult = await runMapEvolutionPass({ trigger: 'interval' });
    return { exit: exitResult, interval: intervalResult };
}

/** Compact mapped-site list for settings checklists and the on-demand picker. */
export async function listMappedEvolutionSites() {
    if (!isLocationMappingEnabled(getSettings())) return [];
    const loaded = await loadAllMappedSiteContexts();
    const currentLocation = loaded?.currentLocation || '';
    return (loaded?.sites || []).map(site => {
        const here = !!(currentLocation && (
            normalizeDungeonLabel(currentLocation).includes(normalizeDungeonLabel(site.siteRoot))
            || resolveCurrentMapPlacement(site.document, currentLocation).area
        ));
        return {
            siteRoot: site.siteRoot,
            kind: normalizeMapSiteKind(site.document?.kind),
            current: here,
        };
    });
}
