# C08 — Collaboration & Security

> **Stamp**: 2026-05-03 · **Status**: CANONICAL — **Wave A19 amendment applied**  
> **Scope**: CRDT real-time sync, explicit conflict resolution, JWT authentication, permission model, rate limiting, CORS, and ISO 19650 project roles.  
> **Key principles**: P8 (sync conflicts explicit).  
> **References**: [ADR-0202] CRDT bridge, [SPEC-03] sync, [ADR-0219] soft-locks, [ADR-0237/038] sovereignty/BYOK, [SPEC-34/35] enterprise security.


---

## §0.0 — ⛔ CORRECTION 2026-08-18: THE RATE-LIMIT NUMBERS ARE WRONG, AND ONE "FIX" WOULD RE-INTRODUCE THE BUG IT NAMES

**`globalLimiter` is 2000 per 15 min, not 200.** Measured in `server/rateLimiter.js:48-55`:

```
grep -n -A 8 "export const globalLimiter" server/rateLimiter.js
#  max: 2000,
```

⭐ **The file's OWN contract header still says 200** (`server/rateLimiter.js:7`:
*"globalLimiter: 200 requests per 15 minutes per IP"*), and the code comment at `:50-54` explains
exactly why it was raised: *"200/15min (~13/min) was tuned for a low-traffic public API, but the
EDITOR is an interactive SPA … legit users got HTTP 429 on create/delete (2026-06-03)."* **A header
comment and its own module disagreeing by 10×, in one file, is where this contract's number came
from.** Read the `max:` literal, never the header.

⛔ **DO NOT SET `trust proxy` TO `1`.** Any clause below prescribing it is **withdrawn**. The
shipped value is a **tunable hop count**, `server.js:322-327`:

```
const TRUST_PROXY_HOPS = process.env.TRUST_PROXY_HOPS ? parseInt(process.env.TRUST_PROXY_HOPS, 10) : <default>;
app.set('trust proxy', TRUST_PROXY_HOPS);
```

The code's own comment at `:315-320` (`§ADR-055-PHASE-A-PREFLIP`) states the hazard in one line —
a wrong hop count *"trusts everyone OR protects no one"*. **Setting it to 1 under the real proxy
chain collapses every client to the same forwarded IP**, which is the precise failure the rate
limiter exists to prevent: one abuser then rate-limits all users, or every user shares one bucket.
**Change this value only with the deployed hop count measured, never from a contract literal.**

⚠ **UNVERIFIED in this pass:** the *remote-factory gap* figure (reported as 164, and as having
grown 14 in eleven days) was **not re-derived** here — the deriving command was not recorded with
the claim, so it cannot be re-run. **Treat it as unmeasured, not as confirmed.** Whoever restates it
must paste the command alongside.

---

## §1 — Authentication

### §1.1 — Auth model

PRYZM uses **custom JWT/bcrypt authentication** issued by the server. It does NOT use Supabase Auth's JWT-issuance or session service, Firebase Auth, NextAuth, or any external token-issuance provider.

- Tokens are issued by `server/authStore.js` using `SESSION_SECRET` (HMAC-SHA256).
- Token payload: `{ sub: userId, email, iat, exp }`.
- Token lifetime: 7 days (configurable via `SESSION_SECRET_TTL`).
- Tokens are sent as `Authorization: Bearer <token>` on every API request.

