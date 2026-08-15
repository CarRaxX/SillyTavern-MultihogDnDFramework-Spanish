/**
 * Pure Map Evolution helpers: scheduled site selection, digest, player bubble, interval due.
 * Kept out of map-evolution.js so filters stay testable without the LLM pass / router.
 */
import { normalizeDungeonLabel, resolveCurrentMapPlacement } from './dungeon-reality.js';
import { parseInWorldTime } from './memo-processor.js';

export function isEvolutionNoop(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (value.noop === true) return true;
    return Array.isArray(value.operations) && value.operations.length === 0;
}

export function summarizeEvolutionDigest(siteRoot, transaction) {
    if (isEvolutionNoop(transaction)) return '';
    const ops = Array.isArray(transaction?.operations) ? transaction.operations : [];
    const bits = ops.slice(0, 8).map(operation => {
        const op = String(operation?.op || '').trim();
        if (op === 'MOVE_ASSET') return `${operation.asset_id} moved to ${operation.to}`;
        if (op === 'ADD_ASSET') return `added ${operation.name} in ${operation.location}`;
        if (op === 'SET_ASSET') return `${operation.asset_id} ${operation.state || 'updated'}`;
        if (op === 'REMOVE_ASSET') return `${operation.asset_id} left the site`;
        if (op === 'SET_CONNECTION') return `route ${operation.from}→${operation.to} ${operation.state}`;
        if (op === 'SET_AREA') return `geometry ${operation.area_id}`;
        return op || 'OP';
    });
    return `${siteRoot}: ${bits.join('; ')}`;
}

export function resolvePlayerBubble(document, currentLocation, { combatActive = false } = {}) {
    const placement = resolveCurrentMapPlacement(document, currentLocation);
    if (!placement.area) return { frozenAreaIds: [], combatActive, area: null };
    return {
        frozenAreaIds: [placement.area.id],
        combatActive: !!combatActive,
        area: placement.area,
    };
}

/**
 * First visit stamps a baseline and does not fire. Later elapsed intervals fire.
 */
export function siteEvolutionDue(lastMinutes, currentMinutes, intervalHours) {
    const interval = Math.max(1, Number(intervalHours) || 4) * 60;
    if (!Number.isFinite(lastMinutes) || lastMinutes < 0) return { due: false, baseline: true };
    if (!Number.isFinite(currentMinutes) || currentMinutes < 0) return { due: false, baseline: false };
    return { due: (currentMinutes - lastMinutes) >= interval, baseline: false };
}

function parseFiredMinutes(label) {
    const mins = parseInWorldTime(label);
    return mins != null && Number.isFinite(mins) && mins >= 0 ? mins : -1;
}

export function formatEvolutionElapsedMinutes(totalMinutes) {
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return 'Unknown';
    const total = Math.floor(totalMinutes);
    if (total === 0) return '0 in-world minutes';
    const days = Math.floor(total / 1440);
    const hours = Math.floor((total % 1440) / 60);
    const minutes = total % 60;
    const parts = [];
    if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
    if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    return `${parts.join(', ')} (${total} in-world minutes total)`;
}

export const MAX_MAP_EVOLUTION_BACKLOG_ENTRIES = 20;
export const MAP_EVOLUTION_BACKLOG_PROMPT_ENTRIES = 10;

function normalizeEvolutionBacklogEntry(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const kind = value.kind === 'commit' ? 'commit' : value.kind === 'quiet' ? 'quiet' : '';
    if (!kind) return null;
    const elapsedValue = Number(value.elapsedMinutes);
    const passesValue = Number(value.passes);
    return {
        kind,
        at: String(value.at || '').trim() || 'Unknown',
        elapsedMinutes: Number.isFinite(elapsedValue) && elapsedValue >= 0 ? Math.floor(elapsedValue) : -1,
        passes: Math.max(1, Math.min(1000000, Math.floor(Number.isFinite(passesValue) ? passesValue : 1))),
        operationId: kind === 'commit' ? String(value.operationId || '').trim().slice(0, 120) : '',
        summary: String(value.summary || '').trim().slice(0, 600)
            || (kind === 'commit' ? 'A material map change was committed.' : 'No material map change was committed.'),
    };
}

/**
 * Append one successful Map Evolution outcome to a bounded, per-site ledger.
 * Quiet checkpoints are retained because they let frequent short intervals
 * accumulate into a meaningful unattended trajectory. Commit operation IDs are
 * de-duplicated so idempotent transaction retries do not become fake history.
 */
