/**
 * Shared XML helpers for the BCF plugin.
 *
 * Uses `fast-xml-parser` for parsing + a hand-rolled deterministic builder
 * for writing (we need byte-stable output for round-trip fixtures, which
 * the upstream builder doesn't fully guarantee across versions).
 */

import { XMLParser } from 'fast-xml-parser';

export const PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

export function escapeXml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Force `value` into an array (XML parsers collapse single-element lists). */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
