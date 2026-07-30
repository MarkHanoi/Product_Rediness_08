# United Kingdom (`gb`) — regions index

> Constituent-country + regional services, layer names, data currency. GB has **four planning systems and four
> geodata estates** — England is the only one tackled today. **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED.

| Constituent country | ISO 3166-2 | Terrain source | Planning system | Heritage | Status |
|---|---|---|---|---|---|
| **England** | GB-ENG | EA LIDAR Composite DTM/DSM 1 m (OGL v3, keyless) — **wired** (`terrain.mjs` `gb`) | Local Plans + NPPF (discretionary) | Historic England | ✅ terrain + context wired (London) |
| Scotland | GB-SCT | Scottish Remote Sensing Portal (separate) | NPF4 + Local Development Plans | HES | ❌ not wired |
| Wales | GB-WLS | DataMapWales / NRW LiDAR (separate) | PPW + LDPs | Cadw | ❌ not wired |
| Northern Ireland | GB-NIR | OpenDataNI / DAERA LiDAR (separate) | SPPS + Local Development Plans | HED | ❌ not wired |

**Tackled cities:** Greater London (`E12000007`, gb-eng). ⚠ Do NOT assume the England EA endpoints answer for
Scotland/Wales/NI — each needs its own `terrain.mjs` source row before its cheap axes compute (`COUNTRY-RATE.md` §C).
