/**
 * server/familySeeds.js — the STARTER COMPONENT LIBRARY (lane U-SEED).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐⭐ THE FIRST COMPONENTS COME INTO EXISTENCE HERE. Before this file the
 *     Components browser opened with only "Load Component…" and NOTHING to load:
 *     `find . -name '*.pryzm-family'` → zero, and `GET /api/v1/families` served an
 *     empty store. A first-time user had a file-picker and no file. This module
 *     is the answer: three real, valid, signed `.pryzm-family` documents — a
 *     parametric Window, a Door, and a Panel — authored through the ONE packer
 *     (`packFamily`), served by the marketplace routes, and loadable through the
 *     ONE catalogue exactly like any user file.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ─── ⛔ DATA, NOT A SCHEMA CHANGE (C111 · lane hard-rule) ──────────────────────
 * `@pryzm/file-format`'s schema + ops are FROZEN and CONSUMED here, never
 * touched. These seeds are DATA authored via the existing `packFamily`; they are
 * validated by that packer's own Zod pass, so a malformed seed fails LOUDLY at
 * pack time rather than shipping a broken file. The `Family*` spellings below are
 * FROZEN WIRE/API identifiers (ADR-0376 D5 / C111 §0.2) — quoted, never adopted;
 * every user-facing NAME says Component.
 *
 * ─── SINGLE SOURCE OF TRUTH (C84 EI-9) ────────────────────────────────────────
 * These definitions live in ONE place. The server seeds its marketplace store
 * from `buildStarterFamilyRecords()`; the lane's tests import the SAME builders,
 * so the "three seed files" the acceptance proves are byte-for-byte the ones the
 * server serves — no rival copy.
 *
 * ─── ⚠ SERVER-SIDE ONLY IMPORT DISCIPLINE (§L-442) ────────────────────────────
 * Imports `@pryzm/file-format/server` — the browser-safe, Node-safe entry that
 * `familyMarketplaceRoutes.js` already depends on (packFamily/unpackFamily use
 * WebCrypto + TextEncoder, no Node builtins, no three/pdfjs). The package ROOT
 * ('.') is deliberately NOT imported here — that would drag the browser graph in
 * and fail `check-server-deps.mjs`.
 *
 * ─── PROVENANCE ───────────────────────────────────────────────────────────────
 * Served through the marketplace, a loaded seed records catalogue provenance
 * `'marketplace'`; the browser labels the not-yet-loaded OFFER rows "Starter".
 */

import { packFamily, unpackFamily } from '@pryzm/file-format/server';

/* ------------------------------------------------------------------ */
/* Deterministic id minting — valid `fam_`/`typ_`/`par_`/… ULIDs.      */
/*                                                                     */
/* Crockford base32 EXCLUDES I,L,O,U (family-schema's ULID regex is    */
/* `[0-9A-HJKMNP-TV-Z]{26}`). A counter mapped onto the SAFE alphabet  */
/* guarantees a valid, unique, and — crucially — DETERMINISTIC body:   */
/* the same import order yields the same ids in the server and in the  */
/* tests, so the download URL, the store key and the placement payload */
/* all agree without a shared constant to rot.                         */
/* ------------------------------------------------------------------ */
const SAFE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let _ulidCounter = 0;
function nextUlidBody() {
  _ulidCounter += 1;
  let n = _ulidCounter;
  let tail = '';
  for (let i = 0; i < 6; i += 1) {
    tail = SAFE32[n % 32] + tail;
    n = Math.floor(n / 32);
  }
  // 4 (prefix stem) + 16 (zero pad) + 6 (counter tail) = 26.
  const body = `01HZ${'0000000000000000'}${tail}`;
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(body)) {
    throw new Error(`[familySeeds] minted an invalid ULID body: ${body}`);
  }
  return body;
}
const famId = () => `fam_${nextUlidBody()}`;
const typId = () => `typ_${nextUlidBody()}`;
const parId = () => `par_${nextUlidBody()}`;
const planeId = () => `plane_${nextUlidBody()}`;
const profId = () => `prof_${nextUlidBody()}`;
const solId = () => `sol_${nextUlidBody()}`;

