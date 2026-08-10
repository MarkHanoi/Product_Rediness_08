// §GEN-REQUEST-UNION (RAC U5b.1, RAC-GENERATIVE-INFRA-INVENTORY §1/§8 R1–R2) —
// the ONE typed GenerationRequest seam over the four proven generators.
//
// WHY THIS EXISTS
// ---------------
// Every generator already accepts a TYPED request object at its controller
// boundary (`ResidentialBuildingRequest`, `OfficeBuildingRequest`,
// `HouseLayoutRequest`, `ApartmentGenerateLayoutPayload`-shaped program
// overrides), and the residential path already has the PURE brief mapper
// (`residentialRequestFromBrief`) proving the shape. What was missing is the
// discriminated UNION over those requests plus the sibling mappers, so that a
// chat sentence, the onboarding wizard, and any future planner all funnel into
// the SAME typed seam instead of each hand-reading `briefMetadata`.
//
// PURE. No store reads, no DOM, no dispatch — the mappers turn loosely-typed
// brief metadata (`PipelineBrief.metadata`, field-id-keyed) into typed
// requests; the CALLER threads in the resolved footprint (read once from the
// site model, C58 buildable-envelope-first via `resolveBuildableFootprint`).
// Route ids are the `resolveGenerateRoute` vocabulary (onboarding
// `typologyChoiceModel.ts`) — one dispatcher vocabulary, never a second.
//
// NOT A SECOND PIPELINE: nothing here executes. The union's consumers dispatch
// through the SAME controllers/executors the onboarding modal drives
// (`ResidentialBuildingController`, `HouseLayoutController` /
// `generateHouseFromBoundary`, `OfficeBuildingController`,
// `generateApartmentFromBoundary`) under the same
// `beginBuildingGeneration` lease the executors already open.

import type { ApartmentProgram } from '@pryzm/ai-host';
import type { ResidentialBuildingRequest } from '../residential-building/ResidentialBuildingController.js';
import { residentialRequestFromBrief } from '../residential-building/residentialBriefMapper.js';
import type { OfficeBuildingRequest } from '../office-building/OfficeBuildingController.js';
import {
    deriveOfficeCircleFromParcel,
    resolveOfficeStoreyCount,
} from '../office-building/deriveOfficeCircle.js';
import { resolveApartmentBrief } from '../apartment-layout/briefToProgram.js';

/** Footprint point (metres, plan XZ) — the shared site-read vocabulary. */
export interface GenerationFootprintPoint { readonly x: number; readonly z: number }

/** The house generator's per-request knobs (mirrors `HouseFromBoundaryOptions`
 *  minus the footprint, which the caller threads separately). */
export interface HouseGenerationOptions {
    readonly floorToFloorM?: number;
    readonly roofKind?: 'flat' | 'gable' | 'hip';
    readonly programOverride?: Partial<ApartmentProgram>;
}

/**
 * The discriminated union — R2. `kind` values are the `resolveGenerateRoute`
 * route ids ('residential-building' | 'house' | 'office' | 'apartment'), so
 * the typed seam and the onboarding dispatch can never disagree on vocabulary.
 */
export type GenerationRequest =
    | { readonly kind: 'residential-building'; readonly request: ResidentialBuildingRequest }
    | { readonly kind: 'house'; readonly storeyCount: number; readonly options: HouseGenerationOptions }
    | { readonly kind: 'office'; readonly request: OfficeBuildingRequest; readonly withInterior: boolean }
    | { readonly kind: 'apartment'; readonly programOverride: Partial<ApartmentProgram> };

// ─── Shared brief readers (the residentialRequestFromBrief idioms) ───────────

function readNumber(md: Record<string, unknown>, ...keys: string[]): number | undefined {
    for (const k of keys) {
        const raw = md[k];
        const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
        if (Number.isFinite(n) && n > 0) return n;
    }
    return undefined;
}

/** House storey clamp — the casa-unifamiliar manifest's own [1,3] stepper range
 *  (mirrors `OnboardingStepController.resolveStoreyCount`, default 2). */
export const HOUSE_STOREYS_MIN = 1;
export const HOUSE_STOREYS_MAX = 3;
export const HOUSE_DEFAULT_STOREYS = 2;

/** Residential upper-level clamp — `ResidentialBuildingRequest.upperLevels`'
 *  own [1,20] range (ground is always additional). */
export const RESI_UPPER_LEVELS_MAX = 20;

/** Office storey clamp — `resolveOfficeStoreyCount`'s own [1,40] range. */
export const OFFICE_STOREYS_MAX = 40;

/** Default circular office plate radius (m) when neither the brief nor the
 *  parcel yields one (mirrors OfficeBuildingController.DEFAULT_RADIUS_M). */
