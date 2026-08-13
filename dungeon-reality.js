/**
 * Durable dungeon-reality capture and deterministic prompt injection helpers.
 *
 * Hidden maps are persisted as a structured current-state snapshot in a root
 * Location entry. Legacy prose is migrated without depending on the original
 * chat message remaining in context.
 */

// Some models incorrectly emit `</div hidden>`. Accept that legacy/malformed
// closing tag so an otherwise valid hidden map is not silently lost.
const DIV_RE = /<div\b([^>]*)>([\s\S]*?)<\/div(?:\s+hidden)?>/gi;
const LOCATION_RE = /\(Location:\s*([^)]+)\)/gi;
const SITE_MARKER_RE = /^\s*(?:Dungeon\s+)?Site(?:\s+Root)?\s*:\s*(.+?)\s*$/im;
const DELTA_LINE_RE = /^\s*(mutation|addition)\s*:\s*(.+?)\s*\|\s*(.+?)\s*$/i;
const LEADING_ARTICLE_RE = /^(?:the|a|an)\s+/;

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hasHiddenAttribute(attributes) {
    return /(?:^|\s)hidden(?:\s|=|$)/i.test(String(attributes || ''));
}

function hasDungeonDeltaAttribute(attributes) {
    return /(?:^|\s)data-dungeon-delta(?:\s|=|$)/i.test(String(attributes || ''));
}

function hasDungeonMapAttribute(attributes) {
    return /(?:^|\s)data-dungeon-map(?:\s|=|$)/i.test(String(attributes || ''));
}

/** Lorebook entry extension field containing the private objective map. */
export const DUNGEON_MAP_EXTENSION_KEY = 'multihogDungeonMap';
export const DUNGEON_MAP_OPERATION_IDS_KEY = 'multihogDungeonMapOperationIds';
export const DUNGEON_MAP_FORMAT_VERSION = 3;
const MAP_SECTION_RE = /\[MAP\]([\s\S]*?)\[\/MAP\]/i;

const AREA_KNOWLEDGE = ['UNREVEALED', 'DISCOVERED', 'VISITED'];
const ASSET_KNOWLEDGE = ['UNREVEALED', 'SUSPECTED', 'KNOWN'];
const ASSET_KINDS = ['CREATURE', 'GROUP', 'TRAP', 'HAZARD', 'OBJECT', 'LOOT', 'BARRIER', 'ALARM', 'EFFECT', 'OTHER'];
const ASSET_STATES = [
    'ACTIVE', 'ALERT', 'IDLE', 'DORMANT', 'FLEEING', 'CAPTURED',
    'DEAD', 'DESTROYED', 'DISABLED', 'DISARMED', 'ARMED', 'TRIGGERED',
    'LOCKED', 'UNLOCKED', 'OPEN', 'CLOSED', 'BLOCKED', 'CLEARED',
    'INTACT', 'DAMAGED', 'TAKEN', 'AVAILABLE', 'EXHAUSTED', 'EXPIRED',
    'DISMISSED', 'REMOVED', 'UNKNOWN',
];
const CONNECTION_STATES = ['OPEN', 'CLOSED', 'LOCKED', 'BLOCKED', 'DESTROYED', 'UNKNOWN'];
const MAP_EVIDENCE = ['CONFIRMED', 'IMPLIED', 'AUTONOMOUS'];
const MAP_OPERATIONS = ['ADD_AREA', 'SET_AREA', 'ADD_ASSET', 'MOVE_ASSET', 'SET_ASSET', 'REMOVE_ASSET', 'SET_CONNECTION'];

function mapSlug(value, fallback = 'item') {
    const slug = String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || fallback;
}

function allocateMapId(existingIds, label, fallback) {
    const base = mapSlug(label, fallback);
    let id = base;
    let suffix = 2;
    while (existingIds.has(id)) id = `${base}-${suffix++}`;
    existingIds.add(id);
    return id;
}

function cleanStringList(value) {
    return Array.isArray(value)
        ? value.map(item => String(item || '').trim()).filter(Boolean)
        : [];
}

function enumValue(value, allowed, fallback) {
    const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    return allowed.includes(normalized) ? normalized : fallback;
}

