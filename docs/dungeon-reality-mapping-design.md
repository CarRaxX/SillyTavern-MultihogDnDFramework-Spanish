# Dungeon Reality Mapping — Persistence Design

**Status:** Alpha — structured current-state and dedicated Map Architect are in play, but the feature is still early.

**Related:** `<dungeon_reality_and_hidden_mapping>` narrator module, Map Architect, Map Updater, Map Evolution, World Progression, and Lorebook Agent

**Updated:** 2026-08-16

## Problem

The narrator requests an objective hidden map for a dangerous site so layout, enemies, traps, secrets, and environmental conditions exist before the player tests them. A dedicated Map Architect creates it with its own model connection and prompt; the narrator's permanent prompt carries only the small tool-use contract. The map must survive chat pruning and remain deterministic while the party is inside the site.

An immutable initial map plus append-only room updates creates two competing fact layers. For example, the original map may say a ghoul is active while a later child Location chronicle says it was destroyed. The current design instead makes `[MAP]` the current operational snapshot and keeps child Location entries as readable player-observable history.

## Authority model

- The narrator establishes immediate fiction and calls `CreateAreaMap` once before narrating entry into an unmapped high-risk interior (kind DUNGEON) or an unmapped town/city/village (kind SETTLEMENT). Occupancy on the attached map is maintained by the Map Updater on its own cadence (default: every turn); established story events override stale map states (a killed enemy stays dead even if still listed ACTIVE). The narrator must not rewind play or revive entities to match the lagging map. Settlement maps are district-scale: the narrator may invent granular interiors that do not contradict those districts.
- Map Architect creates and validates the complete initial map, then writes it directly to the root Location entry.
- Map Updater interprets established play and maintains occupancy on the active site. Map Evolution is a sibling pass: it advances mapped sites off-screen on their normal interval, site-exit, or manual cadence. During that pass it may interpret relevant unconsumed World Report prose. Lorebook Agent records NPCs, readable location lore, relationships, quests, and events separately. World Progression receives readable location dossiers with `[MAP]` stripped; Evolution is the only writer that turns macro pressure into map operations.
- The optional World Skeleton is macro-only: locations are candidate WP subjects, while factions and conflicts provide context. It never creates named NPCs. Ordinary NPC lore becomes a read-only dossier constraint only after the GM/Lorebook Agent establishes that individual through play.
- Player attempts become map facts only after narrator resolution.
- Map Updater may make a constrained off-screen reaction only after an established trigger and only for an asset with an explicit behavior or route.
- Speculation never mutates the map.

## Map Architect generation

Map Architect receives the exact site root, entrance label, kind (`DUNGEON` or `SETTLEMENT`), scale, premise, and a configurable recent-story lookback. It emits one version 3 JSON object internally. Before persistence, a strict validator checks the site and entrance, kind, scale-appropriate area count for that kind, stable IDs, enum values, all references, reciprocal passages, and reachability of every area from the entrance. A locked or blocked destination remains part of the physical graph through a `LOCKED` or `BLOCKED` connection; inaccessible space is never represented by omitting its route.

Dungeon maps are room-scale interiors. Settlement maps are macroscopic district graphs (gates, plazas, wards, landmarks) rather than every street and shop; the narrator fills granular interiors during play.

Invalid JSON or semantic errors are returned to Map Architect for up to two complete correction passes. A rejected map writes nothing. On success, JSON is stored directly in Lorebook Agent and only compact human-readable private canon is returned to the narrator. Repeated or concurrent calls preserve an already attached map instead of replacing it.

## Legacy initial map format

For campaign compatibility, the parser still accepts the earlier narrator-emitted hidden JSON map:

