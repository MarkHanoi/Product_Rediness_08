# C105 — AI Provider Credentials (BYOM)

> **Stamp**: 2026-08-23 · **Status**: CANONICAL
> **Scope**: user-supplied AI provider credentials — storage, call topology, routing, quota/spend consequences, provenance, and the user-facing surface. Governs `packages/ai-host/src/byom/**`, `apps/editor/src/ui/ai/byom/**`, `server/byomKeyGuard.js`, and the BYOM arm of `server/securityHeaders.js`.
> **Depends on**: [C08 Collaboration & Security](./C08-COLLABORATION-AND-SECURITY.md) · [C09 AI & Visibility Intent](./C09-AI-AND-VISIBILITY-INTENT.md) · [C22 Privacy & PII Tier](./C22-PRIVACY-AND-PII-TIER.md) · [C23 Provenance & AI Audit](./C23-PROVENANCE-AND-AI-AUDIT.md) · [C66 Concurrency & Scale](./C66-CONCURRENCY-AND-SCALE.md) · [C77 Secrets & Configuration Register](./C77-SECRETS-AND-CONFIGURATION-REGISTER.md)
> **Implemented by**: SPEC-BYOM-PROVIDER-KEYS · ADR-0360
> **Key principles**: P6 (commands are the only mutation path — BYOM mutates nothing in the model), P8 (spans).

---

## §0 — Preliminaries a reader must not skip

### §0.1 — ⛔ "BYOK" IS ALREADY TAKEN, AND MEANS SOMETHING ELSE

**[C22 §1.4](./C22-PRIVACY-AND-PII-TIER.md) and [C08 §8](./C08-COLLABORATION-AND-SECURITY.md) use "BYOK" for customer-managed ENCRYPTION keys** — a KMS endpoint, `pryzm_users.byok_enabled`, `SUPABASE_SERVICE_ROLE_KEY`, deny-default on key-resolve failure. That is a *data-at-rest* posture for the PROJECT tier, sold to Enterprise, and it is unrelated to what this contract governs.

This contract governs a **user-supplied model credential**: an API key for Claude, ChatGPT, Gemini, DeepSeek, OpenRouter or a local Ollama, which the user pastes into PRYZM so their chat runs on their own account. Different subject, different threat model, different payer, different UI.

**The name here is BYOM — "Bring Your Own Model".** The two terms MUST NOT be mixed, in code, in docs, or in support copy. A single word meaning two security postures inside a compliance document is how an auditor is told the wrong thing.

### §0.2 — What C105 is NOT

| Question | Contract that owns it |
|---|---|
| Which model PRYZM uses by default, and the upstream route for PRYZM's own key | [C09 §2.1, §2.2](./C09-AI-AND-VISIBILITY-INTENT.md) |
| Customer-managed encryption of project data | [C22 §1.4](./C22-PRIVACY-AND-PII-TIER.md), [C08 §8](./C08-COLLABORATION-AND-SECURITY.md) |
| What an AI artefact must record | [C23 §1.2](./C23-PROVENANCE-AND-AI-AUDIT.md) — C105 §6 adds two fields, it does not restate the tuple |
| Plan tiers and what each includes | [C39](./C39-PRICING-AND-PLAN-TIERS.md) |
| The zero-token chat ladder and its ordering | [C67](./C67-RAC-CAPABILITY-CONTROL-PLANE.md), §PLANNER |
| Server secrets held by PRYZM | [C77](./C77-SECRETS-AND-CONFIGURATION-REGISTER.md) — ⚠ a BYOM key is NEVER a C77 secret, because PRYZM never holds one |

### §0.3 — The one sentence this contract exists to keep true

> **A user's AI provider credential is stored only on their device, and leaves it only to call the provider they chose.**

Every clause below is either that sentence made precise, or a consequence of it. Where a clause and that sentence conflict, the sentence wins and the clause is the defect.

---

## §1 — Invariants

Normative (RFC 2119). Each rule carries a stable §N.M identifier so ADRs and gates can cite it.

### §1.1 — The default path MUST NOT move