function stripJsonFence(value) {
    return String(value || '').trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

function tryParseStructuredMap(content) {
    const source = stripJsonFence(content);
    if (!source.startsWith('{')) return null;
    try {
        const parsed = JSON.parse(source);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {
        return null;
    }
}

function inferLegacyAssetKind(line) {
    const text = String(line || '').toLowerCase();
    if (/\b(?:trap|tripwire|pressure plate|snare|pitfall|poison needle|rune trap)\b/.test(text)) return 'TRAP';
    if (/\b(?:alarm|bell|gong|warning horn)\b/.test(text)) return 'ALARM';
    if (/\b(?:door|gate|portcullis|barricade|barrier|grate)\b/.test(text)
        && /\b(?:locked|barred|chained|sealed|closed|open|ajar|blocked|corroded)\b/.test(text)) return 'BARRIER';
    if (/\b(?:contents?|loot|coins?|\bgp\b|treasure|cache|pouch|reliquary|holy water|gem|key\b)\b/.test(text)) return 'LOOT';
    if (/\b(?:ghouls?|skeletons?|wights?|zombies?|rats?|spiders?|goblins?|orcs?|guards?|cultists?|bandits?|shades?|spirits?|demons?|devils?|beasts?|creatures?|monsters?|undead|enemy|enemies|patrols?)\b/.test(text)) {
        return /\b(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\b/.test(text) ? 'GROUP' : 'CREATURE';
    }
    if (/\b(?:fire|flood|gas|sludge|unstable|collapse|difficult terrain|necromantic residue)\b/.test(text)) return 'HAZARD';
    return null;
}

function legacyAssetName(line, kind) {
    const clean = String(line || '').replace(/^[-*]\s*/, '').trim();
    if (['CREATURE', 'GROUP'].includes(kind)) {
        const creatureNoun = clean.match(/\b(shadow rats?|crawling claws?|skeleton guards?|ghouls?|skeletons?|wights?|zombies?|rats?|spiders?|goblins?|orcs?|guards?|cultists?|bandits?|shades?|spirits?|demons?|devils?|beasts?|creatures?|monsters?|undead|enemies?|patrols?)\b/i)?.[1];
        if (creatureNoun) return creatureNoun;
    }
    if (kind === 'BARRIER') {
        const barrier = clean.match(/\b((?:(?:heavy|oaken|oak|iron-banded|iron|corroded|rusted|stone|wooden|secret|concealed)\s+){0,3}(?:door|gate|portcullis|barricade|barrier|grate))\b/i)?.[1];
        if (barrier) return barrier;
    }
    if (kind === 'LOOT') {
        const loot = clean.match(/\b((?:(?:rusted|iron|silver|tarnished|copper|bronze|heavy)\s+){0,3}(?:reliquary|key|cache|pouch|treasure|holy water|holy symbol|contents?))\b/i)?.[1];
        if (loot) return loot;
    }
    if (kind === 'HAZARD') {
        const hazard = clean.match(/\b(black sludge|flooded water|black water|necromantic residue|difficult terrain|unstable rubble|gas|fire|flood)\b/i)?.[1];
        if (hazard) return hazard;
    }
    const creature = clean.match(/^(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+|a|an|the)\s+(.+?)(?=\s+(?:stands?|lies?|crouches?|nests?|waits?|guards?|flanks?|patrols?|lurks?|hides?|rests?|hangs?|is|are)\b|[.;]|$)/i);
    if (creature && ['CREATURE', 'GROUP'].includes(kind)) return creature[1].trim().replace(/\b(?:its|their)$/i, '').trim();
    const beforeColon = clean.match(/^([^:]{2,48}):/)?.[1]?.trim();
    if (beforeColon) return beforeColon;
    const words = clean.replace(/[.;].*$/, '').split(/\s+/).slice(0, 7).join(' ');
    return words || kind.toLowerCase();
}

function splitLegacyAssetStatements(line) {
    return String(line || '').split(/;\s+|(?<=[.!?])\s+(?=(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+|a|an|the)\s)/i);
}

function inferLegacyAssetState(kind, line) {
    const text = String(line || '').toLowerCase();
    if (kind === 'TRAP' || kind === 'ALARM') return 'ARMED';
    if (kind === 'LOOT') return 'AVAILABLE';
    if (kind !== 'BARRIER') return 'ACTIVE';
    if (/\b(?:open|ajar)\b/.test(text)) return 'OPEN';
    if (/\b(?:locked|chained|sealed)\b/.test(text)) return 'LOCKED';
    if (/\b(?:blocked)\b/.test(text)) return 'BLOCKED';
    if (/\b(?:barred|closed|shut)\b/.test(text)) return 'CLOSED';
    if (/\b(?:destroyed|broken)\b/.test(text)) return 'DESTROYED';
    return 'UNKNOWN';
}

/** Convert the original prose map format into the mutable v3 geometry/assets model. */
export function convertLegacyDungeonMapToDocument(content, siteFallback = '') {
    const source = String(content || '').trim();
    const site = source.match(SITE_MARKER_RE)?.[1]?.trim() || String(siteFallback || '').trim() || 'Mapped Site';
    const rawAreas = [];
    let current = null;
    for (const rawLine of source.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || SITE_MARKER_RE.test(line)) continue;
        const areaMatch = line.match(/^Area\s*:\s*(.+?)\s*$/i);
        if (areaMatch) {
            current = { name: areaMatch[1].trim(), lines: [] };
            rawAreas.push(current);
            continue;
        }
        if (!current) {
            current = { name: 'Site Overview', lines: [] };
            rawAreas.push(current);
        }
        current.lines.push(line.replace(/^[-*]\s*/, '').trim());
    }
    if (!rawAreas.length) rawAreas.push({ name: 'Site Overview', lines: ['No area details were supplied.'] });

    const areaIds = new Set();
    const areas = rawAreas.map(area => ({
        id: allocateMapId(areaIds, area.name, 'area'),
        name: area.name,
        knowledge: 'UNREVEALED',
        geometry: [],
        connections: [],
    }));
    const assetIds = new Set();
    const assets = [];
    rawAreas.forEach((rawArea, index) => {
        const area = areas[index];
        for (const line of rawArea.lines) {
            const statements = splitLegacyAssetStatements(line);
            let foundAsset = false;
            for (const statement of statements) {
                const kind = inferLegacyAssetKind(statement);
                if (!kind) {
                    if (statements.length > 1) area.geometry.push(statement);
                    continue;
                }
                foundAsset = true;
                const name = legacyAssetName(statement, kind);
                assets.push({
                    id: allocateMapId(assetIds, name, 'asset'),
                    kind,
                    name,
                    location: area.id,
                    state: inferLegacyAssetState(kind, statement),
                    knowledge: 'UNREVEALED',
                    detail: statement,
                    origin: 'INITIAL_MAP',
                });
            }
            if (!foundAsset && statements.length === 1) area.geometry.push(line);
        }
    });

    // Recover explicit prose connections after every stable area label is known.
    rawAreas.forEach((rawArea, index) => {
        const haystack = rawArea.lines.join(' ').toLowerCase();
        for (const target of areas) {
            if (target.id === areas[index].id) continue;
            if (haystack.includes(target.name.toLowerCase())) {
                areas[index].connections.push({ to: target.id, state: 'OPEN', detail: '' });
            }
        }
    });

    return { version: DUNGEON_MAP_FORMAT_VERSION, site, areas, assets };
}

/** Normalize model-authored structured maps and fill safe defaults/IDs. */
export function normalizeDungeonMapDocument(raw, siteFallback = '') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return convertLegacyDungeonMapToDocument('', siteFallback);
    }
    const site = String(raw.site || raw.siteRoot || siteFallback || '').trim() || 'Mapped Site';
    const areaIds = new Set();
    const areas = (Array.isArray(raw.areas) ? raw.areas : []).map((area, index) => {
        const name = String(area?.name || area?.label || area?.id || `Area ${index + 1}`).trim();
        const proposed = mapSlug(area?.id || name, `area-${index + 1}`);
        const id = areaIds.has(proposed) ? allocateMapId(areaIds, name, 'area') : (areaIds.add(proposed), proposed);
        return {
            id,
            name,
            knowledge: enumValue(area?.knowledge, AREA_KNOWLEDGE, 'UNREVEALED'),
            geometry: cleanStringList(area?.geometry || area?.features || area?.notes),
            connections: [],
        };
    });
    if (!areas.length) {
        areas.push({ id: 'site-overview', name: 'Site Overview', knowledge: 'UNREVEALED', geometry: [], connections: [] });
        areaIds.add('site-overview');
    }
    const resolveArea = (ref) => {
        const rawRef = String(ref || '').trim();
        if (!rawRef) return '';
        const exact = areas.find(area => area.id === rawRef || normalizeDungeonLabel(area.name) === normalizeDungeonLabel(rawRef));
        return exact?.id || '';
    };
    (Array.isArray(raw.areas) ? raw.areas : []).forEach((area, index) => {
        if (!areas[index]) return;
        const connections = Array.isArray(area?.connections) ? area.connections : [];
        for (const connection of connections) {
            const to = resolveArea(typeof connection === 'string' ? connection : connection?.to);
            if (!to || to === areas[index].id || areas[index].connections.some(item => item.to === to)) continue;
            areas[index].connections.push({
                to,
                state: enumValue(connection?.state, CONNECTION_STATES, 'OPEN'),
                detail: typeof connection === 'object' ? String(connection?.detail || '').trim() : '',
            });
        }
    });

    const assetIds = new Set();
    const rawAssets = Array.isArray(raw.assets) ? raw.assets : [];
    const assets = rawAssets.map((asset, index) => {
        const name = String(asset?.name || asset?.label || asset?.id || `Asset ${index + 1}`).trim();
        const proposed = mapSlug(asset?.id || name, `asset-${index + 1}`);
        const id = assetIds.has(proposed) ? allocateMapId(assetIds, name, 'asset') : (assetIds.add(proposed), proposed);
        const state = enumValue(asset?.state, ASSET_STATES, 'ACTIVE');
        const location = state === 'REMOVED' && asset?.location == null
            ? null
            : (resolveArea(asset?.location) || areas[0].id);
        const normalized = {
            id,
            kind: enumValue(asset?.kind, ASSET_KINDS, 'OTHER'),
            name,
            location,
            state,
            knowledge: enumValue(asset?.knowledge, ASSET_KNOWLEDGE, 'UNREVEALED'),
            detail: String(asset?.detail || asset?.description || '').trim(),
            origin: String(asset?.origin || 'INITIAL_MAP').trim(),
        };
        const lastLocation = resolveArea(asset?.last_location);
        if (lastLocation) normalized.last_location = lastLocation;
        const behavior = String(asset?.behavior || '').trim();
        if (behavior) normalized.behavior = behavior;
        for (const field of ['faction', 'owner', 'duration']) {
            const value = String(asset?.[field] || '').trim();
            if (value) normalized[field] = value;
        }
        const route = cleanStringList(asset?.route).map(resolveArea).filter(Boolean);
        if (route.length) normalized.route = [...new Set(route)];
        return normalized;
    });
    return { version: DUNGEON_MAP_FORMAT_VERSION, site, areas, assets };
}

/** Parse either a v3 JSON map or a legacy prose map without losing its facts. */
export function parseDungeonMapDocument(content, siteFallback = '') {
    const structured = tryParseStructuredMap(content);
    if (structured) {
        return { document: normalizeDungeonMapDocument(structured, siteFallback), migrated: Number(structured.version) !== DUNGEON_MAP_FORMAT_VERSION };
    }
    return { document: convertLegacyDungeonMapToDocument(content, siteFallback), migrated: true };
}

export function serializeDungeonMapDocument(document) {
    return JSON.stringify(normalizeDungeonMapDocument(document, document?.site), null, 2);
}

/** Replace only the private map section, retaining [CORE] and visible chronicles. */
export function replaceDungeonMapSection(content, mapBody) {
    const body = String(mapBody || '').trim();
    const source = String(content || '');
    if (MAP_SECTION_RE.test(source)) return source.replace(MAP_SECTION_RE, `[MAP]\n${body}\n[/MAP]`);
    const visible = source.trimEnd();
    return `${visible}${visible ? '\n\n' : ''}[MAP]\n${body}\n[/MAP]`;
}

/** Return the private map body stored in a normal lorebook [MAP] section. */
export function extractDungeonMapSection(content) {
    return String(content || '').match(MAP_SECTION_RE)?.[1]?.trim() || '';
}

