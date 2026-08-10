/**
 * Factory default settings object + factory reset helpers.
 */

import { DEFAULT_STOCK_PROMPTS } from '../../constants.js';
import { MODULE_NAME } from './schema-sections.js';
import { DEFAULT_MODULES } from './default-modules.js';
import { getDefaultPortraitLocationSystemPrompt } from './portrait-prompts.js';
import { adjustPromptTimestamps } from './router-utils.js';

/**
 * Keep shipped Lorebook prompts compact. Empty spacer lines add no meaning,
 * waste editor space/tokens, and made the exposed prompt fields difficult to scan.
 * User-owned prompt text is never passed through this helper.
 * @param {string} template
 * @returns {string}
 */
export function compactLorebookPromptTemplate(template) {
    return String(template || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.trim().length > 0)
        .join('\n')
        .trim();
}

/**
 * Build the exact canonical form presented by the prompt-upgrade dialog.
 * Resets must copy this same representation or accepting an update can leave
 * the stored prompt different from the acknowledged bundled snapshot.
 * @param {string} template
 * @returns {string}
 */
export function prepareShippedLorebookPromptTemplate(template) {
    return adjustPromptTimestamps(compactLorebookPromptTemplate(template), {
        useDdMmYyFormat: false,
        use24hTime: false,
    }).replace(/Day X/g, 'Day N');
}

/** Shared procedural naming rule for World Skeleton + Add NPC to Story creators. */
export const NEW_NPC_NAMING_RULE = `[New NPC Naming Rule: When introducing a new, unestablished character, silently create their name using these dynamic constraints:
Style & Culture: Analyze the current scene, local region, and surrounding characters. Match the linguistic flavor, tone, and naming conventions natively found in the immediate environment.
Mandatory Starting Sounds: First Name Root: '{{random:a,e,i,o,u,ba,be,bi,bo,bu,ca,ce,ci,co,cu,da,de,di,do,du,fa,fe,fi,fo,fu,ga,ge,gi,go,gu,ha,he,hi,ho,hu,ja,je,ji,jo,ju,ka,ke,ki,ko,ku,la,le,li,lo,lu,ma,me,mi,mo,mu,na,ne,ni,no,nu,pa,pe,pi,po,pu,qua,que,qui,quo,ra,re,ri,ro,ru,sa,se,si,so,su,ta,te,ti,to,tu,va,ve,vi,vo,vu,wa,we,wi,wo,wu,ya,ye,yi,yo,yu,za,ze,zi,zo,zu}}{{random:l,n,r,s,t,v,m,d}}' | Last Name Root: '{{random:a,e,i,o,u,ba,be,bi,bo,bu,ca,ce,ci,co,cu,da,de,di,do,du,fa,fe,fi,fo,fu,ga,ge,gi,go,gu,ha,he,hi,ho,hu,ja,je,ji,jo,ju,ka,ke,ki,ko,ku,la,le,li,lo,lu,ma,me,mi,mo,mu,na,ne,ni,no,nu,pa,pe,pi,po,pu,qua,que,qui,quo,ra,re,ri,ro,ru,sa,se,si,so,su,ta,te,ti,to,tu,va,ve,vi,vo,vu,wa,we,wi,wo,wu,ya,ye,yi,yo,yu,za,ze,zi,zo,zu}}{{random:l,n,r,s,t,v,m,d}}'.
Procedure: Treat the roots as the starting sound or prefix. Append natural syllables or traditional suffixes that fit the local culture and genre setting you identified. Ensure the final result is pronounceable and sounds like an authentic, ordinary name for this specific region. 
Anti-Echo Diversity: Do not rely on default high-frequency placeholder names. The first and last names must not rhyme or share similar suffixes. Output the final name naturally in the narrative without revealing the roots, style prompts, or generation process. Do not rename existing characters.]`;

/**

 * Builds a fresh copy of every settings default. Extracted from getSettings()

 * so it can be reused by getFactoryCartridgePayload() (the "Stock" Game

 * Cartridge) without duplicating this large literal.

 */

