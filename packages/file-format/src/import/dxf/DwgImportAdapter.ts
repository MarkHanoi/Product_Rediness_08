/**
 * DwgImportAdapter.ts — Phase 3, §31
 *
 * Client-side adapter: uploads a .dwg file to the server-side conversion
 * endpoint (POST /api/import/dwg), receives DXF text, and hands off to
 * DxfParser.parseDxfString().
 *
 * CONTRACT (§31 Phase 3 Security Rules):
 *   - APS credentials stay on the server — this module only uploads the file.
 *   - Maximum file size: 50 MB (enforced before upload).
 *   - Conversion timeout: 120 seconds server-side (server returns 504 on timeout).
 *   - Authentication: JWT sent as Authorization header via apiFetch.
 */

import { apiFetch } from '@pryzm/core-app-model';
import { parseDxfString, type DxfDocument } from '../../DxfParser';

const MAX_DWG_BYTES = 50 * 1024 * 1024; // 50 MB

export class DwgConversionError extends Error {
    constructor(
        message: string,
        public readonly statusCode?: number,
    ) {
        super(message);
        this.name = 'DwgConversionError';
    }
}

export interface DwgConversionProgress {
    stage: 'uploading' | 'converting' | 'parsing';
    message: string;
}

/**
 * Convert a .dwg File to a DxfDocument via server-side APS conversion.
 *
 * @param file  The .dwg File object
 * @param onProgress  Optional progress callback
 * @returns Parsed DxfDocument ready for DxfGeometryBuilder
 */
export async function convertDwgFile(
    file: File,
    onProgress?: (p: DwgConversionProgress) => void,
): Promise<DxfDocument> {
    // Client-side size gate (§31 §7.7)
    if (file.size > MAX_DWG_BYTES) {
        throw new DwgConversionError(
            `DWG file is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). ` +
            `Maximum size is 50 MB. Simplify or purge the drawing in AutoCAD before exporting.`,
        );
    }

    onProgress?.({ stage: 'uploading', message: 'Uploading DWG to conversion service…' });

    const formData = new FormData();
    formData.append('file', file, file.name);

    const response = await apiFetch('/api/import/dwg', {
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type — browser sets it with boundary automatically
        headers: {},
    });

    if (!response.ok) {
        if (response.status === 504) {
            throw new DwgConversionError(
                'DWG conversion timed out (>120s). The file may be too complex. ' +
                'Try simplifying the drawing or exporting a specific view.',
                504,
            );
        }
        if (response.status === 503) {
            throw new DwgConversionError(
                'DWG conversion is not configured. ' +
                'Contact your administrator to enable APS conversion (§31 Phase 3).',
                503,
            );
        }
        const errBody = await response.text().catch(() => '');
        throw new DwgConversionError(
            `DWG conversion failed (HTTP ${response.status}): ${errBody}`,
            response.status,
        );
    }

    onProgress?.({ stage: 'converting', message: 'Converting DWG to DXF on server…' });

    const { dxfText } = await response.json() as { dxfText: string };
    if (!dxfText) {
        throw new DwgConversionError('Server returned empty DXF text');
    }

    onProgress?.({ stage: 'parsing', message: 'Parsing DXF…' });

    return parseDxfString(dxfText);
}