const OFFICE_DEFAULT_RADIUS_M = 22;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * U5b.1 — the HOUSE brief mapper (the `residentialRequestFromBrief` sibling).
 * Pure + defensive: storeys from `floors` (default 2, clamped to the
 * manifest's [1,3]); roof kind / floor-to-floor when the brief carries them;
 * the room program via the ONE apartment-brief mapper (`resolveApartmentBrief`
 * — bedrooms/bathrooms/open-plan/en-suite share field ids across typologies).
 */
export function houseRequestFromBrief(
    md: Record<string, unknown>,
): Extract<GenerationRequest, { kind: 'house' }> {
    const floorsRaw = readNumber(md, 'floors', 'levels', 'storeys') ?? HOUSE_DEFAULT_STOREYS;
    const storeyCount = Math.max(HOUSE_STOREYS_MIN, Math.min(HOUSE_STOREYS_MAX, Math.round(floorsRaw)));

    const roofRaw = md['roofKind'];
    const roofKind = roofRaw === 'flat' || roofRaw === 'gable' || roofRaw === 'hip' ? roofRaw : undefined;
    const floorToFloorM = readNumber(md, 'floorToFloorM');
    const { programOverride } = resolveApartmentBrief(md);

    return {
        kind: 'house',
        storeyCount,
        options: {
            ...(roofKind !== undefined ? { roofKind } : {}),
            ...(floorToFloorM !== undefined ? { floorToFloorM } : {}),
            ...(Object.keys(programOverride).length > 0 ? { programOverride } : {}),
        },
    };
}

/**
 * U5b.1 — the OFFICE brief mapper. Pure: mirrors the onboarding office branch
 * (`OnboardingStepController.generateOffice`) field for field — storeys via the
 * shared `resolveOfficeStoreyCount` ([1,40], default 40), radius from the
 * brief's preview value, else the circle fitted inside the parcel polygon,
 * else the 22 m default; culture / desk density / floor-to-floor / colours
 * pass through when valid. `withInterior` is the preview's
 * Architecture+Interior toggle (default false = Architecture Only).
 */
export function officeRequestFromBrief(
    md: Record<string, unknown>,
    footprint: ReadonlyArray<GenerationFootprintPoint> | null,
): Extract<GenerationRequest, { kind: 'office' }> {
    const stories = resolveOfficeStoreyCount(md);
    const circle = deriveOfficeCircleFromParcel(footprint);
    const previewRadius = readNumber(md, 'officeRadiusM');
    const radiusM = previewRadius !== undefined
        ? previewRadius
        : circle !== null && circle.radiusM > 0 ? circle.radiusM : OFFICE_DEFAULT_RADIUS_M;

    const cultureRaw = md['officeCulture'];
    const culture = cultureRaw === 'perimeter-offices-first' || cultureRaw === 'open-plan-first'
        ? cultureRaw
        : undefined;
    const floorToFloorM = readNumber(md, 'officeFloorToFloorM');
    const deskDensityPer1000Sqft = readNumber(md, 'officeDeskDensity');
    const hex = (key: string): string | undefined => {
        const v = md[key];
        return typeof v === 'string' && HEX_RE.test(v) ? v : undefined;
    };
    const facadeColor = hex('officeFacadeColor');
    const glassColor = hex('officeGlassColor');
    const innerWallColor = hex('officeInnerWallColor');

    return {
        kind: 'office',
        request: {
            stories,
            radiusM,
            ...(floorToFloorM !== undefined ? { floorToFloorM } : {}),
            ...(deskDensityPer1000Sqft !== undefined ? { deskDensityPer1000Sqft } : {}),
            ...(culture !== undefined ? { culture } : {}),
            ...(facadeColor !== undefined ? { facadeColor } : {}),
            ...(glassColor !== undefined ? { glassColor } : {}),
            ...(innerWallColor !== undefined ? { innerWallColor } : {}),
        },
        withInterior: md['officeWithInterior'] === true,
    };
}

/**
 * U5b.1 — the RESIDENTIAL (multi-family) arm: wraps the SHIPPED
 * `residentialRequestFromBrief` template (unchanged, one implementation) into
 * the union. The footprint is required — the residential orchestrator builds
 * its own shell from it.
 */
export function residentialGenerationFromBrief(
    md: Record<string, unknown>,
    footprint: ReadonlyArray<GenerationFootprintPoint>,
): Extract<GenerationRequest, { kind: 'residential-building' }> {
    return { kind: 'residential-building', request: residentialRequestFromBrief(md, footprint) };
}

/**
 * U5b.1 — the APARTMENT arm: the brief → program mapping already has ONE
 * implementation (`resolveApartmentBrief`, O.12.c); this only lifts it into
 * the union. The apartment generator consumes the program override via
 * `generateApartmentFromBoundary` (modal + LLM-first path — chat-headless
 * execution is deliberately deferred to U5c with the auto-chain).
 */
export function apartmentRequestFromBrief(
    md: Record<string, unknown>,
): Extract<GenerationRequest, { kind: 'apartment' }> {
    return { kind: 'apartment', programOverride: resolveApartmentBrief(md).programOverride };
}

/**
 * The ONE brief → typed-request dispatcher, keyed by the `resolveGenerateRoute`
 * route id. Callers resolve the route (typology id → route) with the SAME
 * unit-tested resolver the onboarding generate switch uses, then map here.
 */
export function generationRequestFromBrief(
    route: 'residential-building' | 'house' | 'office' | 'apartment',
    md: Record<string, unknown>,
    footprint: ReadonlyArray<GenerationFootprintPoint> | null,
): GenerationRequest | { readonly error: string } {
    switch (route) {
        case 'residential-building': {
            if (footprint === null || footprint.length < 3) {
                return { error: 'A residential building needs a site boundary — draw a plot first.' };
            }
            return residentialGenerationFromBrief(md, footprint);
        }
        case 'house':
            return houseRequestFromBrief(md);
        case 'office':
            return officeRequestFromBrief(md, footprint);
        case 'apartment':
            return apartmentRequestFromBrief(md);
    }
}
