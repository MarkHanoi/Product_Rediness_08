# SPEC-BYOM-PROVIDER-KEYS — user-supplied AI provider credentials

> **Stamp**: 2026-08-23 · **Status**: IMPLEMENTED (chat planner rung; see §9 for what is NOT wired)
> **Governed by**: [C105](../../02-decisions/contracts/C105-AI-PROVIDER-CREDENTIALS-BYOM.md) (normative) · [C09 §2.2.1](../../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md) · [C22 §1.13](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) · [C23 §1.2.1](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) · [C08 §5.1](../../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md)
> **Decision record**: [ADR-0360](../../02-decisions/adrs/ADR-0360-byom-browser-direct-provider-calls.md)

⚠ **"BYOM", not "BYOK".** [C22 §1.4](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) already uses BYOK for customer-managed **encryption** keys. See C105 §0.1.

---

## §1 — The ask, and what it actually changes

> *"We have a default algorithm for the RAC and I want to keep it that way — but I would like to add this option for each user to add their own API key of whatever AI they use."*

The reference surface lists **Claude · ChatGPT · Gemini · DeepSeek · OpenRouter · Ollama (fully local)** with the promise: *"In-app API provider keys entered below are stored only on this device and leave it only to call the provider you choose."*

**That promise is the feature.** It is not packaging around a text box; it is the thing that has to be engineered, and it is what forces every other decision in this spec.

| Axis | Today (PRYZM key) | BYOM (user key) |
|---|---|---|
| who pays | PRYZM | the user |
| quota (C09 §2.3) | enforced | not applicable |
| spend (`ai-spend`) | recorded | PRYZM records 0; user's cost NOT guessed |
| provenance (C23) | model | model **+ which key class + which provider** |
| privacy (C22) | prompt reaches PRYZM's relay | prompt goes direct to a third party the user chose |

---

## §2 — File map

| Path | Layer | Role |
|---|---|---|
| `packages/ai-host/src/byom/ByomProviders.ts` | L2, pure | The six providers as data + four pure wire functions each |
| `packages/ai-host/src/byom/ByomVault.ts` | L2, pure | Device vault over an injected `ByomStorage` port |
| `packages/ai-host/src/byom/ByomRelay.ts` | L2, pure | `RelayPorter` calling the provider direct; **never falls back** |
| `packages/ai-host/src/byom/ByomRoute.ts` | L2, pure | The single route decision (`resolveAiRoute`) |
| `packages/ai-host/src/byom/ByomRedaction.ts` | L2, pure | The secret guard, as a callable function |
| `apps/editor/src/ui/ai/byom/byomDeviceStorage.ts` | L7 | The **only** place a key is written to disk |
| `apps/editor/src/ui/ai/byom/AiProviderKeysPanel.ts` | L7 | The panel |
| `apps/editor/src/ui/ai/LlmPlannerBridge.ts` | L7 | The **one** relay-construction site; the route branches here |
| `server/byomKeyGuard.js` | server | Refuses a provider key that arrives anyway |
| `server/securityHeaders.js` | server | `connect-src` for the provider origins |

⭐ **No new workspace package.** A sibling lane held `pnpm-lock.yaml` and `apps/editor/package.json` for the session; minting a package would have forced a lockfile edit into a shared file. `packages/ai-host` already owns `RelayPorter` and the AI domain, so `src/byom/` is the correct home regardless — the constraint and the right answer happened to agree.

---

## §3 — Provider adapters

Three wire dialects, six providers:

| Dialect | Providers | Auth header | Body |
|---|---|---|---|
| `anthropic` | Claude | `x-api-key` + `anthropic-version` + `anthropic-dangerous-direct-browser-access: true` | `{model, max_tokens, system, messages}` |
| `openai` | ChatGPT, DeepSeek, OpenRouter, Ollama | `Authorization: Bearer` (**omitted entirely** for Ollama) | `{model, max_tokens, messages[]}` |
| `google` | Gemini | `x-goog-api-key` | `{systemInstruction, contents[], generationConfig}` |

