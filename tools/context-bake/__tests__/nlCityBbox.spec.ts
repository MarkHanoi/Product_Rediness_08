// §NL-CITY-BBOX (L-12942) — every Dutch city bakes ITS OWN extent, not the 256 m Amsterdam proof
// square. The defect this pins: on R2, 2026-09-05, amsterdam / rotterdam / utrecht / thehague all
// served layer.json bounds [4.8864, 52.3689, 4.8902, 52.3712] — one patch under four slugs.
import { describe, it, expect } from 'vitest';
import { nlCityWcsRequest, dtmWcsUrl, NL_WCS_MAX_PX, BAKEABLE_REGIONS } from '../terrain.mjs';

const cityBbox = (name: string) => {
    const row = (BAKEABLE_REGIONS as Array<{ name: string; source: string; bbox: number[] }>).find((r) => r.name === name);
    if (!row) throw new Error(`no bakeable region '${name}'`);
    return row;
};

describe('§NL-CITY-BBOX (L-12942)', () => {
    it('THE BUG: two Dutch cities no longer resolve to the same subset', () => {
        const ams = nlCityWcsRequest(cityBbox('amsterdam').bbox);
        const rot = nlCityWcsRequest(cityBbox('rotterdam').bbox);
        expect(ams.bboxRD).not.toEqual(rot.bboxRD);
        // Rotterdam is ~60 km south-west: its RD easting must be far lower than Amsterdam's.
        expect(ams.bboxRD[0] - rot.bboxRD[0]).toBeGreaterThan(20000);
    });

    it('every NL bakeable city derives a box that CONTAINS its own centre', () => {
        for (const name of ['amsterdam', 'rotterdam', 'utrecht', 'thehague', 'eindhoven']) {
            const row = cityBbox(name);
            expect(row.source).toBe('nl');
            const { bboxRD } = nlCityWcsRequest(row.bbox);
            expect(bboxRD[2]).toBeGreaterThan(bboxRD[0]);
            expect(bboxRD[3]).toBeGreaterThan(bboxRD[1]);
            // A city spans kilometres, never the 256 m of the old hardcoded proof square.
            expect(bboxRD[2] - bboxRD[0]).toBeGreaterThan(3000);
            expect(bboxRD[3] - bboxRD[1]).toBeGreaterThan(3000);
        }
    });

    it('the scale honours the MEASURED service ceiling: 2048 on the long axis, square pixels', () => {
        const { scaleSize, metresPerPx, bboxRD } = nlCityWcsRequest(cityBbox('amsterdam').bbox);
        expect(Math.max(...scaleSize)).toBe(NL_WCS_MAX_PX);
        const spanX = bboxRD[2] - bboxRD[0], spanY = bboxRD[3] - bboxRD[1];
        // aspect preserved within a pixel: m/px on both axes agree
        expect(Math.abs(spanX / scaleSize[0] - spanY / scaleSize[1])).toBeLessThan(0.05);
        expect(metresPerPx).toBeGreaterThan(1);
        expect(metresPerPx).toBeLessThan(10);   // 4096 px (2.3 m/px) is refused by the service
    });

    it('the URL carries SCALESIZE for a city, and the proof request is byte-identical without it', () => {
        const req = nlCityWcsRequest(cityBbox('utrecht').bbox);
        const cityUrl = dtmWcsUrl(req.bboxRD, { scaleSize: req.scaleSize });
        expect(cityUrl).toContain(`SCALESIZE=x(${req.scaleSize[0]}),y(${req.scaleSize[1]})`);
        const proofUrl = dtmWcsUrl([120900, 486900, 121156, 487156]);
        expect(proofUrl).not.toContain('SCALESIZE');
        expect(proofUrl).toBe(
            'https://service.pdok.nl/rws/ahn/wcs/v1_0?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage'
            + '&COVERAGEID=dtm_05m&FORMAT=image/tiff'
            + '&SUBSET=x(120900,121156)&SUBSET=y(486900,487156)'
            + '&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/28992',
        );
    });
});
