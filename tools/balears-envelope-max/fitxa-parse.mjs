/**
 * THE FITXA PARSER — and the validity rules that turn a printed row into a
 * number an envelope may actually be built from.
 *
 * ⛔ POPULATED IS NOT PRESENT, AND PRESENT IS NOT VALID. Three states are kept
 * distinct at every step and never collapsed:
 *      ABSENT          no such row in the fitxa
 *      PRESENT_EMPTY   the row exists, the number is deferred elsewhere
 *      PRESENT         a number is printed  →  then, separately, VALID / SUSPECT
 *
 * ── WHY A PIPE PARSER AND NOT A REGEX OVER THE PAGE ─────────────────────────
 * The fitxa is a table. Flattened on tag boundaries it is:
 *
 *   |PARAMETRE D'EDIFICACIÓ|NP: Nombre de plantes |--> |3 |plantes |Un règim…|
 *
 * ⭐ TWO STRUCTURAL FACTS MAKE THIS SAFE, AND BOTH WERE PAID FOR ALREADY:
 *  1. PARAMETER codes are BARE (`NP:`, `O:`, `E:`). USE-CLASS codes are always
 *     GROUP-PREFIXED WITH A HYPHEN (`TU-AT:`, `EQ-RL:`, `TE-CO:`). The earlier
 *     probe's page-wide regex could match a use row and report it as geometry —
 *     `AT` is *Allotjament turístic*, `RL` is *Religiós*. Requiring a cell to
 *     BEGIN with an unhyphenated code removes that collision by construction
 *     rather than by an end-of-parameters heuristic.
 *  2. ⭐ UNITS ARE THEIR OWN CELL. `O: Ocupació màxima |--> |80 |% ` versus
 *     `O: … |--> |200 |m2 `. Occupation is published BOTH as a percentage AND
 *     as an absolute m² footprint, and those are different quantities. A parser
 *     that reads only the number silently mixes them.
 */

/** Flatten HTML to the table's cell sequence. */
/** Cell delimiter: U+0001, a control char that cannot occur in fitxa text. */
const CELL = String.fromCharCode(1);

export function cells(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, CELL) // ⭐ a tag boundary IS a cell boundary
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(CELL)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}

const SECTION_RE = /^(PARAMETRE|PARÀMETRE|ALTRES PAR|ÚS |US |DADES DE|Observacions|Denominació)/i;
const CODE_RE = /^([A-ZÀÈÉÍÒÓÚÇ]{1,4}):\s*(.*)$/; // bare code, no hyphen group
const REGIM_RE = /^(Sense r[eè]gims|Un r[eè]gim|Dos r[eè]gims|Tres r[eè]gims|\d+\s+r[eè]gims)/i;

/**
 * Does a parameter ROW start at cell `j`? A row is `CODE: label` optionally
 * followed by the municipal-denomination cell, then the `-->` value marker.
 */
function rowStartsAt(cs, j) {
  if (!CODE_RE.test(cs[j])) return false;
  for (let k = j + 1; k <= j + 3 && k < cs.length; k++) {
    if (cs[k] === '-->') return true;
    if (CODE_RE.test(cs[k]) || SECTION_RE.test(cs[k])) return false;
  }
  return false;
}

/**
 * Parse the parameter rows. Returns { rows: {CODE: {value, units, regim}}, … }.
 */
