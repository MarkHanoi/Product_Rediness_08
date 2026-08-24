#!/usr/bin/env tsx
/**
 * §SHEAR-SURVIVES-TRANSPORT (L-10142) — `Matrix4.decompose` MAY NOT BE APPLIED TO A
 * TRANSFORM READ OFF A SCENE OBJECT.
 *
 * ── WHY THIS GATE EXISTS ────────────────────────────────────────────────────────────────
 * ONE root has now surfaced in THREE consumers, months apart, each found by the founder
 * looking at a picture rather than by anything automated:
 *
 *   • PLAN + SECTION + ELEVATION — `NativeElementMeshExporter._seatProxy` decomposed every
 *     proxy's world matrix. The founder's raked, profile-edited wall drew **0.413 m** adrift
 *     on a contract drawing.                                        (L-10140, `4c1af611`)
 *   • The §H.2 DESCRIPTOR CACHE — stored ten T·R·S numbers, so a re-opened drawing moved
 *     **27 mm** even after the producer was fixed.                  (L-10141, `4c1af611`)
 *   • 3D SITE / 3D GLOBE "REAL" — `GLBExporter.cloneWithBakedWorldTransform` decomposed
 *     every export root. Windows on a raked wall exported **0.172 m** out of their own hole
 *     and doors **0.300 m**; the founder saw panes floating off the façade. (L-10142)
 *
 * `Matrix4.decompose` takes scale from column LENGTHS and a quaternion from a basis that a
 * SHEAR has made NON-ORTHOGONAL. Recomposing T·R·S from a sheared basis yields A DIFFERENT
 * SOLID. **A rake IS a shear** — `WallFragmentBuilder.ts:1385` has said so in prose since
 * L-955 ("a shear is not expressible in TRS"), as the stated reason raked walls are excluded
 * from GPU instancing. The argument was written down three times and enforced zero times,
 * and the third consumer shipped anyway. This is that enforcement.
 *
 * ── ⭐ THE INVARIANT IS DERIVED, NOT DECREED ─────────────────────────────────────────────
 * A blanket ban on `decompose` would be wrong: it is exact, and cheaper than a full matrix,
 * whenever its input CANNOT carry a shear. Measured across the whole repository, every
 * legitimate call is legitimate for the SAME ONE REASON, and it is a structural one:
 *
 *     its input is an INSTANCE matrix or a CAMERA matrix — the two families that are
 *     T·R·S BY CONSTRUCTION — and the instancing producers EXCLUDE raked and profiled
 *     elements precisely because TRS cannot carry a shear.
 *
 * The two calls that were NOT legitimate were the two TRANSPORTS: code that re-seats an
 * ARBITRARY scene object's world transform somewhere else. So the line the gate draws is the
 * line the defect actually falls on — `X.matrixWorld.decompose(…)` / `X.matrix.decompose(…)`,
 * where `X` is an `Object3D` — and not a count of the word "decompose".
 *
 * ── ARMS ────────────────────────────────────────────────────────────────────────────────
 *   A · TRANSPORT DECOMPOSE — hard-0 against a NAMED register. Both directions: an
 *       unregistered call fails, AND a registered row whose call is gone fails (a paid row
 *       must leave the ledger, or the register rots into a list of things that are secretly
 *       fine — `gate-debt.json` rule 2).
 *   B · THE PREMISE — each registered row names the EXCLUSION that makes it safe, as a
 *       literal that must still be present in a named file. Delete `!_hostRaked` from
 *       `WindowBuilder` and its allowance is VOID, so this gate goes red instead of the
 *       allowlist quietly becoming a lie. ⭐ This is the arm that keeps the register derived.
 *   C · SHEAR PRODUCERS — every direct, non-TRS write to an `Object3D.matrix` must be
 *       registered. A NEW producer means a new sheared transform exists and every transport
 *       must be re-examined. That is EXACTLY the sequence that produced this defect:
 *       `WindowBuilder`/`DoorBuilder` gained §RAKE-HOSTED-OPENING, and nobody re-checked the
 *       exporters. A gate that only watches consumers would not have caught it coming.
 *   D · CENSUS — every remaining bare `.decompose(`, as a shrink-only ratchet, so a FOURTH
 *       family is visible the day it is authored rather than the day a founder photographs it.
 *
 * Exit: 0 OK · 1 an arm failed · 2 misconfigured scan (walked too little) · 3 ratchet exceeded.
 */
