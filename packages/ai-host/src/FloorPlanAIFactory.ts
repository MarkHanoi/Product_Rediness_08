/**
 * @file FloorPlanAIFactory.ts
 * @description Multi-stage Claude API orchestration for PDF floor plan analysis.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer):
 *  - NEVER mutates stores. NEVER calls builders. NEVER calls commandManager.execute().
 *  - Returns structured analysis data — caller (FloorPlanCommandBatcher) creates proposals.
 *  - Uses same Cloudflare Worker proxy endpoint as AIElementFactory.
 *  - Four-stage strategy:
 *      Stage A  (Haiku)  — Preliminary door gap detection → DoorGapInpainter draws
 *                          dashed continuation lines in door gaps on the image.
 *      Stage B1 (Sonnet) — Walls & slab outline on the inpainted image (dashed lines
 *                          help Claude trace walls through door openings without gaps).
 *      Stage B2 (Sonnet) — Openings (doors/windows) using confirmed B1 wall IDs as context.
 *      Stage C  (Haiku)  — Optional: Furniture & plumbing fixtures (original image).
 *
 * PHASE C CHANGE (from PDF_TO_BIM_DEEP_AUDIT §14 Phase C):
 *  - analyseStructure() is now a two-step B1/B2 staged call instead of a single combined call.
 *  - B1 returns DetectedWall[] + DetectedSlabOutline.
 *  - B2 receives the confirmed wall list as plain-text context so Claude can reliably assign
 *    hostWallId without hallucinating wall IDs it never returned.
 *  - Public interface (analyse()) is UNCHANGED — FloorPlanImportPanel.ts is not affected.
 */

import { repairAndParseJSON } from './JSONRepair.js';
import { type DetectedLineSegment, formatSegmentsForPrompt } from './ImagePreprocessor.js';
import { type TextAnnotationItem } from '@pryzm/file-format';
import { DOOR_ANATOMY_DESCRIPTION } from './PdfToBimConstraints.js';
import { DoorGapInpainter, type PreliminaryDoorGap } from './DoorGapInpainter.js';
import { detectGeometricDoorGaps, type GeometricDoorGap } from './WallTerminatorDoorDetector.js';

// ── Analysis schema ────────────────────────────────────────────────────────────

export interface DetectedWall {
    id: string;
    startPx: { x: number; y: number };
    endPx: { x: number; y: number };
    thicknessPx: number;
    wallType: 'exterior' | 'interior' | 'unknown';
    confidence: 'high' | 'medium' | 'low';
}

export interface DetectedOpening {
    id: string;
    hostWallId: string;
    type: 'door' | 'window';
    centrePx: { x: number; y: number };
    widthPx: number;
    heightPx?: number;
    confidence: 'high' | 'medium' | 'low';
}

export interface DetectedFurniture {
    id: string;
    furnitureType: string;
    centrePx: { x: number; y: number };
    widthPx: number;
    depthPx: number;
    rotationDeg: number;
    room: string;
    confidence: 'high' | 'medium' | 'low';
}

export interface DetectedSlabOutline {
    polygonPx: Array<{ x: number; y: number }>;
    confidence: 'high' | 'medium' | 'low';
}

export interface FloorPlanAnalysis {
    walls: DetectedWall[];
    openings: DetectedOpening[];
    slab: DetectedSlabOutline | null;
    furniture: DetectedFurniture[];
    imageDimensions: { widthPx: number; heightPx: number };
}

export interface FloorPlanAnalysisOptions {
    base64Image: string;
    widthPx: number;
    heightPx: number;
    extractedText: string;
    includeStructure: boolean;
    includeFurniture: boolean;
    includePlumbing: boolean;
    includeSlab: boolean;
    /**
     * Phase F: Pre-detected line segments from F1 image preprocessing.
     * When present and >= F2_MIN_SEGMENTS, the guided B1 prompt is used instead
     * of the standard free-detection prompt — Claude classifies rather than detects.
     * Optional: omitting or passing an empty array silently falls back to Phase E behaviour.
     */
    detectedSegments?: DetectedLineSegment[];
    /**
     * Phase G: Text annotation items extracted from the PDF by pdf.js, with their
     * bounding boxes in image pixel coordinates.
     * Injected into the B1 user message as an annotation exclusion zone list so that
     * Claude does not trace room names, dimension labels, or area annotations as walls.
     * Optional: absent or empty array degrades gracefully (no exclusion zone block added).
     */
    textAnnotations?: TextAnnotationItem[];
}

// ── API endpoint (server proxy — same as AIElementFactory, see server.js §1.4) ──
// IMPORTANT: use the server-side proxy, NOT the CF Worker URL directly.
// Direct browser → CF Worker calls bypass server-side rate limiting and quota
// tracking, and cause 403 "Request not allowed" on consecutive calls (B1 then B2).
const WORKER_URL = '/api/anthropic/v1/messages';

// ── Stage A system prompt — preliminary door gap detection (pre-inpainting) ────
// This is a FAST, LIGHTWEIGHT call (Claude Haiku) that runs BEFORE Stage B1.
// Its ONLY job is to locate door gap positions and orientations so DoorGapInpainter
// can draw dashed continuation lines through those gaps BEFORE the wall-detection AI
// (Stage B1) analyses the image.
//
// By drawing dashed lines in door gaps before B1, we provide Claude's wall-detection
// model with a visual cue that a wall CONTINUES through that area — eliminating
// broken or missing wall segments at door openings.
//
// NOTE: Stage A does NOT need hostWallId — walls have not been detected yet.
// It only needs: centrePx, widthPx, wallAngleDeg.

