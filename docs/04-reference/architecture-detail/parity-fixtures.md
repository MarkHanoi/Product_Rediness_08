# Parity fixtures — `tests/parity/<element>/`

**Status:** Active.  First element covered: `wall` (S08, 2026-04-27).

This doc describes the fixture format, capture procedure, and the
two-layer parity testing model the geometry kernel uses to prove that
**a) the kernel is deterministic across runtimes** and **b) the
kernel produces the same geometry as the legacy PRYZM 1 engine for a
trapping set of element configurations**.

The kernel itself never depends on these fixtures at runtime — they
exist purely as a CI-gated cross-engine parity check.

---

## 1. Directory layout

```
tests/parity/wall/
  configs/                       ← fixture DTOs (kernel-emitted)
    <id>.json                    ← Wall DTO + JoinData + worldY
  snapshots/                     ← kernel self-snapshots (gates regressions)
    <id>.snap.json
  references/                    ← PRYZM 1 reference geometry (cross-engine)
    <id>.ref.json
  wall-snapshot.test.ts          ← writes configs/, gates snapshots/
  wall-headless-node.test.ts     ← Node worker_thread vs in-process parity
  wall-pryzm1-cross-engine.test.ts (follow-up) — gates references/
```

The fixture catalog is authored in TypeScript at
`packages/geometry-kernel/__tests__/__configs__/index.ts` (30 fixtures
covering the matrix in `PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` lines
130-136); the snapshot test re-emits them as JSON on every run so
`configs/*.json` always tracks the TS source.

## 2. Fixture format (`configs/*.json`)

```jsonc
{
  "id": "straight-single-no-op",
  "description": "straight, single-layer, no openings",
  "wall":     { /* full Wall DTO from @pryzm/protocol */ },
  "joinData": { "start"?: { miterAngleRad, neighbourId }, "end"?: ... },
  "worldY":   0
}
```

The wall DTO is **fully resolved** — every Zod default folded in,
every opening `elementId` populated.  This is what the kernel
producer sees.

## 3. Snapshot format (`snapshots/*.snap.json`)

```jsonc
{
  "position": [ ...Float32Array... ],
  "normal":   [ ... ],
  "uv":       [ ... ],
  "index":    { "kind": "u16" | "u32", "values": [ ... ] },
  "bounds":   { "min": { "x", "y", "z" }, "max": { "x", "y", "z" } },
  "groups":   [ { "start", "count", "materialIndex" }, ... ],
  "materialKeys": [ "wall|...|...|...|...", ... ],
  "hash":     "wall-geom:v1:<sha1>"
}
```

The snapshot test (`wall-snapshot.test.ts`) compares **every** array
element-for-element.  To refresh after an intentional kernel change,
delete the snapshot file or re-run with `WALL_SNAPSHOT_REFRESH=1`.

## 4. PRYZM 1 reference capture (cross-engine gate)

The PRYZM 1 reference geometry is not regenerable from inside the new
kernel package (PRYZM 1's `WallFragmentBuilder` is THREE-bound and
lives under `src/elements/walls/**`, which S08 declares off-limits to
edits).  We capture references via a one-shot script:

```bash
npm run dev                                                 # start PRYZM 1
npx tsx scripts/capture-pryzm1-wall-references.ts           # writes references/
```

The script reads every `configs/*.json`, posts each to a tiny
`POST /__parity/wall/capture` endpoint exposed by the PRYZM 1 dev
server (added separately when the cross-engine gate is activated),
and dumps the resulting geometry to `references/<id>.ref.json`.

**Reference file format** (`references/*.ref.json`):

```jsonc
{
  "id": "straight-single-no-op",
  "capturedAt": "2026-04-27T12:00:00Z",
  "status": "ok" | "capture-pending",
  "source": "pryzm1" | "stub",
  "position": [ ... ],            // present iff status === "ok"
  "normal":   [ ... ],
  "uv":       [ ... ],
  "index":    { "kind": ..., "values": [ ... ] },
  "groups":   [ ... ],
  "bounds":   { ... },
  "notes":    "..."               // present iff status === "capture-pending"
}
```

Until the PRYZM 1 capture endpoint is wired and the script is run,
the reference files are written as `status: "capture-pending"` stubs
so the follow-up cross-engine test can gracefully skip rather than
fail an empty CI line.  This matches the S08 acceptance text: "30
self-snapshots green; capture script runs (full PRYZM-1-byte-parity
gate documented as a follow-up)".

## 5. Two-layer parity model

```
┌──────────────────────────────────────────────────────────────────┐
│ Layer 1 — DETERMINISM (always green in CI)                       │
│                                                                  │
│  wall-snapshot.test.ts          (kernel self-snapshot)           │
│  wall-headless-node.test.ts     (Node worker_thread ≡ in-proc)   │
│                                                                  │
│  Gates:  every kernel commit produces the same descriptor as     │
│          last commit, and produces it identically across the     │
│          Node worker boundary.                                   │
└──────────────────────────────────────────────────────────────────┘
              │                                     │
              ▼                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ Layer 2 — CROSS-ENGINE (PRYZM 1 ≡ kernel; activated when         │
│                          references are captured)                │
│                                                                  │
│  wall-pryzm1-cross-engine.test.ts                                │
│                                                                  │
│  Gates:  position / normal / uv / index byte-equality between    │
│          PRYZM 1's `WallFragmentBuilder` and the kernel for      │
│          every captured reference.  Skips IDs whose reference    │
│          is `capture-pending`.                                   │
└──────────────────────────────────────────────────────────────────┘
```

## 6. Adding a new element

1. Author fixtures in
   `packages/geometry-kernel/__tests__/__configs__/<element>.ts`.
2. Copy `wall-snapshot.test.ts` to
   `tests/parity/<element>/<element>-snapshot.test.ts` (the test is
   ~80 LOC and intentionally trivial to adapt).
3. Copy `wall-headless-node.test.ts` to gate the runtime boundary.
4. Once the new producer is stable, add a capture script under
   `scripts/capture-pryzm1-<element>-references.ts` modelled on the
   wall version.

## 7. References

- ADR-009 — `docs/architecture/adr/0009-producer-pure-function-signature.md`
- S08 spec — `docs/03_PRYZM3/reference/phases/PHASE-1/1B-Q2-M4-M6-WALL-END-TO-END.md`
- Element recipe — `docs/architecture/element-recipe.md`
