# C77 — The Secrets & Configuration Register

> **Stamp**: 2026-08-12 · **Status**: CANONICAL
> **Scope**: the enumeration of every secret and sensitive environment variable the system
> depends on — the names, where each is read, which service consumes it, whether it is
> build-time-inlined or runtime, what fails without it, and **which services must share it** —
> and the binding rule that the enumeration is GENERATED from the read-sites, never transcribed,
> and that its gate reports **presence, never value**. Owns the register artefact, its columns,
> the nine-build-arg deploy sub-contract, and the shared-secret invariant.
> **Key principle**: *A secret nobody owns is a secret nobody can verify.* The register answers
> "what does this system need to be given, where, and by whom" — and its gate proves a name is
> **declared and present**, never what its value is. **Presence is not value; a value never
> leaves the vault, the bundle, or a log.**
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`. Peers
> with **C08** (owns collaboration transport and the WS-auth mechanism — C08 *uses* SESSION_SECRET;
> C77 *owns its declaration*), **C05**/**C47** (persistence + file-format — own the stores a
> secret unlocks, not the secret), **C69** (owns the verb register — the exact register+gate
> pattern this contract copies to the config surface), **C13** (project isolation — a leaked
> service-role key breaks it), **C67**/**C68** (chat — the AI key path). Supersedes nothing.
> **Register artefact**: `docs/04-reference/SECRETS-REGISTER.md` — **generated** (SPECIFIED, not
> yet built; §6).
> **Evidence appendix**: [`BIM30-SECRETS-MAPPING-AUDIT.md`](../../04-reference/BIM30-SECRETS-MAPPING-AUDIT.md)
> — the read-only audit that found the surface unowned.
> **Gate**: `tools/ga-gate/check-secrets-register.ts` — **UNBUILT at stamp time** (§6).
> **Changelog**: 2026-08-12 — created, in answer to the founder's ask *"make sure all the secrets
> are contractually mapped — check all contracts"*, after a `SESSION_SECRET` misreading went
> uncaught for lack of a map.

---

## §0 — Why this contract exists

The founder asked whether every secret is contractually mapped. The audit checked all of
C01–C75 and found: **nothing owns the secret surface.** ~40 environment names are read across
four surfaces — the BFF runtime, the editor client (build-time-inlined, served publicly), the
sync-server, and the nine deploy build-args — and every one resolves to **NO OWNER**. C08
mentions three by name in prose; it declares no register, no per-secret read-site or
failure-mode, and no gate.

This is the **C69 pattern, third instance.** C69 was minted because nothing owned the verb list
and two gates disagreed with the code. COORD-01 found nothing owned the element-family table.
Here, nothing owns the config surface — and the cost was already paid in this very session:

- **A `SESSION_SECRET` misreading went uncaught.** A transient `flyctl secrets list` failure
  returned empty; the coordinator trusted the empty result over the tool and told the founder
  the BFF had no stable secret. It does. **A wrong reading had nothing to check it against** —
  precisely the condition a register removes. The error was corrected only because an
  independent audit noticed the code contradicted the claim (the BFF hard-exits in prod without
  the secret, yet the site is up).

- **The secret has an ephemeral fallback that whispers.** `server/authStore.js:30` mints
  `randomBytes(48)` when `SESSION_SECRET` is absent and only `console.warn`s
  (`authStore.js:35`). So a missing secret **looks like a working one** until a restart or a
  second machine — failure and emptiness collapsed into one value, in the credential layer.

- **The secret must be SHARED, and nothing says so.** The BFF signs the session JWT with it
  (`authStore.js:33`); the sync-server verifies the WS upgrade with it
  (`apps/sync-server/src/auth/WsAuthGate.ts`). Two **independently-deployed** Fly apps that must
  hold a **byte-identical** value, with no artefact asserting the equality. A drift there refuses
  every browser with `bad-signature` — silently, at build-arg time (C-DEPLOY §3.2's third
  sibling: not empty, not misspelled, but **out of sync**).

So this contract does not restate a list of secrets in prose — prose is exactly what failed.
It mandates a **generated** register and a gate that reads the code, and it forbids the one thing
a secrets tool must never do: surface a value.

> **§0.1 — MUST.** No document — this contract included — may transcribe a secret **value**, and
> no document may transcribe the secret **list** or any per-secret column as prose: cite the
> generated register. C69 §0.1 applied to credentials, with one addition C69 does not need: the
> register records **presence and length, never the value.** A value in a doc, a bundle, a log,
> or a commit is a leak regardless of intent.

> **§0.2 — MUST.** Where prod-configuration status cannot be established without reading a live
> value, the correct entry is **NOT-ESTABLISHED-FROM-CODE** — never an assumed "set" and never an
> assumed "unset". The `SESSION_SECRET` error was exactly an assumed-unset; the register's gate
> may probe **presence** at deploy time, but a static read may not guess.

---

## §1 — What a secret IS here, and the register's columns

> **§1.1 — MUST.** A **secret-or-sensitive config var** is any `process.env.X` or
> `import.meta.env.X` the system reads whose absence, wrong value, or disclosure changes
> behaviour, security, or cost. The register has one row per name, split into **measured** columns
> (generated from the read-sites, never hand-written) and **declared** columns (normative, because
> they cannot be derived from code that may be wrong — the COORD-01 lesson):

| Column | Kind | Meaning |
|---|---|---|
| `name` | measured | the env identifier |
| `readSite` | measured | file:line of every read |
| `service` | measured | BFF / editor-client / sync-server / worker / CI / deploy |
| `surface` | measured | `runtime-env` or `build-time-inlined` (vite) |
| `classification` | **declared** | `SECRET` (never public) / `PUBLIC-TOKEN` (client-safe by design) / `CONFIG` (non-secret) |
| `required` | **declared** | `required` / `optional` / `required-in-prod-only` |
| `sharedWith` | **declared** | the other services that must hold the **byte-identical** value (empty for most; `[sync-server]` for `SESSION_SECRET`) |
| `failureMode` | **declared** | what happens without it — `hard-exit` / `ephemeral-fallback` / `degraded-feature` / `broken-bundle` |

> **§1.2 — MUST NOT.** A `build-time-inlined` var may not be classified `SECRET`. Vite bakes it
> into the public bundle (C-DEPLOY §3.4); it is served to every browser. `VITE_CESIUM_TOKEN` and
> `VITE_GOOGLE_MAPS_KEY` are `PUBLIC-TOKEN` by design and must be domain-restricted at the
> provider. A genuine secret marked `VITE_` is a leak, and the gate flags it (§6 arm b).

> **§1.3 — MUST. `ephemeral-fallback` is a declared failure mode, not a silent one.** A secret
> whose absence yields a generated stand-in (the `SESSION_SECRET` `randomBytes` path) declares
> `failureMode: ephemeral-fallback` AND its consumer must escalate louder than `console.warn`
> where a wrong-but-present value is a security or session-integrity failure. Failure and
> emptiness are never the same value — least of all for a credential.

---

## §2 — The binding rules

> **§2.1 — MUST. Every secret read has a register row.** A `process.env.X` / `import.meta.env.X`
> read for a name absent from the register is a gate failure (§6 arm a). This is the mechanism
> that would have caught an unregistered secret being added — and, run against HEAD, is what
> makes the enumeration trustworthy rather than aspirational.

> **§2.2 — MUST. The shared-secret invariant is declared and, where possible, enforced.** A row
> with a non-empty `sharedWith` asserts that every listed service holds the **byte-identical**
> value. Static code cannot verify equality across two deployed apps; the register **declares** the
> requirement, the deploy runbook (C-DEPLOY, now a sub-contract of this one for the build-arg set)
> **carries** it, and a deploy-time presence-and-fingerprint check MAY compare a non-reversible
> digest (never the value) across services. `SESSION_SECRET.sharedWith = [sync-server]` is the
> standing instance and the reason this rule exists.

> **§2.3 — MUST. The nine deploy build-args are part of this register.** The
> `LOWMEM · VITE_CESIUM_TOKEN · VITE_GOOGLE_MAPS_KEY · VITE_GLB_URL · VITE_CONTEXT_TILES_URL ·
> GIT_SHA · GIT_BRANCH · BUILT_AT · RUN_NUMBER` set governed today only by the prose runbook
> `DEPLOY-CONTRACT-MANUAL-FLY.md §3` is absorbed as register rows. Docker's silent acceptance of a
> missing or misspelled build-arg (that runbook's §3.2) is exactly an unowned-config failure; the
> register names them so the bundle-proof (C-DEPLOY §5) checks against a list, not memory.

> **§2.4 — MUST NOT. The gate never surfaces a value.** It asserts `name is declared` and
> optionally `name is present` (set/unset + length), and it exits on a violation **without ever
> printing, logging, or committing the value**. A secrets gate that could leak is worse than none —
> the C74 lesson (a green suite over a mock argues *for* the claim) applied to credentials: a gate
> that prints a value to prove it exists has defeated its own purpose.

> **§2.5 — MUST. Rotation and drift are the register's concern.** A secret's row is the place a
> rotation is planned (change the value on all `sharedWith` services in one operation) and a drift
> is caught (the `sharedWith` fingerprint check). Neither is possible without the row; both are the
> reason a scattered `process.env` surface is a latent outage.

---

## §3 — What this contract does NOT own

- **The values.** Never. They live in the deploy platform's secret store (Fly secrets, the vault).
- **The mechanism a secret unlocks** — C08 owns WS-auth, C05 owns the DB connection, C67/C68 own
  the AI path. C77 owns only the *declaration* that the secret exists and must be provided.
- **Provisioning.** Creating a Fly app, setting a secret, or deploying is an operational act
  under C-DEPLOY and a founder decision where it spends money; C77 makes the *requirement* legible,
  not the act automatic.

---

## §4 — Anti-patterns

- **§4.a — A secret value in a doc, bundle, log, or commit.** §0.1, §2.4. The one unforgivable one.
- **§4.b — A genuine secret behind a `VITE_` name.** §1.2 — inlined, served to every browser.
- **§4.c — An ephemeral fallback that only `console.warn`s.** §1.3 — a missing secret masquerading
  as a working one.
- **§4.d — A shared secret with no `sharedWith` declaration.** §2.2 — the `SESSION_SECRET`/sync
  drift, silent until the second instance.
- **§4.e — Assuming set-or-unset from a failed tooling read.** §0.2 — the realised error this
  contract exists to prevent.
- **§4.f — A build-arg checked against memory instead of the register.** §2.3.
- **§4.g — Restating the secret list or a value in prose.** §0.1 — cite the generated register.

---

## §5 — The realised incident (kept, so the reason is not abstract)

On 2026-08-12 the coordinator told the founder the production BFF had no stable `SESSION_SECRET`
and that this blocked a sync deploy. It was false: `SESSION_SECRET` is set (`Deployed`). The
misreading came from a transient `flyctl secrets list` failure whose empty output was trusted
over the tool, and it survived long enough to be committed into a `fly.toml` header before an
independent audit caught the contradiction from the code. **A register with a
presence-not-value gate turns that class of error from a coordinator slip into a red check** —
which is the whole argument for this contract in one sentence.

---

## §6 — The gate

`tools/ga-gate/check-secrets-register.ts` — **UNBUILT at stamp time (2026-08-12)**, stated so
absence is never inferred from omission. When built, four exit codes from
`tools/rac-conformance/certification/contract.ts` (never its own), a subject floor (env-read
sites scanned ≥ a minimum, else exit 2), and:

- **arm a** — every `process.env.X` / `import.meta.env.X` read maps to a register row; an
  unregistered name is a finding naming the read-site.
- **arm b** — no `build-time-inlined` / `VITE_` name is classified `SECRET`.
- **arm c** — every row with a non-empty `sharedWith` is carried in the deploy runbook's arg set.
- **arm d (optional, deploy-time)** — presence probe: reports each name set/unset + length,
  **never the value**, and MAY compare a non-reversible digest across `sharedWith` services.

> **§6.1 — MUST.** The gate is **presence-not-value** in every arm (§2.4). It is negative-tested
> like every other — watched flag an unregistered read against a planted fixture — but the
> fixture uses a **fake name**, never a real value, because a negative control that leaks is the
> §4.a failure wearing a test's clothes.

> **§6.2 — MUST.** The generated register (`docs/04-reference/SECRETS-REGISTER.md`) records
> presence and length only; a regeneration that would write a value fails closed.