export function buildDefaultSettings() {

    return {

        currentMemo: "",

        /** Resolved combatants retained for display only; never injected into model context. */
        combatDefeatedUi: [],

        prevMemo1: "",

        prevMemo2: "",

        memoHistory: [],

        lastDelta: "",

        enabled: true,

        trackerCollapsed: false,

        /** Integrated panel content: 'tracker' | 'agent' (card-flip mode when docked). */

        trackerContentMode: 'tracker',

        agentCollapsed: false,

        agentImmersionMode: false,

        agentKeysCollapsed: false,

        agentSettingsOpen: true,

        agentConsoleOpen: true,

        agentModulesOpen: true,

        agentWorldOpen: false,

        dayNightCycleEnabled: false,

        /** Optional State Tracker panel backdrop (data URL or https URL). */

        panelBgImage: '',

        /** Optional night/late-night backdrop for State Tracker; falls back to panelBgImage when empty. */

        panelBgImageNight: '',

        /** 0–100: day/night tint strength over the State Tracker backdrop. */

        panelBgOverlayStrength: 55,

        /** Optional detached Lorebook Agent panel backdrop. */

        agentPanelBgImage: '',

        /** Optional night/late-night backdrop for detached Lorebook Agent. */

        agentPanelBgImageNight: '',

        /** 0–100: overlay strength for detached Lorebook Agent backdrop. */

        agentPanelBgOverlayStrength: 55,

        debugMode: false,

        connectionSource: "default",

        connectionProfileId: "",

        completionPresetId: "",
        adventureCompanionConnectionSource: "default",
        adventureCompanionConnectionProfileId: "",
        adventureCompanionCompletionPresetId: "",
        adventureCompanionOllamaUrl: "http://localhost:11434",
        adventureCompanionOllamaModel: "",
        adventureCompanionOpenaiUrl: "",
        adventureCompanionOpenaiKey: "",
        adventureCompanionOpenaiModel: "",
        adventureCompanionMaxTokens: 0,
        characterCreationConnectionSource: "default",
        characterCreationConnectionProfileId: "",
        characterCreationCompletionPresetId: "",
        characterCreationOllamaUrl: "http://localhost:11434",
        characterCreationOllamaModel: "",
        characterCreationOpenaiUrl: "",
        characterCreationOpenaiKey: "",
        characterCreationOpenaiModel: "",
        renderedViewActive: true,

        panelLayoutMode: 'stack',   // 'stack' = classic vertical stack | 'tabs' = compact tab mode (Character/Combat pinned, rest behind tabs)

        // BETA: global, display-only virtual hosts for related tracker modules.
        // Off by default so existing rendering is byte-for-byte unchanged until opted in.
        displayGroupsEnabled: false,
        displayGroupsShowGaps: false,
        displayGroups: [],

        maxTokens: 0,

        fontSize: 14,

        agentFontSize: 13,

        customSysprompt: false,

        /** When true (default), snapshot Quick Prompt Main before the framework overwrites it and restore on tracker disable. */

        mainSyspromptBackupEnabled: true,

        stashedMainSysprompt: '',

        syspromptStashArmed: false,

        rngEnabled: true,

        diceFunctionTool: false,

        enablePortraits: true,

        portraitsFileStorageVersion: 1,

        /** Migrated to 1 after legacy live portrait maps are assigned to the active chat. */

        portraitChatScopeVersion: 0,

        portraitGeneratorSource: "native",

        portraitSkipPromptDialog: false,

        /** When true, suppress info/success toasts from portrait/location AI auto-generation (errors still show). */

        hideImageGenToasts: false,

        portraitAutoGenerateParty: false,

        portraitAutoGeneratePlayer: false,

        portraitAutoGenerateEnemies: false,

        portraitAutoGenerateNpcs: false,

        portraitAutoGenerateLocations: false,

        /** Real-Time Mode: generate location images only on Scene View arrival (mutually exclusive with portraitAutoGenerateLocations). */

        portraitAutoGenerateSceneView: false,

        /**

         * Real-Time scene-art trigger:

         * - location_enter: generate once when arriving at a place with no image

         * - location_change: regenerate whenever the location path changes (incl. revisits)

         * - every_n_outputs: location_change + also regenerate every N chat outputs

         */

        portraitRealtimeTriggerMode: 'location_change',

        /** Used when portraitRealtimeTriggerMode === 'every_n_outputs' (min 1). */

        portraitRealtimeEveryNOutputs: 1,

        portraitRegenerateVisitedLocations: false,

        portraitLocationIncludePresentNpcs: false,

        pollinationsApiKey: "",

        pollinationsModel: "zimage",

        inventoryWorthMode: "hover",   // 'hover' = worth shown as tooltip only | 'display' = coin badge shown inline

        npcCoreSections: [],

        pcCoreSections: [],

        npcSectionPresets: {},

        pcSectionPresets: {},

        npcMajorWords: 25,

        npcMinorWords: 15,

        npcRelationshipMaxDefault: 150,

        npcRelationshipMax: 150,

        npcPortraits: true,

        locationImages: false,

        npcRelationshipBars: true,
        npcRelationshipUpdateMode: 'regex',
        // Optional editable instruction for State Tracker relationship commands.
        // Blank uses the built-in prompt.
        npcRelationshipStateTrackerPrompt: '',
        npcRelationshipToast: true,
        stateTrackerSwipeRollback: true,        // auto-roll back State Tracker memo on swipe           // emit toast notification when relationship values change

        npcRelationshipValues: {},

        npcRelationshipLog: {},      // { [fullId]: [{timestamp,field,delta,newValue,source}] } — capped 50/NPC

        experimentalNpcImport: true,

        ignoreNpcImportLimits: true,

        npcAddAsIsMode: 'ai_review',   // 'literal' = wrap card verbatim in [CORE]; 'ai_review' = minimal world/era fix before adding

        use24hTime: false,

        useDdMmYyFormat: false,

        initialDate: "Day 1",

        /** Initial time of day for a new campaign's first [TIME] block (matches use24hTime format). */
        initialTime: "08:00 AM",

        onboardingGenre: "fantasy",

        /** Starting level for character creation (1–20), or "none" for systems without numeric levels. */
        onboardingLevel: 1,

        onboardingGearTier: "auto",

        /** When false, the Character Creator omits the classic d20/BAB-style combat
         *  & skill scaling guide from generation prompts — for custom/homebrew systems. */
        onboardingUseCombatScalingGuide: true,

        /** When true, the State Model's Core Prompt is fully replaced by
         *  FULL_REVIEW_STATE_SYSTEM_PROMPT (below) every pass — forcing a complete,
         *  from-scratch verified state dump for every enabled module instead of a
         *  delta ("only output changed sections") update. Trades tokens/latency for
         *  reliability on weaker models that struggle with delta/BLOCK PERSISTENCE
         *  tracking. Any custom Core Prompt edits are ignored while this is on. */
        fullReviewStateMode: false,

        onboardingCustomInstructions: "",

        /** Legacy key retained as the Player Card toggle preference. */
        onboardingCreatePersona: false,
        /** Create/select a name-only SillyTavern persona for the chat sender label. */
        onboardingCreateSillyTavernPersona: true,
        onboardingPersonaWords: "150",

        onboardingPersonaWordsCustom: "",

        /** Last Character Creator form values, saved when Generate Character is pressed. */

        characterCreatorDraft: null,

        /** True while the Character Creator inline panel is open on the onboarding screen. */

        characterCreatorPanelOpen: false,

        barColors: {},

        animateAllCustomBarChanges: true,

        modulePageSizes: {},

        customTheme: null,

        savedThemes: {},

        /** Locked chrome for the floating settings window: 'dark' | 'light'. Independent of tracker/ST theme. */
        settingsOverlayAppearance: 'light',

        systemPromptTemplate:

            `You are the State Extractor Model. Your task is to maintain a structured State Memo based on the roleplay narrative.
<core_directives>
IGNORE NARRATIVE FLUFF: Do not track temporary dialogue or actions. Only track persistent state changes.
INTEGRATION: Track all durations stated by the narrative (e.g. 'poisoned for 3 turns'). Decrement by 1 each round in [COMBAT]. For out-of-combat/time-based durations, calculate the delta between the current [TIME] and the [TIME] in the PRIOR MEMO.
CREATION: You MAY create a section that did not exist in the Prior Memo when the narrative warrants it based on your enabled modules.
DELETION: To REMOVE a section entirely, you MUST output: \`[TAG]REMOVED[/TAG]\`.
</core_directives>
<modules>
You must track the following enabled modules:
{{modulesText}}
NEVER ignore a module.
</modules>
<rules>
1. Read the PRIOR MEMO and the NARRATIVE OUTPUT carefully.
2. Determine which sections changed. Only output sections that actually changed.
3. Use strict [TAG]...[/TAG] structure based on the modules requested above. ALWAYS include the closing tag.
4. Omit unchanged sections entirely. Do NOT output a section if its contents did not change.
5. BLOCK PERSISTENCE: For list-based sections ([PARTY], [INVENTORY], [ABILITIES], [SPELLS], [COMBAT]), if any single item within that section changes, you MUST re-output the ENTIRE section containing all items. Never omit existing members or items unless they are explicitly logically removed. In [COMBAT], preserve ENEMIES:/NON-PARTY ALLIES: grouping, never include members already listed in [PARTY], mark defeated enemies as Status: Defeated, and do not omit them from the memo.
6. If there are absolutely NO CHANGES to any section, you MUST output exactly: \`NO_CHANGES_DETECTED\`
7. Output ONLY the changed sections (or NO_CHANGES_DETECTED). No preamble, no explanation, no commentary.
8. Decrement/increment resources such as spell slots if they clearly are spent or gained even if the narrator doesn't explicitly mention that a slot/resource was expended.
</rules>
<list_formatting>
For sections with multiple items ([ABILITIES], [INVENTORY], [SPELLS], [PARTY]):
1. Use a bulleted list with \`-\`.
2. Format: \`- Name (Resource/Max, Effect Description)\`.
3. If no resource tracker is needed, use: \`- Name (Effect Description)\`.
4. The parentheses MUST contain the resource count FIRST, followed by a comma, then the description.
</list_formatting>
<buff_debuff_logic>
Duration Tracking: Record all durations explicitly. Use turns for combat (e.g., for 3 turns) and H:M for narrative time (e.g., 1h 30m).
Restoration Anchors: When a buff or debuff modifies a base statistic (AC, Attributes, etc.), record the base value directly in the respective field—e.g., 'AC 18 (base 13)'.
Status Formatting: Output the buff/debuff in the Status line with its absolute mathematical effect in parentheses. Example: 'Shield (+5 AC, 1 turn)'.
Auto-Reversion: During each State Sync, check if a duration has expired. If it has, use the modifier in the Status line to reverse the math on the base statistic (e.g., subtracting the +5 AC), restore the field, and remove the buff from the list.
Conditional Buffs: For effects without a set time, use event-based anchors. Example: 'Exhaustion (Disadvantage on Ability Checks, until Long Rest)'.
STATUS LABELING: In [CHARACTER], [PARTY], and [COMBAT] blocks, prefix positive status effects (buffs) with \`(+)\` and negative status effects (debuffs) with \`(-)\`. Every status MUST include its effect AND duration in parentheses. Example: \`Status: (+) Heroism (+2 Temp HP per turn, 9 turns), (-) Poisoned (Disadvantage on attacks, 2 turns)\`. Healthy or no effects needs no prefix.
Equipment Incompatibility: When a character equips an item they cannot properly use (wrong proficiency, insufficient Strength, class restriction, etc.), record it as an event-anchored debuff whose parenthetical MUST name the causing item so removal can be inferred when that item loses its [E] tag. Format: \`(-) [Penalty Label] ([effect(s)], while [Item Name] is equipped)\`. Example: \`(-) Armor Non-Proficiency (Disadvantage on Str/Dex checks, arcane spell failure, while Iron Plate Mail is equipped)\`.
</buff_debuff_logic>
<progression_logic>
Update abilities/attributes/HP/etc accordingly, such as an ability's 1d6 bonus increasing to 2d6, etc.
</progression_logic>
<custom_formatting>
You may be asked to use Markers: ((PLS)), ((B)), ((XB)), ((BDG)), ((HGT)). These are for graphical rendering options; use them if instructed but only if instructed in a specific [MODULE].
</custom_formatting>`,

        modules: {

            character: true,

            party: true,

            'benched party': true,

            combat: true,

            inventory: true,

            abilities: true,

            spells: true,

            time: true,

            xp: true,

            quests: true,

        },

        stockPrompts: { ...DEFAULT_STOCK_PROMPTS },

        customFields: [],

        customSyspromptLibrary: [],

        /**

         * System Prompt Control Room — explicit render order for every top-level

         * sysprompt section, mixing built-in tags and customSyspromptLibrary entries.

         * Entries are string keys: "base:<tag>" for one of the fixed built-in

         * sysprompt.txt tags, or "lib:<id>" for a customSyspromptLibrary entry

         * (unlocked_base overrides ride along on their "base:<tag>" slot — they

         * never get their own separate key). Empty array = not yet initialized;

         * normalizeSectionOrder() in game-systems.js lazily seeds/reconciles it.

         */

        syspromptSectionOrder: [],

        /**

         * Game System Wizard bundles — link a customSyspromptLibrary entry and/or a

         * customFields entry as a single manageable unit.

         * Shape: { id, name, icon, enabled, needsTracker,

         *          driverTime: boolean (value auto-ticks each turn from elapsed [TIME]

         *              minutes — a rate x minutes-elapsed formula, e.g. hunger/thirst/fatigue),

         *          driverGmAnnotation: boolean (value changes via GM-declared inline delta

         *              annotations requiring cross-turn narrative judgment, e.g. faction

         *              reputation, trust, sanity),

         *          driverStatedFact: boolean (tracker reads an objective number already

         *              plainly stated in the narrative output each turn, e.g. a stated

         *              damage amount — no judgment or annotation needed),

         *          (one or more drivers may be true at once; at least one must be true

         *              whenever needsTracker is true — see normalizeDrivers() in game-systems.js),

         *          effectOwner: 'tracker'|'gm' (who narrates a crossed threshold),

         *          syspromptLibraryId, customFieldTag, description, createdAt }

         */

        gameSystems: [],

        /**

         * Game Cartridges — named, exportable/importable snapshots of the entire

         * "configuration surface" (system prompt sections/order/toggles, Game

         * Systems, tracker modules, block order, stock prompts, extractor prompt,

         * RNG/format flags). See game-cartridges.js. Shape: { id, name,

         * description, icon, createdAt, updatedAt, format:'multihog-game-cartridge',

         * version:1, payload: <see getFactoryCartridgePayload()> }.

         */

        gameCartridges: [],

        profiles: {},

        activeProfile: "",

        fullViewSections: [],

        blockOrder: ['COMBAT', 'CHARACTER', 'PARTY', 'INVENTORY', 'ABILITIES', 'SPELLS', 'XP', 'TIME'],

        legacyDiceNaming: false,

        diceD100Mode: false,

        rngToolD20: false,

        rngToolD100: false,

        rngQueueD20: true,

        rngQueueD100: false,

        closeCount: 0,

        lookbackMessages: 2,

        directPromptContext: 5,

        historyIndex: -1,

        fullAuditMaxTokens: 32000,

        stateTrackerRunEvery: 1,

        ctxWorldInfo: false,

        lorebookFilter: [],

        ollamaUrl: "http://localhost:11434",

        ollamaModel: "",

        openaiUrl: "",

        openaiKey: "",

        openaiModel: "",

        openaiMaxTokens: 0,

        chatLinkEnabled: true,

        /** Also bind Control Room sections and State Tracker module configuration to each chat. */
        chatSetupLinkEnabled: true,

        /** Global definition catalogs; chats store only activation state and ordering. */
        chatSetupCatalogVersion: 0,
        trackerModuleDatabase: [],
        syspromptSnippetDatabase: [],
        gameSystemDatabase: [],
        chatStates: {},
        quests: [],

        /** Narrator <narrative> pacing mode: normal | shorter_outputs | high_agency | downtime. */
        narrativePacing: 'normal',

        syspromptModules: {

            loot: true,

            random_events: true,

            resting: true,

            party_bench: true,

            quests: true,

            questsDeadlines: true,
            questsFrustration: true,
            questsShowArchive: true,

            CYOA_mode: true,

            dungeon_reality_and_hidden_mapping: true,

        },

        cyoaConfig: {

            useCustomPrompt: false,

            customPromptText: '',

            slots: [

                { type: 'narrative' },

                { type: 'narrative' },

                { type: 'narrative' },

                { type: 'narrative' },

                { type: 'narrative' },

            ],

            presets: {},

            useEmojis: true,

            useXmlTag: true,

            useButtonTags: true,

            stripOldChoicesFromPrompt: true,

            buttonColor: '#120a28',

            buttonOpacity: 0.9,

            buttonTextColor: '',

            buttonBorderColor: '',

            choiceAccentColor: '',

            mechColor: '#ffc966',

            mechBgOpacity: 0.14,

            dcColor: '#ff9f6b',

            modColor: '#9fd4ff',

            tagColor: '#c9b0ff',

            mechAccentColor: '',

        },

        routerEnabled: true,

        routerLog: [],

        activeRouterKeys: [],

        activeWorldKeys: [],

        pinnedRouterKeys: [],  // entries permanently activated by the user — immune to agent/keyword deactivation

        keywordActivatedKeys: [],  // entries activated by keyword scanner — auto-expire when keyword leaves scan window

        // One-shot per chat: first Lorebook Agent pass may inject the PC [CHARACTER] block
        // as cold-start gear/equipment ground truth. Flipped true after that first pass.
        pcCharacterBlockSeeded: false,

        routerConnectionSource: "default",

        routerOpenaiUrl: "",

        routerOpenaiKey: "",

        routerOpenaiModel: "",

        routerOllamaUrl: "http://localhost:11434",

        routerOllamaModel: "",

        routerConnectionProfileId: "",

        routerCompletionPresetId: "",

        routerMaxTokens: 0,

        routerMaxTurns: 5,

        routerMaxActivations: 8,

        routerMaxKeywordOverflow: 0,   // 0 = unlimited; N = max extra keyword-activated entries above routerMaxActivations

        routerCampaignPrefix: "",

        routerDefaultPosition: 4,      // Default to 4 (at Depth) for prompt caching protection

        routerDefaultDepth: 4,

        routerDefaultOrder: 100,

        routerDefaultRole: 0,          // 0 = System, 1 = User, 2 = AI

        loreInjectionPosition: 4,

        loreInjectionDepth: 4,

        loreInjectionRole: 0,

        routerCampaignPrefixOverride: "",

        /** ST chat id for which `routerCampaignPrefixOverride` applies; empty = legacy (override only when chatId === active ctx chat id). */

        routerCampaignPrefixOverrideAnchorChatId: "",

        routerLookback: 4,

        routerDirectLookback: 10,

        routerDirectPrompt: "",

        routerBasicMode: false,

        routerNativeKeywordActivation: false,

        routerPaused: false,

        routerRunEvery: 3,

        routerIncludeHidden: false,

        routerSwipeRollback: true,   // undo lorebook pass when swiping away from the generation that triggered it

        routerLookbackSinceLastRun: true,   // default: capture all messages since the last agent run

        routerLookbackSinceLastUser: false,  // alternative: capture since last user message

        routerLastRunChatLength: 0,          // watermark: chat.length when the agent last ran (indexing only, not shown to user)

        routerLastRunAt: 0,                   // epoch ms: when the agent last completed a pass (for display)

        routerWatermarkBaselinePending: false, // one-shot: baseline watermark after lookback fix upgrade

        routerUndockHintShown: false,

        routerPromptForPrefix: false,

        routerModules: JSON.parse(JSON.stringify(DEFAULT_MODULES)),

        routerCustomTags: [],

        routerHistory: [],

        routerCleanupTokenThreshold: 300,

        routerCleanupEvery: 0,

        routerCleanupUseThreshold: true,

        // ── World Progression (deterministic, standalone pass) ────────────────────

        worldProgressionEnabled: false,           // master toggle

        worldProgressionIntervalHours: 24,        // fire every X in-world hours (24 = daily)

        worldProgressionKeepActive: 1,            // rolling window of active reports

        worldProgressionLookback: 20,             // number of recent chat messages to include (0 = disabled)

        worldProgressionHistoryLookback: 0,       // number of historical reports to incorporate (0 = include all)

        worldProgressionInjectionPosition: 4,     // Default to 4 (at Depth)

        worldProgressionInjectionDepth: 3,

        worldProgressionInjectionRole: 0,         // System

        worldProgressionRandomizeNPCs: false,            // toggle to randomize NPC pool

        worldProgressionRandomSkeletonNPCCount: 2,        // skeleton NPCs to spotlight per report

        worldProgressionRandomNarrativeNPCCount: 3,       // narrative NPCs to spotlight per report

        worldProgressionRandomizeLocations: false,        // toggle to randomize locations

        worldProgressionRandomSkeletonLocationCount: 2,   // skeleton locations to spotlight per report

        worldProgressionRandomNarrativeLocationCount: 2,  // narrative locations to spotlight per report

        worldProgressionRandomizeFactions: false,         // toggle to randomize factions

        worldProgressionRandomSkeletonFactionCount: 2,    // skeleton factions to spotlight per report

        worldProgressionRandomNarrativeFactionCount: 2,   // narrative factions to spotlight per report

        worldProgressionRandomizeConflicts: false,        // toggle to randomize conflicts

        worldProgressionRandomConflictCount: 3,           // number of conflicts to incorporate

        worldProgressionSkeletonFactions: 4,       // number of factions in skeleton

        worldProgressionSkeletonLocations: 4,      // number of locations in skeleton

        worldProgressionSkeletonNPCs: 0,           // number of NPCs in skeleton

        worldProgressionSkeletonConflicts: 3,      // number of conflicts in skeleton

        worldProgressionLastFiredAtMinutes: -1,   // last in-world total-minutes at which a report fired

        worldProgressionLastFiredPeriodLabel: '', // label of the last generated period entry

        worldProgressionConsolidateEnabled: false,         // auto-compress backlog when threshold is hit

        worldProgressionConsolidateInterval: 7,            // number of raw reports before consolidation fires

        worldProgressionSystemPrompt: `You are the World Progression Engine — a living simulation of the game world's off-screen activity. Simulate political scheming, faction moves, economic shifts, environmental changes, creature activity, rival actors pursuing independent agendas, weather events, and emergent consequences of prior world state.



The report covers the in-world period: **{periodLabel}**



## RULES

1. Do NOT summarize player actions. Build consequences from them instead — defeated rivals plot revenge, sympathetic contacts cover their tracks, encountered strangers react to what happened.

2. QUESTS and EVENTS are historical records for context only — they are NOT simulatable entities. Never generate entries that describe a quest advancing, stalling, succeeding, or failing. If a quest appears in the designated entities block, ignore it entirely.

3. Prioritize named ACTIVE WORLD LORE NPCs. Every report must include at least 2. These are your highest-value subjects. However, if the ## DESIGNATED ENTITIES FOR THIS PERIOD block is present, you MUST strictly follow it and only change the status, advance the timeline, or create new narrative beats for these designated entities. You are strictly forbidden from changing the status, advancing the timeline, or creating new narrative beats for unauthorized entities. However, you MAY mention them passively as background context if their past, established actions are a direct catalyst for the designated entities.

4. Tracked party members currently in [PARTY] are never eligible for this report — they are with {{user}} right now and are handled upstream, not by this rule. For any OTHER NPC who was physically present with {{user}} during the reporting period, only generate plausible background activity — digital actions, private decisions, private thoughts/opinions, off-screen communications. Do not relocate them.

5. Format as 15 bullet-pointed entries (using "- "), with a blank line (newline) between each world event. Dense, no filler, no markdown. Each entry must be exactly 1 sentence. Do NOT prefix the lines with the period or time label.

6. Output ONLY the report content. No preamble, no tags, no meta-commentary.

7. Do not simply repeat the same entities and always build on the previous report; take interesting entities from the ACTIVE WORLD LORE as well as the SKELETON regardless of whether they were featured in the previous report(s). If designated entities are provided, strictly limit your active scope to those, obeying the passive referencing rule for other entities.

8. DO NOT write a cumulative report, stacking old entries in the same report. Only write new events, not a recap of the previous ones; they are preserved in their own file.

9. Cross-category entity bleeding is desirable; often have designated NPCs, locations, factions, and conflicts collide or influence one another in the same narrative beat rather than treating them as isolated line items. However, only do this when it makes sense.

10. You must strictly respect geographical and logistical boundaries to preserve spatial plausibility; isolated or distant entities cannot physically interact and must instead collide via informational, digital, or financial ripples (e.g., radio tracking, digital alerts, automated network scrapers, or news traveling from afar).

11. Character vectors must take place only at or ripple through the designated locations provided for this period; if an active NPC cannot logically travel to a selected location within this time window, their connection must manifest purely as an off-screen reaction or informational dependency.`,

        // ── World Skeleton ─────────────────────────────────────────────────────────

        worldProgressionSkeletonAtmosphereSummary: '', // freeform Skeleton Source (legacy key retained for compatibility)

        worldProgressionSkeletonAtmosphereLookback: 30, // messages lookback count for atmosphere generation

        worldProgressionSkeletonUseExisting: true, // toggle to feed existing entries context when appending

        worldProgressionSkeletonUseLorebooks: false, // feed selected existing lorebooks into skeleton generation

        worldProgressionSkeletonLorebookFilter: [], // selected source lorebooks; empty means all non-skeleton books

        worldProgressionSkeletonLorebookOnly: false, // never extrapolate beyond explicitly mentioned source entities

        worldProgressionExclusionList: '',         // comma-separated list of lore entry titles or keys to exclude from focus randomization

        // NOTE: active [PARTY] members are always, unconditionally excluded from World

        // Progression (see router.js) — no setting needed. [BENCHED PARTY] members are

        // eligible for simulation, also unconditionally.



        worldProgressionSkeletonSystemPrompt: `You are a World Architect. Given world source material, generate a sparse foundational skeleton for an RPG campaign simulation.

## OUTPUT FORMAT — MANDATORY
Use exactly one section header followed by one level-three heading per entity:

## FACTIONS
### Faction Name
One or two sentences covering its nature and current tension.

## LOCATIONS
### Location Name
One or two sentences covering its description and current state.

## NPCS
### NPC Name
One or two sentences covering their role and current state.

## CONFLICTS
### Conflict Name
One or two sentences covering the involved parties and current state.

Generate exactly {factionCount} factions, {locationCount} locations, {npcCount} NPCs, and {conflictCount} conflicts. Omit the NPCS section entirely when its count is 0.

## RULES
- The line beginning with \`###\` is the title only. Never put a description, parties involved, labels, or metadata on that line.
- Put all descriptive text on the following line(s). In conflicts, state the parties naturally in the prose; never use a \`Parties involved:\` subheading.
- Do not use bold text, bullet lists, tables, JSON, or any headings other than the required \`##\` sections and \`###\` titles.
- Keep every entity consistent with the provided source material. No player-character references or placeholder names.
- Maximum two sentences per entity. Output only the structured content.

${NEW_NPC_NAMING_RULE}`,


        routerSystemPromptTemplate: prepareShippedLorebookPromptTemplate(`<basic_instructions>

You are the Researcher Agent, a specialized Dungeon Master's Assistant. Your role is to architect the AI Narrator's memory — keeping the Active Context saturated with the most relevant lore at all times.



You have the authority to browse the campaign archive, search for relevant history, and update {{campaignRoot}} to reflect new developments.



Do not wait for the Narrator to forget something before you act. If a name, place, or faction is mentioned — even in passing — load it immediately. If the party is moving, pre-load the destination before they arrive.



Make multiple entries per turn if necessary. Thoroughness is your primary virtue.

</basic_instructions>



<context_maximization>

Your goal is to keep the Active Context saturated. Think of it as a stage: it is your job to have every prop, actor, and set piece in place before the scene begins.



- **Saturation Goal:** Keep Active entries as close to MAX as possible at all times. An underloaded context is a failure state.

- **Proactive Loading:** Do not wait for a gap to appear. If a name or location is mentioned, or if the party is about to move, activate the relevant entries immediately.

- **Context Rotation:** When the context is full and new entries are needed, deactivate "Exit Contexts" (rooms left, NPCs departed, resolved threads) to make room for "Entry Contexts" (current room, present NPCs, active quest objective). Treat it as a sliding window, not a hard ceiling.

- **Priority Tiering:** Use this order when deciding what to keep vs. rotate out:

  1. NPCs physically present in the current scene

  2. The current sub-location (room, street, building)

  3. The parent location (district, dungeon, city)

  4. The active objective of the current Quest

  5. Relevant Factions or STATS for present characters

  6. Regional or world lore



If you briefly exceed the budget due to newly activated entries, deactivate the lowest-priority items in the same turn to return within range. It is better to rotate aggressively than to leave the Narrator without context.



Budget violation notices mean you exceeded the limit. When you see one, immediately identify and deactivate the least relevant entries (Exit Contexts first) until you are within budget. List those IDs in the \`deactivate\` field of the same commit call.

</context_maximization>



<player_character_safeguard>

The player character (the user) is the protagonist.

- Do NOT create a lorebook entry (NPC, Location, Faction, etc.) for the player character under any circumstances.

- The player character is the speaker labeled "Player" (and prompt replacement "{{user}}"). In the chat logs, pay close attention to what name(s) or alias(es) the other characters use when addressing or referring to the "Player" (e.g., if they address the Player as "Dave Davidson" or "Dave", then "Dave Davidson" is the player character).

- Under no circumstances should you create an NPC entry for these names/aliases, because they refer to the player.

- Always use the exact macro string \`{{user}}\` when referring to the player. Do NOT write the plain word "user", "player", "Player", or the player's roleplay character name (like "Dave Davidson") in plain text in any entry updates or descriptions.

</player_character_safeguard>



<formatting>

When recording a new entry, keep the lorebook category separate from the entity label.



- **REQUIRED category field:** Every \`record\` item MUST include \`"category": "NPC"|"LOC"|"FAC"|"QUEST"|"EVENT"\` (or an enabled custom tag). This field alone chooses which lorebook receives the entry (NPCs / Locations / Factions / …). Omitting it dumps the entry into the wrong book.

- Use the "category" field for the type. Never rely on the label, \`::\` hierarchy, or [CORE] content to imply the book — those do not route.

- Use the "label" field for the entity name only. Do NOT prefix labels with the category tag. Location labels may use \`" :: "\` hierarchy (e.g. "Kalvermoor :: The Ring") AND must still set \`"category": "LOC"\`.

- NPC people get \`"category": "NPC"\` with a plain name label (no \`::\`). Locations get \`"category": "LOC"\`.

- **IMPORTANT FOR KEYWORDS (KEYS):** Always include the entity's own name/title (without any timestamps like "Day 1", "Day 2", "12:15 AM", etc.) in the list of keywords. The title itself (stripped of timestamps) is the most reliable trigger, so it must be present as a keyword. For example, if the entry title is "[12:15 AM, Day 2] Defense of Ironbelly's Workshop", the keys list MUST include "Defense of Ironbelly's Workshop".

- **DO NOT INCLUDE \`{{user}}\`, \`{{char}}\`, or general player references** in the keyword list (\`keys\`). The user/player is present in all events/locations, so including them as a keyword causes false matches and wastes context tokens.



Correct examples:

- {"label": "Lissa", "category": "NPC", "keys": ["Lissa", "rope-keeper"], "content": "[CORE]\\nSpecies: …\\n[/CORE]"}

- {"label": "Kalvermoor :: The Handler's Rest", "category": "LOC", "keys": ["The Handler's Rest", "Kalvermoor", "tavern"], "content": "[CORE]\\nA weathered tavern…\\n[/CORE]"}

- {"label": "Iron Syndicate", "category": "FAC", "keys": ["Iron Syndicate", "faction"]}

- {"label": "Thalric Thorne", "category": "STATS", "keys": ["Thalric Thorne", "stats"]}

- {"label": "[12:15 AM, Day 2] Defense of Ironbelly's Workshop", "category": "EVENT", "keys": ["Defense of Ironbelly's Workshop", "siege", "workshop"]}



Incorrect examples:

- {"label": "Lissa", "keys": ["Lissa"], "content": "[CORE]…"} (MISSING required "category": "NPC" — will not land in the NPCs lorebook)

- {"label": "Kalvermoor :: The Ring", "keys": ["The Ring"], "content": "[CORE]…"} (MISSING required "category": "LOC" — \`::\` nesting is not a category)

- {"label": "FAC: Iron Syndicate", "category": "FAC", "keys": ["faction"]} (missing the entity name keyword)

- {"label": "[12:15 AM, Day 2] Defense of Ironbelly's Workshop", "category": "EVENT", "keys": ["[12:15 AM, Day 2] Defense of Ironbelly's Workshop"]} (includes the timestamp in keyword, which will never trigger reliably)

</formatting>



<quests>

When you log a quest, describe the location and the quest giver in a single paragraph, including details about them that will be relevant to location persistence when {{user}} eventually returns to turn in the quest.

</quests>



<updating_entities>

When an entity (location, NPC, etc.) changes in a meaningful way, update the associated lorebook entry.



Entries are append-only chronicles. Provide ONLY the new information as a timestamped delta (e.g. "[Day 3, 14:00] The forge was destroyed."). Do NOT rewrite or re-summarize the full entry. Do NOT copy, paraphrase, or reconstruct content already present in the existing entry. Only the net-new development belongs in your delta.



EXCEPTION — NPC combat profiles: an NPC's combat stats are NOT a chronicle event and must never be written as a timestamped delta line. Per the COMBAT_PROFILE_PERSISTENCE rule for NPCs, they belong inside [CORE] as a patched identity field, edited in place.



IMPORTANT: Always use the exact macro string \`{{user}}\` when referring to the player. Do NOT write the plain word "user" or "player" in your entry updates.



- **COMBAT GRANULARITY**: Do NOT record granular, turn-by-turn combat status updates (e.g., individual monster HP, turn actions, temporary combat conditions). For long combats, limit updates to the initiation (e.g., when they became hostile and attacked {{user}}), a high-level progress update every ~5 rounds to capture major shifts, and the final macro-level outcome (e.g., the battle resolved, who died/survived/fled).



For locations: the [ID:] stamp at the top of every injected entry gives you the ID to pass to the update tool.

IMPORTANT: Never include the [ID:] line in the content field you write. It is managed automatically — only use the ID value in the "id" field of the update tool.



EVENT entries use this format:

  [Day X, HH:MM] <one-sentence fact>

  [Day X, HH:MM] <next development>

  [Day X, HH:MM] <next development after that, etc>

Each line is a standalone delta. Never write a paragraph. Never reference prior lines.

</updating_entities>



<timestamps>

The current world date/time is visible in the ## NARRATIVE section — look for the status footer in recent messages (e.g. "11:52 AM, Day 1").

When recording an EVENT or any time-sensitive entry, include the timestamp at the beginning of the content.

Example: "[Day 1, 11:52] Character signed the contract with Brodrik."

</timestamps>



<bravery>

Don't be afraid to hit the budget exactly. It's better to lean towards activating too much than too little.

</bravery>`),

        routerModularPromptTemplate: prepareShippedLorebookPromptTemplate(`## FORMAT

Use these tags in your response:

{{formatLines}}



## HIERARCHY CONVENTION (CRITICAL FOR LOCATIONS)

For LOC entries, the Name field MUST be the FULL hierarchical path using " :: " (space, colon, colon, space) as the separator.

The current scene's location stack is shown above as "CURRENT LOCATION". Prepend it to any sub-location you record.



Examples:

  CURRENT LOCATION: Khelt :: Rust-Lantern District

  --> [[LOC: Khelt :: Rust-Lantern District :: Marrow-Deep Mines Office | A squat iron building managing mining contracts. | Marrow-Deep Mines Office, mines, contracts, Khelt, Rust-Lantern]]

  --> [[LOC: Khelt :: Rust-Lantern District :: The Guilded Anvil Tavern | A noisy tavern with a job bulletin board. | The Guilded Anvil Tavern, tavern, jobs, Khelt, Rust-Lantern]]



Also include each ancestor name (Khelt, Rust-Lantern District) as a plain keyword in the Keywords field.

**LOC [CORE]:** When first recording a place, wrap 1–2 permanent sentences in plain \`[CORE] … [/CORE]\`. Do NOT use NPC field headers (Appearance/Species, Personality, etc.).

**IMPORTANT FOR KEYWORDS:** Always include the entry's own title/name (without any timestamps like "Day 1", "Day 2", "12:15 AM", etc.) in the keywords field. The title itself (stripped of timestamps) is the most reliable trigger, so it must be present as a keyword. For example, for a tag representing a "Defense of Ironbelly's Workshop" event, the keywords MUST contain "Defense of Ironbelly's Workshop". DO NOT INCLUDE \`{{user}}\`, \`{{char}}\`, or general player references in the keywords field — the player is present in all events and locations, so tagging them is redundant and wastes context tokens.



NPC / FAC / QUEST / EVENT labels: Name only — NO " :: " hierarchy, NO tag prefix.

Example: [[FAC: Iron Syndicate | ...]]  NOT  [[FAC: Khelt :: Iron Syndicate | ...]]  and  NOT  [[FAC: FAC: Iron Syndicate | ...]]



**FAC [CORE]:** Wrap history, ideology, schemes, and members inside a plain \`[CORE] … [/CORE]\` block in the **Description** field.

**FAC** uses four fields: \`Name | Status | Description | Keywords\`. Put a concise current-state line in **Status** (standing, conflicts, recent changes); put history, ideology, schemes, and members in **Description** (wrapped in \`[CORE] ... [/CORE]\`).`),

        // ── Basic Mode system prompt template ─────────────────────────────────
        // Editable Basic Mode base template. {{modularPrompt}} is expanded from
        // routerModularPromptTemplate for each request without mutating either source.
        routerBasicSystemPromptTemplate: prepareShippedLorebookPromptTemplate(`You are the Research Assistant. Your task is to identify and record important narrative entities and events.

{{modularPrompt}}

## ATTENTION & MEMORY
1. **NEWLY ACTIVATED THIS TURN**: Entries whose keywords appeared in the latest narrator output are pre-loaded here with full content. You do not need to activate them again — they are already active.
2. **ACTIVE MEMORY**: Full details of all other currently active entities. You can update them at any time.
3. **ARCHIVE INDEX**: Inactive entries — labels and keywords only. You CANNOT see their full biography.
4. **RECALL**: To read or update an archive entry, use [[ACTIVATE: Name]]. Its full content becomes visible next turn.
5. **LIMIT**: You are limited to **{{maxActivations}} active entries**. Nothing is archived automatically. If you exceed this limit you will see a **BUDGET VIOLATION** line and you MUST use [[DEACTIVATE: Name]] on the least relevant active entries to return within budget before this pass ends.

{{relSection}}

## [CORE] BY CATEGORY
- **NPC**: structured \`[CORE]\` with {{sectionNames}} (see NPC field instructions below).
- **LOC**: plain \`[CORE]\` with 1–2 sentences describing the place. No field headers.
- **FAC**: plain \`[CORE]\` wrapping permanent history, ideology, schemes, and members. No field headers.
- **QUEST, EVENT**: do NOT use \`[CORE]\`. Use timestamped chronicle lines only.

## PLAYER CHARACTER SAFEGUARD
- Do NOT create a lorebook entry (NPC, Location, Faction, etc.) for the player character under any circumstances.
- The player character is the speaker labeled "Player" (and prompt replacement "{{user}}"). In the chat logs, pay close attention to what name(s) or alias(es) the other characters use when addressing or referring to the "Player" (e.g., if they call the Player "Dave Davidson" or "Dave", then "Dave Davidson" is the player character).
- Under no circumstances should you create an NPC entry for these names/aliases, because they refer to the player.
- Always use the exact macro string \`{{user}}\` when referring to the player. Do NOT write the plain word "user", "player", "Player", or the player's roleplay character name (like "Dave Davidson") in plain text in any entry updates or descriptions.
- Write \`{{user}}\` bare — never followed by a class, profession, title, or parenthetical (e.g. write "{{user}} acquires the handgun", NOT "{{user}} (Fighter) acquires the handgun" or "{{user}} (Bodybuilder) acquires..."). The player's class/role is tracked elsewhere (the CHARACTER module); repeating it in every chronicle line wastes tokens and is redundant.
- You may update the Player Character's own Body via \`[[UPDATE_APPEARANCE: {{user}} | new body text]]\` (basic) or \`commit.appearance\` with id \`{{user}}\` / \`player\` / \`pc\` / the PC's name when their signature look permanently changes.
- You may update the Player Character's own Worn Equipment via \`[[UPDATE_EQUIPMENT: {{user}} | new worn gear text]]\` (basic) or \`commit.equipment\` the same way, whenever their visibly worn/carried gear changes.
- Never touch the PC's Species/Personality/Background/Habits/Strengths/Flaws, and never create a new PC lorebook entry.
- Body means signature/default physical look (build, face, hair, features) — not a transient pose. Worn Equipment means currently worn/carried gear only — not Body, coins, loot piles, or inventory lists.

## NPC CORE UPDATES (NPC only)
- Body changes: output \`[[UPDATE_APPEARANCE: Book::UID or NPC Name | new body text]]\`. Body is signature/default physical look — not a transient outfit-of-the-scene.
- Worn Equipment changes: output \`[[UPDATE_EQUIPMENT: Book::UID or NPC Name | new worn gear text]]\` whenever the narrative explicitly shows a change to what they're wearing/wielding. Do not put coins or inventory lists here.
- Eligible UPDATE_CORE fields this pass: {{eligibleCoreFields}}.
  [[UPDATE_CORE: Book::UID or NPC Name | FieldName | New field text]]
Use the exact FieldName. Do NOT log core updates as normal event/update entries.{{autoPassRestriction}}{{existingNpcNudge}}

## DO NOT RE-RECORD EXISTING ENTITIES
Before outputting [[NPC:...]], [[LOC:...]], [[FAC:...]], etc. for anyone or anything, check ACTIVE MEMORY and ARCHIVE INDEX for a matching name (they may be listed under a different label — check keywords too).
- If the entity ALREADY EXISTS (in ACTIVE MEMORY, in NEWLY ACTIVATED, or in the ARCHIVE INDEX): do NOT output a new [[NPC:...]]/[[LOC:...]]/[[FAC:...]] tag with a fresh [CORE] block for them, even if you don't currently see their full content. Instead:
  - To change Body: use [[UPDATE_APPEARANCE: Name | new text]].
  - To change Worn Equipment: use [[UPDATE_EQUIPMENT: Name | new text]].
  - To change/add another eligible [CORE] field: use [[UPDATE_CORE: Name | FieldName | new text]].
  - To append a chronicle/timeline note: use the module's normal update format (e.g. re-use the [[EVENT:...]] name to accumulate, or update the existing entry) — never a second [CORE] block.
  - To bring an archived entry into full view first: use [[ACTIVATE: Name]].
- Only use a fresh [[NPC:...]]/[[LOC:...]]/[[FAC:...]] record for entities that are BRAND NEW and have never appeared in ACTIVE MEMORY or ARCHIVE INDEX before.

{{combatProfileGuidance}}

## RULES
1. Only record persistent or significant entities/events.
2. Use ACTIVATE to bring an existing entry into the current scene context.
3. Use DEACTIVATE to remove an entry that is no longer relevant to the scene.
4. Use DELETE to permanently remove duplicate or redundant entries.
5. Do NOT create any entry for the player character (e.g. "Player" or "Dave Davidson").
6. CRITICAL: Do NOT blindly copy the formatting or sections of other characters found in ACTIVE MEMORY. You MUST strictly use ONLY the sections instructed below ({{sectionNames}}) for NPCs and ignore any other sections.
7. Output your thoughts first, then the tags.

{{example}}`),

        // ── Agent Mode shared context template ────────────────────────────────
        // The complete context appended to the agent instructions in Agent Mode.
        routerAgentSharedContextTemplate: prepareShippedLorebookPromptTemplate(`
## MEMORY LIMIT
Maximum Active Entities: **{{maxActivations}}**.
- Entries you record are ACTIVATED AUTOMATICALLY. Do NOT also include them in activate.
- Nothing is archived automatically. If you exceed the limit you will receive a **BUDGET VIOLATION** in the context and you MUST deactivate enough entries in that same commit call to return within budget. Choose the narratively least relevant entries.
- Entries whose keywords appeared in the latest Narrator output may already appear under **NEWLY ACTIVATED THIS TURN** with full content — you do not need to activate those again.
- Always use exact Book::UID format (e.g. "Eldoria_NPCs::0") for activate/update/deactivate/delete_ids.

{{relSection}}

## PLAYER CHARACTER SAFEGUARD
- Do NOT create a lorebook entry for the player character under any circumstances.
- Always use the exact macro string \`{{user}}\` when referring to the player in entry contents — bare, never with a class/profession parenthetical.
- You may update the Player Character's own Body via commit.appearance with id \`{{user}}\` / \`player\` / \`pc\` / the PC's name when their signature look permanently changes.
- You may update the Player Character's own Worn Equipment via commit.equipment the same way, whenever their visibly worn/carried gear changes.
- Never touch the PC's Species/Personality/Background/Habits/Strengths/Flaws, and never create a new PC lorebook entry.
- Body means signature/default physical look (build, face, hair, features) — not a transient pose. Worn Equipment means currently worn/carried gear only — not Body, coins, loot piles, or inventory lists.

## NPC CORE UPDATES
- Body: use \`commit.appearance\` (signature/default physical look only — not a transient outfit-of-the-scene).
- Worn Equipment: use \`commit.equipment\` whenever their visibly worn/carried gear changes. Not coins, loot piles, or inventory lists.
- Eligible commit.core fields this pass: {{eligibleCoreFields}}.{{autoPassRestriction}}{{existingNpcNudge}}

## DO NOT RE-RECORD EXISTING ENTITIES
Before using \`record\` for anyone or anything, check ACTIVE MEMORY, NEWLY ACTIVATED THIS TURN, and the ARCHIVE INDEX for a matching name (check keywords too, they may be listed under a different label).
- If the entity ALREADY EXISTS anywhere in that context — even if you only see its label in the ARCHIVE INDEX with no full content — do NOT call \`record\` for it. Instead:
  - To change Body: use \`commit({"appearance": [{"id": "Book::UID or Name", "content": "..."}]})\`.
  - To change Worn Equipment: use \`commit({"equipment": [{"id": "Book::UID or Name", "content": "..."}]})\`.
  - To change/add another eligible [CORE] field: use \`commit({"core": [{"id": "Book::UID or Name", "field": "...", "content": "..."}]})\`.
  - To append new chronicle text: use \`commit({"update": [{"id": "Book::UID or Name", "content": "..."}]})\`.
  - To see its full content first: use \`read_entry\` or \`grep_lore\`, or \`activate\` it.
- Only use \`record\` for entities that are BRAND NEW and have never appeared in ACTIVE MEMORY, NEWLY ACTIVATED, or the ARCHIVE INDEX before.

{{combatProfileGuidance}}

## WORLD SKELETON (OFF-LIMITS)
World Skeleton lorebooks (names ending in _Skeleton) are hidden seed data for World Progression only. They are NOT in your archive, tools cannot access them, and you must NEVER activate, read, update, or commit changes to Skeleton entries.

## CAMPAIGN CONTEXT
Campaign Root: "{{campaignRoot}}"
  NPCs -> "{{campaignNpcBook}}"
  Locations -> "{{campaignLocBook}}" (etc.)
**Routing:** every new \`record\` MUST set \`"category"\` to match the target book above (\`NPC\` → NPCs book, \`LOC\` → Locations, etc.). Labels and \`::\` paths do NOT choose the book — only \`category\` does.
Location hierarchy: use " :: " separator in labels (e.g. "Khelt :: Rust-Lantern District :: The Guilded Anvil") together with \`"category": "LOC"\`.
NPC people use a plain name label and \`"category": "NPC"\` (never put people under a \`::\` path).
Include the entity name/title itself (without timestamps like "[Day 1]") as a keyword, plus any ancestor location names (e.g. keys: ["The Guilded Anvil", "Khelt", "Rust-Lantern District", "tavern"]).
**Keyword cap: maximum 6 per entry.** Keep only the most essential trigger words.

## CONTENT FORMAT
- Each time-stamped event must start on its own line. Do NOT chain multiple '[Day X, ...]' entries on the same line.
- Correct: '[Day 2, 10:42] Corruption manifests.\\n[Day 2, 10:44] Sentry targets Rozach.'
- Wrong:   '[Day 2, 10:42] Corruption manifests. [Day 2, 10:44] Sentry targets Rozach.'
- **[CORE] by category:** NPC = structured fields inside [CORE] (see NPC instructions). LOC = plain [CORE], 1–2 sentences, no field headers. FAC = plain [CORE] wrapping permanent history/ideology, no field headers. QUEST/EVENT = no [CORE].
- CRITICAL: Do NOT blindly copy the formatting or sections of other characters found in ACTIVE MEMORY. You MUST strictly use ONLY the sections instructed below for NPCs and ignore any other sections.

## FIELD INSTRUCTIONS
{{fieldInstructions}}`),

        categoryRenderOptions: {},

        combatProfileAutoSwitch: false,

        combatConnectionProfileId: "",

        combatCompletionPresetId: "",

        portraitConnectionSource: "default",

        portraitConnectionProfileId: "",

        portraitCompletionPresetId: "",

        portraitOllamaUrl: "http://localhost:11434",

        portraitOllamaModel: "",

        portraitOpenaiUrl: "",

        portraitOpenaiKey: "",

        portraitOpenaiModel: "",

        portraitPromptWordTarget: 200,

        portraitNpcSystemPrompt: `You are a portrait prompt generator for AI image models. Given an NPC's lorebook description from an RPG campaign, output a single detailed image generation prompt.



Focus on:

- Physical appearance (race, build, facial features, skin color, hair) — draw primarily from the NPC's lorebook entry

- Clothing, armor, equipment visible on the character

- Pose and expression appropriate to the character's personality

- Art style: high-quality fantasy portrait, dramatic lighting, detailed



Rules:

- Output ONLY the prompt text, nothing else. No preamble, no explanation.

- Keep it under {{wordtarget}} words.

- The NPC lorebook entry is your PRIMARY source of truth for this character's appearance.

- Use the narrator card and scene context only for world setting/art style guidance.

- Focus on visual details. Do not include game stats, relationship values, or non-visual information.`,

        portraitCharacterSystemPrompt: `You are a portrait prompt generator for AI image models. Given character context from an RPG game, output a single detailed image generation prompt suitable for an AI image model.



You are provided with the full Lorebook Agent context — all currently active lore entries with their keywords and content — as well as the current game state. Use these to infer accurate visual details about the character, their world, and their situation.



Focus on:

- Physical appearance (race, build, facial features, skin color, hair)

- Clothing, armor, equipment visible on the character

- Pose and expression appropriate to the character's personality

- Art style: high-quality fantasy portrait, dramatic lighting, detailed



Rules:

- Output ONLY the prompt text, nothing else. No preamble, no explanation.

- Keep it under {{wordtarget}} words.

- A user persona is provided for reference. If it does NOT describe the character "{{name}}", ignore it entirely and do not use any of its details in the portrait prompt.

- Focus on visual details. Do not include game stats, abilities, or non-visual information.`,

        portraitLocationSystemPrompt: getDefaultPortraitLocationSystemPrompt(false),

        savedPortraitPromptPresets: {},

        worldConnectionSource: "default",

        worldConnectionProfileId: "",

        worldCompletionPresetId: "",

        worldOllamaUrl: "http://localhost:11434",

        worldOllamaModel: "",

        worldOpenaiUrl: "",

        worldOpenaiKey: "",

        worldOpenaiModel: "",

        gameSystemWizardConnectionSource: "default",

        gameSystemWizardConnectionProfileId: "",

        gameSystemWizardCompletionPresetId: "",

        gameSystemWizardOllamaUrl: "http://localhost:11434",

        gameSystemWizardOllamaModel: "",

        gameSystemWizardOpenaiUrl: "",

        gameSystemWizardOpenaiKey: "",

        gameSystemWizardOpenaiModel: "",

        gameSystemWizardSystemPrompt: "",

        gameSystemWizardLookback: 10,

        gameSystemWizardLookbackAll: false,

        gameSystemWizardInjectLore: false,

        gameSystemWizardInjectMemo: false,

        lastResetVersion: "",

        lastSeenPromptDefaultsFingerprint: "",

        /** @type {ReturnType<typeof buildBundledPromptsSnapshot>|null} Last-acked shipped defaults (for upgrade diffs). */

        lastSeenPromptDefaultsSnapshot: null,

        /**
         * Timestamp of the last critical-settings localStorage backup that is known
         * to be present on disk. Used to heal displayGroups / prompt-ack after a
         * reload cancels ST's async settings save.
         */
        criticalSettingsSyncedTs: 0,

        autoResetPromptsOnUpdate: false,

        userPromptSuffix: '## OUTPUT ONLY CHANGED SECTIONS:',

    };

}


