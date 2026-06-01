# ADR-0038 — S62 Plugin SDK 1.0 Descriptor Schema Lock + Sandbox Model Selection

> Status: Accepted — sprint-scoped (S62, 2026-04-28)
> Context: Phase 3C, Sprint S62 D1. Per
> `docs/03_PRYZM3/reference/phases/PHASE-3/3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md`
> §S62 Daily Plan line 250, D1 deliverable is "descriptor schema lock; semver
> 1.0.0 commitment". Per `phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md`
> §2.1, the descriptor is a zod-validated `PluginManifest` with seven
> permissions and five contribution kinds. The two phase docs disagree on two
> points (sandbox model and type name); this ADR records the reconciliation
> made at S62 D1 so subsequent days can implement against a single answer.
> Spec authority: SPEC > ADR > MASTER PLAN > CRITICAL-REVIEW > 05-IMPL > phase
> docs (per `phases/PHASES-AMENDMENT-2026-04-27-ROBUSTNESS.md` §0). No SPEC
> currently constrains the SDK descriptor — phase docs are the highest
> authority on this topic — so this ADR is the lock.

## Context

`@pryzm/plugin-sdk` is published once at S62 D9 with an immutable v1
descriptor. Per phase-doc-2 line 182, "the descriptor schema is permanent —
breaking changes in v1 are a 1-year deprecation cycle minimum." The cost of
getting D1 wrong is two minor versions plus 12 months of dual-support, so
the schema must be locked deliberately, with kill-switch K3-C standing by
(per phase-doc-2 line 558: "if at S62 plugin sandbox fails an escape attempt
in audit, halt SDK 1.0 publish; do not enter S64 marketplace until resolved").

Two phase docs both define S62. They were written on the same day
(2026-04-27) and are co-equal in authority order, but they make different
implementation choices on three points:

1. **Sandbox model** — phase-doc-1 §2.2 builds `PluginSandbox` on a Web
   Worker with a `Blob`-URL CSP shim; phase-doc-2 §S62 builds `IframeSandbox`
   on `<iframe sandbox="allow-scripts">`.
2. **Type name** — phase-doc-1 calls the locked type `PluginManifest` (and
   the on-disk artifact `plugin.manifest.json`); phase-doc-2 calls the type
   `PluginDescriptor` (and stores it in `descriptor.ts`).
3. **Internal name collision** — `apps/editor/src/PluginRegistry.ts` already
   exports a `PluginDescriptor` interface that is the *internal* runtime
   contract for first-party L4 element-family plugins (12 element + 1 view
   plugin wired by `bootstrapWithEverything`). The public SDK type and the
   internal registry type would collide if both shipped under the same
   identifier.

Without an explicit lock, downstream sprints (S63 docs site, S64
marketplace, S65-S66 APIs) would re-litigate these every time someone
imports from `@pryzm/plugin-sdk`. This ADR locks all three.

## Decision

### Decision A — schema lock procedure

The descriptor schema is locked at S62 D1 in
`packages/plugin-sdk/src/descriptor.ts`. Any post-D1 change requires
either:

- **(a)** a sprint-scoped ADR amendment + a 12-month deprecation cycle per
  phase-doc-2 line 182 (additive-only changes; new optional fields, new
  permission strings, new contribution kinds — never a removal or a tighter
  refine), or
- **(b)** a v2.0.0 publish (post-GA per phase-doc-2 §3.2) for any breaking
  change.

The schema-lock test suite at `packages/plugin-sdk/__tests__/descriptor.test.ts`
acts as the executable lock: every breaking change requires a deliberate
test edit, which the PR review process must catch.

### Decision B — sandbox model is iframe, not Worker

The sandbox is `<iframe sandbox="allow-scripts">` per phase-doc-2
§S62 lines 219-244, NOT the Web Worker model from phase-doc-1 §2.2.
Three reasons make iframe the correct choice:

1. **DOM rendering** — `register:panel` contributions render arbitrary HTML
   into a host-controlled location (`properties`, `sidebar-left`,
   `sidebar-right`, `bottom`). Workers have no DOM and cannot satisfy this
   contribution kind. Phase-doc-1's Worker proposal would force every panel
   to round-trip HTML strings through `postMessage` and re-parse them in
   the host — a 5-10× perf hit on every property panel update and a much
   wider XSS surface (the host has to sanitize untrusted HTML on every
   message).
2. **Cross-origin isolation** — `<iframe sandbox="allow-scripts">` (no
   `allow-same-origin`) gives a plugin its own opaque origin without any
   custom Blob-URL CSP shim. Phase-doc-1's Worker model required a
   hand-rolled `buildPluginCSP()` plus manual permission checks on every
   `network:fetch` — strictly more code surface, strictly weaker isolation
   guarantee (CSP via Blob URL is honoured by Chromium but not uniformly
   by Safari per [strategic ADR-007]).
3. **Browser support parity** — every browser PRYZM targets per
   `[strategic ADR-007]` ships the iframe `sandbox` attribute with the
   `allow-scripts` token; the Worker `Blob`-URL pattern works but the CSP
   header attached to the Blob URL does not propagate uniformly.

The Worker model is NOT killed outright — phase-doc-1's `PluginSandbox`
example is preserved as a future option for compute-only plugins (the
forthcoming `register:codec` contribution kind that S65-S66 may ship under
a new permission `compute:background`). For S62 D1-D9, only the iframe
sandbox is implemented.

### Decision C — type name reconciliation

The primary public type exported by `@pryzm/plugin-sdk` is `PluginManifest`,
which:

- matches the on-disk artifact `plugin.manifest.json` (phase-doc-1
  line 419),
- matches the `pryzm dev` CLI's `manifestPath` constant (phase-doc-1
  line 419),