/** sha256 of canonical `{}` — the checksum for a family-type with no per-type
 *  overrides (the parameters carry their own defaults). The Sha256 schema only
 *  validates the LITERAL SHAPE, and no reader re-derives a per-type checksum on
 *  load, so this is the correct value for `values: {}`. */
const EMPTY_VALUES_CHECKSUM =
  'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
/** packFamily re-stamps `manifest.schemaHash` over the canonical document, so a
 *  placeholder is correct here. */
const PLACEHOLDER_SCHEMA_HASH =
  'sha256:0000000000000000000000000000000000000000000000000000000000000000';

const SEED_TS = '2026-09-02T00:00:00.000Z';

/** A simple axis-aligned rectangle profile on a plane (four points).  Geometry
 *  is real but minimal — enough for the seed to be a genuine, bakeable extrude
 *  rather than an empty shell. Coordinates are in metres (D3). */
function makeRectProfile(id, name, plane, w, h) {
  return {
    id,
    name,
    planeId: plane,
    entities: [
      { id: nextUlidBody(), kind: 'point', data: { x: 0, z: 0 } },
      { id: nextUlidBody(), kind: 'point', data: { x: w, z: 0 } },
      { id: nextUlidBody(), kind: 'point', data: { x: w, z: h } },
      { id: nextUlidBody(), kind: 'point', data: { x: 0, z: h } },
    ],
    constraints: [],
  };
}

/* ------------------------------------------------------------------ */
/* Seed 1 — a PARAMETRIC WINDOW.                                        */
/*                                                                     */
/* Carries the founder's §64 progressive-parametrisation demo so the   */
/* authoring loop works out of the box: `GlassWidth = Width -           */
/* 2*FrameWidth`. At the defaults (Width 1200, FrameWidth 75) it        */
/* resolves to 1050 — the number lane U3's workspace is built to        */
/* author and this lane's acceptance quotes.                            */
/* ------------------------------------------------------------------ */
function buildWindow() {
  const HOST = planeId();
  const PROF = profId();
  const P_WIDTH = parId();
  const P_HEIGHT = parId();
  const P_FRAME = parId();
  const P_GLASS = parId();
  const TYPE = typId();
  const FAM = famId();

  const document = {
    formatVersion: '1.1',
    referencePlanes: [
      { id: HOST, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: P_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: { psetName: 'Pset_WindowCommon', propertyName: 'OverallWidth' }, exposed: true },
      { id: P_HEIGHT, name: 'Height', kind: 'instance', dataType: 'length', defaultValue: 1500, expression: null, ifcMapping: { psetName: 'Pset_WindowCommon', propertyName: 'OverallHeight' }, exposed: true },
      { id: P_FRAME, name: 'FrameWidth', kind: 'type', dataType: 'length', defaultValue: 75, expression: null, ifcMapping: null, exposed: true },
      // ⭐ THE §64 DERIVED PARAMETER — the formula the whole demo turns on.
      { id: P_GLASS, name: 'GlassWidth', kind: 'type', dataType: 'length', defaultValue: null, expression: 'Width - 2 * FrameWidth', ifcMapping: null, exposed: true },
    ],
    profiles: [makeRectProfile(PROF, 'WindowFrame', HOST, 1.2, 1.5)],
    solids: [
      { id: solId(), kind: 'extrude', profileId: PROF, materialSlotId: null, lod: { coarse: false, medium: true, fine: true }, lengthExpression: 'Height', direction: { x: 0, y: 1, z: 0 } },
    ],
    materialSlots: [],
    types: [{ id: TYPE, name: 'Standard', values: {}, checksum: EMPTY_VALUES_CHECKSUM }],
    representations: [],
    connectors: [],
    propertySets: [],
    featureEdges: [],
  };

  const manifest = {
    formatVersion: '1.1',
    id: FAM,
    name: 'Window',
    semver: '1.0.0',
    author: { id: 'usr_pryzm_starter', displayName: 'PRYZM Starters' },
    description: 'A parametric window with a Width-driven glazing width (GlassWidth = Width − 2 × FrameWidth).',
    ifcEntity: 'IfcWindow',
    category: 'Window',
    tags: ['starter'],
    minPRYZMVersion: '2.0.0',
    schemaHash: PLACEHOLDER_SCHEMA_HASH,
    createdAt: SEED_TS,
    lastModifiedAt: SEED_TS,
  };

  return { key: 'window', manifest, document };
}

