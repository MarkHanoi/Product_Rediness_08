// §CATASTRO-BLOCK (ADR-0271 P4b) — the manzana (block) parcels route.
//
// ⚠ THIS FILE EXISTS BECAUSE OF A MISTAKE. The first version of this route shipped BROKEN: it
// called the `GetZoning` stored query with `REFCAT`, which the live service rejects with
// "The parameter COD_ZONA can't be null". It was written from DOCUMENTATION rather than from a
// RESPONSE, and it had no test, so nothing caught it. Both halves of that are addressed here.
//
// The behaviours pinned below are the ones where a wrong answer is WORSE THAN NO ANSWER, because
// a block ring feeds PGM Art. 242.2 and a too-small block yields a too-small interior courtyard
// and therefore a WRONG *profunditat edificable* — a confidently wrong compliance number on the
// densest land in Spain.

import { describe, expect, it } from 'vitest';
import {
    manzanaPrefix,
    buildParcelBboxUrl,
    parseParcelCollectionGml,
    makeCatastroBlockHandler,
    BLOCK_BBOX_HALF_DEG,
    isFreeStandingBlock,
    FREE_STANDING_CLEARANCE_M,
} from '../parcelZoningProxy.js';

/** A minimal but structurally real two-feature CadastralParcel collection. */
function collectionGml(entries: Array<{ rc: string; pts: string; area?: string }>): string {
    const feats = entries.map((e) => `
  <member><cp:CadastralParcel gml:id="ES.SDGC.CP.${e.rc}">
    <cp:areaValue uom="m2">${e.area ?? '500'}</cp:areaValue>
    <cp:geometry><gml:Surface srsName="EPSG:4326"><gml:patches><gml:PolygonPatch>
      <gml:exterior><gml:LinearRing><gml:posList srsDimension="2">${e.pts}</gml:posList></gml:LinearRing></gml:exterior>
    </gml:PolygonPatch></gml:patches></gml:Surface></cp:geometry>
    <cp:nationalCadastralReference>${e.rc}</cp:nationalCadastralReference>
  </cp:CadastralParcel></member>`).join('');
    return `<?xml version="1.0"?><FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:cp="urn:cp">${feats}</FeatureCollection>`;
}

const SQUARE = '41.3920 2.1650 41.3920 2.1655 41.3925 2.1655 41.3925 2.1650 41.3920 2.1650';

/** Minimal single-parcel GML for the subject-parcel (GetParcel) call. */
const SUBJECT_GML = collectionGml([{ rc: '0229720DF3802G', pts: SQUARE }]);

function fakeRes() {
    return {
        _code: 0, _body: null as unknown,
        status(c: number) { this._code = c; return this; },
        json(b: unknown) { this._body = b; return this; },
    };
}

describe('manzanaPrefix — the 5-char rule, established empirically', () => {
    it('takes the first 5 characters of an urban refcat', () => {
        // Verified against live adjacent parcels: one bbox split cleanly into 02297 (13 parcels)
        // and 03286 (8) — two real, adjacent Eixample manzanas.
        expect(manzanaPrefix('0229720DF3802G')).toBe('02297');
        expect(manzanaPrefix('0328613DF3802G')).toBe('03286');
    });

    it('returns null for anything too short to carry a prefix', () => {
        // Never a partial prefix — a 3-char "manzana" would match a huge unrelated set and
        // silently produce an enormous, wrong block.
        expect(manzanaPrefix('0229')).toBeNull();
        expect(manzanaPrefix('')).toBeNull();
        expect(manzanaPrefix(undefined as unknown as string)).toBeNull();
    });
});

describe('buildParcelBboxUrl — the BBOX form the live service accepts', () => {
    it('emits lat,lon,lat,lon with the URN CRS (the form verified against production)', () => {
        const url = buildParcelBboxUrl(41.3925, 2.165);
        // Unencoded colon — this is the exact form verified against production. A colon is
        // legal in a query value, and the live service accepts it; encoding it is untested.
        expect(url).toContain('typeNames=cp:CadastralParcel');
        const bbox = decodeURIComponent(url.split('bbox=')[1]!);
        const [s, w, n, e, crs] = bbox.split(',');
        // OGC axis order for EPSG:4326 is lat,lon — getting this backwards silently queries
        // a bbox off the coast of Somalia and returns zero parcels, which reads as "empty area".
        expect(Number(s)).toBeCloseTo(41.3925 - BLOCK_BBOX_HALF_DEG, 6);
        expect(Number(w)).toBeCloseTo(2.165 - BLOCK_BBOX_HALF_DEG, 6);
        expect(Number(n)).toBeCloseTo(41.3925 + BLOCK_BBOX_HALF_DEG, 6);
        expect(Number(e)).toBeCloseTo(2.165 + BLOCK_BBOX_HALF_DEG, 6);
        expect(crs).toBe('urn:ogc:def:crs:EPSG::4326');
    });

    it('stays well inside Catastro documented 1 km² BBOX ceiling', () => {
        // ~±220 m at Barcelona latitude — larger than a 113 m Cerdà manzana, far below the cap.
        expect(BLOCK_BBOX_HALF_DEG).toBeLessThan(0.005);
    });
});