/** Remove [MAP] from display/narrator copies while leaving stored content intact. */
export function stripDungeonMapSection(content) {
    return String(content || '')
        .replace(MAP_SECTION_RE, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Return the selected plain-text body for either ST or API message shapes. */
export function getDungeonMessageText(message) {
    if (!message) return '';
    if (typeof message.mes === 'string') return message.mes;
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
        return message.content
            .filter(part => part?.type === 'text' && typeof part.text === 'string')
            .map(part => part.text)
            .join('\n');
    }
    return '';
}

function extractHiddenDivs(text) {
    const blocks = [];
    const source = String(text || '');
    DIV_RE.lastIndex = 0;
    let match;
    while ((match = DIV_RE.exec(source)) !== null) {
        const attributes = String(match[1] || '');
        if (!hasHiddenAttribute(attributes)) continue;
        const body = String(match[2] || '').trim();
        if (!body) continue;
        blocks.push({
            attributes,
            body,
            isMap: hasDungeonMapAttribute(attributes),
            isDelta: hasDungeonDeltaAttribute(attributes),
        });
    }
    return blocks;
}

/** Extract immutable map candidates, excluding explicit status-delta blocks. */
export function extractHiddenDungeonMapBlocks(text) {
    return extractHiddenDivs(text)
        .filter(block => !block.isDelta)
        .map(block => block.body);
}

/** Read a private map attachment from a lorebook Location entry. */
export function getDungeonMapAttachment(entry) {
    const mapSection = extractDungeonMapSection(entry?.content);
    if (mapSection) {
        const parsed = parseDungeonMapDocument(mapSection, String(entry?.comment || '').trim());
        return {
            version: DUNGEON_MAP_FORMAT_VERSION,
            siteRoot: parsed.document.site || String(entry?.comment || '').trim(),
            content: mapSection,
            storage: 'content',
            structured: !parsed.migrated,
        };
    }
    const attachment = entry?.extensions?.[DUNGEON_MAP_EXTENSION_KEY];
    if (!attachment || typeof attachment !== 'object') return null;
    const siteRoot = String(attachment.siteRoot || entry?.comment || '').trim();
    const content = String(attachment.content || '').trim();
    if (!siteRoot || !content) return null;
    return { ...attachment, siteRoot, content, storage: 'legacy-extension' };
}

/** Attach the immutable initial map without replacing an existing attachment. */
export function attachDungeonMapToLocationEntry(entry, map) {
    if (!entry || !map || extractDungeonMapSection(entry.content)) return false;
    const siteRoot = String(map.siteRoot || entry.comment || '').trim();
    const content = String(map.content || '').trim();
    if (!siteRoot || !content) return false;
    const document = parseDungeonMapDocument(content, siteRoot).document;
    const visible = stripDungeonMapSection(entry.content);
    entry.content = `${visible}${visible ? '\n\n' : ''}[MAP]\n${serializeDungeonMapDocument(document)}\n[/MAP]`;
    if (entry.extensions?.[DUNGEON_MAP_EXTENSION_KEY]) {
        delete entry.extensions[DUNGEON_MAP_EXTENSION_KEY];
    }
    return true;
}

/** Upgrade the earlier private-extension representation to normal [MAP] lore. */
export function migrateDungeonMapAttachmentToContent(entry) {
    const legacy = entry?.extensions?.[DUNGEON_MAP_EXTENSION_KEY];
    if (!legacy || typeof legacy !== 'object' || extractDungeonMapSection(entry.content)) return false;
    return attachDungeonMapToLocationEntry(entry, legacy);
}

/** Extract explicit append-only status blocks from a narrator message. */
export function extractHiddenDungeonDeltaBlocks(text) {
    return extractHiddenDivs(text)
        .filter(block => block.isDelta)
        .map(block => block.body);
}

/** Parse the intentionally small, prose-friendly delta cue format. */
export function parseDungeonDeltaBlock(block) {
    const text = String(block || '').trim();
    const siteRoot = text.match(SITE_MARKER_RE)?.[1]?.trim() || '';
    const entries = [];
    const errors = [];
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || SITE_MARKER_RE.test(line)) continue;
        const match = line.match(DELTA_LINE_RE);
        if (!match) {
            errors.push(`unrecognized delta line: "${line}"`);
            continue;
        }
        const type = match[1].toLowerCase();
        const label = match[2].trim();
        const detail = match[3].trim();
        if (!label || !detail) {
            errors.push(`delta line requires both a label and detail: "${line}"`);
            continue;
        }
        entries.push(type === 'addition'
            ? { type, label, detail }
            : { type, label, state: detail });
    }
    if (!entries.length && !errors.length) errors.push('delta block contains no mutation or addition lines');
    return { siteRoot, entries, errors };
}

/** Extract the last status-footer location from a narrator message. */
export function extractFooterLocation(text) {
    const source = String(text || '');
    LOCATION_RE.lastIndex = 0;
    let location = '';
    let match;
    while ((match = LOCATION_RE.exec(source)) !== null) {
        location = String(match[1] || '').trim();
    }
    return location;
}

/** Top-level footer segment, used as the stable site binding unit. */
export function getSiteRootFromLocation(location) {
    return String(location || '')
        .split(/\s*(?:::|,|\/|>|›|»|→)\s*/)
        .map(part => part.trim())
        .find(Boolean) || '';
}

/** Light normalization for footer drift without introducing opaque IDs. */
export function normalizeDungeonLabel(label) {
    return String(label || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[’'`]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(LEADING_ARTICLE_RE, '');
}

function editDistance(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const above = row[j];
            row[j] = Math.min(
                row[j] + 1,
                row[j - 1] + 1,
                diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
            diagonal = above;
        }
    }
    return row[b.length];
}

/** Conservative fuzzy equality for punctuation/article drift and small typos. */
export function dungeonLabelsMatch(left, right) {
    const a = normalizeDungeonLabel(left);
    const b = normalizeDungeonLabel(right);
    if (!a || !b) return false;
    if (a === b) return true;
    if (Math.min(a.length, b.length) >= 8 && (a.includes(b) || b.includes(a))) return true;
    const allowance = Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.12));
    return editDistance(a, b) <= allowance;
}

/** Upgrade a prose/older JSON [MAP] section to the v3 geometry/assets model. */
export function migrateDungeonMapSectionToStructured(entry) {
    const body = extractDungeonMapSection(entry?.content);
    if (!body) return false;
    const parsed = parseDungeonMapDocument(body, String(entry?.comment || '').trim());
    if (!parsed.migrated) return false;
    entry.content = replaceDungeonMapSection(entry.content, serializeDungeonMapDocument(parsed.document));
    return true;
}

/** Mark mapped areas with real child Location records as visited during migration. */
export function reconcileDungeonMapAreaKnowledge(entry, allEntries) {
    const body = extractDungeonMapSection(entry?.content);
    if (!body) return false;
    const parsed = parseDungeonMapDocument(body, String(entry?.comment || '').trim());
    const rootLabel = String(entry?.comment || parsed.document.site || '').trim();
    const wasMigrated = parsed.migrated;
    const children = Object.values(allEntries || {})
        .filter(candidate => candidate && candidate !== entry)
        .filter(candidate => {
            const label = String(candidate.comment || '').trim();
            const segments = label.split(/\s*::\s*/).filter(Boolean);
            return segments.length > 1 && dungeonLabelsMatch(segments[0], rootLabel);
        });
    let changed = wasMigrated;
    const legacyCoreSentence = `${rootLabel} is a mapped site. Persistent room and area changes are recorded in its child Location entries.`;
    const currentCoreSentence = `${rootLabel} is a mapped site. Its private map stores current objective reality; child Location entries preserve player-observable history.`;
    if (String(entry.content || '').includes(legacyCoreSentence)) {
        entry.content = String(entry.content).replace(legacyCoreSentence, currentCoreSentence);
        changed = true;
    }
    for (const area of parsed.document.areas) {
        const child = children.find(candidate => {
            const leaf = String(candidate.comment || '').split(/\s*::\s*/).filter(Boolean).at(-1);
            const keys = Array.isArray(candidate.key) ? candidate.key : [];
            return dungeonLabelsMatch(leaf, area.name) || keys.some(key => dungeonLabelsMatch(key, area.name));
        });
        if (child && area.knowledge !== 'VISITED') {
            area.knowledge = 'VISITED';
            changed = true;
        }

        // One-time legacy reconciliation: strongly explicit historical outcomes
        // become the initial v3 current state. Never rerun this inference on an
        // already-structured map, because a later validated operation may supersede
        // an older chronicle without rewriting history.
        if (!wasMigrated || !child) continue;
        const visibleContent = stripDungeonMapSection(child.content);
        const history = visibleContent
            .replace(/\[CORE\][\s\S]*?\[\/CORE\]/gi, '')
            .trim();
        for (const asset of parsed.document.assets.filter(candidate => candidate.location === area.id)) {
            const normalizedName = normalizeDungeonLabel(asset.name);
            const distinctiveNoun = normalizedName.split(/\s+/).at(-1) || '';
            const terms = [...new Set([
                normalizedName,
                normalizeDungeonLabel(asset.id),
                distinctiveNoun,
            ].filter(term => term.length >= 4 && !['thing', 'asset', 'other'].includes(term)))];
            const normalizedVisible = normalizeDungeonLabel(visibleContent);
            if (terms.some(term => normalizedVisible.includes(term)) && asset.knowledge !== 'KNOWN') {
                asset.knowledge = 'KNOWN';
                changed = true;
            }
            if (!history) continue;
            const relevantLines = history.split(/\r?\n/).filter(line => {
                const normalized = normalizeDungeonLabel(line);
                return terms.some(term => normalized.includes(term));
            });
            if (!relevantLines.length) continue;
            const latest = relevantLines.at(-1);
            const normalizedLatest = normalizeDungeonLabel(latest);
            const stateRulesByKind = {
                CREATURE: [
                    { re: /\b(?:destroyed|obliterated|slain|killed|dead)\b/, state: 'DESTROYED' },
                    { re: /\b(?:captured|bound|imprisoned)\b/, state: 'CAPTURED' },
                ],
                GROUP: [
                    { re: /\b(?:destroyed|obliterated|slain|killed|dead)\b/, state: 'DESTROYED' },
                    { re: /\b(?:captured|bound|imprisoned)\b/, state: 'CAPTURED' },
                ],
                TRAP: [
                    { re: /\b(?:disarmed)\b/, state: 'DISARMED' },
                    { re: /\b(?:triggered|sprung)\b/, state: 'TRIGGERED' },
                    { re: /\b(?:disabled|destroyed)\b/, state: 'DISABLED' },
                ],
                ALARM: [
                    { re: /\b(?:triggered|sounded|raised)\b/, state: 'TRIGGERED' },
                    { re: /\b(?:disabled|destroyed)\b/, state: 'DISABLED' },
                ],
                BARRIER: [
                    { re: /\b(?:destroyed|smashed|collapsed)\b/, state: 'DESTROYED' },
                    { re: /\b(?:unlocked)\b/, state: 'UNLOCKED' },
                    { re: /\b(?:opened|open)\b/, state: 'OPEN' },
                    { re: /\b(?:blocked)\b/, state: 'BLOCKED' },
                    { re: /\b(?:locked|sealed|chained)\b/, state: 'LOCKED' },
                ],
                LOOT: [
                    { re: /\b(?:taken|recovered|removed|looted)\b/, state: 'TAKEN' },
                    { re: /\b(?:destroyed)\b/, state: 'DESTROYED' },
                ],
                OBJECT: [
                    { re: /\b(?:taken|recovered|removed)\b/, state: 'TAKEN' },
                    { re: /\b(?:destroyed|broken)\b/, state: 'DESTROYED' },
                ],
                HAZARD: [
                    { re: /\b(?:cleared|neutralized)\b/, state: 'CLEARED' },
                    { re: /\b(?:disabled|destroyed)\b/, state: 'DISABLED' },
                ],
                EFFECT: [
                    { re: /\b(?:cleared|dispelled|ended)\b/, state: 'CLEARED' },
                    { re: /\b(?:disabled|destroyed)\b/, state: 'DISABLED' },
                ],
            };
            const stateRules = stateRulesByKind[asset.kind] || [
                { re: /\b(?:destroyed)\b/, state: 'DESTROYED' },
                { re: /\b(?:removed)\b/, state: 'REMOVED' },
            ];
            const inferred = stateRules.find(rule => rule.re.test(normalizedLatest));
            if (!inferred) continue;
            asset.state = inferred.state;
            asset.knowledge = 'KNOWN';
            asset.detail = latest.replace(/^\s*\[[^\]]+\]\s*/, '').trim() || asset.detail;
            changed = true;
        }
    }
    if (changed) entry.content = replaceDungeonMapSection(entry.content, serializeDungeonMapDocument(parsed.document));
    return changed;
}