A user who has configured no BYOM provider MUST experience **bit-for-bit today's behaviour**: the same `/api/anthropic/v1/messages` proxy, the same [C09 §2.3](./C09-AI-AND-VISIBILITY-INTENT.md) quota enforcement, the same `ai-spend` accounting, the same model id. BYOM is **strictly additive**.

This MUST be proven by test at the wiring layer — asserting on the URL actually fetched — and not by inspection. A pure-function assertion is insufficient: the subsystem can be correct while the editor calls none of it.

CI gate: `byomPlannerRouting.spec.ts §DEFAULT-UNCHANGED`, `byomVaultAndRoute.test.ts §DEFAULT-UNCHANGED`.

### §1.2 — Storing a credential MUST NOT enable it

Saving a key and using a key are **two separate user actions**. A stored-but-unselected provider resolves to `pryzm-managed`. This exists so a user can stage a key without a surprise change to who is paying for their next sentence.

### §1.3 — The credential MUST NOT reach a PRYZM server, log, span, error report, or project file

Not in full, not truncated, not hashed-and-truncated, not as a prefix. A prefix identifies the vendor and narrows a brute force, and "the first eight characters" in a shared console is still the user's key on someone else's screen.

This is enforced in **three** places, deliberately, because one is a single point of failure:

1. **By construction** — `packages/ai-host/src/byom/**` has no import edge to persistence, sync, stores, Yjs, the command bus, or `console.*`, and no relative URL or `/api/` path.
2. **By guard** — `assertNoSecret` / `redactSecrets` at every emit boundary, including the provider's own error body (some vendors echo the offending key into a 401).
3. **By server refusal** — `server/byomKeyGuard.js` refuses any request to `/api/anthropic/*` or `/api/ai/*` carrying a vendor-key shape (§4.5).

CI gate: `byomSecretContainment.test.ts` (both arms), `byomKeyGuard.test.ts`.

### §1.4 — A rejected user credential MUST NOT fall back to PRYZM's key

When the provider returns 401/403/429, or the browser blocks the call, the request **MUST fail with the provider's own reason**, surfaced to the user. It MUST NOT be retried on PRYZM's key.

Rationale, stated because the shortcut is tempting and looks like resilience: a silent fallback spends PRYZM's money on the user's request with **neither party told**, and it breaks §0.3 on precisely the request where the user is most likely to be watching. `createResilientRelay` (`CfWorkerRelay.ts`) exists and does exactly this wrapping — it MUST NOT be wrapped around a BYOM porter.

⚠ **A distinct case, deliberately NOT covered by this rule**: a provider that is *selected* but whose stored credential does not resolve (empty, corrupt, or an unknown id from an older build). Nothing of the user's was sent anywhere and no credential was rejected, so continuing on PRYZM's key is safe — and it is **disclosed**, per §7.2. The two are different `AiRouteReason` values, never one.

CI gate: `byomRelayNoFallback.test.ts §NO-FALLBACK`, `byomPlannerRouting.spec.ts §NO-FALLBACK`.

### §1.5 — PRYZM quota MUST NOT be charged for a BYOM request

Metering someone else's spend against your quota is wrong. When `keyClass === 'user-supplied'`, [C09 §2.3](./C09-AI-AND-VISIBILITY-INTENT.md) `enforceAIQuota` does not apply — and does not need to be bypassed, because the request never reaches the route that calls it.

### §1.6 — PRYZM MUST NOT bill itself for a BYOM request

`RelayResponse.costUsd` is **0** on the BYOM path. This is not "unknown rendered as zero": PRYZM's ledger genuinely records zero, because PRYZM paid zero. See §5.2 for what is NOT known.

### §1.7 — Every AI response MUST be attributable to a key class

The product MUST always know which path served a request and MUST be able to say so. A response whose origin is ambiguous is unauditable. One pure function (`resolveAiRoute`) produces one closed union, and relay construction, chat attribution, provenance and privacy tier all read the **same value** — never re-derive it, because two derivations of one fact is how they come to disagree.

### §1.8 — The UI MUST state the promise AND the risk, in plain words

The panel states §0.3 verbatim in user language, and beside it states that browser storage is readable by any script on the origin and by anyone using the computer. **A promise the user cannot evaluate is worse than no promise.**