const DOOR_GAP_PRELIM_SYSTEM_PROMPT = `You are an expert architectural floor plan analyser. Output ONLY valid JSON — zero prose, zero markdown, zero code fences.

Your task: locate ALL door gap positions in this floor plan image.

A door gap is the white space (break) between two wall stubs where a door is inserted.
You are NOT analysing swing arcs, door leaves, or swing directions. Only the GAP itself.

Output schema (STRICT — no extra fields):
{
  "doorGaps": [
    {
      "centrePx": { "x": number, "y": number },
      "widthPx": number,
      "wallAngleDeg": number
    }
  ]
}

HOW TO FIND A DOOR GAP:
1. Scan the image systematically for breaks in wall lines.
2. A break = a white void where a thick or thin wall line stops abruptly, then restarts
   further along the same line direction, with the void spanning a door-width gap.
3. At each edge of the break there is usually a small jamb thickening (a perpendicular stub).
4. centrePx = the exact midpoint of the gap, in pixel coordinates (x right, y down from top-left).
5. widthPx  = the pixel distance between the two jamb faces (= the gap width).
6. wallAngleDeg = the compass bearing of the hosting wall:
     - Wall runs horizontally (left–right): wallAngleDeg = 0
     - Wall runs vertically (up–down):      wallAngleDeg = 90
     - Wall runs diagonally:                estimate the angle 0–179°

RULES:
- Only report gaps where you can see two clear wall-stub endpoints flanking the void.
- Do NOT report: swing arcs, furniture curves, window openings, plumbing symbols, stair curves.
- A window gap is typically narrower and bounded by glazing lines — skip windows, report ONLY door gaps.
- If you see a swing arc nearby, that confirms a door gap exists — use it to identify the gap, but
  report the GAP location and width, NOT the arc position.
- Minimum widthPx: 8 px. Maximum widthPx: 25% of image width.
- Maximum 40 door gaps.
- Return ONLY the JSON object. No explanation. No text after the closing brace.`;

// ── Stage B1 system prompt — walls and slab ONLY ───────────────────────────────
// Intentionally omits openings to prevent Claude from hallucinating wall IDs
// across both sections in a single combined response.

const STRUCTURE_B1_SYSTEM_PROMPT = `You are an expert architectural floor plan analyser. Output ONLY valid JSON — zero prose, zero markdown, zero code fences.

Your task: analyse the architectural floor plan image and identify ALL walls (exterior and interior) AND the overall slab (floor) outline.

Output schema (STRICT — no extra fields):
{
  "walls": [
    {
      "id": "w1",
      "startPx": { "x": number, "y": number },
      "endPx": { "x": number, "y": number },
      "thicknessPx": number,
      "wallType": "exterior" | "interior" | "unknown",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "slab": {
    "polygonPx": [{ "x": number, "y": number }],
    "confidence": "high" | "medium" | "low"
  }
}

ANNOTATION EXCLUSION — APPLY FIRST (highest priority):
These visual elements are NEVER walls. If something matches ANY description below, skip it entirely — do NOT report it.
- ROOM NAME LABELS: text strings placed inside room spaces identifying the room (e.g. "BEDROOM", "LIVING ROOM", "SALA", "COCINA", "WC", "BAGNO", "CHAMBRE", room numbers like "101", area labels like "14.5m²"). These are typeset characters — even if they form a visually straight dark line, they are annotation, NOT a wall. A key signal: letters have irregular pixel density and spacing between characters.
- DIMENSION LINES: thin lines with arrowheads, tick marks, or slash marks at both endpoints, running parallel to a wall face at a small offset (typically outside the wall or in the whitespace between walls and the page margin). They often have a numeric measurement value alongside them. They are NEVER walls even if they run the full length of a wall face.
- HATCHING / FILL: diagonal or cross-hatch lines inside the body of an exterior wall (the material fill between the two parallel faces). These are decorative fill, not centrelines.
- GRID LINES / AXIS LINES: thin lines running the full width or height of the plan, usually labelled with letters or numbers at both ends (A, B, C... or 1, 2, 3...). These are reference grid lines, not walls.
- NORTH ARROW, SCALE BAR, TITLE BLOCK BORDER: graphical annotations in the margin/legend area.
- TEXT UNDERLINES / BASELINES: a faint line coinciding with the baseline of a text label is from the typeface, not a wall.
- FURNITURE EDGES: outlines of furniture symbols (beds, tables, sofas) are not walls.

WALL RULES (apply after annotation exclusion):
- ALL pixel coordinates are from the TOP-LEFT corner of the image (x increases right, y increases down).
- You MUST detect ALL walls — both the FULL PERIMETER of exterior walls (thick hatched lines forming the outer boundary) AND all interior partition walls. Missing perimeter walls is a critical error.
- Report each wall as a single straight LINE SEGMENT along the CENTRELINE of the wall. The centreline runs midway between the two parallel faces.
- Exterior walls appear as thick double lines with hatching/fill between them — use the centreline, not the face.
- Interior walls appear as thinner single or double lines. Use their centreline.
- A wall MUST connect to at least one other wall at each endpoint (T-junction, corner, or L-junction). A segment floating in open space with no connections at either end is almost certainly an annotation or furniture edge — mark it confidence="low" only if you are absolutely certain it is a structural element.
- Break segments at every junction, T-intersection, corner, or opening gap — do NOT make one long segment spanning multiple junctions.
- Merge only truly collinear, gap-free, coaxial wall segments into a single wall.
- Corner endpoints MUST match exactly: two walls meeting at a corner share the same endpoint pixel coordinates.
- Scan systematically: start from the exterior perimeter, then trace each interior partition in sequence.
- Limit: maximum 100 wall segments.

CRITICAL — ONE CENTRELINE PER WALL (no face-line duplicates):
An exterior wall drawn as two parallel lines with hatching between them is ONE wall.
Report it as ONE segment along the CENTRELINE (midway between the two parallel lines).
DO NOT report the inner face line as one wall AND the outer face line as another wall.
DO NOT report both faces. Report the centreline ONLY — one segment per physical wall.
If you find yourself reporting two nearly-parallel segments less than 50cm apart that run
along the same path, you are reporting both faces of one wall. Delete one — keep only the centreline.
This applies to ALL walls: exterior perimeter walls, interior partitions, and short return walls.

WALL TYPE CLASSIFICATION — read carefully:
- A wall is EXTERIOR if it forms part of the building perimeter boundary AND has thick double lines with hatching/fill between them. ALL perimeter walls are exterior — even short return walls, step-ins, recesses, and notches in the building outline. A short wall that connects two exterior walls and forms part of the outer boundary IS exterior, not interior.
- A wall is INTERIOR only if it is fully enclosed inside the building perimeter on both sides.
- When in doubt between exterior and interior: if one side of the wall faces outside air or the building boundary, classify it as EXTERIOR.

CRITICAL — WALL ENDPOINT POSITIONING:
When two walls meet at a T-junction or corner, the endpoint of the terminating wall MUST be reported at the CENTRELINE INTERSECTION — the exact pixel where the centreline of the terminating wall crosses the centreline of the host wall.

DO NOT report the endpoint at:
  - The outer face of the host wall
  - The inner face of the host wall
  - Any point outside the host wall body

The endpoint must be INSIDE the body of the host wall, on its centreline.

Example: A horizontal partition meeting a vertical spine wall → the horizontal wall's endpoint pixel x-coordinate must equal the spine wall's centreline x-coordinate. Not the spine's left face, not the spine's right face — the centreline midpoint between the two faces.

Failing to do this creates disconnected walls in the BIM model and breaks door placement. This is the most critical endpoint rule in this entire prompt.

CORRIDOR SPINE WALLS — CRITICAL (most commonly missed element):
A corridor is formed by two parallel spine walls with room partition walls connecting them at regular intervals (like rungs of a ladder). Each spine wall segment BETWEEN two consecutive partition connections is a SEPARATE wall entry.

HOW TO IDENTIFY AND BREAK CORRIDOR SPINE WALLS:
  1. Find the two long parallel walls that form the corridor boundary (the "spines").
  2. Find every point where a transverse (perpendicular) wall meets a spine wall.
     These transverse walls are the room partitions — they connect the two spine walls.
  3. Each meeting point is a T-JUNCTION. The spine wall MUST be split at each T-junction.
  4. For a spine wall with N partition junctions, report N+1 separate wall segments.
     Each segment has endpoints at two consecutive T-junction positions.
  5. The endpoint pixel coordinates of each sub-segment MUST match the centreline
     of the connecting partition wall (not the face — the centreline midpoint).

DOOR GAPS IN CORRIDOR SPINE WALLS:
  A door in a corridor spine wall appears as a white break in the spine between two
  partition junction points. The spine wall IS CONTINUOUS through the door location
  (the gap is the architectural opening, not a missing segment). Because Stage A has
  already inpainted a dashed continuation line through those gaps, you should see the
  spine wall as unbroken. Report the sub-segment from the partition junction on one
  side of the door to the partition junction on the other side — the door opening will
  be cut into that sub-segment later. Do NOT further split at the door gap itself.

MISSING SPINE SEGMENTS = MISSING DOORS:
  If you report only some sub-segments (e.g., you report the spine above and below a
  door section but skip the sub-segment containing the door), the BIM model cannot
  place any door in that section. Every sub-segment must be reported, including short
  ones containing a door or window. Maximum length per sub-segment: one room bay.

SLAB RULES:
- Trace the outermost boundary of the entire floor plan using the OUTER FACE of exterior walls.
- Use one polygon point per corner (typically 6–20 points).
- If the outline cannot be determined reliably, set "slab" to null.

GENERAL:
- "high" = absolutely certain this is a structural wall, "medium" = likely, "low" = uncertain.
- Return ONLY the JSON object. No explanation, no markdown, no text after the closing brace.`;

