# SPEC-34 — Hybrid Data Sovereignty (Local / Cloud / Hybrid Sync)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead + Enterprise lead |
| Phase | Phase 4 (M37–M42) |
| Sprint | S75 D5 |
| References | `13-AEC-WISHLIST-SUPPLEMENT.md` §1 #2; `[strategic ADR-037]` |

---

## §1 Why this SPEC exists

AEC Magazine: *"If Autodesk, with Forma, gets this complex migration to the cloud wrong, Graphisoft will have a USP for its cloud-oblivious BIM architecture."* Government, defence, healthcare, and many enterprise customers cannot store project data in a public US-cloud bucket. Singapore BCA, EU GDPR + Schrems II, UAE NCA, KSA NCA, UK MoD, USA FedRAMP, Australia ISM all impose data-residency or sovereignty requirements that a US-only cloud BIM tool cannot satisfy.

PRYZM 2 GA at M36 ships self-host (S67 in Phase 3D). SPEC-34 turns self-host from "all-or-nothing on-prem" into **per-project sovereignty selection** with first-class **hybrid sync**: project metadata + collaboration goes through PRYZM cloud; geometry + IFC + materials + sensitive Pset data stays in the customer's choice of region or air-gapped local store.

## §2 The contract (binding)

### §2.1 Per-project sovereignty selector

```ts
interface ProjectSovereignty {
  mode: "local-only" | "cloud-public" | "cloud-region" | "hybrid" | "self-host";
  region: "uk" | "eu-fr" | "eu-de" | "us-east" | "us-west" | "sg" | "au" | "uae" | "sa" | null;
  encryptionKeyCustody: "pryzm-managed" | "byok-aws-kms" | "byok-azure-kv" | "byok-gcp-kms" | "byok-hsm";
  syncPath: "websocket" | "scheduled-pull" | "air-gap-import-export";
}
```

### §2.2 Five operating modes

| Mode | Where data lives | Sync | Use case |
|---|---|---|---|
| **local-only** | Browser IndexedDB + optional local-disk via File System Access API | none | Air-gapped sites, classified work, offline pre-meeting |
| **cloud-public** | PRYZM US/EU multi-region cloud | live websocket | Default for individual / Pro tier |
| **cloud-region** | PRYZM cloud, single region (UK / EU / SG / AU / UAE / SA) | live websocket | UK GovS regulated, GDPR Schrems II, BCA Singapore |
| **hybrid** | Geometry + IFC + Pset on customer's S3/Azure Blob/GCS; metadata + collab on PRYZM cloud | live websocket for metadata; chunk pre-signed URLs to customer bucket | Enterprise wanting collab UX without ceding model data |
| **self-host** | Full stack on customer infra (k3s helm chart, PG, MinIO) | optional federation to PRYZM cloud for cross-org review | Defence, healthcare, classified |

### §2.3 Hybrid sync mechanism

In `hybrid` mode:
- Sync server stores: `events` table, `cde_*` tables, `comments`, `redlines`, `presence`. **Lives on PRYZM cloud.**
- Chunk store + IFC + materials: customer-owned bucket (customer-credentialed pre-signed URLs minted by sync server). **Never copied to PRYZM cloud.**
- Browser fetches chunks directly from customer bucket via pre-signed URLs.

### §2.4 Default per `[strategic ADR-037]`

Default mode = `cloud-region` with `region` auto-selected from inferred locale. Authors can downgrade to `cloud-public` or upgrade to `hybrid` / `local-only` / `self-host`. Region change requires re-pack + transfer; UI warns about transit time.

## §3 Architecture

```
apps/sync-server         ← multi-region cluster (UK/EU/US/SG/AU/UAE/SA)
packages/sovereignty/    ← per-project mode enforcement; chunk-store router
packages/chunk-router/   ← routes chunk reads to (PRYZM-cloud-bucket | customer-bucket | local-IDB)
apps/sync-server-helm/   ← extends S67 self-host chart with hybrid-mode config
```

## §4 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S75 D5 | `packages/sovereignty/` schema + per-project mode selector UI |
| S75 D6 | regional sync-server cluster: deploy UK + EU-FR + US-East as first three regions |
| S75 D7 | hybrid-mode chunk router: customer S3/Azure/GCS bucket adapters; pre-signed URL minter |
| S75 D8 | local-only mode: File System Access API integration; air-gap import/export `.pryzm` round-trip |
| S75 D9 | self-host helm extension; sovereignty bench green |

## §5 NFT targets

| Workload | Target |
|---|---|
| Per-region sync latency (within same region) | < 250 ms p95 (matches GA SPEC-31 cap) |
| Cross-region federation (review on EU project from US) | < 1.5 s p95 |
| Local-only mode: full edit cycle without network | works fully offline |
| Hybrid mode: chunk fetch from customer bucket | adds < 100 ms vs PRYZM-cloud bucket |
| Region change re-pack (10K-element project) | < 60 s |

## §6 Anti-patterns forbidden

- Caching customer-bucket chunks in PRYZM cloud "for performance" — defeats hybrid mode.
- Auto-promoting `local-only` to `cloud-region` on first network reconnect — sovereignty mode is sticky.
- Cross-region writes without explicit author consent — every region change is logged + signed (SPEC-32 audit chain).
- Hybrid mode without BYOK by default — hybrid implies customer-controlled data; key custody mode `byok-*` is the default for hybrid (overrideable with explicit waiver).

## §7 Cross-references

- `[strategic ADR-037]` sovereignty default
- `[strategic ADR-038]` BYOK key custody
- SPEC-15 health checks (per-region readiness)
- SPEC-24 storage map (per-region table registration)
- SPEC-27 backups + DR (per-region restore)
- SPEC-32 CDE (per-region revision storage)
- SPEC-35 enterprise security (BYOK + CSP enforcement)
- SPEC-57 decentralised data ownership (Phase 8 — long-term sovereignty story)