```html
<div hidden data-dungeon-map>
{
  "version": 3,
  "site": "Abbey Undercroft",
  "areas": [
    {
      "id": "crypt-passage-east",
      "name": "Crypt Passage - East",
      "knowledge": "DISCOVERED",
      "geometry": [
        "10-foot-wide, 35-foot-long barrel-vaulted corridor.",
        "A collapsed arch creates partial cover."
      ],
      "connections": [
        { "to": "cellar-landing", "state": "OPEN", "detail": "Iron-banded oak door." }
      ]
    }
  ],
  "assets": [
    {
      "id": "crypt-ghoul",
      "kind": "CREATURE",
      "name": "Crypt Ghoul",
      "location": "crypt-passage-east",
      "state": "ACTIVE",
      "knowledge": "UNREVEALED",
      "detail": "Crouches behind the collapsed arch.",
      "origin": "INITIAL_MAP"
    },
    {
      "id": "crawling-dead-pack",
      "kind": "GROUP",
      "name": "Crawling Dead Pack",
      "location": "crypt-passage-east",
      "state": "ACTIVE",
      "knowledge": "UNREVEALED",
      "detail": "A knot of lesser corpses in the side alcove.",
      "origin": "INITIAL_MAP",
      "count": 6
    }
  ]
}
</div>
```

The parser accepts the common malformed closing tag `</div hidden>` for compatibility. Older prose maps are migrated deterministically into version 3. Their facts are retained, likely mutable lines are promoted to assets, and explicit area-label references become connections. Existing child Location entries mark matching areas visited; strongly explicit historical outcomes such as “the ghoul was destroyed” seed the migrated asset's current state once, without allowing old history to overwrite later validated changes.

## Geometry and assets

Geometry describes structural facts:

- rooms, passages, elevation, and terrain;
- durable spatial features; and
- connections and their current traversal state.

Assets describe things that can move or materially change:

- creatures, groups, and patrols;
- traps, hazards, alarms, and effects;
- loot, keys, objects, barriers, and corpses.

Settlement interiors the party can enter (a chapel, inn, shop) stay assets occupying a district. They are not graph areas. The location footer may name that interior; Visuals/Map highlights the host district and treats the interior as occupancy of that node. Promoting every shop into an area would explode the town graph. A nested dungeon under such a building is a new mapped site, not a satellite node on the settlement map.

An enemy exists once at site level and has one `location`. Movement updates that field instead of copying enemy prose between rooms. Optional `behavior` and `route` fields bound Map Updater's autonomous reactions.

Entities are either a named individual (`kind: CREATURE`, omit `count` or use `1`) or a pack (`kind: GROUP` with optional integer `count` 2–99). A patrol, garrison, swarm, or unnamed band is **one** GROUP asset, not many identical singleton CREATUREs. `SET_ASSET` may change `count` for attrition or restock. `0` is invalid — use `DESTROYED` or `DEAD` when none remain.

Asset `detail` and child chronicles store lasting occupancy, not the current combat beat. Remaining members belong in `count`. DESTROYED/DEAD/FLED, area-to-area movement, sprung traps, and lasting damage belong on the map. Mid-round targeting, advancing toward a character, poses, HP, and temporary conditions (frightened, held, prone) belong to the combat tracker and must not be written into `[MAP]`.

State Tracker `[ LIVE ]` snapshot navigation stores that occupancy beside each memo stone and writes it back when the player steps to a previous stone or restores it as LIVE.

Knowledge is separate from objective state:

- Area knowledge: `UNREVEALED`, `DISCOVERED`, or `VISITED`.
- Asset knowledge: `UNREVEALED`, `SUSPECTED`, or `KNOWN`.

This lets the map remain objective without implying that the player knows every fact in it.

## Lorebook storage

The extension creates or reuses a real root entry in the campaign Locations lorebook:

```text
[CORE]
Abbey Undercroft is a mapped site. Its private map stores current objective reality; child Location entries preserve player-observable history.
[/CORE]

[MAP]
{ ...version 3 JSON... }
[/MAP]
```

The initial architect map is write-once: repeated tool calls and later legacy narrator outputs cannot replace it. After creation, only the validated Map Updater / Map Evolution transaction path can mutate `[MAP]`. Occupancy (`CONFIRMED`/`IMPLIED`/`AUTONOMOUS`) records play on the active site. Evolution (`EVOLVED`) may write inactive maps as well. Generic lorebook update, rewrite, cleanup, and consolidation operations preserve `[MAP]` exactly.