⛔ The copy MUST NOT be shipped ahead of the behaviour. If the implementation ever stops keeping §0.3, the copy changes first.

### §1.9 — Per-provider capability MUST be stated per provider, never as one blanket claim

Browser-direct support differs by provider and the evidence differs in KIND. [C66 §1](./C66-CONCURRENCY-AND-SCALE.md) forbids describing a tier as supported while it is merely CLAIMED; §3.2 is the applied form.

### §1.10 — Sign-out MUST erase stored credentials

And it MUST do so through the **existing** purge, not a second one. Keys are stored under the `pryzm-` prefix, which `purgeUserScopedClientState()` (`AuthModal.ts`) already removes on sign-out and on account switch. Inheriting a tested invariant beats minting a rival that can drift.

CI gate: `byomVaultAndRoute.test.ts §PURGE-PREFIX` pins the prefix; `aiProviderKeysPanel.spec.ts` pins that a real save lands under it.

---

## §2 — The provider registry

### §2.1 — Provider ids are stable

`anthropic` · `openai` · `google` · `deepseek` · `openrouter` · `ollama`. These are persisted in the device vault; renaming one is a **breaking change to a stored value**, not a cosmetic edit.

### §2.2 — A provider descriptor is non-secret

`ByomProvider` (label, blurb, console URL, endpoint, dialect, verdict) is safe to log and render. `ByomCredential` is not. They are **different types** so that "print the descriptor" can never accidentally print the secret.

### §2.3 — Three wire dialects, not six adapters

`anthropic` · `openai` (also DeepSeek, OpenRouter, Ollama) · `google`. Each is four pure functions: build URL, build headers, build body, parse response. No fetch, no DOM, no storage, no logging in any of them.

### §2.4 — A keyless provider is not a provider with a blank key

Ollama has `auth: 'none'`. An empty key for an `api-key` provider is a **misconfiguration and is refused at save**; an empty key for Ollama is the **correct configuration**. Modelling this as a third value rather than an empty string is what keeps the refusal honest — a saved-but-empty key would produce a 401 the user reads as "my key is wrong" when in fact nothing was stored.

---

## §3 — Call topology

### §3.1 — The topology is BROWSER → PROVIDER, DIRECT

For `keyClass === 'user-supplied'`, the browser calls the provider's own endpoint. PRYZM's server is **not on the path**.

⭐ **This is the only topology under which §0.3 is true.** Proxying through PRYZM would put a third-party credential on PRYZM's wire and in PRYZM's request log. A promise of "never sent to PRYZM" implemented by sending it to PRYZM is not a weaker version of the promise — it is the opposite of it.

⛔ The BYOM call MUST use the plain global `fetch`, **never** the editor's `apiFetch`, which attaches PRYZM's session token. Sending PRYZM's session to a third-party provider is a credential leak in the opposite direction.

### §3.2 — The per-provider browser-direct verdict, MEASURED

Measured **2026-08-23** by (a) a live `OPTIONS` preflight with `Origin: https://example.com` and (b) reading the vendor's own documentation. **The two disagree for three of the six**, which is why the verdict is a four-value union carrying its EVIDENCE CLASS, not a boolean.

| Provider | Verdict | Wire (preflight) | Docs | Required headers |
|---|---|---|---|---|
| **Claude** (Anthropic) | `supported-opt-in` | ✅ **only with** the opt-in header; without it → **400, no `access-control-allow-origin` at all** | ✅ documented (release note 2024-08-22) | `x-api-key`, `anthropic-version: 2023-06-01`, **`anthropic-dangerous-direct-browser-access: true`** |
| **OpenRouter** | `supported-documented` | ✅ `ACAO: *` | ✅ ships a browser `fetch()` example | `Authorization: Bearer`; attribution `HTTP-Referer`, `X-Title` |
| **ChatGPT** (OpenAI) | `supported-undocumented` | ✅ origin reflected | ⚠ **silent on CORS; actively steers to a server-side proxy** | `Authorization: Bearer` |
| **Gemini** (Google) | `supported-undocumented` | ✅ origin reflected | ⚠ silent on CORS; warns against client-side keys | `x-goog-api-key` |
| **DeepSeek** | `supported-undocumented` | ✅ origin reflected | ⚠ **completely silent** | `Authorization: Bearer` |
| **Ollama** | `local-opt-in` | n/a — local | ✅ documents `OLLAMA_ORIGINS` | none |