function mapError(code, path, received, hint, extra = {}) {
    return { code, path, received, hint, ...extra };
}

function unknownKeys(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    return Object.keys(value).filter(key => !allowed.includes(key));
}

function resolveMapArea(document, ref) {
    const received = String(ref || '').trim();
    if (!received) return { area: null, candidates: [] };
    const exactId = document.areas.find(area => area.id === received);
    if (exactId) return { area: exactId, candidates: [exactId] };
    const normalized = normalizeDungeonLabel(received);
    const exactNames = document.areas.filter(area => normalizeDungeonLabel(area.name) === normalized);
    if (exactNames.length === 1) return { area: exactNames[0], candidates: exactNames };
    const fuzzy = document.areas.filter(area => dungeonLabelsMatch(area.name, received));
    return { area: fuzzy.length === 1 ? fuzzy[0] : null, candidates: fuzzy.length ? fuzzy : exactNames };
}

function resolveMapAsset(document, ref) {
    const received = String(ref || '').trim();
    if (!received) return { asset: null, candidates: [] };
    const exactId = document.assets.find(asset => asset.id === received);
    if (exactId) return { asset: exactId, candidates: [exactId] };
    const normalized = normalizeDungeonLabel(received);
    const exactNames = document.assets.filter(asset => normalizeDungeonLabel(asset.name) === normalized);
    if (exactNames.length === 1) return { asset: exactNames[0], candidates: exactNames };
    return { asset: null, candidates: exactNames };
}

function validateEnumField(value, allowed, path, errors, required = false) {
    if (value == null || value === '') {
        if (required) errors.push(mapError('MISSING_FIELD', path, value, `Supply one of: ${allowed.join(', ')}.`, { allowed }));
        return null;
    }
    const normalized = String(value).trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (!allowed.includes(normalized)) {
        errors.push(mapError('INVALID_ENUM', path, value, `Use one of: ${allowed.join(', ')}.`, { allowed }));
        return null;
    }
    return normalized;
}

function requireMapString(value, path, errors) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) errors.push(mapError('MISSING_FIELD', path, value, 'Supply a non-empty string.'));
    return normalized;
}

function validateOperationShape(operation, index, errors) {
    const path = `map.operations[${index}]`;
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
        errors.push(mapError('INVALID_OPERATION', path, operation, 'Each operation must be a JSON object.'));
        return null;
    }
    const op = validateEnumField(operation.op, MAP_OPERATIONS, `${path}.op`, errors, true);
    const common = ['op', 'evidence'];
    const byOperation = {
        ADD_AREA: ['name', 'knowledge', 'geometry', 'connections'],
        SET_AREA: ['area_id', 'knowledge', 'geometry_append', 'geometry_replace'],
        ADD_ASSET: ['name', 'kind', 'location', 'state', 'knowledge', 'detail', 'origin', 'behavior', 'route', 'faction', 'owner', 'duration', 'distinct_from'],
        MOVE_ASSET: ['asset_id', 'to', 'from', 'state', 'knowledge', 'detail'],
        SET_ASSET: ['asset_id', 'name', 'state', 'knowledge', 'detail', 'behavior', 'route', 'faction', 'owner', 'duration'],
        REMOVE_ASSET: ['asset_id', 'knowledge', 'detail'],
        SET_CONNECTION: ['from', 'to', 'state', 'detail', 'bidirectional'],
    };
    if (op) {
        const extras = unknownKeys(operation, [...common, ...(byOperation[op] || [])]);
        for (const key of extras) {
            errors.push(mapError('UNKNOWN_FIELD', `${path}.${key}`, operation[key], `Remove unsupported field "${key}" from ${op}.`, { allowed: [...common, ...(byOperation[op] || [])] }));
        }
    }
    const evidence = validateEnumField(operation.evidence, MAP_EVIDENCE, `${path}.evidence`, errors, true);
    return op && evidence ? { op, evidence, path } : null;
}

function addOrUpdateConnection(area, to, state, detail) {
    const existing = area.connections.find(connection => connection.to === to);
    if (existing) {
        existing.state = state;
        existing.detail = detail;
    } else {
        area.connections.push({ to, state, detail });
    }
}

/**
 * Validate and apply a Lorebook Agent map transaction to a cloned document.
 * No caller-owned object is changed when validation fails.
 */
