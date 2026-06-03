# SPEC-35 — Browser Security & Enterprise Hardening (BYOK + CSP/COOP/COEP + SOC2 + FedRAMP)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 (CSP/plugin origins reconciled to `pryzm.so` 2026-06-03 per ADR-055/C51) |
| Owner | Security lead + Architecture lead |
| Phase | Phase 4 (M37–M42) |
| Sprint | S76 D5 + S82 |
| References | `13-AEC-WISHLIST-SUPPLEMENT.md` §1 #3; `[strategic ADR-038]` |

---

## §1 Why this SPEC exists

AEC Magazine: *"Graphisoft has taken this approach as it has concerns over browser security."* Enterprise + government procurement gates a web BIM tool on:

- Customer-managed encryption keys (BYOK).
- Strict browser security primitives (CSP / COOP / COEP / Trusted Types / SRI).
- SOC 2 Type 2 (continuous evidence pipeline, not point-in-time).
- FedRAMP Moderate roadmap (US federal work).
- ISO 27001 alignment.
- Plugin sandbox audit (extends S62 sandbox).
- Pen-test results (annual + on every release).

PRYZM 2 GA ships generic security (S65 in Phase 3D — pen test, RLS audit, plugin sandbox). SPEC-35 turns this into the **enterprise hardening pack** that opens public-sector + Fortune 500 procurement.

## §2 The contract (binding)

### §2.1 BYOK (Bring Your Own Key) per `[strategic ADR-038]`

- Per-tenant data encryption key (DEK) wrapped by customer-controlled key encryption key (KEK).
- KEK custody options: **AWS KMS / Azure Key Vault / GCP KMS / on-prem HSM (PKCS#11 via cloud HSM bridge)**.
- Customer can rotate KEK any time; PRYZM re-wraps DEK transparently within 5 minutes.
- Customer can **revoke** KEK; revocation deletes the wrapped DEK on the same hour, all customer data becomes ciphertext-only within < 1h, full crypto-erase within 24h.
- ADR-038 ratifies: ship KMS-backed by default; HSM-backed as enterprise tier; both available per customer.

### §2.2 Browser security primitives

Every PRYZM origin enforces:

| Header / primitive | Value | Effect |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss://*.pryzm.so https://*.pryzm.so; frame-src 'self' https://plugins.pryzm.so; ...` | Strict CSP; no inline scripts; nonce-based for any necessary inline |
| `Cross-Origin-Opener-Policy` | `same-origin` | Cross-origin window isolation |
| `Cross-Origin-Embedder-Policy` | `require-corp` | Required for SharedArrayBuffer (used by worker pool) |
| `Cross-Origin-Resource-Policy` | `same-origin` | Default deny |
| `Trusted Types` | enforced via `require-trusted-types-for 'script'` | Prevents DOM XSS sinks |
| `Subresource Integrity` | required on every external script (none expected) | Defence-in-depth |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HSTS preload |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing off |
| `Referrer-Policy` | `same-origin` | No leakage |
| `Permissions-Policy` | minimal allow-list (camera off by default; geolocation off by default; etc.) | Surface reduction |

### §2.3 Plugin sandbox enforcement (extends S62)

S62 ships plugin sandbox via Web Worker. SPEC-35 adds:
- Plugins served from `https://plugins.pryzm.so` (separate origin) — frame-src CSP isolates them.
- Per-plugin capability manifest signed by marketplace (sigstore).
- Per-plugin egress allow-list (no arbitrary network).
- Per-plugin CPU + memory + storage quota.

### §2.4 SOC 2 Type 2 evidence pipeline

- Continuous evidence collection (not annual snapshot): every deploy, every IAM change, every key rotation, every backup, every DR drill auto-files an evidence row in `audit_log_evidence` table.
- Drata or Vanta integration; auditor-readable export.
- Annual Type 2 report; quarterly internal audit.

### §2.5 FedRAMP Moderate roadmap

- Authority To Operate (ATO) sponsorship from a federal agency by M48.
- 3PAO assessment by M54.
- ATO award targeted by M60.
- Until ATO, US-federal work runs on `self-host` mode (SPEC-34) only.

## §3 Architecture

```
packages/encryption/      ← BYOK-aware envelope crypto; KEK adapters (AWS / Azure / GCP / PKCS#11)
packages/audit-evidence/  ← evidence-row emitter; integration with Drata/Vanta
infra/headers/            ← per-deployment CSP / COOP / COEP enforcement
infra/csp-reporter/       ← CSP violation telemetry → Honeycomb (per ADR-007)
plugins-marketplace/sigstore/ ← per-plugin signature verification at install
```

## §4 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S76 D5 | `packages/encryption/` envelope crypto + AWS KMS adapter |
| S76 D6 | strict CSP / COOP / COEP rolled to staging; report-only mode for 7 days; then enforce |
| S76 D7 | Azure Key Vault + GCP KMS adapters |
| S76 D8 | PKCS#11 HSM adapter (CloudHSM bridge) |
| S76 D9 | plugin sandbox cross-origin migration (`plugins.pryzm.so`); sigstore manifest verification |
| S82 D1 | SOC 2 Type 2 evidence pipeline live; Drata integration |
| S82 D5 | annual pen-test (independent firm); fix all critical/high before S82 D9 |
| S82 D9 | FedRAMP Moderate gap analysis; ATO sponsorship outreach starts |

## §5 NFT targets

| Workload | Target |
|---|---|
| BYOK key rotation (per tenant) | < 5 min for full DEK re-wrap |
| KEK revocation → ciphertext-only | < 1 h |
| Crypto-erase | < 24 h |
| CSP violations on production | 0 (any non-zero is a bug) |
| Plugin sandbox escape | 0 known; pen-test annual |
| SOC 2 evidence freshness | < 24 h staleness on any control |

## §6 Anti-patterns forbidden

- Allowing `'unsafe-inline'` scripts (CSP). Inline scripts are nonce-based or removed.
- Storing customer KEK in PRYZM-controlled storage (defeats BYOK).
- "BYOK" that wraps a PRYZM-master-key (security theatre). Customer KEK is the only path to plaintext DEK.
- Plugins on the same origin as `apps/editor` (defeats sandbox).
- Annual SOC 2 evidence collection (continuous is the contract).
- Self-attesting FedRAMP. ATO requires 3PAO assessment and federal sponsorship.

## §7 Cross-references

- `[strategic ADR-038]` BYOK key custody
- SPEC-21 RLS + permission model
- SPEC-24 storage map (encryption-at-rest applied per table)
- SPEC-34 hybrid sovereignty (BYOK is mandatory for hybrid mode)
- SPEC-62 plugin sandbox (S62 base; this SPEC extends)