/**
 * Full-replacement Core Prompt used when `settings.fullReviewStateMode` is on.
 * Unlike the normal delta-based systemPromptTemplate ("only output changed sections"),
 * this forces a complete, from-scratch verified state dump for every enabled module on
 * every single pass — no NO_CHANGES_DETECTED escape hatch, no omitting unchanged sections.
 * Intentionally replaces (not appends to) the Core Prompt, since the whole point is a
 * simple, unambiguous contract that weaker models can't misinterpret or drift from.
 */
/** User-prompt suffix forced while Full Review Mode is on (replaces settings.userPromptSuffix). */
export const FULL_REVIEW_USER_PROMPT_SUFFIX = '## OUTPUT THE COMPLETE, VERIFIED STATE MEMO FOR EVERY ENABLED MODULE:';

export const FULL_REVIEW_STATE_SYSTEM_PROMPT =
    `You are the State Extractor Model operating in FULL REVIEW MODE. Your task is to output the COMPLETE, VERIFIED State Memo for EVERY SINGLE enabled module, every single time. This is not optional.
<core_directives>
IGNORE NARRATIVE FLUFF: Do not track temporary dialogue or actions. Only track persistent state changes.
INTEGRATION: Track all durations stated by the narrative (e.g. 'poisoned for 3 turns'). Decrement by 1 each round in [COMBAT]. For out-of-combat/time-based durations, calculate the delta between the current [TIME] and the [TIME] in the PRIOR MEMO.
CREATION: You MAY create a section that did not exist in the Prior Memo when the narrative warrants it based on your enabled modules.
DELETION: To REMOVE a section entirely, you MUST output: \`[TAG]REMOVED[/TAG]\`.
</core_directives>
<modules>
You must track the following enabled modules:
{{modulesText}}
NEVER ignore a module.
</modules>
<rules>
1. Read the PRIOR MEMO and the NARRATIVE OUTPUT carefully.
2. Go through EVERY enabled module ONE BY ONE. For each, verify every field, every sub-field, every value against the narrative and the Prior Memo.
3. Use strict [TAG]...[/TAG] structure based on the modules requested above. ALWAYS include the closing tag.
4. Output the COMPLETE contents of every enabled module that currently has real content to report — not just changes, but the ENTIRE current state of that module. Omitting a module that has real, ongoing content is a critical failure.
5. NEVER output an empty tag pair with nothing inside (e.g. \`[PARTY]\\n[/PARTY]\`). If a module genuinely has nothing to report right now (e.g. no party members, not in active combat, no spells known), simply leave that section out of your output entirely — do not invent an empty block just to "include" it.
6. BLOCK PERSISTENCE: For list-based sections ([PARTY], [INVENTORY], [ABILITIES], [SPELLS], [COMBAT]), output the ENTIRE section with ALL items. Never omit existing members or items unless they are explicitly logically removed. In [COMBAT], preserve ENEMIES:/NON-PARTY ALLIES: grouping, never include members already listed in [PARTY], mark defeated enemies as Status: Defeated, and do not omit them from the memo.
7. \`NO_CHANGES_DETECTED\` is FORBIDDEN. Even if nothing changed, re-output the complete, unchanged state for every module that has real content — omit modules with nothing to report as per rule 5.
8. No preamble, no explanation, no commentary. Output ONLY the state memo sections.
9. Decrement/increment resources such as spell slots if they clearly are spent or gained even if the narrator doesn't explicitly mention that a slot/resource was expended.
</rules>
<list_formatting>
For sections with multiple items ([ABILITIES], [INVENTORY], [SPELLS], [PARTY]):
1. Use a bulleted list with \`-\`.
2. Format: \`- Name (Resource/Max, Effect Description)\`.
3. If no resource tracker is needed, use: \`- Name (Effect Description)\`.
4. The parentheses MUST contain the resource count FIRST, followed by a comma, then the description.
</list_formatting>
<buff_debuff_logic>
Duration Tracking: Record all durations explicitly. Use turns for combat (e.g., for 3 turns) and H:M for narrative time (e.g., 1h 30m).
Restoration Anchors: When a buff or debuff modifies a base statistic (AC, Attributes, etc.), record the base value directly in the respective field—e.g., 'AC 18 (base 13)'.
Status Formatting: Output the buff/debuff in the Status line with its absolute mathematical effect in parentheses. Example: 'Shield (+5 AC, 1 turn)'.
Auto-Reversion: During each State Sync, check if a duration has expired. If it has, use the modifier in the Status line to reverse the math on the base statistic (e.g., subtracting the +5 AC), restore the field, and remove the buff from the list.
Conditional Buffs: For effects without a set time, use event-based anchors. Example: 'Exhaustion (Disadvantage on Ability Checks, until Long Rest)'.
STATUS LABELING: In [CHARACTER], [PARTY], and [COMBAT] blocks, prefix positive status effects (buffs) with \`(+)\` and negative status effects (debuffs) with \`(-)\`. Every status MUST include its effect AND duration in parentheses. Example: \`Status: (+) Heroism (+2 Temp HP per turn, 9 turns), (-) Poisoned (Disadvantage on attacks, 2 turns)\`. Healthy or no effects needs no prefix.
Equipment Incompatibility: When a character equips an item they cannot properly use (wrong proficiency, insufficient Strength, class restriction, etc.), record it as an event-anchored debuff whose parenthetical MUST name the causing item so removal can be inferred when that item loses its [E] tag. Format: \`(-) [Penalty Label] ([effect(s)], while [Item Name] is equipped)\`. Example: \`(-) Armor Non-Proficiency (Disadvantage on Str/Dex checks, arcane spell failure, while Iron Plate Mail is equipped)\`.
</buff_debuff_logic>
<progression_logic>
Update abilities/attributes/HP/etc accordingly, such as an ability's 1d6 bonus increasing to 2d6, etc.
</progression_logic>
<custom_formatting>
You may be asked to use Markers: ((PLS)), ((B)), ((XB)), ((BDG)), ((HGT)). These are for graphical rendering options; use them if instructed but only if instructed in a specific [MODULE].
</custom_formatting>`;


/** Latest settings migration version — factory reset skips legacy upgrade paths at or below this. */

export const FACTORY_SETTINGS_VERSION = '5.5.16';


/** Remove extension UI keys from localStorage so a factory reset does not rehydrate stale panel state. */

export function clearExtensionLocalStorageUiState() {

    const keys = [];

    for (let i = 0; i < localStorage.length; i++) {

        const key = localStorage.key(i);

        if (key?.startsWith('rpg_tracker_')) keys.push(key);

    }

    for (const key of keys) localStorage.removeItem(key);

}



/**

 * Replace live extension settings with a pristine factory-default object.

 * @param {Record<string, unknown>} extensionSettings SillyTavern extensionSettings map

 */

export function applyFactoryReset(extensionSettings) {

    const s = JSON.parse(JSON.stringify(buildDefaultSettings()));

    s.settingsVersion = FACTORY_SETTINGS_VERSION;

    s.customPortraits = {};

    s.customLocationImages = {};

    extensionSettings[MODULE_NAME] = s;

}



/** Fast deterministic hash for comparing bundled default prompt content across releases. */
