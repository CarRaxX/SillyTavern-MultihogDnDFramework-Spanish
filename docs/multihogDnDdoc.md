# Multihog D&D Framework

Welcome to Multihog D&D Framework, a simulation-focused AI RPG platform that is highly modular and customizable. Your imagination is the ceiling.

This document is written so the Adventure Companion (or a new player) can explain **what the system is**, **how a turn actually runs**, and **how to use each major feature** without inventing behavior.

## NOTE TO ADVENTURE COMPANION

When **Tutorial Mode** is enabled, this document is injected into every Adventure Companion request as its source of truth for explaining the framework. Tutorial Mode does not create a separate bot or remove the Companion's other capabilities.

The Adventure Companion's CHAT view can be detached into a draggable, resizable floating panel with the **⧉** control on desktop. On mobile it always uses the full-height floating presentation, with no detach or reattach control. Its header keeps the same collapse/expand arrow used by the main tracker, so the player can minimize CHAT without leaving it. Reattaching moves the same live conversation back into the State Tracker panel, and closing CHAT reattaches it automatically.

Adventure Companion has its own **Connection Settings** drawer and can use Main API, a Connection **Profile**, or dedicated Ollama/OpenAI endpoints independently from State Tracker. The same drawer mirrors all CHAT options: Tutorial Mode, story lookback count / All, Lorebook Agent lore injection, and State Tracker memo injection.

The **Adventure Companion can perform exactly three actions** when ordinary conversational language shows clear intent — and nothing else:

1. Send a direct command to the **State Tracker** to correct or update mechanical campaign state.
2. Send a direct command to the **Lorebook Agent** to create or update campaign lore.
3. **Act for the player** by submitting their next turn. When CYOA mode is active, it may choose one of the current CYOA buttons or type a player action through SillyTavern's normal chat input. When CYOA mode is inactive, it submits through the normal chat input.

Those three are the hard limit. The Companion cannot operate Multihog UI controls (settings drawers, relationship editors, NPC card panels, inventory UIs, module toggles, invented menu paths). Campaign or lore changes must go through State Tracker / Lorebook Agent commands, not imagined UI steps. If it is unsure whether a control exists, it must say so or use one of the three actions — never invent buttons, tabs, or editors.

Players do not need exact command strings, magic phrases, imperative wording, or the subsystem names. Polite questions, indirect requests, and requests to show, test, or demonstrate the capability count as action intent. For an underspecified demo, the Companion may choose one small, harmless, clearly labeled demo addition.

The Adventure Companion must not treat brainstorming, theories, casual possibilities, or hypothetical discussion as authorization unless the player also indicates that the idea should be recorded or applied. It should preserve the player's intent, infer only minor low-risk details, report the action result honestly, and must not change extension settings or narrate new story outcomes itself. Acting for the player only submits a player turn; the main narrator remains responsible for advancing the story.

Acting for the player requires clear intent to submit a turn, such as “choose for me,” “take my turn,” “act for me,” or “continue for me.” Asking “What should I choose?” requests advice and does not submit a turn.

After acting for the player, the Adventure Companion responds with a brief, lively reaction to its choice rather than repeating the submitted text or showing a mechanical success receipt. It must not invent the narrator's outcome.

The D&D setup is the default plug-and-play cartridge. You can scrap the stock system prompt and modules and track whatever you want — fantasy, slice-of-life, modern, sci-fi, or pure homebrew.

**Local / weaker State Tracker models:** If the player mentions running the State Tracker on a local or smaller model (e.g. Gemma, Mistral Small, Qwen, Llama, Phi, or similar), proactively recommend enabling **Full Review Mode** under **State Tracker & Modules** (directly below **Enable State Tracker**). Explain that the default tracker prompt asks for delta updates only (“changed sections”), which weaker models often mishandle by dropping persistent modules; Full Review Mode replaces that Core Prompt with a complete every-module dump each pass. Tradeoff: more tokens and latency per tracker run, much more reliable memo consistency. Do **not** pretend you can flip the checkbox yourself — tell them where it is.

## Designer Note from Multihog
This system is neither a full version of 5e nor 3.5e. It's rather a hybrid system that streamlines in places. For example, attacks per round are reduced to decrease the GM's cognitive load, ensuring reliability is high. This kind of "cut the corners where it makes sense" design is employed all over the system. For example, combat uses BAB, which is based on 3.5e/Pathfinder, but the LLM may use 5e spells and such. A lot of the system rides on LLMs' vast inherent knowledge about D&D, which enables Multihog to keep the system lean and not define every rule. A big part of the system prompt focuses on constraints, what NOT to allow the player to do, which is a crucial part of keeping the simulation feeling authentic. This is stuff such as resting limits (only every 9 hours by default) and forbidding the player from using items they don't have, etc.

### What This System is
Multihog D&D Framework is a "simulation autism"-focused platform. It seeks to give you an experience where choices matter, consequence is real, and failure is entirely possible. It seeks to give weight to your choices and actions.

### What This System NOT
It isn't a 1:1 D&D-faithful virtual tabletop engine. In fact, I don't even care about D&D in particular. D&D is just a means to an end, a convenient set of constraints because it's baked into every single LLM to an extreme degree, almost making it deterministically reliable. Models can also adapt the system dynamically to all sorts of homebrew. Do not expect a 1:1 D&D replica. This is more akin to the Infinity Engine games such as Icewind Dale an Baldur's Gate 1 and 2, where they took all sorts of liberties to adapt the system to a Real-Time With Pause engine. I am taking similar liberties, except the substrate is roleplaying with AI/LLMs.

**The medium must be respected if one is to build a robust system that doesn't fall apart.**

---

## The Core Components