- avoids collision with the internal `PluginDescriptor` already in
  `apps/editor/src/PluginRegistry.ts`.

To honour phase-doc-2 prose (which uses `PluginDescriptor` consistently),
`@pryzm/plugin-sdk` ALSO exports `type PluginDescriptor = PluginManifest`
as a type alias. Code may import either name; the alias is permanent for
v1 and is documented in the SDK README at D6.

The internal `PluginDescriptor` in `apps/editor/src/PluginRegistry.ts` is
NOT renamed in this commit — that file is internal to `apps/editor`, never
exported, and renaming it now is out-of-scope for D1. A follow-up rename to
`InternalPluginRecord` is scheduled for S62 D3 (host proxies sprint), where
the rename is co-located with its only consumers and can be done in one
diff. The collision is harmless until then because `apps/editor` does not
import from `@pryzm/plugin-sdk` until D9.

### Decision D — version progression

The workspace package version starts at `1.0.0-alpha.1` for the local
dependency declaration. The version flips to `1.0.0` only at D9 npm publish
AFTER:

1. D7 third-party sandbox audit signs off (gate K3-C per phase-doc-2 line
   558),
2. D8 Ed25519 signing key + revocation list infra is operational,
3. all 30 first-party plugins enumerated in
   `packages/plugin-sdk/docs/internal-plugin-inventory.md` are verified
   working through the new SDK (gate per phase-doc-1 line 486).

If any of those three gates fails, D9 publishes `1.0.0-rc.1` (npm tag
`next`) instead, and `1.0.0` waits for the next sprint. The version field
in `packages/plugin-sdk/package.json` IS the source of truth for the gate
state — bumping it is the explicit acknowledgement that all three gates
have closed.

### Decision E — `network:fetch` invariant

When `permissions` includes `'network:fetch'`, the schema MUST require
`allowedOrigins.length > 0`. Phase-doc-1 §2.1 implies this in prose
("required if 'network:fetch' is in permissions") but does not enforce it
via zod. This ADR makes the invariant a hard schema-level `superRefine`
because the alternative (host-side check at runtime) leaves the door open
for a marketplace upload to ship `network:fetch` with an empty allowlist
and have it silently fall through to "fetch denied" at runtime — a worse
failure mode than rejecting the manifest at upload time.

## Consequences

- **Positive**: D2-D10 implementers have a single answer on sandbox model,
  type name, version state, and network invariant. The schema-lock test
  suite mechanically enforces the schema-lock procedure.
- **Positive**: K3-C kill switch has a clear "version field" signal — if D9
  cannot bump to `1.0.0`, the SDK ships under tag `next` and S64
  marketplace explicitly waits.
- **Negative (mitigated)**: phase-doc-1's `PluginSandbox` Worker code is
  unused for v1. Mitigation: it is preserved in the phase doc as a
  reference for the future `compute:background` permission and is not
  deleted from the spec.
- **Negative (mitigated)**: the type alias `PluginDescriptor =
  PluginManifest` adds a small documentation burden. Mitigation: a single
  paragraph in the SDK README at D6 explains the alias and recommends
  `PluginManifest` as the canonical name.

## Alternatives Considered

- **Web Worker sandbox only** (phase-doc-1 §2.2 verbatim) — rejected for
  the DOM rendering reason above (Decision B point 1).
- **Both Worker AND iframe sandbox at D4** — rejected as out-of-scope for
  D1; the iframe-only path is already a stretch for a 10-day sprint.
- **Rename the internal `PluginDescriptor` to `InternalPluginRecord` in
  this commit** — rejected because it touches `apps/editor/src/PluginRegistry.ts`
  + every plugin's bootstrap entry, which is D3 host-proxy-sprint work.
- **Publish at `1.0.0` directly at D9 without the alpha pre-release** —
  rejected because npm `1.0.0` is permanent and the K3-C gate cannot be
  conditionally bypassed once that version exists in the registry.

## References

- `phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md` §2 (Plugin
  SDK 1.0 Published — manifest schema + sandbox + `pryzm dev`)
- `phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` §S62 (descriptor
  schema lock + iframe sandbox + audit + signing)
- `phases/PHASES-AMENDMENT-2026-04-27-ROBUSTNESS.md` §0 (authority order)
- ADR-0021 plugin-descriptor-bootstrap-everything (the internal descriptor
  surface this ADR explicitly does NOT rename today)
- ADR-0031 S61 staged legacy deletion (the staged-deliverable pattern this
  ADR mirrors for S62)
- K3-C kill switch (phase-doc-2 line 558)
- `[strategic ADR-007]` browser support matrix (sandbox attribute parity)
- `[strategic ADR-009]` plugin sandbox audit gate (the D7 audit referenced
  in Decision D)