**Mixed-backend deployment note ([ADR-0245]):** In the standard Replit deployment, user-identity records (`pryzm_users` rows, owner seeding) are stored in and read from **Supabase via the service-role REST API** (`server/supabaseClient.js`). Project data (projects, versions, members) is stored in **Replit PG** (`server/pgClient.js`). PRYZM does NOT use Supabase Auth's JWT issuance — it issues its own tokens regardless of which backend is active. Consequences:
- `projects.owner_id` MUST NOT have a FK constraint referencing `pryzm_users(id)` in Replit PG (Replit PG's `pryzm_users` is empty in this deployment — see C05 §1.3.1).
- All server-side user lookups MUST go through `getSupabaseClient()`, never through `pgClient.query()` against `pryzm_users`.
- See [ADR-0245] for the full split and future migration path.

### §1.2 — Auth middleware contract

`authMiddleware` in `server.js` is applied to all `/api/*` routes. It MUST:
- Accept and verify a Bearer token.
- Populate `req.auth = { userId, email }` on success.
- Set `req.auth = { userId: 'anonymous' }` when no valid token is present (never reject anonymously — the route handler decides whether anonymous access is permitted).

### §1.3 — OAuth (Google, Microsoft)

Google and Microsoft OAuth flows MUST use the `oauthService.js` PKCE flow. OAuth users are upserted into `pryzm_users` via `upsertOAuthUser`. The OAuth flow MUST NOT bypass the `SESSION_SECRET` JWT — it ultimately issues the same custom JWT.

---

## §2 — Permission Model

### §2.1 — ISO 19650 project roles

| Role | Capabilities |
|---|---|
| `owner` | All operations including delete, transfer, invite |
| `editor` | Create / edit / delete elements, manage versions |
| `reviewer` | Read + add BCF comments; cannot edit elements |
| `viewer` | Read-only; no writes |

Roles are stored in `project_members` (Supabase) or `project_members` (pg fallback). Every server route that mutates project data MUST call `hasPermission(callerRole, operation, isOwner)` before executing.

### §2.2 — Server-side ownership check

`canUserAccessProject(userId, projectId, { supabase, pgPool, projectsMap })` MUST be called on every Socket.io `join-project` event and every HTTP route that reads project data. Anonymous users MUST always be denied.

---

## §3 — Real-Time Collaboration (CRDT)

### §3.1 — Sync model (Differentiator D3)

> **Wave A19 amendment (2026-05-03) — Phase 2D COMPLETE**: `YjsDocAdapter`, `CRDTConflictResolver`, and `YjsProjectCache` are implemented and wired. Server-side `Y.applyUpdate` merge replaces the previous LWW path. The LWW-disclosure caveat from Wave A14 is **removed** — the system now uses real CRDT convergence. `SyncSlot.status: SyncStatus` added to `packages/runtime-composer/src/types.ts` with values `'connected' | 'disconnected' | 'syncing' | 'CONFLICTED'`. See `packages/sync-client/src/YjsDocAdapter.ts`, `CRDTConflictResolver.ts`, `apps/sync-server/src/YjsProjectCache.ts`, `apps/sync-server/src/presence/PresenceService.ts`.

PRYZM uses **Yjs CRDT + server linearization**. The sync contract:

- The sync client (`packages/sync-client/`) maintains a Yjs document per project via `YjsDocAdapter`.
- All element-property mutations MUST go through `YjsDocAdapter.applyCommand()` → Yjs Y.Map operations.
- Concurrent edits are merged server-side via `Y.applyUpdate` in `YjsProjectCache` — NOT by LWW.
- When the merge would produce semantically invalid state (e.g. two walls occupying the same ID with different geometry), the system MUST enter `CONFLICTED` project state (`SyncSlot.status = 'CONFLICTED'`) and surface `ConflictResolutionDialog`.
- Silent last-write-wins overwrite is **FORBIDDEN** (P8). All conflicts MUST go through `CRDTConflictResolver.mergeElement()`.
- `ConflictDisclosureBanner` MUST be shown when a concurrent edit overrides a local change before the user resolves it.

### §3.2 — Explicit conflicts (P8)

**Conflicts MUST be explicit.** Silent last-write-wins is forbidden. The contract:
- A conflict is any state where the CRDT merge cannot produce valid BIM semantics.
- The conflict dialog MUST show both versions (theirs / mine) with a diff view.
- The user MUST choose one version or a manual merge; the system MUST NOT choose automatically.
- Conflict resolution MUST produce a `source: 'undo'` command that is logged and undoable.


#### §3.2.1 — ⛔ AN UNDECLARED VERB IS A CONTRACT BREACH, NOT A BACKLOG ITEM (⭐ NEW 2026-08-23, lane LIFT42, L-7810..L-7813)

> ⭐⭐ **The founder placed a lift, and the adapter told him it would not reach anyone —
> in his own console, naming this file's counterpart and both legal answers:**
>
> ```
> [YjsDocAdapter] W5-3: command type 'lift.create' has NO sync disposition.
>   Its properties are NOT replicated.
> Declare it in packages/sync-client/src/syncDisposition.ts — as an element-property
>   path, or as NOT-SYNCED with a written reason.
> ```

**THE RULE.** Every command type dispatched on the bus MUST carry a disposition in
`packages/sync-client/src/syncDisposition.ts`: either an **`element-property`** path naming
where the subject id and the properties live, or **`not-synced` with a written reason**.
⛔ **"Not yet declared" is not a third option.** An undeclared verb does not degrade
gracefully — it produces the §3.2 failure this contract exists to forbid, in its worst form:
a collaborator keeps the value from element CREATION, **confidently, forever**. Failure and
emptiness have the same value. There is no dialog, no diff and no choice, because nothing
knows a merge was needed.

**AND IT IS DISCOVERED AT THE WORST MOMENT.** The gate
(`tools/ga-gate/check-sync-disposition.ts`) is a per-verb finding list, not a single
red/green, and it was ALREADY RED on other families when `lift.create` and `balcony.create`
were added — so a new undeclared verb joins a crowd and is invisible in it. **The first
person to learn was the founder, from a runtime warning, while placing an element.**

**R-C08-1 — a new bus verb ships with its disposition IN THE SAME COMMIT.** Not the next one.
The disposition is three lines; discovering the absence costs a founder session.

**R-C08-2 — a compound's members are PROPERTIES of the compound, never second subjects.**
Established by the pool and now applied uniformly: `pool.create`'s
`wallIds`/`floorSlabId`/`waterId`, `lift.create`'s
`enclosureIds`/`landingDoorIds`/`cabinPartIds`/`servedLevels`, and `balcony.create`'s
`slabId`/`floorId`/`railingIds` are **composition references** — properties of the compound
naming the members it owns. They are not routing, and one `subject` key cannot and must not
name a set.

**R-C08-3 — ⛔ a DELETE whose cascade RESTORES state on other elements must not be
approximated.** `lift.delete` is the sharpest case in the suite and is declared NOT-SYNCED
for it. It removes four enclosure sides across two stores, one landing door per served
storey and five cabin parts — **and it heals a void in every slab the shaft penetrated**
(C104 §8). A tombstone kind that replicated the removals and dropped the heal would leave
every collaborator with **a full-height hole through every floor plate and no lift in it** —
strictly worse than not replicating the delete at all. **When a partial replication is worse
than none, the answer is `not-synced` with the blocker named, never a best-effort subset.**

**R-C08-4 — ⚠ a declaration is a REPLICATION claim, never a RENDER claim.** C66 §1.1: a
claimed capability and a measured one must not be written the same way. Declaring a verb here
means its payload reaches the CRDT document and a receiving document can read the properties
back. It does **not** mean a receiving client re-renders — nothing reads the canonical
element map back into local stores yet (L-391), and for the lift the render gap is real on
the **local** side too (C104 §13). Two independent gaps; closing one does not close the other.

**R-C08-5 — ⛔ A NON-DETERMINISTIC CONFLICT TEST IS WORSE THAN A RED ONE.**
`packages/sync-client/__tests__/property-mutation-sync.test.ts` → *"concurrent height edits
surface a CRDTConflict naming the property"* — the single test that asserts §3.2's core
promise — **flakes on Yjs clientID ordering. Measured 2026-08-23 at HEAD: 3 failures in 6
runs.** A gate that is green half the time cannot establish that conflicts are disclosed; it
establishes only that they sometimes are. **L-7813, OPEN.**

### §3.3 — Command log (collaboration catch-up)

`project_command_log` stores commands for catch-up replay (a late-joining user re-applies the last N commands). Invariants:
- Rows MUST be purged after 24 hours (probabilistic server-side + nightly job).
- Inserts are non-blocking: the broadcast to Socket.io peers MUST NOT wait for the DB write.
- The log MUST NOT be the sole persistence mechanism; it supplements snapshots.

### §3.3.1 — ⛔ AN OUTBOUND EMIT THAT CANNOT BE DELIVERED MUST BE QUEUED OR REPORTED, NEVER DROPPED (L-13208, 2026-09-07)

**THE GAP THIS CLOSES, stated as the defect.** §3.3 governs the log's RETENTION and its
NON-BLOCKING insert. It said nothing about the emit that POPULATES it — even though
`server.js`'s single `socket.on('command-executed')` handler is **BOTH** the peer broadcast **AND**
the only writer of `project_command_log`. So one dropped client emit removes an edit from every
peer **and** from the table catch-up replays from: **no future catch-up by anyone can recover it.**
That is a permanent, silent data loss reached by a route no clause in §3 covered.

**How it was reached, from the founder's console (2026-09-07).** The client guard was
`if (!socket?.connected || !currentProjectId) return;` — a silent return. It is wrong in **both**
directions:

- **It admits the window it should refuse.** During a CLOSING transport `socket.connected` is still
  `true`, so the guard PASSES and the packet is handed to `ws.send()` on a dead socket. The browser
  discards it and engine.io then emits an **unconditional FAKE DRAIN** whose handler splices the
  packet out of the write buffer as if it had been sent
  (`try { doWrite(packet, data); } catch (e) {}` … `// fake drain`). No queue, no retry, no report.
- **It refuses the window socket.io would have handled.** When `connected` is false, socket.io's own
  `emit` BUFFERS into `sendBuffer`; the app guard returns before that can happen.

**And the client cannot notice.** `_triggerCatchUp` queries
`/api/projects/:id/commands?since=…&excludeSelf=1` — **inbound-only, own rows excluded**. It asks
what OTHERS did and is structurally incapable of reporting that this client's own emit vanished.
`Catch-up: no missed commands` and *"eleven of your edits never left the browser"* printed the
same value (§CONTEXT-DATA-HONESTY). This is the same class of harm as §3.2's
*"Silent last-write-wins overwrite is FORBIDDEN"*, reached by a different route.

**Binding rules:**

1. **Every outbound emit on a DURABLE path MUST classify its deliverability before emitting**, and
   the classification MUST include the CLOSING-transport window (`io.engine.transport.writable`),
   not just `socket.connected`.
2. **A non-deliverable durable emit MUST be queued or REPORTED. Silently returning is forbidden.**
   The report MUST name the command and the verdict, and MUST be retained for the session.
3. **An UNREADABLE transport is DELIVERABLE, not a failure.** Fabricating a loss that did not happen
   is the mirror image of hiding one that did. Only a positive `writable === false` counts.
3a. ⛔ **A LOSS IS NOT THE SAME AS "COLLABORATION IS NOT RUNNING", and only a LOSS may be reported.**
   *"No socket"* and *"no project open"* mean the command was never meant to reach a wire — a
   single-user session, offline work, or the moment before a project loads — and §3.3 already
   states that the log **is not the persistence path**. Reporting those would print an error on
   **every edit of a solo session**, and an alarm that is wrong every time it fires is an alarm
   nobody reads: that is the same defect this section exists to remove, wearing the opposite
   clothes. **Only two verdicts are reportable losses:** the socket exists but is down
   (`not-connected`), and the transport has gone non-writable while socket.io still believes it
   is connected (`transport-not-writable` — the CLOSING window). Implementation:
   `isCollaborationGap()`.
4. **The catch-up line MUST NOT claim a clean slate over a local gap.** It reports the INBOUND
   direction and must say so; when local commands were refused, the line carries them.
5. **A durable emit MUST NOT be blind-replayed on reconnect.** A client-side replay mints a SECOND
   `commandLogId` for the same edit, and §FIX-REPLAY-AT-MOST-ONCE (L-814) keys its dedupe on exactly
   that id — so the "fix" replaces a silent loss with a silent DUPLICATE, which is worse.
   ⚠ **MEASURED-OPEN: reliable outbound delivery is NOT achieved by this clause.** It requires a
   server-side ack (`server.js`'s `command-executed` handler registers no ack callback today) plus
   id-stable dedup. **L-13211, OPEN.** Until it lands, this section guarantees only that the loss is
   LOUD — which is a diagnostic property, not a delivery guarantee, and must not be written up as one.

Implementation: `apps/editor/src/engine/collabOutbound.ts` (`classifyOutbound`,
`UndeliveredCommandLedger`), consumed by `apps/editor/src/engine/initCollaboration.ts`. Spec:
`apps/editor/src/engine/__tests__/collabOutboundDelivery.spec.ts`.

### §3.4 — Presence

Real-time cursors and user-joined/left events MUST be relayed via Socket.io with server-authoritative `displayName` enrichment. The client MUST NOT send its own `displayName` — the server resolves it from `pryzm_users` and injects it.

### §3.4.1 — Presence is a SAMPLE STREAM: coalesced, and volatile (L-13207, 2026-09-07)

§3.4 governed WHO the cursor belongs to and said nothing about **how often it may be sent**. The
client therefore emitted `cursor-move` **once per raw `mousemove`**, unthrottled and uncoalesced,
from a listener on `#container` — into which the multi-pane shell and its DIVIDER are mounted. A
divider drag is one socket write per pointer event; when the transport went CLOSING mid-drag the
founder got ~40 `WebSocket is already in CLOSING or CLOSED state.` warnings in under a second.

**Binding rules:**

1. **A presence sample MUST be coalesced to at most ONE emit per frame**, folding to the LATEST
   sample. ⛔ **Not a debounce and not a throttle** — a debounce restarts on each new sample and so
   never fires during continuous motion, which is precisely when presence matters. The fold fires
   every frame motion continues; latency is bounded by one frame.
2. **Coalescing rides the frame bus** (`@pryzm/frame-scheduler`), never `setTimeout` — P3 / ADR-003.
3. **A presence packet MUST be sent VOLATILE.** A cursor position is superseded by the next one, and
   `socket.volatile` is socket.io's own primitive for that: it DISCARDS the packet when the
   transport is not writable instead of writing into a closing socket. **This is what removes the
   warning AT THE SOURCE. Suppressing the console instead is forbidden** — it hides the same write.
4. **A presence loss is NOT reported and MUST NOT be**, which is the difference from §3.3.1: a stale
   cursor is worthless, so discarding it is correct behaviour, not a defect to surface.

⚠ **UNRELATED DEFECT FOUND ON THIS PATH, NOT YET FIXED — L-13212, OPEN.** `server.js`'s
`remote-cursor` relay spreads the client payload **AFTER** the server-authoritative fields
(`{ userId: socket.data.userId, displayName: socket.data.displayName, ...data }`), so a
client-supplied `userId`/`displayName` would OVERRIDE them — the exact inversion of §3.4's
*"The client MUST NOT send its own `displayName`"*. Latent today only because the shipped client
sends `{projectId, x, y}`. One-line fix (spread first); it belongs to whoever owns `server.js`.

### §3.5 — Remote command replay: a collaborative command MUST be reconstructible, and reconstruction MUST NOT guess (§ANN-REMOTE-FACTORY, 2026-08-07, `73edb837`)

`RemoteCommandDispatcher` reaches the command bus only AFTER
`CommandRegistry.create()` returns a reconstructed Command. **There are therefore TWO
registries that must agree, and nothing enforced their agreement**: the wire carries
SCREAMING_SNAKE `CommandType` keys resolved by the `CommandRegistry` factory table, while
the bus handlers live in the dotted-verb namespace — handlers can exist and work locally
while being **unreachable on replay**. That is how every remote collaborator's annotation
edit was silently dropped (factory missing ⇒ `create()` returns null ⇒ the peer's edit
discards with a toast), the same failure class previously fixed piecemeal for furniture
and stairs (a `§FIX-ONCE-IMPORT-EVERYWHERE` instance, ADR-0306).

Binding rules:

1. **Every `CommandType` a peer can emit MUST have a `CommandRegistry` factory.** Debt as
   measured 2026-08-07: `CommandType` has **266** members; `REGISTRY` had **110 keys (109
   valid)** ⇒ 157 missing, 7 closed by `73edb837` ⇒ **150 remaining**. One registered key
   (`UPDATE_WALL_BASELINE_WIDTH`) is not a `CommandType` member at all — a dead key.
   ⚠ **Nothing ratchets the 150** — there is no GA gate and no debt JSON counting it; a
   number computed by audit is not a ratchet. MEASURED-OPEN.
2. **A factory MUST DISCRIMINATE, never guess** (ADR-0299): reconstructing the WRONG
   command and replaying it as the peer's edit is worse than dropping it. Where one
   `CommandType` serves two classes, the wire payload must carry a discriminator (e.g.
   `payload.elements` plural ⇒ many; `payloadKind: 'presentation'` — additive,
   back-compatible).
3. **A command whose `serialize()` does not put its constructor arguments on the wire MUST
   stay a reported miss**, not gain a fabricating factory (`UPDATE_CONSTRAINT` emits
   `payload: {}`; fix `serialize()` first).

---

## §4 — Rate Limiting

Three tiered limiters, all applied server-side (Express middleware):

| Limiter | Applies to | Limit |
|---|---|---|
| `globalLimiter` | All `/api/*` routes | 200 req / 15 min per IP |
| `apiLimiter` | `/api/v1/*`, `/v1/ai/*` | 60 req / min per IP |
| `aiLimiter` | `/api/anthropic/*`, `/api/ai/*` | 10 req / min per user |

The server MUST set `app.set('trust proxy', 1)` so `express-rate-limit` reads the real client IP from `X-Forwarded-For` (Replit's reverse proxy injects this header).

---

## §5 — Security Headers

Every response MUST include:

| Header | Value |
|---|---|
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Embedder-Policy` | `credentialless` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

CSP is configured per environment. The production CSP MUST block `unsafe-eval` and `unsafe-inline` for scripts. The AI proxy relay (`CF_WORKER_URL`) is the only permitted external API endpoint for AI calls **made with PRYZM's own key** — `api.anthropic.com` MUST NOT be accessible directly from the browser **on that path**.

### §5.1 — ⭐ AMENDED 2026-08-23 (lane BYOK44): the BYOM exception, and why the rule had to change rather than be worked around

The sentence above was written when **the only AI key in play was PRYZM's**, and for that key it is still exactly right: a browser-reachable `api.anthropic.com` would buy nothing and would widen the policy for no benefit.

[C105](./C105-AI-PROVIDER-CREDENTIALS-BYOM.md) introduces a second kind of key — **the user's own** — and it changes the premise. C105 §0.3 promises the user that their credential *"is stored only on their device, and leaves it only to call the provider they chose."*

⛔ **That promise is TRUE ONLY under a browser-direct topology.** Routing a user's credential through this server to satisfy the letter of §5 would put a third-party secret on PRYZM's wire and in PRYZM's request log. That is not a more conservative reading of the rule — **it is the opposite of the property the rule exists to protect.** So the rule is amended, explicitly and in place, rather than quietly circumvented in the CSP builder.

**The permitted exception, enumerated exhaustively** (`buildConnectSrc()` in `server/securityHeaders.js`, derived from `byomConnectSrcOrigins()` and gated against drift by `server/__tests__/byomKeyGuard.test.ts §BYOM-CSP`):

| Origin | For |
|---|---|
| `https://api.anthropic.com` | Claude |
| `https://api.openai.com` | ChatGPT |
| `https://generativelanguage.googleapis.com` | Gemini |
| `https://api.deepseek.com` | DeepSeek |
| `https://openrouter.ai` | OpenRouter |
| `http://localhost:11434`, `http://127.0.0.1:11434` | Ollama, on the user's own machine |

**The marginal risk, stated rather than glossed:** `connect-src` already allows roughly twenty-five external origins, so an attacker with script execution on this origin already possesses exfiltration paths. These six add a **destination, not a capability**. The marginal privacy gain — a user credential that never touches PRYZM — is large. That is the trade, made explicitly.

**`PRYZM_BYOM_DISABLED=1` withholds all of them.** An enterprise deployment with a strict egress policy restores the pre-amendment posture at the CSP layer, and the browser then refuses in its own words rather than PRYZM pretending the feature works.

**What is NOT amended:** the `/api/anthropic/*` proxy remains the only permitted path for PRYZM's own key, and `server/byomKeyGuard.js` now **refuses** any request to `/api/anthropic/*` or `/api/ai/*` that carries a third-party provider credential (C105 §4.5) — so the exception widens the browser's reach outward without widening what this server will accept inward.

---

## §6 — CORS

CORS is configured via `server/corsPolicy.js`:
- In production: the allowlist is `ALLOWED_ORIGIN` environment variable (defaults to the Replit domain).
- In development: `*` is permitted.
- The Socket.io server uses the same `socketCorsOptions()` — never a separate config.

---

## §7 — Stripe Billing

Stripe integration handles subscription management (C1–C4 pricing tiers, `01-VISION.md §6`). The Stripe webhook MUST:
- Be registered at `/api/stripe/webhook` with the raw Buffer body (not parsed JSON).
- Verify the `Stripe-Signature` header using `STRIPE_WEBHOOK_SECRET` before processing.
- MUST NOT trust the event payload without signature verification.

---

## §8 — Sovereignty & BYOK

For C4 enterprise customers (Differentiator D6):
- EU-region customers default to an EU Supabase project (`SUPABASE_URL` pointing to EU endpoint).
- Customer-managed keys (BYOK) are supported via `SUPABASE_SERVICE_ROLE_KEY` set by the customer.
- Self-host deployments (Differentiator D7) use `DATABASE_URL` pointing to the customer's PostgreSQL instance.
- References: [ADR-0237] sovereignty, [ADR-0238] BYOK, [SPEC-34] data residency, [SPEC-35] enterprise security.