1. **The System Prompt** — the brain of the Game Master (GM) / Narrator; game logic lives here.
2. **The State Tracker** — the mechanical “accountant”; keeps HP, inventory, time, combat, and more aligned with the story.
3. **Hybrid RNG** — deterministic dice queues and/or commitment-based tool-call dice so the world has real physics instead of plot armor.
4. **The Lorebook Agent** — the librarian; chronicles NPCs, locations, factions, events, and relationships for long-term memory.
5. **World Progression** — macroscopic off-screen world simulation on an in-world time schedule.

Together they address the four classic LLM-tabletop failures: forgotten inventory/spells, lost long-term context, inevitable player victory, and a static world outside the player’s bubble.

---

Suggested companion: **[Summaryception](https://github.com/Lodactio/Extension-Summaryception)** — context compression that pairs well with Lorebook Agent (rough arc from the summarizer; microscopic records from the agent). Without a summarizing extension, the context will balloon out of control. I really recommend grabbing something like Summaryception that creates summaries and hides the full messages from the chat.

---

## Recommended Models

These are recommendations, not rules.

| Role | Suggestion | Notes |
|------|------------|--------|
| Narrator / GM | MiMo 2.5 Pro, Deepseek V4 Pro/latest Flash, or GPT-5.6 Luna | Needs **tool calling** if you use Hybrid RNG (tool-call mode). |
| State Tracker + Lorebook Agent | Gemini Flash-Lite/Flash, Deepseek V4 Flash 0731, or GPT-5.6 Luna | All are seriously inexpensive and promising; there is no firm recommendation yet. |
| State Tracker (local / smaller) | Gemma, Mistral Small, Qwen, Llama, Phi, and similar | Usable, but enable **Full Review Mode** (State Tracker → Core Prompt). See below. |
| Adventure Companion | Claude Sonnet 5 / Opus 5, GPT-5.6 Sol, or another model of similar capability | The Companion benefits from a strong general-purpose model for nuanced discussion, framework help, and reliable action handling. |
| Combat narrator (optional) | Any faster model | Use **Combat API Override** so combat uses a faster model while `[COMBAT]` is active. |

### More About Models

For the narrator, I'd recommend trying at least the following:

- MiMo 2.5 Pro
- Deepseek V4 Pro and latest Flash
- GPT-5.6 Luna, for its great cost-efficiency. Seems to be a decent model overall.

*For the State Tracker and Lorebook Agent, I've been recommending the Gemini Flash-Lite and Flash models. However, now I'm not sure at all anymore. Deepseek V4 Flash 0731 recently came out and is very promising, and the same goes for GPT-5.6 Luna. These are seriously inexpensive models and seem to be heavy-hitters in terms of performance.*

*Local / smaller State Tracker models (Gemma 4 and friends, Mistral Small, Qwen, Llama, Phi, etc.): turn on* ***Full Review Mode*** *in State Tracker & Modules (just below Enable State Tracker). The stock tracker asks for delta updates only; weaker models often drop unchanged-but-still-true modules. Full Review Mode replaces the Core Prompt so every pass dumps the complete verified state for every enabled module. Costs more tokens per run; far more reliable for local setups.*

*If your model thinks too long in combat, enable* ***Combat API Override*** *in State Tracker settings — it auto-switches when the* *[COMBAT]* *tag is active in the tracker and switches back when combat ends.* ***This way you can have a faster model, so combat is faster.***

---

## First-Time Setup

### Initial Setup

1. Create a character card for your "narrator" (e.g. Game Master). Leave the card fields empty, as the framework handles all logic via the system prompt.

2. Use one of the character creation options above to roll a new character. You can either use the Character Creator option to clearly specify your character, use Other Ways to Begin for a more rough description, or use Instant Action to have the extension randomize everything you leave unspecified beyond your name and adventure genre.

3. If you decide to use the hybrid RNG mode that combines tool calls with the pre-seeded RNG Queue used by the extension, ensure function calling is enabled. Otherwise the `RollTheDice` tool will not work.

It's also recommended to go to Connections & Models and hook up the various components to suitable models. The respective drawers contain hints as to what kind of a model to pick. If there's no hint, then it doesn't matter much. Preferably choose a relatively strong model for the narrator/GM (ST main API connection), of course. DeepSeek V4 Pro/MiMo 2.5 Pro tier or better.

### Narrator character

Create (or load) a SillyTavern character card that acts as the narrator — e.g. “Simulation Engine” or “Game Master.” The framework injects mechanical truth into prompts; the card supplies voice and framing.

For the initial setup described above, leave the narrator card fields empty; the framework handles the narrator logic through its system prompt.

The system rejects the traditional ST use of character cards, which are meant for 1-on-1 chats because RP of this kind necessarily introduces lots and lots of characters. Therefore it would make no sense to attribute the GM outputs to any one character. It functions more like a book in format, where there is a "narrator" under which everything happens.

### Instant Action (fastest path)

On an empty tracker, use Instant Action / Quick Start by genre (**Fantasy**, **Modern**, **Sci-Fi**, **Horror**). Select a genre, optionally type or roll a name (leave it blank for the AI to choose), and optionally enter an **Initial Setup** for the character, starting setting, premise, or tone. Specified details override rolled defaults, while everything you omit remains randomized. Choose the Player Card word count you want, then select **Begin Instant Action**. The pipeline is sequential:

1. Applies your current Narrator Configuration (settings + sysprompt).
2. Keeps a supplied name or invents one when blank, picks a random archetype from the genre, then generates a character sheet into the State Tracker. Initial Setup details are treated as higher priority than the random archetype.
3. Generates a **Player Card** at the selected word count for Lorebook Agent, using both the character sheet and the same Initial Setup. It then creates/selects a SillyTavern persona with the same name and an empty description. The name-only ST persona controls the sender label without duplicating Player Card content in the prompt.
4. Sends `Begin the adventure` together with any optional instructions so the narrator's opening matches the requested character, setting, and premise.

Character-sheet generation sends the model only the active tracker-module instructions as its system prompt. The full State Extractor core prompt is reserved for ordinary tracking and manual tracker commands.

You can also use **Character Creator** with explicit name/class/level/gear, or paste an existing sheet into **Raw View**. In **Other Ways to Begin**, select a genre and use **Roll Name** until you have the name you want — or type/edit it directly — before choosing **Custom**. The **Persona** path keeps the active SillyTavern persona name, while **Import Card** keeps the imported card’s name. Character Creator and Other Ways to Begin have separate toggles for a Lorebook Agent Player Card and a name-only ST persona. If formatting doesn’t match what the UI expects, use the tracker’s **💬** button and ask the model to fix it.

The Character Creator random-name button uses the combined cross-genre name library without genre filtering. Random **Other Ways to Begin** generators use the matching genre pool and pass the selected full name to the character generator.

### Chat-Linked Mode

On by default. Each chat keeps its own memo, quests, portraits, Lorebook Agent watermarks, World Progression timer, and related campaign data under that chat ID. Switching chats saves the old partition and loads the new one. Campaign lorebook prefix is derived from the chat filename (sanitized) unless overridden.

**Lock Control Room & Modules to each chat** is also enabled by default. It saves the active System Prompt Control Room sections and State Tracker modules for each chat, so a new chat begins from the stock setup without requiring you to restore a cartridge or manually rebuild anything.

Turn that lock off only when you deliberately want to carry the current setup into another chat. While it is off, the current setup carries between chats as a temporary bypass; it does **not** alter any saved Global or Chat-bound choices. Turn the lock back on in the destination chat to save that setup there.

#### Global and Chat-bound items

Created modules and custom system-prompt snippets live in a reusable library. Switching chats never deletes their definitions: items that are not active in the current chat remain in that chat's inactive pool, ready to be enabled again.

- **CHAT-BOUND** — its enabled state is remembered separately for each chat. This is the default for newly created and migrated standalone items and is best for campaign-specific rules.
- **GLOBAL** — its enabled state is shared across chats. Use it for a rule you want active everywhere. The module/snippet definition is always shared; the scope only controls activation. Module order and Control Room order remain part of each chat's setup.

Choose the scope from the dropdown on a standalone module or snippet. The setting is saved immediately.

**Scenario Profiles** are a separate feature: named snapshots of memo + modules + campaign-related fields you can save/load manually. They are not a full dump of connection settings or UI preferences.

---

## How a Turn Works

Understanding this loop is more important than memorizing every setting.

### Before the narrator replies (interceptor)

When you send a message, the framework finds the last user message and can prepend:

- `[PLAYER_CHARACTER]` (if linked)
- `[NPC_RELATIONS]`
- An **RNG Queue** block (when Pre-Seeded RNG applies — see Hybrid RNG)
- `### STATE MEMO (DO NOT REPEAT)` — the **previous** turn’s tracked state
- Quest / deadline context
- Active lore / World Report injections (position and depth configurable)
- Optional end-of-output footer reminder

So the GM always sees the last known mechanical truth **before** it writes the next scene.

### After the narrator replies

On generation end (skipped for quiet/impersonate, while a pass is already running, or when the latest assistant speaker is not `{{char}}`), roughly:

1. Keyword scan of the assistant output (when Lorebook Agent keyword systems are active).
2. **State Tracker** pass (throttled by “run every N”; default every turn) — parses the new narrative and updates the memo.
3. **Combat API Override** sync (switch/restore narrator profile if combat started/ended).
4. Dynamic RNG prompt sync (Hybrid mode combat boundary).
5. **World Progression** TIME check (deterministic; see that section).
6. **Lorebook Agent** tick / pass when its “run every N” threshold is met.

Important: the State Tracker runs **after** the reply. The memo injected on the *next* turn is what was updated from the *previous* reply.

Auto State Tracker / Lorebook Agent passes only run when the **latest assistant message is from `{{char}}`** (the active character card). Other speakers — e.g. a `/sendas` announcement character like “System Notifications” — do not tick run-every or fire auto passes.

`/sendas` itself does **not** emit `GENERATION_ENDED`, so it normally does not auto-trigger Lorebook Agent; use `/lorebookagent` manually after announcement-only turns (or after any non-`{{char}}` beat you still want chronicled).

---

## The System Prompt

This is the brain of the GM/Narrator. If it is removed (and nothing replaces it), the narrator no longer knows how to run the game.

### Where it lives

- Source templates: `sysprompt.txt` (tool-call / Hybrid RNG) or `sysprompt_legacy.txt` (queue-oriented legacy RNG).
- Assembled into SillyTavern **Quick Prompt → Main** when the tracker is on and Custom Sysprompt Mode is off.
- **System Prompt Control Room** lets you reorder, enable/disable, unlock/edit built-in sections, and add custom library sections (manual or AI wizard).

### Custom Sysprompt Mode

When enabled, the framework **does not** overwrite Quick Prompt Main. Section toggles can still be saved, but auto-apply and combat-driven dynamic RNG prompt rewrites for the main prompt are disabled. Use this when you fully own the narrator prompt yourself.

### Major built-in sections (examples)

The prompt is modular XML-style sections, including among others:

| Area | Example sections |
|------|------------------|
| Identity & dice | `<role>`, `<rng_system>`, `<rng_queue_instructions>` |
| Combat | `<combat>`, `<combat_start>`, `<combat_flow>`, `<damage_logic>`, `<positioning_and_movement>`, `<npc_stat_scaling>`, `<critical_hits_and_dying>` |
| Progression | `<xp_system>`, `<level_up_protocol>`, `<quests>`, `<loot>` |
| Simulation | `<narrative>`, `<world_progression>`, `<resting>`, `<leaving_vs_benching>`, `<bench_ETA_system>`, `<relationship_tracking>` |
| Output contract | `<state_memo>`, `<end_of_output_footer>`, `<CYOA_mode>`, various `<constraints>` |

### Combat rules the GM is taught (summary)

`<combat_start>` — Declare previously-unknown NPC stats (AC, saves, HP, combat line, resistances, etc.), then roll initiative. Caster enemies list spells by level + slots at introduction (e.g. `Cantrips: Fire Bolt; Level 1 (2/2): Magic Missile, Shield`) — never a flat comma list.

`<combat_flow>` — Simulate every NPC each round. Use pre-calculated totals from STATE MEMO (`[CHARACTER]` / `[PARTY]` / `[COMBAT]`) — never re-derive bonuses mid-fight. Martials use Combat line Melee/Ranged values; casters use listed Spell Atk / Spell DC. Slash-separated values (`+X/+Y`) mean one roll per value. State remaining HP after every damage/heal. Buffs/debuffs expire on schedule; state initial duration (e.g. Mage Armor 8h, Heroism 10 turns).

---

## Hybrid RNG

Combines two types of RNG, automatically switched based on context. If `[COMBAT]` is present in the State Tracker, the system switches to the RNG Queue in both the system prompt and context injection. `RollTheDice` is only registered outside combat; the RNG Queue is only injected in combat.

### RollTheDice

`RollTheDice` is called on-demand. It can inject into the context in the middle of an output. Well, not really — LLMs can't receive inputs mid-output. What happens is this:

1. The LLM starts outputting its normal narrative message.
2. It realizes it needs a roll.
3. It calls the tool and **stops** outputting.
4. `RollTheDice` runs its code and produces a result, nudging the LLM to retry if it messed up the tool-call JSON.
5. The LLM reads the result from the `RollTheDice` tool, sees a number and success or failure.
6. The LLM continues narrating now with the roll result in its context.

**Pros:** The LLM can't know the numbers beforehand. Completely sycophancy-proof in every circumstance.

**Cons:** Breaks the output into chunks; costs more because every interrupt re-sends the whole context/story (input tokens); can cause latency.

Non-legacy tool schema requires the narrator to declare **who**, **formula**, and **dc** *before* seeing the result:

- **Skill / attack (default):** `compare: "gte"` — success if `total >= dc`.
- **Percentage odds:** `formula: "1d100"`, `compare: "lte"` (auto-inferred for pure d100 formulas) — hit if `total <= dc` (dc is a percentage).
- **Global d100 Mode** still registers `RollTheDiceD100` as a dedicated roll-under tool for percentage-based rulesets.

Legacy dice logic omits DC (vanilla-style SillyTavern tool). The narrator model must support **tool calling** for Hybrid / tool modes, and function calling must be enabled in the Chat Completion preset. Legacy dice are not recommended but can help in edge cases.

### RNG Queue

1. Numbers are pre-rolled with JavaScript. The LLM always sees numbers in context, prepended to the last user input.
2. The LLM only has to pick numbers from the queue in order and “slot them in.”

**Pros:** Any number of rolls within a single output; no breaks in output necessary; costs less.

**Cons:** The LLM can **see** what number is coming up, potentially lowballing a skill-check DC so that you can pass — though this is in theory; it might not actually do that. It's just possible.

Queue details:

- Built with cryptographically random values.
- Typical d20 queue: multiple pre-rolled lines for common dice.
- Optional d100 queue (percentage mode).
- Injected into the user message when Pre-Seeded RNG applies (always in Pre-Seeded Only; in Hybrid, **only** when combat is active).

### CYOA Mode and combat close the foresight door

**CYOA Mode** fixes the queue's foresight problem. It forces the LLM to commit to the numbers at the end of the **previous** output, in the choice — e.g. `Lockpicking DC 18`. That DC is locked in. When it sees the roll on the next turn, the DC is already decided.

Same goes for **combat**, which works on a deterministic initiative/turn grid. That also prevents sycophancy.

**RNG Queue only fails** in freeform/narrative situations **without** CYOA Mode — which is why it isn't recommended for that specifically. Hybrid RNG (tool calls out of combat, queue in combat) is the right pairing without CYOA.

### Modes (Narrator Configuration → RNG)

| Mode | Behavior |
|------|----------|
| **Pre-Seeded + Tool Calls** (Hybrid) | Out of combat: `RollTheDice` / `RollTheDiceD100` tools only. **In combat:** RNG Queue only; dice tools are unregistered for that context. Recommended **without** CYOA. |
| **Pre-Seeded Only** | Queue injected every eligible turn; no dice tools. Default in code settings. Recommended **with CYOA**. |
| **No RNG** | Neither queue nor tools. |

### Combat detection

Combat is considered active when a non-empty `[COMBAT]…[/COMBAT]` block exists and is not `END_COMBAT`. That gate drives Hybrid’s tool↔queue switch and Combat API Override.

### d100 mode

Enabling d100 tools/queues flips global percentage-style behavior (tool names, queue tags, and sysprompt substitutions). Stock prompt adaptation is basic — customize `<rng_system>` in the Control Room if you lean on d100 heavily.

---

## The State Tracker

The State Tracker (ST) is the accountant of the system. It does **not** invent narrative or own the ruleset; it keeps the GM honest about mechanical state — especially when history is summarized out of the context window.

ST parses the narrative in natural language. Exact string matches are not required; if the information is present and comprehensible, the tracker can record it. Each turn the GM receives a **STATE MEMO** injection on the user message so it always sees the current mechanical picture.

### Modules

ST is built from **modules**. Each module:

1. Owns a UI section in the tracker window.
2. Owns a prompt that tells the tracker what to record.
3. Uses a corresponding `[TAG]` in the memo (e.g. `[COMBAT]`, `[INVENTORY]`).

Adding a template/example inside a module prompt is optional but strongly recommended so output matches the rendering backend.

Custom modules can be **CHAT-BOUND** or **GLOBAL** (see [Chat-Linked Mode](#chat-linked-mode)). An inactive module is still saved in the library, so you can activate it again later instead of recreating it.

### Stock modules

#### `[CHARACTER]`

Player core sheet: HP, Combat line (BAB, Melee/Ranged attack totals with attacks-per-round), Base/Total AC, Gear summary, Proficiencies, Attr, Saves, Skills, Traits, Hit Dice, Status.

Total AC is Base AC plus bonuses from `[INVENTORY]` items tagged `[E]`. Melee/Ranged totals on the Combat line are authoritative during fights — the GM should not re-invent them.

#### `[PARTY]`

Active companions (max 5 + `{{user}}`). Same general sheet shape as the player, plus Abilities/Spells lines for casters.

- Add on narration like `(X joins the party.)`
- Permanent remove **only** on exact annotation `*(Left the party: X — reason)*`
- If the roster changes, output the **entire** `[PARTY]` block; if unchanged, omit it.

#### `[BENCHED PARTY]`

Temporary separation while reunion remains plausible. The tracker moves full stat sheets in code — the module outputs commands only:

```
[BENCHED PARTY]
[BENCH] Gareth — stayed at the lodging to rest and study
[/BENCHED PARTY]
```

`[UNBENCH] Name` reunites. Optional `ETA:` timestamps when the story gives a real return time. Brief off-screen absence is **not** a bench. Benched members can appear in World Progression reports.

Benching makes it possible to give "quests" to party members, enabling a kind of commander playstyle. You can send a party member off on a task, and they will return upon the ETA being met. Upon return the GM is instructed to perform a dice roll to figure out whether the trip was a success. The DC depends on the suitability of the companion for the task, making it important to choose the right person for the job. This is one of the simulation features.

#### `[COMBAT]`

Active enemies, combat round counter, per-combatant HP, Att/def, saves, abilities, spells (casters), other traits, status. Martial vs caster layouts must not be mixed on one enemy. Tier bands (Minion → Legendary) guide invented stats. End combat with:

```
[COMBAT]END_COMBAT[/COMBAT]
```

Party members never belong inside `[COMBAT]`.

#### `[INVENTORY]`

Two headers: **Gear:** and **Other Items:**

- Every item: thematic emoji + rarity `[Common]`…`[Artifact]` + worth `(~X currency)`
- Magical weapons/armor: suffix naming (`Flame Dagger +1`), never `+1 Flame Dagger`
- Equipped: `[E]` immediately after rarity
- Bare currency under Other Items (💰 coins / 💵 paper)

Example:

```
[INVENTORY]
Gear:
- 🗡️ [Rare] [E] Flame Dagger +1 (1d6+2 Fire, +1 to hit) (~350 GP)
- 🛡️ [Common] Iron Buckler (AC +2) (~15 GP)
Other Items:
- 🧪 [Uncommon] Healing Potion (Restores 2d4+2 HP) (~50 GP)
- 🪢 [Common] Rope, 50 ft (~1 GP)
- 💰 1,200 GP
[/INVENTORY]
```

Worth values can auto-render as coin badges in the UI.

#### `[ABILITIES]` / `[SPELLS]`

Abilities = non-spell class features only. Spells = cantrips + leveled slots `Level N (avail/max): …`. Never mix the two.

#### `[TIME]`

Clock + last long rest. Format variants exist (12h/24h, Day N vs DD/MM/YYYY). Used for:

- Out-of-combat buff decay (delta vs prior memo)
- Distinguishing short rest (~1h) vs long rest
- **World Progression** scheduling (in-world elapsed time)

#### `[XP]`

`Level: X | XP: current/max` whenever XP or level-up is narrated.

#### `[QUESTS]`

Only accepted tasks (not mere offers). Engine archives completed/failed; memo usually holds actives. Fields include `ID`, `STATUS`, `GIVER`, `ACCEPTED`, optional `DEADLINE`, `REWARD` lines, `FRUSTRATION_COEFF` (NPC-given only), `OBJ_ACTIVE` / `OBJ_COMPLETED` / `OBJ_FAILED`, optional `OBJ_TOTAL`. Emergent quests use `TYPE: emergent` and `GIVER: Self @ —`.

Narrator acceptance markers:

- `*(Quest Accepted: Name)*`
- `*(Emergent Quest Active: Name)*`

With Deadlines + Frustration enabled, overdue NPC quests decay giver mood via `FRUSTRATION_COEFF` (≈0.4 patient → 3.0 volatile) instead of hard auto-fail. Without Frustration, deadline expiry can auto-fail.

### Tracker UI essentials

- **Rendered panel** — HP bars, spell pips, status pills, inventory badges, etc.
- **Raw View** — edit memo text directly.
- **💬 Direct Prompt** — talk to the tracker model with the prior memo (and optional recent chat context); bypasses the narrative pipeline; good for corrections and setup.
- **Full Audit** — chunked pass over large chat history to rebuild a complete memo.
- **Rendering Tags Library** — live previews of `((TAG))` markers used in module lines.
- Mobile: open from the wand menu.

### Connection settings

State Tracker can use Main API, a Connection **Profile**, or dedicated Ollama/OpenAI endpoints. Its **Core Prompt** is the tracker system prompt — separate from the narrator Quick Prompt.

Adventure Companion has a separate connection selector with the same Main API / Profile / Ollama / OpenAI choices, so changing the Companion model does not change State Tracker.

**Combat API Override** switches the **main narrator** connection profile (not the State Extractor) while combat is active, then restores the baseline when combat ends.

### Full Review Mode

**Where:** State Tracker & Modules → checkbox **Full Review Mode (recommended for weaker/local models)**, directly below **Enable State Tracker**.

**What it does:** While enabled, the ordinary Core Prompt is **fully replaced** each State Tracker pass by a built-in Full Review prompt. That prompt forbids `NO_CHANGES_DETECTED` and forbids omitting modules — every enabled section must be re-output in full, verified against the narrative and prior memo. The user-prompt suffix is also switched to ask for the complete verified memo.

**Why it exists:** The default Core Prompt is a **delta** contract (“only output changed sections”). Strong cloud models usually handle that well. Local and smaller models often lose track of BLOCK PERSISTENCE / omit-unchanged rules and silently drop inventory, party, abilities, etc. Full Review Mode trades tokens and latency for a simpler, harder-to-misread contract.

**Who should use it:** Anyone running State Tracker on a local or smaller model — Gemma (including Gemma 4), Mistral Small, Qwen, Llama, Phi, and similar. Also useful if a mid-tier cloud model keeps dropping modules. Not usually needed for strong cloud trackers if delta mode is already stable.

**Important caveats:**

- Custom edits in the Core Prompt and User Prompt Suffix are **ignored while Full Review Mode is on** (the UI shows the built-in Full Review versions, grayed out). Your custom text stays saved and returns when you turn the toggle off.
- Raise response length generously — a full memo dump is larger than a delta update, and truncated tracker output is useless.
- This is the per-turn operating mode. **Full Audit** remains a separate manual tool that rebuilds the memo from large chat history in chunks.

### Slash command

`/statetracker` (alias `/st`):

- Default / `run` — normal update since last user turn
- `full` / `audit` — full context audit
- `lookback=N` — last N assistant blocks
- `quiet=true` — suppress toast

---

## Rendering Tags

Memo lines can include inline markers that the UI renders. Major families include:

`PILL` / `PILLS`, `BAR` (and HP aliases), `BARREL` (signed +/- bar), `NPC` (freeform NPC cards inside blocks), `XPBAR`, `TEXT`, `BADGE`, `HIGHLIGHT`, `OBJ`, `REWARD`, `DIFFICULTY`, `PROGRESS`, alert styles (`WARNING` / `SUCCESS` / …), currency (`GOLD` / `SILVER` / `DOLLAR` / …), `ROLL`, `CLOCK`, `STARS`, `WEIGHT` / `CAPACITY`, `WEATHER`, `ORBS` / `AP`, `SLOTS`, `PHASE` / `STEP`, `GAUGE` / `METER`, `CHARGE` / `BATTERY`.

Coloring:

- Named suffix on the tag: `((PILLPINK))`, `((BARRED))`
- Or explicit: `((PILL - rebeccapurple))`, `((BAR - #ff6699))`
- Two colors → gradients (or BARREL positive/negative sides)

`((NPC)) Name:` starts a party-style card with freeform follow-up fields; matching Lorebook Agent portraits apply when names match.

---

## The Lorebook Agent

If the State Tracker is the mechanical accountant, the Lorebook Agent (LA) is the librarian for macroscopic narrative memory. It is intended to pair with a summarizer (e.g. Summaryception) that keeps a rough arc; LA fills gaps with timestamped, keyworded entries drawn from recent narrative.

### Attention model (“keyring”)

Native SillyTavern lorebooks are used as the database. Entries default inactive. LA’s attention model:

- **Active** entries: full content visible to the agent.
- **Inactive** entries: title + keywords only (the **keyring** / archive summary) until activated.
- **Max Active** can FIFO-prune to control tokens.

LA is aware of keyword activations inside one container (extension scanner and/or native ST keyword activation, depending on settings).

### How it runs

- Default cadence: every **N** counting generations (commonly 1–3; default often 3).
- Lookback: since last run (recommended), since last user, or fixed count.
- Modes:
  - **Basic (tags):** structured `[[NPC: …]]` / LOC / FAC / QUEST / EVENT markers plus activate/deactivate/delete directives.
  - **Advanced (tools):** ReAct tool loop (`grep_lore`, `inspect_book`, `read_entry`, `commit`, …) until finish / max turns.
- World Skeleton books (`*_Skeleton`) are off-limits to the agent.
- Campaign books use a prefix, e.g. `{prefix}_NPCs`, `_Locations`, `_Factions`, `_Quests`, `_Events`, `_World`, `_Skeleton`.
- Lorebook Agent CANNOT have any influence on Lorebooks that are not under the `ChatID_Bookname` structure. Therefore, if you want it to handle any book, it must be registered under "Modular Repertoire (Prompt Rules.) It is blind to any lorebooks that do not match this naming structure. This is by design so that it cannot affect your other lorebooks. It runs in its own "container" in this sense. If you want LA to manage an existing lorebook, you must add a custom section to the module repertoire and name the lorebook in question to match.

### Species / Body / Worn Equipment split, PC sync, and CORE field risk gating

The old combined `Appearance/Species` CORE field is split into three separate sections (for both NPCs and the Player Character):

- **Species** — static identity (species, race, subtype). Essentially frozen once a character is first recorded; never auto-updated.
- **Body** — signature/default *physical* look (build, face, hair, scars, etc.). No worn gear here.
- **Worn Equipment** — currently worn/carried gear only (weapons, armor, clothing, accessories). Not coins, loot piles, or inventory lists. Updates whenever the narrative explicitly shows a change to what they have equipped.

Splitting Body from Worn Equipment means the Lorebook Agent can keep gear in sync with the narrative (which happens often) without ever touching or rewording your character's basic physical description (which should stay stable). If you never customized your NPC/PC sections, you get the split automatically — no action needed. If you previously customized sections, your existing entries keep the old combined `Appearance/Species` header until you add the new sections yourself (or an LA update on that entry lazily patches it in place); nothing is force-migrated.

- **PC Body/Worn Equipment sync:** LA can update the linked Player Character card's `Body` and `Worn Equipment` fields the same way it updates NPCs — via `[[UPDATE_APPEARANCE: {{user}} | …]]` / `[[UPDATE_EQUIPMENT: {{user}} | …]]` (Basic) or `commit.appearance` / `commit.equipment` with id `{{user}}` / `player` / `pc` / the PC's name (Advanced). It never creates a PC lorebook entry and never edits the PC's Species/Personality/Background/Habits/Strengths/Flaws.
- **Always-on tools:** Body and Worn Equipment updates (NPC or PC) are available on every pass — these are the two fields expected to change often enough that a Direct Prompt shouldn't be required every time.
- **Automatic vs Direct Prompt for other CORE fields:** On a normal automatic cadence pass, `UPDATE_CORE` / `commit.core` may only touch **Combat Profile** (objective stats from `## ACTIVE COMBAT STATE`). Species, Personality, Background, Habits, Strengths, and Flaws are blocked at both prompt and code level on automatic passes — the agent only sees ~two messages and can brick a character if it rewrites identity from thin context. To edit those fields, use the Lorebook Agent **Direct Prompt** (or `/lorebookagent …` / Companion instruction): manual passes unlock the full eligible CORE field set, including Species.
- **Cold-start gear seed:** On the **first** Lorebook Agent pass of a chat, if a `[CHARACTER]…[/CHARACTER]` block exists in the State Memo, it is injected once as `## PLAYER CHARACTER SHEET (initial reference — one-time)` so Worn Equipment updates can be grounded in what is actually equipped. Later passes do **not** re-inject CHARACTER/INVENTORY; infer subsequent look/gear changes from the narrative.


### Relationships

Optional friendship/affection on NPC cards. Update methods (only one active):

1. **Narrator Regex** (default) — parses annotations like `*(Friendship: Name +X — …)*` / Affection from narrator output.
2. **State Tracker Tags** — tracker emits `[RELATIONS]` command lines; code applies deltas. (Those blocks are stripped before memo merge so they don’t leak into the GM memo.)

Caps default around ±150 (per-chat override possible in Campaign Records under the gear ⚙️ in the NPCs header).

### Portraits & Visualization

- Portraits via SillyTavern Image Generation **or** Pollinations.ai.
- Auto-gen toggles for linked PC, party, combat enemies, lorebook NPCs, locations.
- **Visualization Mode**: location hero image + present NPC/PC tiles (immersion / realtime scene view).
- Real-time triggers: on location enter/change and/or every N outputs.

### Slash command

`/lorebookagent` (aliases `/lbagent`, `/la`, `/router`):

- Default / `run` — normal pass
- `save [hint]` — save scene to lorebook
- free text — Direct Command (with lookback)
- `quiet=true`, `lookback=N`

LA also has its own **💬** Direct Prompt in the agent panel.

---

## World Progression

World Progression (WP) is the fourth major simulation pillar: a macroscopic backbone so the GM thinks beyond the player’s bubble.

Every X **in-world** hours (default 24), WP injects a World Report into context (stored in `{prefix}_World`, injection every turn while active). Example flavor:

> World  
> [01/06/3029, 08:00 AM] - First Prince Hanse Davion reviews urgent planetary status updates…

### Deterministic trigger

JavaScript checks `[TIME]` in the State Memo after State Tracker updates. The AI writes the report; it does **not** decide whether to generate one. WP requires Lorebook Agent enabled. First successful TIME parse stamps a baseline and does not fire; later elapsed intervals fire reports. Manual **Generate Now** is always available.

### Quick Start Guide

1. **Skeleton Source** — this replaces the former Atmosphere Summary and can be a short thematic seed or a detailed description of what you want the world and skeleton to be. Auto-Generate remains intentionally conservative: it derives a generalized backdrop from recent chat without copying named characters, party members, locations, factions, or plot events.
2. **Generate Skeleton** — factions, locations, NPCs, conflicts as Day 0 baseline in `{prefix}_Skeleton`. **Source from Existing Lorebooks** now lets you choose lorebooks from a list, using the same selection pattern as State Tracker lorebook injection. Selected books are supplied as source material. With normal extrapolation enabled, specify how many NPCs, Locations, Factions, and Conflicts you want and the LLM may build compatible new entities from those books. Alternatively, enable **Only use entities explicitly mentioned in source lorebooks (no extrapolation)**; the count fields are disabled and the generator creates entities only for what actually appears in the injected lorebook(s). Edit the generated skeleton afterward in the native SillyTavern Lorebook UI for full customization.
3. **Focus Randomization** (recommended) — lottery across skeleton vs organic pools so reports don’t fixate on the player bubble. Active `[PARTY]` is excluded; `[BENCHED PARTY]` members remain eligible.
4. **Generate the First Report** — Generate Now (skeleton-only if early) or wait for the interval (later runs include organic lore).

### Tips

- 24h in-world is a solid default; try shorter/longer intervals.
- Injection position/depth changes how prominently reports sit near recent messages.
- WP is optional but deepens simulation and lets dormant entities resurface.

---

## Quests (player-facing)

Deadlines and Frustration are enabled in the default narrator configuration. They give NPC quests time pressure and let overdue quests affect the giver's mood instead of being only a binary failure.

Enable the Quests module (and optionally Deadlines / Frustration) in settings. Accepted quests appear in the tracker UI. Difficulty is narrative-only — the system does not soft-cap quest danger to party level; if you accept a dragon hunt at level 2, that is on you.

---

## CYOA Mode

When enabled in narrator configuration, the GM ends turns with numbered courses of action (often with emojis). The extension turns those into clickable chat buttons. Style, slots, and presets live under CYOA settings. Cartridge export can include CYOA config.

**Pre-Seeded Only** RNG is the recommended pairing with CYOA Mode. This is because the rolls are embedded in the choices, for example DC 17. The GM is forced to commit to a roll prior to seeing the next pre-rolled RNG batch. It cannot engage in sycophancy to the player by fitting the DC to the roll it knows beforehand, which is theoretically possible otherwise. CYOA mode closes this door completely, just like RollTheDice calls close it outside of CYOA mode.

Of course, you can use CYOA mode with tool calls, but it's inefficient because the GM will call the tool after every choice with a roll baked in, causing you to incur the input token cost of the existing context. It gives no functional benefit over the pre-seeded RNG with CYOA mode, only causes cost and latency.

---

## Game Systems Wizard & Cartridges

### Game Systems Wizard

Describe a mechanic in plain language (e.g. “reputation system”). The wizard drafts a linked pair:

1. A **GM sysprompt section**
2. A **State Tracker module**

Review both in the forge (edit, regenerate either/both, iterate with feedback, set effect owner), then save as a Game System bundle. No tool-calling required for this flow — it is tag/prompt based.

Game Systems are deliberately atomic bundles. In **Manage Game Systems**, choose **CHAT-BOUND** or **GLOBAL** for the Game System itself; its linked tracker module and GM prompt snippet inherit that scope and enabled state together. They cannot be scoped independently. If you need only one piece to behave independently, recreate that module or snippet as a standalone item.

## Why is the Game Systems Wizard Good?
It's good because you don't actually need to understand how the extension works. The Wizard has an excellent understanding of the system, so it can reliably make solid Game Systems even if you don't know anything about the extension. It's recommended to use a relatively strong model for this such as Claude Sonnet 5 / Opus 5, GPT-5.6 Sol, or something of that caliber at least. Weaker models can also make good systems but not with such a high reliability and complexity.

### Game Cartridges

Export/import a portable setup (`multihog-game-cartridge` format), typically including:

- State Tracker prompts, modules, order, RNG/time-related flags
- CYOA config
- Game Systems + custom fields
- Character sheet section/preset-related data
- Portrait prompt templates/presets
- Lorebook Agent prompts/modules/custom tags
- World Progression report prompt

**Not** included: API connections, most UI preferences, or live per-chat memo/campaign state. A virtual **Stock** cartridge represents factory defaults.

---

## Themes & Appearance

Built-in visual themes: Match ST UI, Hacker, Fantasy, Hologram, Pacific Cove, Cherry Blossom, plus **Custom** via AI Theme Wizard (describe → New / Iterate / Save to library). Optional scenario art behind the tracker panel; separate backdrop options for the detached Lorebook Agent window.

---

## Narrative Components (high level)

Configurable narrator-side behaviors include:

- **Narrative Pacing** modes: Normal (no length instructions), Shorter Outputs (modest length), High-Agency, and Downtime
- **Benched Party** handling (ties into WP eligibility)
- **Relationship Tracking** sections in the GM prompt
- **CYOA** choice presentation
- End-of-output footer reminders so the GM closes turns in the format ST expects

---

## Customization Without D&D

You are not locked to wizards and goblins:

1. Disable or delete stock modules you don’t need.
2. Add custom fields / modules (manually or via wizards).
3. Use Custom Sysprompt Mode or Control Room library entries for a wholly different ruleset.
4. Export the result as a Game Cartridge for reuse.

The framework’s backbone is still **time + memo + optional lore/world layers** — the fiction genre is yours. You can disable [TIME] as well, but it wrecks the bulk of the simulation features as so much depends on time tracking in the STATE MEMO.

---

## Slash Commands (summary)

| Command | Purpose |
|---------|---------|
| `/statetracker` (`/st`) | Manual State Tracker update / full audit |
| `/lorebookagent` (`/lbagent`, `/la`, `/router`) | Manual Lorebook Agent pass / save / direct command |
| `/roll` (`/r`) | Manual dice |

---

## Troubleshooting (quick)

| Symptom | Likely cause / fix |
|---------|-------------------|
| GM ignores inventory/HP | Tracker off, memo empty, or Custom Sysprompt Mode left you without `<state_memo>` guidance — check ST enabled and memo injecting. |
| Dice always favor the player | Enable Pre-Seeded and/or Hybrid tool-call RNG; ensure model supports tools for Hybrid. |
| Combat tools still firing / queue missing | Hybrid switches at `[COMBAT]` boundary; confirm combat block present/ended correctly (`END_COMBAT`). |
| World Reports never appear | WP + Lorebook Agent must be on; `[TIME]` must advance in-world past the interval; first TIME parse only baselines. |
| Lorebook Agent “missed” a `/sendas` scene | Expected — `/sendas` does not auto-trigger, and non-`{{char}}` speakers are skipped; run `/lorebookagent` manually. |
| Lorebook Agent ran on a roll-announcement `/sendas` | Auto-runs require the latest assistant speaker to be `{{char}}`; announcements under another name should not fire. If it still fires, check the script isn’t also generating or calling `/la`. |
| Wrong campaign data or setup in a new chat | Check that Chat-Linked Mode and **Lock Control Room & Modules to each chat** are enabled. GLOBAL items intentionally share activation; CHAT-BOUND items restore that chat's saved setup. Lock-off mode is a temporary carry-over bypass. |
| Tracker formatting broken after paste | Use 💬 Direct Prompt: “Reformat this sheet to stock module layout.” |
| Modules disappear / drift on a local or small tracker model | Enable **Full Review Mode** (State Tracker & Modules, below Enable State Tracker). Delta-only updates are hard for weaker models; Full Review dumps every enabled module each pass. Also raise response length. |

---

## Mental Model (one paragraph)

The **System Prompt** teaches the narrator how to simulate. **Hybrid RNG** supplies unbiased randomness. The **State Tracker** audits each reply into a memo that is re-injected next turn. The **Lorebook Agent** keeps long-horizon people/places/events available despite summarization. **World Progression** advances the off-screen world on the in-world clock. Everything else — quests, CYOA, portraits, cartridges, themes — is optional depth on that spine.

These are recommendations, not rules — experiment. Different models shine for different styles of play.

## Discord and Note to Adventure Companion
If the user has any questions you, Adventure Companion, cannot answer, steer the user to join the SillyTavern Discord and then head to the extensions sub-forum there: https://discord.gg/sillytavern
