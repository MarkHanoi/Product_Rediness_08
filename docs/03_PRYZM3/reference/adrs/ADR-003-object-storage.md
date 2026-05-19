# ADR-003 — Object Storage Backend

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `05-IMPLEMENTATION-PLAN.md §17` row ADR-003 |
| Required by | Sprint S01 (Phase 1A start — `apps/bake-worker/` writes its first chunk) |
| Owner | Architecture lead |
| Implementation | `packages/object-store/` (driver-abstract); `apps/bake-worker/`, `apps/sync-server/`, `apps/ai-worker/` use it. |
| Spec dependency | `SPEC-02-PERSISTENCE.md` §4, `SPEC-08-SECURITY-COLLAB.md` §4.3 + §8.3 |

---

## Context

PRYZM 2 needs durable object storage for: baked geometry chunks, large textures and family templates, exported drawing artefacts (PDF/DXF/IFC), `.pryzm` archives, and per-tenant audit-log spillover. Volumes at GA target are 5–50 TB per region with multi-thousand IOPS during peak bake hours.

The choice is constrained by:
- **Egress cost** dominates the bill at our access pattern (chunks read by every browser session).
- **Self-host viability** — D7 (enterprise self-host) requires an S3-compatible backend that does not bind us to a hyperscaler.
- **Per-prefix key isolation** for tenant scoping (SPEC-08 §4.3).
- **Signed URLs with short TTL** (5 min) for direct browser fetch.

---

## Decision

- **Production (PRYZM-hosted SaaS):** Cloudflare R2.
- **Self-host (D7 enterprise variant):** MinIO bundled in the docker-compose stack (see ADR-012). The same `S3` API surface is used; switching is a config change only.
- **Local dev / CI:** MinIO container.

A single internal driver abstraction lives in `packages/object-store/`:

```ts
interface ObjectStore {
  put(bucket: string, key: string, body: Uint8Array, opts?: PutOpts): Promise<PutResult>;
  get(bucket: string, key: string): Promise<Uint8Array>;
  signGetUrl(bucket: string, key: string, ttlSec: number, prefix?: string): Promise<string>;
  signPutUrl(bucket: string, key: string, ttlSec: number, contentType: string): Promise<string>;
  delete(bucket: string, key: string): Promise<void>;
  list(bucket: string, prefix: string, cursor?: string): AsyncIterable<ObjectEntry>;
}
```

R2 driver and MinIO driver both implement this interface. No application code imports an SDK directly.

### Bucket / key layout

```
chunks/<projectId>/<chunkSha>.bin
chunks/<projectId>/manifest.json
exports/<projectId>/<exportId>/<filename>
templates/<typeId>/<version>.pryzm-family
audit/<tenantId>/<yyyy>/<mm>/spill-<n>.jsonl
```

Per-project prefix isolation is enforced by `signGetUrl(... , prefix)` — the function refuses to issue a URL whose key does not start with the supplied tenant/project prefix.

### Why R2 (over S3 / B2)
- **Zero egress fees** — material at our 5–50 TB monthly read pattern (estimated 60–80% cost reduction vs S3).
- **S3-compatible API** — MinIO and S3 are drop-in alternatives behind the driver.
- **Cloudflare-native** — colocated with our edge functions and WAF (SPEC-08 §1).
- **Worker integration** — signed URL minting lives inside Cloudflare Workers; no extra hop.

### Why MinIO for self-host (over Ceph / Garage)
- Trivial to bundle in docker-compose (single container).
- Same S3 API surface; no driver fork.
- Mature; battle-tested.
- Apache-2.0 license.

---

## Consequences

**Positive:**
- Egress cost predictable and low; growth in user count does not blow up the bill.
- D7 (self-host) is unblocked; same code path for SaaS and enterprise installs.
- Tenant isolation enforceable at the URL-mint layer (SPEC-08 §4.3).
- Driver swap is a config change; no application refactor.

**Negative:**
- R2's per-region availability is narrower than S3 (mitigated by region pinning per SPEC-08 §8).
- R2 lifecycle policies are less mature than S3; cold-tier migration logic stays in `apps/bake-worker/` rather than a backend-managed lifecycle.
- MinIO bundle adds ~600 MiB to the self-host docker image.

**Mitigation:**
- Region pinning matches Cloudflare R2 jurisdictional regions (EU-W, US-E, AP-SE).
- Cold-tier policy: chunks not read in 90 days move to a separate bucket prefix; recall path is transparent to clients via redirect.

---

## Alternatives considered

### S3 (AWS)
- Rejected for SaaS prod due to egress cost ($0.09/GB out of US-East at our access pattern).
- Acceptable as a per-customer self-host backend; the driver supports it but we don't bundle it.

### Backblaze B2
- Rejected: cheaper than S3 but slower per-GET p99 in our edge tests; egress only free into Cloudflare, which couples us to CF anyway — at which point R2 is structurally simpler.

### Garage / SeaweedFS for self-host
- Rejected for v1: less mature ops story and smaller community than MinIO. Reconsider for v2 if MinIO licensing ever shifts.

### IPFS
- Rejected: CDN performance and access-control story do not match our requirements. Considered only as a future content-addressed cache for public templates (out of scope).

---

## Phase rollout
- S01 — `packages/object-store/` lands with R2 + MinIO drivers; CI uses MinIO container.
- S04 — bake-worker writes first wall chunk via the driver.
- S22 (M12 alpha) — signed-URL prefix isolation enforced; CI gate live.
- S48 (M24 beta) — exports bucket layout; multi-region R2 deploy live in EU-W and US-E.
- S70 (Phase 3D) — AP-SE region added; cold-tier policy live.
- S72 (M36 GA) — D7 self-host docker-compose ships with MinIO bundled.
