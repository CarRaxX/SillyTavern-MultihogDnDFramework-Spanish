import { getSettings, getBarBackground, getBarShowAsPercentage, getBarAnimateChanges } from './state-manager.js';
import { lookupCustomPortraitSrc } from './portrait-storage.js';
import { escapeHtml, decodeHtml, highlightParens, highlightNumbers, parseInWorldTime, isRestTimeUnset, formatTimeDiff, isArchivedQuestStatus, questHasEffectiveDeadline, isEmergentQuest } from './memo-processor.js';
import { BLOCK_ICONS, BLOCK_ORDER, PAGE_SIZE, NO_PAGINATE, TAG_DISPLAY_NAMES, renderStartingGearTierOptions } from './constants.js';
import { t } from './src/i18n/index.js';
import { isResolvedCombatantStatusLine, parseCombatSideHeader } from './src/state/combat-persistence.js';
import { buildDisplayGroupRenderPlan } from './src/features/display-groups.js';

// ── Renderer module: pure HTML string producers, localStorage helpers ──
// No live DOM mutations. All functions return strings or void (localStorage).

const DEFAULT_HP_COLOR = '#00ffaa';
const DEFAULT_XP_COLOR = 'linear-gradient(90deg, #0088ff, #00d4ff)';

/** CSS tint for any browser-supported solid color token (named or hexadecimal). */
function makeColorTintStyle(color, backgroundPct = 12, borderPct = 40) {
    return `background:color-mix(in srgb, ${color} ${backgroundPct}%, transparent);border-color:color-mix(in srgb, ${color} ${borderPct}%, transparent);color:${color};`;
}