export function applyDungeonMapTransaction(document, transaction) {
    const current = normalizeDungeonMapDocument(clone(document), document?.site);
    const errors = [];
    if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) {
        return { ok: false, retryable: true, errors: [mapError('INVALID_MAP_TRANSACTION', 'map', transaction, 'Supply a JSON object with operation_id, operations, and optional chronicles.')] };
    }
    for (const key of unknownKeys(transaction, ['operation_id', 'operations', 'chronicles'])) {
        errors.push(mapError('UNKNOWN_FIELD', `map.${key}`, transaction[key], `Remove unsupported map transaction field "${key}".`, { allowed: ['operation_id', 'operations', 'chronicles'] }));
    }
    const operationId = requireMapString(transaction.operation_id, 'map.operation_id', errors);
    if (operationId && !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(operationId)) {
        errors.push(mapError('INVALID_OPERATION_ID', 'map.operation_id', operationId, 'Use 3-120 characters: letters, numbers, dot, underscore, colon, or hyphen.'));
    }
    if (!Array.isArray(transaction.operations) || !transaction.operations.length) {
        errors.push(mapError('MISSING_OPERATIONS', 'map.operations', transaction.operations, 'Supply at least one map operation.'));
    } else if (transaction.operations.length > 24) {
        errors.push(mapError('TOO_MANY_OPERATIONS', 'map.operations', transaction.operations.length, 'Split the change into at most 24 operations.'));
    }
    if (transaction.chronicles != null && !Array.isArray(transaction.chronicles)) {
        errors.push(mapError('INVALID_CHRONICLES', 'map.chronicles', transaction.chronicles, 'Chronicles must be an array. Omit it for unobserved off-screen changes.'));
    }
    if (errors.length) return { ok: false, retryable: true, errors };

    const working = clone(current);
    const createdAssets = [];
    const createdAreas = [];
    const areaIds = new Set(working.areas.map(area => area.id));
    const assetIds = new Set(working.assets.map(asset => asset.id));

    for (let index = 0; index < transaction.operations.length; index++) {
        const operation = transaction.operations[index];
        const shape = validateOperationShape(operation, index, errors);
        if (!shape) continue;
        const { op, evidence, path } = shape;

        if (evidence === 'AUTONOMOUS' && !['MOVE_ASSET', 'SET_ASSET', 'REMOVE_ASSET'].includes(op)) {
            errors.push(mapError('AUTONOMY_NOT_ALLOWED', `${path}.evidence`, evidence, `${op} requires narrator-established CONFIRMED or IMPLIED evidence.`));
            continue;
        }

        if (op === 'ADD_AREA') {
            const name = requireMapString(operation.name, `${path}.name`, errors);
            const knowledge = validateEnumField(operation.knowledge, AREA_KNOWLEDGE, `${path}.knowledge`, errors, true);
            if (!name || !knowledge) continue;
            const duplicates = working.areas.filter(area => dungeonLabelsMatch(area.name, name));
            if (duplicates.length) {
                errors.push(mapError('DUPLICATE_AREA', `${path}.name`, name, 'Use SET_AREA for the existing area.', { candidates: duplicates.map(area => ({ id: area.id, name: area.name })) }));
                continue;
            }
            const area = {
                id: allocateMapId(areaIds, name, 'area'),
                name,
                knowledge,
                geometry: cleanStringList(operation.geometry),
                connections: [],
            };
            working.areas.push(area);
            createdAreas.push({ id: area.id, name: area.name });
            for (const [connectionIndex, connectionRef] of cleanStringList(operation.connections).entries()) {
                const resolved = resolveMapArea(working, connectionRef);
                if (!resolved.area || resolved.area.id === area.id) {
                    errors.push(mapError('AREA_NOT_FOUND', `${path}.connections[${connectionIndex}]`, connectionRef, 'Use an exact existing area ID or label.', { allowed: working.areas.filter(item => item.id !== area.id).map(item => item.id) }));
                    continue;
                }
                addOrUpdateConnection(area, resolved.area.id, 'OPEN', '');
                addOrUpdateConnection(resolved.area, area.id, 'OPEN', '');
            }
            continue;
        }

        if (op === 'SET_AREA') {
            const resolved = resolveMapArea(working, operation.area_id);
            if (!resolved.area) {
                errors.push(mapError('AREA_NOT_FOUND', `${path}.area_id`, operation.area_id, 'Use an exact area ID or unambiguous label.', { allowed: working.areas.map(area => area.id), candidates: resolved.candidates.map(area => area.id) }));
                continue;
            }
            const hasMutation = operation.knowledge != null || operation.geometry_append != null || operation.geometry_replace != null;
            if (!hasMutation) {
                errors.push(mapError('EMPTY_OPERATION', path, operation, 'SET_AREA must change knowledge or geometry.'));
                continue;
            }
            if (operation.knowledge != null) {
                const knowledge = validateEnumField(operation.knowledge, AREA_KNOWLEDGE, `${path}.knowledge`, errors);
                if (knowledge) resolved.area.knowledge = knowledge;
            }
            if (operation.geometry_replace != null) {
                if (!Array.isArray(operation.geometry_replace)) errors.push(mapError('INVALID_FIELD', `${path}.geometry_replace`, operation.geometry_replace, 'Use an array of complete current geometry facts.'));
                else resolved.area.geometry = cleanStringList(operation.geometry_replace);
            }
            if (operation.geometry_append != null) {
                if (!Array.isArray(operation.geometry_append)) errors.push(mapError('INVALID_FIELD', `${path}.geometry_append`, operation.geometry_append, 'Use an array of new durable geometry facts.'));
                else {
                    for (const fact of cleanStringList(operation.geometry_append)) {
                        if (!resolved.area.geometry.some(existing => normalizeChunkForComparison(existing) === normalizeChunkForComparison(fact))) resolved.area.geometry.push(fact);
                    }
                }
            }
            continue;
        }

        if (op === 'ADD_ASSET') {
            const name = requireMapString(operation.name, `${path}.name`, errors);
            const kind = validateEnumField(operation.kind, ASSET_KINDS, `${path}.kind`, errors, true);
            const state = validateEnumField(operation.state, ASSET_STATES, `${path}.state`, errors, true);
            const knowledge = validateEnumField(operation.knowledge, ASSET_KNOWLEDGE, `${path}.knowledge`, errors, true);
            const locationResult = resolveMapArea(working, operation.location);
            if (!locationResult.area) errors.push(mapError('AREA_NOT_FOUND', `${path}.location`, operation.location, 'Use an exact area ID or unambiguous label.', { allowed: working.areas.map(area => area.id), candidates: locationResult.candidates.map(area => area.id) }));
            if (!name || !kind || !state || !knowledge || !locationResult.area) continue;
            const duplicateCandidates = working.assets.filter(asset => normalizeDungeonLabel(asset.name) === normalizeDungeonLabel(name) && asset.state !== 'REMOVED');
            const distinctFrom = new Set(cleanStringList(operation.distinct_from));
            if (duplicateCandidates.length && duplicateCandidates.some(candidate => !distinctFrom.has(candidate.id))) {
                errors.push(mapError('POSSIBLE_DUPLICATE_ASSET', `${path}.name`, name, 'Use MOVE_ASSET/SET_ASSET if this is an existing entity, or list every candidate ID in distinct_from if it is genuinely new.', { candidates: duplicateCandidates.map(asset => ({ id: asset.id, location: asset.location, state: asset.state })) }));
                continue;
            }
            const asset = {
                id: allocateMapId(assetIds, name, 'asset'),
                kind,
                name,
                location: locationResult.area.id,
                state,
                knowledge,
                detail: String(operation.detail || '').trim(),
                origin: String(operation.origin || (evidence === 'IMPLIED' ? 'NARRATOR_IMPLIED' : 'NARRATOR_ESTABLISHED')).trim(),
            };
            const behavior = String(operation.behavior || '').trim();
            if (behavior) asset.behavior = behavior;
            for (const field of ['faction', 'owner', 'duration']) {
                const value = String(operation[field] || '').trim();
                if (value) asset[field] = value;
            }
            if (operation.route != null) {
                if (!Array.isArray(operation.route)) errors.push(mapError('INVALID_FIELD', `${path}.route`, operation.route, 'Use an array of exact area IDs or labels.'));
                else {
                    const route = [];
                    for (const [routeIndex, ref] of operation.route.entries()) {
                        const routeArea = resolveMapArea(working, ref);
                        if (!routeArea.area) errors.push(mapError('AREA_NOT_FOUND', `${path}.route[${routeIndex}]`, ref, 'Use an exact area ID or unambiguous label.', { allowed: working.areas.map(area => area.id) }));
                        else route.push(routeArea.area.id);
                    }
                    if (route.length) asset.route = [...new Set(route)];
                }
            }
            working.assets.push(asset);
            createdAssets.push({ id: asset.id, name: asset.name });
            continue;
        }

        if (['MOVE_ASSET', 'SET_ASSET', 'REMOVE_ASSET'].includes(op)) {
            const assetResult = resolveMapAsset(working, operation.asset_id);
            if (!assetResult.asset) {
                errors.push(mapError('ASSET_NOT_FOUND', `${path}.asset_id`, operation.asset_id, 'Use an exact asset ID. Call list_map_assets if needed.', { allowed: working.assets.map(asset => asset.id), candidates: assetResult.candidates.map(asset => asset.id) }));
                continue;
            }
            const asset = assetResult.asset;
            if (evidence === 'AUTONOMOUS' && !asset.behavior && !asset.route?.length) {
                errors.push(mapError('AUTONOMY_NOT_ALLOWED', `${path}.evidence`, evidence, 'Autonomous asset changes require an explicit behavior or route on the existing asset.'));
                continue;
            }
            if (op === 'MOVE_ASSET') {
                if (['DEAD', 'DESTROYED', 'REMOVED', 'EXPIRED', 'DISMISSED'].includes(asset.state)) {
                    errors.push(mapError('ASSET_CANNOT_MOVE', `${path}.asset_id`, asset.id, `Asset state is ${asset.state}; change its state only if the narrative explicitly re-establishes mobility.`));
                    continue;
                }
                const destination = resolveMapArea(working, operation.to);
                if (!destination.area) {
                    errors.push(mapError('AREA_NOT_FOUND', `${path}.to`, operation.to, 'Use an exact area ID or unambiguous label.', { allowed: working.areas.map(area => area.id), candidates: destination.candidates.map(area => area.id) }));
                    continue;
                }
                if (operation.from != null) {
                    const from = resolveMapArea(working, operation.from);
                    if (!from.area || from.area.id !== asset.location) {
                        const actual = working.areas.find(area => area.id === asset.location);
                        errors.push(mapError('FROM_LOCATION_MISMATCH', `${path}.from`, operation.from, `Retry with the asset's actual current location: ${asset.location}.`, { actual: actual ? { id: actual.id, name: actual.name } : asset.location }));
                        continue;
                    }
                }
                const sourceArea = working.areas.find(area => area.id === asset.location);
                const connection = sourceArea?.connections?.find(item => item.to === destination.area.id);
                if (connection && ['LOCKED', 'BLOCKED', 'DESTROYED'].includes(connection.state)) {
                    errors.push(mapError('CONNECTION_NOT_TRAVERSABLE', `${path}.to`, operation.to, `The mapped connection is ${connection.state}. Apply SET_CONNECTION earlier in the same transaction if the narrative changed it.`));
                    continue;
                }
                if (evidence === 'AUTONOMOUS' && (!connection || ['LOCKED', 'BLOCKED', 'DESTROYED'].includes(connection.state))) {
                    errors.push(mapError('DESTINATION_NOT_CONNECTED', `${path}.to`, operation.to, 'Autonomous movement must follow an open mapped connection.', { allowed: (sourceArea?.connections || []).filter(item => ['OPEN', 'UNKNOWN'].includes(item.state)).map(item => item.to) }));
                    continue;
                }
                asset.location = destination.area.id;
                if (operation.state != null) {
                    const state = validateEnumField(operation.state, ASSET_STATES, `${path}.state`, errors);
                    if (state) asset.state = state;
                }
                if (operation.knowledge != null) {
                    const knowledge = validateEnumField(operation.knowledge, ASSET_KNOWLEDGE, `${path}.knowledge`, errors);
                    if (knowledge) asset.knowledge = knowledge;
                }
                if (operation.detail != null) asset.detail = String(operation.detail || '').trim();
                continue;
            }
            if (op === 'REMOVE_ASSET') {
                asset.last_location = asset.location;
                asset.location = null;
                asset.state = 'REMOVED';
                if (operation.knowledge != null) {
                    const knowledge = validateEnumField(operation.knowledge, ASSET_KNOWLEDGE, `${path}.knowledge`, errors);
                    if (knowledge) asset.knowledge = knowledge;
                }
                if (operation.detail != null) asset.detail = String(operation.detail || '').trim();
                continue;
            }

            const mutableFields = ['name', 'state', 'knowledge', 'detail', 'behavior', 'route', 'faction', 'owner', 'duration'];
            if (!mutableFields.some(field => operation[field] != null)) {
                errors.push(mapError('EMPTY_OPERATION', path, operation, 'SET_ASSET must change at least one mutable field.'));
                continue;
            }
            if (operation.name != null) asset.name = requireMapString(operation.name, `${path}.name`, errors) || asset.name;
            if (operation.state != null) {
                const state = validateEnumField(operation.state, ASSET_STATES, `${path}.state`, errors);
                if (state) asset.state = state;
            }
            if (operation.knowledge != null) {
                const knowledge = validateEnumField(operation.knowledge, ASSET_KNOWLEDGE, `${path}.knowledge`, errors);
                if (knowledge) asset.knowledge = knowledge;
            }
            if (operation.detail != null) asset.detail = String(operation.detail || '').trim();
            if (operation.behavior != null) asset.behavior = String(operation.behavior || '').trim();
            for (const field of ['faction', 'owner', 'duration']) {
                if (operation[field] != null) asset[field] = String(operation[field] || '').trim();
            }
            if (operation.route != null) {
                if (!Array.isArray(operation.route)) errors.push(mapError('INVALID_FIELD', `${path}.route`, operation.route, 'Use an array of exact area IDs or labels.'));
                else {
                    const route = [];
                    for (const [routeIndex, ref] of operation.route.entries()) {
                        const routeArea = resolveMapArea(working, ref);
                        if (!routeArea.area) errors.push(mapError('AREA_NOT_FOUND', `${path}.route[${routeIndex}]`, ref, 'Use an exact area ID or unambiguous label.', { allowed: working.areas.map(area => area.id) }));
                        else route.push(routeArea.area.id);
                    }
                    asset.route = [...new Set(route)];
                }
            }
            continue;
        }

        if (op === 'SET_CONNECTION') {
            const from = resolveMapArea(working, operation.from);
            const to = resolveMapArea(working, operation.to);
            if (!from.area) errors.push(mapError('AREA_NOT_FOUND', `${path}.from`, operation.from, 'Use an exact area ID or unambiguous label.', { allowed: working.areas.map(area => area.id) }));
            if (!to.area) errors.push(mapError('AREA_NOT_FOUND', `${path}.to`, operation.to, 'Use an exact area ID or unambiguous label.', { allowed: working.areas.map(area => area.id) }));
            const state = validateEnumField(operation.state, CONNECTION_STATES, `${path}.state`, errors, true);
            if (!from.area || !to.area || !state) continue;
            if (from.area.id === to.area.id) {
                errors.push(mapError('INVALID_CONNECTION', path, operation, 'A connection must join two different areas.'));
                continue;
            }
            const detail = String(operation.detail || '').trim();
            addOrUpdateConnection(from.area, to.area.id, state, detail);
            if (operation.bidirectional !== false) addOrUpdateConnection(to.area, from.area.id, state, detail);
        }
    }

    const resolvedChronicles = [];
    for (const [index, chronicle] of (transaction.chronicles || []).entries()) {
        const path = `map.chronicles[${index}]`;
        if (!chronicle || typeof chronicle !== 'object' || Array.isArray(chronicle)) {
            errors.push(mapError('INVALID_CHRONICLE', path, chronicle, 'Each chronicle must be a JSON object.'));
            continue;
        }
        for (const key of unknownKeys(chronicle, ['area_id', 'text'])) {
            errors.push(mapError('UNKNOWN_FIELD', `${path}.${key}`, chronicle[key], `Remove unsupported chronicle field "${key}".`, { allowed: ['area_id', 'text'] }));
        }
        const area = resolveMapArea(working, chronicle.area_id);
        const text = requireMapString(chronicle.text, `${path}.text`, errors);
        if (!area.area) {
            errors.push(mapError('AREA_NOT_FOUND', `${path}.area_id`, chronicle.area_id, 'Use the exact area ID whose player-observable history changed.', { allowed: working.areas.map(item => item.id), candidates: area.candidates.map(item => item.id) }));
        } else if (text) {
            resolvedChronicles.push({ areaId: area.area.id, areaName: area.area.name, text });
        }
    }

    if (errors.length) return { ok: false, retryable: true, errors };
    return {
        ok: true,
        retryable: false,
        operationId,
        document: normalizeDungeonMapDocument(working, working.site),
        chronicles: resolvedChronicles,
        createdAssets,
        createdAreas,
    };
}