export function appendEvolutionBacklogEntry(backlogBySite, siteRoot, entry, {
    limit = MAX_MAP_EVOLUTION_BACKLOG_ENTRIES,
} = {}) {
    const key = normalizeDungeonLabel(siteRoot);
    const next = { ...(backlogBySite && typeof backlogBySite === 'object' ? backlogBySite : {}) };
    if (!key) return next;
    const prior = (Array.isArray(next[key]) ? next[key] : [])
        .map(normalizeEvolutionBacklogEntry)
        .filter(Boolean);
    const boundedLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || MAX_MAP_EVOLUTION_BACKLOG_ENTRIES)));
    const normalized = normalizeEvolutionBacklogEntry(entry);
    if (!normalized) {
        next[key] = prior.slice(-boundedLimit);
        return next;
    }
    if (normalized.kind === 'commit' && normalized.operationId
        && prior.some(item => item.kind === 'commit' && item.operationId === normalized.operationId)) {
        next[key] = prior.slice(-boundedLimit);
        return next;
    }
    if (normalized.kind === 'quiet' && normalized.elapsedMinutes >= 0
        && prior.at(-1)?.kind === 'quiet' && prior.at(-1).elapsedMinutes >= 0) {
        const previous = prior.at(-1);
        prior[prior.length - 1] = {
            ...normalized,
            elapsedMinutes: previous.elapsedMinutes + normalized.elapsedMinutes,
            passes: previous.passes + normalized.passes,
            summary: `${previous.passes + normalized.passes} consecutive Map Evolution passes committed no material change.`,
        };
        next[key] = prior.slice(-boundedLimit);
        return next;
    }
    next[key] = [...prior, normalized].slice(-boundedLimit);
    return next;
}

/**
 * Build the trajectory supplied to one Map Evolution request. The current gap
 * is included in cumulative and post-commit quiet time even though its outcome
 * has not been recorded yet.
 */
export function describeEvolutionBacklog(backlogBySite, siteRoot, currentElapsedMinutes, {
    lookback = MAP_EVOLUTION_BACKLOG_PROMPT_ENTRIES,
} = {}) {
    const key = normalizeDungeonLabel(siteRoot);
    const normalizedStored = (Array.isArray(backlogBySite?.[key]) ? backlogBySite[key] : [])
        .map(normalizeEvolutionBacklogEntry)
        .filter(Boolean);
    const stored = normalizedStored.slice(-MAX_MAP_EVOLUTION_BACKLOG_ENTRIES);
    const boundedLookback = Math.max(1, Math.min(
        MAX_MAP_EVOLUTION_BACKLOG_ENTRIES,
        Math.floor(Number(lookback) || MAP_EVOLUTION_BACKLOG_PROMPT_ENTRIES),
    ));
    const entries = stored.slice(-boundedLookback);
    const currentValue = Number(currentElapsedMinutes);
    const currentKnown = Number.isFinite(currentValue) && currentValue >= 0;
    const currentMinutes = currentKnown ? Math.floor(currentValue) : -1;
    const knownEntries = stored.filter(entry => entry.elapsedMinutes >= 0);
    const knownEntryMinutes = knownEntries.reduce((sum, entry) => sum + entry.elapsedMinutes, 0);
    const representedMinutes = knownEntryMinutes + (currentKnown ? currentMinutes : 0);
    const representedHasUnknown = !currentKnown || stored.some(entry => entry.elapsedMinutes < 0);
    const representedHasKnown = currentKnown || knownEntries.length > 0;

    let quietMinutes = currentKnown ? currentMinutes : 0;
    let quietHasUnknown = !currentKnown;
    let quietHasKnown = currentKnown;
    for (let index = stored.length - 1; index >= 0; index--) {
        const entry = stored[index];
        if (entry.kind === 'commit') break;
        if (entry.elapsedMinutes >= 0) {
            quietMinutes += entry.elapsedMinutes;
            quietHasKnown = true;
        }
        else quietHasUnknown = true;
    }

    return {
        entries,
        representedMinutes,
        representedElapsed: representedHasKnown
            ? `${representedHasUnknown ? 'At least ' : ''}${formatEvolutionElapsedMinutes(representedMinutes)}`
            : 'Unknown',
        quietMinutes,
        quietElapsed: quietHasKnown
            ? `${quietHasUnknown ? 'At least ' : ''}${formatEvolutionElapsedMinutes(quietMinutes)}`
            : 'Unknown',
        truncated: normalizedStored.length > entries.length,
    };
}

/**
 * Build the authoritative per-site time window supplied to Map Evolution.
 * Last Evolved is the scheduler watermark for this exact map, not the UI's
 * aggregate most-recent timestamp across all maps.
 */
export function describeEvolutionTimeWindow(lastEvolvedLabel, currentTimeLabel) {
    const lastLabel = String(lastEvolvedLabel || '').trim();
    const currentLabel = String(currentTimeLabel || '').trim();
    const lastMinutes = parseFiredMinutes(lastLabel);
    const currentMinutes = parseFiredMinutes(currentLabel);

    if (lastMinutes < 0) {
        return {
            lastEvolved: lastLabel || 'Never',
            currentTime: currentLabel || 'Unknown',
            elapsedMinutes: -1,
            elapsed: 'Unknown — this site has no Last Evolved baseline.',
        };
    }
    if (currentMinutes < 0) {
        return {
            lastEvolved: lastLabel,
            currentTime: currentLabel || 'Unknown',
            elapsedMinutes: -1,
            elapsed: 'Unknown — the current in-world time could not be parsed.',
        };
    }
    if (currentMinutes < lastMinutes) {
        return {
            lastEvolved: lastLabel,
            currentTime: currentLabel,
            elapsedMinutes: -1,
            elapsed: 'Unknown — current time precedes Last Evolved; do not infer accumulated change.',
        };
    }
    const elapsedMinutes = currentMinutes - lastMinutes;
    return {
        lastEvolved: lastLabel,
        currentTime: currentLabel,
        elapsedMinutes,
        elapsed: formatEvolutionElapsedMinutes(elapsedMinutes),
    };
}

