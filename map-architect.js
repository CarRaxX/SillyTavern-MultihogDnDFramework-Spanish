/** Dedicated one-shot dungeon/site map generation agent. */
import { getSettings } from './state-manager.js';
import { sendStateRequest } from './llm-client.js';
import {
    dungeonLabelsMatch,
    formatDungeonMapForNarrator,
    getDungeonMessageText,
    parseDungeonMapDocument,
    stripCapturedDungeonMapsFromPrompt,
    validateDungeonMapArchitecture,
} from './dungeon-reality.js';
import { persistArchitectDungeonMap, syncDungeonMapsToLocationLorebook } from './router.js';
import { DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT } from './map-architect-prompt.js';
import { parseMapArchitectResponse } from './map-architect-parser.js';
export { parseMapArchitectResponse } from './map-architect-parser.js';

const architectRuns = new Map();
const MAX_CORRECTION_ATTEMPTS = 2;

function normalizeKey(value) {
    return String(value || '').trim().toLocaleLowerCase();
}

function roleForMessage(message) {
    if (message?.is_user || String(message?.role || '').toLowerCase() === 'user') return 'PLAYER';
    return 'NARRATOR';
}

function recentStoryContext(ctx, lookback, dungeonState) {
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    if (lookback <= 0) return '';
    const recent = chat.slice(-Math.max(0, lookback)).map(message => ({
        ...message,
        content: Array.isArray(message?.content)
            ? message.content.map(part => (part && typeof part === 'object' ? { ...part } : part))
            : message?.content,
    }));
    stripCapturedDungeonMapsFromPrompt(recent, dungeonState);
    return recent.map(message => {
        const text = getDungeonMessageText(message).trim();
        return text ? `${roleForMessage(message)}: ${text}` : '';
    }).filter(Boolean).join('\n\n');
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
        maxTokens: Math.max(1000, Number(settings.mapArchitectMaxTokens) || 6000),
        debugMode: !!settings.debugMode,
    };
}

function initialUserPrompt(args, context) {
    return `CREATE ONE PRIVATE MAP\nExact site root: ${args.site}\nEntrance area: ${args.entrance}\nScale: ${args.scale}\nEstablished premise: ${args.premise}\n\nRECENT STORY CONTEXT\n${context || '(No additional recent context.)'}\n\nOutput only the required JSON object.`;
}

function correctionPrompt(args, context, priorOutput, parseError, errors, attempt) {
    const issues = parseError
        ? [{ code: 'INVALID_JSON', path: '$', hint: parseError }]
        : errors.map(({ code, path, hint }) => ({ code, path, hint }));
    return `CORRECTION PASS ${attempt}\nYour previous map was rejected. Return a complete corrected JSON object, not a patch.\n\nRequested site: ${args.site}\nRequested entrance: ${args.entrance}\nScale: ${args.scale}\nPremise: ${args.premise}\n\nVALIDATION ERRORS\n${JSON.stringify(issues, null, 2)}\n\nPREVIOUS OUTPUT\n${priorOutput}\n\nRECENT STORY CONTEXT\n${context || '(No additional recent context.)'}\n\nOutput only the corrected JSON object.`;
}

function existingResult(siteRecord) {
    const document = parseDungeonMapDocument(siteRecord.mapChunks[0], siteRecord.siteRoot).document;
    return `[MAP_ARCHITECT_RESULT — PRIVATE]\nA map for ${siteRecord.siteRoot} was already attached. Reuse it; do not create or replace it.\n\n${formatDungeonMapForNarrator(document)}\n\nKeep unseen facts private and continue narration from the player-observable entrance.\n[/MAP_ARCHITECT_RESULT]`;
}