**`supported-undocumented` is a real and different state.** It works today; it is not a vendor guarantee and can be withdrawn without a release note. The UI says so in those words. Treating it as `supported` would be the C66 §1 violation.

⚠ **Gemini: the key goes in the `x-goog-api-key` HEADER, never the `?key=` query parameter**, though the older reference page still shows the latter. A key in a query string lands in proxy logs, browser history and `Referer`.

### §3.3 — CSP `connect-src` MUST allow the provider origins, and MUST be gated against drift

The six origins (plus the `127.0.0.1` loopback alias) are added to `connect-src` in `server/securityHeaders.js`. They are duplicated from `byomConnectSrcOrigins()` because that file is server JS and cannot import the TS registry at module init.

⛔ **The duplication MUST be gated in both directions.** Ungated duplication is exactly what shipped the NASA/WorldPop and R2 `connect-src` entries broken — the client change landed, the allowlist entry did not, and every request failed with a CSP refusal while the upload, the bundle and the deploy all reported success. CI gate: `byomKeyGuard.test.ts §BYOM-CSP`.

`PRYZM_BYOM_DISABLED=1` withholds all of them. An enterprise deployment with a strict egress policy switches the feature off at the CSP layer, and the browser then refuses in its own words rather than PRYZM pretending.

### §3.4 — ⚠ Ollama: what actually blocks it, corrected

An earlier reading of this lane's own brief assumed **mixed content** blocks an HTTPS page from calling `http://localhost:11434`. **That is wrong, and the correction matters because it changes the remedy.**

`http://localhost` and `http://127.0.0.1` are **"potentially trustworthy" origins** under the W3C Secure Contexts algorithm, and Mixed Content delegates to that predicate — so they are **exempt from mixed-content blocking**. What actually stands in the way is different, and is three separate things:

1. **Ollama's own origin policy.** It accepts `127.0.0.1` and `0.0.0.0` origins **by default**; a page served from `https://app.pryzm.com` is **not** allowed. The user must set `OLLAMA_ORIGINS` (comma-separated, wildcards permitted) and restart the server. PRYZM cannot do this for them.
2. **Local Network Access.** Chrome 142+ gates `public → loopback` requests behind a **user permission prompt**; recent Firefox is implementing the same (exact milestones **UNVERIFIED**). Enterprise policy keys exist (`LocalNetworkAccessAllowedForUrls`).
3. **Safari.** WebKit bug 171934 — *"Don't treat loopback addresses as mixed content"* — is **still open (status NEW)**, so Safari blocks loopback from an HTTPS page with no user override. This rests on the bug remaining open rather than on a positive vendor statement: **strongly indicated, not formally confirmed.**

**Serving PRYZM from `http://localhost` sidesteps all three** — same address space, no LNA prompt, no mixed-content question, and Ollama's default origins accept it. This is stated in the UI, not buried here.

---

## §4 — Storage and threat model

### §4.1 — The credential lives in ONE place: browser storage on the user's device

`localStorage` (area `device`) or `sessionStorage` (area `session`), under the key prefix `pryzm-byom-`. There is no server row, no project field, no Yjs map, no telemetry attribute, and no export.

The vault core is **pure** and takes an injected `ByomStorage` port; the browser binding is the only DOM-aware file.

### §4.2 — The threat model, stated rather than implied

