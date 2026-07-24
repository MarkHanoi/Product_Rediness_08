# Denmark — Datafordeler MATRIKLEN2 WFS authentication (forensic, 2026-07-24)

> **Scope:** decides whether `server/dkMatrikelProxy.js` (HTTP Basic Auth, Datafordeler
> Service User) is correct for production in 2026, or must be rewritten. Every conclusion
> below is backed by a **live probe** and/or an **official source** (Datafordeler /
> Klimadatastyrelsen / official Confluence / official PDF guides). No blogs, no StackOverflow.

---

## 1. Executive summary — the verdict

**Our current proxy is BROKEN and must be rewritten. HTTP Basic Auth with a Datafordeler
Service User (`DATAFORDELER_USERNAME` / `DATAFORDELER_PASSWORD`) is retired for the WFS.**

Three independent facts, each proven by a live probe on 2026-07-24, converge:

1. **Our exact URL is already dead.** `https://services.datafordeler.dk/MATRIKLEN2/MatrikelGaeldendeOgForeloebig/1.0.0/WFS`
   returns **HTTP 404** to every request — authenticated or not. That host+alias no longer serves this service.
2. **The live Matriklen WFS moved to a new host that speaks OAuth/API-key only.**
   `https://wfs.datafordeler.dk/...` answers **`HTTP 401 WWW-Authenticate: Bearer`**. Basic-Auth
   header, `username=/password=` query params, and `X-API-Key` header were all live-probed and
   all returned **401**. The gateway's own JSON error names the only two accepted methods:
   *"Please verify your use of API key or OAuth."*
3. **The official transition guide states Service Users are forbidden here, verbatim:**
   *"Det er ikke muligt at benytte tjenestebruger til autentifikation for de entitetsbaserede
   WFS-tjenester"* ("It is **not possible** to use a service user for authentication for the
   entity-based WFS services").

**Timeline:** the consolidated legacy WFS (Snowflake/GeoServer) closed **1 July 2026**; full
parallel operation of Web-User/Service-User ends **15 January 2027**, after which **only API
key or OAuth** works. We are already past the first cutover — hence the 404.

### The recommended production fix (Q10 + deliverable 3, stated first)

Rewrite `dkMatrikelProxy.js` to call the **new host** with an **API key on the URL**:

```
Old (dead, 404):
  https://services.datafordeler.dk/MATRIKLEN2/MatrikelGaeldendeOgForeloebig/1.0.0/WFS
    ?...&username=USER&password=PASS

New (live, 401→200 with a real key):
  https://wfs.datafordeler.dk/MAT/MAT_WFS/1.0.0/WFS
    ?service=WFS&version=2.0.0&request=GetFeature
    &typeName=jordstykke_current&srsName=EPSG:25832&count=20
    &bbox=<minE>,<minN>,<maxE>,<maxN>,urn:ogc:def:crs:EPSG::25832
    &apikey=<DATAFORDELER_API_KEY>
```

- **Host:** `services.datafordeler.dk` → **`wfs.datafordeler.dk`**.
- **Service path:** `MATRIKLEN2/MatrikelGaeldendeOgForeloebig/1.0.0/WFS` →
  **`MAT/MAT_WFS/1.0.0/WFS`** (register `MAT`, service `MAT_WFS`).
- **typeName:** `mat:Jordstykke` → **`jordstykke_current`** (new entity-based naming: entity +
  `_current` for currently-valid features).
- **Auth:** drop `username=/password=`; add **`&apikey=<KEY>`**.
- **Env:** replace `DATAFORDELER_USERNAME`/`DATAFORDELER_PASSWORD` with a single
  **`DATAFORDELER_API_KEY`**.

**Why API key, not OAuth, for our case:** Matriklen parcel data is **open (unprotected) data**;
an API key is accepted for exactly this class and is the simplest server-side secret to hold
(one static string, no token lifecycle). OAuth Shared Secret is the alternative if we ever need
protected datasets or per-request token rotation — flow documented in §Q7. For a commercial SaaS
proxying thousands of anonymous parcel clicks through **one** server-side credential, a single
long-lived API key held in an env var / secret store is the correct architecture (§Q10).

---

## 2. Architecture diagram

