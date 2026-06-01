# M12 Alpha Demo — Recording Script (10 min)

**Source**: `docs/03_PRYZM3/reference/phases/PHASE-1/1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md` §3 (lines 1546–1568)
**Output**: `docs/demos/M12-alpha.mp4` (committed at deploy day; recording session is a manual step).
**Setup**: OBS or browser screen-record + stopwatch overlay; DevTools Network + Performance + Honeycomb tabs ready.

---

## Beat sheet (every timestamp scripted — do not ad-lib)

| Time | Beat | Caption |
|---|---|---|
| 0:00–0:30 | Open `apps/editor` at default URL — PRYZM 1 loads with a real customer project. | "PRYZM 1 is unchanged. Our paying customers are unaffected." |
| 0:30–1:30 | Navigate to `?pryzm2=1`. Stopwatch overlay. Small fixture loads. Then: DevTools → Network (manifest fetch → chunk fetch → first-interactive event). Then: Honeycomb (single trace, all layers). | "< 800 ms first interactive." |
| 1:30–3:00 | Place 5 walls + 1 slab + 1 door using the wall tool. Each placement: OTel append < 10 ms. Undo 3× (each < 5 ms). Redo 3×. Cut to DevTools Performance: Immer reverse-apply on undo, no full-state clone. | "Event-sourced. Undo is patch-reverse." |
| 3:00–4:00 | Hard-reload (`Ctrl+Shift+R`). Same project restores in < 800 ms. | "Zero full-snapshot POST. Events only." |
| 4:00–5:30 | Click "Export" → `demo.pryzm` downloads. Terminal beside browser: `unzip -l demo.pryzm` (manifest + events + chunks). `pryzm-cli unpack demo.pryzm -o recovered/` → `pryzm-cli add-wall recovered/demo …` → `pryzm-cli pack recovered/demo -o modified.pryzm` → drag `modified.pryzm` into browser → modified project opens with the new wall. | "Round-trip lossless. Headless = browser." |
| 5:30–7:00 | `?pryzm2=1&open=medium-fixture.pryzm` → visible level appears (stopwatch < 1.5 s). Background levels stream over ~3 s. Status bar: "Loading level X of 5". | "500 walls × 5 levels. 1.5 s to first interactive." |
| 7:00–8:30 | Open 5K-wall × 20-level fixture → stopwatch < 3 s first interactive; full scene over ~12 s. | "5,000 walls × 20 levels. < 3 s to first interactive." |
| 8:30–9:00 | Two browser windows side-by-side, same project. Draw wall in left → appears in right within ~1 s. | "Real-time sync. LWW in Phase 1; CRDT in Phase 2." |
| 9:00–9:30 | Show `docs/bench/dashboard.html` — every row green. | "Every promise on a CI gate." |
| 9:30–10:00 | Single wall-edit trace in Honeycomb — click → pixel, every layer instrumented. | "100% OTel coverage on hot paths." |

---

## Pre-flight checklist

- [ ] Default URL serves PRYZM 1 (no `pryzm2` flag) and loads a real customer project.
- [ ] `?pryzm2=1` URL flag swaps to the PRYZM 2 stack on the same domain.
- [ ] `medium-fixture.pryzm` and `5k-wall-20-level.pryzm` exist in the project file picker / via `?open=`.
- [ ] BullMQ + Postgres + R2 (or compatible S3) are reachable from the alpha-demo deploy.
- [ ] Honeycomb token + dataset are configured in `apps/editor/src/otel-config.ts`.
- [ ] `docs/bench/dashboard.html` is the latest M12-alpha output.
- [ ] OBS scene includes: browser viewport + stopwatch overlay + bottom-bar caption.
- [ ] Terminal window visible for the `.pryzm` round-trip beat.

## Post-recording

- Commit MP4 to `docs/demos/M12-alpha.mp4`.
- Update `docs/03_PRYZM3/reference/status-detail/01-PROCESS-TRACKER.md` §1D — flip the M12 ALPHA GATE row + S24 demo deferred item to [x].
