# ADR-0120 — The shadow caster set is owned, explicit, and size-bounded

- **Status:** Accepted
- **Date:** 2026-07-10
- **Supersedes:** nothing
- **Amends:** ADR-0111 (shadow lifecycle / no synchronous GPU dispose) — complementary, not superseding
- **Contract:** C04 §SHADOW (normative rules live there; this ADR records *why*)
- **Tracker:** L-205
- **Tag:** `§FIX-SHADOW-CASTER-DENYLIST` (`92f437a0`)

## Context

PRYZM projects a real sun shadow of every element onto an invisible `ShadowMaterial` plane at level
L0 (the "ground catcher", ADR-0106 / `§FEAT-REAL-ENVIRONMENT`).

For roughly a week the ground rendered as a **solid grey rectangle** instead of a shadow. The defect
survived **ten** root-cause attempts. Nine shipped to production and were wrong. Each was internally
consistent and survived review. This ADR exists because the *class* of mistake matters more than the
bug.

### What the bug actually was

`PascalSceneLighting._enableShadowsOnScene()` set `castShadow = true` on **every mesh in the scene**,
filtered only by whether the mesh's name contained `edge`, `grid`, or `collision`.

The scene contains meshes that are not BIM elements — notably a ground-level plane installed by the
OBC `ShadowedScene`. It became a shadow caster. **A ground-level plane that casts a shadow shadows the
entire catcher.** Every catcher fragment inside the shadow camera then reads `shadowMask = 0` and
paints `alpha = opacity`: a solid grey rectangle, bounded exactly by the shadow camera's footprint.

The catcher itself was kept out of the caster set only by an incidental
`transparent && opacity < 0.5` check — and that check merely `return`s, so it never **cleared** a
`castShadow` that an earlier pass had already set.

### Why it took ten attempts

**The grey rectangle is always exactly the size of the shadow camera's ground footprint.**

| shadow camera | observed symptom |
|---|---|
| `±113,657 m` (a runaway fitted frustum) | grey to the horizon |
| `±50 m` (the fixed camera) | a ~100 m grey diamond |

Nine attempts read the **size** of the symptom as evidence about its **cause**. Every fix that
resized the shadow camera changed the grey's dimensions, which looked like progress, and changed
nothing. Meanwhile the decisive evidence sat in every log ever captured — on an *empty* project,
before any wall existed and before the catcher was even attached:

```
[PBRSceneUpgrader]     Applied — meshes: 2
[PascalSceneLighting]  Shadow flags set on 1 mesh(es).
```

Two meshes. Zero BIM elements. One just became a shadow caster.

Three *real* defects were found and fixed along the way, none of which was the grey:

- an off-frame `createScenePass()` + pipeline dispose destroying the live `ShadowDepthTexture`
  mid-submit (`d9b8f7cf`) — genuine, and a WebGPU device-loss hazard;
- a scene-AABB shadow-frustum fit deriving an **84 km** radius from a one-wall scene (`f4533641`) —
  genuine, and the reason the grey once reached the horizon;
- two renderers (OBC WebGL, PRYZM WebGPU) sharing one light's shadow state (`f3b28961`) — genuine,
  though three's `ShadowNode` proved robust to it.

Finding a real bug adjacent to a symptom is not the same as finding *the* bug. That conflation is
what cost the week.

## Decision

1. **The shadow caster set is an owned, explicit concept — never "every mesh minus some names."**
   A mesh casts a shadow because it is BIM geometry, not because its name fails a substring test.

2. **A shadow RECEIVER must never CAST.** Any mesh whose purpose is to receive
   (`role === 'ground-shadow-catcher'`, or any `ShadowMaterial`) is **demoted**: `castShadow` is
   explicitly *cleared*, not merely left unset. Skipping is insufficient — another pass may have set
   it. Receivers retain `receiveShadow`.

3. **Size is a type signal.** Any mesh whose world-space bounding radius exceeds
   `MAX_CASTER_RADIUS_M = 500` is scene infrastructure, not architecture, and must not cast.
   (A 40-storey tower is ~75 m radius; a scene/ground plane is thousands.) The cap is a *safety net*
   for meshes PRYZM does not own — third-party scene furniture, future OBC internals — not a
   substitute for rule 1.

4. **Demotions are logged**, by name, material type, role and radius. An offending mesh must name
   itself in production rather than manifest as a grey rectangle.

5. **Derived shadow-camera extents must be bounded and finite** (C04 §SHADOW.2.4), and **sharpness is
   `metresPerTexel`, not frustum size** (C04 §SHADOW.2.5). Sharpen by raising `mapSize` on a stable
   camera; shrink-wrapping the camera is legitimate only with the clamp in force.

6. **Two renderers must not share one light's shadow state** (C04 §SHADOW.2.9). The OBC
   `PostproductionRenderer`'s `shadowMap.enabled` stays `false`; the WebGPU pipeline owns the shadow
   pass end-to-end.

7. **A measure-first debugging protocol is normative** (C04 §SHADOW.3). Enumerate the caster set
   before forming a hypothesis. `console.table` of every `castShadow` mesh sorted by radius would
   have ended L-205 in minutes.

## Consequences

**Positive**
- The grey rectangle is gone; element shadows project correctly onto the invisible L0 layer.
- The failure mode is now self-describing: an unexpected caster logs its own name and size.
- The caster set has an owner and an invariant, pinned by tests
  (`PascalSceneLighting.casterDenylist.test.ts`, 5 cases — including the exact bug shape: a
  *pre-poisoned* catcher must be **cleared**, not skipped; and a 40-storey tower must still cast).

**Negative / accepted**
- `MAX_CASTER_RADIUS_M` is a heuristic. A legitimate single mesh larger than 500 m (a bridge, a
  masterplan-scale terrain) would be silently demoted. It logs when it does, and the constant is one
  edit. Rule 1 (an explicit allowlist keyed on BIM element identity) remains the correct long-term
  design; the cap is the safety net until then.
- The ground shadow is currently **soft** (`metresPerTexel ≈ 0.195 m` at ±50 m / 512²). Sharpening
  is deliberately deferred to the ordered, measured path in C04 §SHADOW.4 — this is the exact request
  whose careless implementation started L-205.

**Latent, unresolved**
- The AABB sweep that derived an 84 km radius from a one-wall scene was removed, not explained. The
  offending mesh has never been identified. If a fitted frustum is ever reinstated, identify it first
  (C04 §SHADOW.4).

## Alternatives considered

- **Exclude the catcher by name.** Rejected: name-substring filtering is the defect, not the fix.
- **Give the OBC scene its own light.** Rejected as heavier than the problem; PRYZM owns lighting
  (`PascalSceneLighting`) and OBC never renders shadows (`scene.shadowsEnabled = false`).
- **Let the catcher self-shadow and compensate with `shadow.bias`.** Rejected: masks the defect,
  produces acne, and leaves an arbitrary ground plane in the depth map.
- **Keep resizing the shadow camera.** This is what nine attempts effectively did. It changes the
  grey's size, never its cause.

## References

- C04 §SHADOW — normative rules + debugging protocol
- ADR-0111 — shadow lifecycle: never synchronously dispose a `ShadowDepthTexture`
- ADR-0106 / `§FEAT-REAL-ENVIRONMENT` — real sun + L0 ground catcher
- `92f437a0` `§FIX-SHADOW-CASTER-DENYLIST` — the fix
- `d9b8f7cf`, `f4533641`, `f3b28961` — the three real, adjacent defects found en route
- V1-LAUNCH-READINESS-AUDIT.md — L-205
