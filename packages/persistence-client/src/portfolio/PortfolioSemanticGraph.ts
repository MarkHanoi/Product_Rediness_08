// @migration S90-WIRE — moved from src/portfolio/PortfolioSemanticGraph.ts
// Pure types + lightweight fetch helpers; no src/ imports → L2 persistence-client.
/**
 * PortfolioSemanticGraph.ts — PRYZM Phase J: Client-side portfolio types + fetch helpers
 *
 * Phase:   J-1 (World Model Plan V3 — Portfolio World Model)
 * Contract: docs/00_PRZYM/PRYZM_World_Model_Plan_V3_Complete.md §J-1
 *
 * Types and lightweight fetch utilities used by:
 *   - PortfolioQueryPanel (J-3)
 *   - DataSheetPanel benchmark column (J-2)
 *
 * All API calls route through the server-side endpoints.
 * No direct AI or external API calls from the client.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PortfolioBenchmark {
    buildingType: string;
    roomType: string;
    /** Minimum 10 before benchmark is displayed (privacy threshold). */
    sampleSize: number;
    area_m2: {
        p10: number;
        p25: number;
        median: number;
        p75: number;
        p90: number;
    };
    adjacencyPatterns: Array<{ type: string; frequency: number }>;
    compliancePassRate: number;
    averageRT60?: number;
    averageDaylightFactor?: number;
    /**
     * synthetic: true when the benchmark is derived from industry standards
     * (NHS HTM, NDSS, BB98) rather than aggregated real project data.
     * The UI labels these "Based on industry standards (n=X projects modelled)".
     */
    synthetic: boolean;
}

export interface PortfolioQueryResult {
    benchmark: PortfolioBenchmark | null;
    yourProject: {
        averageArea_m2: number | null;
        compliancePassRate: number | null;
        averageRT60: number | null;
        averageDaylightFactor: number | null;
    };
    comparison: {
        area: 'above-median' | 'above-p25' | 'below-p25' | 'no-data';
        compliance: 'above-median' | 'below-median' | 'no-data';
    };
}

export interface PortfolioNLQueryResponse {
    narrative: string;
    benchmark: PortfolioBenchmark | null;
    error?: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

const BASE = '/api/v1/portfolio';
const AI_BASE = '/api/ai/portfolio';

/**
 * fetchBenchmark — fetches a single building/room type benchmark.
 * Returns null if n < 10 (no data to display).
 */
export async function fetchBenchmark(
    buildingType: string,
    roomType: string,
): Promise<PortfolioBenchmark | null> {
    try {
        const token = localStorage.getItem('bim-auth-token') ?? '';
        const res = await fetch(
            `${BASE}/benchmarks?buildingType=${encodeURIComponent(buildingType)}&roomType=${encodeURIComponent(roomType)}`,
            { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (!res.ok) return null;
        const body = await res.json();
        return body.benchmark ?? null;
    } catch {
        return null;
    }
}

/**
 * fetchAllBenchmarks — fetches the full benchmark catalogue.
 * Used by PortfolioQueryPanel for the structured query dropdowns.
 */
export async function fetchAllBenchmarks(): Promise<PortfolioBenchmark[]> {
    try {
        const token = localStorage.getItem('bim-auth-token') ?? '';
        const res = await fetch(`${BASE}/benchmarks/all`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return [];
        const body = await res.json();
        return body.benchmarks ?? [];
    } catch {
        return [];
    }
}

/**
 * queryPortfolioNL — sends a natural-language portfolio query to the server.
 * Claude receives the query + relevant benchmark data → returns narrative.
 */
export async function queryPortfolioNL(
    query: string,
    buildingType: string,
    roomType: string,
): Promise<PortfolioNLQueryResponse> {
    try {
        const token = localStorage.getItem('bim-auth-token') ?? '';
        const res = await fetch(`${AI_BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ query, buildingType, roomType }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { narrative: '', benchmark: null, error: err.error ?? 'Request failed' };
        }
        return res.json();
    } catch (err: any) {
        return { narrative: '', benchmark: null, error: String(err) };
    }
}

/**
 * computeProjectRoomStats — computes aggregated room stats for the current project,
 * used for "Your project vs portfolio" comparison.
 */
export function computeProjectRoomStats(
    rooms: Array<{ occupancyType: string; computed?: { area?: number } }>,
    roomType: string,
): { averageArea_m2: number | null } {
    const matching = rooms.filter(r => r.occupancyType === roomType);
    if (matching.length === 0) return { averageArea_m2: null };
    const totalArea = matching.reduce((sum, r) => sum + (r.computed?.area ?? 0), 0);
    return { averageArea_m2: totalArea / matching.length };
}