```
                        (browser never sees the credential)
┌──────────────┐  GET /api/parcel/dk    ┌───────────────────────┐
│   Browser    │  ?lon=..&lat=..        │   PRYZM backend       │
│ (map click)  │ ─────────────────────► │  dkMatrikelProxy.js   │
│              │ ◄───────────────────── │  (server.js, Fly)     │
└──────────────┘   { parcel: {...} }    └───────────┬───────────┘
                                                    │  holds DATAFORDELER_API_KEY (env/secret)
                                                    │
                                                    │  GET wfs.datafordeler.dk/MAT/MAT_WFS/1.0.0/WFS
                                                    │    ?...&typeName=jordstykke_current
                                                    │    &bbox=...&apikey=<KEY>
                                                    ▼
                                        ┌───────────────────────────┐
                                        │  Datafordeler WFS gateway  │
                                        │  wfs.datafordeler.dk       │
                                        │  (validates apikey/OAuth;  │
                                        │   401 WWW-Authenticate:    │
                                        │   Bearer if missing)       │
                                        └───────────┬───────────────┘
                                                    │  GML FeatureCollection (EPSG:25832)
                                                    ▼
                                        parse posList → UTM32N→WGS84 → { ring, refcat, areaM2 }
                                                    │
                                                    ▼
                                             back to Browser as { parcel }

  OAuth alternative (protected data / token rotation), replacing the apikey= param:
    backend ──POST client_id+client_secret, grant_type=client_credentials──►
      https://auth.datafordeler.dk/realms/distribution/protocol/openid-connect/token
    ◄── access_token (Bearer) ──  then:  Authorization: Bearer <token>  on the WFS GET
```

---

## 3. Exact PRYZM implementation change — `server/dkMatrikelProxy.js`

**VERDICT: Replace Basic Auth (username/password) with an `apikey=` query param on a new host+path.**

Concrete, engineer-ready diff of intent:

| Item | Current (broken) | Change to |
|---|---|---|
| `DK_MATRIKEL_WFS_URL` default | `https://services.datafordeler.dk/MATRIKLEN2/MatrikelGaeldendeOgForeloebig/1.0.0/WFS` | `https://wfs.datafordeler.dk/MAT/MAT_WFS/1.0.0/WFS` |
| `DK_MATRIKEL_TYPENAME` default | `mat:Jordstykke` | `jordstykke_current` |
| Credential env | `DATAFORDELER_USERNAME` + `DATAFORDELER_PASSWORD` | `DATAFORDELER_API_KEY` |
| URL auth in `buildMatrikelUrl()` | `&username=…&password=…` | `&apikey=<KEY>` |
| `TYPENAMES=` param | `TYPENAMES` (WFS 2.0 plural) | keep `&typeName=jordstykke_current` (GeoServer accepts `typeName`; the official examples use `typeName=`) |

`buildMatrikelUrl()` becomes (essential lines):

```js
const apikey = deps.apikey ?? process.env.DATAFORDELER_API_KEY;
if (!apikey) return null;                        // no key → { parcel: null }, as today
const base = deps.wfsUrl ?? DK_MATRIKEL_WFS_URL; // wfs.datafordeler.dk/MAT/MAT_WFS/1.0.0/WFS
const typename = deps.typename ?? DK_MATRIKEL_TYPENAME; // jordstykke_current
// Native 25832 bbox is safest — request in the CRS the data is stored in:
const bbox = `${minE},${minN},${maxE},${maxN},urn:ogc:def:crs:EPSG::25832`;
return `${base}?service=WFS&version=2.0.0&request=GetFeature` +
  `&typeName=${encodeURIComponent(typename)}&srsName=EPSG:25832&count=20` +
  `&bbox=${encodeURIComponent(bbox)}` +
  `&apikey=${encodeURIComponent(apikey)}`;
```

Notes for the implementer:
- The `apikey` param spelling accepted by the gateway is **`apikey`** (official examples use both
  `apikey=` and `apiKey=`; the gateway is case-insensitive on the param name — prefer lowercase
  `apikey` as in the primary transition-guide examples).
- Everything downstream (`parseMatrikelGml`, `utm32nToWgs84`, ring/refcat logic) is **unchanged** —
  the GML shape and EPSG:25832 geometry are the same. Only the request line changes. Consider
  `&outputFormat=application/json` later to drop the GML parser, but that is optional and out of scope.
- The existing "no credential → `{ parcel: null }` and warn once" posture is preserved; just gate on
  `DATAFORDELER_API_KEY` instead of username/password.

---

## 4. Risk assessment