/** Mirrors a BARREL fill on its value text, including user-selected gradients. */
function makeBarrelValueStyle(background) {
    if (/^linear-gradient\(/i.test(background)) {
        return `background:${background};-webkit-background-clip:text;background-clip:text;color:transparent;`;
    }
    return `color:${background};`;
}

/** Machine-readable state used to animate a bar across full DOM refreshes. */
function makeBarAnimationData(barId, current, max, kind = 'linear', animateOverride = null) {
    if (!barId || !Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return '';
    const animate = animateOverride === null ? getBarAnimateChanges(barId) : !!animateOverride;
    return ` data-rt-bar-id="${escapeHtml(barId)}" data-rt-bar-current="${current}" data-rt-bar-max="${max}" data-rt-bar-kind="${kind}" data-rt-bar-animate="${animate}"`;
}

/**
 * Extracts a time-of-day emoji + accent color from any free-form string containing
 * an "HH:MM[ AM/PM]" clock pattern (e.g. a [TIME] block line, or a "Current Time" string).
 * Shared by the TIME card renderer and the Tab Mode footer clock so both stay in sync.
 * @param {string} str
 * @returns {{hour: number, emoji: string, color: string, phase: string}}  hour is -1 and phase is '' when no clock pattern is found
 */
export function getTimeOfDayInfo(str) {
    const m = String(str || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return { hour: -1, emoji: '', color: 'inherit', phase: '' };
    let h = parseInt(m[1], 10);
    if (m[3]) {
        const mer = m[3].toUpperCase();
        if (mer === 'AM' && h === 12) h = 0;
        if (mer === 'PM' && h !== 12) h += 12;
    }
    if (!Number.isFinite(h) || h < 0 || h > 23) return { hour: -1, emoji: '', color: 'inherit', phase: '' };

    const phase =
        h < 5  ? 'lateNight' :
        h < 7  ? 'dawn' :
        h < 12 ? 'morning' :
        h < 14 ? 'midday' :
        h < 18 ? 'afternoon' :
        h < 20 ? 'sunset' :
        'night';
    const emoji =
        h < 5  ? '🌙' : // late night
        h < 7  ? '🌅' : // dawn
        h < 12 ? '☀️' : // morning
        h < 14 ? '🌞' : // midday
        h < 18 ? '🌤️' : // afternoon
        h < 20 ? '🌇' : // sunset
        '🌃';           // night
    const color =
        h < 5  ? '#9999ff' : // late night (cool blue)
        h < 7  ? '#ffccaa' : // dawn (peach)
        h < 12 ? '#ffffbb' : // morning (pale yellow)
        h < 14 ? '#ffffff' : // midday (white)
        h < 18 ? '#fff2cc' : // afternoon (warm cream)
        h < 20 ? '#ffaa55' : // sunset (orange)
        '#7777ee';           // night (indigo)

    return { hour: h, emoji, color, phase };
}

/** Time-of-day phases that show the moon (vs. the sun) in the day/night sky badge. */
const DAYNIGHT_MOON_PHASES = new Set(['lateNight', 'night']);

/**
 * Renders a small pure-CSS "sky" badge (sun or moon, with a starfield at night)
 * reflecting the in-world time of day, for the panel header. Purely decorative —
 * built entirely from CSS (radial-gradient disc + box-shadow star dots), no image
 * assets. Colors/positioning are driven by the `rt-sky-<phase>` class; this
 * function only decides which phase class and markup shape (moon+stars vs sun) to use.
 * @param {string} str - any string containing an "HH:MM[ AM/PM]" pattern (e.g. current [TIME] line)
 * @returns {string} HTML, or '' if no clock pattern was found in `str`
 */
export function renderDayNightBadge(str) {
    const { hour, phase } = getTimeOfDayInfo(str);
    if (hour === -1) return '';

    const isMoon = DAYNIGHT_MOON_PHASES.has(phase);
    const bodyHtml = `<div class="rt-sky-disc"></div>`;
    // Stars only during moon phases — a handful of fixed dots is enough to read as a starfield.
    const starsHtml = isMoon ? `<div class="rt-sky-stars"></div>` : '';

    return `<div class="rt-daynight-badge rt-sky-${phase}" title="In-world time of day: ${escapeHtml(phase.replace(/([A-Z])/g, ' $1').toLowerCase())}">${starsHtml}${bodyHtml}</div>`;
}

    export const STOCK_FIELD_RULES = {
        'combat': 'numbers',
        'combate': 'numbers',
        'gear': 'highlight',
        'equipo': 'highlight',
        'proficiencies': 'pills',
        'competencias': 'pills',
        'attr': 'highlight',
        'attributes': 'highlight',
        'atributos': 'highlight',
        'atrib': 'highlight',
        'skills': 'pills',
        'habilidades': 'pills',
        'key skills': 'pills',
        'saves': 'numbers',
        'salvaciones': 'numbers',
        'status': 'pills',
        'estado': 'pills',
        'traits': 'pills',
        'rasgos': 'pills',
        'abilities': 'pills',
        'capacidades': 'pills',
        'capacidad': 'pills',
        'other': 'pills',
        'otros': 'pills',
        'otro': 'pills',
        'resistances': 'pills',
        'resistencias': 'pills',
        'res': 'pills',
        'hd': 'hd_pips',
        'dg': 'hd_pips',
        'weapon': 'highlight',
        'arma': 'highlight',
        'att/def': 'numbers',
        'atq/def': 'numbers',
        'primary weapon': 'highlight',
        'spells': 'spell_group',
        'conjuros': 'spell_group',
        'hechizos': 'spell_group',
        'ac': 'text',
        'ca': 'text'
    };

    const SUB_LABEL_TRANSLATIONS = {
        'combat:': 'Combate:',
        'combate:': 'Combate:',
        'gear:': 'Equipo:',
        'equipo:': 'Equipo:',
        'proficiencies:': 'Competencias:',
        'competencias:': 'Competencias:',
        'attr:': 'Atributos:',
        'attributes:': 'Atributos:',
        'atributos:': 'Atributos:',
        'atrib:': 'Atributos:',
        'saves:': 'Salvaciones:',
        'salvaciones:': 'Salvaciones:',
        'skills:': 'Habilidades:',
        'habilidades:': 'Habilidades:',
        'key skills:': 'Habilidades Clave:',
        'traits:': 'Rasgos:',
        'rasgos:': 'Rasgos:',
        'abilities:': 'Capacidades:',
        'capacidades:': 'Capacidades:',
        'status:': 'Estado:',
        'estado:': 'Estado:',
        'hd:': 'DG:',
        'dg:': 'DG:',
        'other:': 'Otros:',
        'otros:': 'Otros:',
        'otro:': 'Otros:',
        'info:': 'Información:',
        'spells:': 'Conjuros:',
        'conjuros:': 'Conjuros:',
        'hechizos:': 'Conjuros:',
        'ac:': 'CA:',
        'ca:': 'CA:',
        'res:': 'Res:',
        'resistances:': 'Resistencias:',
        'weapon:': 'Arma:',
        'arma:': 'Arma:',
        'att/def:': 'Atq/Def:',
        'atq/def:': 'Atq/Def:'
    };

    function translateSubFieldValue(val) {
        if (!val) return val;
        return val
            .replace(/\bHealthy\b/gi, 'Sano')
            .replace(/\b(\d+)\s+attacks?\b/gi, (m, n) => `${n} ${parseInt(n, 10) === 1 ? 'ataque' : 'ataques'}`)
            .replace(/\bRanged\b/gi, 'A distancia')
            .replace(/\bMelee\b/gi, 'Cuerpo a cuerpo')
            .replace(/\bBase AC\b/gi, 'CA Base')
            .replace(/\bTotal AC\b/gi, 'CA Total');
    }

    export function renderSubFieldByRule(rule, line, barId = null, options = {}) {
        const colonIdx = line.indexOf(':');
        // If there's no colon, the whole line is the value (no label)
        const hasLabel = colonIdx !== -1;
        const rawLabelText = hasLabel ? line.substring(0, colonIdx + 1).trim() : '';
        const rawValue     = hasLabel ? line.substring(colonIdx + 1).trim() : line.trim();

        const displayLabelText = SUB_LABEL_TRANSLATIONS[rawLabelText.toLowerCase()] || rawLabelText;
        const value = translateSubFieldValue(rawValue);

        const colorLabel = rule.color && !['badge', 'badge_colored', 'pills', 'pill_colored'].includes(rule.renderType);
        const labelStyle = colorLabel ? ` style="color:${rule.color}"` : '';
        const labelHtml  = displayLabelText
            ? `<span class="rt-entity-sub-label"${labelStyle}>${escapeHtmlWithColor(displayLabelText)}</span>`
            : '';

        switch (rule.renderType) {
            case 'pills':
                return `<div class="rt-entity-sub-line rt-units-container">${labelHtml} ${renderPills(value, rule.color)}</div>`;
            case 'badge': {
                const badgeColorStyle = rule.color ? ` style="${makeColorTintStyle(rule.color)}"` : '';
                return `<div class="rt-entity-sub-line rt-units-container">${labelHtml} <span class="rt-unit-pill no-desc"${badgeColorStyle}><span class="rt-unit-name">${escapeHtmlWithColor(value)}</span></span></div>`;
            }
            case 'highlight': {
                const highlighted = highlightParens(escapeHtmlWithColor(value));
                const wrapped = rule.color ? `<span style="color:${rule.color};">${highlighted}</span>` : highlighted;
                return `<div class="rt-entity-sub-line">${labelHtml} ${wrapped}</div>`;
            }
            case 'numbers':
                return `<div class="rt-entity-sub-line">${labelHtml} ${highlightNumbers(escapeHtmlWithColor(value))}</div>`;
            case 'barrel': {
                // A signed, centre-zero bar. The value format is deliberately generic:
                //   -38/150, +38/150, 38/-150..+150, or -38/-150..+150
                // Labels and trailing text are display-only, so BARREL works for any
                // relationship, reputation, alignment, morale, or custom tracker axis.
                const signedRange = value.match(/([+-]?\d[\d,]*)\s*\/\s*([+-]?\d[\d,]*)\s*(?:\.\.|to)\s*([+-]?\d[\d,]*)/i);
                const valueAndMax = value.match(/([+-]?\d[\d,]*)\s*\/\s*([+-]?\d[\d,]*)/);
                const m = signedRange || valueAndMax;

                if (m) {
                    const current = parseInt(m[1].replace(/,/g, ''), 10);
                    const rangeMax = signedRange
                        ? Math.max(Math.abs(parseInt(m[2].replace(/,/g, ''), 10)), Math.abs(parseInt(m[3].replace(/,/g, ''), 10)))
                        : Math.abs(parseInt(m[2].replace(/,/g, ''), 10));

                    if (Number.isFinite(current) && Number.isFinite(rangeMax) && rangeMax > 0) {
                        const clamped = Math.max(-rangeMax, Math.min(rangeMax, current));
                        const pct = (Math.abs(clamped) / rangeMax) * 50;
                        const isPositive = clamped >= 0;
                        const extra = value.replace(m[0], '').trim();
                        const positiveDefault = rule.positiveColor || rule.color || 'linear-gradient(90deg, #4ade8088, #4ade80)';
                        const negativeDefault = rule.negativeColor || rule.color || 'linear-gradient(270deg, #ef444488, #ef4444)';
                        const positiveBarId = barId ? `${barId}:positive` : '';
                        const negativeBarId = barId ? `${barId}:negative` : '';
                        const positiveBg = getBarBackground(positiveBarId, positiveDefault, pct);
                        const negativeBg = getBarBackground(negativeBarId, negativeDefault, pct);
                        const positiveRecolorData = positiveBarId
                            ? ` data-recolor-id="${escapeHtml(positiveBarId)}" data-recolor-current="${escapeHtml(positiveBg)}" data-barrel-direction="positive" title="Click to recolor the positive side"`
                            : '';
                        const negativeRecolorData = negativeBarId
                            ? ` data-recolor-id="${escapeHtml(negativeBarId)}" data-recolor-current="${escapeHtml(negativeBg)}" data-barrel-direction="negative" title="Click to recolor the negative side"`
                            : '';
                        const valueClass = clamped > 0 ? 'rt-barrel-value-positive' : clamped < 0 ? 'rt-barrel-value-negative' : 'rt-barrel-value-zero';
                        const valueDirection = clamped > 0 ? 'positive' : clamped < 0 ? 'negative' : 'zero';
                        const valueColorStyle = valueDirection === 'zero'
                            ? ''
                            : ` style="${makeBarrelValueStyle(valueDirection === 'positive' ? positiveBg : negativeBg)}"`;
                        const displayValue = `${clamped > 0 ? '+' : ''}${clamped}/${rangeMax}`;

                        return `<div class="rt-entity-sub-line rt-barrel-row">
                            ${labelHtml}
                            <div class="rt-barrel-track"${makeBarAnimationData(barId, clamped, rangeMax, 'barrel', getBarAnimateChanges(positiveBarId) || getBarAnimateChanges(negativeBarId) || (options.customMarker && !!getSettings().animateAllCustomBarChanges))} aria-label="${escapeHtml(`${labelText || 'Value'} ${displayValue}`)}">
                                <div class="rt-barrel-color-control rt-barrel-negative-control"${negativeRecolorData}></div>
                                <div class="rt-barrel-color-control rt-barrel-positive-control"${positiveRecolorData}></div>
                                <div class="rt-barrel-center-marker"></div>
                                <div class="rt-barrel-fill ${isPositive ? 'rt-barrel-positive' : 'rt-barrel-negative'}" data-barrel-direction="${isPositive ? 'positive' : 'negative'}" style="width:${pct.toFixed(1)}%;background:${isPositive ? positiveBg : negativeBg};"></div>
                            </div>
                            <span class="rt-barrel-value ${valueClass}" data-barrel-direction="${valueDirection}"${valueColorStyle}>${displayValue}${extra ? ` ${escapeHtml(extra)}` : ''}</span>
                        </div>`;
                    }
                }

                // A BARREL tag with no readable value remains useful as a styled text line.
                return `<div class="rt-entity-sub-line">${labelHtml} ${escapeHtmlWithColor(value)}</div>`;
            }
            case 'hp_bar': {
                // Flexible: parses any "X/Y" optionally with extra text e.g. "45/100 (5 temp)"
                const m = value.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)/);
                if (m) {
                    const cur = parseInt(m[1].replace(/,/g, ''), 10);
                    const max = parseInt(m[2].replace(/,/g, ''), 10);
                    const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
                    const extra = value.replace(m[0], '').trim();
                    // Use custom color if set, else fall back to red gradient
                    let barBg = rule.color
                        ? rule.color
                        : 'linear-gradient(90deg,#e74c3c,#c0392b)';
                    if (barId) barBg = getBarBackground(barId, barBg, pct);

                    const recolorData = barId ? ` data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}" title="Click to recolor"` : '';

                    const showAsPct = getBarShowAsPercentage(barId);
                    const dispCur = showAsPct ? Math.round(pct) : cur;
                    const dispMax = showAsPct ? 100 : max;

                    return `<div class="rt-entity-sub-line" style="gap:6px;">
                        ${labelHtml}
                        <div class="rt-hp-bar-wrap"${recolorData}${makeBarAnimationData(barId, cur, max, 'linear', getBarAnimateChanges(barId) || (options.customMarker && !!getSettings().animateAllCustomBarChanges))} style="flex:1; position:relative; height:14px; border-radius:4px; overflow:hidden; background:rgba(255,255,255,0.1);">
                            <div class="rt-hp-bar" style="width:${pct.toFixed(1)}%; height:100%; border-radius:4px; background:${barBg}; transition:width 0.3s;"></div>
                        </div>
                        <span style="font-size:0.82em; opacity:0.85; white-space:nowrap;">${dispCur}/${dispMax}${extra ? ' ' + escapeHtml(extra) : ''}</span>
                    </div>`;
                }
                // Fallback: plain text
                return `<div class="rt-entity-sub-line">${labelHtml} ${escapeHtmlWithColor(value)}</div>`;
            }
            case 'xp_bar': {
                // Flexible: parses any "X/Y" with optional "Level N" anywhere in value
                const xm = value.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)/);
                const lm = value.match(/level\s*(\d+)/i);
                if (xm) {
                    const cur = parseInt(xm[1].replace(/,/g, ''), 10);
                    const max = parseInt(xm[2].replace(/,/g, ''), 10);
                    const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
                    const level = lm?.[1] || '';
                    const levelStr = level ? `<span style="font-size:0.8em; opacity:0.75;">Lv ${level}</span> ` : '';
                    let barBg = rule.color ? rule.color : DEFAULT_XP_COLOR;
                    if (barId) barBg = getBarBackground(barId, barBg, pct);

                    const recolorData = barId ? ` data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}" title="Click to recolor"` : '';

                    const showAsPct = getBarShowAsPercentage(barId);
                    const dispCur = showAsPct ? Math.round(pct) : xm[1];
                    const dispMax = showAsPct ? 100 : xm[2];

                    return `<div class="rt-entity-sub-line rt-xp-row" data-xp-current="${cur}" data-xp-max="${max}" data-xp-level="${level}" data-xp-show-percentage="${showAsPct}" style="gap:6px;">
                        ${labelHtml}
                        <div class="rt-xp-bar-wrap"${recolorData} style="flex:1; height:12px;">
                            <div class="rt-xp-bar" style="width:${pct.toFixed(1)}%; background:${barBg};"></div>
                        </div>
                        <span style="font-size:0.82em; opacity:0.85; white-space:nowrap;">${levelStr}<span class="rt-xp-current">${dispCur}</span>/<span class="rt-xp-max">${dispMax}</span></span>
                    </div>`;
                }
                return `<div class="rt-entity-sub-line">${labelHtml} ${escapeHtmlWithColor(value)}</div>`;
            }
            case 'kv':
                return `<div class="rt-card-kv"><span class="rt-card-key">${labelHtml}</span><span class="rt-card-val">${escapeHtmlWithColor(value)}</span></div>`;
            case 'objective': {
                // Objective with checkbox status: ○ (incomplete), ✓/✔ (done), ✗/✘ (failed)
                const isDone = /^[✓✔☑]/.test(value);
                const isFailed = /^[✗✘☒]/.test(value);
                const isIncomplete = /^[○◯◦]/.test(value);
                const cleanVal = value.replace(/^[✓✔☑✗✘☒○◯◦]\s*/, '').trim();
                const statusClass = isDone ? 'rt-obj-done' : isFailed ? 'rt-obj-failed' : 'rt-obj-pending';
                const icon = isDone ? '✓' : isFailed ? '✗' : '○';
                return `<div class="rt-objective ${statusClass}">${labelHtml}<span class="rt-obj-icon">${icon}</span> <span class="rt-obj-text">${escapeHtmlWithColor(cleanVal)}</span></div>`;
            }
            case 'reward': {
                const rewardStyle = rule.color ? ` style="${makeColorTintStyle(rule.color, 0, 40)}"` : '';
                return `<div class="rt-entity-sub-line"><span class="rt-reward-chip"${rewardStyle}>${labelHtml ? labelHtml + ' ' : ''}🎁 ${escapeHtmlWithColor(value)}</span></div>`;
            }
            case 'difficulty': {
                const diffColors = { 'very easy': '#2ecc71', 'easy': '#27ae60', 'medium': '#f1c40f', 'normal': '#f1c40f', 'hard': '#e67e22', 'very hard': '#e74c3c' };
                const diffColor = rule.color || diffColors[value.toLowerCase()] || '#aaa';
                return `<div class="rt-entity-sub-line">${labelHtml}<span class="rt-difficulty-badge" style="background:${diffColor}22; color:${diffColor}; border:1px solid ${diffColor}55;">${escapeHtmlWithColor(value)}</span></div>`;
            }
            case 'progress': {
                const pm = value.match(/(\d+)\s*\/\s*(\d+)/);
                if (pm) {
                    const cur = parseInt(pm[1], 10), max = parseInt(pm[2], 10);
                    const pct = max > 0 ? Math.min(100, (cur / max) * 100) : 0;
                    const extra = value.replace(pm[0], '').trim();
                    let barBg = rule.color ? rule.color : 'linear-gradient(90deg, #00c88c, #00d4ff)';
                    if (barId) barBg = getBarBackground(barId, barBg, pct);
                    
                    const recolorData = barId ? ` data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}" title="Click to recolor"` : '';

                    return `<div class="rt-entity-sub-line rt-progress-row">${labelHtml}
                        <div class="rt-progress-bar-wrap"${recolorData}${makeBarAnimationData(barId, cur, max)}>
                            <div class="rt-progress-bar" style="width:${pct.toFixed(1)}%;background:${barBg};"></div>
                        </div>
                        <span class="rt-progress-label">${cur}/${max}${extra ? ' ' + escapeHtml(extra) : ''}</span>
                    </div>`;
                }
                return `<div class="rt-entity-sub-line">${labelHtml} ${escapeHtmlWithColor(value)}</div>`;
            }
            case 'clock': {
                const pm = value.match(/(\d+)\s*\/\s*(\d+)/);
                if (pm) {
                    const cur = parseInt(pm[1], 10), max = parseInt(pm[2], 10);
                    const pct = max > 0 ? Math.min(100, (cur / max) * 100) : 0;
                    const extra = value.replace(pm[0], '').trim();
                    let barBg = rule.color ? rule.color : 'var(--rt-accent, #00ffaa)';
                    if (barId) barBg = getBarBackground(barId, barBg, pct);
                    const recolorData = barId ? ` data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}" title="Click to recolor"` : '';
                    
                    return `<div class="rt-entity-sub-line rt-clock-row">${labelHtml}
                        <div class="rt-clock-icon"${recolorData} style="background: conic-gradient(${barBg} ${pct}%, transparent 0);"></div>
                        <span class="rt-clock-label">${cur}/${max}${extra ? ' ' + escapeHtml(extra) : ''}</span>
                    </div>`;
                }
                return `<div class="rt-entity-sub-line">${labelHtml} ${escapeHtmlWithColor(value)}</div>`;
            }
            case 'stars': {
                const pm = value.match(/(\d+)\s*\/\s*(\d+)/) || value.match(/(\d+)/);
                if (pm) {
                    const cur = parseInt(pm[1], 10);
                    const max = pm[2] ? parseInt(pm[2], 10) : 5;
                    const extra = value.replace(pm[0], '').trim();
                    const filled = Math.min(cur, max);
                    const empty = Math.max(0, max - filled);
                    let barBg = rule.color ? rule.color : '#ffd700';
                    if (barId) barBg = getBarBackground(barId, barBg, max > 0 ? (filled / max) * 100 : 0);
                    const recolorData = barId ? ` data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}" title="Click to recolor"` : '';

                    const starsHtml = `<span class="rt-stars-icon" style="color:${barBg};"${recolorData}>${'★'.repeat(filled)}${'☆'.repeat(empty)}</span>`;
                    return `<div class="rt-entity-sub-line rt-stars-row">${labelHtml} ${starsHtml} <span class="rt-stars-label">${extra ? escapeHtml(extra) : ''}</span></div>`;
                }
                return `<div class="rt-entity-sub-line">${labelHtml} ${escapeHtmlWithColor(value)}</div>`;
            }
            case 'weight': {
                const pm = value.match(/(\d+)\s*\/\s*(\d+)/);
                if (pm) {
                    const cur = parseInt(pm[1], 10), max = parseInt(pm[2], 10);
                    const pct = max > 0 ? Math.min(100, (cur / max) * 100) : 0;
                    const extra = value.replace(pm[0], '').trim();
                    let barBg = rule.color ? rule.color : (pct >= 100 ? '#e74c3c' : pct >= 75 ? '#f1c40f' : '#2ecc71');
                    if (barId) barBg = getBarBackground(barId, barBg, pct);
                    const recolorData = barId ? ` data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}" title="Click to recolor"` : '';

                    return `<div class="rt-entity-sub-line rt-weight-row">${labelHtml}
                        <span class="rt-weight-icon">⚖️</span>
                        <div class="rt-weight-bar-wrap"${recolorData}${makeBarAnimationData(barId, cur, max)}>
                            <div class="rt-weight-bar" style="width:${pct.toFixed(1)}%;background:${barBg};"></div>
                        </div>
                        <span class="rt-weight-label">${cur}/${max}${extra ? ' ' + escapeHtml(extra) : ''}</span>
                    </div>`;
                }
                return `<div class="rt-entity-sub-line">${labelHtml} ⚖️ ${escapeHtmlWithColor(value)}</div>`;
            }
            case 'weather': {
                let icon = '🌤️';
                const lower = value.toLowerCase();
                if (lower.includes('rain') || lower.includes('storm') || lower.includes('wet')) icon = '🌧️';
                else if (lower.includes('snow') || lower.includes('cold') || lower.includes('ice') || lower.includes('blizzard')) icon = '❄️';
                else if (lower.includes('sun') || lower.includes('hot') || lower.includes('clear')) icon = '☀️';
                else if (lower.includes('cloud') || lower.includes('overcast')) icon = '☁️';
                else if (lower.includes('wind')) icon = '🌬️';
                else if (lower.includes('fog')) icon = '🌫️';
                else if (lower.includes('night') || lower.includes('dark')) icon = '🌙';
                
                return `<div class="rt-entity-sub-line">${labelHtml} <span class="rt-weather-badge">${icon} ${escapeHtmlWithColor(value)}</span></div>`;
            }
            case 'orbs': {
                const pm = value.match(/(\d+)\s*\/\s*(\d+)/);
                if (pm) {
                    const cur = parseInt(pm[1], 10), max = parseInt(pm[2], 10);
                    const extra = value.replace(pm[0], '').trim();
                    let barBg = rule.color ? rule.color : '#3498db';
                    if (barId) barBg = getBarBackground(barId, barBg, max > 0 ? (cur/max)*100 : 0);
                    const recolorData = barId ? ` data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}" title="Click to recolor"` : '';
                    
                    let orbsHtml = '';
                    for (let i = 0; i < max; i++) {
                        const isFilled = i < cur;
                        orbsHtml += `<div class="rt-orb ${isFilled ? 'filled' : 'empty'}" style="${isFilled ? `background:${barBg};box-shadow:0 0 5px ${barBg};` : ''}"></div>`;
                    }
                    
                    return `<div class="rt-entity-sub-line rt-orbs-row">${labelHtml}
                        <div class="rt-orbs-container"${recolorData}>${orbsHtml}</div>
                        <span class="rt-orbs-label">${extra ? escapeHtml(extra) : ''}</span>
                    </div>`;
                }
                return `<div class="rt-entity-sub-line">${labelHtml} ${escapeHtmlWithColor(value)}</div>`;
            }
            case 'slots': {
                const pm = value.match(/(\d+)\s*\/\s*(\d+)/);
                if (pm) {
                    const cur = parseInt(pm[1], 10), max = parseInt(pm[2], 10);
                    const extra = value.replace(pm[0], '').trim();
                    let barBg = rule.color ? rule.color : '#aaaaaa';
                    if (barId) barBg = getBarBackground(barId, barBg, max > 0 ? (cur/max)*100 : 0);
                    const recolorData = barId ? ` data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}" title="Click to recolor"` : '';
                    
                    let slotsHtml = '';
                    for (let i = 0; i < max; i++) {
                        const isFilled = i < cur;
                        slotsHtml += `<div class="rt-slot ${isFilled ? 'filled' : 'empty'}" style="${isFilled ? `background:${barBg};` : ''}"></div>`;
                    }
                    
                    return `<div class="rt-entity-sub-line rt-slots-row">${labelHtml}
                        <div class="rt-slots-container"${recolorData}>${slotsHtml}</div>
                        <span class="rt-slots-label">${extra ? escapeHtml(extra) : ''}</span>
                    </div>`;
                }
                return `<div class="rt-entity-sub-line">${labelHtml} ${escapeHtmlWithColor(value)}</div>`;
            }
            case 'phase': {
                const pm = value.match(/(\d+)\s*\/\s*(\d+)/);
                if (pm) {
                    const cur = parseInt(pm[1], 10), max = parseInt(pm[2], 10);
                    const extra = value.replace(pm[0], '').trim();
                    let barBg = rule.color ? rule.color : 'var(--rt-accent, #00ffaa)';
                    if (barId) barBg = getBarBackground(barId, barBg, max > 0 ? (cur/max)*100 : 0);
                    const recolorData = barId ? ` data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}" title="Click to recolor"` : '';
                    
                    let phaseHtml = '';
                    for (let i = 0; i < max; i++) {
                        const isPast = i < cur - 1;
                        const isCurrent = i === cur - 1;
                        let stateClass = isPast ? 'past' : (isCurrent ? 'current' : 'future');
                        phaseHtml += `<div class="rt-phase-node ${stateClass}" style="${isPast || isCurrent ? `background:${barBg};border-color:${barBg};` : ''}${isCurrent ? `box-shadow:0 0 8px ${barBg};` : ''}"></div>`;
                        if (i < max - 1) {
                            const isLineFilled = i < cur - 1;
                            phaseHtml += `<div class="rt-phase-line ${isLineFilled ? 'filled' : 'empty'}" style="${isLineFilled ? `background:${barBg};` : ''}"></div>`;
                        }
                    }
                    
                    return `<div class="rt-entity-sub-line rt-phase-row">${labelHtml}
                        <div class="rt-phase-container"${recolorData}>${phaseHtml}</div>
                        <span class="rt-phase-label">${cur}/${max}${extra ? ' ' + escapeHtml(extra) : ''}</span>
                    </div>`;
                }
                return `<div class="rt-entity-sub-line">${labelHtml} ${escapeHtmlWithColor(value)}</div>`;
            }
            case 'gauge': {
                const pm = value.match(/(\d+)\s*\/\s*(\d+)/);
                if (pm) {
                    const cur = parseInt(pm[1], 10), max = parseInt(pm[2], 10);
                    const pct = max > 0 ? Math.min(100, (cur / max) * 100) : 0;
                    const extra = value.replace(pm[0], '').trim();
                    let barBg = rule.color ? rule.color : 'linear-gradient(90deg, #2ecc71, #f1c40f, #e74c3c)';
                    if (barId) barBg = getBarBackground(barId, barBg, pct);
                    const recolorData = barId ? ` data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}" title="Click to recolor"` : '';
                    
                    const degrees = -90 + (180 * (pct / 100));
                    
                    return `<div class="rt-entity-sub-line rt-gauge-row">${labelHtml}
                        <div class="rt-gauge-wrap"${recolorData}>
                            <div class="rt-gauge-bg" style="background:${barBg};"></div>
                            <div class="rt-gauge-needle" style="transform: rotate(${degrees}deg);"></div>
                        </div>
                        <span class="rt-gauge-label">${cur}/${max}${extra ? ' ' + escapeHtml(extra) : ''}</span>
                    </div>`;
                }
                return `<div class="rt-entity-sub-line">${labelHtml} ${escapeHtmlWithColor(value)}</div>`;
            }
            case 'charge': {
                const pm = value.match(/(\d+)\s*\/\s*(\d+)/);
                if (pm) {
                    const cur = parseInt(pm[1], 10), max = parseInt(pm[2], 10);
                    const pct = max > 0 ? Math.min(100, (cur / max) * 100) : 0;
                    const extra = value.replace(pm[0], '').trim();
                    
                    const isLow = cur <= 1 && max > 1;
                    let barBg = rule.color ? rule.color : (isLow ? '#e74c3c' : '#2ecc71');
                    if (barId) barBg = getBarBackground(barId, barBg, pct);
                    const recolorData = barId ? ` data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}" title="Click to recolor"` : '';
                    
                    const chargeHtml = `<div class="rt-battery-wrap ${isLow && cur === 0 ? 'empty-flash' : ''}"${recolorData}${makeBarAnimationData(barId, cur, max)} style="border-color:${barBg};">
                        <div class="rt-battery-fill" style="width:${pct}%;background:${barBg};"></div>
                        <div class="rt-battery-nub" style="background:${barBg};"></div>
                    </div>`;

                    return `<div class="rt-entity-sub-line rt-charge-row">${labelHtml}
                        ${chargeHtml}
                        <span class="rt-charge-label">${cur}/${max}${extra ? ' ' + escapeHtml(extra) : ''}</span>
                    </div>`;
                }
                return `<div class="rt-entity-sub-line">${labelHtml} ${escapeHtmlWithColor(value)}</div>`;
            }
            case 'pill_colored': {
                // A custom color override replaces the fixed buff/debuff/magic class entirely.
                const pClass = rule.color ? '' : (rule.pillClass || '');
                const colorStyle = rule.color ? ` style="${makeColorTintStyle(rule.color)}"` : '';
                const pillHtml = splitSmart(value).map(p => {
                    p = p.trim();
                    const descMatch = p.match(/^(.*?)\s*\((.*?)\)$/);
                    const name = descMatch ? descMatch[1].trim() : p;
                    const desc = descMatch ? descMatch[2].trim() : '';
                    const descHtml = desc ? `<div class="rt-unit-descr">${escapeHtml(desc)}</div>` : '';
                    const titleAttr = desc ? ` title="${escapeHtml(desc)}"` : '';
                    const noDescClass = desc ? '' : ' no-desc';
                    return `<span class="rt-unit-pill ${pClass}${noDescClass}"${colorStyle}${titleAttr}><span class="rt-unit-name">${escapeHtml(name)}</span>${descHtml}</span>`;
                }).join(' ');
                return `<div class="rt-entity-sub-line rt-units-container">${labelHtml} ${pillHtml}</div>`;
            }
            case 'badge_colored': {
                const bColor = rule.color || '#fff';
                return `<div class="rt-entity-sub-line">${labelHtml}<span class="rt-difficulty-badge" style="${makeColorTintStyle(bColor)}">${escapeHtmlWithColor(value)}</span></div>`;
            }
            case 'coin': {
                const cColor = rule.color || '#fff';
                const icon = rule.icon || '🪙';
                return `<div class="rt-entity-sub-line">${labelHtml}<span class="rt-coin-badge" style="${makeColorTintStyle(cColor, 0, 27)}">${icon} ${escapeHtmlWithColor(value)}</span></div>`;
            }
            case 'dice_roll': {
                // value is something like "1d20+5 = 18"
                const diceStyle = rule.color
                    ? makeColorTintStyle(rule.color)
                    : 'background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2);';
                return `<div class="rt-entity-sub-line">${labelHtml}<span class="rt-dice-roll" style="${diceStyle} padding:2px 6px; border-radius:4px; font-family:monospace; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-dice-d20" style="opacity:0.7"></i> ${escapeHtmlWithColor(value)}</span></div>`;
            }
            case 'text':
            default: {
                const textHtml = escapeHtmlWithColor(value);
                const wrapped = rule.color ? `<span style="color:${rule.color};">${textHtml}</span>` : textHtml;
                return `<div class="rt-entity-sub-line">${labelHtml} ${wrapped}</div>`;
            }
        }
    }

    export function renderHDPips(val) {
        let pipsHtml = escapeHtmlWithColor(val);
        const hm = val.match(/^([^(]+?)\s*(?:\(([\d,]+)\/([\d,]+)\))?$/);
        if (hm && hm[2] && hm[3]) {
            const cur = parseInt(hm[2].replace(/,/g, ''), 10);
            const max = parseInt(hm[3].replace(/,/g, ''), 10);
            if (max > 30) {
                pipsHtml = `<span class="rt-hd-label">[ ${escapeHtmlWithColor(hm[1].trim())} ]</span> <span class="rt-hd-text-val">(${cur}/${max})</span>`;
            } else {
                pipsHtml = `<span class="rt-hd-label">[ ${escapeHtmlWithColor(hm[1].trim())} ]</span> <span class="rt-hd-pips">${Array.from({ length: max }, (_, i) => `<span class="rt-hd-pip${i < cur ? ' rt-hd-available' : ''}"></span>`).join('')}</span>`;
            }
        }
        return `<div class="rt-entity-sub-line"><span class="rt-entity-sub-label" title="Dados de Golpe / Hit Dice (usados para recuperar vida durante Descansos Cortos)">HD:</span> <span>${pipsHtml}</span></div>`;
    }

    const SPANISH_TO_ENGLISH_SPELLS = {
        'bola de fuego': 'fireball', 'fireball': 'fireball',
        'proyectil magico': 'magic-missile', 'proyectil mágico': 'magic-missile', 'magic missile': 'magic-missile',
        'curar heridas': 'cure-wounds', 'cure wounds': 'cure-wounds',
        'manos ardientes': 'burning-hands', 'burning hands': 'burning-hands',
        'escudo': 'shield', 'shield': 'shield',
        'luz': 'light', 'light': 'light',
        'mano de mago': 'mage-hand', 'mage hand': 'mage-hand',
        'armadura de mago': 'mage-armor', 'mage armor': 'mage-armor',
        'rayo de escarcha': 'ray-of-frost', 'ray of frost': 'ray-of-frost',
        'rayo de hechiceria': 'witch-bolt', 'rayo de hechicería': 'witch-bolt', 'witch bolt': 'witch-bolt',
        'rayo abrasador': 'scorching-ray', 'scorching ray': 'scorching-ray',
        'paso brumoso': 'misty-step', 'misty step': 'misty-step',
        'invisibilidad': 'invisibility', 'invisibility': 'invisibility',
        'volar': 'fly', 'fly': 'fly',
        'sugerencia': 'suggestion', 'suggestion': 'suggestion',
        'contrahechizo': 'counterspell', 'counterspell': 'counterspell',
        'disipar magia': 'dispel-magic', 'dispel magic': 'dispel-magic',
        'relampago': 'lightning-bolt', 'relámpago': 'lightning-bolt', 'lightning bolt': 'lightning-bolt',
        'patron hipnotico': 'hypnotic-pattern', 'patrón hipnótico': 'hypnotic-pattern', 'hypnotic pattern': 'hypnotic-pattern',
        'muro de fuego': 'wall-of-fire', 'wall of fire': 'wall-of-fire',
        'polimorfia': 'polymorph', 'polymorph': 'polymorph',
        'cono de frio': 'cone-of-cold', 'cono de frío': 'cone-of-cold', 'cone of cold': 'cone-of-cold',
        'palabra de curacion': 'healing-word', 'palabra de curación': 'healing-word', 'healing word': 'healing-word',
        'truco de la cuerda': 'rope-trick', 'rope trick': 'rope-trick',
        'descarga de fuego': 'fire-bolt', 'fire bolt': 'fire-bolt',
        'agarre electrizante': 'shocking-grasp', 'shocking grasp': 'shocking-grasp',
        'ilusion menor': 'minor-illusion', 'ilusión menor': 'minor-illusion', 'minor illusion': 'minor-illusion',
        'prestidigitacion': 'prestidigitation', 'prestidigitación': 'prestidigitation', 'prestidigitation': 'prestidigitation',
        'orientacion': 'guidance', 'orientación': 'guidance', 'guidance': 'guidance',
        'llama sagrada': 'sacred-flame', 'sacred flame': 'sacred-flame',
        'pista de la bruja': 'hex', 'hex': 'hex',
        'marca del cazador': 'hunters-mark', 'hunters mark': 'hunters-mark',
        'identificar': 'identify', 'identify': 'identify',
        'grasa': 'grease', 'grease': 'grease',
        'dormir': 'sleep', 'sleep': 'sleep',
        'caida de pluma': 'feather-fall', 'caída de pluma': 'feather-fall', 'feather fall': 'feather-fall',
        'detectar magia': 'detect-magic', 'detect magic': 'detect-magic',
        'orbe cromatico': 'chromatic-orb', 'orbe cromático': 'chromatic-orb', 'chromatic orb': 'chromatic-orb'
    };

    function resolveSpellUrl(name) {
        const normalized = name.toLowerCase().trim();
        if (SPANISH_TO_ENGLISH_SPELLS[normalized]) {
            return `https://dnd5e.wikidot.com/spell:${SPANISH_TO_ENGLISH_SPELLS[normalized]}`;
        }
        const noAccents = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (SPANISH_TO_ENGLISH_SPELLS[noAccents]) {
            return `https://dnd5e.wikidot.com/spell:${SPANISH_TO_ENGLISH_SPELLS[noAccents]}`;
        }
        // Custom homebrew spell created by AI / user: fallback to Google D&D 5e search to prevent 404
        return `https://www.google.com/search?q=dnd+5e+spell+${encodeURIComponent(name)}`;
    }

    export function renderSpellGroups(val) {
        const cleanVal = val.replace(/^(?:Spells:|Conjuros:|Hechizos:)\s*/i, '');
        const isCompound = /\|/.test(cleanVal) && /(?:Level\s*\d+|Cantrips?|Nivel\s*\d+|Trucos?)/i.test(cleanVal);
        const groups = isCompound ? cleanVal.split(/\s*\|\s*/) : [cleanVal];
        let html = '';
        for (const group of groups) {
            const groupText = group.trim().replace(/^(?:Spells:|Conjuros:|Hechizos:)\s*/i, '');
            const m = groupText.match(/^(Level\s*\d+|Cantrips?|Nivel\s*\d+|Trucos?)\s*(?:\((\d+)\/(\d+)[^)]*\))?\s*(?::\s*(.+))?$/i);
            if (!m) continue;
            const [, lbl, availStr, maxStr, spellList] = m;
            const isCantrip = /cantrip|truco/i.test(lbl);
            let pipsHtml = '';
            if (!isCantrip && availStr !== undefined && maxStr !== undefined) {
                const avail = parseInt(availStr, 10), maxSlots = parseInt(maxStr, 10);
                if (maxSlots > 30) {
                    pipsHtml = `<span class="rt-slot-text">(${avail}/${maxSlots})</span>`;
                } else {
                    pipsHtml = `<span class="rt-slot-pips">${Array.from({ length: maxSlots }, (_, i) =>
                        `<span class="rt-slot-pip${i < avail ? ' rt-slot-available' : ' rt-slot-used'}"></span>`).join('')}</span>`;
                }
            }
            let spellsHtml = '';
            if (spellList) {
                spellsHtml = spellList.split(',').map(s => {
                    const name = s.trim();
                    const url = resolveSpellUrl(name);
                    return `<a href="${url}" target="_blank" class="rt-spell-name" title="Ver hechizo">${escapeHtmlWithColor(name)}</a>`;
                }).join('');
            }
            html += `<div class="rt-spell-row"><span class="rt-spell-level">${escapeHtmlWithColor(lbl.trim())}</span><div class="rt-spell-inline-group"><div class="rt-spell-list">${pipsHtml}${spellsHtml}</div></div></div>`;
        }
        // Party/CHARACTER style matched — return leveled rows.
        if (html) return html;
        // Combat / flat list: Spells: Ray of Sickness (2/2), Fire Bolt (at will) → blue magic pills.
        return `<div class="rt-entity-sub-line rt-units-container"><span class="rt-entity-sub-label">Spells:</span> ${renderPillsAsMagic(val)}</div>`;
    }

    /** Like renderPills, but always uses the blue magic pill style (combat caster spells). */
    const renderPillsAsMagic = (text) => {
        return splitSmart(text).map(t => {
            let displayText = t;
            if (t.startsWith('(+)') || t.startsWith('(+) ')) {
                displayText = t.replace(/^\(\+\)\s*/, '');
            } else if (t.startsWith('(-)') || t.startsWith('(-) ')) {
                displayText = t.replace(/^\(-\)\s*/, '');
            }

            const m = displayText.match(/^(.+?)\s*\((.+)\)$/);
            if (m) {
                const [, name, desc] = m;
                let iconHtml = '';
                const resourceMatch = desc.match(/(\d+)\s*\/\s*(\d+)/);
                if (resourceMatch) {
                    iconHtml = `<span class="rt-unit-icon">${escapeHtmlWithColor(resourceMatch[0])}</span>`;
                }
                return `<span class="rt-unit-pill rt-pill-magic">
                    <span class="rt-unit-name">${escapeHtmlWithColor(name)}</span>
                    ${iconHtml}
                    <span class="rt-unit-descr">(${escapeHtmlWithColor(desc)})</span>
                </span>`;
            }
            return `<span class="rt-unit-pill rt-pill-magic no-desc"><span class="rt-unit-name">${escapeHtmlWithColor(displayText)}</span></span>`;
        }).join('');
    };


    // Shared marker type map used by tokenizeMarkers and tryRenderMarker.
    export const MARKER_TYPE_MAP = {
        PILLS:{ renderType: 'pills', example: 'Status (Hover for details), Condition (Another detail)' }, PLS:{ renderType: 'pills', example: 'Status (Hover for details)', aliasOf: 'PILLS' },
        PILL:{ renderType: 'pill_colored', example: 'Status (Single colored pill)' },
        BAR:{ renderType: 'hp_bar', example: '50/100 (Colored resource bar)' }, B:{ renderType: 'hp_bar', example: '50/100 (Colored resource bar)', aliasOf: 'BAR' }, HPBAR:{ renderType: 'hp_bar', example: '50/100 (Red HP/Standing)', aliasOf: 'BAR' }, HPB:{ renderType: 'hp_bar', example: '50/100 (Red HP/Standing)', aliasOf: 'BAR' }, HP: { renderType: 'hp_bar', example: '50/100 (Red HP/Standing)', aliasOf: 'BAR' },
        BARREL:{ renderType: 'barrel', example: 'Trust: -38/150 (signed centre-zero bar; click each side to recolor)' },
        NPC:{ renderType: 'npc', example: 'Gandolf: (freeform NPC card; uses a matching Lorebook Agent portrait)' },
        XPBAR:{ renderType: 'xp_bar', example: '450/1000 Level 3 (XP/Progress)' }, XB:{ renderType: 'xp_bar', example: '450/1000 Level 3 (XP/Progress)', aliasOf: 'XPBAR' },
        TEXT:{ renderType: 'text', example: 'Some text (Plain)' },
        BADGE:{ renderType: 'badge', example: 'Neutral (Reputation badge)' }, BDG:{ renderType: 'badge', example: 'Neutral (Reputation badge)', aliasOf: 'BADGE' },
        HIGHLIGHT:{ renderType: 'highlight', example: 'Emphasis (Bright highlight text)' }, HGT:{ renderType: 'highlight', example: 'Emphasis (Bright highlight text)', aliasOf: 'HIGHLIGHT' },
        OBJ:{ renderType: 'objective', example: '✓ Done (Checked quest bullet)' },
        REWARD:{ renderType: 'reward', example: '500 XP (Loot reward badge)' },
        DIFFICULTY:{ renderType: 'difficulty', example: 'Hard (Difficulty star badge)' },
        PROGRESS:{ renderType: 'progress', example: '3/5 (Fraction progress)' },
        WARNING:{ renderType: 'badge_colored', color: '#f1c40f', example: 'Caution (Amber badge)' },
        DANGER:{ renderType: 'badge_colored', color: '#e74c3c', example: 'Hostile (Red badge)' },
        SUCCESS:{ renderType: 'badge_colored', color: '#2ecc71', example: 'Active (Green badge)' },
        INFO:{ renderType: 'badge_colored', color: '#3498db', example: 'Role (Blue badge)' },
        GOLD:{ renderType: 'coin', color: '#ffd700', icon: '💰', example: '150 (Gold coins)' },
        SILVER:{ renderType: 'coin', color: '#c0c0c0', icon: '🪙', example: '45 (Silver coins)' },
        BRONZE:{ renderType: 'coin', color: '#cd7f32', icon: '🪙', example: '12 (Bronze coins)' },
        DOLLAR:{ renderType: 'coin', color: '#85bb65', icon: '💵', example: '500 (Paper cash)' },
        HEART:{ renderType: 'coin', color: '#ff4466', icon: '❤️', example: '3 (Lives/Hearts)' },
        SKULL:{ renderType: 'coin', color: '#aaaaaa', icon: '💀', example: '12 (Kills/Deaths)' },
        SOUL:{ renderType: 'coin', color: '#aa88ff', icon: '👻', example: '42 (Souls)' },
        ROLL:{ renderType: 'dice_roll', example: '1d20+5 = 18 (Dice roll badge)' },
        CLOCK:{ renderType: 'clock', example: '4/8 (Guard Alertness)' },
        STARS:{ renderType: 'stars', example: '3/5 (Merchant Favor)' },
        WEIGHT:{ renderType: 'weight', example: '45/50 lbs (Encumbered)' },
        CAPACITY:{ renderType: 'weight', example: '45/50 lbs (Encumbered)', aliasOf: 'WEIGHT' },
        WEATHER:{ renderType: 'weather', example: 'Heavy Rain (Poor Visibility)' },
        ORBS:{ renderType: 'orbs', example: '3/5 (Ki Points)' },
        AP:{ renderType: 'orbs', example: '3/5 (Ki Points)', aliasOf: 'ORBS' },
        SLOTS:{ renderType: 'slots', example: '4/10 (Backpack)' },
        PHASE:{ renderType: 'phase', example: '2/4 (Ritual Summoning)' },
        STEP:{ renderType: 'phase', example: '2/4 (Ritual Summoning)', aliasOf: 'PHASE' },
        GAUGE:{ renderType: 'gauge', example: '75/100 (Party Morale)' },
        METER:{ renderType: 'gauge', example: '75/100 (Party Morale)', aliasOf: 'GAUGE' },
        CHARGE:{ renderType: 'charge', example: '2/5 (Wand of Fireballs)' },
        BATTERY:{ renderType: 'charge', example: '2/5 (Wand of Fireballs)', aliasOf: 'CHARGE' }
    };

    /** Canonical marker keys for UI library / AI hints (excludes shorthand aliases). */
    export function getMarkerLibraryKeys() {
        return Object.keys(MARKER_TYPE_MAP).filter(k => !MARKER_TYPE_MAP[k].aliasOf);
    }

    // Regex that matches the NEXT ((MARKER)) token anywhere in a string.
    // Any base marker can take a named CSS color directly as a suffix
    // (`((PILLPINK))`, `((BARRED))`) or a delimited color override
    // (`((PILL - rebeccapurple))`, `((BAR - #ff6699))`).
    const HEX_COLOR_PATTERN = '#[0-9a-fA-F]{6}';
    const NAMED_COLOR_PATTERN = '[a-zA-Z]+';
    const MARKER_COLOR_PATTERN = `(?:${HEX_COLOR_PATTERN}|${NAMED_COLOR_PATTERN})`;
    const MARKER_BASE_PATTERN = Object.keys(MARKER_TYPE_MAP).sort((a, b) => b.length - a.length).join('|');
    export const MARKER_TOKEN_RE = new RegExp(`\\(\\((${MARKER_BASE_PATTERN})(?:(${NAMED_COLOR_PATTERN}))?(?:\\s*-\\s*(${MARKER_COLOR_PATTERN})(?:\\s+(${MARKER_COLOR_PATTERN}))?)?\\)\\)`, 'i');

    /** Render types whose default color is already a gradient/gradient-friendly bar fill. */
    const GRADIENT_CAPABLE_RENDER_TYPES = new Set(['hp_bar', 'xp_bar', 'progress']);

    /** Strictly validates an allowed CSS color token to prevent CSS injection. */
    function isValidMarkerColor(str) {
        return /^#[0-9a-fA-F]{6}$/.test(str || '') || /^[a-zA-Z]+$/.test(str || '');
    }

    /**
     * Clones `baseRule` with `color` overridden from a parsed marker color suffix.
     * Two valid colors on a gradient-capable render type (bars/progress) produce a
     * linear-gradient. BARREL assigns them to its positive and negative sides;
     * otherwise only the first color is used (second is ignored).
     * Invalid hex values are ignored entirely, falling back to the base rule's color.
     */
    function applyMarkerColorOverride(baseRule, color1, color2) {
        if (!isValidMarkerColor(color1)) return baseRule;
        const rule = { ...baseRule };
        if (rule.renderType === 'barrel') {
            rule.positiveColor = color1;
            rule.negativeColor = color2 && isValidMarkerColor(color2) ? color2 : color1;
        } else if (color2 && isValidMarkerColor(color2) && GRADIENT_CAPABLE_RENDER_TYPES.has(rule.renderType)) {
            rule.color = `linear-gradient(90deg, ${color1}, ${color2})`;
        } else {
            rule.color = color1;
        }
        return rule;
    }

    /**
     * Splits `line` into an ordered array of segments wherever a ((MARKER))
     * token appears.  Each segment is:
     *   { preText: string, markerType: string, rule: object }
     * where `preText` is the text between the previous marker's end (or the
     * start of the line) and this marker, and the segment's "content" is
     * everything from after this marker up to the next marker (resolved by
     * the caller when building the reconstructed line).
     *
     * Returns [] if no markers are found in the line.
     */
    function tokenizeMarkers(line) {
        const segments = [];
        let remaining = line;

        while (true) {
            const m = MARKER_TOKEN_RE.exec(remaining);
            if (!m) break;

            let preText = remaining.slice(0, m.index).trim();
            preText = preText.replace(/^[-*+•–—]\s*/, '').trim();
            const markerType = m[1].toUpperCase();
            const colorSuffix = m[2] || null;
            const colorArg1 = m[3] || null;
            const colorArg2 = m[4] || null;
            remaining = remaining.slice(m.index + m[0].length).trimStart();

            const baseRule = MARKER_TYPE_MAP[markerType] || { renderType: 'text' };
            const rule = colorArg1
                ? applyMarkerColorOverride(baseRule, colorArg1, colorArg2)
                : colorSuffix
                    ? applyMarkerColorOverride(baseRule, colorSuffix)
                    : baseRule;

            segments.push({ preText, markerType, rule });
        }

        // A numeric tab stop can appear immediately before any marker, including
        // the first one: `|50 ((PILLS)) Affection tier`. It is interpreted as a
        // percentage of the available row width and removed from display content.
        for (const segment of segments) {
            const tabMatch = segment.preText.match(/^(.*?)\s*\|(\d+(?:\.\d+)?)\s*$/);
            if (tabMatch) {
                segment.preText = tabMatch[1].trim();
                segment.tabStop = Math.max(0, Math.min(100, Number(tabMatch[2])));
            }
        }

        // Assign each segment its content:
        //   segment[i].content = segment[i+1].preText  (text between marker i and marker i+1)
        //   segment[last].content = remaining tail after the last marker
        // IMPORTANT: once a preText is consumed as content for segment[i], clear it on
        // segment[i+1] so renderMarkerSegment doesn't double-prepend it as a label.
        for (let i = 0; i < segments.length; i++) {
            if (i < segments.length - 1) {
                // `||` is an explicit layout separator, not part of either marker's content.
                segments[i].content = segments[i + 1].preText.replace(/\s*\|\|\s*$/, '').trim();
                segments[i + 1].preText = ''; // consumed — don't re-use as label
            } else {
                segments[i].content = remaining.trim();
            }
        }

        return segments;
    }

    /**
     * Calculates marker starts/ends for numeric tab-stop rows. Unspecified
     * segments are evenly distributed between the nearest explicit stops.
     * @returns {Array<{start: number, end: number}>}
     */
    function resolveMarkerTabStops(segments) {
        const count = segments.length;
        const starts = Array(count);
        starts[0] = segments[0].tabStop ?? 0;
        let previous = 0;

        for (let i = 1; i < count; i++) {
            if (segments[i].tabStop === undefined) continue;
            const next = segments[i].tabStop;
            const previousStart = starts[previous];
            for (let j = previous + 1; j < i; j++) {
                starts[j] = previousStart + ((next - previousStart) * (j - previous)) / (i - previous);
            }
            starts[i] = next;
            previous = i;
        }

        const previousStart = starts[previous];
        for (let i = previous + 1; i < count; i++) {
            starts[i] = previousStart + ((100 - previousStart) * (i - previous)) / (count - previous);
        }

        return starts.map((rawStart, i) => {
            const start = Math.max(0, Math.min(99.9, rawStart));
            const nextStart = i < count - 1 ? starts[i + 1] : 100;
            const end = Math.max(start + 0.1, Math.min(100, nextStart));
            return { start, end };
        });
    }

    /**
     * Renders one tokenized marker segment into HTML via renderSubFieldByRule.
     * `preText` becomes the label prefix; `content` is the value portion.
     * `rowContext` is an optional string from sibling segments on the same
     * multi-marker row — appended to barId so two bars with the same label on
     * different rows (e.g. two "Charges" bars) get distinct color identities.
     */
    function renderMarkerSegment(seg, tag, entityName, rowContext = '') {
        const { preText, content, rule } = seg;

        // renderSubFieldByRule splits on the first colon to separate label from value.
        // We must reconstruct the line so that split works correctly for every placement
        // of the ((MARKER)) token:
        //
        //   Marker-at-start:  ((GAUGE)) 75/100              → preText="", content="75/100"
        //   Marker-in-middle: [Epic] Sword - ((GAUGE)) 75/100 → preText="[Epic] Sword -", content="75/100"
        //   Marker-at-end:    [Epic] Sword - Durability 75/100 ((GAUGE)) → preText="[Epic] Sword - Durability 75/100", content=""
        //   With colon:       Durability: ((GAUGE)) 75/100   → preText="Durability:", content="75/100"
        const cleanPre = (preText || '').replace(/^[-*+•–—]\s*/, '').trim();
        let reconstructedContent;
        if (!cleanPre) {
            // ── Marker at start of line — content is everything ──
            reconstructedContent = content.trim();
        } else if (content.trim()) {
            // ── Marker in middle — text on both sides ──
            if (cleanPre.includes(':')) {
                // cleanPre already has colon structure (e.g. "Durability: ((GAUGE)) 75/100")
                reconstructedContent = `${cleanPre} ${content}`.trim();
            } else if (content.includes(':')) {
                // content already has colon structure (e.g. "((BAR)) Health: 50/100")
                reconstructedContent = `${cleanPre} ${content}`.trim();
            } else {
                // No colon — synthesize one so cleanPre becomes the label
                reconstructedContent = `${cleanPre}: ${content}`.trim();
            }
        } else {
            // ── Marker at end of line — content is empty, everything is in cleanPre ──
            if (cleanPre.includes(':')) {
                // Already has colon structure (e.g. "Durability: 75/100 ((GAUGE))")
                reconstructedContent = cleanPre.trim();
            } else {
                // No colon. For progression types, try to split "Label X/Y" into "Label: X/Y"
                // by finding the X/Y numeric pattern.
                const PROGRESSION = new Set(['barrel', 'hp_bar', 'xp_bar', 'progress', 'clock', 'stars', 'weight', 'orbs', 'slots', 'phase', 'gauge', 'charge']);
                const numMatch = PROGRESSION.has(rule.renderType)
                    ? cleanPre.match(/^(.*?)\s+(\d[\d,]*\s*\/\s*\d[\d,]*.*)$/)
                    : null;
                if (numMatch && numMatch[1].trim()) {
                    reconstructedContent = `${numMatch[1].trim()}: ${numMatch[2].trim()}`;
                } else {
                    reconstructedContent = cleanPre.trim();
                }
            }
        }

        let barId = null;
        const progressionTypes = ['barrel', 'hp_bar', 'xp_bar', 'progress', 'clock', 'stars', 'weight', 'orbs', 'slots', 'phase', 'gauge', 'charge'];
        if (progressionTypes.includes(rule.renderType)) {
            const colonIdx = reconstructedContent.indexOf(':');
            const labelText = colonIdx !== -1 ? reconstructedContent.substring(0, colonIdx).trim() : 'Bar';
            // Include rowContext so that identical labels on different multi-marker rows
            // produce distinct barIds (e.g. "Charges" beside "Fireball" vs "Charges" beside "Ice Storm").
            const ctxSuffix = rowContext ? `[${rowContext}]` : '';
            barId = `${tag}:${entityName}:${labelText}${ctxSuffix}`;
        }

        return renderSubFieldByRule(rule, reconstructedContent, barId, {
            customMarker: rule.renderType === 'hp_bar' || rule.renderType === 'barrel',
        });
    }


    /**
     * If `line` contains one or more ((MARKER)) tokens, renders it and returns HTML.
     *
     * • Single marker  → same output as before (one wrapped <div>).
     * • Multiple markers → each segment is rendered independently and all are
     *   placed side-by-side inside a <div class="rt-multi-marker-row"> flex row,
     *   with the ((TAG)) token acting as the implicit column separator.
     *
     * Returns null if no marker is present, so callers can fall through to
     * their own renderer. This makes markers work in ALL stock blocks.
     *
     * Example (two columns on one line):
     *   Spells: ((PLS)) Fireball, Magic Missile ((BAR)) Charges: 3/5
     *
     * `lineIdx` is the line's position within its block. It's only used as a
     * barId disambiguator when there's no `entityName` to anchor to (i.e. custom
     * [TAG] blocks and other non-entity blocks) — without it, several unrelated
     * lines that happen to share a label (or have no label at all, defaulting to
     * "Bar") would collapse onto the same barId and recolor together.
     */
    export function tryRenderMarker(line, tag = '', entityName = '', lineIdx = null) {
        const segments = tokenizeMarkers(line);
        if (segments.length === 0) return null;
        const usesExplicitColumns = line.includes('||');
        const usesTabStops = segments.some(segment => segment.tabStop !== undefined);
        const compactPillRow = segments.length > 1 && segments.every(segment =>
            ['pills', 'pill_colored', 'badge', 'badge_colored'].includes(segment.rule.renderType));

        const lineAnchor = (!entityName && lineIdx !== null) ? `L${lineIdx}` : '';

        if (segments.length === 1 && !usesTabStops) {
            // Single-marker fast path — identical to the previous behaviour.
            return renderMarkerSegment(segments[0], tag, entityName, lineAnchor);
        }

        // Multi-marker: render each segment and wrap it in a typed cell.
        // Stretchy render types (bars, progress) get flex:1 so they fill remaining
        // space; fixed types (pills, badges, text) take only their natural width.
        const STRETCH_TYPES = new Set(['barrel', 'hp_bar', 'xp_bar', 'progress']);
        const tabStops = usesTabStops ? resolveMarkerTabStops(segments) : null;

        // Pre-compute each segment's reconstructed text so we can use sibling content
        // as rowContext to disambiguate same-label bars across different rows.
        const segContents = segments.map(s => (s.preText ? `${s.preText} ${s.content}` : s.content).trim());

        const childrenHtml = segments.map((seg, i) => {
            // rowContext = sibling's content + this segment's index (+ line anchor).
            // The sibling content disambiguates bars across different rows;
            // the index disambiguates multiple identical bars on the SAME row;
            // the line anchor disambiguates across different lines with no entity context.
            const rowContext = `${segContents[i === 0 ? 1 : 0] ?? ''}:${i}${lineAnchor ? ':' + lineAnchor : ''}`;
            const html = renderMarkerSegment(seg, tag, entityName, rowContext);
            const cellClass = usesTabStops
                ? 'rt-mmc-cell rt-mmc-cell--tab-stop'
                : usesExplicitColumns
                ? 'rt-mmc-cell rt-mmc-cell--column'
                : STRETCH_TYPES.has(seg.rule.renderType)
                ? 'rt-mmc-cell rt-mmc-cell--stretch'
                : 'rt-mmc-cell';
            const layoutStyle = usesTabStops
                ? ` style="grid-column:${Math.round(tabStops[i].start * 10) + 1} / ${Math.round(tabStops[i].end * 10) + 1};grid-row:1;"`
                : '';
            return `<div class="${cellClass}"${layoutStyle}>${html}</div>`;
        }).join('');

        return `<div class="rt-multi-marker-row${usesTabStops ? ' rt-multi-marker-row--tab-stops' : usesExplicitColumns ? ' rt-multi-marker-row--columns' : ''}${compactPillRow ? ' rt-multi-marker-row--compact-pills' : ''}">${childrenHtml}</div>`;
    }

    export function renderLineInEntityContext(tag, line, entityName, rawLine) {
        // 1. Try marker first
        const asMarker = tryRenderMarker(rawLine, tag, entityName);
        if (asMarker) return asMarker;

        const ll = line.toLowerCase();
        const colonIdx = line.indexOf(':');

        // 2. Try known stock keywords
        for (const [key, ruleType] of Object.entries(STOCK_FIELD_RULES)) {
            if (ll.startsWith(key + ':') || ll === key) {
                const val = colonIdx !== -1 ? line.substring(colonIdx + 1).trim() : '';
                if (ruleType === 'hd_pips') return renderHDPips(val);
                if (ruleType === 'spell_group') return renderSpellGroups(val);
                return renderSubFieldByRule({ renderType: ruleType }, line);
            }
        }

        // 3. Fallback: unknown KV pair or plain line (always attached to entity if we are here)
        if (colonIdx !== -1) {
            return renderSubFieldByRule({ renderType: 'highlight' }, line);
        }
        return `<div class="rt-entity-sub-line">${escapeHtmlWithColor(line)}</div>`;
    }

    /**
     * Renders a single line from a custom block (non-built-in tag).
     */
    export function renderCustomBlockLine(tag, line, lineIdx = 0) {
        const asMarker = tryRenderMarker(line, tag, '', lineIdx);
        if (asMarker !== null) return asMarker;

        // Plain kv fallback
        const kv = line.match(/^([^:]+):\s*(.+)$/);
        if (kv) return `<div class="rt-card-kv"><span class="rt-card-key">${escapeHtmlWithColor(kv[1].trim())}:</span><span class="rt-card-val">${escapeHtmlWithColor(kv[2].trim())}</span></div>`;
        return `<div class="rt-card-item rt-card-item--plain">${escapeHtmlWithColor(line.trim())}</div>`;
    }

    /**
     * Renders freeform NPC cards embedded in any tracker block.
     * A `((NPC)) Name:` line starts a card; all following lines belong to it
     * until the next NPC marker, and can use arbitrary labels and render tags.
     */
    function renderCustomBlockWithNpcMarkers(tag, lines) {
        const results = [];
        let lastEntityIdx = -1;
        let currentEntity = '';

        for (let idx = 0; idx < lines.length; idx++) {
            const rawLine = lines[idx];
            const marker = MARKER_TOKEN_RE.exec(rawLine);
            const isNpcMarker = marker?.index === 0 && marker[1].toUpperCase() === 'NPC';

            if (isNpcMarker) {
                currentEntity = rawLine.slice(marker[0].length).trim().replace(/:\s*$/, '').trim() || 'NPC';
                lastEntityIdx = results.length;
                results.push(`<div class="rt-entity-row"><div class="rt-entity-name">${escapeHtmlWithColor(currentEntity)}</div></div>`);
                continue;
            }

            if (lastEntityIdx !== -1) {
                results[lastEntityIdx] += renderLineInEntityContext(tag, rawLine, currentEntity, rawLine);
            } else {
                results.push(renderCustomBlockLine(tag, rawLine, idx));
            }
        }

        return results.map(html => {
            if (!html.startsWith('<div class="rt-entity-row">')) return html;
            const nameMatch = html.match(/class="rt-entity-name"[^>]*>([^<]+)</);
            return nameMatch ? wrapEntityHtml(decodeHtml(nameMatch[1].trim()), html) : html;
        });
    }

    /**
     * Strip HTML tags from a memo string, preserving inner text.
     * Used before sending the memo to the AI to avoid token bloat from
     * color markup (<font>, <span>, etc.) that is purely for display.
     * NOTE: ((MARKERS)) like ((PILLS)), ((BAR)), etc. are intentionally
     * preserved so the AI can faithfully echo them back in its output.
     */
    export function stripMemoHtml(text) {
        if (!text) return text;
        // Convert <br> variants to newlines so line structure is preserved
        let stripped = text.replace(/<br\s*\/?>/gi, '\n');
        // Remove all HTML tags, keeping their inner text
        stripped = stripped.replace(/<[^>]+>/g, '');
        return stripped;
    }

    /**
     * Like escapeHtml but allows <font color="#hex"> and <font color="name"> tags through,
     * converting them to safe <span style="color:"> elements.
     * Use this for all AI/user content rendered into tracker cards.
     */
    export function escapeHtmlWithColor(str) {
        if (!str) return '';

        // Rarity tag map (WoW-style item quality)
        const RARITY_COLORS = {
            'poor': '#9d9d9d',
            'common': '#ffffff',
            'uncommon': '#1eff00',
            'rare': '#0070dd',
            'epic': '#a335ee',
            'legendary': '#ff8000',
            'artifact': '#e6cc80',
            'heirloom': '#00ccff'
        };

        // Shared placeholder system — placeholders survive escapeHtml unchanged
        const OPEN = '\x01';
        const CLOSE = '\x02';
        const spans = [];

        // 1. Process [Rarity] tags. They hide the tag and color everything that follows them.
        const rarityRx = /\[(poor|common|uncommon|rare|epic|legendary|artifact|heirloom)\]\s*([\s\S]*)/gi;
        let processed = str.replace(rarityRx, (match, rarity, rest) => {
            const color = RARITY_COLORS[rarity.toLowerCase()];
            // Recursively process 'rest' for any font tags, but skip rarity tags (already handled)
            const safeInner = escapeHtmlWithColor(rest);
            spans.push(`<span style="color:${color}">${safeInner}</span>`);
            return OPEN + (spans.length - 1) + CLOSE;
        });

        // 2. Replace <font color=...>inner</font> tags (author-written color markup).
        //    The inner text is recursively processed so nested tags work correctly.
        const colorRx = /<font\s+color\s*=\s*["']?(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)["']?>([\s\S]*?)<\/font>/gi;
        const tokenized = processed.replace(colorRx, (_, color, inner) => {
            // inner may contain more font tags but NOT rarity tags (already replaced above)
            const safeInner = escapeHtmlWithColor(inner);
            spans.push(`<span style="color:${color}">${safeInner}</span>`);
            return OPEN + (spans.length - 1) + CLOSE;
        });

        // 3. Escape everything that remains, then restore the safe span placeholders.
        return escapeHtml(tokenized).replace(/\x01(\d+)\x02/g, (_, i) => spans[parseInt(i)]);
    }

    const splitSmart = (text) => {
        const res = [];
        let cur = '', depth = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '(') depth++; else if (c === ')') depth--;
            // Do not split on comma if it is between two digits (thousands separator)
            const isDigitSeparator = c === ',' && i > 0 && i < text.length - 1 && /\d/.test(text[i - 1]) && /\d/.test(text[i + 1]);
            if (c === ',' && depth === 0 && !isDigitSeparator) { res.push(cur.trim()); cur = ''; }
            else cur += c;
        }
        if (cur.trim()) res.push(cur.trim());
        return res;
    };

    const renderPills = (text, customColor = null) => {
        const colorStyle = customColor ? ` style="${makeColorTintStyle(customColor)}"` : '';
        return splitSmart(text).map(t => {
            // Detect buff/debuff prefix
            let pillClass = 'rt-unit-pill';
            let displayText = t;
            if (t.startsWith('(+)') || t.startsWith('(+) ')) {
                pillClass += ' rt-pill-buff';
                displayText = t.replace(/^\(\+\)\s*/, '');
            } else if (t.startsWith('(-)') || t.startsWith('(-) ')) {
                pillClass += ' rt-pill-debuff';
                displayText = t.replace(/^\(-\)\s*/, '');
            }

            const m = displayText.match(/^(.+?)\s*\((.+)\)$/);
            if (m) {
                const [, name, desc] = m;

                // Extract resource count if present (e.g., "2/3")
                let iconHtml = '';
                const resourceMatch = desc.match(/(\d+)\s*\/\s*(\d+)/);
                if (resourceMatch) {
                    iconHtml = `<span class="rt-unit-icon">${escapeHtmlWithColor(resourceMatch[0])}</span>`;
                }

                return `<span class="${pillClass}"${colorStyle}>
                    <span class="rt-unit-name">${escapeHtmlWithColor(name)}</span>
                    ${iconHtml}
                    <span class="rt-unit-descr">(${escapeHtmlWithColor(desc)})</span>
                </span>`;
            }
            return `<span class="${pillClass} no-desc"${colorStyle}><span class="rt-unit-name">${escapeHtmlWithColor(displayText)}</span></span>`;
        }).join('');
    };

    /**
     * Renders a single ability line as a structured pill.
     * Splits on the FIRST colon only: everything before is the "name"
     * (may include a resource annotation like "Rage (2/2 per day)"),
     * everything after is the description.  This intentionally does NOT
     * split on commas inside the description (unlike renderPills/splitSmart),
     * so ability text like "Resistance to bludgeoning, piercing, slashing"
     * stays as one contiguous pill description instead of being shattered
     * into multiple pills.
     */
    const renderAbilityLine = (text) => {
        let pillClass = 'rt-unit-pill';
        let displayText = text.trim();

        // Strip buff/debuff prefix markers
        if (displayText.startsWith('(+)') || displayText.startsWith('(+) ')) {
            pillClass += ' rt-pill-buff';
            displayText = displayText.replace(/^\(\+\)\s*/, '');
        } else if (displayText.startsWith('(-)') || displayText.startsWith('(-) ')) {
            pillClass += ' rt-pill-debuff';
            displayText = displayText.replace(/^\(-\)\s*/, '');
        }

        const colonIdx = displayText.indexOf(':');
        const cleanTextForParen = displayText.replace(/\.$/, '').trim();
        const parenMatch = cleanTextForParen.match(/^(.+?)\s*\((.+)\)$/);

        let namePart = '';
        let descPart = '';

        if (colonIdx !== -1) {
            namePart = displayText.substring(0, colonIdx).trim();
            descPart = displayText.substring(colonIdx + 1).trim();
        } else if (parenMatch) {
            namePart = parenMatch[1].trim();
            descPart = parenMatch[2].trim();
            if (!descPart.endsWith('.')) descPart += '.';
        }

        if (namePart && descPart) {
            let iconHtml = '';
            const resourceMatch = namePart.match(/(\d+)\s*\/\s*(\d+)/);
            if (resourceMatch) {
                iconHtml = `<span class="rt-unit-icon">${escapeHtmlWithColor(resourceMatch[0])}</span>`;
            }
            return `<div class="rt-entity-sub-line rt-units-container"><span class="${pillClass}">
                <span class="rt-unit-name">${escapeHtmlWithColor(namePart)}</span>
                ${iconHtml}
                <span class="rt-unit-descr">(${escapeHtmlWithColor(descPart)})</span>
            </span></div>`;
        }

        // Fall back to a simple no-description pill
        return `<div class="rt-entity-sub-line rt-units-container"><span class="${pillClass} no-desc"><span class="rt-unit-name">${escapeHtmlWithColor(displayText)}</span></span></div>`;
    };


    /**
     * 'BENCHED PARTY' is never rendered as its own section/tab — it's folded into PARTY's
     * own card as a compact camp roster sub-panel (see renderBenchedPartyPanel). It has its
     * own enable toggle + editable prompt (settings.modules['benched party']) but is
     * deliberately NOT in BLOCK_ORDER (constants.js), since BLOCK_ORDER also drives render
     * order here — without stripping it explicitly, it'd fall into the "unlisted tag"
     * fallback below and render as a standalone card. blocks['BENCHED PARTY'] itself is
     * untouched by this — renderSectionCard reads it directly to build the nested panel.
     */
    function stripBenchedPartyTag(tags) {
        return tags.filter(t => t !== 'BENCHED PARTY');
    }

    /**
     * When [BENCHED PARTY] has members but [PARTY] was removed/emptied (everyone benched),
     * synthesize an empty PARTY shell so the PARTY card still renders and hosts the camp
     * roster sub-panel. Only when the benched-party module is enabled.
     * @param {object} blocks
     * @returns {object}
     */
    function ensurePartyShellForBenchedRoster(blocks) {
        const s = getSettings();
        if (s.modules?.['benched party'] === false || s.modules?.party === false) return blocks;

        const benched = blocks['BENCHED PARTY'];
        if (!benched || /^(?:REMOVED|EXPIRED|CLEARED|NONE)$/i.test(benched.trim())) return blocks;

        const party = blocks['PARTY'];
        const partyMissing = party === undefined
            || !String(party).trim()
            || /^(?:REMOVED|EXPIRED|CLEARED|NONE)$/i.test(String(party).trim());

        if (partyMissing) {
            blocks['PARTY'] = '';
        }
        return blocks;
    }

    /**
     * Parse the memo's [TAG]...[/TAG] blocks and return structured object.
     */
    export function parseMemoBlocks(memo) {
        const blocks = {};
        const pattern = /\[([^\]\/][^\]]*)\]([\s\S]*?)\[\/\1\]/gi;
        for (const [, tag, content] of memo.matchAll(pattern)) {
            blocks[tag.trim().toUpperCase()] = content.trim();
        }
        return blocks;
    }

    const COLLAPSE_KEY = 'rpg_tracker_collapsed';
    const DETACHED_KEY = 'rpg_tracker_detached';



    export function getPageSize(tag) {
        const s = getSettings();
        if (s.modulePageSizes && s.modulePageSizes[tag]) {
            return s.modulePageSizes[tag];
        }
        // Fallback to stock defaults
        return tag === 'SPELLS' ? 5 : PAGE_SIZE;
    }

    export function loadCollapsed() {
        try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); }
        catch { return new Set(); }
    }
    export function saveCollapsed(set) {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set]));
    }

    export function loadDetached() {
        try { return new Set(JSON.parse(localStorage.getItem(DETACHED_KEY) || '[]')); }
        catch { return new Set(); }
    }
    export function saveDetached(set) {
        localStorage.setItem(DETACHED_KEY, JSON.stringify([...set]));
    }

    const ACTIVE_TAB_KEY = 'rpg_tracker_active_tab';

    /** Returns the last-selected tab in Tab Mode, or '' if none set yet. */
    export function loadActiveTab() {
        try { return localStorage.getItem(ACTIVE_TAB_KEY) || ''; }
        catch { return ''; }
    }
    export function saveActiveTab(tag) {
        try { localStorage.setItem(ACTIVE_TAB_KEY, tag || ''); }
        catch { /* ignore */ }
    }