The section is hidden from ordinary entry rendering, location cards, image prompts, and normal narrator lore activation. The root Location's blue `MAP` button and the Visuals/Map details control open the same human-readable inspector, grouping geometry, routes, and assets by area. **Reveal All** is remembered per chat; while it is off, unrevealed entries, raw JSON, and material Map Evolution summaries remain private, and Visuals/Map stays knowledge-filtered. Enabling it also fully reveals the Visuals/Map node graph. The inspector draws that graph below the Map Entries / Raw JSON tabs, shows the bounded per-site Evolution history, and can run Map Evolution immediately for that site alone. Visuals/Map itself can be popped out into its own window.

## Conditional Map Updater capability

Map data, instructions, and occupancy updates are exposed only while the latest authoritative status-footer hierarchy is inside that mapped root.

| Current footer location | Attached root | Capability |
|---|---|---|
| `Abbey Undercroft, Cellar Landing` | `Abbey Undercroft` | Map Updater active |
| `Abbey Undercroft :: Flooded Vault` | `Abbey Undercroft` | Map Updater active |
| `Whispering Woods, Forgotten Tomb` | `Forgotten Tomb` | Map Updater active |
| `Forest Near the Hall of the Ember-Ancestors` | `Hall of the Ember-Ancestors` | Map and updater absent |
| `Varnholde Village, Elder's House` | `Abbey Undercroft` | Map and updater absent |
| `Abbey Undercroft, Entrance` after returning | `Abbey Undercroft` | Map Updater resumes |

Pinned mapped roots may keep their visible `[CORE]` text active outside the site, but their `[MAP]` payload is stripped from Lorebook Agent context. Incidental keywords and prose mentions do not activate map capability. While a site is current, its location-owned mapped root is also excluded from the Lorebook Agent's ordinary activation budget.

Map Updater is a dedicated one-shot JSON pass (shared Map Updater & Evolution connection, separate from Map Architect). It emits either `{"noop":true}` or an occupancy transaction. Lorebook Agent no longer receives `inspect_map`, `list_map_assets`, `commit.map`, or `[MAP_COMMIT]`.

The two occupancy/lore cadences are independent: Map Updater defaults to every turn; Lorebook Agent defaults to every 3 messages. The Lorebook Agent header play button expands into a manual choice between Lorebook Agent, Map Updater, and Map Evolution.

## Map Evolution

Map Evolution is a dedicated module (`map-evolution.js`, own prompt) — never mixed into the occupancy request. Three ordinary triggers, one writer:

| Trigger | When | Job |
|---|---|---|
| Interval restlessness | In-world hours (default 12) for the configured tick pool (current map, N due maps, all due maps, or a selected checklist). Runs even when the party is not inside a mapped site unless the scope is current-map-only. | Sparse local movement, restock, decay |
| Site exit | When the party leaves a mapped site | Immediate local restock/decay for the departed site |
| On-demand | Play-menu picker or settings **Run now** (always visible, independent of interval tick scope) | Same Evolution writer; skips the interval due-check |

World Reports never trigger a map pass. Each ordinary Evolution request loads only the recent report sections for that exact location plus **Wider Currents**, excluding report IDs that map has already considered. Evolution receives the prose with the current map, chooses its own concrete realization, and records `materialized`, `already_realized_by_play`, or `considered` bookkeeping. The bookkeeping is stripped before transaction validation. Cross-site continuity inside one multi-map pass remains a short **PRIOR EVOLUTION THIS PERIOD** digest.

Every request also receives an authoritative per-site time window: that map's **Last Evolved** timestamp, current in-world time, and computed elapsed duration. Evolution scales both the amount and the breadth of change to the actual gap. Minutes can be one local reaction; hours with several living `CREATURE`/`GROUP` assets should usually emit several operations in the same transaction, not one patrol `MOVE`. Independent occupants may all act. Co-located competing groups should interact rather than ignore each other. Manual and site-exit triggers do not masquerade as a full configured interval; an unknown or rewound clock is reported explicitly and requires conservative change.