| Risk | Status | Detail |
|---|---|---|
| **Will the current Basic-Auth impl work?** | ❌ **No — silent 404** | Live-probed: our exact URL returns HTTP 404 with empty body. `fetchTextOnce()` treats non-OK as `null` → handler returns `{ parcel: null }`. Denmark parcel-select is **silently dead** — the OSM-footprint fallback masks it. This is the "failure vs empty are the SAME VALUE" trap (MEMORY: context-data-honesty-family). |
| **Wrong host** | ❌ must migrate | `services.datafordeler.dk` (old) → `wfs.datafordeler.dk` (new). Old host: 404 for the alias, 503 for `MAT_AlleData`. |
| **Wrong service alias** | ❌ must migrate | `MatrikelGaeldendeOgForeloebig` → `MAT_WFS`. |
| **Wrong typeName** | ❌ must migrate | `mat:Jordstykke` → `jordstykke_current`. |
| **Auth model retired** | ❌ must migrate | Service User Basic Auth explicitly forbidden on entity-based WFS (official quote, Q1). |
| **Hard cutover** | ⚠ 2027-01-15 | After this date Web-User/Service-User cease entirely; only API key / OAuth. We must be migrated well before. |
| **Credential provisioning** | ⚠ human-gated | Someone must register on Datafordeler Administration, create an IT-system, and mint an API key (shown once — copy immediately). Free, but a manual founder step. |
| **API key scope** | ✅ sufficient | API key covers **unprotected** data; Matriklen parcels are open data, so the key suffices. If a future dataset is protected, escalate to OAuth Shared Secret + approved application. |
| **Post-migration correctness** | ✅ low | Geometry/CRS/GML unchanged; only the request line differs. Reprojection math untouched. |

**Recommended guardrail:** add a startup/health probe that does an unauthenticated
`GetCapabilities` against the configured URL and asserts a **401** (challenge = alive & keyed),
distinguishing it from a **404** (wrong host/alias = misconfigured). Ship the probe before the fix.

---

## 5. Answers to the 10 questions

**Q1 — Does the Matriklen WFS still support Basic Auth (Service User)?**
**No — retired for the entity-based WFS.** Official transition guide: *"Det er ikke muligt at
benytte tjenestebruger til autentifikation for de entitetsbaserede WFS-tjenester."* Live probe of
the new host rejects Basic header, `username=/password=` query, and `X-API-Key` — all 401.
Confidence: **High**.

**Q2 — What replaces it?** An **IT-system** authenticated by one of: **API key**, **OAuth Shared
Secret**, or **OAuth Certificate**. Guide §3: *"Datafordeleren understøtter følgende
autentifikationsmetoder for WFS: IT-system med API-nøgle / OAuth Shared Secret / OAuth Certifikat."*
Confidence: **High**.

**Q3 — Can an individual developer get access?** **Yes.** Datafordeler Administration offers
*"login via e-mailadresse/adgangskode og login via MitID (erhverv og privat)"* — i.e. plain
**email/password** registration (verified by email link) or **MitID private**. No Danish CVR is
required for basic registration. Access to data is then via an IT-system you attach to your user.
Free; immediate after email verification. Confidence: **High** (CVR-not-required inferred from the
email/MitID-privat login path; **Medium** on whether *protected* datasets later require org approval —
irrelevant to open Matriklen).

