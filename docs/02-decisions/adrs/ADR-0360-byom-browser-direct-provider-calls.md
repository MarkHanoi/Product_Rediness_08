# ADR-0360 — BYOM calls the provider from the browser, directly

> **Date**: 2026-08-23 · **Status**: ACCEPTED · **Lane**: BYOK44
> **Contract**: [C105](../contracts/C105-AI-PROVIDER-CREDENTIALS-BYOM.md) · **Spec**: [SPEC-BYOM-PROVIDER-KEYS](../../03-execution/specs/SPEC-BYOM-PROVIDER-KEYS.md)
> **Amends**: [C08 §5](../contracts/C08-COLLABORATION-AND-SECURITY.md) · [C09 §2.2, §2.3](../contracts/C09-AI-AND-VISIBILITY-INTENT.md)

---

## Context

The founder asked for per-user AI provider keys — Claude, ChatGPT, Gemini, DeepSeek, OpenRouter, Ollama — while keeping PRYZM's own default RAC algorithm unchanged. The reference surface carries a promise:

> *"In-app API provider keys entered below are stored only on this device and leave it only to call the provider you choose."*

Measured before designing anything (`server.js:998`, `packages/ai-host/src/CfWorkerRelay.ts`): today the browser calls **PRYZM's** BFF, which relays to a Cloudflare Worker or falls back to `ANTHROPIC_API_KEY`. **PRYZM pays, PRYZM meters, PRYZM enforces quota.** BYOM inverts all three at once, so "where does the text box go" was never the question.

---

## Decision

**A BYOM request goes from the browser to the provider's own endpoint, directly. PRYZM's server is not on the path.**

---

## Why not proxy it through PRYZM?

Proxying is the reflex — it keeps `connect-src` narrow, it satisfies C08 §5 as written, and it is how every other third-party integration in this repo is wired.

⛔ **It also destroys the feature.** Under a proxy the user's credential is transmitted to PRYZM, arrives in PRYZM's request handler, and passes through PRYZM's logging path. The promise "never sent to PRYZM" would then be implemented by sending it to PRYZM. **That is not a weaker version of the promise; it is its negation**, and the honest thing would have been to refuse the feature rather than ship the sentence.

So the choice was: browser-direct, or tell the founder the promise cannot be kept. Browser-direct is achievable, so the rule that forbade it is amended in place, with the reasoning recorded, rather than circumvented in the CSP builder where nobody would find it.

### The refuted alternatives

| Option | Rejected because |
|---|---|
| Proxy through the BFF | Negates the promise (above). |
| Proxy but "don't log it" | A promise enforced by remembering not to log is not enforced. The key would still be in memory on a server the user does not control, and in every future error path. |
| Store the key server-side, encrypted | Strictly worse: PRYZM then holds a third-party credential, acquires a breach-notification surface for it (C22 §1.9), and gains nothing the user asked for. |
| Ship without Ollama | Ollama is the **strongest** privacy answer on the list — the prompt never leaves the machine. Dropping the hardest one because it is hardest would have removed the best one. |

---

## Consequences

### Accepted

