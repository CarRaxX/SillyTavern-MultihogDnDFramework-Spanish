/**
 * Router state sanitization and timestamp template adjusters.
 */

export function sanitizeRouterState(s) {
    if (!s) return;
    const isGoodId = (id) => typeof id === 'string' && id.includes('::');

    if (Array.isArray(s.activeRouterKeys)) {
        s.activeRouterKeys = s.activeRouterKeys.filter(isGoodId);
    } else {
        s.activeRouterKeys = [];
    }

    if (Array.isArray(s.activeWorldKeys)) {
        s.activeWorldKeys = s.activeWorldKeys.filter(isGoodId);
    } else {
        s.activeWorldKeys = [];
    }

    if (Array.isArray(s.pinnedRouterKeys)) {
        s.pinnedRouterKeys = s.pinnedRouterKeys.filter(isGoodId);
    } else {
        s.pinnedRouterKeys = [];
    }

    if (Array.isArray(s.keywordActivatedKeys)) {
        s.keywordActivatedKeys = s.keywordActivatedKeys.filter(isGoodId);
    } else {
        s.keywordActivatedKeys = [];
    }

    if (Array.isArray(s.routerLog)) {
        s.routerLog = s.routerLog.filter(log => {
            if (!log || typeof log !== 'object') return false;

            if (Array.isArray(log.record)) {
                log.record = log.record.filter(isGoodId);
            } else {
                log.record = [];
            }

            if (Array.isArray(log.activate)) {
                log.activate = log.activate.filter(isGoodId);
            } else {
                log.activate = [];
            }

            if (Array.isArray(log.deactivate)) {
                log.deactivate = log.deactivate.filter(isGoodId);
            } else {
                log.deactivate = [];
            }

            return true;
        });
    } else {
        s.routerLog = [];
    }
}

/**
 * Count of active router keys that are not user-pinned.
 * Pinned entries are excluded from the Lorebook Agent budget so they never
 * trigger BUDGET VIOLATION or eat into the agent's activation slots.
 * @param {string[]} [activeKeys]
 * @param {string[]} [pinnedKeys]
 * @returns {number}
 */
export function computeUnpinnedActiveCount(activeKeys, pinnedKeys) {
    const pinnedSet = new Set(Array.isArray(pinnedKeys) ? pinnedKeys : []);
    return (Array.isArray(activeKeys) ? activeKeys : []).filter(k => !pinnedSet.has(k)).length;
}

/** Extract canonical [CHARACTER] block from the current memo, if present. */
export function extractCharacterBlock(memo) {
    const match = memo?.match(/\[CHARACTER\]([\s\S]*?)\[\/CHARACTER\]/i);
    return match ? `[CHARACTER]${match[1].trim()}[/CHARACTER]` : null;
}

/**
 * True when a core/appearance update target refers to the linked Player Character
 * rather than a lorebook NPC entry.
 * @param {string} id
 * @param {string} [pcName]
 * @returns {boolean}
 */
export function isPcCoreTarget(id, pcName = '') {
    if (!id || typeof id !== 'string') return false;
    const norm = id.trim().toLowerCase();
    if (!norm) return false;
    if (norm === '{{user}}' || norm === 'player' || norm === 'pc' || norm === 'user') return true;
    if (pcName && norm === String(pcName).trim().toLowerCase()) return true;
    return false;
}

/**
 * True for the always-on "Body" visual field (signature/default look, no gear).
 * Also matches the legacy combined "Appearance/Species" header from entries
 * written before the Species/Body/Equipment split, so old data keeps working.
 * Deliberately does NOT match a bare "Species" field — that moved to the
 * manual-only identity bucket alongside Personality/Background/etc.
 * @param {string} field
 */
export function isAppearanceField(field) {
    const n = (field || '').trim().toLowerCase();
    return n.includes('body') || n.includes('appearance') || n.includes('cuerpo') || n.includes('apariencia');
}

/** True for the always-on "Worn Equipment" (visibly worn/carried gear) field. @param {string} field */
export function isEquipmentField(field) {
    const n = (field || '').trim().toLowerCase();
    return n.includes('equipment') || n.includes('gear') || n.includes('worn') || n.includes('equipamiento') || n.includes('equipo');
}