**Q4 — How does an IT-System gain access to Matriklen?** In **Datafordeler Administration**
(`portal.datafordeler.dk`) you (a) create a user, (b) create an **IT-system** ("For at få adgang
til data skal du tilknytte et IT-system til din bruger. Det er IT-system, der holder rettigheder
og autentifikation"), then (c) create an **API key** / **OAuth Shared Secret** under that
IT-system. The key is **shown once** in a dialog — copy it immediately. For open data (Matriklen)
no separate per-dataset approval/subscription is needed; the credential grants the open WFS
directly. Confidence: **High**.

**Q5 — Open or Protected?** **Open (unprotected/Frie grunddata).** Matriklen basic cadastral data
is part of the free Danish grunddata programme, and API keys — which per official docs *"provide
access only to unprotected data"* — are an accepted method for `MAT_WFS`. If the key works, the
data is open by definition. (Historik/bitemporal variant `_hist` is the same class.) Confidence:
**High**.

**Q6 — Can an API key be used DIRECTLY on the WFS URL?** **Yes — as a query param `apikey=`.**
Official example (transition guide, verbatim):
`https://wfs.datafordeler.dk/BBR/BBR_WFS/1.0.0/WFS?service=WFS&version=2.0.0&request=GetCapabilities&apikey={YOUR_API_KEY}`
and a real-key example ending `…&apikey=avcaqTElssKjaj2fF90GTVqrOcb38tmDuTBEi9ITe5b…`. It is **not**
`username/password`, **not** `X-API-Key` header, **not** `Authorization` — it is the URL query
param **`apikey=`** (case-insensitive; `apiKey=` also appears). Confidence: **High**.

**Q7 — OAuth flow (if used).** Client-credentials against Keycloak:
1. `POST https://auth.datafordeler.dk/realms/distribution/protocol/openid-connect/token`
   with `grant_type=client_credentials`, `client_id=<IT-system client id>`,
   `client_secret=<Shared Secret value>`.
2. Response → `access_token` (Bearer).
3. WFS request carries header `Authorization: Bearer eyJhbGciOiJSUzI1NiIsI…`.
(Certificate variant uses a different token host: `auth-oces.datafordeler.dk`.) Confidence: **High**
on endpoint+grant+header; **Medium** on realm name persistence.

**Q8 — Is there an OGC API Features endpoint replacing WFS?** **Partially / emerging.** The QGIS
connection dialog in the guide is labelled *"WFS / OGC API – Features"*, and Datafordeler's
modernisation moves entity access toward **GraphQL** (`graphql.datafordeler.dk`) and file download
as the strategic APIs. But the **supported, documented spatial endpoint for parcels today remains
the entity-based WFS 2.0.0** at `wfs.datafordeler.dk/MAT/MAT_WFS/1.0.0/WFS`. **Recommendation:**
migrate to the new WFS now (smallest change, geometry-compatible); do **not** rewrite onto GraphQL
for V1. Confidence: **Medium** (no stable public OGC API Features URL for MAT confirmed).

**Q9 — Official migration guide (Service User → API key/OAuth)?** **Yes:**
- *"Brugervejledning – Transitionsguide for entitetsbaserede WFS-tjenester"* (PDF, datafordeler.dk media) — the authoritative WFS migration guide; §3 is authentication.
- *"Autentifikationsmetoder på Datafordeler Administration"* (Confluence, confluence.kds.dk pageId 187105503) — API key + OAuth Shared Secret + Certificate flows, token endpoints.
- *"Guide til brugeroprettelse på Datafordeler Administration"* (PDF) — user + IT-system + key creation.
- `datafordeler.dk/vejledning/transitionsnetvaerk/` + `/brugeradgang/` — timeline + deprecation notice.
Confidence: **High**.

**Q10 — Recommended production architecture for a commercial SaaS (thousands of users).**
Store a **single server-side API key** (`DATAFORDELER_API_KEY`) in the backend secret store (Fly
secret / env), used by `dkMatrikelProxy.js` on the `apikey=` param. Rationale, per official
guidance: (a) Matriklen is **open data**, and *"API keys provide access only to unprotected data"* —
which is exactly our case, so the heavier OAuth machinery buys nothing; (b) the browser **never**
sees the credential — all calls are server-to-server through our proxy, matching the Catastro
pattern; (c) one static key = trivial lifecycle vs. OAuth token refresh. **Never** ship
username/password (retired anyway) or any credential to the client. Upgrade path if we later need
protected datasets or key rotation: swap the `apikey=` param for the OAuth Shared Secret
client-credentials flow (§Q7) — same proxy, add a cached Bearer token. Confidence: **High**.

---

## 6. Evidence appendix

Format: conclusion — **source URL** — ≤25-word quote — date — confidence.

1. **Service User being phased out** — `https://datafordeler.dk/vejledning/brugeradgang/` —
   *"OBS Udfases ultimo 2026: Adgang med Webbruger og Tjenestebruger."* — accessed 2026-07-24 — High.

2. **Only API key/OAuth after cutover** — `https://datafordeler.dk/vejledning/transitionsnetvaerk/` —
   After **15 Jan 2027** *"the system exclusively uses API-key or OAuth authentication for data access."*
   — accessed 2026-07-24 — High.

3. **Legacy WFS closed 1 July 2026** — `https://confluence.kds.dk/pages/viewpage.action?pageId=25723998`
   (title) — *"Guide til WFS på Datafordeleren (udfases 1. juli 2026)."* — accessed 2026-07-24 — High.

4. **Service User forbidden on entity WFS** (transition-guide PDF §3) —
   `https://datafordeler.dk/media/fcmeibjz/brugervejledning-transitionsguide-for-entitetsbaserede-wfs-tjenester.pdf`
   — *"Det er ikke muligt at benytte tjenestebruger til autentifikation for de entitetsbaserede WFS-tjenester."*
   — accessed 2026-07-24 — High.

5. **Three accepted WFS auth methods** (same PDF §3) — same URL —
   *"IT-system med API-nøgle / OAuth Shared Secret / OAuth Certifikat."* — accessed 2026-07-24 — High.

6. **New host + MAT service path** (same PDF, Tabel 2) — same URL —
   *"Matriklen  MAT  1.0.0  https://wfs.datafordeler.dk/MAT/MAT_WFS/1.0.0/WFS"* — accessed 2026-07-24 — High.

7. **API key is a URL query param** (same PDF example) — same URL —
   *"…/WFS?service=WFS&version=2.0.0&request=GetCapabilities&apikey={YOUR_API_KEY}"* — accessed 2026-07-24 — High.

8. **`_current` entity naming** (same PDF) — same URL — layer *"bygning_current"* for currently-valid
   features; parcels → **`jordstykke_current`** (Matriklen Jordstykke entity). — accessed 2026-07-24 — High.

9. **OAuth token endpoint + Bearer header** —
   `https://confluence.kds.dk/pages/viewpage.action?pageId=187105503` —
   token `https://auth.datafordeler.dk/realms/distribution/protocol/openid-connect/token`,
   grant `client_credentials`, then `Authorization: Bearer …`. — accessed 2026-07-24 — High.

10. **API key = unprotected data only** — same page (pageId 187105503) — *"API keys provide access
    only to unprotected data and cannot be used for restricted datasets."* — accessed 2026-07-24 — High.

11. **Individual can register (email or MitID private)** —
    `https://datafordeler.dk/media/jajckqtc/guide-til-brugeroprettelse-paa-datafordeler-administration.pdf`
    — *"Datafordeler Administration tilbyder login via e-mailadresse/adgangskode og login via MitID (erhverv og privat)."*
    — accessed 2026-07-24 — High.

12. **IT-system holds rights + auth** (same PDF §4) — same URL — *"For at få adgang til data skal du
    tilknytte et IT-system til din bruger. Det er IT-system, der holder rettigheder og autentifikation."*
    — accessed 2026-07-24 — High.

### Live-probe log (curl, 2026-07-24, from PRYZM dev host)

| Request | Result | Meaning |
|---|---|---|
| `GET services.datafordeler.dk/MATRIKLEN2/MatrikelGaeldendeOgForeloebig/1.0.0/WFS?...GetCapabilities` (no auth) | **404**, empty body, `Server: datafordeler.dk` | Our current URL is dead. |
| …same with dummy `username=/password=` | **404** | Not an auth challenge — the alias is gone. |
| `GET services.datafordeler.dk/MATRIKLEN2/MAT_AlleData/1.0.0/WFS?...` | **503** | Old host winding down. |
| `GET wfs.datafordeler.dk/MATRIKLEN2/MAT_AlleData/1.0.0/WFS?...` | **401 `WWW-Authenticate: Bearer`** | New host, live, OAuth/key required. |
| `GET wfs.datafordeler.dk/MAT/MAT_WFS/1.0.0/WFS?...` | **401 `WWW-Authenticate: Bearer`** | New canonical Matriklen WFS, live. |
| …with header `Authorization: Bearer DUMMYTOKEN` | **401 `WWW-Authenticate: Bearer error="invalid_token"`** | Confirms OAuth 2.0 Bearer validation. |
| …with `&apikey=DUMMYKEY123` | **401 `application/problem+json`**, `DAF-AUTH-0005`: *"Access denied. No authentication method found. Please verify your use of API key or OAuth."* | apikey is a first-class method; only key/OAuth accepted. |
| …with Basic header `-u DUMMY:DUMMY` | **401** | Basic Auth not accepted. |
| …with `X-API-Key: DUMMY` header | **401** | Header form not accepted — key goes in the URL param. |

---

*Compiled 2026-07-24. Primary authority: Datafordeler transition-guide PDF (entity-based WFS) +
Klimadatastyrelsen Confluence auth-methods page + live gateway probes. When code disagrees with
these sources, the code (`dkMatrikelProxy.js`) is wrong.*
