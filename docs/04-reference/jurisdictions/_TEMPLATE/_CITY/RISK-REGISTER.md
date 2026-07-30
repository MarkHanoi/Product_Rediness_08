<!-- CITY RISK-REGISTER.md (C63 §5 — the fail-safe / honesty guardrails). Copy into the dossier, replace
     <PLACEHOLDER>s, delete this comment. Pattern: the Barcelona RISK-REGISTER. -->
# Risk register — <PLACE> (<code>)

> The honesty guardrails: every way this city's data could silently mislead, and the fail-safe that keeps it
> honest. A risk is CLOSED only when the fail-safe is in place (a cited refusal, a typed `not-assessed`, a
> render that flags uncertainty). Not scored; it protects `honestyOk` (C63 §3.1).

| # | Risk (how it could silently lie) | Axis affected | Fail-safe (what keeps it honest) | Status |
|---|---|---|---|---|
| R1 | `<e.g. footprint-fallback parcel presented as cadastral>` | PARCEL | `<C57 §L-640 cap>` | `<OPEN/CLOSED>` |
| R2 | `<e.g. fabricated 9 m height rendered as measured>` | HEIGHTS/LOD | `<L-647 wireframe + C62 tier>` | `<…>` |
| R3 | `<e.g. envelope overstates — ignores FAR ceiling / setback-unknown as zero>` | ENVELOPE | `<C58 §1.4 fidelity label + cited refusal>` | `<…>` |
| R4 | `<e.g. legislation borrowed from a neighbour city (Hospitalet-from-BCN trap)>` | LEGISLATION | `<per-clau SOURCES.md + signed VERIFICATION.md>` | `<…>` |

## Trip-wires
`<the specific values/probes that, if they change, mean a risk re-opened — mirror NEXT.md TRIP-WIRES>`

---
*Authority: C63 §3.1 (honesty companion) · §CONTEXT-DATA-HONESTY. Protects: `RATE.md honestyOk`.*
