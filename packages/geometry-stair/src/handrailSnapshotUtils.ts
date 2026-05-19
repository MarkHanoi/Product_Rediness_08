import { HandrailData } from '@pryzm/core-app-model/stores';

export function serializeHandrailSnapshot(handrail: HandrailData): string {
    return JSON.stringify(handrail);
}

export function deserializeHandrailSnapshot(snapshot: string): HandrailData {
    return JSON.parse(snapshot) as HandrailData;
}