import { scanFilesStripped, type Match } from './lib/sourceScan.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'shear-transport';
const DIRS = ['packages', 'apps', 'plugins'] as const;

/** Tests are excluded: a probe's job is to EXHIBIT the defective form and measure it. */
const isTest = (rel: string): boolean =>
  /(^|\/)__tests__\//.test(rel) || /\.(test|spec|probe\.test)\.tsx?$/.test(rel) || /\.probe\./.test(rel);

// ═══════════════════════════════════════════════════════════════════════════════════════
// ARM A + B — the register. Each row states WHY the call is safe and names the PREMISE that
// makes the reason true, as a literal that must still exist in a named file.
// ═══════════════════════════════════════════════════════════════════════════════════════

interface AllowedTransport {
  /** Repo-relative file, forward-slashed. */
  readonly file: string;
  /** The receiver expression's last identifier, e.g. `mesh` in `mesh.matrixWorld.decompose(`. */
  readonly receiver: string;
  /** Why a shear cannot reach this call. */
  readonly reason: string;
  /** The premise, as `file` + a literal that must still be present in it. */
  readonly premise: { readonly file: string; readonly literal: string };
}

const ALLOWED_TRANSPORT: readonly AllowedTransport[] = [
  {
    // `_convertGroupToInstances` — the window's GPU-instancing arm. It decomposes each
    // sub-mesh's world matrix into translate × rotateY × scale. That is exact ONLY because
    // a raked (or profiled, or curved, or splayed) window never reaches it.
    file: 'packages/geometry-window/src/WindowBuilder.ts',
    receiver: 'mesh',
    reason: 'GPU-instancing arm; a raked or profiled window is EXCLUDED before it is reached',
    premise: {
      file: 'packages/geometry-window/src/WindowBuilder.ts',
      literal: '!_hostRaked',
    },
  },
  {
    // A camera VIEW matrix is rigid — rotation + translation, built here by `makeBasis` +
    // `setPosition`. No scale, and structurally no shear.
    file: 'packages/renderer-three/src/geospatial/CesiumThreeBridge.ts',
    receiver: 'threeCamera',
    reason: 'a camera VIEW matrix is rigid (rotation + translation) — it cannot carry a shear',
    premise: {
      file: 'packages/renderer-three/src/geospatial/CesiumThreeBridge.ts',
      literal: 'this.threeCamera.matrix.copy(view)',
    },
  },
  {
    file: 'plugins/geospatial/src/CesiumThreeBridge.ts',
    receiver: 'threeCamera',
    reason: 'a camera VIEW matrix is rigid (rotation + translation) — it cannot carry a shear',
    premise: {
      file: 'plugins/geospatial/src/CesiumThreeBridge.ts',
      literal: 'this.threeCamera.matrix.copy(view)',
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════════════
// ARM C — the shear producers. Anything that writes an Object3D's `matrix` directly.
// ═══════════════════════════════════════════════════════════════════════════════════════

interface RegisteredProducer {
  readonly file: string;
  readonly what: string;
}

const REGISTERED_PRODUCERS: readonly RegisteredProducer[] = [
  {
    file: 'packages/geometry-wall/src/WallFragmentBuilder.ts',
    what: '_applyRakeShearToChildren — the wall body rake, premultiplied onto each CHILD',
  },
  {
    file: 'packages/geometry-window/src/WindowBuilder.ts',
    what: '§RAKE-HOSTED-OPENING — the leaf lean `z ↦ z + k·y`, on the window GROUP (an export ROOT)',
  },
  {
    file: 'packages/geometry-door/src/DoorBuilder.ts',
    what: '§RAKE-HOSTED-OPENING — the leaf lean `z ↦ z + k·y`, on the door GROUP (an export ROOT)',
  },
  {
    file: 'packages/file-format/src/export/glb/GLBExporter.ts',
    what: '§GLB-EXPORT-AUTHORING-FRAME — inverse(frame) × matrixWorld, seated WHOLE (never decomposed)',
  },
];

/** ARM D — bare `.decompose(` on a local matrix (instance matrices, by measurement). */
const CENSUS_BASELINE = 3;

// ═══════════════════════════════════════════════════════════════════════════════════════

function main(): number {
  let failed = false;
  let ratchetExceeded = false;

  // ── ARM A — transport decompose ────────────────────────────────────────────
  const transport = scanFilesStripped({
    root: REPO_ROOT,
    dirs: [...DIRS],
    // `X.matrixWorld.decompose(` or `X.matrix.decompose(` — a transform read off an Object3D.
    pattern: /([A-Za-z_$][\w$]*)\s*\.\s*(matrixWorld|matrix)\s*\.\s*decompose\s*\(/,
    minFiles: 3000,
    exclude: isTest,
    label: LABEL,
  });

  console.log(`[${LABEL}] files scanned: ${transport.filesScanned} (excluded ${transport.filesExcluded})`);
  console.log(`[${LABEL}] ARM A — transport decompose: ${transport.matches.length} call(s), register holds ${ALLOWED_TRANSPORT.length}`);

  const matched = new Set<AllowedTransport>();
  for (const m of transport.matches) {
    const receiver = m.groups[0] ?? '(?)';
    const row = ALLOWED_TRANSPORT.find((r) => r.file === m.file && r.receiver === receiver);
    if (row) {
      matched.add(row);
      console.log(`    ✓ ${m.file}:${m.line}  ${receiver}.${m.groups[1]}.decompose(…) — ${row.reason}`);
      continue;
    }
    failed = true;
    console.error(
      `\n⛔ [${LABEL}] ARM A FAIL — UNREGISTERED TRANSPORT DECOMPOSE\n` +
        `      ${m.file}:${m.line}\n` +
        `      ${m.text}\n` +
        `   \`${receiver}\` is a scene object, and \`Matrix4.decompose\` CANNOT CARRY A SHEAR:\n` +
        '   it reads scale off column LENGTHS and a quaternion off a basis a shear has made\n' +
        '   non-orthogonal, so the recomposed T·R·S is A DIFFERENT SOLID. A rake IS a shear\n' +
        '   (WallFragmentBuilder._applyRakeShearToChildren, WindowBuilder/DoorBuilder\n' +
        '   §RAKE-HOSTED-OPENING), and a hosted leaf carries one on the very node an exporter\n' +
        '   re-seats.\n' +
        '   FIX: carry the matrix WHOLE — `dst.matrix.copy(src.matrixWorld)` +\n' +
        '        `dst.matrixAutoUpdate = false`. See `NativeElementMeshExporter._seatProxy`\n' +
        '        (L-10140) and `GLBExporter.cloneWithBakedWorldTransform` (L-10142).\n' +
        '   ⛔ Do NOT add a row to ALLOWED_TRANSPORT unless the input is an INSTANCE or CAMERA\n' +
        '      matrix, and name the EXCLUSION that keeps a shear out of it (ARM B checks it).',
    );
  }

  for (const row of ALLOWED_TRANSPORT) {
    if (matched.has(row)) continue;
    failed = true;
    console.error(
      `\n⛔ [${LABEL}] ARM A FAIL — STALE REGISTER ROW\n` +
        `      ${row.file}  (receiver \`${row.receiver}\`)\n` +
        '   The registered call is GONE. A paid row must leave the ledger in the same commit\n' +
        '   that pays it, or the register rots into a list of things that are secretly fine.\n' +
        '   Delete the row from ALLOWED_TRANSPORT.',
    );
  }

  // ── ARM B — the premise behind each allowance ──────────────────────────────
  const premiseScan = scanFilesStripped({
    root: REPO_ROOT,
    dirs: [...DIRS],
    pattern: /(!_hostRaked|this\.threeCamera\.matrix\.copy\(view\))/,
    minFiles: 3000,
    exclude: isTest,
    label: `${LABEL}-premise`,
  });
  const premiseHits = new Set(premiseScan.matches.map((m) => `${m.file}::${m.groups[0]}`));

  console.log(`[${LABEL}] ARM B — premises: ${ALLOWED_TRANSPORT.length} to verify`);
  for (const row of ALLOWED_TRANSPORT) {
    const key = `${row.premise.file}::${row.premise.literal}`;
    if (premiseHits.has(key)) {
      console.log(`    ✓ ${row.premise.file} still carries \`${row.premise.literal}\``);
      continue;
    }
    failed = true;
    console.error(
      `\n⛔ [${LABEL}] ARM B FAIL — THE PREMISE IS GONE, SO THE ALLOWANCE IS VOID\n` +
        `      expected \`${row.premise.literal}\` in ${row.premise.file}\n` +
        `   ${row.file} is allowed to decompose ONLY because: ${row.reason}.\n` +
        '   That exclusion is what keeps a sheared transform away from the call. With it gone,\n' +
        '   the allowance is an assertion about code that no longer exists. Either restore the\n' +
        '   exclusion, or seat the transform WHOLE and delete the register row.',
    );
  }

  // ── ARM C — shear producers ────────────────────────────────────────────────
  const producers = scanFilesStripped({
    root: REPO_ROOT,
    dirs: [...DIRS],
    pattern: /\.\s*matrix\s*\.\s*(premultiply|multiply|multiplyMatrices|makeShear)\s*\(/,
    minFiles: 3000,
    exclude: isTest,
    label: `${LABEL}-producers`,
  });

  const producerFiles = new Set(producers.matches.map((m) => m.file));
  const registeredFiles = new Set(REGISTERED_PRODUCERS.map((p) => p.file));
  console.log(`[${LABEL}] ARM C — direct \`.matrix\` writes: ${producers.matches.length} call(s) in ${producerFiles.size} file(s), register holds ${registeredFiles.size}`);

  for (const file of producerFiles) {
    if (registeredFiles.has(file)) continue;
    failed = true;
    const where = producers.matches.filter((m) => m.file === file).map((m: Match) => `${m.file}:${m.line}`);
    console.error(
      `\n⛔ [${LABEL}] ARM C FAIL — UNREGISTERED DIRECT \`.matrix\` WRITE\n` +
        `      ${where.join('\n      ')}\n` +
        '   A transform written straight onto `Object3D.matrix` need not be T·R·S — a rake is\n' +
        '   applied exactly this way. If this one CAN carry a shear, then EVERY TRANSPORT that\n' +
        '   re-seats these objects must be re-checked before this lands: that is the sequence\n' +
        '   that produced L-10140 (plan/section/elevation) and L-10142 (the GLB) — the producers\n' +
        '   were added and the exporters were never revisited.\n' +
        '   Add it to REGISTERED_PRODUCERS once you have checked the transports.',
    );
  }
  for (const p of REGISTERED_PRODUCERS) {
    if (producerFiles.has(p.file)) continue;
    failed = true;
    console.error(
      `\n⛔ [${LABEL}] ARM C FAIL — STALE PRODUCER ROW\n      ${p.file}\n` +
        `   Registered as: ${p.what}\n` +
        '   No direct `.matrix` write remains there. Remove the row.',
    );
  }

  // ── ARM D — census of the remaining decomposes (shrink-only) ───────────────
  const census = scanFilesStripped({
    root: REPO_ROOT,
    dirs: [...DIRS],
    pattern: /\.\s*decompose\s*\(/,
    minFiles: 3000,
    exclude: isTest,
    label: `${LABEL}-census`,
  });
  const others = census.matches.filter(
    (m) => !/\.\s*(matrixWorld|matrix)\s*\.\s*decompose\s*\(/.test(m.text),
  );
  console.log(`[${LABEL}] ARM D — other \`.decompose(\` calls: ${others.length} / ${CENSUS_BASELINE} (shrink-only)`);
  for (const m of others) console.log(`      ${m.file}:${m.line}  ${m.text}`);
  if (others.length > CENSUS_BASELINE) {
    ratchetExceeded = true;
    console.error(
      `\n⛔ [${LABEL}] ARM D — RATCHET EXCEEDED: ${others.length} > ${CENSUS_BASELINE}.\n` +
        '   These decompose a LOCAL matrix — by measurement, instance matrices read via\n' +
        '   `getMatrixAt`, which are T·R·S by construction. A NEW one is not automatically\n' +
        '   wrong, but it is a new place a shear could be destroyed silently, and this suite\n' +
        '   has now paid for that three times. Prove the input cannot be sheared, then lower\n' +
        '   or justify the baseline — ⛔ never raise it to make a red run green.',
    );
  }

  if (failed) {
    console.error(`\n[${LABEL}] FAIL — see the arms above. C04 §PROJECTION-FIDELITY · L-10140 / L-10142.`);
    return 1;
  }
  if (ratchetExceeded) return 3;
  console.log(`\n[${LABEL}] OK: ${transport.matches.length} transport decompose(s), all registered with a live premise; ${producerFiles.size} producer file(s) registered; census ${others.length}/${CENSUS_BASELINE}.`);
  return 0;
}

process.exit(main());
