// LANE FED (E5 partial · DECISION-SUMMARY row 2) — THE ODbL SEPARABILITY BOUNDARY, the one
// architectural licence constraint, stated by row 2 verbatim: "Keep ODbL layers SEPARABLE
// (never merge into one DB)". Oss lane §2 gives the mechanism: ODbL's share-alike attaches
// to derivative DATABASES — "a derived per-parcel building-attribute table may qualify as a
// derivative database → isolate or share-alike".
//
// ENFORCED STRUCTURALLY, TWICE:
//   1. COMPILE TIME — `FederationStore<'non-odbl'>` only accepts values whose licence is
//      NARROWED to `'open-non-share-alike'`; a `FederatedBuilding` whose licence union still
//      admits `'odbl-share-alike'` does not typecheck (see the `@ts-expect-error` proof in
//      the test file). The type parameter is a phantom brand: it exists only to make the
//      wrong merge a build error.
//   2. RUNTIME — types erase, and probe scripts/JS callers exist, so `addToFederationStore`
//      re-checks and returns a NAMED refusal (never a silent drop, never a throw the caller
//      can forget: the outcome is a discriminated union in the FetchOutcome tradition).
//
// A store's policy is DECLARED at creation and IMMUTABLE — there is deliberately no
// "relabel" API: laundering an ODbL store into a proprietary one by mutation is the exact
// move this file exists to forbid. Escape hatch: none here. If a real workflow needs one,
// that is a founder/legal decision (impl findings §open-questions), not a code default.
//
// PURE in-memory scaffold (C58 §1.9): the real persistence targets adopt this API shape;
// nothing here does I/O.

import type { FederatedBuilding } from './conflate.js';

/** What a store declares about itself, at creation, forever. */
export type StoreLicencePolicy =
    /** An ODbL derivative database: share-alike obligations accepted; anything open may enter. */
    | 'odbl'
    /** A non-share-alike store: ODbL-encumbered rows are REFUSED at the boundary. */
    | 'non-odbl';

/** A `FederatedBuilding` proven free of share-alike encumbrance — the only shape a non-ODbL store accepts. */
export type NonOdblFederatedBuilding = FederatedBuilding & {
    readonly licence: 'open-non-share-alike';
};

/**
 * The phantom-branded store. `rows` is readonly on the interface; only
 * {@link addToFederationStore} appends (via the internal mutable alias), so the
 * boundary check cannot be bypassed through the public type.
 */
export interface FederationStore<P extends StoreLicencePolicy> {
    readonly policy: P;
    /** Human label for transcripts ("tallinn-context-db", "proprietary-derived-attrs"…). */
    readonly label: string;
    readonly rows: readonly FederatedBuilding[];
}

export type StoreAddOutcome =
    | { readonly ok: true }
    | {
          readonly ok: false;
          readonly refusal: 'odbl-into-non-odbl-store';
          /** Names the row and both licences — a refusal always carries its numbers. */
          readonly detail: string;
      };

export function createFederationStore<P extends StoreLicencePolicy>(
    policy: P,
    label: string,
): FederationStore<P> {
    return { policy, label, rows: [] };
}

/**
 * The boundary. The conditional parameter type makes the forbidden call a
 * COMPILE error against a non-ODbL store; the runtime check makes it a NAMED
 * refusal when types were erased. Accepted rows are appended.
 */
export function addToFederationStore<P extends StoreLicencePolicy>(
    store: FederationStore<P>,
    row: P extends 'non-odbl' ? NonOdblFederatedBuilding : FederatedBuilding,
): StoreAddOutcome {
    const fb = row as FederatedBuilding;
    if (store.policy === 'non-odbl' && fb.licence === 'odbl-share-alike') {
        return {
            ok: false,
            refusal: 'odbl-into-non-odbl-store',
            detail:
                `store '${store.label}' (policy non-odbl) refused building `
                + `'${fb.building.id}' (licence odbl-share-alike): ODbL layers stay separable `
                + `— DECISION-SUMMARY row 2, the one architectural licence constraint`,
        };
    }
    (store.rows as FederatedBuilding[]).push(fb);
    return { ok: true };
}
