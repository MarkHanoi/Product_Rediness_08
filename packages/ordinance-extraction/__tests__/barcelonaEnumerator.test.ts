import { describe, expect, it } from 'vitest';
import {
    BarcelonaRpucEnumerator,
    rpucDocumentUrl,
    RPUC_DOCUMENT_ENDPOINT,
} from '../src/adapters/barcelonaEnumerator.js';

describe('rpucDocumentUrl', () => {
    it('builds the RPUC inline-download URL', () => {
        expect(rpucDocumentUrl('73609')).toBe(
            `${RPUC_DOCUMENT_ENDPOINT}?documentId=73609&downloadType=inline&idioma=ca`,
        );
    });
    it('honours the idioma parameter', () => {
        expect(rpucDocumentUrl('89134', 'es')).toContain('idioma=es');
    });
});

describe('BarcelonaRpucEnumerator', () => {
    const enumr = new BarcelonaRpucEnumerator([
        { documentId: '89134', instrument: 'PP Diagonal Mar', vigencia: 'VIGENT', imageRegime: 'clean-laser-scan' },
        { documentId: '73609', instrument: 'PP Can Figuerola', vigencia: 'VIGENT', imageRegime: 'faded-typewriter' },
        { documentId: '72016', instrument: 'Congrés Eucarístic', expDerogated: true },
    ]);

    it('reports the city identity', () => {
        expect(enumr.cityId).toBe('es-ct/08019-barcelona');
        expect(enumr.displayName).toBe('Barcelona (RPUC)');
    });

    it('maps seeds to refs with URLs + Stage-0 metadata', async () => {
        const refs = await enumr.enumerate({ selector: 'clau-11' });
        expect(refs).toHaveLength(3);
        const first = refs[0]!;
        expect(first.documentId).toBe('89134');
        expect(first.fetchUrl).toContain('documentId=89134');
        expect(first.supersession.vigencia).toBe('VIGENT');
        expect(first.imageRegime).toBe('clean-laser-scan');
        expect(refs[2]!.supersession.expDerogated).toBe(true);
    });

    it('respects the query limit', async () => {
        expect(await enumr.enumerate({ selector: 'x', limit: 1 })).toHaveLength(1);
    });
});