/* ------------------------------------------------------------------ */
/* Seed 2 — a DOOR.                                                     */
/* ------------------------------------------------------------------ */
function buildDoor() {
  const HOST = planeId();
  const PROF = profId();
  const P_WIDTH = parId();
  const P_HEIGHT = parId();
  const P_THICK = parId();
  const TYPE = typId();
  const FAM = famId();

  const document = {
    formatVersion: '1.1',
    referencePlanes: [
      { id: HOST, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: P_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 900, expression: null, ifcMapping: { psetName: 'Pset_DoorCommon', propertyName: 'OverallWidth' }, exposed: true },
      { id: P_HEIGHT, name: 'Height', kind: 'instance', dataType: 'length', defaultValue: 2100, expression: null, ifcMapping: { psetName: 'Pset_DoorCommon', propertyName: 'OverallHeight' }, exposed: true },
      { id: P_THICK, name: 'Thickness', kind: 'type', dataType: 'length', defaultValue: 50, expression: null, ifcMapping: null, exposed: true },
    ],
    profiles: [makeRectProfile(PROF, 'DoorLeaf', HOST, 0.9, 2.1)],
    solids: [
      { id: solId(), kind: 'extrude', profileId: PROF, materialSlotId: null, lod: { coarse: false, medium: true, fine: true }, lengthExpression: 'Thickness', direction: { x: 0, y: 1, z: 0 } },
    ],
    materialSlots: [],
    types: [{ id: TYPE, name: 'Standard', values: {}, checksum: EMPTY_VALUES_CHECKSUM }],
    representations: [],
    connectors: [],
    propertySets: [],
    featureEdges: [],
  };

  const manifest = {
    formatVersion: '1.1',
    id: FAM,
    name: 'Door',
    semver: '1.0.0',
    author: { id: 'usr_pryzm_starter', displayName: 'PRYZM Starters' },
    description: 'A simple single-leaf door with parametric width, height and leaf thickness.',
    ifcEntity: 'IfcDoor',
    category: 'Door',
    tags: ['starter'],
    minPRYZMVersion: '2.0.0',
    schemaHash: PLACEHOLDER_SCHEMA_HASH,
    createdAt: SEED_TS,
    lastModifiedAt: SEED_TS,
  };

  return { key: 'door', manifest, document };
}