That latest gap is paired with a bounded **Accumulated Evolution Backlog** for the same site. Material commits retain compact summaries and operation IDs; idempotent retries are de-duplicated. Successful no-op passes become quiet checkpoints, and consecutive quiet checkpoints coalesce while adding their elapsed minutes and pass count. The prompt therefore sees both the latest interval and cumulative opportunity since the last material commit. A short interval constrains what happened inside that interval, but frequent short intervals cannot starve the location of meaningful change forever. Previous commits are trajectory rather than an escalation command: Evolution may continue, complicate, culminate, resolve, or reverse them when the current map supports it.

Causality is first-class. Every material operation requires a concise `cause`. Transitioning an asset into `DEAD` or `DESTROYED` also requires `actor`: `"party"`, an existing asset id, or a short off-map name (rival pack, collapse, wildlife). The extension stamps `changed_at` from `[TIME]`. Occupancy `detail` is the current fact; `cause` / `actor` / `changed_at` are why, who, and when. Old unattributed corpses stay unknown — writers must not invent a killer after the fact. Play kills are stamped on the map so Evolution can use them; death stays locked regardless of killer.

Attributed writes also feed a per-site **thread ledger** (`mapEvolutionThreadsBySite`). Backlog is tempo (how much time has accumulated); threads are plot (who did what, and what remains open). Resolving or transforming a subject closes prior open threads for that `subjectId`. Evolution receives **OPEN CAUSAL THREADS** and the full stored attributed-event list. After each Evolution pass, if closed-thread tokens meet the user-settable threshold (default 10,000; ~4 characters per token), a second call compresses resolved/transformed events and prior digests while leaving currently open threads verbatim.

The **Testing Ground** (`map-evolution-debug.js`, inspector/settings/agent-drawer entry points) runs this simulation independently of play: set or advance `[TIME]`, spawn or kill entities with cause and actor, evolve one map, simulate N interval ticks, or **clear evolution history** for the selected site (backlog, causal threads, and considered World Report bookkeeping). It also shows closed-thread token usage against the compression threshold, the stored thread/backlog ledger as JSON and as Evolution reads it, and a per-asset arc viewer so one subject's events can be followed without scanning the whole log. History clear does not rewrite the map, `[TIME]`, or Last Evolved clocks — it only removes prompt trajectory so a later pass is not biased by ticks from a previous prompt. Changes write the real chat maps and memo. This is the intended balancing loop; playing through a campaign is too slow to tune restock, vacuum, and third-party killing.

Authority: play/occupancy owns the player bubble and established deaths. Map Evolution owns off-screen map change. World Progression supplies directional macro pressure, not explicit deltas; Evolution decides how it manifests locally and avoids duplicating anything play or Map Updater already realized. Newer pressure may reverse, resolve, transform, or supersede an older trend while plausible aftermath remains. Evolution does not wait for WP to restock, occupy, or stir a site. `DESTROYED` stays destroyed; add a new remnant instead of resurrecting.

Pipeline after each narrator reply: State Tracker → Map Updater (occupancy) → World Progression (if due; prose report only) → Map Evolution (ordinary cadence, with any pending report prose) → Lorebook Agent.

## Explicitly out of scope

- Visual coordinate-grid floorplans (a knowledge-filtered node graph lives in Visuals/Map)
- Enumerating legal player actions
- Turn-by-turn simulation of every off-screen actor (periodic, bounded Evolution is in scope)
- Keyword-based map activation
- GM-authored delta sidecars after initial creation
- General-purpose whole-map rewrite tools
- Teaching World Progression room IDs, letting it simulate granular entities, or letting WP write `[MAP]`

## Verification

Tests cover Map Architect response parsing, strict connected-graph validation, hidden-wrapper compatibility, prose migration, structured storage, geometry/assets separation, movement, destruction, duplicate detection, strict schemas, semantic rejection without partial mutation, hierarchy activation, prompt filtering, narrator injection, dedicated settings/connection wiring, Map Updater occupancy updates, location-dossier map stripping, prose report routing, scheduled Map Evolution/EVOLVED transaction rules, cumulative per-site Evolution backlogs, causal threads and killed-by attribution, and Lorebook Agent map stripping.

## Atomic map transaction

Map Updater submits current-state operations as one JSON object:

```json
{
  "map": {
    "operation_id": "day1-0833-crypt-ghoul-destroyed",
    "operations": [
      {
        "op": "SET_ASSET",
        "evidence": "CONFIRMED",
        "asset_id": "crypt-ghoul",
        "state": "DESTROYED",
        "knowledge": "KNOWN",
        "detail": "Smoldering remains lie beneath the collapsed arch.",
        "cause": "Killed by the party on the landing.",
        "actor": "party"
      }
    ],
    "chronicles": [
      {
        "area_id": "crypt-passage-east",
        "text": "The crypt ghoul was destroyed by a point-blank Guiding Bolt."
      }
    ]
  }
}
```

Supported operations are:

- `ADD_AREA`
- `SET_AREA`
- `ADD_ASSET`
- `MOVE_ASSET`
- `SET_ASSET`
- `REMOVE_ASSET`
- `SET_CONNECTION`

The extension generates stable IDs for new areas/assets. `ADD_ASSET` performs duplicate detection; the agent must use an existing asset or explicitly identify candidates from which the new entity is distinct.

`chronicles` are optional and contain only player-observable history. A chronicle makes its area `VISITED`; an asset reported by it should be made `KNOWN` in the corresponding operation. Off-screen movement changes `[MAP]` without leaking into a child Location. If an observed area's child entry does not exist, it is created in the same transaction.

The root map and every included child chronicle are changed in one Locations-lorebook save. Both persist or neither does. Operation IDs make successful retries idempotent.

## Validation and correction

The schema rejects unknown properties and constrains operation, evidence, kind, state, knowledge, and connection values. Semantic validation also checks:

- exact/unambiguous area and asset identity;
- current source location for movement;
- autonomous behavior/route authority;
- traversable mapped connections for autonomous movement;
- duplicate assets and areas;
- valid operation targets; and
- current mapped-site binding at write time;
- concise `cause` on every material operation; and
- `actor` when an asset is transitioning into `DEAD` or `DESTROYED`.

Example rejection:

```json
{
  "ok": false,
  "retryable": true,
  "code": "FROM_LOCATION_MISMATCH",
  "errors": [
    {
      "path": "map.operations[0].from",
      "received": "crypt-passage-east",
      "actual": { "id": "cellar-landing", "name": "Cellar Landing" },
      "hint": "Retry with the asset's actual current location: cellar-landing."
    }
  ]
}
```

Malformed native tool JSON, invalid Basic Mode JSON, schema errors, and semantic errors all produce a corrective nudge. The agent gets up to two correction retries. A rejected commit writes nothing. If the active site changed during generation, the transaction is rejected without retry.

## Narrator injection

While the party is inside the site, the deterministic Dungeon Reality block contains:

- a compact prose conversion of the current `[MAP]` snapshot, never the raw JSON;
- per-asset `Cause` / `Actor` / `Since` when present (the latest occupancy coupling for that entity, not a plot ledger);
- a short **Recent site activity** briefing: currently open causal threads (capped), recent **complete** material Evolution commits (never mid-cut; older ticks are dropped first if the briefing would overflow), and current DIGEST rows — never the full thread history; and
- root/descendant Location entries as player-observable history.

JSON remains the storage and Map Updater / Map Evolution transaction format. Narrator injection removes structural keys, braces, stable IDs, duplicate reciprocal routes, and child `[CORE]` prose already represented by the map while retaining geometry, asset kind/state/knowledge, connection state, optional behavior metadata, and non-CORE player-observable chronicles. This keeps adjudication context close to the original prose-map cost. The activity briefing exists so occupancy makes sense (a barred latch, a feud, a vacuum occupation) without dumping Evolution's 400-event ledger into the GM prompt.

The map is current truth, so the narrator does not need to infer that a later chronicle overrides a stale original enemy description. Leaving the site stops injection without deleting anything; returning resumes it.

## Events

Ordinary exploration, perception checks, room combat, movement, traps, opened routes, removed objects, damage, and cleansing remain map/Location concerns. Events are reserved for site-scale historical outcomes such as the whole site being destroyed, conquered, cleansed, or changing ownership.