/**
 * Minimum number of pre-detected segments required to activate Phase F2 guided mode.
 * Below this threshold the pipeline falls back to the standard Phase E free-detection prompt.
 */
const F2_MIN_SEGMENTS = 8;

// ── Stage B1 guided system prompt — Phase F2: classify pre-detected segments ──
// Used when ImagePreprocessor (Phase F1) has found enough line segments.
// Claude's task shifts from "detect geometry" to "classify geometry" — a much
// easier problem that produces more accurate and deterministic results.

const STRUCTURE_B1_GUIDED_SYSTEM_PROMPT = `You are an expert architectural floor plan analyser. Output ONLY valid JSON — zero prose, zero markdown, zero code fences.

Your task: algorithmically detected line segments are listed in the user message. Review each segment against the floor plan image and classify it.

Output schema (STRICT — no extra fields, same as standard mode):
{
  "walls": [
    {
      "id": "w1",
      "startPx": { "x": number, "y": number },
      "endPx": { "x": number, "y": number },
      "thicknessPx": number,
      "wallType": "exterior" | "interior" | "unknown",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "slab": {
    "polygonPx": [{ "x": number, "y": number }],
    "confidence": "high" | "medium" | "low"
  }
}

ANNOTATION EXCLUSION — REJECT any segment matching these descriptions (highest priority — apply before classification):
- ROOM NAME LABELS: the segment overlaps a text label inside a room (room names like "BEDROOM", "SALA", "WC", "LIVING", room numbers, area annotations like "14.5m²"). Text creates dark pixel runs that the algorithm may detect — visually verify the segment region in the image. Letters have irregular spacing between characters, unlike a continuous wall line.
- DIMENSION LINES: segment is thin, runs parallel to a wall face at a small offset with tick/arrow marks at endpoints and a nearby numeric value. Always REJECT.
- HATCHING LINES: segment lies within the body of an exterior wall (between its two faces) and is diagonal — this is wall fill, not the centreline. REJECT.
- GRID / AXIS LINES: segment spans the full plan width/height and is labelled at both ends. REJECT.
- TEXT BASELINES / UNDERLINES: very thin segment coinciding exactly with the baseline row of printed text. REJECT.
- FURNITURE OUTLINES: segment traces the boundary of a furniture symbol. REJECT.

CLASSIFICATION RULES — apply after annotation exclusion:
- ACCEPT as wall if the segment clearly corresponds to a structural or partition wall line in the image.
- Exterior walls: thick lines (or parallel double lines with hatching fill) forming the building perimeter. Accept if clearly exterior structure.
- Interior walls: thinner lines inside the perimeter — accept only if clearly structural and connecting to other walls or the perimeter.
- A segment that floats in open room space with no visible wall connection at either endpoint is almost certainly an annotation — REJECT unless absolutely certain it is structural.
- For ACCEPTED segments: use the provided startPx/endPx as the wall centreline. You may nudge coordinates by up to 5px to snap to the true visual centreline.
- thicknessPx: use the provided thickness value. Adjust if the image shows a clearly different thickness.
- Do NOT add walls not represented by a provided segment — output must be grounded in the segment list.
- If a wall is clearly present in the image but missing from the segment list, you may add up to 5 extra walls (mark confidence="low").

SLAB RULES:
- Trace the outermost boundary from the OUTER FACE of accepted exterior wall segments.
- If the outline cannot be reliably determined, set "slab" to null.

GENERAL:
- "high" = absolutely certain this segment is a structural wall, "medium" = likely, "low" = uncertain.
- Assign sequential IDs starting from w1 regardless of the segment ID in the input.
- Return ONLY the JSON object. No explanation, no markdown, no text after the closing brace.`;