describe('parseParcelCollectionGml — many features, one parser', () => {
    it('extracts refcat + ring + area per feature', () => {
        const out = parseParcelCollectionGml(collectionGml([
            { rc: '0229701DF3802G', pts: SQUARE, area: '605' },
            { rc: '0229702DF3802G', pts: SQUARE, area: '434' },
        ]));
        expect(out).toHaveLength(2);
        expect(out[0]!.refcat).toBe('0229701DF3802G');
        expect(out[0]!.areaM2).toBeCloseTo(605, 6);
        expect(out[0]!.ring.length).toBeGreaterThanOrEqual(3);
        // OGC axis order: lat first. A swap here would put Barcelona parcels in the Indian Ocean.
        expect(out[0]!.ring[0]!.lat).toBeCloseTo(41.392, 3);
        expect(out[0]!.ring[0]!.lon).toBeCloseTo(2.165, 3);
    });

    it('DROPS a feature with no refcat rather than emitting an unattributed ring', () => {
        // An unlabelled ring cannot be filtered by manzana, so keeping it would silently widen
        // the block with a parcel that may belong to a different one.
        const gml = collectionGml([{ rc: 'X', pts: SQUARE }]).replace(/<cp:nationalCadastralReference>[^<]*<\/cp:nationalCadastralReference>/, '');
        expect(parseParcelCollectionGml(gml)).toHaveLength(0);
    });

    it('returns [] for junk instead of throwing', () => {
        expect(parseParcelCollectionGml('not xml')).toEqual([]);
        expect(parseParcelCollectionGml('')).toEqual([]);
    });
});

