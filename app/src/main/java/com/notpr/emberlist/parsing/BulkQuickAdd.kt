package com.notpr.emberlist.parsing

private val commonListMarkerRegex = Regex(
    "^\\s*(?:(?:[-*•◦▪‣]\\s*)?(?:\\[(?: |x|X)\\]|☐|☑|✅)\\s+|(?:[-*•◦▪‣])\\s+)"
)

fun extractBulkQuickAddLines(input: String): List<String> {
    return input
        .lineSequence()
        .map { it.trim() }
        .filter { it.isNotBlank() }
        .map(::stripCommonListMarker)
        .filter { it.isNotBlank() }
        .toList()
}

fun stripCommonListMarker(line: String): String {
    return line.replace(commonListMarkerRegex, "").trim()
}

fun shouldPromptBulkQuickAdd(input: String): Boolean {
    return extractBulkQuickAddLines(input).size > 1
}