/** True for the static "Species" identity field (manual-only, like Personality). @param {string} field */
export function isSpeciesField(field) {
    const n = (field || '').trim().toLowerCase();
    return n === 'species' || n.startsWith('species ') || n.startsWith('species/') || n.startsWith('species:') ||
        n === 'especie' || n.startsWith('especie ') || n.startsWith('especie/') || n.startsWith('especie:');
}

/** @param {string} field */
export function isCombatProfileField(field) {
    const n = (field || '').trim().toLowerCase();
    return n.includes('combat') || n.includes('combate');
}

/**
 * Fields eligible for commit.core / [[UPDATE_CORE:...]] this pass.
 * Body and Worn Equipment are never in this list — they belong exclusively to the
 * dedicated appearance/equipment tools. Automatic passes are limited to Combat
 * Profile; Direct Prompt / manual passes unlock the remaining identity fields
 * (including Species, which — unlike Body/Worn Equipment — is never auto-updated).
 * @param {Array<{name?: string}>} coreSections
 * @param {boolean} isManual
 * @returns {string[]}
 */
export function getEligibleCoreFieldNames(coreSections, isManual) {
    const names = (Array.isArray(coreSections) ? coreSections : [])
        .map(s => (s && typeof s.name === 'string' ? s.name : ''))
        .filter(Boolean);
    const withoutVisualFields = names.filter(n => !isAppearanceField(n) && !isEquipmentField(n));
    if (!isManual) {
        const combat = withoutVisualFields.filter(n => isCombatProfileField(n));
        return combat.length ? combat : ['Combat Profile'];
    }
    return withoutVisualFields.length ? withoutVisualFields : names.filter(n => !isAppearanceField(n) && !isEquipmentField(n));
}

/**
 * Resolve field-name aliases used when surgically patching a labeled section.
 * "Body" additionally falls back to the legacy combined "Appearance/Species"
 * header so a Body/appearance update on a pre-split entry patches that header
 * in place instead of creating a duplicate "Body:" line.
 * @param {string} field
 * @param {{ isPc?: boolean }} [opts]
 * @returns {string[]}
 */
export function resolveCoreFieldPatterns(field, opts = {}) {
    const normField = (field || '').trim().toLowerCase();
    if (normField.includes('species')) return ['Species'];
    if (normField.includes('equipment') || normField.includes('gear') || normField.includes('worn')) {
        return ['Worn Equipment', 'Equipment'];
    }
    if (normField.includes('body') || normField.includes('appearance')) {
        return ['Body', 'Appearance/Species', 'Appearance'];
    }
    if (normField.includes('personality')) return ['Personality'];
    if (normField.includes('background')) {
        return opts.isPc ? ['Background', 'Brief Background'] : ['Brief Background', 'Background'];
    }
    if (normField.includes('habit') || normField.includes('behavior')) {
        return opts.isPc
            ? ['Habits & Behaviors', 'Habits/Behaviors', 'Habits', 'Behaviors']
            : ['Habits/Behaviors', 'Habits & Behaviors', 'Habits', 'Behaviors'];
    }
    if (normField.includes('combat')) return ['Combat Profile'];
    if (normField.includes('strength')) return ['Strengths'];
    if (normField.includes('flaw')) return ['Flaws'];
    return [field.trim()];
}

/**
 * Patch (or lazily append) a labeled section inside a flat bio / [CORE] body.
 * @param {string} text
 * @param {string} field
 * @param {string} newContent
 * @param {{ isPc?: boolean, extraHeaders?: string[] }} [opts]
 * @returns {{ ok: boolean, text?: string, error?: string }}
 */