/** Strict JSON Schema fragment added to commit only while a mapped site is active. */
export function buildDungeonMapCommitSchema() {
    const evidence = { type: 'string', enum: MAP_EVIDENCE };
    const operationVariants = [
        {
            type: 'object', additionalProperties: false,
            properties: { op: { type: 'string', enum: ['ADD_AREA'] }, evidence, name: { type: 'string' }, knowledge: { type: 'string', enum: AREA_KNOWLEDGE }, geometry: { type: 'array', items: { type: 'string' } }, connections: { type: 'array', items: { type: 'string' } } },
            required: ['op', 'evidence', 'name', 'knowledge'],
        },
        {
            type: 'object', additionalProperties: false,
            properties: { op: { type: 'string', enum: ['SET_AREA'] }, evidence, area_id: { type: 'string' }, knowledge: { type: 'string', enum: AREA_KNOWLEDGE }, geometry_append: { type: 'array', items: { type: 'string' } }, geometry_replace: { type: 'array', items: { type: 'string' } } },
            required: ['op', 'evidence', 'area_id'],
        },
        {
            type: 'object', additionalProperties: false,
            properties: { op: { type: 'string', enum: ['ADD_ASSET'] }, evidence, name: { type: 'string' }, kind: { type: 'string', enum: ASSET_KINDS }, location: { type: 'string' }, state: { type: 'string', enum: ASSET_STATES }, knowledge: { type: 'string', enum: ASSET_KNOWLEDGE }, detail: { type: 'string' }, origin: { type: 'string' }, behavior: { type: 'string' }, route: { type: 'array', items: { type: 'string' } }, faction: { type: 'string' }, owner: { type: 'string' }, duration: { type: 'string' }, distinct_from: { type: 'array', items: { type: 'string' } } },
            required: ['op', 'evidence', 'name', 'kind', 'location', 'state', 'knowledge'],
        },
        {
            type: 'object', additionalProperties: false,
            properties: { op: { type: 'string', enum: ['MOVE_ASSET'] }, evidence, asset_id: { type: 'string' }, to: { type: 'string' }, from: { type: 'string' }, state: { type: 'string', enum: ASSET_STATES }, knowledge: { type: 'string', enum: ASSET_KNOWLEDGE }, detail: { type: 'string' } },
            required: ['op', 'evidence', 'asset_id', 'to'],
        },
        {
            type: 'object', additionalProperties: false,
            properties: { op: { type: 'string', enum: ['SET_ASSET'] }, evidence, asset_id: { type: 'string' }, name: { type: 'string' }, state: { type: 'string', enum: ASSET_STATES }, knowledge: { type: 'string', enum: ASSET_KNOWLEDGE }, detail: { type: 'string' }, behavior: { type: 'string' }, route: { type: 'array', items: { type: 'string' } }, faction: { type: 'string' }, owner: { type: 'string' }, duration: { type: 'string' } },
            required: ['op', 'evidence', 'asset_id'],
        },
        {
            type: 'object', additionalProperties: false,
            properties: { op: { type: 'string', enum: ['REMOVE_ASSET'] }, evidence, asset_id: { type: 'string' }, knowledge: { type: 'string', enum: ASSET_KNOWLEDGE }, detail: { type: 'string' } },
            required: ['op', 'evidence', 'asset_id'],
        },
        {
            type: 'object', additionalProperties: false,
            properties: { op: { type: 'string', enum: ['SET_CONNECTION'] }, evidence, from: { type: 'string' }, to: { type: 'string' }, state: { type: 'string', enum: CONNECTION_STATES }, detail: { type: 'string' }, bidirectional: { type: 'boolean' } },
            required: ['op', 'evidence', 'from', 'to', 'state'],
        },
    ];
    return {
        type: 'object',
        additionalProperties: false,
        description: 'Atomic current-map mutation for the active mapped site. Include only when the narrative established a durable map change. The map and player-observable child Location chronicles save together.',
        properties: {
            operation_id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$', description: 'Stable idempotency key for this narrative change, e.g. day1-0833-crypt-ghoul-destroyed. Reuse it on a correction retry.' },
            operations: { type: 'array', minItems: 1, maxItems: 24, items: { oneOf: operationVariants } },
            chronicles: {
                type: 'array',
                description: 'Player-observable history only. Omit for hidden/off-screen changes.',
                items: {
                    type: 'object', additionalProperties: false,
                    properties: { area_id: { type: 'string' }, text: { type: 'string' } },
                    required: ['area_id', 'text'],
                },
            },
        },
        required: ['operation_id', 'operations'],
    };
}