// ── Portrait rendering helpers ──────────────────────────────────────────────

/**
 * Returns the inner HTML for the portrait box of an entity.
 * Checks customPortraits (per-chat) first; falls back to a placeholder icon.
 * @param {string} entityName
 * @returns {string}
 */
function renderPortraitHtml(entityName) {
    const s = getSettings();
    const src = lookupCustomPortraitSrc(s, entityName);
    if (src) {
        return `<img class="rt-entity-portrait" src="${escapeHtml(src)}" alt="${escapeHtml(entityName)}" />`;
    }
    return `<i class="fa-solid fa-user-shield rt-entity-portrait-placeholder" aria-hidden="true"></i>`;
}

/**
 * Wraps entity content HTML in a flex container with a portrait box on the left.
 * Returns content unmodified when enablePortraits is false.
 * @param {string} entityName
 * @param {string} contentHtml
 * @returns {string}
 */
function wrapEntityHtml(entityName, contentHtml) {
    if (!getSettings().enablePortraits) return contentHtml;
    return `<div class="rt-entity-container" data-entity-name="${escapeHtml(entityName)}">
        <div class="rt-entity-portrait-container" title="Drop image here or click to set portrait">
            ${renderPortraitHtml(entityName)}
        </div>
        <div class="rt-entity-content">${contentHtml}</div>
    </div>`;
}

