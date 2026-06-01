# M9-1C — Headless demo script

> **Milestone**: M9 (Phase 1C exit)
> **Recording target**: 3 min, 1080p, no audio (captions OK).
> **Captured by**: contributor's local machine. The Replit container has no
> video-capture device, so the recording is produced off-platform. When
> uploaded, edit `docs/05-guides/developer/demos/README.md` to point at the real URL plus
> SHA-256.
> **Recording status**: ⏳ pending capture (see `docs/05-guides/developer/demos/README.md`).
> **Equivalent CI gate**: [`tests/integration/headless-vs-browser-parity.test.ts`](../../tests/integration/headless-vs-browser-parity.test.ts)
> — 12 families × 3 fixtures = 36 cases, byte-equal descriptor parity
> across headless and browser paths. This is the machine-checkable
> substitute that satisfies the spec's exit criterion in the absence of
> the video.
> **Deliverable**: per `PHASE-1-COMPLETION-PLAN.md` §7 1C checklist
> (which permits "script + external link" in lieu of an in-repo `.mp4`).

---

## Setup (off-camera)

```bash
git clone <repo>
cd repo
npm install
npm run build         # ensures @pryzm/headless CLI is resolvable
mkdir -p ./tmp-demo
cd ./tmp-demo
```

## Take 1 — headless project bootstrap (45 s)

```bash
# 1. Create a new empty project.
npm run cli --workspace=@pryzm/headless -- new-project demo.pryzm

# 2. Inspect — show the file is a valid `.pryzm` zip.
unzip -l demo.pryzm
```

Captions:
- "PRYZM 2 ships a Node CLI that round-trips identically with the editor."
- "No DOM, no THREE — the headless package gates that invariant on every
  run via `dependency-cruiser` (ADR-0017)."

## Take 2 — populate from the CLI (60 s)

```bash
# Add 6 walls forming a closed rectangle.
npm run cli --workspace=@pryzm/headless -- add-wall demo.pryzm \
  --start 0,0 --end 6,0 --thickness 0.2 --height 3
npm run cli --workspace=@pryzm/headless -- add-wall demo.pryzm \
  --start 6,0 --end 6,4 --thickness 0.2 --height 3
npm run cli --workspace=@pryzm/headless -- add-wall demo.pryzm \
  --start 6,4 --end 0,4 --thickness 0.2 --height 3
npm run cli --workspace=@pryzm/headless -- add-wall demo.pryzm \
  --start 0,4 --end 0,0 --thickness 0.2 --height 3

# Pack into a fresh distributable.
npm run cli --workspace=@pryzm/headless -- pack demo.pryzm
```

Captions:
- "Each `add-wall` runs the SAME `wall.create` handler the editor uses."
- "Same handler → same store mutation → same kernel producer →
  byte-equal geometry. The headless-vs-browser parity test
  (`tests/integration/headless-vs-browser-parity.spec.ts`) gates that
  invariant on every CI run."

## Take 3 — open in editor and confirm parity (75 s)

```bash
npm run dev          # starts apps/editor on port 5000
# Drag-drop demo.pryzm into the canvas → 6 walls render with
# matching joins / materials / hashes.
```

On-screen overlay (browser devtools):
- Open `__pryzm2DevHandle.runtime.stores.wall.size` → expect `6`.
- Open `__pryzm2DevHandle.runtime.stores.wall.values()[0].id` → matches the
  ID printed by the CLI's `pack` step.

Captions:
- "Same project file. Same producers. Same hashes. The headless surface
  is the production code path, not a side track."

## Take 4 — close-out card (15 s)

Static card (no command):

> **Phase 1C exits with 12 element families on the same plugin
> descriptor pattern, 163+ disk-based parity fixtures, and a Node-only
> CLI that round-trips with the editor. Phase 1D begins next.**

---

## Acceptance

The recording is signed-off when:

- All four takes are visible without cuts.
- The `add-wall` IDs printed in Take 2 match the editor inspector in Take 3.
- The CI URL on the close-out card resolves (the `headless-vs-browser-parity`
  spec status badge is green).