// ── Stage B2 system prompt — openings ONLY, wall context injected at call time ──
// Wall IDs are provided as grounded context in the user message so Claude does
// not need to remember them from a previous JSON structure. This dramatically
// reduces hostWallId hallucination (audit Phase C).
//
// DOOR-DETECTION FIX (Root Cause 1): The prompt now gives a precise, anatomy-based
// description of the door symbol so Claude reports centrePx at the wall-gap midpoint
// (ON the wall centreline) rather than the visual centroid of the arc assembly.
// widthPx is explicitly defined as the gap width (= door leaf length = arc radius),
// NOT the bounding-box width of the whole swing symbol.

const STRUCTURE_B2_SYSTEM_PROMPT = `You are an expert architectural floor plan analyser. Output ONLY valid JSON — zero prose, zero markdown, zero code fences.

Your task: identify ALL doors and windows in the floor plan image. A confirmed wall list is provided — you MUST use ONLY those exact wall IDs for the hostWallId field.

Output schema (STRICT — no extra fields):
{
  "openings": [
    {
      "id": "o1",
      "hostWallId": "w1",
      "type": "door" | "window",
      "centrePx": { "x": number, "y": number },
      "widthPx": number,
      "confidence": "high" | "medium" | "low"
    }
  ]
}

FUNDAMENTAL RULE — GAP FIRST (apply before anything else):
A door or window can ONLY exist where there is a visible BREAK (gap) in the wall lines.
Scan each wall for gaps FIRST. If you cannot see a break in the wall — do not report an opening.
The swing arc or glazing lines are secondary confirmation only — they CANNOT exist without a gap.

CRITICAL — A DOOR REQUIRES A WALL:
Before reporting any door, verify the hostWallId exists in the confirmed wall list above.
If the arc you see is in an area where NO wall is listed in the confirmed wall context,
you MUST NOT report a door there. The arc may be a plumbing fixture, furniture, or annotation.
A door floating in space with no host wall = do NOT report it.
Only report doors on walls that are explicitly listed in the confirmed wall context.

${DOOR_ANATOMY_DESCRIPTION}

SCANNING STRATEGY — per wall, strictly:
  For EACH wall in the confirmed list, in order:
    1. Locate the wall segment in the image using the pixel coordinates provided.
    2. Visually scan ONLY along that wall segment for a break in the wall lines.
    3. A break = white space between two wall stubs where the wall line stops and restarts.
    4. If you see a break: check for a swing arc originating from one side of that break.
    5. If arc present → door. If parallel glazing lines present → window. If neither → archway.
    6. If NO break visible along the wall → report NOTHING for this wall. Move to next wall.

  NEVER work backwards from an arc to find a wall.
  NEVER report an opening on a wall just because an arc is nearby in the image.
  The break in the wall is the ONLY valid starting point.

ANTI-FALSE-POSITIVE EXCLUSIONS — never report these as openings:
- Toilet D-shapes, bathtub curves, sink outlines — plumbing fixtures, NOT doors.
- Staircase arcs / curved risers — stair nosing lines, NOT doors.
- Rounded room corners — corner fillet, NOT a window.
- Dimension arcs / radius annotations — drawing annotation, NOT a door.
- Hatching or cross-hatch fill inside wall bodies — material fill, NOT an opening.
- Furniture edges (beds, tables, sofas, wardrobes) — NOT walls and NOT openings.
- Threshold marks / floor level change lines — dashed or solid lines running ACROSS a
  corridor or junction parallel to a wall. These mark floor finish boundaries. A real door
  always has a swing arc attached to it. If there is NO arc — it is NOT a door.
- Corner wall details — thick L-shaped or U-shaped wall corners have NO gap and NO arc.
  Do not report the junction of two exterior walls as a door.
- Window glazing lines WITHOUT a swing arc — if you see parallel lines crossing a wall gap but NO arc sweeping into the room, this is a WINDOW, NOT a door. Never report a door where there is no swing arc visible. Glazing lines alone (even crossing the wall thickness) = window only.

WINDOW RULES — STRICT:
- A window ONLY exists where there is a visible BREAK or INTERRUPTION in the wall hatching
  at a specific location, AND 2–4 closely-spaced parallel glazing lines cross the wall
  thickness at that exact location.
- If the hatching runs continuously with no visible interruption at any point → NO window.
- A gap with NO glazing lines = archway or door, NOT a window.
- Maximum 3 windows per individual wall segment. If you find more than 3 on one wall,
  report only the 3 with the clearest gap + glazing evidence.
- Windows are almost always on exterior walls (thick hatched double lines). Interior
  partition windows are rare — only report if gap + glazing lines are absolutely clear.

CORRIDOR DOORS — SPECIAL CASE (very common, often missed):
Corridor doors sit on a spine wall (the long wall forming one side of a corridor).
The door gap in a corridor spine wall is FLANKED BY TWO TRANSVERSE WALLS (room
partitions) — one partition connects the spine wall on each side of the door gap.

How to identify a corridor door:
  1. Locate the spine wall (a long interior wall with multiple partition walls meeting it).
  2. Between two consecutive partition T-junctions on the spine, look for a white break.
  3. At each edge of the break you will see the end of a partition wall (the door jamb).
  4. A swing arc curves into the corridor (or into the room) from one of those jambs.
  5. centrePx = midpoint between the two partition endpoints flanking the gap.
  6. hostWallId = the spine wall sub-segment that runs between those two partitions.

IMPORTANT: even if the spine wall sub-segment appears very short (just the width of one
door bay), it IS a valid wall. Assign the door to that sub-segment. Do not assign it
to an adjacent longer sub-segment or to one of the transverse partitions.

If a geometric door gap centre has been provided (see list above), and you see a swing
arc near that location on a spine wall, CONFIRM it as a corridor door using the provided
centrePx. The hostWallId = the spine wall whose centreline passes through that centrePx.

DASHED ARC DOORS:
- A dashed swing arc indicates a door below the cutting plane (e.g. an external door,
  cellar hatch, or door on a lower level). Treat the same as a solid arc door.
- Find the wall gap first, then confirm the dashed arc swings from one jamb.
- Report with confidence="medium" unless the gap is also very clearly visible.

DOUBLE-SWING DOORS:
When two quarter-circle arcs meet symmetrically at a wall gap — one arc swinging to each side — this is ONE double-swing door. Rules:
  - Report as a SINGLE opening with type="door"
  - centrePx = midpoint of the full gap (between the two outer jambs)
  - widthPx = full gap width spanning both leaves
  - confidence = "high" if both arcs and both jambs are clearly visible
Do NOT report two separate openings. The deduplication logic will not catch this reliably if the two centres are far apart — you must report it as one from the start.

OPENING RULES:
- hostWallId MUST be one of the exact wall IDs listed in the confirmed wall context. Do NOT
  invent new IDs. Match to the wall whose centreline the gap sits on.
- centrePx MUST lie ON or within 5 px of the host wall centreline. If your centrePx is far
  from all wall centrelines, you have measured the arc centroid — correct it to the gap midpoint.
- WALL MISSING: if you see a clear door arc but the wall it sits on is NOT in the confirmed
  wall list, DO NOT report that door. The wall detection missed it — reporting a door without
  a wall will place it incorrectly. Skip it.
- Report EVERY door and EVERY window you can identify with confidence ≥ medium.
- Omit openings you are less than 50% certain about — do not pad with low-confidence guesses.
- Limit: maximum 40 openings (doors + windows combined).

GENERAL:
- "high" = gap AND indicator (arc/glazing) both clearly visible.
- "medium" = gap visible but indicator unclear, OR indicator clear but gap slightly ambiguous.
- "low" = use only if you are 50–65% certain. Omit entirely if below 50%.
- Return ONLY the JSON object. No explanation, no markdown, no text after the closing brace.`;