export function parseFitxa(html) {
  const cs = cells(html);
  const out = { rows: {}, articleRefsAll: [], identitat: null, codiMuib: null, municipi: null };

  const idIdx = cs.findIndex((c) => /^id entitat:/i.test(c));
  if (idIdx >= 0) out.identitat = cs[idIdx].replace(/^id entitat:\s*/i, '').trim();
  const muniIdx = cs.findIndex((c) => /^Municipi de:/i.test(c));
  if (muniIdx >= 0) out.municipi = (cs[muniIdx + 1] || '').trim();
  const cmIdx = cs.findIndex((c) => /^Codi MUIB:/i.test(c));
  if (cmIdx >= 0) out.codiMuib = (cs[cmIdx + 1] || '').trim();

  // ⛔ BOUND THE SCAN TO THE PARAMETER REGION AT BOTH ENDS.
  //
  // Above it sits the DADES DE L'ENTITAT block, which opens with the zone
  // header `<CODIMUIB>: <name>` — and for a top-level zone that header is a
  // BARE TWO-LETTER CODE: `TU: Turístic`, `IN: Industrial`, `TE: Terciari`.
  // Those look exactly like parameter rows. (Manacor hid this: its header is
  // `RE_NA: Nucli antic`, and the underscore made it not match.) Starting the
  // scan at the first `PARAMETRE …` section header removes them.
  //
  // Below it sits the use matrix, from the first `ÚS <SECTION>` header, plus
  // the municipality's free-form `ALTRES PARÀMETRES NO NORMALITZATS` block,
  // which is not the normalised dictionary and is not read as one.
  let start = cs.findIndex((c) => /^PAR[AÀ]METRES?\b/i.test(c) && !/^ALTRES/i.test(c));
  if (start < 0) {
    const hdr = cs.findIndex((c) => /^R[eè]gim espec[íi]fic$/i.test(c));
    start = hdr >= 0 ? hdr + 1 : 0;
  }
  let end = cs.findIndex((c, i) => i > start && (/^(ÚS|US)\s+[A-ZÀ-Ú]/.test(c) || /^ALTRES PAR[AÀ]METRES/i.test(c)));
  if (end < 0) end = cs.length;
  out.regionStart = start;
  out.regionEnd = end;
  const region = cs.slice(start, end);
  const fullText = cs.join(' ');

  out.articleRefsAll = [
    ...new Set((fullText.match(/[Aa]rticles?\s+\d+(?:\.\d+)*(?:\.[a-z])?/g) || []).map((s) => s.trim())),
  ];

  // ⛔ SELF-DIAGNOSIS. A parser failure and a data absence look identical in the
  // output, so the parser counts the code cells it saw but could NOT read. A
  // non-zero miss count invalidates the run rather than quietly deflating it.
  out.codeCellsSeen = 0;
  out.codeCellsUnparsed = [];

  for (let i = 0; i < region.length; i++) {
    const m = region[i].match(CODE_RE);
    if (!m) continue;
    out.codeCellsSeen++;
    // ⭐ THE VALUE MARKER IS NOT ALWAYS THE NEXT CELL. The fitxa has a
    // "Denominació municipal" column between the MUIB label and the value, and
    // it is populated for some municipalities and empty for others — an empty
    // cell disappears in the flatten, a populated one does not. A parser that
    // demanded `-->` immediately after the code silently reported EVERY fitxa
    // from a municipality that fills that column as having NO PARAMETERS.
    // Measured on identitat=280990 (Alcúdia RE_NA_VE): the row is
    //   |T: Tipus d’ordenació |Tipologia |--> |VE: Volumetria específica |
    let arrow = -1;
    for (let k = i + 1; k <= i + 3 && k < region.length; k++) {
      if (region[k] === '-->') { arrow = k; break; }
      if (CODE_RE.test(region[k]) || SECTION_RE.test(region[k])) break;
    }
    if (arrow < 0) { out.codeCellsUnparsed.push(region[i].slice(0, 60)); continue; }
    const code = m[1];
    const label = [m[2], ...region.slice(i + 1, arrow)].filter(Boolean).join(' | ');
    // Collect cells until the next ROW START or a section header. The row-start
    // test uses the same arrow lookahead, otherwise a following row whose
    // municipal-denomination cell is populated is not recognised as a boundary
    // and its cells are swallowed into this row's units/règim.
    const payload = [];
    let j = arrow + 1;
    for (; j < region.length; j++) {
      const c = region[j];
      if (SECTION_RE.test(c)) break;
      if (rowStartsAt(region, j)) break;
      payload.push(c);
    }
    // ⛔ Skip the consumed cells. A VALUE can itself look like a code
    // (`T: … --> VE: Volumetria específica`), and re-scanning it would both
    // inflate codeCellsSeen and raise a false parse-miss.
    i = j - 1;
    const value = payload[0] ?? '';
    let units = null;
    let regimFrom = 1;
    if (payload[1] !== undefined && !REGIM_RE.test(payload[1])) {
      units = payload[1];
      regimFrom = 2;
    }
    const regim = payload.slice(regimFrom).join(' ');
    const arts = [
      ...new Set(((value + ' ' + regim).match(/[Aa]rticles?\s+\d+(?:\.\d+)*(?:\.[a-z])?/g) || []).map((s) => s.trim())),
    ];
    // First occurrence wins; later duplicate codes are recorded but not used.
    if (out.rows[code]) { (out.rows[code].duplicates ||= []).push({ value, units }); continue; }
    out.rows[code] = { label, value, units, regim: regim.slice(0, 400), articleRefs: arts };
  }
  out.deferredToPlanols = /segons\s+(els\s+)?pl[àa]nols/i.test(fullText);
  return out;
}