| Threat | Exposure | Mitigation, and its honest limit |
|---|---|---|
| **XSS on the PRYZM origin** | 🔴 Full — any script on the origin can read `localStorage` | Not mitigated by storage choice. **Nothing browser-side can be.** The mitigations are CSP, the P4 cast ratchet, and the fact that an attacker with script execution can already exfiltrate. **Stated to the user in §7.1 rather than engineered around.** |
| **Shared / borrowed machine** | 🟠 A later user of the same profile reads the key | The `session` area (dies with the tab) is offered and is the recommended answer. |
| **User forgets to sign out** | 🟠 As above | §1.10 purge on sign-out and on account switch. |
| **Key syncs to a collaborator via Yjs** | 🟢 **Impossible by construction** | BYOM has no store, no CRDT edge, no serialiser. §1.3 arm 1, gated. |
| **Key lands in a project save** | 🟢 **Impossible by construction** | `ProjectSerializer` walks stores; BYOM registers none. §1.3 arm 1, gated. |
| **Key lands in PRYZM's logs** | 🟢 Two walls | Never sent (§3.1); refused if it arrives anyway (§4.5). |
| **Provider echoes the key in an error** | 🟢 Redacted | `redactSecrets` runs on every provider error body before it is stored, thrown or shown. |
| **Browser extension reads storage** | 🔴 Full | Out of scope for any web application. Not claimed as mitigated. |

⚠ **`localStorage` was chosen over `sessionStorage`-only, and over an in-memory-only vault, deliberately.** In-memory would be the most secure and would require re-pasting the key on every reload, which users answer by storing the key in a text file — a strictly worse outcome. The choice is offered rather than imposed because only the user knows whose machine they are on.

**Not chosen: encrypting the key at rest in `localStorage`.** Any key the page can derive, a script on the page can also derive. It would add ceremony and the appearance of protection without the substance — which is worse than the honest statement in §7.1.

### §4.3 — A corrupt or unknown stored entry degrades to unconfigured

Never to a crash, and never to a valid-looking empty credential (which would produce a mystery 401). The UI then shows the provider as not set up, which is the truthful rendering.

### §4.4 — Redaction detectors: TWO sets, and they MUST NOT be harmonised

| | Client (`ByomRedaction.ts`) | Server (`byomKeyGuard.js`) |
|---|---|---|
| Vendor-prefix arms | ✅ | ✅ |
| Generic high-entropy arm (`[A-Za-z0-9_-]{40,}`) | ✅ | ⛔ **NO** |
| Consequence of a false positive | a value is masked | **a user's request is REJECTED** |

The client is a redactor: a false negative is a leak, a false positive is harmless, so it is deliberately broad. The server is a gate: a false positive rejects a legitimate prompt, and prompt bodies legitimately carry base64 thumbnails, long element ids and pasted CAD text. **A future author MUST NOT "harmonise" the two lists.** CI gate: `byomKeyGuard.test.ts` pins the false-positive behaviour as hard as the true-positive behaviour.

### §4.5 — The server MUST refuse a request carrying a provider key

`/api/anthropic/*` and `/api/ai/*` refuse with **400** (a client mistake — not 401/403, which would read as "your session is wrong" and send the user to re-authenticate for an unrelated problem) and `code: 'BYOM_KEY_REJECTED'`.

The refusal names the mistake, the remedy, and tells the user to **rotate the key**, and it quotes nothing. The log records the route and the pattern NAME, never the value.

This exists for two cases construction cannot cover: a user pasting their key into the chat box (realistic — the panel asks for one and the chat is beside it), and a future edit re-routing BYOM through the BFF "just for CORS", which would then fail loudly in development instead of quietly in production.

---

## §5 — Payer, quota and spend

### §5.1 — The five axes BYOM inverts

| Axis | `pryzm-managed` | `user-supplied` |
|---|---|---|
| Who pays | PRYZM | the user |
| Quota (C09 §2.3) | enforced | **not applicable** (§1.5) |
| Spend (`ai-spend`) | recorded | **not billed to PRYZM** (§1.6) |
| Provenance (C23) | model + PRYZM key class | model + **user key class + provider id** (§6) |
| Privacy (C22) | prompt reaches PRYZM's relay | prompt goes **direct to a third party the user chose** (§8) |

### §5.2 — What PRYZM does NOT know about a BYOM call, stated rather than guessed

PRYZM records `costUsd: 0` — its own true cost. It does **NOT** know the user's cost, and MUST NOT invent one: it does not know their negotiated rate, their tier discount, or the provider's current pricing, and for Ollama the cost is electricity.

**Token counts ARE recorded**, so a future per-provider price table has its inputs. Until such a table exists with a cited source per provider, **PRYZM MUST NOT display a currency figure for a BYOM call.** An estimate presented as a cost is the C74 defect this repo has paid for repeatedly.