// ── Stage C system prompt — furniture and plumbing ────────────────────────────

const FURNITURE_SYSTEM_PROMPT = `You are an expert architectural floor plan symbol analyser. Output ONLY valid JSON — zero prose, zero markdown, zero code fences.

Your task: identify furniture and plumbing fixture symbols in the floor plan image.

Furniture symbols to detect:
- bed: rectangle with circle (pillow) at one end
- wardrobe: rectangle with diagonal lines or sliding door marks
- sofa: rectangle with armrests; corner_sofa: L-shape
- dining_table: rectangle surrounded by small chair rectangles
- dining_chair: small square near dining table
- coffee_table: small rectangle near sofa
- bedside_table: small square beside a bed
- entrance_table: small rectangular table near entrance
- toilet: D-shape (cistern + oval bowl)
- sink: rectangle with circle inside
- bath: large rectangle with rounded ends
- shower_glass_panel: square/rectangle with diagonal line

Output schema (STRICT — no extra fields):
{
  "furniture": [
    {
      "id": "f1",
      "furnitureType": string,
      "centrePx": { "x": number, "y": number },
      "widthPx": number,
      "depthPx": number,
      "rotationDeg": number,
      "room": string,
      "confidence": "high" | "medium" | "low"
    }
  ]
}

Rules:
- furnitureType must be one of: bed, wardrobe, corner_wardrobe, sofa, corner_sofa, dining_table, dining_chair, coffee_table, bedside_table, entrance_table, toilet, sink, bath, shower_glass_panel
- rotationDeg: 0 = symbol facing right, 90 = facing down, 180 = facing left, 270 = facing up
- room: best guess room name e.g. "bedroom", "bathroom", "kitchen", "living_room"
- Pixel coordinates from top-left (x=right, y=down).
- Limit output to a maximum of 25 furniture items.
- Return ONLY the JSON object. No explanation. No trailing text after the closing brace.`;

// ── API call helper ────────────────────────────────────────────────────────────

async function callClaude(options: {
    model: 'claude-haiku-4-5-20251014' | 'claude-sonnet-4-20250514';
    systemPrompt: string;
    userText: string;
    imageBase64: string;
    maxTokens: number;
}): Promise<string> {
    const { model, systemPrompt, userText, imageBase64, maxTokens } = options;

    const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: 'image/jpeg',
                            data: imageBase64,
                        },
                    },
                    { type: 'text', text: userText },
                ],
            }],
        }),
    });

    if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(`[FloorPlanAIFactory] API error ${response.status}: ${JSON.stringify(errBody)}`);
    }

    const data = await response.json();
    const text: string = (data.content ?? [])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('');

    return text.replace(/```json|```/g, '').trim();
}

/**
 * Parse the raw Claude response, attempting JSON repair if the response was
 * truncated mid-stream (common when max_tokens is hit).
 * Throws only if repair also fails — caller must handle null-safe fields.
 */
function safeParseJSON(raw: string, label: string): any {
    const result = repairAndParseJSON(raw, label);
    if (result !== null) return result;
    throw new Error(`[FloorPlanAIFactory] Unrecoverable JSON from ${label}. See console for details.`);
}

/**
 * Phase G: Build the annotation exclusion zone block injected into the B1 user message.
 *
 * Lists text annotation items (room names, dimension labels, area annotations) extracted
 * from the PDF by pdf.js with their image-pixel bounding boxes. Claude receives this block
 * so it can cross-reference any candidate wall segment against the annotation positions and
 * reject segments whose location coincides with known text.
 *
 * Items are deduped (same text at roughly the same position) and capped at 60 entries to
 * keep the prompt concise. Whitespace-only or purely numeric items (likely dimension values,
 * not room names) are included to help Claude avoid dimension-line false positives too.
 *
 * Returns an empty string when the annotation list is empty or undefined — the caller skips
 * injection in that case, so the prompt is backward-compatible.
 */