/**
 * Helper to parse a currency/worth string to a total value in Copper Pieces (CP).
 * Supports both D&D standard pieces (GP, SP, CP) and generic dollar/euro/pound.
 * @param {string} str 
 * @returns {number}
 */
function parseValueToCopper(str) {
    let totalCp = 0;
    
    // Suffix regex (matching gp, sp, cp, gold, silver, bronze, copper, usd, eur, gbp, dollar, euro, pound, etc.)
    const suffixRx = /([\d,]+(?:\.\d+)?)\s*(gp|sp|cp|gold|silver|bronze|copper|usd|eur|gbp|dollar|euros?|pounds?)\b/gi;
    // Prefix regex (matching $, £, €)
    const prefixRx = /([$£€])\s*([\d,]+(?:\.\d+)?)/gi;

    let match;
    let found = false;

    const cleanNum = (numStr) => parseFloat(numStr.replace(/,/g, ''));

    // Reset regex indices since they are global
    suffixRx.lastIndex = 0;
    prefixRx.lastIndex = 0;

    // Check suffix matches
    while ((match = suffixRx.exec(str)) !== null) {
        found = true;
        const num = cleanNum(match[1]);
        const unit = match[2].toLowerCase();
        if (/\b(gold|gp|usd|eur|gbp|dollar|euro|pound)\b/.test(unit)) {
            totalCp += num * 100;
        } else if (/\b(silver|sp)\b/.test(unit)) {
            totalCp += num * 10;
        } else if (/\b(bronze|copper|cp)\b/.test(unit)) {
            totalCp += num;
        }
    }

    // Check prefix matches
    while ((match = prefixRx.exec(str)) !== null) {
        found = true;
        const num = cleanNum(match[2]);
        totalCp += num * 100;
    }

    return found ? totalCp : 0;
}

/**
 * Helper to detect currency type from a string.
 * @param {string} str
 * @returns {string|null}
 */
function detectCurrency(str) {
    if (/\$|\b(usd|dollars?)\b/i.test(str)) return 'usd';
    if (/€|\b(eur|euros?)\b/i.test(str)) return 'eur';
    if (/£|\b(gbp|pounds?)\b/i.test(str)) return 'gbp';
    if (/\b(gp|sp|cp|gold|silver|bronze|copper)\b/i.test(str)) return 'gp';
    return null;
}

/**
 * Helper to format a Copper Pieces value back to a standard GP, SP, CP string or modern currency representation.
 * @param {number} totalCp 
 * @param {string} detectedCurrency
 * @returns {string}
 */