/**
 * WP-style last/next readout for Map Evolution's per-site interval clocks.
 * Last = most recent site stamp. Next = soonest last+interval, or current+interval if none.
 */
export function summarizeMapEvolutionSchedule(lastFiredBySite, {
    intervalHours = 4,
    currentMinutes = -1,
} = {}) {
    const interval = Math.max(1, Number(intervalHours) || 4) * 60;
    const times = Object.values(lastFiredBySite && typeof lastFiredBySite === 'object' ? lastFiredBySite : {})
        .map(parseFiredMinutes)
        .filter(mins => mins >= 0);
    const lastMins = times.length ? Math.max(...times) : -1;
    let nextMins = -1;
    if (times.length) nextMins = Math.min(...times.map(mins => mins + interval));
    else if (Number.isFinite(currentMinutes) && currentMinutes >= 0) nextMins = currentMinutes + interval;
    return { lastMins, nextMins };
}

/** Stamp one last-fired in-world label onto every listed site root. */
export function stampEvolutionLastFired(lastFiredBySite, roots, timeLabel) {
    const next = { ...(lastFiredBySite && typeof lastFiredBySite === 'object' ? lastFiredBySite : {}) };
    const label = String(timeLabel || '').trim();
    for (const root of normalizeEvolutionRootList(roots)) {
        next[normalizeDungeonLabel(root)] = label;
    }
    return next;
}

export const MAP_EVOLUTION_TICK_SCOPES = ['active', 'count', 'all', 'selected'];

export function normalizeEvolutionTickScope(value) {
    const scope = String(value || '').trim().toLowerCase();
    return MAP_EVOLUTION_TICK_SCOPES.includes(scope) ? scope : 'active';
}

export function normalizeEvolutionRootList(roots) {
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(roots) ? roots : []) {
        const label = String(raw || '').trim();
        const key = normalizeDungeonLabel(label);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(label);
    }
    return out;
}

export function siteRootKey(site) {
    return normalizeDungeonLabel(site?.siteRoot || site?.document?.site);
}

export function filterSitesByRoots(sites, roots) {
    const wanted = new Set(normalizeEvolutionRootList(roots).map(root => normalizeDungeonLabel(root)));
    if (!wanted.size) return [];
    return (sites || []).filter(site => wanted.has(siteRootKey(site)));
}

function shuffleCopy(items, random) {
    const next = [...items];
    for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
}

/**
 * Which mapped sites an interval tick should stamp / evolve.
 * Baselines are returned separately so they never consume the per-tick count.
 * count 0 means every due site in the pool.
 */
export function pickSitesForEvolutionTick(sites, {
    scope = 'active',
    count = 1,
    randomize = true,
    selectedRoots = [],
    currentRoot = '',
    lastFiredMinutesFor = () => -1,
    currentMinutes = -1,
    intervalHours = 4,
    random = Math.random,
} = {}) {
    const normalizedScope = normalizeEvolutionTickScope(scope);
    let pool = Array.isArray(sites) ? [...sites] : [];
    if (normalizedScope === 'active') {
        const key = normalizeDungeonLabel(currentRoot);
        pool = key ? pool.filter(site => siteRootKey(site) === key) : [];
    } else if (normalizedScope === 'selected') {
        pool = filterSitesByRoots(pool, selectedRoots);
    }

    const baseline = [];
    const due = [];
    for (const site of pool) {
        const status = siteEvolutionDue(lastFiredMinutesFor(site.siteRoot), currentMinutes, intervalHours);
        if (status.baseline) baseline.push({ ...site, stampBaselineOnly: true });
        else if (status.due) due.push(site);
    }

    if (normalizedScope === 'active' || normalizedScope === 'all') {
        return { baseline, due, pool };
    }

    const takeAll = !Number.isFinite(Number(count)) || Number(count) <= 0;
    if (takeAll) return { baseline, due, pool };

    const limit = Math.max(1, Math.min(50, Number(count) || 1));
    const ordered = randomize
        ? shuffleCopy(due, typeof random === 'function' ? random : Math.random)
        : [...due].sort((left, right) => {
            const delta = lastFiredMinutesFor(left.siteRoot) - lastFiredMinutesFor(right.siteRoot);
            if (delta !== 0) return delta;
            return String(left.siteRoot || '').localeCompare(String(right.siteRoot || ''));
        });
    return { baseline, due: ordered.slice(0, limit), pool };
}