/* ------------------------------------------------------------------ */
/* Seed 3 — a PARAMETRIC PANEL (a simple box).                          */
/* ------------------------------------------------------------------ */
function buildPanel() {
  const HOST = planeId();
  const PROF = profId();
  const P_WIDTH = parId();
  const P_HEIGHT = parId();
  const P_DEPTH = parId();
  const TYPE = typId();
  const FAM = famId();

  const document = {
    formatVersion: '1.1',
    referencePlanes: [
      { id: HOST, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: P_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 600, expression: null, ifcMapping: null, exposed: true },
      { id: P_HEIGHT, name: 'Height', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
      { id: P_DEPTH, name: 'Depth', kind: 'instance', dataType: 'length', defaultValue: 18, expression: null, ifcMapping: null, exposed: true },
    ],
    profiles: [makeRectProfile(PROF, 'PanelFace', HOST, 0.6, 1.2)],
    solids: [
      { id: solId(), kind: 'extrude', profileId: PROF, materialSlotId: null, lod: { coarse: false, medium: true, fine: true }, lengthExpression: 'Depth', direction: { x: 0, y: 1, z: 0 } },
    ],
    materialSlots: [],
    types: [{ id: TYPE, name: 'Standard', values: {}, checksum: EMPTY_VALUES_CHECKSUM }],
    representations: [],
    connectors: [],
    propertySets: [],
    featureEdges: [],
  };

  const manifest = {
    formatVersion: '1.1',
    id: FAM,
    name: 'Panel',
    semver: '1.0.0',
    author: { id: 'usr_pryzm_starter', displayName: 'PRYZM Starters' },
    description: 'A simple parametric panel — width, height and depth.',
    ifcEntity: 'IfcBuildingElementProxy',
    category: 'Generic',
    tags: ['starter'],
    minPRYZMVersion: '2.0.0',
    schemaHash: PLACEHOLDER_SCHEMA_HASH,
    createdAt: SEED_TS,
    lastModifiedAt: SEED_TS,
  };

  return { key: 'panel', manifest, document };
}

/**
 * The three starter component definitions, minted ONCE at module load (so the
 * ids are stable for the life of the process and identical in the server and in
 * the tests). Order is Window, Door, Panel.
 * @type {ReadonlyArray<{ key: string; manifest: any; document: any }>}
 */
export const STARTER_COMPONENT_DEFINITIONS = Object.freeze([
  buildWindow(),
  buildDoor(),
  buildPanel(),
]);

/** Convenience: the starter component ids, by key. */
export const STARTER_COMPONENT_IDS = Object.freeze(
  Object.fromEntries(STARTER_COMPONENT_DEFINITIONS.map((d) => [d.key, d.manifest.id])),
);

/* ------------------------------------------------------------------ */
/* Signing — one ephemeral Ed25519 key per process.                    */
/*                                                                     */
/* The seeds are "signed" per the lane brief. The load path does not   */
/* VERIFY a signature (only the publish POST does, which these seeds    */
/* bypass), so a per-process key is sufficient: the bytes are          */
/* internally consistent within a process, which is all the marketplace */
/* download and the falsification restore require. If a runtime lacks   */
/* Ed25519 in WebCrypto, we fall back to unsigned — still a valid       */
/* `.pryzm-family`.                                                     */
/* ------------------------------------------------------------------ */
let _signingKeyPromise = null;
async function getSigningKey() {
  if (_signingKeyPromise === null) {
    _signingKeyPromise = (async () => {
      try {
        const subtle = globalThis.crypto?.subtle;
        if (!subtle) return null;
        const pair = await subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
        return pair.privateKey;
      } catch {
        return null; // Ed25519 unavailable → unsigned but valid.
      }
    })();
  }
  return _signingKeyPromise;
}

/**
 * Pack one starter definition into signed `.pryzm-family` bytes via the ONE
 * packer. Throws if packFamily refuses (a malformed seed must fail loudly).
 * @param {{ manifest: any; document: any }} def
 * @returns {Promise<Uint8Array>}
 */
export async function packStarterComponent(def) {
  const signingKey = await getSigningKey();
  const input = { manifest: def.manifest, document: def.document };
  if (signingKey) input.signingKey = signingKey;
  const packed = await packFamily(input);
  if (!packed.ok) {
    throw new Error(`[familySeeds] packFamily refused seed "${def.manifest.name}": ${packed.reason} — ${packed.message}`);
  }
  return packed.bytes;
}

/**
 * Build the marketplace-store records for the three starters: pack each through
 * the ONE packer, then unpack to recover the stamped manifest, the projected
 * ifc-mapping and the schema hash exactly as they sit in the bytes.  Memoised so
 * repeated seeding is cheap and the bytes are stable within the process.
 * @returns {Promise<ReadonlyArray<{ id: string; semver: string; manifest: any; document: any; ifcMapping: any; schemaHash: string; publishedAt: string; bytes: Uint8Array }>>}
 */
let _recordsPromise = null;
export function buildStarterFamilyRecords() {
  if (_recordsPromise === null) {
    _recordsPromise = (async () => {
      const out = [];
      for (const def of STARTER_COMPONENT_DEFINITIONS) {
        const bytes = await packStarterComponent(def);
        const unpacked = await unpackFamily({ bytes, verifySchemaHash: true });
        if (!unpacked.ok) {
          throw new Error(`[familySeeds] unpack refused seed "${def.manifest.name}": ${unpacked.reason} — ${unpacked.message}`);
        }
        out.push({
          id: unpacked.manifest.id,
          semver: unpacked.manifest.semver,
          manifest: unpacked.manifest,
          document: unpacked.document,
          ifcMapping: unpacked.ifcMapping,
          schemaHash: unpacked.schemaHash,
          publishedAt: SEED_TS,
          bytes,
        });
      }
      return out;
    })();
  }
  return _recordsPromise;
}