function formatValueToCurrency(totalCp, detectedCurrency) {
    if (totalCp <= 0) return '';
    const amount = totalCp / 100;
    const formattedAmount = amount.toLocaleString('en-US', {
        minimumFractionDigits: totalCp % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2
    });
    
    switch (detectedCurrency) {
        case 'usd':
            return `$${formattedAmount}`;
        case 'eur':
            return `€${formattedAmount}`;
        case 'gbp':
            return `£${formattedAmount}`;
        case 'gp':
        default: {
            const gp = Math.floor(totalCp / 100);
            const sp = Math.floor((totalCp % 100) / 10);
            const cp = Math.floor(totalCp % 10);

            const parts = [];
            if (gp > 0) parts.push(`${gp.toLocaleString('en-US')} GP`);
            if (sp > 0) parts.push(`${sp} SP`);
            if (cp > 0) parts.push(`${cp} CP`);

            return parts.join(', ');
        }
    }
}

    export function blockToItems(tag, content, renderTypeOverride = null) {
        const rawLines = content.split('\n').map(l => l.trim()).filter(Boolean);
        const lines = rawLines.map(line => {
            // Strip leading bullet markers (-, *, +, •, en-dash, em-dash)
            // but only if followed by space(s) or a letter (prevents stripping negative numbers like -5)
            return line.replace(/^\s*[-*+•–—](?:\s+|(?=[A-Za-z]))/, '');
        });
        let renderType = renderTypeOverride || tag;
        const customField = (getSettings().customFields || []).find(f => f.tag.toUpperCase() === tag);
        if (!renderTypeOverride && customField && customField.renderType) {
            renderType = customField.renderType;
        }

        switch (renderType) {
            case 'COMBAT':
            case 'PARTY':
            case 'BENCHED PARTY':
            case 'CHARACTER': {
                const results = [];
                const defeatedCombatants = new Set();
                let lastEntityIdx = -1;
                let currentEntity = '';

                const MARKER_RX = /^\(\((PILLS|BAR|XPBAR|TEXT|BADGE|HIGHLIGHT|HPBAR|PLS|B|XB|HGT|HPB|BDG|HP)\)\)\s*(.*)/i;
                const MARKER_TYPE_MAP = {
                    'PILLS': 'pills', 'PLS': 'pills',
                    'BAR': 'hp_bar', 'B': 'hp_bar',
                    'HPBAR': 'hp_bar', 'HPB': 'hp_bar',
                    'HP': 'hp_bar',
                    'XPBAR': 'xp_bar', 'XB': 'xp_bar',
                    'TEXT': 'text',
                    'BADGE': 'badge', 'BDG': 'badge',
                    'HIGHLIGHT': 'highlight', 'HGT': 'highlight'
                };

                for (let i = 0; i < lines.length; i++) {
                    const rawLine = lines[i];
                    const mm = rawLine.match(MARKER_RX);
                    let markerCode = mm ? mm[1].toUpperCase() : null;
                    const explicitType = mm ? MARKER_TYPE_MAP[markerCode] : null;
                    let line = mm ? mm[2].trim() : rawLine;

                    // Detect inline hp-bar marker: "Entity Name ((BARGREEN)) 12/20".
                    // Uses tokenizeMarkers (the same engine used for sub-field lines) so
                    // dynamically colored bar markers (for example ((BARRED))) work here,
                    // not just the handful in the old hardcoded regex.
                    // Only fires when the marker is NOT at line-start (MARKER_RX already handles that).
                    let inlineEntityName = null;
                    let inlineBarRule = null;
                    if (!mm) {
                        const segs = tokenizeMarkers(rawLine);
                        if (segs.length > 0 && segs[0].preText && segs[0].rule?.renderType === 'hp_bar') {
                            inlineEntityName = segs[0].preText.trim();
                            inlineBarRule    = segs[0].rule;          // carries color, renderType, etc.
                            line = segs[0].content.trim();            // just the value: "12/20" or "HP: 12/20"
                            markerCode = segs[0].markerType;          // e.g. "BAR" from ((BARGREEN))
                        }
                    }

                    // 1. Combat Round header
                    if (tag === 'COMBAT' && /Combat Round\s*\d+/i.test(line)) {
                        results.push(`<div class="rt-combat-round">${escapeHtmlWithColor(line)}</div>`);
                        lastEntityIdx = -1;
                        continue;
                    }

                    // Optional combat-side headers. Headerless blocks continue to
                    // parse exactly as before, with combatants treated as enemies.
                    const combatSide = tag === 'COMBAT' ? parseCombatSideHeader(line) : null;
                    if (combatSide) {
                        results.push(`<div class="rt-combat-side-header rt-combat-side-header--${combatSide}">${combatSide.toLocaleUpperCase()}</div>`);
                        lastEntityIdx = -1;
                        currentEntity = '';
                        continue;
                    }

                    // 2. Entity anchor: classic "Name: X/Y HP ..." or explicit ((HP)) marker
                    let hpMatch = line.match(/^(.+?):\s*([+-]?[\d,]+|\?+)(?:\/([\d,]+|\?+))?\s*HP\s*[:|,]?\s*(.*)$/i);
                    const isHpMarker = (markerCode === 'HP' || markerCode === 'HPB' || markerCode === 'HPBAR');

                    // If marker is specifically ((HP)), try a more relaxed regex (optional HP suffix)
                    if (!hpMatch && isHpMarker) {
                        hpMatch = line.match(/^(.+?):\s*([+-]?[\d,]+|\?+)(?:\/([\d,]+|\?+))?(?:\s*HP)?\s*[:|,]?\s*(.*)$/i);
                    }

                    // Inline-marker fallback: line was rewritten to just the value portion
                    // (e.g. "HP: 20/20" or bare "20/20"). Use a flexible regex that makes the
                    // label prefix ("HP:") optional so both forms parse correctly.
                    if (!hpMatch && inlineEntityName) {
                        hpMatch = line.match(/^(?:(.+?):\s*)?([+-]?\d[\d,]*|\?+)(?:\/(\d[\d,]*|\?+))?(?:\s*HP)?\s*[:|,]?\s*(.*)$/i);
                    }

                    if (hpMatch) {
                        const [, nameRaw, curRaw, maxRaw, rest] = hpMatch;
                        // inlineEntityName takes priority (set when "Name ((BARGREEN)) x/y" is used)
                        const name = (inlineEntityName || nameRaw || '').trim();
                        const unknownCurrent = /^\?+$/.test(curRaw);
                        const unknownMax = maxRaw ? /^\?+$/.test(maxRaw) : false;
                        const cur = unknownCurrent ? undefined : Number(curRaw.replace(/,/g, ''));
                        const max = !maxRaw || unknownMax ? undefined : Number(maxRaw.replace(/,/g, ''));
                        const hasMax = maxRaw !== undefined;
                        const hasKnownRange = Number.isFinite(cur) && Number.isFinite(max) && max > 0;
                        const unknownHp = unknownCurrent || unknownMax;
                        // Unknown HP is a neutral full-width indicator, not an implied empty/dead bar.
                        const pct = hasKnownRange ? Math.max(0, Math.min(100, (cur / max) * 100)) : 100;
                        // If an inline colored-bar rule was detected (e.g. ((BARGREEN))), use its
                        // color directly — don't override it with the damage-based red/yellow/green.
                        const hpColor = inlineBarRule?.color
                            ? inlineBarRule.color
                            : (unknownHp ? '#6b7280' : !hasMax ? DEFAULT_HP_COLOR : pct > 60 ? DEFAULT_HP_COLOR : pct > 30 ? '#ffaa00' : '#ff5555');
                        const status = (rest || '').trim().replace(/^\|\s*/, '');
                        
                        const showAsPct = getBarShowAsPercentage(`${tag}:${name}:HP`);
                        const dispCur = showAsPct && hasKnownRange ? Math.round(pct) : curRaw;
                        const dispMax = showAsPct && hasKnownRange ? 100 : maxRaw;
                        const label = hasMax ? `${dispCur}/${dispMax}` : `${curRaw}`;

                        currentEntity = name;
                        const barId = `${tag}:${currentEntity}:HP`;
                        const barBg = getBarBackground(barId, hpColor, pct);

                        lastEntityIdx = results.length;
                        if (inlineEntityName) {
                            results.push(`<div class="rt-entity-row" style="display:block; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:6px;">
                                <div class="rt-entity-name" style="font-size:1.1em; margin-bottom:6px;">${escapeHtmlWithColor(currentEntity)}</div>
                                <div class="rt-hp-bar-wrap${unknownHp ? ' rt-hp-unknown' : ''}" title="Click to recolor HP" data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}"${hasKnownRange ? makeBarAnimationData(barId, cur, max) : ''} style="position:relative; height:14px; border-radius:4px; overflow:hidden; background:rgba(255,255,255,0.1); margin-bottom:4px; width:100%;">
                                    <div class="rt-hp-bar" style="width:${pct.toFixed(1)}%; height:100%; border-radius:4px; background:${barBg}; transition:width 0.3s;"></div>
                                </div>
                                <span class="rt-hp-label" style="display:block; font-size:0.82em; opacity:0.85; text-align:left; line-height:1.2;">${label}</span>
                            </div>`);
                        } else {
                            results.push(`<div class="rt-entity-row"><div class="rt-entity-name">${escapeHtmlWithColor(currentEntity)}</div><div class="rt-hp-bar-wrap${unknownHp ? ' rt-hp-unknown' : ''}" title="Click to recolor HP" data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}"${hasKnownRange ? makeBarAnimationData(barId, cur, max) : ''}><div class="rt-hp-bar" style="width:${pct.toFixed(1)}%;background:${barBg};"></div></div><span class="rt-hp-label">${label}</span></div>`);
                        }

                        if (status) {
                            const parts = status.split('|').map(p => p.trim()).filter(Boolean);
                            let genericInfo = [];
                            for (const part of parts) {
                                if (part.toLowerCase().startsWith('ac:')) {
                                    results[lastEntityIdx] += `<div class="rt-entity-sub-line"><span class="rt-entity-sub-label">AC:</span> ${escapeHtmlWithColor(part.substring(3).trim())}</div>`;
                                } else if (part.toLowerCase().startsWith('saves:')) {
                                    results[lastEntityIdx] += `<div class="rt-entity-sub-line"><span class="rt-entity-sub-label">Saves:</span> ${highlightParens(escapeHtmlWithColor(part.substring(6).trim()))}</div>`;
                                } else if (part.toLowerCase().startsWith('status:')) {
                                    if (tag === 'COMBAT' && isResolvedCombatantStatusLine(part)) {
                                        defeatedCombatants.add(currentEntity.toLocaleLowerCase());
                                    }
                                    results[lastEntityIdx] += `<div class="rt-entity-sub-line rt-units-container"><span class="rt-entity-sub-label">Status:</span> ${renderPills(part.substring(7).trim())}</div>`;
                                } else if (part.toLowerCase().startsWith('other:') || part.toLowerCase().startsWith('res:')) {
                                    const lbl = part.toLowerCase().startsWith('res:') ? 'Res:' : 'Other:';
                                    const start = part.toLowerCase().startsWith('res:') ? 4 : 6;
                                    results[lastEntityIdx] += `<div class="rt-entity-sub-line rt-units-container"><span class="rt-entity-sub-label">${lbl}</span> ${renderPills(part.substring(start).trim())}</div>`;
                                } else { genericInfo.push(part); }
                            }
                            if (genericInfo.length > 0) {
                                results[lastEntityIdx] += `<div class="rt-entity-sub-line"><span class="rt-entity-sub-label">Info:</span> ${highlightParens(escapeHtmlWithColor(genericInfo.join(' | ')))}</div>`;
                            }
                        }
                        continue;
                    }

                    // 2b. CHARACTER/PARTY plain-name fallback anchor:
                    // If no HP pattern matched and this is a CHARACTER or PARTY block
                    // and we have no active entity yet, treat the first line as the entity name
                    // header (without an HP bar). This decouples portrait rendering from the
                    // strict "Name: X/Y HP" format requirement.
                    if (!hpMatch && (tag === 'CHARACTER' || tag === 'PARTY') && lastEntityIdx === -1) {
                        let entityLabel = line.trim();
                        let restOfHeader = '';
                        const plainNameColonMatch = line.match(/^(.+?):\s*(.*)/);
                        if (plainNameColonMatch) {
                            if (plainNameColonMatch[1].trim().toLowerCase() === 'name') {
                                entityLabel = plainNameColonMatch[2].trim();
                            } else {
                                entityLabel = plainNameColonMatch[1].trim();
                                restOfHeader = plainNameColonMatch[2].trim();
                            }
                        }

                        currentEntity = entityLabel;
                        lastEntityIdx = results.length;

                        // Render as entity-name header with optional rest as a sub-label (e.g. class info)
                        let headerHtml = `<div class="rt-entity-row"><div class="rt-entity-name">${escapeHtmlWithColor(currentEntity)}</div>`;
                        if (restOfHeader) {
                            headerHtml += `<span class="rt-hp-label" style="opacity:0.75; font-size:0.9em;">${escapeHtmlWithColor(restOfHeader)}</span>`;
                        }
                        headerHtml += `</div>`;
                        results.push(headerHtml);
                        continue;
                    }

                    // 3. Sub-field Logic (Sticky Context)

                    if (lastEntityIdx !== -1) {
                        if (tag === 'COMBAT' && isResolvedCombatantStatusLine(line)) {
                            defeatedCombatants.add(currentEntity.toLocaleLowerCase());
                        }
                        results[lastEntityIdx] += renderLineInEntityContext(tag, line, currentEntity, rawLine);
                    } else {
                        // No active entity: render as a standalone card line
                        results.push(`<div class="rt-card-item">${escapeHtmlWithColor(rawLine)}</div>`);
                    }
                }
                // Wrap each entity's accumulated HTML in portrait container before returning
                return results.map((html, idx) => {
                    // Only wrap entity rows (ones that have the entity-row class start), not round headers
                    if (html.startsWith('<div class="rt-combat-round">')) return html;
                    // Extract entity name from the first rt-entity-name span
                    const nameMatch = html.match(/class="rt-entity-name"[^>]*>([^<]+)</);
                    if (!nameMatch) return html;
                    const entityName = decodeHtml(nameMatch[1].trim());
                    const wrapped = wrapEntityHtml(entityName, html);
                    if (tag === 'COMBAT' && defeatedCombatants.has(entityName.toLocaleLowerCase())) {
                        return `<div class="rt-combatant-defeated" data-defeated-combatant="${escapeHtml(entityName)}">${wrapped}</div>`;
                    }
                    return wrapped;
                });
            }

            case 'TIME': {
                let currentTotalMins = 0;
                let parsedCurrent = false;

                // parseTimeStr removed, using shared parseInWorldTime from memo-processor.js

                for (let line of lines) {
                    if (line.toLowerCase().startsWith('last rest:')) continue;
                    if (!parsedCurrent) {
                        const t = parseInWorldTime(line);
                        if (t !== null) {
                            currentTotalMins = t;
                            parsedCurrent = true;
                        }
                    }
                }

                return lines.map((line, idx) => {
                    if (line.toLowerCase().startsWith('last rest:')) {
                        const restVal = line.substring(line.indexOf(':') + 1).trim();
                        let append = "";
                        if (parsedCurrent && !isRestTimeUnset(restVal)) {
                            const restMins = parseInWorldTime(restVal);
                            if (restMins !== null) {
                                const diff = currentTotalMins - restMins;
                                if (diff >= 0) {
                                    append = `&nbsp;<span style="opacity: 0.7; font-size: 1em;">(${formatTimeDiff(diff, false)})</span>`;
                                }
                            }
                        }
                        return `<div class="rt-card-line"><b>Último Descanso:</b>&nbsp;${escapeHtmlWithColor(restVal)}${append}</div>`;
                    }
                    const asMarker = tryRenderMarker(line, tag, '', idx);
                    if (asMarker !== null) return asMarker;
                    const { emoji: lineEmoji, color } = getTimeOfDayInfo(line);
                    const linePrefix = lineEmoji ? `<span class="rt-tod-emoji" style="margin-right:4px;">${lineEmoji}</span>` : '';
                    const timeText = line.replace(/^Current Time:\s*/i, 'Hora Actual: ');
                    const content = (color !== 'inherit') 
                        ? `<span style="color: ${color};">${escapeHtmlWithColor(timeText)}</span>`
                        : escapeHtmlWithColor(timeText);
                    return `<div class="rt-card-line">${linePrefix}${content}</div>`;
                });
            }
            case 'XP':
                return lines.map((line, idx) => {
                    const asMarker = tryRenderMarker(line, tag, '', idx);
                    if (asMarker !== null) return asMarker;

                    // New format: Total: 1,200 / 2,700 XP (Level 3)
                    let m = line.match(/Total:\s*([\d,]+)\s*\/\s*([\d,]+)\s*XP\s*\(Level\s*(\d+)\)/i);
                    if (m) {
                        const [, curRaw, maxRaw, level] = m;
                        const cur = Number(curRaw.replace(/,/g, ''));
                        const max = Number(maxRaw.replace(/,/g, ''));
                        const pct = Math.max(0, Math.min(100, (cur / max) * 100));
                        const barId = 'XP::XP';
                        const barBg = getBarBackground(barId, 'linear-gradient(90deg, #f39c12, #e67e22)', pct);

                        const showAsPct = getBarShowAsPercentage(barId);
                        const dispCur = showAsPct ? Math.round(pct) : curRaw;
                        const dispMax = showAsPct ? 100 : maxRaw;

                        return `<div class="rt-xp-row" data-xp-current="${cur}" data-xp-max="${max}" data-xp-level="${level}" data-xp-show-percentage="${showAsPct}">
                            <div class="rt-xp-label"><span>Level ${level}</span><span>XP: <span class="rt-xp-current">${dispCur}</span> / <span class="rt-xp-max">${dispMax}</span></span></div>
                            <div class="rt-xp-bar-wrap" title="Click to recolor XP" data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}">
                                <div class="rt-xp-bar" style="width:${pct.toFixed(1)}%; background:${barBg};"></div>
                            </div>
                        </div>`;
                    }

                    // Legacy format: XP: 1,200/2,700 or Level: 3 | XP: 1,200/2,700
                    m = line.match(/(?:Level:\s*(\d+)\s*\|?\s*)?XP:\s*([\d,]+)\/([\d,]+)/i);
                    if (m) {
                        const [, level, curRaw, maxRaw] = m;
                        const cur = Number(curRaw.replace(/,/g, ''));
                        const max = Number(maxRaw.replace(/,/g, ''));
                        const pct = Math.max(0, Math.min(100, (cur / max) * 100));
                        const levelHtml = level ? `<span>Level ${level}</span>` : '';
                        const barId = 'XP::XP';
                        const barBg = getBarBackground(barId, 'linear-gradient(90deg, #f39c12, #e67e22)', pct);

                        const showAsPct = getBarShowAsPercentage(barId);
                        const dispCur = showAsPct ? Math.round(pct) : curRaw;
                        const dispMax = showAsPct ? 100 : maxRaw;

                        return `<div class="rt-xp-row" data-xp-current="${cur}" data-xp-max="${max}" data-xp-level="${level || ''}" data-xp-show-percentage="${showAsPct}">
                            <div class="rt-xp-label">${levelHtml}<span>XP: <span class="rt-xp-current">${dispCur}</span> / <span class="rt-xp-max">${dispMax}</span></span></div>
                            <div class="rt-xp-bar-wrap" title="Click to recolor XP" data-recolor-id="${escapeHtml(barId)}" data-recolor-current="${escapeHtml(barBg)}">
                                <div class="rt-xp-bar" style="width:${pct.toFixed(1)}%; background:${barBg};"></div>
                            </div>
                        </div>`;
                    }

                    return `<div class="rt-card-item">${escapeHtmlWithColor(line)}</div>`;
                });
            case 'SPELLS': {
                // Lines: "Level N (avail/max): Spell1, Spell2" or "Cantrips: Spell1, Spell2"
                return lines.map((line, idx) => {
                    const asMarker = tryRenderMarker(line, tag, '', idx);
                    if (asMarker !== null) return asMarker;

                    const m = line.match(/^(Level\s*\d+|Cantrips?|Nivel\s*\d+|Trucos?)\s*(?:\((\d+)\/(\d+)[^)]*\))?\s*:\s*(.+)$/i);
                    if (!m) return `<div class="rt-card-item">${escapeHtmlWithColor(line)}</div>`;
                    const [, label, availStr, maxStr, spellList] = m;
                    const isCantrip = /cantrip|truco/i.test(label);
                    let pipsHtml = '';
                    if (!isCantrip && availStr !== undefined && maxStr !== undefined) {
                        const avail = parseInt(availStr, 10), max = parseInt(maxStr, 10);
                        const pips = Array.from({ length: max }, (_, i) =>
                            `<span class="rt-slot-pip${i < avail ? ' rt-slot-available' : ' rt-slot-used'}"></span>`
                        ).join('');
                        pipsHtml = `<span class="rt-slot-pips">${pips}</span>`;
                    }
                    const spells = spellList.split(',').map(s => {
                        const name = s.trim();
                        const url = resolveSpellUrl(name);
                        return `<a href="${url}" target="_blank" class="rt-spell-name" title="Ver hechizo">${escapeHtmlWithColor(name)}</a>`;
                    }).join('');
                    return `<div class="rt-spell-row">
                        <span class="rt-spell-level">${escapeHtmlWithColor(label.trim())}</span>
                        <div class="rt-spell-inline-group">
                            <div class="rt-spell-list">${pipsHtml}${spells}</div>
                        </div>
                    </div>`;
                });
            }
            case 'INVENTORY': {
                // Lines with a ((MARKER)) prefix bypass the bullet-list renderer
                const inventoryResults = [];
                const pendingBullets = [];
                let totalCp = 0;
                const currencyCounts = { gp: 0, usd: 0, eur: 0, gbp: 0 };

                const trackCurrency = (val) => {
                    const cur = detectCurrency(val);
                    if (cur) currencyCounts[cur]++;
                };

                const flushBullets = () => {
                    if (!pendingBullets.length) return;

                    // Currency detection map: pattern → { color, icon }
                    const CURRENCY_STYLES = [
                        { rx: /\b(gold|gp)\b/i,                               color: '#ffd700', icon: '💰' },
                        { rx: /\b(dollar|usd|euro|eur|pound|gbp)s?\b|[$£€]/i,  color: '#85bb65', icon: '💵' },
                        { rx: /\b(silver|sp)\b/i,                              color: '#c0c0c0', icon: '🪙' },
                        { rx: /\b(bronze|copper|cp)\b/i,                       color: '#cd7f32', icon: '🪙' },
                    ];

                    // Bare currency item: a line that IS the currency (e.g. "45 GP", "💰 45 GP", "$500", "130 Gold Dragons")
                    // — no parenthesised worth annotation, just a number + currency unit
                    const BARE_CURRENCY_RX = /^[^(]*?(?:([$£€])\s*\d[\d,]*|\d[\d,]*\s*(gp|sp|cp|gold|silver|bronze|copper|dollar|usd|euro|eur|pound|gbp|£|\$|€)(?:\s+[a-z]+){0,2})\s*$/i;

                    const worthMode = getSettings().inventoryWorthMode || 'hover'; // 'hover' | 'display'
                    const worthRx = /\s*\(~([^)]+)\)\s*$|\s*\(Worth:\s*([^)]+)\)\s*$/i;

                    pendingBullets.forEach(i => {
                        // ── Equipped tag: detect [E] and strip from display ──────────────────
                        const equippedRx = /\s*\[E\]\s*/i;
                        const isEquipped = equippedRx.test(i);
                        if (isEquipped) i = i.replace(equippedRx, ' ').trim();
                        const equippedClass = isEquipped ? ' rt-inventory-item--equipped' : '';

                        const worthMatch = i.match(worthRx);
                        let displayText = i;
                        let titleAttr = '';
                        let coinBadge = '';

                        if (worthMatch) {
                            // Item has a (~X GP) or (Worth: X GP) annotation
                            const worthVal = (worthMatch[1] || worthMatch[2]).trim();
                            trackCurrency(worthVal);
                            totalCp += parseValueToCopper(worthVal);
                            displayText = i.replace(worthRx, '').trim();

                            // Extract effect/stats parenthetical: last (...) group before the worth
                            // that looks mechanical (contains at least one digit)
                            const effectRx = /\s*\(([^)~][^)]*)\)\s*$/;
                            const effectMatch = displayText.match(effectRx);
                            let effectVal = '';
                            if (effectMatch && /\d/.test(effectMatch[1])) {
                                effectVal = effectMatch[1].trim();
                                displayText = displayText.replace(effectRx, '').trim();
                            }

                            // Build tooltip combining effect (if any) and worth
                            const tooltipParts = [];
                            if (effectVal) tooltipParts.push(`Efecto: ${effectVal}`);
                            tooltipParts.push(`Valor: ${worthVal}`);
                            titleAttr = ` title="${escapeHtml(tooltipParts.join('\n'))}"`;

                            if (worthMode === 'display') {
                                // Show coin badge inline next to item text
                                const matched = CURRENCY_STYLES.find(s => s.rx.test(worthVal));
                                if (matched) {
                                    coinBadge = ` <span class="rt-coin-badge" style="color:${matched.color}; font-weight:bold; background:rgba(255,255,255,0.05); padding:1px 6px; border-radius:10px; border:1px solid ${matched.color}44; font-size:0.85em; margin-left:4px; white-space:nowrap;">${matched.icon} ${escapeHtml(worthVal)}</span>`;
                                }
                            }
                            // In 'hover' mode: worth is tooltip only — no badge
                            inventoryResults.push(`<div class="rt-card-item rt-inventory-item${equippedClass}"${titleAttr}>${escapeHtmlWithColor(displayText)}${coinBadge}</div>`);
                        } else if (BARE_CURRENCY_RX.test(i.trim())) {
                            // This line IS a currency amount (e.g. "45 GP", "💰 45 GP")
                            // Strip any leading bullet dash — safety guard (pendingBullets already strips it,
                            // but comma-split path might not)
                            const cleanText = i.trim().replace(/^\s*[-*]\s*/, '');
                            trackCurrency(cleanText);
                            totalCp += parseValueToCopper(cleanText);
                            const COIN_COLORS = [
                                { rx: /\b(gold|gp)\b/i,                               color: '#ffd700' },
                                { rx: /\b(dollar|usd|euro|eur|pound|gbp)s?\b|[$£€]/i,  color: '#85bb65' },
                                { rx: /\b(silver|sp)\b/i,                              color: '#c0c0c0' },
                                { rx: /\b(bronze|copper|cp)\b/i,                       color: '#cd7f32' },
                            ];
                            const matchedCoin = COIN_COLORS.find(s => s.rx.test(cleanText));
                            if (matchedCoin) {
                                const c = matchedCoin.color;
                                // Same outer wrapper as all other inventory items → keeps bullet • styling
                                // Same badge style as display-mode worth badges → consistent shininess
                                inventoryResults.push(`<div class="rt-card-item rt-inventory-item"><span class="rt-coin-badge" style="color:${c}; font-weight:bold; background:rgba(255,255,255,0.05); padding:1px 6px; border-radius:10px; border:1px solid ${c}44; font-size:0.85em; white-space:nowrap;">${escapeHtmlWithColor(cleanText)}</span></div>`);
                            } else {
                                inventoryResults.push(`<div class="rt-card-item rt-inventory-item">${escapeHtmlWithColor(cleanText)}</div>`);
                            }
                        } else {
                            inventoryResults.push(`<div class="rt-card-item rt-inventory-item${equippedClass}">${escapeHtmlWithColor(displayText)}</div>`);
                        }
                    });
                    pendingBullets.length = 0;
                };

                for (let invIdx = 0; invIdx < lines.length; invIdx++) {
                    const line = lines[invIdx];
                    const rawLine = rawLines[invIdx];
                    const asMarker = tryRenderMarker(line, tag, '', invIdx);
                    if (asMarker !== null) {
                        flushBullets();
                        inventoryResults.push(asMarker);
                        continue;
                    }
                    // Section subheader (e.g. "Gear:", "Other Items:") — plain text header line
                    if (/^[A-Za-z][A-Za-z\s]*:\s*$/.test(line.trim())) {
                        flushBullets();
                        const rawHeader = line.trim().replace(/:$/, '').trim();
                        const headerMap = { 'gear': 'Equipo', 'other items': 'Otros Objetos' };
                        const headerText = headerMap[rawHeader.toLowerCase()] || rawHeader;
                        inventoryResults.push(`<div class="rt-inventory-subheader">${escapeHtml(headerText)}</div>`);
                        continue;
                    }
                    // A bullet-delimited line is one complete item. Inspect rawLines here
                    // because the shared preprocessor intentionally removes bullet markers
                    // from `lines` before dispatching by block type. Item names may contain
                    // commas (e.g. "Runekind, Quarterstaff +2") and must stay intact.
                    const bulletRx = /^\s*[-*+•–—](?:\s+|(?=[A-Za-z]))/;
                    if (bulletRx.test(rawLine)) {
                        pendingBullets.push(rawLine.replace(bulletRx, '').trim());
                    } else {
                        // Preserve legacy non-bulleted, comma-separated inventory lines.
                        // Do not split thousands separators or commas inside parentheses.
                        line.split(/(?<!\d),(?![^(]*\))|,(?!\d)(?![^(]*\))/).map(i => i.trim()).filter(Boolean)
                            .forEach(i => pendingBullets.push(i));
                    }
                }
                flushBullets();

                if (totalCp > 0) {
                    // Find currency with highest count, default to 'gp'
                    let detectedCurrency = 'gp';
                    let maxCount = 0;
                    for (const [cur, count] of Object.entries(currencyCounts)) {
                        if (count > maxCount) {
                            maxCount = count;
                            detectedCurrency = cur;
                        }
                    }
                    inventoryResults.totalValueGP = formatValueToCurrency(totalCp, detectedCurrency);
                    inventoryResults.detectedCurrency = detectedCurrency;
                }
                return inventoryResults;
            }
            case 'ABILITIES': {
                const abilityResults = [];
                for (let abIdx = 0; abIdx < lines.length; abIdx++) {
                    const line = lines[abIdx];
                    const asMarker = tryRenderMarker(line, tag, '', abIdx);
                    if (asMarker !== null) { abilityResults.push(asMarker); continue; }
                    const l = line.trim().replace(/^[-*]\s*/, '');

                    // Format detection: does this line use the "Name: description" format
                    // (colon before any unparenthesised comma) or the old comma-separated
                    // pill format ("Rage (2/2 per day), Reckless Attack, Danger Sense")?
                    //
                    // Walk through the string tracking paren depth; the first character
                    // that is ',' at depth 0 is the "first unparenthesised comma", and
                    // the first ':' at depth 0 is the "first unparenthesised colon".
                    // If the colon comes first (or there is no comma at all), treat the
                    // whole line as a single ability via renderAbilityLine so that commas
                    // inside the description (e.g. "bludgeoning, piercing, slashing")
                    // are not mis-split into separate pills.
                    // If a comma comes first (old format), fall back to renderPills so
                    // that multi-ability single-line entries still work exactly as before.
                    let firstCommaIdx = -1, firstColonIdx = -1, depth = 0;
                    for (let ci = 0; ci < l.length; ci++) {
                        const ch = l[ci];
                        if (ch === '(') depth++;
                        else if (ch === ')') depth--;
                        else if (depth === 0) {
                            if (ch === ',' && firstCommaIdx === -1) firstCommaIdx = ci;
                            if (ch === ':' && firstColonIdx === -1) firstColonIdx = ci;
                        }
                        if (firstCommaIdx !== -1 && firstColonIdx !== -1) break;
                    }

                    const isColonFormat = firstColonIdx !== -1 &&
                        (firstCommaIdx === -1 || firstColonIdx < firstCommaIdx);

                    if (isColonFormat) {
                        abilityResults.push(renderAbilityLine(l));
                    } else {
                        // Old comma-separated pill format — wrap in a container div
                        abilityResults.push(
                            `<div class="rt-entity-sub-line rt-units-container">${renderPills(l)}</div>`
                        );
                    }
                }
                return abilityResults;
            }
            default:
                // Custom blocks: resolve each line via module rows → global rules → kv fallback
                // Pass line index so positional row matching works even without label prefixes
                if (lines.some(line => {
                    const marker = MARKER_TOKEN_RE.exec(line);
                    return marker?.index === 0 && marker[1].toUpperCase() === 'NPC';
                })) {
                    return renderCustomBlockWithNpcMarkers(tag, lines);
                }
                return lines.map((line, idx) => renderCustomBlockLine(tag, line, idx));
        }
    }

    export function renderMemoAsCards(memo, filterTag, sectionPages, uiOptions = {}) {
        if (!memo || !memo.trim()) {
            const obSettings = getSettings();
            const useDdMmYy = !!obSettings.useDdMmYyFormat;
            const use24h = !!obSettings.use24hTime;
            const onboardingGenre = obSettings.onboardingGenre || 'fantasy';
            const onboardingGearTier = obSettings.onboardingGearTier || 'auto';
            const gearTierOptions = renderStartingGearTierOptions(onboardingGearTier);
            const onboardingLevelIsNone = obSettings.onboardingLevel === 'none';
            const onboardingLevelNum = onboardingLevelIsNone
                ? null
                : (parseInt(String(obSettings.onboardingLevel || 1), 10) || 1);
            const startDateInputVal = obSettings.initialDate && obSettings.initialDate !== 'Day 1' ? obSettings.initialDate : '01/01/2026';
            const startTimeInputVal = obSettings.initialTime || '08:00 AM';

            return `<div class="rt-empty" style="text-align: left; align-items: flex-start; padding: 12px; gap: 10px; overflow-y: auto;">
                <div style="text-align: center; width: 100%; margin-bottom: 2px; flex-shrink: 0;">
                    <div class="rt-empty-icon rt-onboarding-crest" aria-label="Fencers guarding a shield">
                        <span class="rt-onboarding-crest-fencer" aria-hidden="true">🤺</span>
                        <span class="rt-onboarding-crest-shield" aria-hidden="true">🛡️</span>
                        <span class="rt-onboarding-crest-fencer rt-onboarding-crest-fencer-mirrored" aria-hidden="true">🤺</span>
                    </div>
                    <div style="font-size: 16px; font-weight: bold; color: var(--rt-text);">Multihog D&D Framework</div>
                    <div style="margin: 8px auto 0; max-width: 520px; color: var(--rt-text-muted); font-size: 0.9em; line-height: 1.4;">¡Bienvenido a Multihog D&D Framework! Para ver las novedades más recientes, consulta la <a href="https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework/releases" target="_blank" rel="noopener noreferrer" style="color: var(--rt-accent);">sección de Publicaciones (Releases) en GitHub</a>, que utilizo a modo de blog de desarrollo.</div>
                </div>

                <div class="rt-onboarding-hero">
                    <button type="button" class="rt-onboarding-hero-btn rt-random-char-btn" data-archetype="char_roll">🎲 Creador de Personajes</button>
                    <div class="rt-onboarding-hero-sub">Crea tu personaje paso a paso: plantillas, Ficha de Jugador en el Agente de Lorebook y generación completa de estadísticas.</div>
                </div>

                <div class="rt-quickstart" id="rt-quickstart">
                    <div class="rt-quickstart-title">⚡ Acción Instantánea</div>
                    <div class="rt-quickstart-sub">Elige un género literario, opcionalmente escribe un nombre o una Configuración Inicial y comienza. Si dejas el nombre en blanco, la IA elegirá uno. La extensión usará tu Configuración del Narrador, generará el resto del personaje y creará una Ficha de Jugador en el Agente de Lorebook junto con una persona de solo nombre en SillyTavern. Desmarca "¿Enviar Mensaje Inicial?" si prefieres escribir tú mismo tu primera acción en lugar de dejar que la IA abra la campaña.</div>
                    <div class="rt-quickstart-genres" role="group" aria-label="Quick Start genre">
                        <button type="button" class="rt-quickstart-genre-btn" data-genre="fantasy" aria-pressed="false">⚔️ Fantasía</button>
                        <button type="button" class="rt-quickstart-genre-btn" data-genre="realistic" aria-pressed="false">🏙️ Moderno</button>
                        <button type="button" class="rt-quickstart-genre-btn" data-genre="scifi" aria-pressed="false">🚀 Ciencia Ficción</button>
                        <button type="button" class="rt-quickstart-genre-btn" data-genre="horror" aria-pressed="false">👻 Terror</button>
                    </div>
                    <div class="rt-quickstart-name-picker">
                        <input type="text" class="rt-quickstart-name" id="rt-quickstart-name" placeholder="Opcional: escribe, genera o deja que la IA elija" aria-label="Nombre opcional del personaje de Acción Instantánea" autocomplete="off" />
                        <button type="button" class="rt-quickstart-roll-btn" id="rt-quickstart-roll-name" disabled>🎲 Generar Nombre</button>
                    </div>
                    <label class="rt-quickstart-instructions-label" for="rt-quickstart-instructions">
                        <span>Configuración Inicial (opcional)</span>
                        <small>Guía el personaje, entorno, premisa o tono. Todo lo que dejes sin especificar se generará aleatoriamente.</small>
                    </label>
                    <textarea class="rt-quickstart-instructions" id="rt-quickstart-instructions" rows="2" maxlength="1000" placeholder="Ej. Una exploradora de 28 años con ballesta, comenzando en un pueblo fronterizo azotado por la tormenta" aria-label="Configuración Inicial opcional de Acción Instantánea"></textarea>
                    <div class="rt-quickstart-options">
                        <div class="rt-quickstart-player-card-length">
                            <label for="rt-quickstart-persona-words">Longitud de Ficha de Jugador</label>
                            <select id="rt-quickstart-persona-words" class="text_pole" aria-label="Recuento de palabras de la Ficha de Jugador">
                                ${[100, 150, 200, 300, 400, 500, 750, 1000].map(n => {
                                    const selected = String(obSettings.onboardingPersonaWords || '150') === String(n) ? ' selected' : '';
                                    return `<option value="${n}"${selected}>${n} palabras</option>`;
                                }).join('')}
                                <option value="other"${obSettings.onboardingPersonaWords === 'other' ? ' selected' : ''}>Personalizada…</option>
                            </select>
                            <input id="rt-quickstart-persona-words-custom" type="number" class="text_pole" value="${escapeHtml(String(obSettings.onboardingPersonaWordsCustom || ''))}" style="display:${obSettings.onboardingPersonaWords === 'other' ? 'block' : 'none'}" placeholder="50–5000" min="50" max="5000" aria-label="Recuento personalizado de palabras" />
                        </div>
                        <div class="rt-quickstart-starter-message">
                            <label for="rt-quickstart-send-starter" title="Si está marcado, la IA inicia la campaña automáticamente en cuanto el personaje esté listo.">
                                <span>¿Enviar Mensaje Inicial?</span>
                                <input type="checkbox" id="rt-quickstart-send-starter" ${obSettings.onboardingSendStarterMessage !== false ? 'checked' : ''} aria-label="Enviar Mensaje Inicial" />
                            </label>
                            <span class="rt-cr-help-icon" title="Si está marcado, la IA inicia la campaña automáticamente en cuanto el personaje esté listo.">?</span>
                        </div>
                    </div>
                    <button type="button" class="rt-quickstart-begin-btn" id="rt-quickstart-begin" disabled>⚡ Comenzar Acción Instantánea</button>
                    <div class="rt-quickstart-status" id="rt-quickstart-status">Selecciona un género literario para comenzar</div>
                </div>

                <div class="rt-onboarding-secondary rt-onboarding-drawer rt-onboarding-other-drawer">
                <button type="button" class="rt-onboarding-drawer-toggle" id="rt-onboarding-drawer-toggle" aria-expanded="false" aria-controls="rt-onboarding-drawer-body">
                    <span class="rt-onboarding-drawer-toggle-label"><span class="rt-onboarding-drawer-icon" aria-hidden="true">&#10022;</span><span>Otras Formas de Iniciar<small>Ajusta el inicio, crea una Ficha de Jugador o importa un personaje</small></span></span>
                    <span class="rt-onboarding-drawer-chevron" aria-hidden="true">&#9656;</span>
                </button>
                <div class="rt-onboarding-drawer-body" id="rt-onboarding-drawer-body">
                <div class="rt-onboarding-drawer-body-inner">
                <!-- Configuration Grid -->
                <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; margin: 4px 0; flex-shrink: 0;">
                    <div class="rt-onboarding-config-row">
                        <div class="rt-onboarding-field">
                            <span class="rt-onboarding-field-label">Nivel <span class="rt-cr-help-icon" title="Elige 'N/A' si tu sistema no utiliza niveles numéricos; las generaciones Personalizada y Persona no crearán nivel, XP ni indicadores de nivel tipo D&D.">?</span></span>
                            <select id="rt-starting-level" class="text_pole" style="width: auto; min-width: 60px; padding: 2px 4px; font-size: 11px; height: 22px; border-radius: 4px; background: var(--black70a);">
                                <option value="none"${onboardingLevelIsNone ? ' selected' : ''}>N/A — Sin Niveles</option>
                                ${[...Array(20).keys()].map(i => {
                                    const lvl = i + 1;
                                    const isSel = !onboardingLevelIsNone && lvl === onboardingLevelNum ? 'selected' : '';
                                    return `<option value="${lvl}" ${isSel}>Nivel ${lvl}</option>`;
                                }).join('')}
                            </select>
                        </div>
                        <div class="rt-onboarding-field">
                            <span class="rt-onboarding-field-label">Género Literario</span>
                            <select id="rt-onboarding-genre" class="text_pole" style="width: auto; min-width: 90px; padding: 2px 4px; font-size: 11px; height: 22px; border-radius: 4px; background: var(--black70a);">
                                <option value="fantasy" ${onboardingGenre === 'fantasy' ? 'selected' : ''}>⚔️ Fantasía RPG</option>
                                <option value="realistic" ${onboardingGenre === 'realistic' ? 'selected' : ''}>🏙️ Moderno / Realista</option>
                                <option value="scifi" ${onboardingGenre === 'scifi' ? 'selected' : ''}>🚀 Ciencia Ficción</option>
                                <option value="horror" ${onboardingGenre === 'horror' ? 'selected' : ''}>👻 Terror</option>
                            </select>
                        </div>
                        <div class="rt-onboarding-field">
                            <span class="rt-onboarding-field-label">Nivel de Equipamiento</span>
                            <select id="rt-onboarding-gear-tier" class="text_pole" title="Qué tan bien equipado debe estar el personaje generado." style="width: auto; min-width: 110px; padding: 2px 4px; font-size: 11px; height: 22px; border-radius: 4px; background: var(--black70a);">
                                ${gearTierOptions}
                            </select>
                        </div>
                        <div class="rt-onboarding-field">
                            <span class="rt-onboarding-field-label">Fecha y Hora</span>
                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                <div class="rt-seg-toggle" id="rt-onboarding-date-seg" role="group" title="Elige el formato de calendario para el seguimiento de [TIME].">
                                    <button type="button" data-value="day" class="${!useDdMmYy ? 'active' : ''}">Día 1</button>
                                    <button type="button" data-value="date" class="${useDdMmYy ? 'active' : ''}">DD/MM/YYYY</button>
                                </div>
                                <input type="text" id="rt-onboarding-start-date" class="text_pole" value="${startDateInputVal}" placeholder="01/01/2026" style="width: 80px; text-align: center; height: 22px; font-size: 11px; border-radius: 4px; background: var(--black70a); display: ${useDdMmYy ? 'inline-block' : 'none'};" />
                                <div class="rt-seg-toggle" id="rt-onboarding-clock-seg" role="group" title="Elige el formato de reloj para el seguimiento de [TIME].">
                                    <button type="button" data-value="12" class="${!use24h ? 'active' : ''}">12h</button>
                                    <button type="button" data-value="24" class="${use24h ? 'active' : ''}">24h</button>
                                </div>
                                <input type="text" id="rt-onboarding-start-time" class="text_pole" value="${startTimeInputVal}" placeholder="${use24h ? '08:00' : '08:00 AM'}" title="Initial time of day for the very first [TIME] block." style="width: 74px; text-align: center; height: 22px; font-size: 11px; border-radius: 4px; background: var(--black70a);" />
                            </div>
                        </div>
                    </div>
                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.85em; margin: 2px 0;">
                        <input type="checkbox" id="rt-onboarding-combat-guide-cb" ${obSettings.onboardingUseCombatScalingGuide !== false ? 'checked' : ''} />
                        <span>Usar Guía de Escalado de Combate y Habilidades</span>
                        <span class="rt-cr-help-icon" title="Cuando está activado, la IA se guía por una referencia clásica de progresión de combate y habilidades tipo d20. Desactívalo si estás usando tu propio sistema casero y no deseas lenguaje de escalado estilo D&D.">?</span>
                    </label>
                    <textarea id="rt-onboarding-custom-instructions" class="text_pole" placeholder="Instrucciones personalizadas para personaje/ambientación (ej. Londres victoriano, marine espacial, realismo crudo, hacker cyberpunk...)" style="width: 100%; min-height: 40px; max-height: 120px; font-size: 11px; padding: 4px 6px; border-radius: 4px; background: var(--black70a); resize: vertical; margin-top: 2px;">${escapeHtml(obSettings.onboardingCustomInstructions || '')}</textarea>
                    <div class="rt-quickstart-name-picker rt-onboarding-name-picker">
                        <input type="text" class="rt-quickstart-name" id="rt-onboarding-rolled-name" placeholder="Genera o escribe un nombre" aria-label="Other Ways character name" autocomplete="off" />
                        <button type="button" class="rt-quickstart-roll-btn" id="rt-onboarding-roll-name">🎲 Generar Nombre</button>
                    </div>
                    <div class="rt-onboarding-name-hint" id="rt-onboarding-name-hint">Genera un nombre acorde al género antes de usar Personalizado.</div>
                    <div style="display:flex; flex-direction:column; gap:5px; flex-shrink:0; padding:4px 0 2px;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.88em;">
                                <input type="checkbox" id="rt-onboarding-player-card-cb"${obSettings.onboardingCreatePersona ? ' checked' : ''} />
                                <span>Crear Ficha de Jugador en el Agente de Lorebook (Recomendado)</span>
                            </label>
                            <span class="rt-cr-help-icon" title="Cuando está marcado, la IA escribe una apariencia detallada, personalidad, hábitos y trasfondo para una Ficha de Jugador en el Agente de Lorebook. Aparecerá una vista previa para que puedas editarla, regenerarla o copiarla.">?</span>
                            <span style="opacity:0.6; font-size:0.8em; margin-left:4px;">Conteo de palabras:</span>
                            <select id="rt-onboarding-persona-words" class="text_pole" style="width:65px; font-size:11px; height:22px; padding:2px 4px;">
                                ${[100, 150, 200, 300, 400, 500, 750, 1000].map(n => {
                                    const sel = String(obSettings.onboardingPersonaWords || '150') === String(n) ? ' selected' : '';
                                    return `<option value="${n}"${sel}>${n}</option>`;
                                }).join('')}
                                <option value="other"${obSettings.onboardingPersonaWords === 'other' ? ' selected' : ''}>Otro...</option>
                            </select>
                            <input id="rt-onboarding-persona-words-custom" type="number" class="text_pole" value="${escapeHtml(String(obSettings.onboardingPersonaWordsCustom || ''))}" style="display:${obSettings.onboardingPersonaWords === 'other' ? 'inline-block' : 'none'}; width:65px; font-size:11px; height:22px; padding:2px 4px; margin-left:4px;" placeholder="ej. 800" min="50" max="5000" />
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.88em;">
                                <input type="checkbox" id="rt-onboarding-st-persona-cb"${obSettings.onboardingCreateSillyTavernPersona !== false ? ' checked' : ''} />
                                <span>Crear Persona de ST (Recomendado)</span>
                            </label>
                            <span class="rt-cr-help-icon" title="Crea y selecciona una persona de SillyTavern con el nombre del personaje. Esto hace que los mensajes enviados usen ese nombre de jugador; los detalles permanecen en el Agente de Lorebook.">?</span>
                        </div>
                    </div>
                </div>

                <!-- Archetype Buttons -->
                <div class="rt-onboarding-buttons rt-fantasy-buttons" style="width: 100%; display: ${onboardingGenre === 'fantasy' ? 'flex' : 'none'}; justify-content: center; gap: 4px; margin: 4px 0; flex-shrink: 0; flex-wrap: wrap;">
                    <button class="rt-random-char-btn" data-archetype="persona">🎭 Persona</button>
                    <button class="rt-random-char-btn" data-archetype="custom" data-name-required="true" disabled>⚙️ Personalizado</button>
                    <button class="rt-random-char-btn rt-pc-import-trigger" data-archetype="pc_import">📥 Importar Ficha</button>
                </div>
                <div class="rt-onboarding-buttons rt-realistic-buttons" style="width: 100%; display: ${onboardingGenre === 'realistic' ? 'flex' : 'none'}; justify-content: center; gap: 4px; margin: 4px 0; flex-shrink: 0; flex-wrap: wrap;">
                    <button class="rt-random-char-btn" data-archetype="persona">🎭 Persona</button>
                    <button class="rt-random-char-btn" data-archetype="custom" data-name-required="true" disabled>⚙️ Personalizado</button>
                    <button class="rt-random-char-btn rt-pc-import-trigger" data-archetype="pc_import">📥 Importar Ficha</button>
                </div>
                <div class="rt-onboarding-buttons rt-scifi-buttons" style="width: 100%; display: ${onboardingGenre === 'scifi' ? 'flex' : 'none'}; justify-content: center; gap: 4px; margin: 4px 0; flex-shrink: 0; flex-wrap: wrap;">
                    <button class="rt-random-char-btn" data-archetype="persona">🎭 Persona</button>
                    <button class="rt-random-char-btn" data-archetype="custom" data-name-required="true" disabled>⚙️ Personalizado</button>
                    <button class="rt-random-char-btn rt-pc-import-trigger" data-archetype="pc_import">📥 Importar Ficha</button>
                </div>
                <div class="rt-onboarding-buttons rt-horror-buttons" style="width: 100%; display: ${onboardingGenre === 'horror' ? 'flex' : 'none'}; justify-content: center; gap: 4px; margin: 4px 0; flex-shrink: 0; flex-wrap: wrap;">
                    <button class="rt-random-char-btn" data-archetype="persona">🎭 Persona</button>
                    <button class="rt-random-char-btn" data-archetype="custom" data-name-required="true" disabled>⚙️ Personalizado</button>
                    <button class="rt-random-char-btn rt-pc-import-trigger" data-archetype="pc_import">📥 Importar Ficha</button>
                </div>
                </div>
                </div>
                </div>

                <!-- PC Import Inline Panel (hidden until 📥 is clicked) -->
                <div id="rt-pc-import-panel" style="display:none; flex-direction:column; gap:7px; width:100%; flex-shrink:0;">
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        <button id="rt-pc-import-back" style="background:none; border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:inherit; font-size:0.8em; padding:2px 8px; cursor:pointer; opacity:0.75;">← Volver</button>
                        <span style="flex:1; display:flex; align-items:center; gap:6px;">
                            <span style="font-weight:bold; color:var(--rt-accent); font-size:0.95em;">📥 Importar Ficha como Personaje Jugador</span>
                            <button class="rt-edit-pc-sections-btn" style="background:none; border:none; color:var(--rt-accent); cursor:pointer; font-size:1.1em; opacity:0.8; padding:0; margin-top:-2px;" title="Editar Secciones de Formato de PJ">⚙️</button>
                        </span>
                    </div>
                    <div style="font-size:10px; color:rgba(255,255,255,0.45); line-height:1.4;"><b>Añadir Tal Cual</b> = La IA preserva el texto original, solo soluciona imposibilidades de época/mundo · <b>Adaptar a la Historia</b> = adaptación completa al contexto de la campaña.</div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        <label style="font-size:11px; color:rgba(255,255,255,0.6); white-space:nowrap;">Longitud de Ficha del Jugador</label>
                        <select id="rt-pc-import-wordselect" style="background:rgba(0,0,0,0.3); color:white; border:1px solid rgba(255,255,255,0.15); border-radius:4px; padding:2px 4px; font-size:11px; box-sizing:border-box;">
                            <option value="same">Igual a la Ficha</option>
                            <option value="150">Corta (~150 palabras)</option>
                            <option value="300">Mediana (~300 palabras)</option>
                            <option value="500">Larga (~500 palabras)</option>
                            <option value="custom">Personalizada...</option>
                        </select>
                        <input id="rt-pc-import-wordcount" type="number" value="150" min="50" max="5000" step="25"
                            style="display:none; width:60px; background:rgba(0,0,0,0.3); color:white; border:1px solid rgba(255,255,255,0.15); border-radius:4px; padding:3px 6px; font-size:12px; box-sizing:border-box;">
                        <span style="font-size:10px; color:rgba(255,255,255,0.35);">(Solo para Adaptar a la Historia)</span>
                    </div>
                    <input id="rt-pc-import-search" type="text" placeholder="Buscar personajes..." style="width:100%; background:rgba(0,0,0,0.3); color:white; border:1px solid rgba(255,255,255,0.15); border-radius:5px; padding:5px 8px; font-size:12px; box-sizing:border-box;">
                    <div id="rt-pc-import-list" style="display:flex; flex-direction:column; gap:4px; max-height:200px; overflow-y:auto; padding-right:2px;"></div>
                </div>

                <!-- Character Roll Inline Panel (hidden until 🎲 is clicked) -->
                <div id="rt-char-roll-panel" style="display:none; flex-direction:column; gap:7px; width:100%; flex-shrink:0;">
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        <button id="rt-char-roll-back" style="background:none; border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:inherit; font-size:0.8em; padding:2px 8px; cursor:pointer; opacity:0.75;">← Volver</button>
                        <span style="flex:1; display:flex; align-items:center; gap:6px;">
                            <span style="font-weight:bold; color:var(--rt-accent); font-size:0.95em;">🎲 Creador de Personajes</span>
                            <button class="rt-edit-pc-sections-btn" style="background:none; border:none; color:var(--rt-accent); cursor:pointer; font-size:1.1em; opacity:0.8; padding:0; margin-top:-2px;" title="Editar Secciones de Formato de PJ">⚙️</button>
                        </span>
                        <button id="rt-cr-reset-btn" class="rt-cr-reset-btn" style="background:none; border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:inherit; font-size:0.8em; padding:2px 8px; cursor:pointer; opacity:0.75;" title="Limpiar todos los campos">🗑 Reiniciar</button>
                    </div>
                    <!-- Presets Bar -->
                    <div id="rt-cr-presets-bar" style="display:flex; align-items:center; gap:5px; padding:4px 0 3px; border-bottom:1px solid rgba(255,255,255,0.08);">
                        <span style="font-size:0.78em; opacity:0.55; white-space:nowrap;">📋 Plantillas:</span>
                        <select id="rt-cr-preset-select" class="text_pole" style="flex:1; font-size:11px; height:22px; padding:2px 4px;">
                            <option value="">— Seleccionar plantilla —</option>
                        </select>
                        <button id="rt-cr-preset-load-btn" style="background:rgba(120,80,220,0.2); border:1px solid rgba(120,80,220,0.5); border-radius:4px; color:inherit; font-size:0.75em; padding:2px 8px; cursor:pointer; white-space:nowrap; flex-shrink:0;">Cargar</button>
                        <button id="rt-cr-preset-delete-btn" style="background:rgba(220,50,50,0.12); border:1px solid rgba(220,50,50,0.4); border-radius:4px; color:rgba(255,100,100,0.9); font-size:0.75em; padding:2px 8px; cursor:pointer; white-space:nowrap; flex-shrink:0;">Eliminar</button>
                        <button id="rt-cr-preset-save-btn" title="Guardar campos actuales como una nueva plantilla" style="background:none; border:1px solid rgba(120,80,220,0.5); border-radius:4px; color:var(--rt-accent); font-size:0.75em; padding:2px 8px; cursor:pointer; white-space:nowrap; flex-shrink:0;">＋ Guardar</button>
                    </div>
                    <div class="rt-cr-row">
                        <div class="rt-cr-field">
                            <label class="rt-cr-label" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                                <span>Nombre</span>
                                <button id="rt-cr-random-name" class="interactable" style="background:none; border:none; color:var(--rt-accent); cursor:pointer; padding:0; margin:0; font-size:1.1em; line-height:1;" title="Generar nombre aleatorio">🎲</button>
                            </label>
                            <input id="rt-cr-name" class="text_pole rt-cr-input" type="text" />
                        </div>
                        <div class="rt-cr-field">
                            <label class="rt-cr-label">Género</label>
                            <input id="rt-cr-gender" class="text_pole rt-cr-input" type="text" />
                        </div>
                        <div class="rt-cr-field">
                            <label class="rt-cr-label">Edad</label>
                            <input id="rt-cr-age" class="text_pole rt-cr-input" type="text" />
                        </div>
                        <div class="rt-cr-field" style="flex:1.35 1 0%;">
                            <label class="rt-cr-label" style="display:inline-flex; align-items:center; gap:3px; white-space:nowrap;">Orientación Sexual <span class="rt-cr-help-icon" style="width:14px;height:14px;font-size:0.65em;" title="Necesaria para el sistema de relaciones y opciones románticas de CYOA — sin esto, el objetivo de afecto/romance con PNJs es impreciso.">?</span></label>
                            <input id="rt-cr-orientation" class="text_pole rt-cr-input" type="text" />
                        </div>
                    </div>
                    <div class="rt-cr-row">
                        <div class="rt-cr-field">
                            <label class="rt-cr-label">Especie / Raza</label>
                            <input id="rt-cr-species" class="text_pole rt-cr-input" type="text" />
                        </div>
                        <div class="rt-cr-field">
                            <label class="rt-cr-label">Etnia / Origen</label>
                            <input id="rt-cr-ethnicity" class="text_pole rt-cr-input" type="text" />
                        </div>
                    </div>
                    <div class="rt-cr-row">
                        <div class="rt-cr-field">
                            <label class="rt-cr-label">Género / Ambientación <span class="rt-cr-help-icon" title="Debes seleccionar un género específico para ver sus clases relacionadas en el desplegable de Clase. De lo contrario, solo se muestran clases genéricas.">?</span></label>
                            <select id="rt-cr-genre" class="text_pole rt-cr-input">
                                <option value="">✨ Ninguno — La IA decide por el contexto</option>
                                <option value="fantasy">⚔️ Fantasía / RPG</option>
                                <option value="realistic">🏙️ Contemporáneo / Moderno</option>
                                <option value="scifi">🚀 Ciencia Ficción</option>
                                <option value="horror">👻 Terror / Horror</option>
                            </select>
                        </div>
                        <div class="rt-cr-field">
                            <label class="rt-cr-label">Nivel <span class="rt-cr-help-icon" title="Elige 'N/A' si tu sistema no utiliza niveles numéricos; la IA no inventará nivel, XP ni indicador de nivel tipo D&D.">?</span></label>
                            <select id="rt-cr-level" class="text_pole rt-cr-input">
                                <option value="none"${onboardingLevelIsNone ? ' selected' : ''}>N/A — Sin Niveles (Sistema Personalizado)</option>
                                ${[...Array(20).keys()].map(i => { const l = i + 1; return `<option value="${l}"${!onboardingLevelIsNone && l === onboardingLevelNum ? ' selected' : ''}>Nivel ${l}</option>`; }).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="rt-cr-row">
                        <div class="rt-cr-field">
                            <label class="rt-cr-label">Calidad del Equipo <span class="rt-cr-help-icon" title="Qué tan bien equipado debe estar el personaje — desde equipo inicial común hasta objetos heroicos con nombre. Se escala automáticamente con el nivel. Elige 'Ninguno' para omitir la guía de equipo.">?</span></label>
                            <select id="rt-cr-gear-tier" class="text_pole rt-cr-input">
                                ${gearTierOptions}
                            </select>
                        </div>
                    </div>
                    <div class="rt-cr-row">
                        <div class="rt-cr-field" style="width:100%;">
                            <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.88em; font-weight:normal;">
                                <input type="checkbox" id="rt-cr-combat-guide-cb" ${obSettings.onboardingUseCombatScalingGuide !== false ? 'checked' : ''} />
                                <span>Use Combat &amp; Skill Scaling Guide</span>
                                <span class="rt-cr-help-icon" title="When enabled, the AI is guided by a classic d20/BAB-style combat and skill progression reference. Turn this off if you're using your own homebrew system and don't want D&D-flavored scaling language influencing the result.">?</span>
                            </label>
                        </div>
                    </div>
                    <div class="rt-cr-row rt-cr-time-row">
                        <div class="rt-cr-field" style="width:100%;">
                            <label class="rt-cr-label">Fecha y Hora <span class="rt-cr-help-icon" title="Formato de reloj y calendario para el seguimiento de [TIME] en los memos. Día 1 = conteo de días narrativo; DD/MM/YYYY = fechas reales. La última casilla establece la hora inicial del día.">?</span></label>
                            <div class="rt-cr-time-controls">
                                <div class="rt-seg-toggle" id="rt-cr-date-seg" role="group" title="Elige el formato de calendario para el seguimiento de [TIME].">
                                    <button type="button" data-value="day" class="${!useDdMmYy ? 'active' : ''}">Día 1</button>
                                    <button type="button" data-value="date" class="${useDdMmYy ? 'active' : ''}">DD/MM/YYYY</button>
                                </div>
                                <input type="text" id="rt-cr-start-date" class="text_pole rt-cr-input" value="${startDateInputVal}" placeholder="01/01/2026" style="width: 92px; text-align: center; display: ${useDdMmYy ? 'inline-block' : 'none'};" />
                                <div class="rt-seg-toggle" id="rt-cr-clock-seg" role="group" title="Elige el formato de reloj para el seguimiento de [TIME].">
                                    <button type="button" data-value="12" class="${!use24h ? 'active' : ''}">12h</button>
                                    <button type="button" data-value="24" class="${use24h ? 'active' : ''}">24h</button>
                                </div>
                                <input type="text" id="rt-cr-start-time" class="text_pole rt-cr-input" value="${startTimeInputVal}" placeholder="${use24h ? '08:00' : '08:00 AM'}" title="Hora inicial del día para el primer bloque [TIME]." style="width: 84px; text-align: center;" />
                            </div>
                        </div>
                    </div>
                    <div class="rt-cr-field" style="width:100%;">
                        <label class="rt-cr-label">Clase</label>
                        <select id="rt-cr-class" class="text_pole rt-cr-input" style="width:100%;"></select>
                        <input id="rt-cr-class-other" class="text_pole rt-cr-input" type="text" placeholder="Describe tu clase personalizada…" style="display:none; margin-top:3px; width:100%;" />
                    </div>
                    <div class="rt-cr-row">
                        <div class="rt-cr-field">
                            <label class="rt-cr-label">Rasgos</label>
                            <textarea id="rt-cr-traits" class="text_pole rt-cr-input" placeholder="Dejar en blanco — la IA inventa los rasgos" rows="2" style="resize:vertical;"></textarea>
                        </div>
                        <div class="rt-cr-field">
                            <label class="rt-cr-label">Habilidades</label>
                            <textarea id="rt-cr-abilities" class="text_pole rt-cr-input" placeholder="Dejar en blanco — la IA genera las habilidades" rows="2" style="resize:vertical;"></textarea>
                        </div>
                    </div>
                    <div class="rt-cr-row">
                        <div class="rt-cr-field">
                            <label class="rt-cr-label">Trasfondo <span class="rt-cr-help-icon" title="No necesitas escribir una historia completa. Una breve pista guía a la IA (ej. 'exsoldado', 'criado en los barrios bajos'). Deja en blanco y la IA creará un trasfondo adecuado.">?</span></label>
                            <input id="rt-cr-background" class="text_pole rt-cr-input" type="text" placeholder="ej. exsoldado, criado en los barrios bajos…" />
                        </div>
                        <div class="rt-cr-field">
                            <label class="rt-cr-label">Apariencia <span class="rt-cr-help-icon" title="Una breve pista es suficiente (ej. 'alto, cabello oscuro, ojos verdes'). Deja en blanco y la IA creará la descripción completa.">?</span></label>
                            <input id="rt-cr-appearance" class="text_pole rt-cr-input" type="text" placeholder="ej. alto, cabello oscuro, ojos verdes…" />
                        </div>
                    </div>
                    <div class="rt-cr-field" style="width:100%;">
                        <label class="rt-cr-label">Información Adicional</label>
                        <textarea id="rt-cr-additional" class="text_pole rt-cr-input" placeholder="Restricciones extra, notas de ambientación…" rows="2" style="resize:vertical; width:100%;"></textarea>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:5px; flex-shrink:0; padding:4px 0;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.88em;">
                                <input type="checkbox" id="rt-cr-player-card-cb" checked />
                                <span>Crear Ficha de Jugador en el Agente de Lorebook (Recomendado)</span>
                            </label>
                            <span class="rt-cr-help-icon" title="Cuando está marcado, la IA escribe una apariencia detallada, personalidad, hábitos y trasfondo para una Ficha de Jugador en el Agente de Lorebook. Aparecerá una vista previa para que puedas editarla, regenerarla o copiarla.">?</span>
                            <span style="opacity:0.6; font-size:0.8em; margin-left:4px;">Conteo de palabras:</span>
                            <select id="rt-cr-persona-words" class="text_pole" style="width:65px; font-size:11px; height:22px; padding:2px 4px;">
                                <option value="100">100</option>
                                <option value="150" selected>150</option>
                                <option value="200">200</option>
                                <option value="300">300</option>
                                <option value="400">400</option>
                                <option value="500">500</option>
                                <option value="750">750</option>
                                <option value="1000">1000</option>
                                <option value="other">Otro...</option>
                            </select>
                            <input id="rt-cr-persona-words-custom" type="number" class="text_pole" style="display:none; width:65px; font-size:11px; height:22px; padding:2px 4px; margin-left:4px;" placeholder="ej. 800" min="50" max="5000" />
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:0.88em;">
                                <input type="checkbox" id="rt-cr-st-persona-cb" checked />
                                <span>Crear Persona de ST (Recomendado)</span>
                            </label>
                            <span class="rt-cr-help-icon" title="Crea y selecciona una persona de SillyTavern con el nombre del personaje. Esto hace que los mensajes enviados usen ese nombre de jugador; los detalles permanecen en el Agente de Lorebook.">?</span>
                        </div>
                    </div>
                    <button id="rt-cr-generate-btn" style="width:100%; padding:8px 12px; background:rgba(120,80,220,0.2); border:1px solid rgba(120,80,220,0.6); border-radius:5px; color:var(--rt-text,#eee); font-size:0.92em; font-weight:bold; cursor:pointer; letter-spacing:0.03em;">🎲 Generar Personaje</button>
                </div>

                <div class="rt-onboarding-divider"><span>Cómo Funciona</span></div>

                <div class="rt-onboarding-prompt-backup-note" role="note" style="font-size:12px;line-height:1.4;padding:8px 10px;border-left:3px solid var(--rt-accent);background:rgba(120,80,220,0.1);border-radius:4px;">
                    <b>NOTA:</b> Multihog D&amp;D Framework aplica automáticamente su propio prompt del sistema. Si deseas restaurar tu prompt anterior, ve a los ajustes de la extensión: General y Visual -> Núcleo -> Restaurar copia de seguridad al Principal.
                </div>

                <div class="rt-onboarding-chat-tip" role="note">
                    <div class="rt-onboarding-chat-tip-title">¿Necesitas ayuda? Abre <b>CHAT</b> en el encabezado del Rastreador de Estado</div>
                    <div class="rt-onboarding-chat-tip-body">Habla con el <b>Acompañante de Aventura</b> para recibir ayuda con el Multihog o discutir tu historia. Activa el Modo Tutorial en CHAT cuando quieras incluir la guía completa del framework adjunta a cada solicitud. O entra a nuestro Discord en la sección de extensiones: <a href="https://discord.gg/sillytavern" target="_blank" rel="noopener noreferrer">https://discord.gg/sillytavern</a>.</div>
                    <div class="rt-onboarding-chat-tip-body" style="margin-top: 6px;">Aquí tienes un video tutorial para empezar: <a href="https://www.youtube.com/watch?v=dKKFQqrH7qQ" target="_blank" rel="noopener noreferrer">https://www.youtube.com/watch?v=dKKFQqrH7qQ</a></div>
                </div>

                <div style="font-size: 13px; opacity: 0.9; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; line-height: 1.4;">
                    <div><b style="color: var(--rt-accent);">Seguimiento Automático:</b> Conforme juegas, la extensión analiza inteligentemente las respuestas del asistente utilizando lenguaje natural. Detecta pérdidas de PV, nuevo botín o activaciones de combate, ejecutando pases en segundo plano para actualizar el estado.</div>

                    <div><b style="color: var(--rt-accent);">Inyección en el Prompt:</b> El State Memo y la Cola RNG se inyectan sin problemas en tu prompt saliente. Actúa como la "fuente de la verdad", asegurando que el modelo narrador/DM vea con precisión PV, inventario y resultados mecánicos. ¡FUNCIONA PERFECTAMENTE!</div>

                    <div><b style="color: var(--rt-accent);">Agente de Lorebook 🤖:</b> Ábrelo desde la pestaña <b>Agente de Lorebook</b> en la parte superior del panel del Rastreador de Estado y preferiblemente desacóplalo. Gestiona de forma autónoma tu libro de lore (creando, actualizando, activando, desactivando y eliminando entradas). Haz clic en <b>?</b> dentro del panel del agente para ver la documentación completa.</div>

                    <div><b style="color: var(--rt-accent);">Progresión del Mundo 🌍:</b> Simula la actividad del mundo fuera de escena generando informes de eventos a intervalos regulares dentro del juego (por ejemplo, diarios). Puedes inicializar la simulación con un Esqueleto del Mundo opcional para introducir facciones, ubicaciones, PNJs y conflictos no descubiertos. Configura estas opciones en la sección Progresión del Mundo dentro del menú de Ajustes de la Extensión.</div>
                </div>

                <div class="rt-onboarding-divider"><span>Guía de Configuración</span></div>

                <div style="font-size: 13px; opacity: 0.9; flex-shrink: 0; line-height: 1.4; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;">
                    <b style="color: var(--rt-accent); font-size: 14px;">Configuración Inicial:</b><br><br>
                    1. Crea una ficha de personaje para tu "narrador" (ej. Director de Juego). <b>Deja los campos vacíos</b>, ya que el framework gestiona toda la lógica mediante el prompt del sistema.<br><br>
                    2. Usa una de las opciones de creación de personajes anteriores para definir tu personaje. Puedes usar la opción Creador de Personajes para especificar los detalles, usar "Otras Formas de Iniciar" para un resumen rápido o usar "Acción Instantánea" para que la extensión genere automáticamente todo lo que dejes sin especificar.<br><br>
                    3. Si utilizas el modo RNG híbrido que combina llamadas a herramientas con la Cola RNG pre-generada de la extensión, asegúrate de activar <b>Habilitar llamadas a funciones</b> en la configuración de IA. De lo contrario, la herramienta <b>RollTheDice</b> no funcionará.<br><br>
                    <div style="margin-top: 8px;">
                        🪙 <b>Optimización de Tokens:</b> Para reducir el costo de tokens, especialmente en modo de herramientas, considera usar una extensión de resumen como <b>Summaryception</b>. La resumización combinada con el <b>Agente de Lorebook</b> garantizará que la IA se mantenga enfocada.
                    </div>
                    <div style="margin-top: 12px;">
                        🤖 <b>¿Qué Modelo Utilizar?</b><br><br>
                        Para el Narrador, recomendamos probar <b>MiMo 2.5 Pro</b>, <b>DeepSeek V4 Pro / Flash</b> o modelos potentes locales en llama.cpp (como Gemma 4 12B QAT/UD).<br><br>
                        Para el Rastreador de Estado y el Agente de Lorebook, los modelos ligeros y rápidos como <b>Gemini Flash-Lite</b>, <b>Flash</b> o tu modelo local en servidor son ideales.<br><br>
                        Si tu modelo piensa demasiado durante el combate, activa <b>Sustitución de API en Combate</b> en los ajustes del Rastreador de Estado para cambiar automáticamente a un modelo súper rápido en combate.
                    </div>
                </div>

                <!-- Narrator Configuration (Salad Bar) -->
                <div class="rt-onboarding-secondary rt-onboarding-drawer rt-onboarding-narrator-drawer">
                    <button type="button" class="rt-onboarding-drawer-toggle" id="rt-onboarding-narrator-drawer-toggle" aria-expanded="false" aria-controls="rt-onboarding-narrator-drawer-body">
                        <span class="rt-onboarding-drawer-toggle-label"><span class="rt-onboarding-drawer-icon" aria-hidden="true">&#10022;</span><span>Configuración del Narrador<small>Ajusta ritmo, RNG, misiones y sistemas opcionales</small></span></span>
                        <span class="rt-onboarding-drawer-chevron" aria-hidden="true">&#9656;</span>
                    </button>
                    <div class="rt-onboarding-drawer-body" id="rt-onboarding-narrator-drawer-body">
                    <div class="rt-onboarding-drawer-body-inner">
                    <div class="rt-onboarding-narrator-content" style="width: 100%; box-sizing: border-box;">
                    <small style="display: block; margin-bottom: 8px; opacity: 0.65; font-style: italic; line-height: 1.3;">Selecciona tus modos y componentes preferidos. Los cambios se aplican automáticamente a tu prompt del sistema.</small>

                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
                        <span style="font-size: 0.85em; font-weight: bold; opacity: 0.8;">Ritmo / Longitud de Respuesta</span>
                        <button type="button" class="rt-narrative-pacing-help" style="background: none; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: inherit; font-size: 0.72em; opacity: 0.7; padding: 1px 7px; cursor: pointer;">¿Qué es esto?</button>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; padding-left: 5px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="radio" name="rt_onboarding_narrative_pacing" value="normal" id="rt_onboarding_narrative_pacing_normal" /><span>Normal (sin instrucciones de longitud)</span></label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="radio" name="rt_onboarding_narrative_pacing" value="shorter_outputs" id="rt_onboarding_narrative_pacing_shorter_outputs" /><span>Respuestas Más Cortas</span></label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="radio" name="rt_onboarding_narrative_pacing" value="high_agency" id="rt_onboarding_narrative_pacing_high_agency" /><span>Modo de Alta Autonomía (High-Agency)</span></label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="radio" name="rt_onboarding_narrative_pacing" value="downtime" id="rt_onboarding_narrative_pacing_downtime" /><span>Modo Tiempo Libre / Vida Cotidiana</span></label>
                    </div>
                    
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
                        <span style="font-size: 0.85em; font-weight: bold; opacity: 0.8;">Generación de Números Aleatorios (RNG)</span>
                        <button class="rt-rng-help-icon" style="background: none; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: inherit; font-size: 0.72em; opacity: 0.7; padding: 1px 7px; cursor: pointer;" title="Abrir explicación de sistemas RNG">¿Qué es esto?</button>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; padding-left: 5px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="radio" name="rt_onboarding_rng_mode" value="hybrid" id="rt_onboarding_rng_hybrid" />
                            <span>Pre-Generado + Llamadas a Herramientas (Recomendado sin CYOA)</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="radio" name="rt_onboarding_rng_mode" value="legacy" id="rt_onboarding_rng_legacy" />
                            <span>Solo Pre-Generado (Recomendado con CYOA)</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="radio" name="rt_onboarding_rng_mode" value="none" id="rt_onboarding_rng_none" />
                            <span>Sin RNG (el LLM inventa los números, no recomendado)</span>
                        </label>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px;">
                        <span style="font-size: 0.85em; font-weight: bold; opacity: 0.8;">Misiones</span>
                        <button class="rt-quests-hardcore-help" style="background: none; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: inherit; font-size: 0.72em; opacity: 0.7; padding: 1px 7px; cursor: pointer;" title="Explicar mecánicas de misiones hardcore">¿Qué es esto?</button>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; padding-left: 5px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="rt_onboarding_quests_enabled" />
                            <span>Habilitar Misiones</span>
                        </label>
                        <div id="rt_onboarding_quest_options" style="padding-left: 20px; display: none; flex-direction: column; gap: 4px;">
                            <div style="margin-top: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px;">
                                <span style="font-size: 0.75em; opacity: 0.6; text-transform: uppercase; font-weight: bold;">Hardcore / Opcional</span>
                            </div>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="rt_onboarding_quests_deadlines" />
                                <span>Plazos Límite (Deadlines)</span>
                            </label>
                            <div id="rt_onboarding_quests_frustration_wrap" style="padding-left: 20px; display: none;">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                    <input type="checkbox" id="rt_onboarding_quests_frustration" />
                                    <span style="opacity: 0.9;">↳ Frustración (Experimental)</span>
                                </label>
                            </div>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="rt_onboarding_quests_show_archive" checked />
                                <span>Mostrar misiones completadas/falladas</span>
                            </label>
                        </div>
                    </div>

                    <div style="font-size: 0.85em; font-weight: bold; opacity: 0.8; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px;">Componentes Opcionales</div>
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; padding-left: 5px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="rt_onboarding_mod_loot" />
                            <span>🎲 Botín (Tiradas para Calidad de Botín)</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="rt_onboarding_mod_random_events" />
                            <span>🌍 Eventos Aleatorios (Tiradas en saltos de tiempo y viajes)</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="rt_onboarding_mod_resting" />
                            <span>💤 Descanso Limitado en Tiempo e interrupciones según peligro</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="rt_onboarding_mod_party_bench" />
                            <span>⛺ Grupo en Reserva (Rastrea compañeros ausentes)</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;" title="Alpha: builds a hidden location map before exploring a dungeon, ruin, town, or city. Function calling MUST be enabled. Not recommended together with World Progression until compatibility is added.">
                            <input type="checkbox" id="rt_onboarding_mod_dungeon_reality_and_hidden_mapping" />
                            <span>🗺️ Persistent Maps (Alpha)</span>
                        </label>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <input type="checkbox" id="rt_onboarding_mod_cyoa_mode" />
                            <span>🧭 Modo CYOA (Opciones numeradas al final de respuestas)</span>
                            <button id="rt_onboarding_cyoa_settings_btn" style="background:none;border:1px solid rgba(255,255,255,0.25);border-radius:4px;color:inherit;font-size:0.75em;padding:1px 6px;cursor:pointer;flex-shrink:0;opacity:0.8;" title="Ajustes CYOA"><i class="fa-solid fa-gear"></i></button>
                        </div>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="rt_onboarding_mod_npc_rel_bars" />
                            <span>💞 Sistema de Relaciones (rastrea amistad y afecto de PNJs)</span>
                        </label>
                    </div>

                    <button id="rt_onboarding_btn_update_sysprompt" style="width: 100%; margin-top: 10px; padding: 7px 12px; background: rgba(0, 200, 140, 0.18); border: 1px solid #00c88c; border-radius: 4px; color: var(--rt-text, #eee); font-size: 0.88em; cursor: pointer;" title="Escribe el prompt del sistema en el cuadro principal según las opciones seleccionadas.">
                        ↑ Aplicar Prompt del Sistema
                    </button>
                </div>
                </div>
                </div>
                </div>
                <div class="rt-onboarding-connection-shortcut" style="width:100%;flex-shrink:0;">
                    <button type="button" class="menu_button interactable" id="rt-open-character-creation-connection-settings" style="width:100%;">
                        <i class="fa-solid fa-plug-circle-bolt"></i> Conexión para Creación de Personajes
                    </button>
                    <small>Compartido por el Creador de Personajes, Acción Instantánea y Otras Formas de Iniciar. Configúralo en <b>Conexiones y Modelos</b> en los ajustes de la extensión.</small>
                </div>
            </div>`;
        }

        const blocks = ensurePartyShellForBenchedRoster(parseMemoBlocks(memo));
        if (Object.keys(blocks).length === 0) {
            return `<div class="rt-empty">No structured blocks found.<br><small>Switch to Raw view to inspect the memo.</small></div>`;
        }

        const s = getSettings();
        const order = stripBenchedPartyTag(s.blockOrder || BLOCK_ORDER);
        const sorted = [
            ...order.filter(k => blocks[k] !== undefined),
            ...stripBenchedPartyTag(Object.keys(blocks).filter(k => !order.includes(k))).sort()
        ];

        const collapsed = loadCollapsed();
        const detached = loadDetached();

        // Detached/single-module contexts deliberately bypass Display Groups.
        // The BETA layer only changes the main rendered composition.
        if (filterTag) {
            return renderSectionCard(filterTag, blocks, collapsed, detached, sectionPages, filterTag, uiOptions);
        }

        // A previously detached child keeps its established detached behavior
        // instead of being silently duplicated inside a new virtual host.
        const displayGroups = (s.displayGroups || []).map(group => ({
            ...group,
            members: (group?.members || []).filter(tag => !detached.has(String(tag).toUpperCase())),
        }));
        const renderPlan = buildDisplayGroupRenderPlan(sorted, displayGroups, s.displayGroupsEnabled);
        return renderPlan.map(entry => entry.kind === 'group'
            ? renderDisplayGroupCard(entry, blocks, collapsed, detached, sectionPages, s.displayGroupsShowGaps === true)
            : renderSectionCard(entry.tag, blocks, collapsed, detached, sectionPages, null, uiOptions)
        ).join('');
    }

    /**
     * Renders a single tag's section card (header + body). Extracted from renderMemoAsCards
     * so it can be reused both by the classic stacked view and by the compact Tab Mode view
     * (which pins CHARACTER/COMBAT in full and renders exactly one tab's card at a time).
     * @param {string} tag
     * @param {object} blocks  parsed memo blocks (tag -> raw content)
     * @param {Set<string>} collapsed
     * @param {Set<string>} detached
     * @param {object} sectionPages  mutable pagination state, keyed by tag
     * @param {string|null} filterTag  when set, hides the detach button and skips the detached-placeholder check
     * @param {{fullViewSections?: string[], showCategorySettings?: boolean, bodyOnly?: boolean}} [uiOptions]
     * @returns {string}
     */
    function renderSectionCard(tag, blocks, collapsed, detached, sectionPages, filterTag, uiOptions = {}) {
        if (tag === 'QUESTS') return ''; // Quest log has dedicated high-fidelity renderer, skip standard card
        const content = blocks[tag];
        if (content === undefined && filterTag) {
            return `<div class="rt-empty">Waiting for ${tag} data...</div>`;
        }
        if (content === undefined) return '';

        // If main panel context, filter out detached windows
        if (!uiOptions.bodyOnly && !filterTag && detached.has(tag)) {
            return `<div class="rt-detached-placeholder" data-tag="${tag}">
                <span class="rt-placeholder-icon">⧉</span> ${tag} is detached
                <button class="rt-reattach-btn-inline" data-tag="${tag}" title="Re-attach">↓</button>
            </div>`;
        }

        const customField = (getSettings().customFields || []).find(f => f.tag.toUpperCase() === tag);
        const icon = customField?.icon || BLOCK_ICONS[tag] || '📄';
        const displayName = customField?.label || TAG_DISPLAY_NAMES[tag] || tag;
        const items = blockToItems(tag, content);
        const isCollapsed = !uiOptions.bodyOnly && collapsed.has(tag);

        let totalValueBadge = '';
        if (tag === 'INVENTORY' && items.totalValueGP && getSettings().showTotalInventoryValue !== false) {
            const isModern = ['usd', 'eur', 'gbp'].includes(items.detectedCurrency);
            const badgeColor = isModern ? '#85bb65' : '#ffd700';
            const badgeBg = isModern ? 'rgba(133, 187, 101, 0.08)' : 'rgba(255, 215, 0, 0.08)';
            const badgeBorder = isModern ? 'rgba(133, 187, 101, 0.3)' : 'rgba(255, 215, 0, 0.3)';
            const badgeIcon = isModern ? '💵' : '💰';
            totalValueBadge = `<span class="rt-total-value-badge" style="color: ${badgeColor}; font-weight: bold; background: ${badgeBg}; padding: 2px 8px; border-radius: 12px; border: 1px solid ${badgeBorder}; font-size: 0.85em; white-space: nowrap; text-transform: none; letter-spacing: 0;">${badgeIcon} ${items.totalValueGP}</span>`;
        }

        const renderType = customField?.renderType || tag;
        const fullViewOverride = Array.isArray(uiOptions.fullViewSections)
            ? new Set(uiOptions.fullViewSections.map(value => String(value).toUpperCase()))
            : null;
        const isFullView = (fullViewOverride
            ? fullViewOverride.has(tag)
            : getSettings().fullViewSections.includes(tag)) || NO_PAGINATE.has(renderType);
        const localPageSize = getPageSize(tag);

        const page = isFullView ? 0 : (sectionPages[tag] ?? 0);
        const totalPages = isFullView ? 1 : Math.ceil(items.length / localPageSize);
        const safePage = Math.min(page, Math.max(0, totalPages - 1));
        if (!isFullView) sectionPages[tag] = safePage;

        const pageItems = isFullView ? items : items.slice(safePage * localPageSize, (safePage + 1) * localPageSize);
        const bodyClass = `rt-section-body${renderType === 'ABILITIES' ? ' rt-abilities-body' : ''}`;

        const pagination = totalPages > 1 ? `
            <div class="rt-pagination">
                <button class="rt-page-btn" data-tag="${tag}" data-dir="-1"${safePage === 0 ? ' disabled' : ''}>&#8249;</button>
                <span>${safePage + 1}&thinsp;/&thinsp;${totalPages}</span>
                <button class="rt-page-btn" data-tag="${tag}" data-dir="1"${safePage >= totalPages - 1 ? ' disabled' : ''}>&#8250;</button>
            </div>` : '';

        // Don't show detach button if already in detached context (filterTag provided)
        const detachBtn = !filterTag ? `
            <button class="rt-detach-btn" data-tag="${tag}" title="Detach panel">
                ⧉
            </button>
        ` : '';

        const personaFromCharBtn = tag === 'CHARACTER' ? `
            <button class="rt-char-to-persona-btn" data-tag="CHARACTER" title="Create Lorebook Agent Player Card from this CHARACTER (uses sheet + last 3 story messages)">
                👤
            </button>
        ` : '';

        const fullViewBtn = NO_PAGINATE.has(renderType) ? '' : `
            <button class="rt-fullview-btn${isFullView ? ' active' : ''}" data-tag="${tag}" title="${isFullView ? 'Switch to Paged View' : 'Switch to Full List'}">
                ${isFullView ? '📜' : '📑'}
            </button>
        `;

        const renderOptions = getSettings().categoryRenderOptions?.[tag] || {};
        const catStyles = [];
        if (renderOptions.fontSize) catStyles.push(`--rt-cat-font-size: ${(renderOptions.fontSize / 13).toFixed(4)}em`);
        if (renderOptions.italic) catStyles.push(`--rt-cat-font-style: italic`);
        if (renderOptions.bold) catStyles.push(`--rt-cat-font-weight: bold`);
        if (renderOptions.bullets === false) catStyles.push(`--rt-cat-bullet-display: none`);
        if (renderOptions.bulletColor) catStyles.push(`--rt-cat-bullet-color: ${renderOptions.bulletColor}`);
        if (renderOptions.bulletStyle) catStyles.push(`--rt-cat-bullet-style: "${renderOptions.bulletStyle}"`);
        if (renderOptions.fontFamily) catStyles.push(`--rt-cat-font-family: ${renderOptions.fontFamily}`);
        if (renderOptions.textColor && renderOptions.textColor !== 'inherit') catStyles.push(`--rt-cat-text-color: ${renderOptions.textColor}`);
        const catStyleAttr = catStyles.length ? ` style='${catStyles.join('; ')}'` : '';

        // [BENCHED PARTY] is never its own section — it's folded into PARTY's card as a
        // compact camp-roster sub-panel (see stripBenchedPartyTag / renderBenchedPartyPanel).
        let benchedPanelHtml = '';
        if (tag === 'PARTY' && getSettings().modules?.['benched party'] !== false && blocks['BENCHED PARTY'] !== undefined) {
            benchedPanelHtml = renderBenchedPartyPanel(blocks['BENCHED PARTY'], collapsed.has('BENCHED PARTY'), loadBenchedExpanded());
        }

        const bodyHtml = `<div class="${bodyClass}"${catStyleAttr}>${pageItems.join('')}${pagination}${benchedPanelHtml}</div>`;
        if (uiOptions.bodyOnly) {
            return `<div class="rt-display-group-member" data-member-tag="${tag}">${bodyHtml}</div>`;
        }

        return `<div class="rt-section-card${isCollapsed ? ' rt-collapsed' : ''}" data-tag="${tag}">
            <div class="rt-section-header" data-tag="${tag}">
                <span>${icon} ${displayName}</span>
                <div class="rt-section-header-right">
                    ${totalValueBadge}
                    ${personaFromCharBtn}
                    ${detachBtn}
                    ${fullViewBtn}
                    ${uiOptions.showCategorySettings === false ? '' : `<button class="rt-category-settings-btn" data-tag="${tag}" title="Category Rendering Options">
                        <i class="fa-solid fa-cog"></i>
                    </button>`}
                    <span class="rt-item-count">${items.length} ${items.length === 1 ? 'entrada' : 'entradas'}</span>
                    <span class="rt-collapse-icon">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
                </div>
            </div>
            ${bodyHtml}
        </div>`;
    }

    /** Render one virtual, display-only host with headerless member bodies. */
    function renderDisplayGroupCard(entry, blocks, collapsed, detached, sectionPages, showGaps = true) {
        const { key, group, tags } = entry;
        const isCollapsed = collapsed.has(key);
        const memberBodies = tags.map(tag => renderSectionCard(
            tag,
            blocks,
            collapsed,
            detached,
            sectionPages,
            null,
            { bodyOnly: true, showCategorySettings: false, fullViewSections: tags },
        )).join('');
        if (!memberBodies) return '';

        return `<div class="rt-section-card rt-display-group-card${isCollapsed ? ' rt-collapsed' : ''}" data-tag="${key}" data-display-group-id="${escapeHtml(group.id)}">
            <div class="rt-section-header" data-tag="${key}">
                <span>${escapeHtml(group.icon)} ${escapeHtml(group.name)}</span>
                <div class="rt-section-header-right">
                    <span class="rt-item-count">${tags.length} ${tags.length === 1 ? 'module' : 'modules'}</span>
                    <span class="rt-collapse-icon">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
                </div>
            </div>
            <div class="rt-section-body rt-display-group-body${showGaps ? '' : ' rt-display-group-body--seamless'}">${memberBodies}</div>
        </div>`;
    }