// ── VALIDITY ────────────────────────────────────────────────────────────────
// ⚠ `0` and `100` have BOTH been used as null substitutes in this dataset
// (`DFIVIGEN` is 100 % non-null with the single value 99999999). A number is
// therefore not accepted merely because it parses.

const num = (s) => {
  if (s == null) return null;
  const m = String(s).trim().match(/^(-?\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
};

const PCT_UNIT = /^(%|percentatge)/i;
const M2_UNIT = /(m2|m²)/i;
const M_UNIT = /^m\b|^metres|^m$/i;

/**
 * Classify one parameter into { status, value, units, verdict, why }.
 *   status : ABSENT | PRESENT_EMPTY | PRESENT
 *   verdict: VALID | SUSPECT | UNUSABLE   (only when status === PRESENT)
 */
export function classify(code, row) {
  if (!row) return { status: 'ABSENT' };
  const v = num(row.value);
  const u = row.units || '';
  const base = { units: u, raw: String(row.value).slice(0, 60), rawUnits: u.slice(0, 30), articleRefs: row.articleRefs || [] };
  if (v === null) {
    // Tipus d'ordenació is categorical: text IS the value.
    if (code === 'T') {
      return row.value
        ? { status: 'PRESENT', verdict: 'VALID', kind: 'TEXT', value: row.value.slice(0, 60), ...base }
        : { status: 'PRESENT_EMPTY', ...base };
    }
    return { status: 'PRESENT_EMPTY', ...base };
  }
  if (v === 99999999 || v === 9999999 || v === 999999) {
    return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'sentinel null-substitute', value: v, ...base };
  }

  switch (code) {
    case 'NP': {
      if (v < 1 || v > 60) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'storeys out of range', value: v, ...base };
      return { status: 'PRESENT', verdict: 'VALID', kind: 'STOREYS', value: v, ...base };
    }
    case 'HR':
    case 'HT': {
      if (v <= 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'zero/negative height', value: v, ...base };
      if (v < 2.5) return { status: 'PRESENT', verdict: 'SUSPECT', why: 'height < 2.5 m', value: v, ...base };
      if (v > 200) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'height > 200 m', value: v, ...base };
      return { status: 'PRESENT', verdict: 'VALID', kind: 'METRES', value: v, ...base };
    }
    case 'O': {
      // ⭐ THE UNIT DECIDES WHAT THIS NUMBER IS.
      if (PCT_UNIT.test(u)) {
        if (v <= 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'occupation 0 % — null substitute or unbuildable', value: v, ...base };
        if (v > 100) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'occupation > 100 %', value: v, ...base };
        if (v === 100) return { status: 'PRESENT', verdict: 'SUSPECT', kind: 'PERCENT', why: 'occupation exactly 100 % — a null substitute in this dataset, and a contradiction where a setback is also published', value: v, ...base };
        return { status: 'PRESENT', verdict: 'VALID', kind: 'PERCENT', value: v, ...base };
      }
      if (M2_UNIT.test(u)) {
        if (v <= 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'occupation area 0', value: v, ...base };
        return { status: 'PRESENT', verdict: 'VALID', kind: 'ABSOLUTE_M2', value: v, ...base };
      }
      return { status: 'PRESENT', verdict: 'SUSPECT', kind: 'UNKNOWN_UNIT', why: `occupation with unrecognised unit "${u}"`, value: v, ...base };
    }
    case 'E': {
      if (v <= 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'FAR 0', value: v, ...base };
      // Two unit families: a ratio (m²/m²) and an absolute ceiling (m²).
      if (/superf|m2\s*\/\s*m2|m²\s*\/\s*m²|m2 edific/i.test(u) && !/^m2$|^m²$/i.test(u.trim())) {
        if (v > 20) return { status: 'PRESENT', verdict: 'SUSPECT', kind: 'RATIO', why: 'FAR > 20', value: v, ...base };
        return { status: 'PRESENT', verdict: 'VALID', kind: 'RATIO', value: v, ...base };
      }
      if (/^m2$|^m²$/i.test(u.trim())) return { status: 'PRESENT', verdict: 'VALID', kind: 'ABSOLUTE_M2', value: v, ...base };
      if (v > 0 && v <= 20) return { status: 'PRESENT', verdict: 'VALID', kind: 'RATIO', value: v, ...base };
      return { status: 'PRESENT', verdict: 'SUSPECT', kind: 'UNKNOWN_UNIT', why: `FAR with unrecognised unit "${u}"`, value: v, ...base };
    }
    case 'RA':
    case 'RF':
    case 'RM': {
      if (v < 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'negative setback', value: v, ...base };
      // ⛔ 0 IS AMBIGUOUS: legally "build to the boundary", or a null substitute.
      // It is NOT discarded and NOT trusted — it is its own class.
      if (v === 0) return { status: 'PRESENT', verdict: 'ZERO_AMBIGUOUS', kind: 'METRES', why: '0 m — build-to-boundary or null substitute; indistinguishable', value: v, ...base };
      if (v > 100) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'setback > 100 m', value: v, ...base };
      return { status: 'PRESENT', verdict: 'VALID', kind: 'METRES', value: v, ...base };
    }
    case 'PE': {
      if (v <= 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'buildable depth 0', value: v, ...base };
      if (v > 100) return { status: 'PRESENT', verdict: 'SUSPECT', why: 'depth > 100 m', value: v, ...base };
      return { status: 'PRESENT', verdict: 'VALID', kind: 'METRES', value: v, ...base };
    }
    case 'PM':
    case 'AM':
    case 'IRP':
    default: {
      if (v <= 0) return { status: 'PRESENT', verdict: 'UNUSABLE', why: 'non-positive', value: v, ...base };
      return { status: 'PRESENT', verdict: 'VALID', value: v, ...base };
    }
  }
}

