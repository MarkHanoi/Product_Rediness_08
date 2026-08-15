/**
 * §FIX-RESI-FACADE-UNKNOWN (GR-10, the []-means-unknown drain) — the PURE
 * discriminator for `PlacedApartment.facadeEdges` at the executor seam.
 *
 * THE DEFECT (ledger row ResidentialBuildingExecutor.ts, ARM C): both readers
 * ended `: (apt.facadeEdges ?? [])`. `facadeEdges` is REQUIRED by the
 * orchestrator's type and computed by `facadeEdgesFor` — but the executor
 * defends against untyped seam data, and the defence collapsed two facts:
 *   · DETERMINED-EMPTY — an INTERIOR cell genuinely has zero façade edges
 *     (every edge is a party wall); skipping no edges is CORRECT there;
 *   · ABSENT — no producer recorded the façade set. Treating that as ∅ emits
 *     a cell wall on EVERY edge, coincident with the building shell — the
 *     founder's "double walls on the façade" defect (§RESI-NO-DOUBLE-WALL)
 *     silently returning — and silently skips the apartment's balcony.
 * C75 §1.4 / C78 §1.4: the two must not print the same value.
 *
 * Vocabulary: the closed C78 §8.1 union via the shared seam — imported
 * literal, never widened.
 */

export type FacadeEdgesDetermination =
    | { readonly known: true; readonly edges: ReadonlySet<string> }
    | { readonly known: false; readonly reason: 'RELATIONSHIP_NOT_RECORDED' };

/** Accepts the seam's three runtime shapes: ReadonlySet, readonly array, or
 *  absent/malformed (unknown — never coerced to "no façades"). */
export function determineFacadeEdges(raw: unknown): FacadeEdgesDetermination {
    if (raw instanceof Set) {
        return { known: true, edges: raw as ReadonlySet<string> };
    }
    if (Array.isArray(raw)) {
        return { known: true, edges: new Set<string>(raw as readonly string[]) };
    }
    return { known: false, reason: 'RELATIONSHIP_NOT_RECORDED' };
}

/** The loud basis line for the executor's console verdicts — the unknown
 *  carries its reason token and its CONSEQUENCE, never an implied "interior
 *  cell" (§REFUSAL-IDENTITY: the token, not a shrug). */
export function facadeEdgesUnknownNote(
    d: Extract<FacadeEdgesDetermination, { known: false }>,
    consequence: string,
): string {
    return `facadeEdges UNRECORDED (${d.reason}) — ${consequence}`;
}