// ── Tab Mode (compact layout for small screens) ─────────────────────────────
//
// CHARACTER and COMBAT (while active) are pinned above the tab strip in full,
// unmodified detail — reusing renderSectionCard directly. Every other block
// (Inventory, Abilities, Spells, XP, Time, Quests, Party, custom modules)
// becomes a tab; only the active tab's card is rendered into the content pane.
// The tab strip wraps to additional rows when space runs out.

const TABMODE_PINNED_TAGS = ['CHARACTER', 'COMBAT'];

/**
 * Lightweight line scan for "Name: cur/max HP ..." entries in a PARTY block,
 * used only to feed the compact vitals strip. Deliberately simpler than the
 * full blockToItems() entity parser — it only needs name + HP, not the whole
 * rendered card.
 * @param {string} content  raw PARTY block content
 * @returns {{name: string, cur: number, max: number, pct: number}[]}
 */
function extractPartyVitals(content) {
    if (!content) return [];
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    const results = [];
    for (const rawLine of lines) {
        const line = rawLine.replace(/^\s*[-*+•–—](?:\s+|(?=[A-Za-z]))/, '');
        const hpMatch = line.match(/^(.+?):\s*([+-]?[\d,]+)(?:\/([\d,]+))?\s*HP\s*[:|,]?\s*/i);
        if (!hpMatch) continue;
        const [, nameRaw, curRaw, maxRaw] = hpMatch;
        const name = nameRaw.trim();
        if (!name) continue;
        const cur = Number(curRaw.replace(/,/g, ''));
        const max = maxRaw ? Number(maxRaw.replace(/,/g, '')) : cur;
        const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 100;
        results.push({ name, cur, max, pct });
    }
    return results;
}