export function inspectDungeonMap(document, areaRef = '') {
    const map = normalizeDungeonMapDocument(document, document?.site);
    if (!areaRef) return map;
    const resolved = resolveMapArea(map, areaRef);
    if (!resolved.area) return null;
    return {
        site: map.site,
        area: resolved.area,
        assets: map.assets.filter(asset => asset.location === resolved.area.id),
    };
}

export function listDungeonMapAssets(document, filters = {}) {
    const map = normalizeDungeonMapDocument(document, document?.site);
    let assets = map.assets;
    if (filters.area) {
        const resolved = resolveMapArea(map, filters.area);
        if (!resolved.area) return null;
        assets = assets.filter(asset => asset.location === resolved.area.id);
    }
    if (filters.state) assets = assets.filter(asset => asset.state === String(filters.state).toUpperCase());
    if (filters.knowledge) assets = assets.filter(asset => asset.knowledge === String(filters.knowledge).toUpperCase());
    return assets;
}

function normalizeChunkForComparison(chunk) {
    return String(chunk || '').replace(/\s+/g, ' ').trim();
}

function createEmptyState() {
    return { version: 2, sites: {} };
}

function normalizeState(state) {
    const next = state && typeof state === 'object' ? clone(state) : createEmptyState();
    next.version = 2;
    if (!next.sites || typeof next.sites !== 'object' || Array.isArray(next.sites)) next.sites = {};
    for (const [key, rawSite] of Object.entries(next.sites)) {
        if (!rawSite || typeof rawSite !== 'object') {
            delete next.sites[key];
            continue;
        }
        rawSite.siteRoot = String(rawSite.siteRoot || key).trim();
        rawSite.mapChunks = Array.isArray(rawSite.mapChunks)
            ? rawSite.mapChunks.map(String).map(value => value.trim()).filter(Boolean)
            : [];
        rawSite.statusLog = Array.isArray(rawSite.statusLog) ? rawSite.statusLog : [];
    }
    return next;
}

function findSiteRecord(state, siteRoot) {
    const exactKey = normalizeDungeonLabel(siteRoot);
    if (state?.sites?.[exactKey]) return { key: exactKey, site: state.sites[exactKey] };
    for (const [key, site] of Object.entries(state?.sites || {})) {
        if (dungeonLabelsMatch(site.siteRoot || key, siteRoot)) return { key, site };
    }
    return null;
}

function siteRootFromMapBlock(block) {
    const proseMarker = String(block || '').match(SITE_MARKER_RE)?.[1]?.trim();
    if (proseMarker) return proseMarker;
    return String(tryParseStructuredMap(block)?.site || '').trim();
}

function statusEntryContentSignature(entry) {
    return [
        String(entry?.type || 'mutation').toLowerCase(),
        normalizeDungeonLabel(entry?.label),
        normalizeChunkForComparison(entry?.state || entry?.detail).toLowerCase(),
    ].join('|');
}

function statusEntrySourceSignature(entry) {
    if (entry?.at?.sourceKey) return `source:${entry.at.sourceKey}`;
    if (Number.isInteger(entry?.at?.messageIndex)) {
        return `position:${entry.at.messageIndex}:${entry.at.swipeId ?? 0}:${statusEntryContentSignature(entry)}`;
    }
    return `legacy:${statusEntryContentSignature(entry)}`;
}

function buildDeltaSourceKey(message, messageIndex, blockIndex, entryIndex) {
    const messageKey = message?.send_date != null
        ? `sent:${String(message.send_date)}`
        : `index:${messageIndex}`;
    return `${messageKey}:swipe:${message?.swipe_id ?? 0}:block:${blockIndex}:entry:${entryIndex}`;
}

function isAssistantMessage(message) {
    const role = String(message?.role || message?.Role || '').toLowerCase().trim();
    if (message?.is_user || message?.is_system || role === 'user' || role === 'system') return false;
    if (['assistant', 'ai', 'model'].includes(role)) return true;
    return message?.is_user === false && !message?.is_system;
}

/** Collect valid initial-map candidates from selected narrator messages. */
export function collectDungeonMapCandidates(chat) {
    const maps = [];
    const errors = [];
    for (let messageIndex = 0; messageIndex < (Array.isArray(chat) ? chat.length : 0); messageIndex++) {
        const message = chat[messageIndex];
        if (!isAssistantMessage(message)) continue;
        const text = getDungeonMessageText(message);
        const footerSnapshot = extractFooterLocation(text);
        const footerRoot = getSiteRootFromLocation(footerSnapshot);
        for (const content of extractHiddenDungeonMapBlocks(text)) {
            const markedRoot = siteRootFromMapBlock(content);
            if (footerRoot && markedRoot && !dungeonLabelsMatch(footerRoot, markedRoot)) {
                errors.push(`message ${messageIndex} map marker "${markedRoot}" conflicts with footer site "${footerRoot}"`);
                continue;
            }
            const siteRoot = footerRoot || markedRoot;
            if (!siteRoot) {
                errors.push(`message ${messageIndex} contains a hidden map but no footer location or Dungeon Site marker`);
                continue;
            }
            maps.push({
                siteRoot,
                content,
                capturedAt: {
                    messageIndex,
                    swipeId: message?.swipe_id ?? 0,
                    footerSnapshot,
                    sentAt: message?.send_date ?? null,
                },
            });
        }
    }
    return { maps, errors };
}

/** Build deterministic active-site records from Location lorebook entries. */
export function buildDungeonSitesFromLocationEntries(entries, bookName = '') {
    const rows = Object.entries(entries || {});
    const sites = {};
    for (const [uid, entry] of rows) {
        const attachment = getDungeonMapAttachment(entry);
        if (!attachment) continue;
        const rootLabel = String(entry.comment || attachment.siteRoot).trim();
        const locationEntries = rows
            .filter(([, candidate]) => {
                const label = String(candidate?.comment || '').trim();
                if (!label) return false;
                const first = label.split(/\s*::\s*/)[0];
                return dungeonLabelsMatch(first, rootLabel);
            })
            .map(([childUid, candidate]) => ({
                id: bookName ? `${bookName}::${childUid}` : String(childUid),
                label: String(candidate.comment || childUid),
                content: stripDungeonMapSection(candidate.content),
            }));
        sites[normalizeDungeonLabel(rootLabel)] = {
            siteRoot: attachment.siteRoot || rootLabel,
            entryId: bookName ? `${bookName}::${uid}` : String(uid),
            mapChunks: [attachment.content],
            locationEntries,
            statusLog: [],
        };
    }
    return sites;
}

/**
 * Capture selected narrator-message hidden blocks and merge new chunks by site.
 * Existing map chunks are never rewritten.
 */
