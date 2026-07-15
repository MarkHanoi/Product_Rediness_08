// §FIX-OFFICE-ENVELOPE-NOT-DISPOSED (L-321) — show the freshly-built office tower in FULL DETAIL.
//
// ROOT CAUSE (candidate B, confirmed): the "solid grey ENVELOPE / massing shell" the founder sees
// over the office tower is NOT an undisposed generator element — the OfficeBuildingExecutor emits
// only real geometry (slabs · perimeter walls · glazing · core · roof · finishes) and never creates
// a massing/envelope element. The grey shell is the §FIX-HEAVY-SCENE-MASSING-LOD massing LOD:
// `LevelScoped3DCullingService` AUTO-ESCALATES any model with ≥ 15 levels AND ≥ 1000 elements (or
// ≥ 4000 elements) to `'massing'` mode, hiding every out-of-scope storey's full geometry and drawing
// it instead as an opaque grey block (`LevelMassingRenderer`, colour 0xb9c0cc). Only the ACTIVE
// level ± 1 render in full detail — and because `AddLevelCommand` activates the last-minted (top)
// storey, the founder saw a solid grey 25-storey tower with only the ROOF storey detailed.
//
// A house / apartment / residential building NEVER shows this: they are low-rise (well below the
// 15-storey gate — see §FIX-MASSING-LOD-THRESHOLD-TOO-AGGRESSIVE / L-164), so massing never engages
// and there is nothing for them to "dispose". The OFFICE is simply the ONE typology tall + heavy
// enough to trip the auto-escalation, which is why the issue is office-specific.
//
// FIX (mirror the service's OWN escape hatch — do NOT fork the massing machinery): the user just
// generated a DETAILED building in order to SEE it, so after the build we pin the 3D view to the
// service's `'all'` mode — the documented explicit override honoured at ANY scale, and the same
// `DEFAULT_MODE` the service rests at for everything a normal GPU handles. This makes the detailed
// floors the only geometry shown (no massing block). It is fully reversible: the "3D detail" control
// in the viewport can switch back to `'massing'` if a user hits device limits on a very tall tower.
//
// The new office pipeline already removed the L-139 device-loss aggravators the massing LOD guarded
// against (§OFFICE-PERIMETER-COARSEN decimates the ring, punched windows share ONE glazing system
// type instead of per-panel curtain materials, skipPbrUpgrade), so full detail is safe here.
//
// P4: no `(window as any)` — the culling service owns the typed `globalThis` writes. P8: no new
// exported cross-boundary surface beyond this thin wrapper; the service's setMode carries the span.

import { levelScoped3DCullingService } from '@pryzm/core-app-model/rendering';

/**
 * Force the 3D view to full detail after an office build so the detailed tower — not the massing
 * LOD "envelope" — is shown. Never throws (a rendering-service hiccup must not fail the build).
 */
export function showOfficeFullDetail(): void {
    try {
        levelScoped3DCullingService.setMode('all');
        console.log('[office-building] §FIX-OFFICE-ENVELOPE-NOT-DISPOSED — 3D view pinned to full detail (massing LOD off) so the detailed tower is shown, not the grey envelope.');
    } catch (e) {
        console.warn('[office-building] could not pin 3D view to full detail (non-fatal):', e);
    }
}