export function patchLabeledSection(text, field, newContent, opts = {}) {
    if (!field || newContent == null || String(newContent).trim() === '') {
        return { ok: false, error: 'Missing field or content' };
    }
    const body = typeof text === 'string' ? text : '';
    const fieldPatterns = resolveCoreFieldPatterns(field, opts);
    const escapedPatterns = fieldPatterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    const otherHeaders = [
        'Species',
        'Body', 'Appearance/Species', 'Appearance',
        'Worn Equipment', 'Equipment',
        'Personality',
        'Brief Background', 'Background',
        'Habits/Behaviors', 'Habits & Behaviors', 'Habits', 'Behaviors',
        'Strengths', 'Flaws',
        'Combat Profile',
        'Relationship',
    ];
    for (const h of (opts.extraHeaders || [])) {
        if (h && !otherHeaders.includes(h)) otherHeaders.push(h);
    }
    for (const rawLine of body.split('\n')) {
        const hm = rawLine.trim().match(/^([A-Z][A-Za-z0-9 \/&]+?)\s*:/);
        if (hm) {
            const nm = hm[1].trim();
            if (!otherHeaders.includes(nm)) otherHeaders.push(nm);
        }
    }

    const otherHeadersRegexStr = otherHeaders.map(h => {
        const esc = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (h === 'Background') return '(?<!Brief\\s)Background';
        if (h === 'Behaviors') return '(?<!Habits\\/)(?<!Habits & )(?<!Habits and )Behaviors';
        if (h === 'Appearance') return '(?<!/)Appearance(?!\\/Species)';
        if (h === 'Equipment') return '(?<!Worn\\s)Equipment';
        return esc;
    }).join('|');

    const targetFieldRegex = new RegExp(
        `(?:(${escapedPatterns.join('|')})\\s*:)([\\s\\S]*?)(?=(?:${otherHeadersRegexStr})\\s*:|$)`,
        'i'
    );
    const fieldMatch = body.match(targetFieldRegex);
    const replacementValue = String(newContent).trim();

    if (!fieldMatch) {
        const fieldName = fieldPatterns[0] || field.trim();
        const replacement = `${fieldName}: ${replacementValue}\n`;
        let newBody = body.trimEnd();
        newBody = newBody ? `${newBody}\n${replacement}` : replacement;
        return { ok: true, text: newBody };
    }

    const matchedFieldName = fieldMatch[1];
    const targetSubstring = `${matchedFieldName}:${fieldMatch[2]}`;
    const replacement = `${matchedFieldName}: ${replacementValue}\n`;
    return { ok: true, text: body.replace(targetSubstring, replacement) };
}

/**
 * Strips the [CORE]/[/CORE] bookkeeping markers from a lorebook entry before it
 * reaches the GM/narrator. These tags exist purely so the Lorebook Agent knows
 * which text is protected permanent identity/description vs. append-only
 * chronicle — the narrator has no use for the literal markup and it wastes
 * tokens. The blank line left behind where [/CORE] used to be preserves the
 * visual break between the permanent description and the timestamped history,
 * so the demarcation survives even though the tags themselves are gone.
 * Only ever applied to a display copy — the stored entry.content is untouched,
 * so the agent's own protected-block parsing/enforcement is unaffected.
 * @param {string} content
 * @returns {string}
 */
