---
title: "PRYZM 2.0.0 — General Availability"
date: 2026-04-29
status: draft
sprint: S72 D6
audience: customers + architects + integration partners
---

# PRYZM 2.0.0 is generally available

Three years ago we set out to rebuild PRYZM from the data layer up. Today
PRYZM 2.0.0 is generally available — a 6-service self-hostable BIM
platform with a 30+-plugin marketplace, a public REST + WS + headless +
AI API surface, IFC / DXF / Rhino interop, a PDF-to-BIM (preview)
pipeline, and a SOC 2-evidence-pipeline-ready security posture.

This post is the launch announcement; full release notes are at
[`RELEASE-NOTES-2.0.0.md`](https://github.com/pryzm/pryzm/blob/main/RELEASE-NOTES-2.0.0.md).
The 36-month build retrospective is at
[`docs/03-execution/status/post-mortems/PRYZM-2-build.md`](https://github.com/pryzm/pryzm/blob/main/docs/03-execution/status/post-mortems/PRYZM-2-build.md).

## What changed since PRYZM 1

- **Real-time multiplayer**, CRDT-backed and conflict-free.
- **Incremental bake** — 6× faster than the 1.x full re-cook on small edits.
- **Plugin SDK 1.0** with a signed marketplace and four supported tiers.
- **Public REST + WebSocket + headless + AI APIs**, OAuth2-authenticated and rate-limited.
- **Self-host** with a 6-service Docker Compose bundle, ARM64 + x86_64.
- **PDF-to-BIM** (preview) — reads architectural PDFs into editable BIM.
- **Editor performance** — opens the 10K-wall × 50-level largest fixture without OOM.

## What ships under "preview" at GA

PDF-to-BIM ships under the `'preview'` label per [ADR-029 Part E](https://github.com/pryzm/pryzm/blob/main/docs/02-decisions/adrs/0029-pdf-to-bim-preview.md).
The accuracy thresholds are documented; we hold the gate at preview
until the SPEC-45 reference corpus is measured. Customers can flip
the label to `'full'` in their own deployments by running
`evaluatePreviewGate(realMetrics)` against their own corpus.

## What we cut from M36

The cut-list discipline (`[strategic ADR-018]` Tier-1 + Tier-2)
absorbed six cuts over the build. The big ones at GA:

- **DXF/SVG export** — PDF export covers the 2D handoff workflow; DXF
  *import* shipped (S55) covers the consumption side.
- **Multi-region SaaS** — single-region at GA; self-host satisfies most
  EU residency asks via Hetzner / OVH / Scaleway Frankfurt.
- **Component editor real-time co-presence** — single-author at GA.
- **Multi-language UI** — en-only at GA.
- **Offline-first** — multiplayer is the M36 differentiator.

The post-GA roadmap re-prioritises each cut by real customer signal:
[`docs/03-execution/plans/post-ga-roadmap.md`](https://github.com/pryzm/pryzm/blob/main/docs/03-execution/plans/post-ga-roadmap.md).

## PRYZM 1 sunset

PRYZM 1 entered sunset at S61. The 90-day migration window is active.
The per-project migration tool (`pryzm pack` / `pryzm unpack`) is in
the CLI now; the batch migration tool ships during the sunset window.

Existing customers: see [`docs/03-execution/plans/pryzm-1-sunset.md`](https://github.com/pryzm/pryzm/blob/main/docs/03-execution/plans/pryzm-1-sunset.md)
for the migration playbook.

## Self-host

`docker-compose up` to a working PRYZM 2 in < 10 minutes on a
4-vCPU Linux VM. See [`docs.pryzm.com/selfhost/getting-started`](https://docs.pryzm.com/selfhost/getting-started)
for the full install + day-2 ops guide.

## Numbers

- 72 sprints. 144 weeks. 36 months.
- 45 SPECs. 30 strategic ADRs. 54 sprint ADRs.
- 100+ workspace packages.
- 30+ first-party plugins.
- 6 self-host services.
- 0 schedule slips at the milestone level (M24, M27, M30, M33, M36 all on plan).
- 1 LAUNCH on Tuesday.

## Where to start

- **New customers**: [pryzm.com](https://pryzm.com) → sign up → editor.
- **Self-host**: [docs.pryzm.com/selfhost](https://docs.pryzm.com/selfhost).
- **Plugin authors**: [docs.pryzm.com/plugin-sdk](https://docs.pryzm.com/plugin-sdk).
- **Integrators**: [docs.pryzm.com/api](https://docs.pryzm.com/api).
- **Existing PRYZM 1 customers**: [migration playbook](https://github.com/pryzm/pryzm/blob/main/docs/03-execution/plans/pryzm-1-sunset.md).

## Thanks

- The 25 beta cohort users for the early DXF/SVG signal that made the cut clean.
- The reviewers of the SPEC corpus that locked at S00.
- The cut-list discipline for keeping us honest.

PRYZM 2.0.0. GA. April 29, 2026.

---

*Draft authored 2026-04-29 at S72 D6. Live publish on the marketing
site is operator-side per phase-doc §S71 D2. Edit before publish to
substitute final URLs + paid customer counts + case-study links.*