**Measured browser-direct verdicts, 2026-08-23** — live `OPTIONS` preflight (`Origin: https://example.com`) **and** vendor docs, kept as separate evidence:

| Provider | Verdict | Preflight | Docs |
|---|---|---|---|
| Claude | `supported-opt-in` | ✅ **only with the opt-in header**; without it **400, no `ACAO` header at all** | ✅ documented |
| OpenRouter | `supported-documented` | ✅ `ACAO: *` | ✅ browser `fetch()` example |
| ChatGPT | `supported-undocumented` | ✅ origin reflected | ⚠ silent; steers to a server proxy |
| Gemini | `supported-undocumented` | ✅ origin reflected | ⚠ silent; warns against client keys |
| DeepSeek | `supported-undocumented` | ✅ origin reflected | ⚠ completely silent |
| Ollama | `local-opt-in` | n/a | ✅ documents `OLLAMA_ORIGINS` |

**Anthropic's opt-in header, verbatim from their own SDK:**

```ts
...(this._options.dangerouslyAllowBrowser ?
  { 'anthropic-dangerous-direct-browser-access': 'true' }
: undefined),
```

⚠ **Gemini: header, not query string.** Current docs use `x-goog-api-key`; the older reference page still shows `?key=`. A key in a query string lands in proxy logs, browser history and `Referer`.

---

## §4 — Storage

**Where:** `localStorage` (area `device`) or `sessionStorage` (area `session`), key prefix `pryzm-byom-`. Nothing else, anywhere.

**Why that prefix:** `purgeUserScopedClientState()` in `AuthModal.ts` already removes every `pryzm-`-prefixed localStorage entry and clears sessionStorage wholesale, on sign-out **and** on account switch. BYOM inherits a tested invariant instead of minting a rival that can drift.

**Why the user chooses the area:** `session` dies with the tab and is right on a shared machine; `device` survives a restart and is right on a personal one. Only the user knows which they are on.

**Rejected: encrypting the key at rest.** Any key the page can derive, a script on the page can also derive. It buys the appearance of protection without the substance — worse than the honest statement the panel makes.

**Rejected: in-memory only.** Most secure, and it makes users paste the key on every reload, which they answer by keeping it in a text file. Strictly worse in practice.

Full threat model, including what is **not** mitigated: C105 §4.2.

---

## §5 — Routing

```
resolveAiRoute(vaults) -> {
  keyClass:  'pryzm-managed' | 'user-supplied'
  reason:    'no-provider-selected' | 'user-provider-active'
           | 'user-provider-unresolvable' | 'vault-unavailable'
  quotaApplies, billsToPryzm, privacyStatement, providerId, providerLabel
}
```

⭐ **One function, one closed union, four consumers** (relay construction · chat attribution · provenance · privacy tier). None re-derives it — two derivations of one fact is how they come to disagree.

**`user-provider-unresolvable` is a distinct arm on purpose.** A provider is selected but its stored credential does not resolve (empty, corrupt, or an id from an older build). PRYZM answers — nothing of the user's was sent anywhere and nothing was rejected — **and says so**, so a vanished key does not answer indistinguishably from the route the user expected.

⚠ An early draft of `ByomVaultSet` collapsed *"chose nothing"* and *"chose Claude but the key is gone"* into one `null`. `byomVaultAndRoute.test.ts §ROUTE` caught it; the fix split `selectedProviderId()` from `activeProviderId()`.

---

## §6 — Failure handling

| Failure | Status | What the user is told |
|---|---|---|
| Bad / revoked key | 401, 403 | *"Claude rejected your API key (401): invalid x-api-key. PRYZM did NOT fall back to its own key…"* |
| Rate-limited | 429 | *"…rate-limited your key (429)… Wait and retry, or clear the key…"* |
| CORS / local-network / offline | 0, `blockedByBrowser` | *"Your browser blocked the call… before it left this device. Your key was not sent anywhere else…"* |
| 200 with no completion | 200 | Treated as a **failure**. Returning `''` would read as the model declining to speak. |

⛔ **No fallback, ever.** `createResilientRelay` exists in `CfWorkerRelay.ts` and does exactly this wrapping — it MUST NOT be wrapped around a BYOM porter.

