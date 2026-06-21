# Two circulation directives — stair-door + "unreachable room → closet/ensuite" (2026-06-21)

Founder (live, ALMANZORA upper floor), two requirements:
1. **The stair MUST have a door onto the corridor or a public space.** It still ships isolated.
2. **A room that cannot be reached from the corridor should be RE-TYPED as a closet / wardrobe /
   ensuite of the room it IS accessed through** — "like that there is no conflict."

Directive 2 is the more important idea: it changes the *strategy* for the sealed-room defect.

---

## 1. Directive 2 — the elegant re-frame: don't seal, re-TYPE

### The principle
Today, when the carve leaves a room reachable only *through another habitable room* (e.g. bedroom B
reachable only via bedroom A), the engine treats it as a **defect**: it ships sealed (`→ NO DOOR ✗`)
or drops it. The founder's insight: that geometry is **only a defect for a BEDROOM**. The same
"accessed through the parent room, not the corridor" topology is **exactly correct** for a
**closet / wardrobe / dressing room / ensuite** — those rooms are *defined* by being entered from
their parent, never from circulation.

So: **a habitable room that the access graph can only reach through one parent room should be
re-typed to a private dependent of that parent** (closet/ensuite), not shipped as a sealed bedroom.
The "conflict" disappears because the room's NEW type makes its single-parent access *compliant by
definition*.

### Why this is the right architecture (not a hack)
- It honours `programRules.ts`: `ensuite.accessFrom=['master']`, a closet's accessFrom = its parent
  bedroom — both legitimately have NO corridor edge. The re-typed room becomes rule-compliant.
- It removes a whole class of `§TOPO-HARD-REJECT-ALL` (`circulation` / `reach`) failures: the room
  that couldn't reach the corridor is no longer *required* to.
- It improves the plan: a 4-bed plate where one "bedroom" can't reach the corridor becomes a
  3-bed + a walk-in-closet/ensuite — architecturally *better* than a sealed 4th bedroom.
- It connects directly to **SPEC-CLOSET-VESTIDOR Typology B** (private room closet) and the
  `CLOSET-VESTIDOR-PREBUILD-AUDIT`: this is the natural *trigger* for the carved closet — not "the
  bedroom is ≥20.25 m² so add a closet", but "this room can't reach the corridor, so it BECOMES the
  closet/ensuite of its accessible neighbour."

### Where it hooks in (pipeline, not furnish layer)
This is a **room-graph decision** — it must run in/near `enumerate.ts` + `wallsAndDoors.ts`, where
the access graph is evaluated, BEFORE the room is finalised. Sketch:
1. After the door passes, identify any habitable room whose realised `doorAdjacentTo` is exactly ONE
   habitable parent (no corridor/hall edge) — `§DIAG-ADJACENCY r5(bedroom) → bedroomA✓` only.
2. If the room's area + the parent's type allow it (parent is a bedroom/master; the dependent fits a
   closet/ensuite minimum), RE-TYPE r5 → `closet` (or `ensuite` if the parent has no ensuite yet) and
   re-stamp its name/occupancy. The single parent→dependent door it already has becomes compliant.
3. The topology gate then sees a compliant dependent, not a sealed bedroom → no `circulation` fail.
4. If re-typing is NOT possible (e.g. the room is the LAST bedroom, or too large to be a closet),
   fall back to today's behaviour (report sealed / surface the compromise).
⚠ Guard (the SPEC-CLOSET §4.3 rule): the re-typed dependent must NEVER gain a second door — a closet
with two doors is a corridor, not a closet. Reject any reroute that adds a corridor door to it.

This is a **layout-changing pipeline feature** — test-first + browser-gated (the 5×-revert subsystem),
but it is the architecturally-correct resolution of the sealed-room class and should be the next
major circulation pass.

---

## 2. Directive 1 — the stair door (still isolated)

The upper-floor stair ships with no door onto circulation. The §LU-CORRIDOR-COMPETE change
(commit `69035388`) brings a stair-anchored L corridor leg to the stair keep-out *when the straight
corridor misses it* — but the stair still shows isolated, which means one of:

- **(a) §LU-CORRIDOR-COMPETE didn't fire** — the straight corridor measured as "reaches the stair"
  by shared-wall even though no door is placed (a coordinate-frame / measure issue between
  `carve.corridorRect` and `keepOut`). Fix: switch the trigger from the carve-time shared-wall
  measure to the downstream `§STAIR-SPINE-TOUCH stairsBridgedToCorridor=0/1` signal, which is
  unambiguous about whether the stair got a corridor wall.
- **(b) it fired but the door pass didn't place the stair↔corridor door** — the L ring reaches the
  keep-out but `wallsAndDoors`' `stair-landing` pass didn't add the door (e.g. the shared wall is
  shorter than `MIN_DOOR_WIDTH`, or the stair-room cell isn't recognised as adjacent to the L
  polygon corridor). Fix: ensure the stair↔corridor edge is forced in the `stair-landing` pass
  against the polygon corridor (`polyRectSharedWallM(corridorRing, stairRect) ≥ MIN_DOOR_WIDTH`).

**The one console line that disambiguates:** does **`§LU-CORRIDOR-COMPETE`** appear on the upper
floor? If NO → fix (a). If YES but `§DIAG-STAIR-CIRC … doorOntoCirculation=NO` → fix (b). The two
fixes are opposite, so this must be confirmed before changing code.

As a stronger guarantee regardless of corridor shape: **the stair should be a first-class node the
door pipeline is REQUIRED to connect** — if `stairsBridgedToCorridor=0/1` after all passes, that is a
HARD fail the engine must resolve (grow the stair cell to the corridor, or route an empty-space stub),
never ship. The existing `§STAIR-CIRC-STUB` / `§STAIR-ROOM-GROW-TO-CORRIDOR` are these attempts; the
gap is they sometimes report `routed 0/1` and the candidate still ships. Elevating
"stair-not-on-circulation" to a non-shippable hard fail (with a guaranteed grow/stub fallback) is the
durable fix.

---

## Priority
1. **Directive 1 (stair door)** — the clearer, more contained defect; needs the one console line to
   pick fix (a) vs (b). Highest immediate priority.
2. **Directive 2 (unreachable → closet/ensuite re-type)** — the larger, architecturally-elegant
   change that dissolves the sealed-room class AND triggers the vestidor; a dedicated pipeline pass.
Both are layout-changing → test-first + browser-verified.