describe('the handler REFUSES rather than returning a partial block', () => {
    const okRes = (body: string) => ({ ok: true, text: async () => body } as unknown as Response);

    it('filters the bbox result down to the subject manzana', async () => {
        let call = 0;
        const handler = makeCatastroBlockHandler({
            fetchImpl: (async () => {
                call++;
                if (call === 1) return okRes(SUBJECT_GML);
                return okRes(collectionGml([
                    { rc: '0229720DF3802G', pts: SQUARE },
                    { rc: '0229701DF3802G', pts: SQUARE },
                    { rc: '0229702DF3802G', pts: SQUARE },
                    { rc: '0328601DF3802G', pts: SQUARE },   // ← a DIFFERENT manzana
                ]));
            }) as unknown as typeof fetch,
        });
        const res = fakeRes();
        await handler({ query: { refcat: '0229720DF3802G' } } as never, res as never);
        const body = res._body as { block: { manzana: string; siblingCount: number } };
        expect(body.block.manzana).toBe('02297');
        // The 03286 parcel must NOT be in the block — including a neighbouring manzana would
        // roughly double the block area and halve the derived courtyard ratio.
        expect(body.block.siblingCount).toBe(3);
    });

    it('REFUSES below 3 siblings — a 2-parcel "block" is a broken prefix, not a manzana', async () => {
        // THE CENTRAL REFUSAL. A partial block ring yields a too-small interior free space and
        // therefore a WRONG profunditat edificable — worse than no envelope at all.
        let call = 0;
        const handler = makeCatastroBlockHandler({
            fetchImpl: (async () => {
                call++;
                if (call === 1) return okRes(SUBJECT_GML);
                return okRes(collectionGml([
                    { rc: '0229720DF3802G', pts: SQUARE },
                    { rc: '0328601DF3802G', pts: SQUARE },
                ]));
            }) as unknown as typeof fetch,
        });
        const res = fakeRes();
        await handler({ query: { refcat: '0229720DF3802G' } } as never, res as never);
        const body = res._body as { block: null; _tooFewSiblings: number };
        expect(body.block).toBeNull();
        expect(body._tooFewSiblings).toBe(1);
    });

    it('upstream failure → block:null, never a throw and never a partial block', async () => {
        const handler = makeCatastroBlockHandler({
            fetchImpl: (async () => ({ ok: false, status: 503 } as unknown as Response)) as unknown as typeof fetch,
        });
        const res = fakeRes();
        await handler({ query: { refcat: '0229720DF3802G' } } as never, res as never);
        expect(res._code).toBe(200);
        expect((res._body as { block: null }).block).toBeNull();
    });

    it('§STREET-WIDTH-NEIGHBOURS returns the OTHER manzana as a neighbour, not as a sibling', async () => {
        // L-537. The opposing frontage the *amplada de vial* is measured to is already in this
        // bbox response; the route used to discard it in the manzana filter and the street width
        // was therefore unobtainable without a second HTTP call. It must appear as a NEIGHBOUR —
        // never inside `parcels`, which would corrupt the block ring and the depth with it.
        let call = 0;
        const handler = makeCatastroBlockHandler({
            fetchImpl: (async () => {
                call++;
                if (call === 1) return okRes(SUBJECT_GML);
                return okRes(collectionGml([
                    { rc: '0229720DF3802G', pts: SQUARE },
                    { rc: '0229701DF3802G', pts: SQUARE },
                    { rc: '0229702DF3802G', pts: SQUARE },
                    { rc: '0328601DF3802G', pts: SQUARE },   // ← a DIFFERENT manzana, ~adjacent
                ]));
            }) as unknown as typeof fetch,
        });
        const res = fakeRes();
        await handler({ query: { refcat: '0229720DF3802G' } } as never, res as never);
        const body = res._body as {
            block: { siblingCount: number; neighbours: Array<{ refcat: string }> };
        };
        expect(body.block.siblingCount).toBe(3);
        expect(body.block.neighbours.map((n) => n.refcat)).toEqual(['0328601DF3802G']);
    });

    it('drops a neighbour that is far outside the halo — payload, not correctness', async () => {
        // The halo is generous by design (100 m > the 80 m measurement search limit), so a parcel
        // removed here is one no ray could have reached. A parcel a whole degree away is the
        // unambiguous case.
        let call = 0;
        const FAR = '42.5000 3.1000 42.5000 3.1005 42.5005 3.1005 42.5005 3.1000 42.5000 3.1000';
        const handler = makeCatastroBlockHandler({
            fetchImpl: (async () => {
                call++;
                if (call === 1) return okRes(SUBJECT_GML);
                return okRes(collectionGml([
                    { rc: '0229720DF3802G', pts: SQUARE },
                    { rc: '0229701DF3802G', pts: SQUARE },
                    { rc: '0229702DF3802G', pts: SQUARE },
                    { rc: '0328601DF3802G', pts: FAR },
                ]));
            }) as unknown as typeof fetch,
        });
        const res = fakeRes();
        await handler({ query: { refcat: '0229720DF3802G' } } as never, res as never);
        const body = res._body as { block: { neighbours: unknown[] } };
        expect(body.block.neighbours).toEqual([]);
    });

    it('missing refcat → 400', async () => {
        const handler = makeCatastroBlockHandler({ fetchImpl: (async () => okRes('')) as unknown as typeof fetch });
        const res = fakeRes();
        await handler({ query: {} } as never, res as never);
        expect(res._code).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §BLOCK-SINGLETON-MANZANA (L-586)
//
// The blanket `< 3 parcels` refusal above was a GUESS ("far likelier to be a broken prefix than a
// real manzana") that was never measured. Measured on the live 100-manzana Barcelona sweep, seven
// parcels hit it and ALL SEVEN are genuine whole blocks — four of them full ~12,000 m² Eixample
// illes held as one cadastral parcel (a school, a market, a convent). The guess is replaced by the
// test it was estimating: city blocks are separated by STREETS, so a real whole-block parcel
// touches nothing, and a parcel whose siblings were lost to a broken prefix still does.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('§BLOCK-SINGLETON-MANZANA — a free-standing single parcel IS a manzana', () => {
    const okRes = (body: string) => ({ ok: true, text: async () => body } as unknown as Response);
    // ~55 m clear of SQUARE — a street's width away, well beyond FREE_STANDING_CLEARANCE_M and
    // far beyond Catastro's own 0.111 m coordinate quantum.
    const ACROSS_THE_STREET = '41.3930 2.1650 41.3930 2.1655 41.3935 2.1655 41.3935 2.1650 41.3930 2.1650';

    it('ACCEPTS a 1-parcel manzana when nothing in the bbox touches it', async () => {
        let call = 0;
        const handler = makeCatastroBlockHandler({
            fetchImpl: (async () => {
                call++;
                if (call === 1) return okRes(SUBJECT_GML);
                return okRes(collectionGml([
                    { rc: '0229720DF3802G', pts: SQUARE },
                    { rc: '0328601DF3802G', pts: ACROSS_THE_STREET },
                ]));
            }) as unknown as typeof fetch,
        });
        const res = fakeRes();
        await handler({ query: { refcat: '0229720DF3802G' } } as never, res as never);
        const body = res._body as { block: { siblingCount: number; freeStanding: boolean | null } };
        expect(body.block).not.toBeNull();
        expect(body.block.siblingCount).toBe(1);
        expect(body.block.freeStanding).toBe(true);
    });

    it('STILL REFUSES a 1-parcel manzana that abuts another parcel — the broken-prefix case', async () => {
        // This is the danger the old guard was aimed at, and it must survive intact: the siblings
        // are right there under a different prefix, so the "block" is a fragment of a real one and
        // its ring would yield a WRONG profunditat edificable.
        let call = 0;
        const handler = makeCatastroBlockHandler({
            fetchImpl: (async () => {
                call++;
                if (call === 1) return okRes(SUBJECT_GML);
                return okRes(collectionGml([
                    { rc: '0229720DF3802G', pts: SQUARE },
                    // Shares the 2.1655 edge exactly — an abutting parcel, not a street away.
                    { rc: '0328601DF3802G', pts: '41.3920 2.1655 41.3920 2.1660 41.3925 2.1660 41.3925 2.1655 41.3920 2.1655' },
                ]));
            }) as unknown as typeof fetch,
        });
        const res = fakeRes();
        await handler({ query: { refcat: '0229720DF3802G' } } as never, res as never);
        const body = res._body as { block: null; _tooFewSiblings: number; _abuttingParcels: number };
        expect(body.block).toBeNull();
        expect(body._tooFewSiblings).toBe(1);
        expect(body._abuttingParcels).toBe(1);
    });

    it('reports `freeStanding: null` — not false — for an ordinary multi-parcel block', async () => {
        // THREE STATES, NEVER TWO (L-467/L-469). "not evaluated" and "evaluated and negative" are
        // different facts and must not render as the same value.
        let call = 0;
        const handler = makeCatastroBlockHandler({
            fetchImpl: (async () => {
                call++;
                if (call === 1) return okRes(SUBJECT_GML);
                return okRes(collectionGml([
                    { rc: '0229720DF3802G', pts: SQUARE },
                    { rc: '0229721DF3802G', pts: SQUARE },
                    { rc: '0229722DF3802G', pts: SQUARE },
                ]));
            }) as unknown as typeof fetch,
        });
        const res = fakeRes();
        await handler({ query: { refcat: '0229720DF3802G' } } as never, res as never);
        const body = res._body as { block: { siblingCount: number; freeStanding: boolean | null } };
        expect(body.block.siblingCount).toBe(3);
        expect(body.block.freeStanding).toBeNull();
    });

    it('isFreeStandingBlock is honest about an EMPTY bbox — null distance, not Infinity', async () => {
        const parcels = parseParcelCollectionGml(collectionGml([{ rc: '0229720DF3802G', pts: SQUARE }]));
        const verdict = isFreeStandingBlock(parcels, parcels);
        expect(verdict.nearestOtherParcelM).toBeNull();
        expect(verdict.touching).toEqual([]);
    });

    it('measures a real street gap and a real shared edge on opposite sides of the clearance', async () => {
        const own = parseParcelCollectionGml(collectionGml([{ rc: '0229720DF3802G', pts: SQUARE }]));
        const far = parseParcelCollectionGml(collectionGml([
            { rc: '0229720DF3802G', pts: SQUARE },
            { rc: '0328601DF3802G', pts: ACROSS_THE_STREET },
        ]));
        const near = parseParcelCollectionGml(collectionGml([
            { rc: '0229720DF3802G', pts: SQUARE },
            { rc: '0328601DF3802G', pts: '41.3920 2.1655 41.3920 2.1660 41.3925 2.1660 41.3925 2.1655 41.3920 2.1655' },
        ]));
        const farV = isFreeStandingBlock(own, far);
        const nearV = isFreeStandingBlock(own, near);
        expect(farV.freeStanding).toBe(true);
        expect(farV.nearestOtherParcelM).toBeGreaterThan(FREE_STANDING_CLEARANCE_M);
        expect(nearV.freeStanding).toBe(false);
        expect(nearV.nearestOtherParcelM).toBeLessThan(FREE_STANDING_CLEARANCE_M);
    });
});
