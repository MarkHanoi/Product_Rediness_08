// THE FIRST REAL `.pryzm-family` MIGRATION — v1.0 → v1.1.
//
// Governed by C111 §8.4 (VERSIONING & MIGRATION) and ADR-0376 D5.
//
// ⭐ WHY THIS FILE EXISTS AT ALL, stated once so it is not re-litigated:
//   C111 §8.2 named `§C111-MIGRATION-EXIT-UNSATISFIABLE` — with both
//   version fields typed `z.literal('1.0')`, EVERY LEGAL MIGRATOR
//   produced a document its own exit gate rejected, so the framework
//   shipped eight ops and could not complete a single version bump.
//   The probe is `phase3/probe-migration-framework.txt`, and its
//   falsification control (`validateExit: false` → ok) isolates the
//   cause exactly: THE OPS WORK; THE EXIT GATE WAS UNSATISFIABLE.
//   `family-schema.ts` §FORMAT-VERSION-TABLE fixed the mechanism; this
//   file is the first migrator that can therefore actually run.
//
// ⛔ §8.4-d / C111 §12 R-9: the fix is NOT `validateExit: false`.
//   Converting an unsatisfiable gate into an ABSENT one is strictly
//   worse.  `validateExit` stays defaulted to `true` and this migrator
//   passes it.
//
// ⭐ §8.4-e — WHY SEVERAL REPAIRS RIDE IN ONE BUMP:
//   "the first real migration carries §5.3-b, §1.3-a and §2.4-b
//   together, because each is a byte-changing repair and a corpus-free
//   window is not offered twice."  §3.1 measured that there is NO
//   `.pryzm-family` corpus, so today every byte-changing repair is free.
//   What this migrator CARRIES and what it does NOT is the §DELTA-CARRIED
//   table below — declared rather than left for a reader to infer.
import { CURRENT_FORMAT_VERSION, FamilyDocumentSchema, FamilyManifestSchema, } from '../family-schema.js';
/** The version this migrator lifts FROM. */
export const V1_0 = '1.0';
/** The version this migrator lifts TO — pinned to the schema's own
 *  constant so the two can never drift apart silently. */
export const V1_1 = CURRENT_FORMAT_VERSION;
/* ------------------------------------------------------------------ */
/* §DELTA-CARRIED — what rides in this bump, and what deliberately     */
/*                  does not.  A blank is not permitted (C84 EI-6).    */
/*                                                                     */
/* CARRIED:                                                            */
/*  • C111 D-1  §8.4-b  `formatVersion` made comparable, so a version   */
/*                      bump can complete at all.  This migrator IS the */
/*                      proof obligation D-1 names: identityMigrator    */
/*                      ('1.0','1.1') must go green WITH `validateExit` */
/*                      LEFT AT ITS DEFAULT.                            */
/*  • C111 D-5  §5.3-b  `document.defaults` DELETED, together with the  */
/*                      three ops that maintained it (add-parameter,    */
/*                      change-parameter-type, delete-parameter) — the  */
/*                      contract requires them removed in the SAME      */
/*                      change-set, and they are.                       */
/*                                                                     */
/* NOT CARRIED — each declared, with the reason, so a later reader does */
/* not read the silence as a clearance (C84 EI-6):                      */
/*  • C111 D-2  §2.4-b  THE FAKE TYPE CHECKSUM.  `FamilyType.checksum`  */
/*    is typed `sha256:` and is FNV-1a/32 repeated eight times — 32 bits */
/*    presented as 256, and it collides on trivial input.  ⛔ NOT FIXED  */
/*    HERE, and the reason is ownership, not difficulty: §2.4-b puts the */
/*    repair in `family-pack.ts` ("packFamily already has `sha256Hex`    */
/*    and is async while split-type is sync"), which is OUTSIDE this     */
/*    lane's file ownership.  Minting a second, synchronous SHA-256      */
/*    inside a migration op to route around that would be exactly the    */
/*    rival-implementation the standing review rule R1 rejects.          */
/*    ⛔ Until it lands, C111 §2.4-c binds: NO consumer may treat        */
/*    `FamilyType.checksum` as an integrity signal.  OWED, named owner:  */
/*    a lane holding `family-pack.ts`.                                   */
/*  • C111 D-12 §1.3-a  THE `ent_` / `con_` / `evt_` ID PREFIXES.       */
/*    ⛔ NOT CARRIED, and NOT because it was forgotten — because THE     */
/*    FRAMEWORK CANNOT EXPRESS IT.  `migrateFamily` validates the        */
/*    SOURCE document against the CURRENT `FamilyDocumentSchema` at      */
/*    ENTRY.  So a migration that NARROWS a field rejects its own input  */
/*    before it runs: making `ent_` required would make every v1.0       */
/*    document fail the entry gate, and the entry gate is the thing that */
/*    is supposed to admit it.  Only WIDENING migrations are expressible */
/*    today — which is why every field this bump adds is optional or     */
/*    defaulted.  This is a SECOND unsatisfiable gate, one level up from */
/*    §8.2's exit gate, and it is measured by execution in this lane's   */
/*    findings (§ENTRY-GATE-BLOCKS-NARROWING).  Fixing it needs a        */
/*    per-version schema pair, which is a mechanism change, not a field  */
/*    change.  OWED.                                                     */
/* ------------------------------------------------------------------ */
/** Lifts a v1.0 bundle to v1.1.
 *
 *  ⛔ BUMPS **BOTH** VERSION FIELDS, AND THAT IS A REPAIR.  The container
 *  carries `formatVersion` on the manifest AND on the document, and they
 *  are independent strings.  Every pre-existing migrator in this package
 *  — `identityMigrator` and all eight ops — bumps ONLY the document's,
 *  so a bundle that had been migrated by any of them carried manifest
 *  '1.0' beside document '1.1': two answers to "what version is this
 *  file?" inside one ZIP.  `registry.run` keys off the DOCUMENT field
 *  while `unpackFamily` refuses off the MANIFEST field, so the two
 *  disagreeing is not cosmetic — it decides whether the file opens.
 *  `assertVersionCoherent` below is the guard, applied on both sides. */
