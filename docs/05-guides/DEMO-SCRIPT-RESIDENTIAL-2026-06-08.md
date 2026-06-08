# PRYZM — Residential demo script (LinkedIn) — 2026-06-08

**Context.** The app is **not public** (not even private beta) because of instability,
bugs, and layout-quality gaps. So the demo is **NOT a live release** — it is a *curated,
recorded screen-walk* (the format of the existing PRYZM LinkedIn posts: 60–120 s, narrated
by captions, no audience clicking around). The goal is to tell **one continuous residential
story** along the *known-good* happy path, and to **avoid the unstable branches**.

This doc is the shot-list + the "do / don't" guardrails. The tracked feature requests behind
it live in `master-execution-tracker.md` §22 (DEMO-1/2/3 · BND-90 · FORMA-CTX · FLR-VIEWS).

---

## The story (one take, ~90 s)

| # | Beat | What the viewer sees | State today | Demo guardrail |
|---|---|---|---|---|
| 1 | **Create a House** | "New project → Residential House". | Works. | **Skip the persona/profile modal** (DEMO-1). If it still appears, cut it in the edit. |
| 2 | **Go to the site** | Map / Cesium view, zoom to a real plot. | Works (London tested; see prod-test memo). | Pick a plot you've **pre-tested**. Don't improvise the location. |
| 3 | **Draw the boundary** | Click the plot corners; boundary closes. | Works; **D60 ortho-draw on main**. | **First line free, then toggle "orthogonal to last edge"** so corners snap 90° (BND-90). Record a clean rectilinear plot — it both looks right *and* drives a better layout + stair. |
| 4 | **Design options + Living Graph** | Option modal; each option shows its **bubble/adjacency graph**. | Modal works; **Living-Graph-in-modal is DEMO-2 (queued)**. | If DEMO-2 isn't wired yet: show the option cards, pick one, then open the **Living Graph panel** on the main canvas right after — same beat, two clicks. |
| 5 | **Layout generates** | Walls/rooms/doors/windows appear on the plan. | Works (deterministic engine). | Use a **3-bed brief on a ~110–130 m² plot** — the best-tested envelope. Avoid tiny plots (room-drop warnings) and huge ones. |
| 6 | **Edit on the fly** | Change a room's **area** (or type) in the Living Graph → layout **regenerates live**. | A.26 substrate works; **harden = DEMO-3**. | Pre-rehearse ONE edit that visibly improves the plan (e.g. grow the living room). Don't fish for an edit live. |
| 7 | **3D interrogation** | Flip to 3D: real BIM model on **3D Tiles**, **Forma** massing context. | Works (house-on-tiles, Forma stack). | Frame a hero angle. **FORMA-CTX (terrain contours + roads + pedestrian) is queued** — until then, prefer the **3D-Tiles photoreal** context shot over bare Forma volumes. |
| 8 | **Climate on the fly** | Sun / wind / comfort overlay animates over the site. | Works (NOAA sun + climate ingest). | One overlay, one sweep. Keep it short. |

**Close caption:** "Site → brief → generative residential layout → live edit → 3D + climate.
Web-native. Soon early access."

---

## Hard "do NOT show" list (today's instability)

- ❌ Multi-floor (2–3 storey) houses end-to-end — **upper-floor plan VIEWS aren't auto-created
  yet** (FLR-VIEWS). Stay single-storey, or only show the 3D stack, not the per-floor plans.
- ❌ Bare Forma extruded-volume context with no terrain/roads (FORMA-CTX) — reads as "grey
  blocks". Use 3D-Tiles photoreal instead until FORMA-CTX lands.
- ❌ Improvised plots / extreme briefs (tiny or >5-bed) — they trip the §FEASIBILITY-ALLOC
  room-drop and §ENVELOPE-DIAGNOSTIC reject paths.
- ❌ Free-hand (non-orthogonal) boundaries for housing — skewed plots still expose wall-joint
  + stair-placement defects. Use BND-90 rectilinear plots.

## What makes this demo honest *and* impressive

The strength to lean on is the **chain**, not any single trick: **a drawn site boundary on a
real map deterministically becomes a code-aware residential layout you can edit by changing a
number — and read in 3D with climate**. That's the differentiator vs. "AI that draws a pretty
plan." Keep the camera on the *causality* (edit area → plan changes), which is exactly the
A.26 editable-Living-Graph thesis.

---

*Queued blockers to make this a LIVE (not just recorded) demo: DEMO-1, DEMO-2, DEMO-3,
BND-90, FORMA-CTX, FLR-VIEWS + A.27 P5–P7 layout quality. See tracker §22.*
