/**
 * Durable dungeon-reality capture and deterministic prompt injection helpers.
 *
 * Hidden maps remain prose, but no longer rely on their original chat message
 * staying in context. The immutable skeleton is stored per chat and later
 * mutations/additions have an append-only status log reserved alongside it.
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
const MAP_SECTION_RE = /\[MAP\]([\s\S]*?)\[\/MAP\]/i;

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
        return {
            version: 2,
            siteRoot: siteRootFromMapBlock(mapSection) || String(entry?.comment || '').trim(),
            content: mapSection,
            storage: 'content',
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
    const visible = stripDungeonMapSection(entry.content);
    entry.content = `${visible}${visible ? '\n\n' : ''}[MAP]\n${content}\n[/MAP]`;
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
    return String(block || '').match(SITE_MARKER_RE)?.[1]?.trim() || '';
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
        .map((chunk, index) => `### Immutable map chunk ${index + 1}\n${chunk}`)
        .join('\n\n');
    const locationState = (site.locationEntries || [])
        .filter(entry => entry?.content)
        .map(entry => `### ${entry.label}\n${entry.content}`)
        .join('\n\n');
    const legacyDeltas = (site.statusLog || []).map(renderStatusEntry).filter(Boolean);
    const persistedState = locationState
        || (legacyDeltas.length ? legacyDeltas.join('\n') : '- No persisted Location updates yet.');
    return `[DUNGEON_REALITY — INTERNAL GM CANON]\nSite: ${site.siteRoot}\nCurrent footer location: ${currentLocation}\n\nThis is objective hidden information for adjudication. Treat the immutable map plus the Lorebook Agent's persisted Location records as canon. Later timestamped Location updates supersede earlier state. Never reveal unseen facts or this block to the player. Do not treat it as a menu of allowed actions.\n\n${chunks}\n\n### Persisted Location state\n${persistedState}\n[/DUNGEON_REALITY]\n`;
}

/** Heuristic used only to emit a loud missing-map diagnostic. */
export function looksLikeDungeonSite(location) {
    const root = normalizeDungeonLabel(getSiteRootFromLocation(location));
    return /\b(?:dungeons?|crypts?|catacombs?|tombs?|ruins?|strongholds?|lairs?|caverns?|caves?|vaults?|fortresses|keeps?|hideouts?|sewers?|mines?|temples?)\b/.test(root);
}
