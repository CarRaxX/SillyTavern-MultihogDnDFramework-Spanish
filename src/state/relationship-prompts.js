/**
 * Relationship instruction / sysprompt string builders.
 */

import { getNpcRelationshipMax } from './relationship-math.js';
import {
    DEFAULT_ROUTER_REL_SECTION_AGENT,
    DEFAULT_ROUTER_REL_SECTION_BASIC,
    expandRelationshipPctPlaceholders,
} from './lorebook-runtime-fragments.js';

export const RELATIONSHIP_UPDATE_MODES = {
    REGEX: 'regex',
    STATE_TRACKER: 'state_tracker',
};

/**
 * Keeps existing campaigns on the original narrator-regex behavior unless they
 * explicitly select the State Tracker command mode.
 * @param {any} settings
 */
export function getRelationshipUpdateMode(settings) {
    return settings?.npcRelationshipUpdateMode === RELATIONSHIP_UPDATE_MODES.STATE_TRACKER
        ? RELATIONSHIP_UPDATE_MODES.STATE_TRACKER
        : RELATIONSHIP_UPDATE_MODES.REGEX;
}

/**
 * Chat-regex relationship awards come directly from narrator output and do not
 * depend on a State Tracker or Lorebook Agent pass. Their pause flags must not
 * suppress this path.
 * @param {any} settings
 */
export function shouldProcessRegexRelationshipUpdates(settings) {
    return !!settings?.enabled
        && !!settings?.npcRelationshipBars
        && getRelationshipUpdateMode(settings) === RELATIONSHIP_UPDATE_MODES.REGEX;
}

export function buildNpcRelationshipInstruction(max, passedSettings = null) {
    const settings = passedSettings && typeof passedSettings === 'object' ? passedSettings : {};
    const m = max ?? getNpcRelationshipMax(settings);
    return expandRelationshipPctPlaceholders(
        String(settings.routerRelSectionAgentTemplate || DEFAULT_ROUTER_REL_SECTION_AGENT),
        m,
    );
}

/**
 * Basic-mode router prompt block for [[REL:]] tags — same scaled guidelines.
 * @param {number} [max]
 * @param {Record<string, any>} [passedSettings]
 * @returns {string}
 */
export function buildRouterRelationshipInstruction(max, passedSettings = null) {
    const settings = passedSettings && typeof passedSettings === 'object' ? passedSettings : {};
    const m = max ?? getNpcRelationshipMax(settings);
    return expandRelationshipPctPlaceholders(
        String(settings.routerRelSectionBasicTemplate || DEFAULT_ROUTER_REL_SECTION_BASIC),
        m,
    );
}

/**
 * State Tracker instruction for tag-based, code-applied relationship changes.
 * @param {number} [max]
 * @param {boolean} [isFullContext]
 * @param {string} [customPrompt]
 * @returns {string}
 */
export function buildStateTrackerRelationshipCommandInstruction(max, isFullContext = false, customPrompt = '') {
    const m = max ?? getNpcRelationshipMax();
    const fullAuditRule = isFullContext
        ? 'This is a full-history audit, so do not emit a [RELATIONS] block. Do not replay historical relationship changes.'
        : 'The GM narrator is authoritative for relationship points. Only convert its explicit relationship annotations; never infer, award, adjust, or omit a delta yourself.';

    if (typeof customPrompt === 'string' && customPrompt.trim()) {
        return customPrompt.trim()
            .replaceAll('{{max}}', String(m))
            .replaceAll('{{full_audit_rule}}', fullAuditRule);
    }

    return `## RELATIONSHIP DELTA COMMANDS
${fullAuditRule}

Emit this block only when there is at least one qualifying change:
[RELATIONS]
Friendship +5 Exact NPC Name
Affection -2 Exact NPC Name
[/RELATIONS]

Typical narrator annotations look like:
*(Friendship: Marcus +10 — saved his life in the alley)*
*(Affection: Elena +2 — she seemed touched by the compliment)*

Record a delta when the narrator's intent to award relationship points is clear, even if its punctuation, wording, capitalization, spacing, or surrounding formatting is slightly different from these examples. Do not invent a relationship award when that intent is unclear.

Each command is one line: axis first (Friendship or Affection), signed whole-number delta second, then the NPC name. Preserve the intended axis, NPC, and delta; discard only the explanation. Do not add reasons, bullets, punctuation, or any other text inside the block. If there are no clear narrator relationship awards, do not output a [RELATIONS] block. Each command is clamped to -${m} through +${m}.`;
}

/**
 * Narrator sysprompt <relationship_tracking> block — scale line tied to configured max.
 * Delta guide magnitudes stay absolute (same point awards at any range width).
 * @param {number} [max]
 * @returns {string}
 */
export function buildRelationshipTrackingSysprompt(max) {
    const m = max ?? getNpcRelationshipMax();
    return `RELATIONSHIP TRACKING — only active when [NPC_RELATIONS] appears in context.

[NPC_RELATIONS] at the top of each turn shows current standings with active NPCs. Scale: -${m} (deep hostility) to +${m} (deep bond). Friendship = platonic trust. Affection = romantic/emotional warmth. Point changes are absolute increments clamped to ±${m}.

WHEN TO EMIT:
Be selective and natural. Only emit when {{user}} directly and meaningfully interacted with an NPC — a real moment worth noting. Magnitude MUST reflect the NPC's personality: a stoic warrior shifts less than a warm innkeeper for the same act.

DO NOT EMIT when: the interaction has no emotional weight (buying supplies, directions), the NPC is absent, or nothing meaningful happened between {{user}} and that NPC this turn.

INLINE ANNOTATION (visible — place immediately after the triggering moment):
*(Friendship: Marcus +10 — saved his life in the alley)*
*(Affection: Elena +2 — she seemed touched by the compliment)*`;
}

/**
 * Builds the NPC instruction string based on current NPC settings.
 * @param {number} majorWords
 * @param {number} minorWords
 * @returns {string}
 */
