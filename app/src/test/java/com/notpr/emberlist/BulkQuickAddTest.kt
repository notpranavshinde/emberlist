package com.notpr.emberlist

import com.notpr.emberlist.parsing.extractBulkQuickAddLines
import com.notpr.emberlist.parsing.shouldPromptBulkQuickAdd
import com.notpr.emberlist.parsing.stripCommonListMarker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertTrue
import org.junit.Test

class BulkQuickAddTest {
    @Test
    fun extractBulkQuickAddLinesStripsCommonBulletsAndBlankLines() {
        val lines = extractBulkQuickAddLines(
            """
            - buy milk

            * call mom
            [ ] file taxes
            ✅ submit report
            """.trimIndent()
        )

        assertEquals(listOf("buy milk", "call mom", "file taxes", "submit report"), lines)
    }

    @Test
    fun extractBulkQuickAddLinesKeepsNumberedPrefixes() {
        val lines = extractBulkQuickAddLines(
            """
            1. first thing
            2) second thing
            """.trimIndent()
        )

        assertEquals(listOf("1. first thing", "2) second thing"), lines)
    }

    @Test
    fun extractBulkQuickAddLinesReturnsEmptyForBlankInput() {
        assertTrue(extractBulkQuickAddLines(" \n \n").isEmpty())
    }

    @Test
    fun stripCommonListMarkerHandlesCheckboxVariants() {
        assertEquals("ship update", stripCommonListMarker("[x] ship update"))
        assertEquals("ship update", stripCommonListMarker("☐ ship update"))
        assertEquals("ship update", stripCommonListMarker("☑ ship update"))
    }

    @Test
    fun extractBulkQuickAddLinesPreservesPlainLines() {
        assertEquals(
            listOf("plain task", "another task"),
            extractBulkQuickAddLines("plain task\nanother task")
        )
    }

    @Test
    fun shouldPromptBulkQuickAddOnlyForMultipleNonBlankLines() {
        assertFalse(shouldPromptBulkQuickAdd("one task"))
        assertFalse(shouldPromptBulkQuickAdd("one task\n\n"))
        assertTrue(shouldPromptBulkQuickAdd("one task\ntwo task"))
        assertTrue(shouldPromptBulkQuickAdd("- one task\n* two task"))
    }
}