export function stripCoreMarkersForNarrator(content) {
    if (!content) return content;
    return content
        .replace(/\[CORE\]\n?/g, '')
        .replace(/\n?\[\/CORE\]\n?/g, '\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Dynamically adjusts timestamp formats (Day X/N vs DD/MM/YYYY and 12h vs 24h) inside prompt instructions.
 * @param {string} prompt
 * @param {object} settings
 * @returns {string}
 */
export function adjustPromptTimestamps(prompt, settings) {
    if (!prompt) return prompt;
    const isCalendar = !!settings.useDdMmYyFormat;
    const is24h = !!settings.use24hTime;

    let result = prompt;

    if (isCalendar) {
        if (is24h) {
            // Target: DD/MM/YYYY, HH:MM (24h)
            result = result
                .replace(/Day ([1-9])/g, '0$1/01/2026')
                .replace(/Day N/g, 'DD/MM/YYYY')
                .replace(/Day X/g, 'DD/MM/YYYY')
                .replace(/Day 0/g, '31/12/2025')
                .replace(/12:15 AM/g, '00:15')
                .replace(/11:52 AM/g, '11:52')
                .replace(/10:00 PM/g, '22:00')
                .replace(/08:00 AM/g, '08:00')
                .replace(/06:00 PM/g, '18:00')
                .replace(/14:00/g, '14:00')
                .replace(/10:42/g, '10:42')
                .replace(/10:44/g, '10:44')
                .replace(/HH:MM AM\/PM/g, 'HH:MM')
                .replace(/HH:MM/g, 'HH:MM');
        } else {
            // Target: DD/MM/YYYY, HH:MM AM/PM (12h)
            result = result
                .replace(/Day ([1-9])/g, '0$1/01/2026')
                .replace(/Day N/g, 'DD/MM/YYYY')
                .replace(/Day X/g, 'DD/MM/YYYY')
                .replace(/Day 0/g, '31/12/2025')
                .replace(/14:00(?!\s*(?:AM|PM)\b)/g, '02:00 PM')
                .replace(/22:00(?!\s*(?:AM|PM)\b)/g, '10:00 PM')
                .replace(/10:42(?!\s*(?:AM|PM)\b)/g, '10:42 AM')
                .replace(/10:44(?!\s*(?:AM|PM)\b)/g, '10:44 AM')
                .replace(/HH:MM/g, 'HH:MM AM/PM')
                .replace(/HH:MM AM\/PM/g, 'HH:MM AM/PM');
        }
    } else {
        if (is24h) {
            // Target: Day N, HH:MM (24h)
            result = result
                .replace(/0([1-9])\/01\/2026/g, 'Day $1')
                .replace(/DD\/MM\/YYYY/g, 'Day N')
                .replace(/31\/12\/2025/g, 'Day 0')
                .replace(/12:15 AM/g, '00:15')
                .replace(/11:52 AM/g, '11:52')
                .replace(/10:00 PM/g, '22:00')
                .replace(/08:00 AM/g, '08:00')
                .replace(/06:00 PM/g, '18:00')
                .replace(/14:00/g, '14:00')
                .replace(/10:42/g, '10:42')
                .replace(/10:44/g, '10:44')
                .replace(/HH:MM AM\/PM/g, 'HH:MM')
                .replace(/HH:MM/g, 'HH:MM');
        } else {
            // Target: Day N, HH:MM AM/PM (12h)
            result = result
                .replace(/0([1-9])\/01\/2026/g, 'Day $1')
                .replace(/DD\/MM\/YYYY/g, 'Day N')
                .replace(/31\/12\/2025/g, 'Day 0')
                .replace(/14:00(?!\s*(?:AM|PM)\b)/g, '02:00 PM')
                .replace(/22:00(?!\s*(?:AM|PM)\b)/g, '10:00 PM')
                .replace(/10:42(?!\s*(?:AM|PM)\b)/g, '10:42 AM')
                .replace(/10:44(?!\s*(?:AM|PM)\b)/g, '10:44 AM')
                .replace(/HH:MM/g, 'HH:MM AM/PM')
                .replace(/HH:MM AM\/PM/g, 'HH:MM AM/PM');
        }
    }

    // Make repeated format toggles idempotent. Older templates can contain
    // "HH:MM AM/PM AM/PM" (or more repetitions) because a broad HH:MM
    // replacement also matched the start of an already-suffixed placeholder.
    // Collapse those legacy forms while producing the requested clock format.
    return is24h
        ? result.replace(/HH:MM(?:\s+AM\/PM)+/g, 'HH:MM')
        : result.replace(/HH:MM(?:\s+AM\/PM)*/g, 'HH:MM AM/PM');
}

/**
 * Iterates through all stored system prompt, modular agent prompt, and stock prompt templates,
 * rewriting their embedded date/time examples to match the newly selected format.
 * @param {object} settings
 */
export function adjustAllStoredTemplatesForTimeFormat(settings) {
    if (settings.routerSystemPromptTemplate) {
        settings.routerSystemPromptTemplate = adjustPromptTimestamps(settings.routerSystemPromptTemplate, settings);
    }
    if (settings.routerModularPromptTemplate) {
        settings.routerModularPromptTemplate = adjustPromptTimestamps(settings.routerModularPromptTemplate, settings);
    }
    if (settings.stockPrompts) {
        for (const [key, val] of Object.entries(settings.stockPrompts)) {
            settings.stockPrompts[key] = adjustPromptTimestamps(val, settings);
        }
    }
}
