/**
 * Pure Map Evolution helpers: site selection, ordering, digest, player bubble, interval due.
 * Kept out of map-evolution.js so filters stay testable without the LLM pass / router.
 */
import {
    isPlayCanonLockedState,
    normalizeDungeonLabel,
    resolveCurrentMapPlacement,
} from './dungeon-reality.js';

const MIN_MENTION_LENGTH = 4;

export function isEvolutionNoop(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (value.noop === true) return true;
    return Array.isArray(value.operations) && value.operations.length === 0;
}

export function reportMentionsLabel(reportText, label) {
    const haystack = normalizeDungeonLabel(reportText);
    const needle = normalizeDungeonLabel(label);
    if (!needle || needle.length < MIN_MENTION_LENGTH) return false;
    return haystack.includes(needle);
}

function isMobileAsset(asset) {
    return !isPlayCanonLockedState(asset?.state);
}

/**
 * Deterministic prefilter: which mapped sites a World Report can ground onto.
 * Matches site roots, asset names, and factions — not short area labels.
 */
export function selectMappedSitesForWorldReport(sites, reportText) {
    const report = String(reportText || '');
    if (!report.trim()) return [];
    const selected = [];
    for (const site of sites || []) {
        const reasons = [];
        const hostAssets = [];
        if (reportMentionsLabel(report, site.siteRoot) || reportMentionsLabel(report, site.document?.site)) {
            reasons.push('site');
        }
        for (const asset of site.document?.assets || []) {
            const nameHit = reportMentionsLabel(report, asset.name);
            const factionHit = !!(asset.faction && reportMentionsLabel(report, asset.faction));
            if (!nameHit && !factionHit) continue;
            reasons.push(nameHit ? 'asset' : 'faction');
            if (nameHit && isMobileAsset(asset)) hostAssets.push(asset.id);
        }
        if (reasons.length) {
            selected.push({ ...site, reasons: [...new Set(reasons)], hostAssets });
        }
    }
    return selected;
}

/** Hosts (matched living assets) first, then sites named only as destinations. */
export function orderMappedSitesForEvolution(selected) {
    const rows = Array.isArray(selected) ? selected : [];
    const hosts = rows.filter(site => site.hostAssets?.length);
    const named = rows.filter(site => !site.hostAssets?.length);
    return [...hosts, ...named];
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
