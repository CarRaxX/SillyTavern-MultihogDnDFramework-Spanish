# Dungeon Reality Mapping — Persistence Design

**Status:** Initial implementation complete  
**Related:** `<dungeon_reality_and_hidden_mapping>` narrator module and Lorebook Agent  
**Updated:** 2026-08-12

## Problem

The narrator creates an objective hidden map for a dangerous site so traps, layout, enemies, secrets, and environmental conditions exist before the player tests them. Leaving that map only in the chat makes it vulnerable to context pruning and lost-in-the-middle failures.

The map must persist outside chat and be deterministically present while the party is inside its location hierarchy. It must remain an informational backdrop, not a dungeon state machine or a list of permitted actions.

## Implemented ownership model

### Narrator: initial reality only

The narrator emits exactly one complete initial map:

```html
<div hidden data-dungeon-map>
Dungeon Site: Crypt of Whispers
Area: Entrance Hall
...
</div>
```

- The `Dungeon Site` value must match the top-level status-footer location.
- Areas use stable natural-language labels rather than coordinates or opaque IDs.
- The narrator does not emit follow-up map chunks or `data-dungeon-delta` blocks.
- Later durable changes are narrated normally.

The parser accepts the common malformed model closing tag `</div hidden>` for compatibility, although the prompt requires valid `</div>`.

### Root Location entry: hidden `[MAP]` section

The extension creates or reuses a real root entry in the campaign Locations lorebook. For example:

```text
Varnholde Crypts
├── Entrance Stairs
├── Main Chamber
└── Warden's Quarters
```

The full hidden map is stored normally in the root entry's lorebook content:

```text
[CORE]
Varnholde Crypts is a mapped site.
[/CORE]

[MAP]
Dungeon Site: Varnholde Crypts
...immutable hidden map...
[/MAP]
```

`[MAP]` is part of the normal lorebook record, so Lorebook Agent receives the complete objective site in Active Memory and can identify exactly which pre-established creature, trap, object, or room the visible narrative changed.

The section is hidden from ordinary entry rendering, location cards, image prompts, and narrator lore activation. It is exposed only by editing the raw entry or pressing the root Location's `MAP` button. The deterministic Dungeon Reality injector reads it separately while the current location matches.

The section is write-once. A later narrator response cannot silently replace the original map.

### Lorebook Agent: persistent local changes

Lorebook Agent owns mutable dungeon state after the initial map:

- Existing room or area changed: append a timestamped update to the exact child Location entry.
- A new persistent sublocation was established: create a child Location entry beneath the site root.
- Destroyed occupants, disarmed traps, opened routes, removed objects, environmental damage, and cleansing/corruption belong to Locations.
- Ordinary exploration, perception checks, room-by-room combat, and local mutations do not also become Events.
- Events are reserved for site-scale historically significant outcomes, such as the entire site being cleansed, destroyed, conquered, or changing ownership.

The original `data-dungeon-map` HTML payload is removed from Lorebook Agent's narrative transcript input to avoid duplication. The same map remains available to the agent through the active root Location's `[MAP]` section.

## Activation and injection

Activation is derived from the current status-footer location, not Lorebook Agent activation and not keywords.

1. Read the latest narrator footer location.
2. Take its top-level hierarchy segment as the site root.
3. Load root Location entries that contain a private `[MAP]` section.
4. Match the footer root to an attached site using normalized/fuzzy label matching.
5. If matched, inject the immutable map plus current descendant Location records through the deterministic system-depth path.
6. If not matched, inject nothing.

Examples:

| Current footer location | Attached root | Result |
|---|---|---|
| `Varnholde Crypts, Main Chamber` | `Varnholde Crypts` | Inject |
| `Varnholde Crypts :: Reliquary` | `Varnholde Crypts` | Inject |
| `Varnholde Village, Elder's House` | `Varnholde Crypts` | Stop |
| `Varnholde Crypts, Entrance Stairs` after returning | `Varnholde Crypts` | Resume |

Incidental prose mentions do not activate a map. Only the authoritative current location hierarchy does.

The injected canon contains:

- the root entry's immutable `[MAP]` section; and
- visible root/descendant Location contents, including Lorebook Agent timestamped updates.

The entire site is injected while inside it. Room-level activation is intentionally avoided because a current-room-only view can omit connected enemies, patrols, alarms, and consequences elsewhere in the site.

## Lorebook Agent UI

A real root Location with a `[MAP]` section displays a blue `MAP` button. Pressing it opens a dedicated read-only map viewer. Virtual italic hierarchy folders do not display the button because they are not records and cannot own maps.

## Safety and lifecycle

- Map capture happens immediately after a selected narrator generation and is also checked before the next generation.
- Swipe/regenerate outputs are not persisted until the replacement is selected.
- Existing lorebooks are never replaced when an expected book cannot be loaded.
- Captured hidden map HTML is stripped only from outgoing model context, never from the saved chat transcript.
- Leaving the site stops injection without deleting anything; returning resumes it.
- No separate pending-delta queue is used. Recent changes remain in chat context until the configured Lorebook Agent pass persists them.

## Explicitly out of scope

- Visual minimaps or fog of war
- Coordinate grids or renderable graph schemas as source of truth
- Dungeon/Combat modes that enumerate legal actions
- Full map rewrites after local changes
- Keyword-based live map activation
- GM-authored delta sidecars after initial map creation

## Verification

Tests cover:

- proper and malformed hidden-map wrappers;
- root `[MAP]` write-once behavior and legacy attachment migration;
- hierarchy activation, stopping, and resuming;
- descendant Location state in the deterministic injection;
- secret-map filtering from Lorebook Agent input;
- narrator prompt ownership rules; and
- the Lorebook Agent map badge wiring.