/**
 * Renders the compact party-vitals strip (portrait + slim HP ring per member).
 * Returns '' when there's no PARTY block or no parseable HP entries.
 * @param {object} blocks  parsed memo blocks
 * @returns {string}
 */
function renderPartyVitalsStrip(blocks) {
    const content = blocks['PARTY'];
    if (!content) return '';
    const members = extractPartyVitals(content);
    if (!members.length) return '';

    const items = members.map(m => {
        const barId = `PARTY:${m.name}:HP`;
        const showAsPct = getBarShowAsPercentage(barId);
        const dispCur = showAsPct ? Math.round(m.pct) : m.cur;
        const dispMax = showAsPct ? 100 : m.max;
        const ringColor = getBarBackground(barId, DEFAULT_HP_COLOR, m.pct);
        return `<button class="rt-vitals-member" data-jump-tag="PARTY" title="${escapeHtml(m.name)}: ${dispCur}/${dispMax} HP">
            <span class="rt-vitals-portrait-wrap" style="--rt-vitals-ring: ${ringColor}; --rt-vitals-pct: ${m.pct}%;">
                ${renderPortraitHtml(m.name)}
            </span>
            <span class="rt-vitals-name">${escapeHtml(m.name.split(' ')[0])}</span>
        </button>`;
    }).join('');

    return `<div class="rt-vitals-strip" id="rt-party-vitals-strip">${items}</div>`;
}

const BENCHED_EXPANDED_KEY = 'rpg_tracker_benched_expanded';