1. **`connect-src` gains six origins** (`api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, `api.deepseek.com`, `openrouter.ai`, `localhost:11434` + the `127.0.0.1` alias). The policy already allowed ~25 external origins, so an attacker with script execution here already has exfiltration paths — these add a **destination, not a capability**. `PRYZM_BYOM_DISABLED=1` restores the previous posture for a strict-egress deployment.
2. **PRYZM cannot meter, cap, or observe a BYOM call.** It cannot see the tokens except as the browser reports them, and it deliberately does **not** guess the user's cost (C105 §5.2) — no negotiated rate, no tier discount, and for Ollama the cost is electricity.
3. **Per-provider behaviour is not uniform**, so it is reported per provider (below), never as one blanket claim.
4. **Support surface changes shape.** "The AI is broken" can now mean the user's key, their provider's outage, their browser's CORS, or their local-network permission. The failure copy names which, in the provider's own words.

### Explicitly NOT accepted

- **No silent fallback to PRYZM's key.** A rejected user key fails with the provider's reason. Falling back would spend PRYZM's money on the user's request with **neither party told**, and would break the promise on precisely the request the user is watching.
- **No key on PRYZM's wire, inbound either.** `server/byomKeyGuard.js` refuses a vendor-key shape at `/api/anthropic/*` and `/api/ai/*` — so the browser's reach widens outward without widening what the server accepts.

---

## Measured, 2026-08-23 — and three of six disagree with their own docs

A live `OPTIONS` preflight (`Origin: https://example.com`) and the vendor documentation were gathered as **separate evidence**, because "the wire serves CORS today" and "the vendor promises to keep serving it" are different facts. Hence a four-value verdict union, not a boolean.

| Provider | Verdict | Wire | Docs |
|---|---|---|---|
| Claude | `supported-opt-in` | ✅ **only with** `anthropic-dangerous-direct-browser-access: true`; without it **400 and no `access-control-allow-origin` at all** | ✅ documented |
| OpenRouter | `supported-documented` | ✅ `ACAO: *` | ✅ ships a browser example |
| ChatGPT | `supported-undocumented` | ✅ | ⚠ silent; steers to a server proxy |
| Gemini | `supported-undocumented` | ✅ | ⚠ silent; warns against client keys |
| DeepSeek | `supported-undocumented` | ✅ | ⚠ completely silent |
| Ollama | `local-opt-in` | n/a | ✅ documents `OLLAMA_ORIGINS` |

`supported-undocumented` is surfaced to the user in those words. Calling it "supported" would be the [C66 §1](../contracts/C66-CONCURRENCY-AND-SCALE.md) violation.

---

## ⚠ A hypothesis this lane started from, REFUTED

The lane brief and my own initial reading both assumed **mixed content** blocks an HTTPS page from calling `http://localhost:11434`, and I had planned to report Ollama as unreachable on that basis.

**That is wrong.** `http://localhost` and `http://127.0.0.1` are **"potentially trustworthy"** under the W3C Secure Contexts algorithm, and Mixed Content delegates entirely to that predicate — so loopback is **exempt from mixed-content blocking**, and has been in Firefox since v84.

The real obstacles are three different things with three different remedies:

1. **Ollama's own policy** — it accepts `127.0.0.1` / `0.0.0.0` origins by default; a page served from `https://app.pryzm.com` is **not** allowed until the user sets `OLLAMA_ORIGINS` and restarts. PRYZM cannot do this for them.
2. **Local Network Access** — Chrome 142+ gates `public → loopback` behind a **user permission prompt** (not a block). Firefox is following; exact milestones **UNVERIFIED**.
3. **Safari** — WebKit bug 171934 is **still open (NEW)**, so Safari does block loopback from HTTPS. ⚠ This rests on the bug remaining open, not on a positive vendor statement: **strongly indicated, not formally confirmed.**

**Serving PRYZM from `http://localhost` sidesteps all three.** Recorded because the wrong diagnosis would have produced the wrong advice — "we can't support Ollama" instead of "here are the three switches, and one of them removes the other two".

---

## Related

- [C105](../contracts/C105-AI-PROVIDER-CREDENTIALS-BYOM.md) — the contract
- [SPEC-BYOM-PROVIDER-KEYS](../../03-execution/specs/SPEC-BYOM-PROVIDER-KEYS.md) — the implementation spec
- [C08 §5.1](../contracts/C08-COLLABORATION-AND-SECURITY.md) — the CSP amendment
- [C09 §2.2.1](../contracts/C09-AI-AND-VISIBILITY-INTENT.md) — the second upstream
- [C22 §1.13](../contracts/C22-PRIVACY-AND-PII-TIER.md) — the two privacy tiers
- [C23 §1.2.1](../contracts/C23-PROVENANCE-AND-AI-AUDIT.md) — key class in the audit tuple
- ISSUE-LOG L-8000..L-8080