export function syncDungeonRealityState(existingState, chat) {
    const state = normalizeState(existingState);
    const errors = [];
    let changed = false;
    let capturedChunks = 0;
    let capturedDeltas = 0;

    for (let messageIndex = 0; messageIndex < (Array.isArray(chat) ? chat.length : 0); messageIndex++) {
        const message = chat[messageIndex];
        if (!isAssistantMessage(message)) continue;
        const text = getDungeonMessageText(message);
        const mapBlocks = extractHiddenDungeonMapBlocks(text);
        const deltaBlocks = extractHiddenDungeonDeltaBlocks(text);
        if (!mapBlocks.length && !deltaBlocks.length) continue;

        const footerSnapshot = extractFooterLocation(text);
        const footerRoot = getSiteRootFromLocation(footerSnapshot);
        for (const block of mapBlocks) {
            const markedRoot = siteRootFromMapBlock(block);
            if (footerRoot && markedRoot && !dungeonLabelsMatch(footerRoot, markedRoot)) {
                errors.push(`message ${messageIndex} map marker "${markedRoot}" conflicts with footer site "${footerRoot}"`);
                continue;
            }
            const siteRoot = footerRoot || markedRoot;
            if (!siteRoot) {
                errors.push(`message ${messageIndex} contains a hidden map but no footer location or Dungeon Site marker`);
                continue;
            }

            let record = findSiteRecord(state, siteRoot);
            if (!record) {
                const key = normalizeDungeonLabel(siteRoot);
                state.sites[key] = {
                    siteRoot,
                    capturedAt: {
                        messageIndex,
                        swipeId: message?.swipe_id ?? 0,
                        footerSnapshot,
                        sentAt: message?.send_date ?? null,
                    },
                    mapChunks: [],
                    statusLog: [],
                };
                record = { key, site: state.sites[key] };
                changed = true;
            }

            const comparison = normalizeChunkForComparison(block);
            const duplicate = record.site.mapChunks
                .some(existing => normalizeChunkForComparison(existing) === comparison);
            if (!duplicate) {
                record.site.mapChunks.push(block);
                capturedChunks++;
                changed = true;
            }
        }

        for (const [blockIndex, block] of deltaBlocks.entries()) {
            const parsed = parseDungeonDeltaBlock(block);
            for (const error of parsed.errors) {
                errors.push(`message ${messageIndex} has an invalid dungeon delta: ${error}`);
            }
            if (!parsed.entries.length) continue;

            if (footerRoot && parsed.siteRoot && !dungeonLabelsMatch(footerRoot, parsed.siteRoot)) {
                errors.push(`message ${messageIndex} delta marker "${parsed.siteRoot}" conflicts with footer site "${footerRoot}"`);
                continue;
            }

            const siteRoot = footerRoot || parsed.siteRoot;
            if (!siteRoot) {
                errors.push(`message ${messageIndex} contains a dungeon delta but no footer location or Dungeon Site marker`);
                continue;
            }
            const record = findSiteRecord(state, siteRoot);
            if (!record?.site?.mapChunks?.length) {
                errors.push(`message ${messageIndex} contains a dungeon delta for "${siteRoot}" but no captured immutable map exists`);
                continue;
            }

            const existingSignatures = new Set(record.site.statusLog.map(statusEntrySourceSignature));
            for (const [entryIndex, entry] of parsed.entries.entries()) {
                const sourceKey = buildDeltaSourceKey(message, messageIndex, blockIndex, entryIndex);
                const signature = `source:${sourceKey}`;
                if (existingSignatures.has(signature)) continue;
                record.site.statusLog.push({
                    ...entry,
                    at: {
                        messageIndex,
                        swipeId: message?.swipe_id ?? 0,
                        footerSnapshot,
                        sentAt: message?.send_date ?? null,
                        sourceKey,
                    },
                });
                existingSignatures.add(signature);
                capturedDeltas++;
                changed = true;
            }
        }
    }

    return {
        state: existingState || changed ? state : null,
        changed,
        capturedChunks,
        capturedDeltas,
        errors,
    };
}

/** Find the most recent narrator footer location in the transcript. */
export function findLatestDungeonLocation(chat) {
    if (!Array.isArray(chat)) return '';
    for (let index = chat.length - 1; index >= 0; index--) {
        if (!isAssistantMessage(chat[index])) continue;
        const location = extractFooterLocation(getDungeonMessageText(chat[index]));
        if (location) return location;
    }
    return '';
}

/** Resolve the stored site active under the current footer root. */
export function resolveActiveDungeonSite(state, currentLocation) {
    const root = getSiteRootFromLocation(currentLocation);
    if (!root || !state?.sites) return null;
    return findSiteRecord(state, root)?.site || null;
}

/** Remove only map/delta blocks whose durable copy is already in the site store. */
export function stripCapturedDungeonMapBlocks(text, state) {
    const storedMaps = new Set();
    for (const site of Object.values(state?.sites || {})) {
        for (const chunk of site?.mapChunks || []) storedMaps.add(normalizeChunkForComparison(chunk));
    }
    const source = String(text || '');
    if (!storedMaps.size) return source;
    const footerRoot = getSiteRootFromLocation(extractFooterLocation(source));
    DIV_RE.lastIndex = 0;
    return source.replace(DIV_RE, (full, attributes, rawBody) => {
        if (!hasHiddenAttribute(attributes)) return full;
        const body = String(rawBody || '').trim();
        if (!hasDungeonDeltaAttribute(attributes)) {
            return storedMaps.has(normalizeChunkForComparison(body)) ? '' : full;
        }

        const parsed = parseDungeonDeltaBlock(body);
        if (parsed.errors.length || !parsed.entries.length) return full;
        if (footerRoot && parsed.siteRoot && !dungeonLabelsMatch(footerRoot, parsed.siteRoot)) return full;
        const record = findSiteRecord(state, footerRoot || parsed.siteRoot);
        if (!record) return full;
        const storedDeltas = new Set((record.site.statusLog || []).map(statusEntryContentSignature));
        return parsed.entries.every(entry => storedDeltas.has(statusEntryContentSignature(entry))) ? '' : full;
    });
}

/** Strip captured map HTML from outgoing prompt messages, never from disk chat. */
export function stripCapturedDungeonMapsFromPrompt(chat, state) {
    if (!Array.isArray(chat)) return;
    for (const message of chat) {
        if (typeof message?.mes === 'string') {
            message.mes = stripCapturedDungeonMapBlocks(message.mes, state);
        }
        if (typeof message?.content === 'string') {
            message.content = stripCapturedDungeonMapBlocks(message.content, state);
        } else if (Array.isArray(message?.content)) {
            for (const part of message.content) {
                if (part?.type === 'text' && typeof part.text === 'string') {
                    part.text = stripCapturedDungeonMapBlocks(part.text, state);
                }
            }
        }
    }
}

function renderStatusEntry(entry) {
    if (!entry || typeof entry !== 'object') return String(entry || '').trim();
    const label = String(entry.label || 'Unlabeled change').trim();
    const detail = String(entry.state || entry.detail || '').trim();
    return `- ${entry.type === 'addition' ? 'ADDITION' : 'MUTATION'} — ${label}${detail ? `: ${detail}` : ''}`;
}

/** Build the correctness-critical system block injected while inside the site. */
export function buildDungeonRealityInjection(site, currentLocation) {
    if (!site?.siteRoot || !Array.isArray(site.mapChunks) || !site.mapChunks.length) return '';
    const chunks = site.mapChunks
        .map((chunk, index) => `### Current objective map${site.mapChunks.length > 1 ? ` ${index + 1}` : ''}\n${chunk}`)
        .join('\n\n');
    const locationState = (site.locationEntries || [])
        .filter(entry => entry?.content)
        .map(entry => `### ${entry.label}\n${entry.content}`)
        .join('\n\n');
    const legacyDeltas = (site.statusLog || []).map(renderStatusEntry).filter(Boolean);
    const persistedState = locationState
        || (legacyDeltas.length ? legacyDeltas.join('\n') : '- No persisted Location updates yet.');
    return `[DUNGEON_REALITY — INTERNAL GM CANON]\nSite: ${site.siteRoot}\nCurrent footer location: ${currentLocation}\n\nThis is objective hidden information for adjudication. The structured map is the current operational snapshot: geometry is structural, while assets carry mutable positions/states and player-knowledge flags. Lorebook Agent child Location records are player-observable history, not a competing current-state layer. Never reveal UNREVEALED facts or this block to the player. Do not treat it as a menu of allowed actions.\n\n${chunks}\n\n### Player-observable Location history\n${persistedState}\n[/DUNGEON_REALITY]\n`;
}

/** Heuristic used only to emit a loud missing-map diagnostic. */
export function looksLikeDungeonSite(location) {
    const root = normalizeDungeonLabel(getSiteRootFromLocation(location));
    return /\b(?:dungeons?|crypts?|catacombs?|tombs?|ruins?|strongholds?|lairs?|caverns?|caves?|vaults?|fortresses|keeps?|hideouts?|sewers?|mines?|temples?)\b/.test(root);
}