export const ENVELOPE_CODES = ['NP', 'HR', 'HT', 'O', 'E', 'RA', 'RF', 'RM', 'PE', 'PM', 'AM', 'IRP', 'T'];

/**
 * Envelope-drawability verdict for one fitxa.
 *
 * ⛔ REQUIRING THREE-OF-THREE DISCARDS REAL ENVELOPES. Three tiers:
 *   COMPLETE          height + occupation + FAR, all VALID → the full solid
 *   PARTIAL_DRAWABLE  enough to draw a CONSERVATIVE solid:
 *                       height + occupation, or
 *                       height + at least one VALID setback, or
 *                       height + buildable depth
 *   NOT_DRAWABLE      anything less — notably FAR ALONE, which fixes floor
 *                     area but no footprint and no height, so it draws nothing
 */
export function drawability(P) {
  const ok = (c) => P[c] && P[c].status === 'PRESENT' && P[c].verdict === 'VALID';
  const okOrSuspect = (c) => P[c] && P[c].status === 'PRESENT' && (P[c].verdict === 'VALID' || P[c].verdict === 'SUSPECT');
  const heightStoreys = ok('NP');
  const heightMetres = ok('HR') || ok('HT');
  const height = heightStoreys || heightMetres;
  const occ = ok('O');
  const far = ok('E');
  const setbacks = ['RA', 'RF', 'RM'].filter(ok);
  const depth = ok('PE');

  let tier = 'NOT_DRAWABLE';
  const reasons = [];
  if (height && occ && far) { tier = 'COMPLETE'; reasons.push('height+occupation+FAR'); }
  else if (height && occ) { tier = 'PARTIAL_DRAWABLE'; reasons.push('height+occupation'); }
  else if (height && setbacks.length > 0) { tier = 'PARTIAL_DRAWABLE'; reasons.push(`height+${setbacks.length} setback(s)`); }
  else if (height && depth) { tier = 'PARTIAL_DRAWABLE'; reasons.push('height+buildable depth'); }
  else if (far && !height) { reasons.push('FAR alone — fixes floor area, fixes neither footprint nor height'); }
  else if (height) { reasons.push('height alone — no footprint constraint'); }
  else reasons.push('no height signal');

  return {
    tier,
    reasons,
    heightStoreys,
    heightMetres,
    heightAny: height,
    heightAnyIncludingSuspect: okOrSuspect('NP') || okOrSuspect('HR') || okOrSuspect('HT'),
    occupation: occ,
    occupationIncludingSuspect: okOrSuspect('O'),
    far,
    setbackCount: setbacks.length,
    setbacks,
    depth,
  };
}
