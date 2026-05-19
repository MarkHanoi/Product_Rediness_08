# SPEC-33 — Stakeholder Review Wedge (Viewer + Redline + Approval)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Product lead + Architecture lead |
| Phase | Phase 4 (M37–M42) |
| Sprint | S74 D5 (after CDE comments) |
| References | `13-AEC-WISHLIST-SUPPLEMENT.md` §1 #1; `[strategic ADR-036]`; SPEC-32 |

---

## §1 Why this SPEC exists

The AEC Magazine BIM 2.0 wishlist names "Figma-of-BIM" stakeholder collaboration as a category-defining wedge. Motif (ex-Autodesk-CTO + ex-Co-CEO) raised Series A/B on exactly this thesis. The pattern: **clients, contractors, engineers, planning officers** review BIM models without owning a per-seat licence; they redline, comment, approve, and the architect's team responds. This converts every project into a 5–20 person collaboration instead of a 1–3 architect island.

PRYZM 2 GA ships authoring + multi-user editing. SPEC-33 ships the **review tier**: free / unlimited stakeholder reviewers per project, redline overlay, async approval, no seat licence. Per `[strategic ADR-036]` the reviewer tier is **free per project** (cost absorbed; offset by Pro / Enterprise paid tiers); rationale: the network effect of every-stakeholder-on-PRYZM is worth more than per-reviewer revenue.

## §2 The contract (binding)

### §2.1 Reviewer entitlements (per project)

- **Read** the published model at any tag/release (CDE per SPEC-32 §2.1).
- **Redline** in 2D plan view + 3D scene + sheet view; redline is its own overlay layer (does not modify model).
- **Comment** anchored to: element / view / sheet region / redline mark.
- **Vote** (approve / reject / request-revision) on releases at S3 / S4 / S5 transitions.
- **Cannot**: edit model, edit other reviewers' redlines, see WIP (S0) state.

### §2.2 Author / project-owner entitlements

- See all reviewer redlines + comments + votes.
- Resolve / mark-addressed per redline + per comment.
- Promote release through CDE state machine (SPEC-32) only when all reviewer votes resolved (configurable: required vs advisory).

### §2.3 Free per project

`[strategic ADR-036]` ratifies: every PRYZM project includes **unlimited reviewer seats** at zero marginal price. Pro/Enterprise pricing applies to authors/editors only. Antifraud: rate-limited to 50 reviewer seats per project per day; > 50 triggers human review.

### §2.4 Redline data model

```ts
interface Redline {
  id: ULID;
  projectId: string;
  releaseTag: string | null;     // anchor to a CDE release (or null = current)
  authorId: string;
  layer: "plan-2d" | "scene-3d" | "sheet";
  geometry: RedlineGeometry;     // strokes / shapes / text / area-mark
  attachedTo: ElementRef | ViewRef | SheetRegionRef | null;
  status: "open" | "addressed" | "withdrawn";
  comments: Comment[];           // re-uses cde_comments
  createdAt: number;
}
```

## §3 Architecture

```
apps/viewer/                ← stripped-down editor; read-only model + redline overlay
plugins/redline/            ← redline tool (strokes, shapes, area marks)
plugins/review-vote/        ← approve/reject/revise UI
packages/redline-store/     ← Y.js redline document (separate from model CRDT)
packages/review-entitlements/ ← per-project free-reviewer enforcement
```

Reviewer auth: magic-link from project owner OR Microsoft / Google SSO. Per `[strategic ADR-022]` no PII required at sign-in; only email.

## §4 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S74 D5 | `apps/viewer/` skeleton — read-only authority, no edit toolbar, no command bus mutators |
| S74 D6 | `plugins/redline/` — strokes + area marks + text marks |
| S74 D7 | `packages/redline-store/` — separate Y.js doc; bridge to comments (SPEC-32 §2.3) |
| S74 D8 | reviewer magic-link invite flow; entitlements check |
| S74 D9 | release vote UI; vote rollup to release transition gate |

## §5 NFT targets

| Workload | Target |
|---|---|
| Viewer cold-load (10K-element model, current release) | < 2 s p95 |
| Redline submit | < 200 ms p95 |
| Reviewer presence broadcast (peer-list update) | < 250 ms p95 |
| 100-redline overlay render | < 100 ms (no frame drop) |
| Vote rollup (50 reviewers × 5 releases) | < 100 ms |

## §6 Anti-patterns forbidden

- Reviewer seats counted toward per-seat billing (kills the wedge).
- Redlines stored inside the model CRDT (couples mutable review state to immutable model state).
- Letting reviewers see WIP / S0 state (breaks the audit story; reviewers see only published releases).
- Vote rollup = unanimity. Default = "all required votes received"; configurable per-release.

## §7 Cross-references

- `[strategic ADR-036]` reviewer pricing
- SPEC-32 CDE module (provides releases + comments)
- SPEC-37 federated clash (clash overlay rendered in `apps/viewer/`)
- SPEC-58 outcome-based pricing (reviewer count drives outcome metering)
