const COMMON_LIST_MARKER_REGEX =
  /^\s*(?:(?:[-*•◦▪‣]\s*)?(?:\[(?: |x|X)\]|☐|☑|✅)\s+|(?:[-*•◦▪‣])\s+)/;

export function stripCommonListMarker(line: string): string {
  return line.replace(COMMON_LIST_MARKER_REGEX, '').trim();
}

export function extractBulkQuickAddLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(stripCommonListMarker)
    .filter(Boolean);
}

export function shouldPromptBulkQuickAdd(input: string): boolean {
  return extractBulkQuickAddLines(input).length > 1;
}