### §5.3 — PRYZM's availability probe MUST NOT gate a BYOM request

`/api/health` `features.anthropic` reports whether **PRYZM's** upstream is configured. On the BYOM path a user's own key **is** the configuration, and consulting the probe would refuse a key the user had just pasted, for a reason that has nothing to do with them.

### §5.4 — Rate limits

`aiLimiter` (C08 §4) applies to PRYZM's routes. A BYOM request does not touch them, so PRYZM does not rate-limit it — **the provider's own limits apply, and their 429 is surfaced verbatim** (§1.4).

---

## §6 — Provenance (extends C23)

### §6.1 — Two fields added to the C23 §1.2 audit tuple

| Field | Values |
|---|---|
| `keyClass` | `'pryzm-managed'` \| `'user-supplied'` |
| `keyProviderId` | `'pryzm'` \| a §2.1 provider id |

⛔ **NEVER the key, and never a prefix of it.** `routeProvenanceFields()` returns only these plus the route reason and the two boolean flags; `byomVaultAndRoute.test.ts §C23-PROVENANCE` asserts the serialised result cannot contain a credential.

### §6.2 — `reproducibility` is unchanged

A BYOM relay call is `'non-deterministic'`, exactly as a PRYZM relay call is (C23 §1.4). BYOM changes the payer, not the determinism.

### §6.3 — ⚠ Known gap, declared

C23 §1.1 requires every model call to write an `AIArtefact` before returning. **C23 §8.1 already records that the `ProvenanceStore` is not yet built**, so BYOM inherits that gap rather than creating it. What C105 adds is that **the two fields above are DEFINED and COMPUTED today** (`routeProvenanceFields`), so when the store lands the BYOM arm has nothing to retrofit. This is stated as a gap, not implied as coverage.

---

## §7 — User-facing surface

### §7.1 — The keys panel

Reached from the **gear in the AI chat header** — beside the thing it changes, not buried in a settings screen, because what it changes is who answers this chat. Lazy-imported.

MUST render, per provider: label, blurb, the §3.2 verdict **in that provider's own words**, an obscured key field with a **Show** toggle, an optional model override, a link to that provider's console, and Save / Use this / Remove. Ollama takes an **address**, not a key.

MUST render, once: the §0.3 promise verbatim in user language; the §4.2 risk statement; the storage-area choice; and the current route.

MUST show a saved credential as **visible text**, masked as tail + length (`••••ry99 (108 chars)`) — the form the vendors' own consoles use — and **never the vendor prefix**. ⚠ A placeholder is not sufficient: it vanishes the instant the user types, and "is a key already saved, and is it the one I pasted?" is the question the panel exists to answer.

Brand: PRYZM purple `#6600FF` on white. No black.

### §7.2 — The chat MUST say which path answered

Every planner-sourced reply carries an attribution naming the key class:

- `user-supplied` → *"(answered with your own Claude key — this did not use PRYZM's AI quota)"*
- `pryzm-managed` → *"(answered with PRYZM's built-in AI)"*
- `user-provider-unresolvable` → *"(answered with PRYZM's built-in AI — the provider you selected has no usable key stored, so nothing was sent to it)"*

The third line is the one that earns its place: without it, a route whose key has vanished answers **indistinguishably** from the route the user expected.

### §7.3 — A key format hint WARNS, it does not reject

`sk-ant-` etc. are hints. A vendor may change a prefix at any time, and a client-side format assertion that is wrong is worse than no assertion. The user may always save anyway.

---

## §8 — Privacy tier (extends C22)

### §8.1 — The two paths are DIFFERENT tiers and MUST carry different statements

A model prompt may carry PROJECT-tier data (element names, room programmes, addresses, client references). Where that data goes differs by path, so one generic sentence would be false on one of them:

| Path | Statement |
|---|---|
| `pryzm-managed` | *"This request goes to PRYZM, which relays it to Anthropic. It is covered by your PRYZM plan and its quota."* |
| `user-supplied` (hosted) | *"This request goes straight from this browser to \<Provider\>, using your own API key. It does not pass through PRYZM, is not covered by your PRYZM quota, and is billed by \<Provider\>, not PRYZM."* |
| `user-supplied` (Ollama) | *"…to Ollama, which runs on this machine — the prompt does not leave your computer."* |