async function runMapArchitectOnce(rawArgs) {
    const args = {
        site: String(rawArgs?.site || '').trim(),
        entrance: String(rawArgs?.entrance || '').trim(),
        premise: String(rawArgs?.premise || '').trim(),
        scale: String(rawArgs?.scale || 'MEDIUM').trim().toUpperCase(),
    };
    if (!args.site || !args.entrance || !args.premise) {
        return '[MAP_ARCHITECT_ERROR — PRIVATE] site, entrance, and premise are required. Establish those facts, then call CreateDungeonMap again before narrating entry. [/MAP_ARCHITECT_ERROR]';
    }
    if (!['SMALL', 'MEDIUM', 'LARGE'].includes(args.scale)) args.scale = 'MEDIUM';

    const ctx = SillyTavern.getContext();
    const settings = getSettings();
    const current = await syncDungeonMapsToLocationLorebook(ctx.chat || [], { capture: false });
    if ((current.errors || []).some(error => /no campaign prefix/i.test(String(error)))) {
        return '[MAP_ARCHITECT_ERROR — PRIVATE]\nNo campaign prefix is available, so there is no safe Locations lorebook target. Nothing was generated or saved. Ask the user to configure the Lorebook Agent campaign prefix before entering the site.\n[/MAP_ARCHITECT_ERROR]';
    }
    const existing = Object.values(current.sites || {}).find(record => dungeonLabelsMatch(record?.siteRoot, args.site));
    if (existing?.mapChunks?.length) return existingResult(existing);

    const configuredLookback = Number(settings.mapArchitectLookback);
    const lookback = Number.isFinite(configuredLookback) ? Math.max(0, configuredLookback) : 12;
    const context = recentStoryContext(ctx, lookback, current);
    const systemPrompt = String(settings.mapArchitectSystemPrompt || DEFAULT_MAP_ARCHITECT_SYSTEM_PROMPT).trim();
    let prompt = initialUserPrompt(args, context);
    let lastIssues = [];

    for (let attempt = 0; attempt <= MAX_CORRECTION_ATTEMPTS; attempt++) {
        const output = await sendStateRequest(requestSettings(settings), systemPrompt, prompt);
        const parsed = parseMapArchitectResponse(output);
        const validation = parsed.value
            ? validateDungeonMapArchitecture(parsed.value, { site: args.site, entrance: args.entrance, scale: args.scale })
            : { valid: false, errors: [] };
        if (validation.valid) {
            const saved = await persistArchitectDungeonMap(args.site, validation.document);
            const status = saved.existing ? 'A concurrent map already existed and was preserved.' : `Map saved to ${saved.entryId}.`;
            return `[MAP_ARCHITECT_RESULT — PRIVATE]\n${status}\nTreat this as objective current canon. Do not expose unseen facts.\n\n${formatDungeonMapForNarrator(saved.document)}\n\nContinue narration from ${args.entrance}; reveal only what the player can perceive.\n[/MAP_ARCHITECT_RESULT]`;
        }
        lastIssues = parsed.error
            ? [{ code: 'INVALID_JSON', path: '$', hint: parsed.error }]
            : validation.errors;
        if (attempt < MAX_CORRECTION_ATTEMPTS) {
            prompt = correctionPrompt(args, context, output, parsed.error, validation.errors, attempt + 1);
        }
    }

    const concise = lastIssues.slice(0, 12).map(issue => `${issue.code} at ${issue.path}: ${issue.hint}`).join('; ');
    return `[MAP_ARCHITECT_ERROR — PRIVATE]\nThe architect could not produce a valid connected map after ${MAX_CORRECTION_ATTEMPTS + 1} attempts. Nothing was saved. Problems: ${concise}\nDo not narrate entry yet; call CreateDungeonMap again with clearer premise details.\n[/MAP_ARCHITECT_ERROR]`;
}

/** Dedupe parallel/repeated tool calls for the same site within one generation. */
export function runMapArchitect(args) {
    const key = normalizeKey(args?.site);
    if (architectRuns.has(key)) return architectRuns.get(key);
    const run = runMapArchitectOnce(args)
        .catch(error => {
            console.error('[RPG Tracker] Map Architect failed:', error);
            return `[MAP_ARCHITECT_ERROR — PRIVATE]\nMap Architect failed before a validated map could be saved: ${String(error?.message || error)}\nDo not invent or narrate the hidden site map. Retry CreateDungeonMap once the connection or persistence problem is resolved.\n[/MAP_ARCHITECT_ERROR]`;
        })
        .finally(() => architectRuns.delete(key));
    architectRuns.set(key, run);
    return run;
}
