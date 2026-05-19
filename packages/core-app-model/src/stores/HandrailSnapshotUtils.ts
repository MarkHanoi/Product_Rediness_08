import { HandrailData } from './HandrailTypes.js';

export function serializeHandrailSnapshot(handrail: HandrailData): string {
    return JSON.stringify(handrail);
}

export function deserializeHandrailSnapshot(snapshot: string): HandrailData {
    return JSON.parse(snapshot) as HandrailData;
}
