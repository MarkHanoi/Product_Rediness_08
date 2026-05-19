# ADR-011 — Permission Granularity

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `05-IMPLEMENTATION-PLAN.md §17` row ADR-011 |
| Required by | Sprint S43 (Phase 2D — role/permission matrix live) |
| Owner | Architecture lead |
| Implementation | `packages/permissions/`; enforcement in L2 command handler, L3 lock acquisition, edge API, UI gating. |
| Spec dependency | `SPEC-08-SECURITY-COLLAB.md` §3 |

---

## Context

The permission model determines *what a role can do to what scope of data*. Three granularity levels were considered:

- **Per-node (per-element-instance):** one ACL per element. Maximum flexibility; high overhead.
- **Per-type (per-element-class):** one ACL per type/family ("Editor X cannot modify structural walls").
- **Per-zone (project / view scope):** ACL per project, per view kind.

`05-IMPLEMENTATION-PLAN.md §17` proposed "Per-node, with role inheritance." `10-MASTER-IMPLEMENTATION-PLAN-36M.md` row ADR-011 amended this to "Project-, view-, element-class- (not per-element instance for v1)." This ADR ratifies the amended position. The amendment is justified by:
- Per-instance ACLs explode storage and authorization-check cost without solving a real customer ask in v1.
- The role/permission matrix in SPEC-08 §3.2 is expressible at element-class granularity (e.g. "Limited Editor cannot create/modify structural walls or load-bearing columns/beams").

---

## Decision

**Three granularity levels — project, view, element-class. Per-element-instance permissions are out of v1 scope.**

### Granularity ladder
1. **Project** — membership; role within the project (Owner/Admin/Editor/Limited Editor/Reviewer/Viewer). Stored in `project_members`.
2. **View** — per-view-kind read/comment/edit. Used for "engineers see the structural model only," "consultants get the architectural sheet set." Stored in `project_view_grants`.
3. **Element-class** — per-family / per-typed-discriminator (e.g. `Wall.structural`, `Column.loadBearing`, `Beam.loadBearing`). Encoded in role definitions, not in per-element ACLs.

### Enforcement points (defense in depth, all four required)
1. **L2 command handler** — refuses with `PermissionError` before the command reaches L3.
2. **L3 soft-lock acquisition** — refuses lock for forbidden elements (per SPEC-08 §3 + SPEC-03 §4.5).
3. **API edge** — same checks at the HTTP boundary.
4. **UI** — disables/hides forbidden actions.

### Custom roles (Enterprise)
- Tenant admins compose custom roles by checking capabilities in §3.2 of SPEC-08 + per-discipline element-class filters (e.g. "MEP-only editor" = Editor-tier capabilities limited to `Pipe.*`, `Duct.*`, `Conduit.*`, `Equipment.*` element classes).
- Custom roles ship in M30 (Enterprise readiness).

### Postgres RLS
- All RLS policies operate at project + role granularity (per SPEC-08 §4.1).
- Element-class checks happen in application code, not in RLS — RLS enforces "you may read this project's elements" and the application enforces "you may not delete a structural wall."

### Storage shape
```sql
project_members (project_id, actor_id, role, custom_role_id?)
custom_roles (id, tenant_id, name, capabilities jsonb, element_class_filters jsonb)
project_view_grants (project_id, view_id, actor_id_or_role, level)  -- read/comment/edit
```

No per-instance permission table. If a v2 use case appears, an `element_acl_overrides` table can be added without changing the existing schema (additive).

### Reasoning per use-case

| Customer ask | Expressible in v1? | How |
|---|---|---|
| "Engineer reads architectural model, can edit structural" | Yes | View grant + role |
| "Consultant reviews only" | Yes | Reviewer role |
| "Junior cannot delete columns" | Yes | Element-class filter on Editor role (custom role) |
| "Lock this one wall to one user" | Yes | Soft-lock (SPEC-03 §4) — short-TTL, not permission |
| "Permanently lock element X" | **No** (deferred) | Out of v1; would require per-instance ACL. Workaround: split into a sub-project. |

---

## Consequences

**Positive:**
- Enforcement is fast (one role+capabilities lookup per command, cached per session).
- Storage is bounded (linear in members + roles, not in elements).
- The matrix in SPEC-08 §3.2 is fully realisable.
- Enterprise custom roles add expressivity without an architecture change.

**Negative:**
- Some niche asks ("permanently lock this single instance") are deferred to v2. Mitigated by soft-locks (short-TTL ownership) and project splitting.
- Discipline filters require careful element-class taxonomy; SPEC-05 §1.2 + §1.3 commit to a stable taxonomy.

---

## Alternatives considered

### Per-instance ACLs (the original "B" of `05-IMPLEMENTATION-PLAN`)
- Rejected for v1 on cost vs benefit. Storage explodes (5 KB × 50,000 elements × 100 actors × 1000 projects = absurd). Authz check on every event becomes the dominant runtime cost.

### Project-only (no view, no class)
- Rejected: too coarse for the SPEC-08 §3 matrix; "structural-write" cannot be expressed.

### XACML / OPA policy engine
- Rejected for v1: overkill; introduces a policy DSL that customers must learn. Reconsider in v2 only if customers ask.

### Capability-token system (every command gets a JWT)
- Rejected: tokens reissue cost on every role change; debugging story is hard. The `JWT.roles[]` claim + per-call lookup is sufficient.

---

## Phase rollout
- S08 — `packages/permissions/` skeleton; role enum.
- S22 (M12 alpha) — base role enforcement at L2 + UI for Solo/Team plans.
- S43 — full role matrix per SPEC-08 §3 enforced at all four points.
- S46 — view grants live.
- S48 (M24 beta) — element-class filters on standard roles enforced.
- S55 — Custom roles for Enterprise (composer UI + storage).
- S70 — element-class taxonomy frozen for v1; documented in `docs/operations/permissions.md`.
- S72 (M36 GA) — pen test pass on the permission surface; per-instance ACL parked as v2 candidate with migration sketch.
