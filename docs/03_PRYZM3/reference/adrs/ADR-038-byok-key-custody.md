# ADR-038 — Enterprise BYOK Key Custody: KMS-Default + HSM-Tier

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-04-27 |
| Phase | 4 (M37–M42) |
| Deciders | Security lead, Enterprise lead |
| Related | SPEC-35, SPEC-34 |

## Context

BYOK (Bring Your Own Key) lets customers control their key encryption key (KEK). Three custody options:

1. **KMS-backed only** — AWS KMS / Azure Key Vault / GCP KMS.
2. **HSM-backed only** — PKCS#11 / on-prem HSM via cloud bridge.
3. **Both** — KMS as default, HSM as enterprise tier.

## Decision

**Both.** KMS-backed at every paid tier (Pro / Team / Enterprise). HSM-backed gated to Enterprise + Government tiers.

## Consequences

**Positive**
- KMS adoption is broad (every cloud has it) → low-friction enterprise sales.
- HSM availability for FedRAMP / classified work.
- Pricing tier alignment: HSM unlocks higher-margin enterprise contracts.

**Negative**
- 4 adapters to maintain (AWS / Azure / GCP / PKCS#11).
- HSM testing requires hardware in CI (cost + complexity).

**Risks**
- Key-rotation bugs catastrophic. Mitigated by quarterly key-rotation drills; backup DEK envelope stored alongside (re-encrypt on rotation, never lose plaintext access mid-rotation).

## Alternatives considered

- **KMS only** — rejected: blocks FedRAMP / defence work.
- **HSM only** — rejected: friction kills SMB Pro adoption.