⚠ **`planUtterance` swallows a throwing `complete()` into an honest `unavailable`** — right for a PRYZM relay failure, wrong here, because the user would be told nothing while PRYZM quietly answered on its own key. The bridge captures the `ByomProviderError` on the way past and re-speaks it.

**Everything that leaves the relay is redacted first**, including the provider's own error body — some vendors echo the offending key into a 401.

---

## §7 — UI

Gear in the **AI chat header** (beside what it changes, not in a settings screen). Lazy-imported. PRYZM purple `#6600FF` on white, no black.

Per card: label · blurb · the provider's own measured verdict · obscured key field + **Show** · model override · console link · Save / Use this / Remove. Ollama: address field, no key field.

Once, at the top: the promise verbatim · the risk beside it · storage-area choice · **the current route**.

A saved key renders as **visible text**, masked tail + length (`••••ry99 (108 chars)`), never the vendor prefix. ⚠ A placeholder is insufficient — it vanishes the instant the user types, and *"is a key saved, and is it the one I pasted?"* is the question the panel exists to answer.

**Chat attribution** (C105 §7.2) names the key class on every planner-sourced reply.

---

## §8 — Server

**CSP** — six provider origins plus the loopback alias added to `connect-src`, derived from `byomConnectSrcOrigins()`, **gated in both directions** by `byomKeyGuard.test.ts §BYOM-CSP`. Ungated duplication is exactly what shipped the NASA/WorldPop and R2 entries broken. `PRYZM_BYOM_DISABLED=1` withholds all.

**Key guard** — `/api/anthropic/*` and `/api/ai/*` refuse a vendor-key shape with **400** + `BYOM_KEY_REJECTED`, and tell the user to rotate. Two cases construction cannot cover: a user pasting their key into the chat box, and a future edit re-routing BYOM through the BFF "just for CORS".

⚠ **The server detectors are NARROWER than the client's, deliberately** — no generic high-entropy arm, because here a false positive **rejects a real prompt** and prompt bodies carry base64 thumbnails and long element ids. C105 §4.4 forbids harmonising the two lists.

---

## §9 — What is NOT wired, stated plainly

**BYOM routes the chat planner rung only.** These still call PRYZM's proxy unconditionally:

- `packages/ai-host/src/AIElementFactory.ts:436`
- `packages/ai-host/src/FloorPlanAIFactory.ts:107`
- `packages/command-registry/src/annotations/AnnotateViewCommand.ts:241`
- `apps/editor/src/ui/data/buckets/StrategizeBucket.ts:614`

A deliberate first scope, not an oversight — and **the UI copy is worded to match** ("This applies to the AI chat; PRYZM's other AI features keep using PRYZM's own AI for now"). Extending it is mechanical: each site constructs its own relay and needs the same `resolveAiRoute` branch.

Also open, from C105 §10: the published privacy notice (§8.2), the `ProvenanceStore` (inherited from C23 §8.1), a per-provider price table, and team-shared keys (rejected by design — a key shared through PRYZM is a key PRYZM holds).

---

## §10 — Verification, as run

| Suite | Command | Result |
|---|---|---|
| Pure core | `cd packages/ai-host && npx vitest run __tests__/byom*.test.ts` | **49/49** |
| Wiring | `npx vitest run apps/editor/src/ui/ai/__tests__/byomPlannerRouting.spec.ts` | **7/7** |
| UI | `npx vitest run apps/editor/src/ui/ai/__tests__/aiProviderKeysPanel.spec.ts` | **14/14** |
| Server | `npx vitest run --config vitest.server.config.ts server/__tests__/byomKeyGuard.test.ts` | **23/23** |
| Regression (chat ladder) | `npx vitest run apps/editor/src/ui/ai/__tests__/LlmPlannerBridge.spec.ts` | **10/10, unchanged** |
| Regression (server) | `npx vitest run --config vitest.server.config.ts` | **646/646** |
| Contract index | `npx tsx tools/ga-gate/check-contract-index-equivalence.ts` | **RC=0** |