function buildAnnotationZoneText(annotations: TextAnnotationItem[] | undefined): string {
    if (!annotations || annotations.length === 0) return '';

    // Deduplicate: skip items whose text AND approximate position match a previous item.
    const seen = new Set<string>();
    const unique: TextAnnotationItem[] = [];
    for (const a of annotations) {
        const key = `${a.text}|${Math.round(a.x / 10)}|${Math.round(a.y / 10)}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(a);
        }
    }

    // Cap at 60 entries — beyond that the prompt becomes unwieldy.
    const capped = unique.slice(0, 60);

    const lines = capped.map(a =>
        `  "${a.text}" at pixel region x=${a.x}–${a.x + a.width}, y=${a.y}–${a.y + a.height}`
    );

    return (
        `\n\nKNOWN TEXT ANNOTATIONS in this plan (extracted from PDF — these are text labels, NOT walls):\n` +
        `Do NOT trace any of these regions as wall segments:\n` +
        lines.join('\n')
    );
}

/**
 * Build the plain-text wall context block injected into the Stage B2 user message.
 * Format: one line per wall — "w1 (exterior): from pixel (100, 50) to pixel (400, 50)"
 * Claude can match openings to these by visual proximity rather than memory.
 */
function buildWallContextText(walls: DetectedWall[]): string {
    if (walls.length === 0) return '(no walls detected in stage B1)';
    const lines = walls.map(w =>
        `${w.id} (${w.wallType}): from pixel (${Math.round(w.startPx.x)}, ${Math.round(w.startPx.y)}) to pixel (${Math.round(w.endPx.x)}, ${Math.round(w.endPx.y)})`
    );
    return lines.join('\n');
}

/**
 * Build the geometric door centre block injected into the Stage B2 user message.
 *
 * Each line provides the EXACT pixel midpoint computed by the formula:
 *   M = ((x1+x2)/2, (y1+y2)/2)
 * where (x1,y1) and (x2,y2) are the pixel coordinates of the two facing wall
 * terminator endpoints detected from Stage B1 wall geometry.
 *
 * Claude must:
 *   - Use these centrePx values DIRECTLY (they are geometrically precise).
 *   - Only visually confirm: is there a swing arc near this location?
 *   - Assign the correct hostWallId from the confirmed wall list.
 *   - NOT re-estimate centrePx from the arc visual — the formula result is already exact.
 *
 * Returns an empty string when no geometric gaps were detected — B2 falls back to
 * standard visual scanning in that case.
 */
function buildGeometricDoorCentreText(gaps: GeometricDoorGap[]): string {
    if (gaps.length === 0) return '';

    const lines = gaps.map((g, i) => {
        const angleName = Math.abs(g.wallAngleDeg % 180) < 10 ? 'horizontal wall'
            : Math.abs(g.wallAngleDeg % 180 - 90) < 10 ? 'vertical wall'
            : `wall at ${g.wallAngleDeg}°`;
        return (
            `  Gap ${i + 1}: centrePx=(${g.centrePx.x}, ${g.centrePx.y}), ` +
            `gapWidthPx=${g.gapWidthPx}, ${angleName}, ` +
            `jambs at (${g.jamb1Px.x},${g.jamb1Px.y}) and (${g.jamb2Px.x},${g.jamb2Px.y}) ` +
            `[walls: ${g.wallAId} / ${g.wallBId}]`
        );
    });

    return (
        `\n\nGEOMETRICALLY-COMPUTED DOOR GAP CENTRES (Phase H — wall terminator midpoint formula):\n` +
        `These centrePx values were calculated EXACTLY using M = ((x1+x2)/2, (y1+y2)/2) where\n` +
        `x1,y1 and x2,y2 are the pixel coordinates of the two facing wall terminator endpoints.\n` +
        `They are more accurate than visual arc-centroid estimation.\n\n` +
        lines.join('\n') +
        `\n\nINSTRUCTIONS FOR EACH GAP ABOVE:\n` +
        `1. Look at pixel location centrePx in the image.\n` +
        `2. If you see a door swing arc (thin curved line) near that location → confirm as DOOR.\n` +
        `3. Use the provided centrePx EXACTLY as the "centrePx" field in your output.\n` +
        `   DO NOT adjust it toward the arc centroid or bounding box centre.\n` +
        `4. Assign hostWallId = the wall from the confirmed list above whose centreline the gap sits on.\n` +
        `   The "walls" field in the gap line above shows the two candidate wall IDs.\n` +
        `5. If NO arc is present → it may be a window (check for glazing lines) or an archway. Report correctly.\n` +
        `6. If you identify additional doors NOT in this list (your visual scan found an arc in a new location),\n` +
        `   report them too — but use the standard gap-midpoint rule for their centrePx.`
    );
}

// ── Main export ────────────────────────────────────────────────────────────────

export class FloorPlanAIFactory {
    /**
     * Stage A: Preliminary door gap detection (runs BEFORE Stage B1).
     *
     * Uses Claude Haiku for speed and cost efficiency. Its sole purpose is to
     * locate door gap positions and wall orientations so DoorGapInpainter can
     * draw dashed continuation lines through those gaps. The modified image is
     * then passed to Stage B1 (wall detection) so that the wall-detection AI sees
     * a visual cue that a wall exists through the door area — eliminating broken
     * or missing wall segments at door openings.
     *
     * Stage A does NOT require hostWallId — walls have not been detected yet.
     * Returns only: centrePx, widthPx, wallAngleDeg for each detected gap.
     */
    private static async analyseDoorGapsPreliminary(
        opts: FloorPlanAnalysisOptions,
    ): Promise<PreliminaryDoorGap[]> {
        console.log('[FloorPlanAIFactory] Stage A: detecting door gaps for pre-inpainting…');
        try {
            const raw = await callClaude({
                model: 'claude-haiku-4-5-20251014',
                systemPrompt: DOOR_GAP_PRELIM_SYSTEM_PROMPT,
                userText: `Locate all door gap positions in this floor plan. Image dimensions: ${opts.widthPx}×${opts.heightPx}px. Return only valid JSON matching the schema.`,
                imageBase64: opts.base64Image,
                maxTokens: 1024,
            });

            const parsed = safeParseJSON(raw, 'A-door-gaps');
            const gaps: PreliminaryDoorGap[] = Array.isArray(parsed?.doorGaps)
                ? parsed.doorGaps.filter(
                    (g: any) =>
                        g &&
                        typeof g.centrePx?.x === 'number' &&
                        typeof g.centrePx?.y === 'number' &&
                        typeof g.widthPx === 'number' &&
                        typeof g.wallAngleDeg === 'number',
                )
                : [];

            console.log(`[FloorPlanAIFactory] Stage A complete: ${gaps.length} door gap(s) detected.`);
            return gaps;
        } catch (err) {
            // Stage A is optional — if it fails, proceed without inpainting rather than
            // aborting the entire pipeline. B1 and B2 will still run on the original image.
            console.warn('[FloorPlanAIFactory] Stage A failed (non-fatal) — proceeding without door gap inpainting:', err);
            return [];
        }
    }

    /**
     * Stage B1: Detect walls and slab outline ONLY.
     * Uses Claude Sonnet. No openings — openings are handled by B2 with wall context.
     *
     * PHASE C: This is the first half of the two-step structure detection split.
     */
    private static async analyseWallsAndSlab(opts: FloorPlanAnalysisOptions): Promise<{
        walls: DetectedWall[];
        slab: DetectedSlabOutline | null;
    }> {
        const contextNote = opts.extractedText
            ? `\n\nExtracted text from the PDF (use for room labels and scale context only — do NOT trace these as walls):\n${opts.extractedText.slice(0, 500)}`
            : '';

        // Phase G: build annotation exclusion zone block from text item positions
        const annotationZone = buildAnnotationZoneText(opts.textAnnotations);
        if (annotationZone) {
            console.log(`[FloorPlanAIFactory] Stage B1: injecting ${opts.textAnnotations!.length} annotation exclusion zones into prompt (Phase G)`);
        }

        // ── Phase F2: Guided mode when F1 provided enough segments ────────────
        const segments = opts.detectedSegments ?? [];
        const useGuidedMode = segments.length >= F2_MIN_SEGMENTS;

        let systemPrompt: string;
        let userText: string;

        if (useGuidedMode) {
            const segmentBlock = formatSegmentsForPrompt(segments);
            systemPrompt = STRUCTURE_B1_GUIDED_SYSTEM_PROMPT;
            userText =
                `Analyse this architectural floor plan. Image dimensions: ${opts.widthPx}×${opts.heightPx}px.${contextNote}${annotationZone}\n\n` +
                `Phase F1 algorithmic pre-processing detected ${segments.length} line segments in this image:\n` +
                segmentBlock +
                `\n\nFor each segment above, classify it as a wall (exterior/interior) or reject it. ` +
                `Pay special attention to the ANNOTATION EXCLUSION rules — reject any segment that overlaps a known text annotation zone listed above, ` +
                `or that clearly matches a dimension line, room label, or hatching line. ` +
                `Also identify the floor slab boundary. Do NOT report openings — those are handled in a separate step. ` +
                `Return only valid JSON matching the schema.`;
            console.log(`[FloorPlanAIFactory] Stage B1 (GUIDED — Phase F2): classifying ${segments.length} pre-detected segments…`);
        } else {
            systemPrompt = STRUCTURE_B1_SYSTEM_PROMPT;
            userText =
                `Analyse this architectural floor plan. Image dimensions: ${opts.widthPx}×${opts.heightPx}px.${contextNote}${annotationZone}\n\n` +
                `Identify ALL structural walls and the floor slab boundary. ` +
                `Apply the ANNOTATION EXCLUSION rules first — do NOT report room name labels, dimension lines, hatching, or other annotation as walls. ` +
                `Do NOT report openings (doors/windows) — those will be identified in a separate step. ` +
                `Return only valid JSON matching the schema.`;
            console.log(`[FloorPlanAIFactory] Stage B1 (standard): detecting walls and slab (F1 yielded ${segments.length} segments — below guided threshold)…`);
        }

        const raw = await callClaude({
            model: 'claude-sonnet-4-20250514',
            systemPrompt,
            userText,
            imageBase64: opts.base64Image,
            maxTokens: 8192,
        });

        const parsed = safeParseJSON(raw, 'B1-walls-slab');
        const walls: DetectedWall[] = Array.isArray(parsed.walls) ? parsed.walls : [];
        console.log(`[FloorPlanAIFactory] Stage B1 complete: ${walls.length} walls, slab=${parsed.slab ? 'yes' : 'no'}`);

        return {
            walls,
            slab: parsed.slab ?? null,
        };
    }

    /**
     * Stage B2: Detect openings (doors & windows) using confirmed wall IDs as context.
     * Claude receives the wall list from B1 as plain text so it cannot hallucinate
     * wall IDs — it must pick from the provided list.
     *
     * PHASE C: This is the second half of the two-step structure detection split.
     * Success criterion: hostWallId match rate >95% vs ~70% with the combined call.
     */
    private static async analyseOpenings(
        opts: FloorPlanAnalysisOptions,
        walls: DetectedWall[],
        geometricDoorGaps: GeometricDoorGap[] = [],
    ): Promise<DetectedOpening[]> {
        const wallContext = buildWallContextText(walls);
        const geometricCentreBlock = buildGeometricDoorCentreText(geometricDoorGaps);
        const contextNote = opts.extractedText
            ? `\n\nExtracted text from the PDF:\n${opts.extractedText.slice(0, 300)}`
            : '';

        const userText =
            `Analyse this architectural floor plan. Image dimensions: ${opts.widthPx}×${opts.heightPx}px.${contextNote}\n\n` +
            `Confirmed walls from stage B1 (use ONLY these exact IDs for hostWallId — do not invent new IDs):\n` +
            `${wallContext}` +
            `${geometricCentreBlock}\n\n` +
            `Identify ALL doors and windows in the plan. For each opening, assign it to the wall from the list above ` +
            `whose centreline it sits on. ` +
            (geometricDoorGaps.length > 0
                ? `PRIORITY: process the geometrically-computed door gap centres listed above FIRST — ` +
                  `these have mathematically precise centrePx values. Then scan for any additional doors your ` +
                  `visual analysis finds. `
                : '') +
            `Return only valid JSON matching the schema.`;

        console.log(
            `[FloorPlanAIFactory] Stage B2: detecting openings with ${walls.length} wall IDs` +
            (geometricDoorGaps.length > 0
                ? ` + ${geometricDoorGaps.length} geometric door gap centres (Phase H) as context…`
                : '…'),
        );
        const raw = await callClaude({
            model: 'claude-sonnet-4-20250514',
            systemPrompt: STRUCTURE_B2_SYSTEM_PROMPT,
            userText,
            imageBase64: opts.base64Image,
            maxTokens: 4096,
        });

        const parsed = safeParseJSON(raw, 'B2-openings');
        const openings: DetectedOpening[] = Array.isArray(parsed.openings) ? parsed.openings : [];
        console.log(`[FloorPlanAIFactory] Stage B2 complete: ${openings.length} openings`);

        return openings;
    }

    /**
     * Stage B (combined): Run B1 (walls/slab) then B2 (openings with wall context).
     * This replaces the old single-call analyseStructure() with a two-step pipeline
     * per Phase C of the PDF_TO_BIM_DEEP_AUDIT reconstruction strategy.
     *
     * The public interface is unchanged — callers still receive
     * { walls, openings, slab } exactly as before.
     */
    static async analyseStructure(opts: FloorPlanAnalysisOptions): Promise<{
        walls: DetectedWall[];
        openings: DetectedOpening[];
        slab: DetectedSlabOutline | null;
    }> {
        const { walls, slab } = await FloorPlanAIFactory.analyseWallsAndSlab(opts);

        let openings: DetectedOpening[] = [];
        if (opts.includeStructure) {
            openings = await FloorPlanAIFactory.analyseOpenings(opts, walls);
        }

        return { walls, openings, slab };
    }

    /**
     * Stage C: Analyse furniture and plumbing fixtures.
     * Uses Claude Haiku for cost efficiency. Unchanged from original implementation.
     */
    static async analyseFurniture(opts: FloorPlanAnalysisOptions): Promise<DetectedFurniture[]> {
        const contextNote = opts.extractedText
            ? `\n\nExtracted text from PDF:\n${opts.extractedText.slice(0, 300)}`
            : '';

        const userText = `Identify all furniture and plumbing fixture symbols in this architectural floor plan. Image dimensions: ${opts.widthPx}×${opts.heightPx}px.${contextNote}

Return only valid JSON matching the schema.`;

        const raw = await callClaude({
            model: 'claude-haiku-4-5-20251014',
            systemPrompt: FURNITURE_SYSTEM_PROMPT,
            userText,
            imageBase64: opts.base64Image,
            maxTokens: 2048,
        });

        const parsed = safeParseJSON(raw, 'furniture');
        return Array.isArray(parsed.furniture) ? parsed.furniture : [];
    }

    /**
     * Full pipeline: run Stage B (B1 → B2) and optionally Stage C, return combined analysis.
     * Public interface UNCHANGED — FloorPlanImportPanel.ts is not affected.
     */
    static async analyse(
        opts: FloorPlanAnalysisOptions,
        onProgress?: (stage: string) => void
    ): Promise<FloorPlanAnalysis> {
        const analysis: FloorPlanAnalysis = {
            walls: [],
            openings: [],
            slab: null,
            furniture: [],
            imageDimensions: { widthPx: opts.widthPx, heightPx: opts.heightPx },
        };

        if (opts.includeStructure) {
            // ── Stage A: Preliminary door gap detection → image inpainting ────
            // Run BEFORE B1 so the wall-detection AI sees dashed continuation lines
            // through door gaps — eliminating broken/missing walls at openings.
            onProgress?.('Stage A: Locating door gaps for wall-continuity inpainting…');
            const doorGaps = await FloorPlanAIFactory.analyseDoorGapsPreliminary(opts);

            // Inpaint dashed lines into the image even if Stage A found 0 gaps
            // (DoorGapInpainter returns the original image unchanged when gaps=[]).
            const inpaintedBase64 = await DoorGapInpainter.paint(
                opts.base64Image,
                { widthPx: opts.widthPx, heightPx: opts.heightPx },
                doorGaps,
            );

            // Build a modified opts object that uses the inpainted image for B1 and B2.
            // All other fields (extractedText, textAnnotations, detectedSegments…) are unchanged.
            const optsInpainted: FloorPlanAnalysisOptions = {
                ...opts,
                base64Image: inpaintedBase64,
            };

            // ── Stage B1: Wall + slab detection on the inpainted image ────────
            const segments = opts.detectedSegments ?? [];
            const b1Label = segments.length >= F2_MIN_SEGMENTS
                ? `Stage B1 (guided — ${segments.length} pre-detected segments): Classifying walls and slab…`
                : 'Stage B1: Detecting walls and slab outline…';
            onProgress?.(b1Label);
            const { walls, slab } = await FloorPlanAIFactory.analyseWallsAndSlab(optsInpainted);
            analysis.walls = walls;
            analysis.slab = slab;

            // ── Geometric door gap detection (Phase H) ─────────────────────────
            // Run BETWEEN B1 and B2 — zero additional API calls.
            // Scans B1 wall endpoints for facing "terminators" and computes the
            // exact midpoint of each door gap using M = ((x1+x2)/2, (y1+y2)/2).
            // The results are injected into the B2 prompt so Claude uses precise
            // formula-derived centrePx values instead of visual arc estimation.
            const geometricDoorGaps = detectGeometricDoorGaps(walls);
            if (geometricDoorGaps.length > 0) {
                console.log(
                    `[FloorPlanAIFactory] Phase H: ${geometricDoorGaps.length} geometric door gap(s) detected — ` +
                    `injecting precise centrePx values into Stage B2 prompt.`,
                );
            }

            // ── Stage B2: Opening detection (doors/windows) with wall IDs ─────
            // IMPORTANT: B2 uses the ORIGINAL image (opts), NOT the inpainted one.
            // The inpainted image has dashed lines drawn through door gaps to help
            // B1 see continuous walls. If B2 also used the inpainted image, those
            // dashed lines would fill the door gaps and prevent B2 from finding
            // the white breaks it needs to confirm door locations.
            // B2 has geometric door gap centres from Phase H as precise anchors,
            // so it does not need the inpainting cue.
            onProgress?.(`Stage B2: Detecting openings (doors & windows) using ${walls.length} confirmed walls + ${geometricDoorGaps.length} geometric door centres…`);
            analysis.openings = await FloorPlanAIFactory.analyseOpenings(opts, walls, geometricDoorGaps);
        }

        if (opts.includeFurniture || opts.includePlumbing) {
            // Stage C uses the original (non-inpainted) image so dashed lines
            // do not confuse furniture symbol recognition.
            onProgress?.('Stage C: Analysing furniture & fixtures…');
            const furniture = await FloorPlanAIFactory.analyseFurniture(opts);
            analysis.furniture = furniture;
        }

        return analysis;
    }
}