`resolveAiRoute().privacyStatement` is the single source; `byomVaultAndRoute.test.ts` asserts the two differ.

### §8.2 — ⚠ The DPA consequence, declared not solved

Under `user-supplied`, PRYZM is **not** the processor for that prompt — the user has chosen their own processor and holds that relationship directly. PRYZM's own DPA therefore does not cover it.

**This contract does NOT establish that PRYZM's published privacy notice says so.** That is a legal-copy task with a named owner and it is **OPEN** (§10). Do not cite C105 as evidence of a completed DPA position.

### §8.3 — Ollama is the strongest privacy answer PRYZM offers

`auth: 'none'`, the prompt never leaves the machine. It is also the hardest to reach (§3.4). Both are true and both are stated.

---

## §9 — Tests / CI gates

| Gate | File | Asserts |
|---|---|---|
| §DEFAULT-UNCHANGED (pure) | `packages/ai-host/__tests__/byomVaultAndRoute.test.ts` | no key / saved-but-unselected / unreadable storage ⇒ `pryzm-managed`, quota ON, spend ON |
| §DEFAULT-UNCHANGED (wire) | `apps/editor/src/ui/ai/__tests__/byomPlannerRouting.spec.ts` | the URL actually fetched is PRYZM's proxy, and no provider origin is contacted |
| §NO-FALLBACK | `byomRelayNoFallback.test.ts`, `byomPlannerRouting.spec.ts` | a 401 makes **exactly one** outbound call, to the provider; PRYZM's proxy is never called; the provider's reason is spoken |
| §NO-KEY-IN-SNAPSHOT | `byomSecretContainment.test.ts` | **arm A** the absent import edge, read with `readdirSync` (no search tool in the loop); **arm B** every value another subsystem could obtain, serialised, with the canary absent while `resolve()` still returns it |
| §PURGE-PREFIX | `byomVaultAndRoute.test.ts`, `aiProviderKeysPanel.spec.ts` | keys are stored under `pryzm-`, so the existing sign-out purge reaches them |
| §PROMISE-IS-TRUE | `aiProviderKeysPanel.spec.ts` | the copy is present AND, after a real save, the key is in browser storage and **nowhere** in the DOM |
| §BYOM-GUARD | `server/__tests__/byomKeyGuard.test.ts` | five vendor shapes refused; **seven real prompts and an 880-char base64 payload pass** |
| §BYOM-CSP | `server/__tests__/byomKeyGuard.test.ts` | `connect-src` ⟷ registry parity in both directions; `PRYZM_BYOM_DISABLED=1` withholds all |

**Measured at mint, 2026-08-23:** 49 (ai-host) + 7 (wiring) + 14 (UI) + 23 (server) = **93 BYOM assertions, all passing**; plus `LlmPlannerBridge.spec.ts` **10/10 unchanged** and the whole server suite **646/646**.

---

## §10 — Open questions

1. **§8.2 — the privacy-notice copy.** Owner: founder + legal. Until closed, do not claim a DPA position.
2. **§6.3 — the `ProvenanceStore`.** BYOM's two fields are computed but nothing durable consumes them; inherited from C23 §8.1.
3. **A per-provider price table** (§5.2). Needs a cited source per provider or it must not exist.
4. **Team-shared keys.** Deliberately out of scope: a key shared through PRYZM is a key PRYZM holds, which contradicts §0.3. If ever wanted, it is a different contract, not a clause here.
5. **§3.4 Firefox milestones** are UNVERIFIED, and the Safari verdict rests on an open WebKit bug rather than a vendor statement. Re-measure before quoting.
6. **Non-chat AI surfaces.** BYOM currently routes the **chat planner rung only**. `AIElementFactory`, `FloorPlanAIFactory`, `AnnotateViewCommand` and `StrategizeBucket` still call PRYZM's proxy unconditionally. This is a deliberate first scope, **not** an oversight — but the UI says "your chat", not "PRYZM's AI", precisely so the claim matches the wiring.