export function makeV1_0ToV1_1Migrator() {
    return {
        id: 'pryzm-family:1.0->1.1',
        from: V1_0,
        to: V1_1,
        description: 'v1.0 -> v1.1: drop the dead `document.defaults` channel (C111 §5.3-b) ' +
            'and bump both version fields coherently (C111 §8.4-b)',
        apply(input) {
            assertVersionCoherent(input, V1_0);
            // §5.3-b — the deletion is performed EXPLICITLY rather than being
            // left to Zod's strip-unknown-keys behaviour.  Both routes produce
            // the same bytes today, but only this one is a NAMED migration step
            // that a reader can find, and only this one survives a future Zod
            // release changing its default from `strip` to `passthrough`.
            const { defaults: _deadSecondDefaultChannel, ...documentWithoutDefaults } = input.document;
            return {
                manifest: { ...input.manifest, formatVersion: V1_1 },
                document: { ...documentWithoutDefaults, formatVersion: V1_1 },
                ifcMapping: input.ifcMapping ? { ...input.ifcMapping } : undefined,
                events: input.events,
            };
        },
    };
}
/** The registered instance. */
export const v1_0ToV1_1Migrator = makeV1_0ToV1_1Migrator();
/** ⛔ Refuses when the manifest and the document disagree about what
 *  version the bundle is.  Both numbers are named, per C16 CA-18 —
 *  a refusal that reports only one of two disagreeing quantities makes
 *  the reader go and find the other one. */
export function assertVersionCoherent(input, expected) {
    const m = input.manifest.formatVersion;
    const d = input.document.formatVersion;
    if (m !== d) {
        throw new Error(`[pryzm-family:1.0->1.1] incoherent bundle: manifest.formatVersion=${m} ` +
            `but document.formatVersion=${d}. One file cannot be two versions; ` +
            `re-pack the bundle with both fields equal before migrating.`);
    }
    if (m !== expected) {
        throw new Error(`[pryzm-family:1.0->1.1] expected formatVersion ${expected}, got ${m}.`);
    }
}
/** Convenience: a registry preloaded with every migrator this build
 *  ships, so a caller does not hand-assemble the chain (and cannot
 *  forget one).  ⛔ Import `MigratorRegistry` lazily via the caller —
 *  this module must not import the registry, because `registry.ts`
 *  does not import migrators and the arrow must stay one-way. */
export const ALL_VERSION_MIGRATORS = [v1_0ToV1_1Migrator];
/** Re-exported for tests and for the round-trip proof, so an assertion
 *  about "the current schema" cannot silently drift from the schema. */
export { FamilyDocumentSchema, FamilyManifestSchema };
//# sourceMappingURL=v1_0-to-v1_1.js.map