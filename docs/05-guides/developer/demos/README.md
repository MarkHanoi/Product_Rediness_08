# PRYZM 2 — demo recordings

This directory holds the **spec / script** for each milestone demo. The
script is the **authoritative reproduction recipe** that lives in the repo;
the recorded `.mp4` is a deliverable captured on contributor hardware (the
Replit container has no video-capture device) and is referenced — not
embedded — from this README.

## M9 — Phase 1C exit (`M9-1C-headless`)

- **Spec / script**: [`M9-1C-headless.script.md`](./M9-1C-headless.script.md)
  — copy-pasteable commands, captions, and acceptance checks.
- **Recording status**: ⏳ *pending capture*. The placeholder URLs that
  previously pointed at `demos.pryzm.app` and a `pryzm-app/pryzm-2-demos`
  GitHub release have been removed because neither bucket exists yet. The
  spec (`PHASE-1-COMPLETION-PLAN.md` §1C row D9 / line 1368) explicitly
  permits **"`docs/05-guides/developer/demos/M9-1C-headless.mp4` *or* external link in
  `docs/05-guides/developer/demos/README.md`"** — i.e. the script + a future link satisfies
  the exit criterion. When the recording is captured this README should be
  updated with the real URL and SHA-256.
- **Length target**: ~3 min, 1080p, no audio (captions OK).
- **What it shows**:
  1. `npm run cli --workspace=@pryzm/headless -- new-project demo.pryzm`
  2. `npm run cli -- add-wall …` for 6 walls forming a rectangle.
  3. `npm run cli -- pack demo.pryzm` — no DOM, no THREE in the trace.
  4. The same `.pryzm` file opened in the browser editor — every wall,
     join, and material renders identically.
- **Equivalent CI gate** (machine-checkable substitute for the visual demo):
  [`tests/integration/headless-vs-browser-parity.test.ts`](../../tests/integration/headless-vs-browser-parity.test.ts)
  asserts byte-equal descriptor output across the headless and browser
  paths for 12 families × 3 fixtures = 36 cases. Runs in Vitest under
  the standard `npm test` pipeline.

## M12 — Phase 1D alpha gate (`M12-alpha`)

See `M12-alpha.script.md` (already present) — full alpha demo recorded for
the gate sign-off.

---

*Why the recordings are external*: shipping multi-MB binary `.mp4`
artefacts in-repo bloats clones and burns LFS quota; the script is the
authoritative reproduction recipe and lives in the repo, the binary is a
deliverable.
