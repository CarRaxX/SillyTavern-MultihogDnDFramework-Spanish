/**
 * Text-command opener for Map Architect when the narrator cannot use CreateAreaMap.
 * Native tool calling stays the default; this is an alternative handshake only.
 */

import { normalizeMapSiteKind } from './dungeon-reality.js';

export const MAP_ARCHITECT_OPENER_TOOL = 'tool';
export const MAP_ARCHITECT_OPENER_TEXT = 'text';

export const CREATE_AREA_MAP_OPEN_TAG = '[CREATE_AREA_MAP]';
export const CREATE_AREA_MAP_CLOSE_TAG = '[/CREATE_AREA_MAP]';

const FENCE_RE = /\[CREATE_AREA_MAP\]([\s\S]*?)\[\/CREATE_AREA_MAP\]/i;
const KEY_LINE_RE = /^\s*(site|entrance|kind|scale|premise)\s*:\s*(.*)$/i;

/** Shipped dungeon-reality opener bullets used when text mode is live. */
export const MAP_ARCHITECT_TEXT_OPENER_RULES = `- Before narrating entry into an unmapped high-risk dungeon, ruin, stronghold, lair, trapped complex, or similar site, output ONLY a [CREATE_AREA_MAP] ... [/CREATE_AREA_MAP] block with kind DUNGEON, its exact footer root, current entrance, scale, and established premise. Then STOP. Do not narrate entry yet. Do not design or emit the hidden map yourself.
- Before narrating entry into an unmapped town, city, village, or similar settlement, output ONLY a [CREATE_AREA_MAP] ... [/CREATE_AREA_MAP] block with kind SETTLEMENT, its exact footer root, current entrance (gate, square, docks, etc.), scale, and established premise. Then STOP. Do not narrate entry yet.
- If a \`[DUNGEON_REALITY — INTERNAL GM CANON]\` block already exists for that site, its map is attached: do not emit the command again.
- Treat the Map Architect result and subsequent DUNGEON_REALITY blocks as private objective canon. Reveal only what {{user}} can perceive.`;

export function isMapArchitectTextOpener(settings) {
    return String(settings?.mapArchitectOpener || MAP_ARCHITECT_OPENER_TOOL).trim().toLowerCase() === MAP_ARCHITECT_OPENER_TEXT;
}

export function normalizeMapArchitectOpener(value) {
    return String(value || '').trim().toLowerCase() === MAP_ARCHITECT_OPENER_TEXT
        ? MAP_ARCHITECT_OPENER_TEXT
        : MAP_ARCHITECT_OPENER_TOOL;
}

function normalizeArgs(raw) {
    const args = {
        site: String(raw?.site || '').trim(),
        entrance: String(raw?.entrance || '').trim(),
        premise: String(raw?.premise || '').trim(),
        kind: normalizeMapSiteKind(raw?.kind),
        scale: String(raw?.scale || 'MEDIUM').trim().toUpperCase(),
    };
    if (!['SMALL', 'MEDIUM', 'LARGE'].includes(args.scale)) args.scale = 'MEDIUM';
    return args;
}

function parseKeyedBody(body) {
    const trimmed = String(body || '').trim();
    if (!trimmed) return normalizeArgs({});
    if (trimmed.startsWith('{')) {
        try {
            return normalizeArgs(JSON.parse(trimmed));
        } catch (_) { /* fall through to keyed lines */ }
    }
    const args = { site: '', entrance: '', kind: '', scale: 'MEDIUM', premise: '' };
    let currentKey = null;
    const premiseParts = [];
    for (const line of trimmed.split(/\r?\n/)) {
        const match = line.match(KEY_LINE_RE);
        if (match) {
            currentKey = match[1].toLowerCase();
            const rest = String(match[2] || '');
            if (currentKey === 'premise') premiseParts.push(rest);
            else args[currentKey] = rest.trim();
            continue;
        }
        if (currentKey === 'premise') premiseParts.push(line);
    }
    if (premiseParts.length) args.premise = premiseParts.join('\n').trim();
    return normalizeArgs(args);
}

/**
 * @param {string} text
 * @returns {{ args: { site: string, entrance: string, kind: string, scale: string, premise: string }, preamble: string, raw: string } | null}
 */
export function parseCreateAreaMapCommand(text) {
    const source = String(text || '');
    const match = source.match(FENCE_RE);
    if (!match) return null;
    const args = parseKeyedBody(match[1]);
    const preamble = source.slice(0, match.index).trim();
    return { args, preamble, raw: match[0] };
}

export function createAreaMapCommandIsComplete(args) {
    return !!(args?.site && args?.entrance && args?.premise && args?.kind);
}

/**
 * Keep prose before the fence; drop the fence and everything after it.
 * Empty leftovers become a zero-width space so SillyTavern continue still has a stub.
 */
export function stripCreateAreaMapCommand(text) {
    const parsed = parseCreateAreaMapCommand(text);
    if (!parsed) return { text: String(text || ''), command: null };
    const kept = parsed.preamble || '\u200b';
    return { text: kept, command: parsed };
}
