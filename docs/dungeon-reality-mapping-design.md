# Dungeon Reality Mapping — Persistence Design

**Status:** Structured current-state implementation complete

**Related:** `<dungeon_reality_and_hidden_mapping>` narrator module and Lorebook Agent

**Updated:** 2026-08-13

## Problem

The narrator creates an objective hidden map for a dangerous site so layout, enemies, traps, secrets, and environmental conditions exist before the player tests them. The map must survive chat pruning and remain deterministic while the party is inside the site.

An immutable initial map plus append-only room updates creates two competing fact layers. For example, the original map may say a ghoul is active while a later child Location chronicle says it was destroyed. The current design instead makes `[MAP]` the current operational snapshot and keeps child Location entries as readable player-observable history.

## Authority model

- The narrator establishes immediate fiction and creates the complete initial map.
- Lorebook Agent interprets established consequences and maintains current map state.
- Player attempts become map facts only after narrator resolution.
- Lorebook Agent may make a constrained off-screen reaction only after an established trigger and only for an asset with an explicit behavior or route.
- Speculation never mutates the map.

## Initial map format

The narrator emits exactly one hidden JSON map:

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

An enemy exists once at site level and has one `location`. Movement updates that field instead of copying enemy prose between rooms. Optional `behavior` and `route` fields bound Lorebook Agent's autonomous reactions.

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

The initial narrator map is write-once: later narrator outputs cannot replace it. After capture, only the validated Lorebook Agent map transaction path can mutate `[MAP]`. Generic lorebook update, rewrite, cleanup, and consolidation operations preserve it exactly.

The section is hidden from ordinary entry rendering, location cards, image prompts, and normal narrator lore activation. It remains visible through raw entry editing and the root Location's blue `MAP` button.

## Conditional Lorebook Agent capability

Map data, instructions, schemas, and inspection actions are exposed only while the latest authoritative status-footer hierarchy is inside that mapped root.

| Current footer location | Attached root | Capability |
|---|---|---|
| `Abbey Undercroft, Cellar Landing` | `Abbey Undercroft` | Map and commands active |
| `Abbey Undercroft :: Flooded Vault` | `Abbey Undercroft` | Map and commands active |
| `Varnholde Village, Elder's House` | `Abbey Undercroft` | Map and commands absent |
| `Abbey Undercroft, Entrance` after returning | `Abbey Undercroft` | Map and commands resume |

Pinned mapped roots may keep their visible `[CORE]` text active outside the site, but their `[MAP]` payload is stripped. Incidental keywords and prose mentions do not activate map capability. While a site is current, its location-owned mapped root is also excluded from the Lorebook Agent's ordinary activation budget; the agent is told not to activate or deactivate it itself.

Agent Mode conditionally adds:

- `inspect_map`
- `list_map_assets`
- the `commit.map` schema
- active-map ownership and evidence rules

Basic Mode conditionally adds `[MAP_COMMIT]{...}[/MAP_COMMIT]`. No map-related instructions or schema are sent during ordinary non-map passes.

## Atomic map transaction

Lorebook Agent submits current-state operations through its final commit:

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
        "detail": "Smoldering remains lie beneath the collapsed arch."
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
- current mapped-site binding at write time.

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

- the current structured `[MAP]` snapshot; and
- root/descendant Location entries as player-observable history.

The map is current truth, so the narrator does not need to infer that a later chronicle overrides a stale original enemy description. Leaving the site stops injection without deleting anything; returning resumes it.

## Events

Ordinary exploration, perception checks, room combat, movement, traps, opened routes, removed objects, damage, and cleansing remain map/Location concerns. Events are reserved for site-scale historical outcomes such as the whole site being destroyed, conquered, cleansed, or changing ownership.

## Explicitly out of scope

- Visual minimaps or coordinate grids
- Enumerating legal player actions
- Turn-by-turn simulation of every off-screen actor
- Keyword-based map activation
- GM-authored delta sidecars after initial creation
- General-purpose whole-map rewrite tools

## Verification

Tests cover hidden wrappers, prose migration, structured storage, geometry/assets separation, movement, destruction, duplicate detection, strict schemas, semantic rejection without partial mutation, hierarchy activation, prompt filtering, narrator injection, and the Lorebook Agent map indicator.