/** Returns the set of benched member names currently expanded to their full stat card. */
export function loadBenchedExpanded() {
    try { return new Set(JSON.parse(localStorage.getItem(BENCHED_EXPANDED_KEY) || '[]')); }
    catch { return new Set(); }
}
export function saveBenchedExpanded(set) {
    localStorage.setItem(BENCHED_EXPANDED_KEY, JSON.stringify([...set]));
}

/**
 * Lightweight per-member scan for [BENCHED PARTY] content — extracts just the name and
 * Status line (the benching reason/timestamp), for the compact camp-roster chips. Mirrors
 * extractPartyVitals's "simple scan, not the full entity-card parser" approach; the full
 * stat card is only built on demand (via blockToItems) when a chip is expanded.
 * @param {string} content  raw BENCHED PARTY block content
 * @returns {{name: string, status: string}[]}
 */
function extractBenchedRoster(content) {
    if (!content) return [];
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    const results = [];
    let current = null;
    for (const rawLine of lines) {
        const line = rawLine.replace(/^\s*[-*+•–—](?:\s+|(?=[A-Za-z]))/, '');
        const hpMatch = line.match(/^(.+?):\s*[+-]?[\d,]+(?:\/[\d,]+)?\s*HP/i);
        if (hpMatch) {
            if (current) results.push(current);
            current = { name: hpMatch[1].trim(), status: '' };
            continue;
        }
        if (!current) {
            const nameOnly = line.replace(/:\s*$/, '').trim();
            if (nameOnly) current = { name: nameOnly, status: '' };
            continue;
        }
        if (/^status:/i.test(line)) {
            current.status = line.replace(/^status:\s*/i, '').trim();
        }
    }
    if (current) results.push(current);
    return results;
}

/**
 * Renders the "camp" sub-panel folded into PARTY's card for benched members — a compact,
 * portrait-based roster of chips (name + reason on hover) that expand inline into the full
 * stat card on click. Deliberately never its own section/tab (see stripBenchedPartyTag).
 * @param {string} benchedContent  raw BENCHED PARTY block content
 * @param {boolean} isPanelCollapsed
 * @param {Set<string>} expandedNames  names currently expanded to their full stat card
 * @returns {string}
 */
function renderBenchedPartyPanel(benchedContent, isPanelCollapsed, expandedNames) {
    const roster = extractBenchedRoster(benchedContent);
    if (!roster.length) return '';

    const fullCardByName = {};
    if (expandedNames.size > 0) {
        blockToItems('BENCHED PARTY', benchedContent).forEach(html => {
            const m = html.match(/class="rt-entity-name"[^>]*>([^<]+)</);
            if (m) fullCardByName[decodeHtml(m[1].trim())] = html;
        });
    }

    const chips = roster.map(({ name, status }) => {
        const isOpen = expandedNames.has(name);
        const tooltip = status ? `${name}: ${status}` : name;
        const chipHtml = `<button class="rt-benched-chip${isOpen ? ' active' : ''}" data-benched-toggle="${escapeHtml(name)}" title="${escapeHtml(tooltip)}">
            <span class="rt-benched-chip-portrait">${renderPortraitHtml(name)}</span>
            <span class="rt-benched-chip-name">${escapeHtml(name.split(' ')[0])}</span>
        </button>`;
        const expandedHtml = isOpen
            ? `<div class="rt-benched-expanded-card">${fullCardByName[name] || ''}</div>`
            : '';
        return chipHtml + expandedHtml;
    }).join('');

    return `<div class="rt-benched-panel${isPanelCollapsed ? ' rt-collapsed' : ''}">
        <div class="rt-section-header rt-benched-panel-header" data-tag="BENCHED PARTY">
            <span>⛺ Benched <span class="rt-benched-count">${roster.length}</span></span>
            <span class="rt-collapse-icon">${isPanelCollapsed ? '&#9656;' : '&#9662;'}</span>
        </div>
        <div class="rt-benched-chips">${chips}</div>
    </div>`;
}

/**
 * Renders the full Tab Mode view: pinned CHARACTER/COMBAT cards, the party
 * vitals strip, a wrapping tab strip, and a single content pane for the active tab.
 * @param {string} memo
 * @param {object} sectionPages  mutable pagination state, keyed by tag
 * @param {{quests: object[], currentTime: string}|null} questsCtx  quest data, or null if the Quests module is off
 * @returns {string}
 */
export function renderTabModeView(memo, sectionPages, questsCtx = null) {
    if (!memo || !memo.trim()) return renderMemoAsCards(memo, null, sectionPages);

    const blocks = ensurePartyShellForBenchedRoster(parseMemoBlocks(memo));
    if (Object.keys(blocks).length === 0) {
        return `<div class="rt-empty">No structured blocks found.<br><small>Switch to Raw view to inspect the memo.</small></div>`;
    }

    const s = getSettings();
    const order = stripBenchedPartyTag(s.blockOrder || BLOCK_ORDER);
    const sorted = [
        ...order.filter(k => blocks[k] !== undefined),
        ...stripBenchedPartyTag(Object.keys(blocks).filter(k => !order.includes(k))).sort()
    ];

    const collapsed = loadCollapsed();
    const detached = loadDetached();

    const pinnedTags = sorted.filter(t => TABMODE_PINNED_TAGS.includes(t));
    const pinnedHtml = pinnedTags.map(tag => renderSectionCard(tag, blocks, collapsed, detached, sectionPages, null)).join('');
    const vitalsHtml = renderPartyVitalsStrip(blocks);

    let tabTags = sorted.filter(t => !TABMODE_PINNED_TAGS.includes(t));
    if (questsCtx && questsCtx.quests) {
        if (!tabTags.includes('QUESTS')) {
            tabTags.push('QUESTS');
        }
    } else {
        tabTags = tabTags.filter(t => t !== 'QUESTS');
    }

    const tabPlan = buildDisplayGroupRenderPlan(tabTags, s.displayGroups, s.displayGroupsEnabled);
    if (tabPlan.length === 0) {
        return `<div class="rt-tabmode-wrap">
            <div class="rt-tabmode-pinned">${pinnedHtml}</div>
            ${vitalsHtml}
            <div class="rt-empty">No additional modules to display.</div>
        </div>`;
    }

    const entryKey = entry => entry.kind === 'group' ? entry.key : entry.tag;
    const tabKeys = tabPlan.map(entryKey);
    let activeTag = loadActiveTab();
    if (!tabKeys.includes(activeTag)) activeTag = tabKeys[0];

    const tabMeta = (entry) => {
        if (entry.kind === 'group') return { icon: entry.group.icon, label: entry.group.name };
        const tag = entry.tag;
        if (tag === 'QUESTS') return { icon: BLOCK_ICONS.QUESTS || '📋', label: TAG_DISPLAY_NAMES.QUESTS || 'Misiones' };
        const customField = (s.customFields || []).find(f => f.tag.toUpperCase() === tag);
        return { icon: customField?.icon || BLOCK_ICONS[tag] || TAG_DISPLAY_NAMES[tag] || tag };
    };

    const tabBadge = (entry) => {
        if (entry.kind === 'group') {
            return `<span class="rt-tab-badge" title="${entry.tags.length} grouped modules">${entry.tags.length}</span>`;
        }
        const tag = entry.tag;
        if (tag === 'QUESTS') {
            const count = questsCtx?.quests?.length || 0;
            return count > 0 ? `<span class="rt-tab-badge">${count}</span>` : '';
        }
        if (blocks[tag] === undefined) return '';
        const items = blockToItems(tag, blocks[tag]);
        const count = Array.isArray(items) ? items.length : 0;
        let badges = count > 0 ? `<span class="rt-tab-badge">${count}</span>` : '';
        // PARTY's tab carries a secondary badge for its folded-in benched sub-panel count.
        if (tag === 'PARTY' && blocks['BENCHED PARTY'] !== undefined) {
            const benchedCount = extractBenchedRoster(blocks['BENCHED PARTY']).length;
            if (benchedCount > 0) badges += `<span class="rt-tab-badge rt-tab-badge-secondary" title="Benched">⛺${benchedCount}</span>`;
        }
        return badges;
    };

    const tabBtnHtml = (entry) => {
        const key = entryKey(entry);
        const { icon, label } = tabMeta(entry);
        const isActive = key === activeTag;
        return `<button class="rt-tab-btn${isActive ? ' active' : ''}" data-tag="${key}" title="${escapeHtml(label)}">
            <span class="rt-tab-icon">${escapeHtml(icon)}</span>${tabBadge(entry)}
        </button>`;
    };

    const tabStripHtml = `<div class="rt-tab-strip">${tabPlan.map(tabBtnHtml).join('')}</div>`;

    const activeEntry = tabPlan.find(entry => entryKey(entry) === activeTag);
    const contentHtml = activeEntry?.kind === 'group'
        ? renderDisplayGroupCard(activeEntry, blocks, collapsed, detached, sectionPages, s.displayGroupsShowGaps === true)
        : activeEntry?.tag === 'QUESTS'
            ? renderQuestLog(questsCtx?.quests || [], questsCtx?.currentTime || '', collapsed, detached, 'QUESTS')
            : renderSectionCard(activeEntry?.tag, blocks, collapsed, detached, sectionPages, activeEntry?.tag);

    return `<div class="rt-tabmode-wrap" data-tab-order="${tabKeys.join(',')}">
        <div class="rt-tabmode-pinned">${pinnedHtml}</div>
        ${vitalsHtml}
        ${tabStripHtml}
        <div class="rt-tabmode-content" data-active-tag="${activeTag}">${contentHtml}</div>
    </div>`;
}

// ── Quest Log Renderer ─────────────────────────────────────────────────────

/**
 * Renders the quest log as a section card, matching the rt-section-card structure
 * so collapse/detach/reattach work identically to other blocks.
 * @param {object[]} quests
 * @param {string} currentTime  in-world time string e.g. "08:00 AM, Day 2"
 * @param {Set<string>} collapsed
 * @param {Set<string>} detached
 * @param {string|null} filterTag  if set, only render if tag === 'QUESTS'
 * @returns {string}
 */
export function renderQuestLog(quests, currentTime, collapsed, detached, filterTag = null) {
    const TAG = 'QUESTS';

    if (filterTag && filterTag !== TAG) return '';

    if (!filterTag && detached.has(TAG)) {
        return `<div class="rt-detached-placeholder" data-tag="${TAG}">
            <span class="rt-placeholder-icon">⧉</span> QUESTS is detached
            <button class="rt-reattach-btn-inline" data-tag="${TAG}" title="Re-attach">↓</button>
        </div>`;
    }

    const allQuests = quests || [];
    const isCollapsed = collapsed.has(TAG);
    const detachBtn = !filterTag ? `<button class="rt-detach-btn" data-tag="${TAG}" title="Detach panel">⧉</button>` : '';

    if (allQuests.length === 0) {
        return `<div class="rt-section-card${isCollapsed ? ' rt-collapsed' : ''}" data-tag="${TAG}">
            <div class="rt-section-header" data-tag="${TAG}">
                <span>📋 QUESTS</span>
                <div class="rt-section-header-right">
                    ${detachBtn}
                    <span class="rt-item-count">0 entradas</span>
                    <span class="rt-collapse-icon">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
                </div>
            </div>
            <div class="rt-section-body"><div class="rt-card-line" style="opacity:0.6;">${t('hud.noQuests', 'No hay misiones activas en este momento.')}</div></div>
        </div>`;
    }

    const settings = getSettings();
    const showFrustration = !!settings.syspromptModules?.questsFrustration;
    const showDeadlines = !!settings.syspromptModules?.questsDeadlines;

    const renderQuestCard = (quest, opts = {}) => {
        const dismissible = !!opts.dismissible;

        const hasDeadline = questHasEffectiveDeadline(quest);
        const emergent = isEmergentQuest(quest);

        const { getQuestMood } = /** @type {any} */ (globalThis.__rpgQuestUtils || {});
        const moodData = hasDeadline && !emergent && typeof getQuestMood === 'function'
            ? getQuestMood(quest, currentTime, showFrustration)
            : { label: '', color: '#00cc77', value: null };

        const frust = moodData.value ?? 0;
        const label = moodData.label;
        const barColor = moodData.color;

        // frust: -1 = very pleased/just accepted, 0 = neutral/halfway, 1 = frustrated at deadline, >1 = overdue
        // Map to a centered display: 50% = neutral, 0% = very pleased, 100% = max frustrated
        // Clamp display to [-1, 2] range (values beyond 2 are "off the chart")
        const displayFrust = Math.max(-1, Math.min(2, frust));
        const scale        = 100 / 3; // -1→0%, 0→33%, 1→67%, 2→100%
        const fillPct      = Math.round((displayFrust + 1) * scale);

        const barTitle = showFrustration && moodData.label
            ? `NPC Mood: ${label} (${frust >= 0 ? '+' : ''}${frust.toFixed(2)})`
            : (hasDeadline && !emergent ? `Time Progress: ${label}` : '');

        // Tick mark at the neutral position (33%) and deadline position (67%)
        // Emergent quests: no NPC expects completion → no mood/frustration bar
        const moodBarHtml = hasDeadline && !emergent ? `
            <div class="rt-quest-mood-bar-wrap" title="${escapeHtml(barTitle)}">
                <div class="rt-quest-mood-bar" style="width:${fillPct}%; background:${barColor};"></div>
                <div class="rt-quest-mood-tick rt-quest-mood-tick-neutral"></div>
                <div class="rt-quest-mood-tick rt-quest-mood-tick-deadline"></div>
            </div>` : '';

        let statusBadgeClass = 'rt-quest-badge-active';
        let statusLabel = t('quests.statusActive', 'Active');
        if (quest.status === 'completed') { statusBadgeClass = 'rt-quest-badge-completed'; statusLabel = t('quests.statusCompleted', 'Completed'); }
        if (quest.status === 'past deadline') { statusBadgeClass = 'rt-quest-badge-failed'; statusLabel = t('quests.statusPastDeadline', 'Past Deadline'); }
        if (quest.status === 'failed')    { statusBadgeClass = 'rt-quest-badge-failed';    statusLabel = t('quests.statusFailed', 'Failed'); }

        const questIsCompleted = quest.status === 'completed';

        const objectives = (quest.objectives || []).map(obj => {
            const done = obj.status === 'completed' || (questIsCompleted && obj.status !== 'failed');
            const failed = obj.status === 'failed';
            const optLabel = obj.required ? '' : ' <span class="rt-quest-optional">(Optional)</span>';
            let objClass = 'rt-quest-obj';
            if (done) objClass += ' rt-quest-obj-done';
            if (failed) objClass += ' rt-quest-obj-failed';

            // Progress counter (e.g. "4/6", or bare "3" when total is unknown)
            const hasTotal = typeof obj.total === 'number';
            const hasProgress = typeof obj.progress === 'number' && !done && !failed;
            const progressHtml = hasProgress
                ? ` <span class="rt-quest-progress">${obj.progress}${hasTotal ? '/' + obj.total : ''}</span>`
                : '';

            return `<div class="${objClass}">
                <span class="rt-quest-check">${done ? '✓' : (failed ? '✗' : '○')}</span>
                <span>${escapeHtml(obj.text)}${progressHtml}${optLabel}</span>
            </div>`;
        }).join('');

        const rewards = (quest.rewards || []).map(r =>
            `<span class="rt-quest-reward">${escapeHtml(r)}</span>`
        ).join('');

        const currentTotalMins = parseInWorldTime(currentTime);
        const deadlineMins = parseInWorldTime(quest.deadline_time);
        let timeLeftHtml = '';
        if (currentTotalMins != null && deadlineMins != null && currentTotalMins > 0 && deadlineMins > 0) {
            const diff = deadlineMins - currentTotalMins;
            timeLeftHtml = ` <i style="opacity: 0.7; font-size: 0.9em;">(${formatTimeDiff(diff, diff > 0)})</i>`;
        }

        const acceptedMins = parseInWorldTime(quest.accepted_time);
        let acceptedRow = '';
        if (currentTotalMins != null && acceptedMins != null && currentTotalMins > 0 && acceptedMins > 0) {
            const diff = currentTotalMins - acceptedMins;
            acceptedRow = `
                <div class="rt-quest-deadline">
                    <div class="rt-quest-deadline-header">
                        <span class="rt-entity-sub-label">Accepted:</span> ${escapeHtml(quest.accepted_time)} <i style="opacity: 0.7; font-size: 0.9em;">(${formatTimeDiff(diff, false)})</i>
                    </div>
                </div>`;
        }

        const deadlineRow = (hasDeadline && showDeadlines) ? `
            <div class="rt-quest-deadline" style="${acceptedRow ? 'border-top: none; margin-top: 0;' : ''}">
                <div class="rt-quest-deadline-header">
                    <span class="rt-entity-sub-label">Deadline:</span> ${escapeHtml(quest.deadline_time)}${timeLeftHtml}
                    ${showFrustration ? `<span class="rt-quest-mood-label" style="color:${barColor};">${label}</span>` : ''}
                </div>
                ${moodBarHtml}
            </div>` : '';

        const isFailed = quest.status === 'failed' || quest.status === 'past deadline';
        let cardClass = 'rt-quest-card';
        if (quest.status !== 'active') cardClass += ' rt-quest-inactive';
        if (isFailed) cardClass += ' rt-quest-card-failed';

        const dismissBtn = dismissible
            ? `<button type="button" class="rt-quest-dismiss-btn" data-quest-id="${escapeHtml(quest.id)}" title="Remove from log">✕</button>`
            : '';

        return `<div class="${cardClass}" data-quest-id="${escapeHtml(quest.id)}">
            <div class="rt-quest-header">
                <span class="rt-quest-title">${escapeHtml(quest.title)}</span>
                <div class="rt-quest-badges">
                    <span class="rt-quest-badge ${statusBadgeClass}">${statusLabel}</span>
                    ${dismissBtn}
                </div>
            </div>
            <div class="rt-quest-giver">${escapeHtml(quest.giver_name)} · <em>${escapeHtml(quest.giver_location)}</em></div>
            <div class="rt-quest-objectives">${objectives}</div>
            ${rewards ? `<div class="rt-quest-rewards">${rewards}</div>` : ''}
            ${acceptedRow}
            ${deadlineRow}
        </div>`;
    };

    const activeQuests = allQuests.filter(q => !isArchivedQuestStatus(q.status));
    const completedQuests = allQuests.filter(q => String(q.status || '').toLowerCase().trim() === 'completed');
    const failedQuests = allQuests.filter(q => {
        const st = String(q.status || '').toLowerCase().trim();
        return st === 'failed' || st === 'past deadline';
    });

    const activeCardsHtml = activeQuests.map(q => renderQuestCard(q)).join('');
    const completedCardsHtml = completedQuests.map(q => renderQuestCard(q, { dismissible: true })).join('');
    const failedCardsHtml = failedQuests.map(q => renderQuestCard(q, { dismissible: true })).join('');

    let bodyHtml = activeCardsHtml || '<div class="rt-card-line" style="opacity:0.6; padding: 10px;">No active quests.</div>';

    if (completedQuests.length > 0) {
        const isCompletedCollapsed = collapsed.has(TAG + '_COMPLETED');
        bodyHtml += `
        <div class="rt-section-card rt-sub-section${isCompletedCollapsed ? ' rt-collapsed' : ''}" data-tag="${TAG}_COMPLETED" style="margin-top: 10px; background: rgba(0,0,0,0.2); border-color: rgba(255,255,255,0.05); border-radius: 6px;">
            <div class="rt-section-header" data-tag="${TAG}_COMPLETED" style="padding: 6px 10px; font-size: 0.9em; background: rgba(0,0,0,0.2); border-top-left-radius: 6px; border-top-right-radius: 6px;">
                <span style="opacity:0.8;">✅ COMPLETADAS</span>
                <div class="rt-section-header-right">
                    <span class="rt-item-count" style="opacity:0.6;">${completedQuests.length} ${completedQuests.length === 1 ? 'entrada' : 'entradas'}</span>
                    <span class="rt-collapse-icon" style="opacity:0.6;">${isCompletedCollapsed ? '&#9656;' : '&#9662;'}</span>
                </div>
            </div>
            <div class="rt-section-body" style="padding: 5px;">${completedCardsHtml}</div>
        </div>`;
    }

    if (failedQuests.length > 0) {
        const isFailedCollapsed = collapsed.has(TAG + '_FAILED');
        bodyHtml += `
        <div class="rt-section-card rt-sub-section${isFailedCollapsed ? ' rt-collapsed' : ''}" data-tag="${TAG}_FAILED" style="margin-top: 10px; background: rgba(0,0,0,0.2); border-color: rgba(255,80,80,0.12); border-radius: 6px;">
            <div class="rt-section-header" data-tag="${TAG}_FAILED" style="padding: 6px 10px; font-size: 0.9em; background: rgba(80,0,0,0.15); border-top-left-radius: 6px; border-top-right-radius: 6px;">
                <span style="opacity:0.8;">❌ FALLIDAS</span>
                <div class="rt-section-header-right">
                    <span class="rt-item-count" style="opacity:0.6;">${failedQuests.length} ${failedQuests.length === 1 ? 'entrada' : 'entradas'}</span>
                    <span class="rt-collapse-icon" style="opacity:0.6;">${isFailedCollapsed ? '&#9656;' : '&#9662;'}</span>
                </div>
            </div>
            <div class="rt-section-body" style="padding: 5px;">${failedCardsHtml}</div>
        </div>`;
    }

    const renderOptions = getSettings().categoryRenderOptions?.[TAG] || {};
    const catStyles = [];
    if (renderOptions.fontSize) catStyles.push(`--rt-cat-font-size: ${(renderOptions.fontSize / 13).toFixed(4)}em`);
    if (renderOptions.italic) catStyles.push(`--rt-cat-font-style: italic`);
    if (renderOptions.bold) catStyles.push(`--rt-cat-font-weight: bold`);
    if (renderOptions.bullets === false) catStyles.push(`--rt-cat-bullet-display: none`);
    if (renderOptions.bulletColor) catStyles.push(`--rt-cat-bullet-color: ${renderOptions.bulletColor}`);
    if (renderOptions.bulletStyle) catStyles.push(`--rt-cat-bullet-style: "${renderOptions.bulletStyle}"`);
    if (renderOptions.fontFamily) catStyles.push(`--rt-cat-font-family: ${renderOptions.fontFamily}`);
    if (renderOptions.textColor && renderOptions.textColor !== 'inherit') catStyles.push(`--rt-cat-text-color: ${renderOptions.textColor}`);
    const catStyleAttr = catStyles.length ? ` style='${catStyles.join('; ')}'` : '';

    return `<div class="rt-section-card${isCollapsed ? ' rt-collapsed' : ''}" data-tag="${TAG}">
        <div class="rt-section-header" data-tag="${TAG}">
            <span>📋 QUESTS</span>
            <div class="rt-section-header-right">
                ${detachBtn}
                <button class="rt-category-settings-btn" data-tag="${TAG}" title="Category Rendering Options">
                    <i class="fa-solid fa-cog"></i>
                </button>
                <span class="rt-item-count">${activeQuests.length} active</span>
                <span class="rt-collapse-icon">${isCollapsed ? '&#9656;' : '&#9662;'}</span>
            </div>
        </div>
        <div class="rt-section-body"${catStyleAttr} style="padding-bottom: 5px;">${bodyHtml}</div>
    </div>`;
}
    /**
     * Renders the Lorebook Agent's thought process into a terminal-like view.
     * @param {object[]} steps
     * @returns {string}
     */
    export function renderLorebookTerminal(steps) {
        if (!steps || steps.length === 0) return '';

        return steps.map(step => {
            const time = new Date(step.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            let icon = 'fa-brain';
            let color = 'var(--rt-custom-text-muted)';
            let title = 'Thought';

            switch (step.type) {
                case 'tool': icon = 'fa-screwdriver-wrench'; color = '#3498db'; title = 'Tool'; break;
                case 'result': icon = 'fa-list-ul'; color = '#9b59b6'; title = 'Result'; break;
                case 'error': icon = 'fa-circle-exclamation'; color = '#e74c3c'; title = 'Error'; break;
                case 'finish': icon = 'fa-circle-check'; color = '#2ecc71'; title = 'Finished'; break;
                case 'start': icon = 'fa-play'; color = '#f1c40f'; title = 'Starting'; break;
            }

            const content = escapeHtml(step.content);
            const metadata = step.metadata || {};

            return `
            <div class="rt-terminal-step" style="margin-bottom: 8px; font-family: var(--rt-custom-font-mono, monospace); font-size: 11px;">
                <div class="rt-terminal-header" style="display: flex; align-items: center; gap: 8px; opacity: 0.8;">
                    <span style="font-size: 9px; opacity: 0.5;">${time}</span>
                    <i class="fa-solid ${icon}" style="color: ${color}; width: 14px; text-align: center;"></i>
                    <b style="color: ${color}; text-transform: uppercase; letter-spacing: 0.5px;">${title}</b>
                    ${metadata.time ? `<span style="margin-left: auto; font-size: 10px; opacity: 0.6;">Worked for ${metadata.time}s</span>` : ''}
                </div>
                <div class="rt-terminal-content" style="margin-top: 4px; padding-left: 22px; line-height: 1.4; white-space: pre-wrap; word-break: break-all; color: var(--rt-custom-text);">
                    ${content}
                </div>
            </div>`;
        }).join('');
    }
