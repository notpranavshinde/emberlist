package com.notpr.emberlist

import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.data.model.ViewPreference
import com.notpr.emberlist.parsing.QuickAddParser
import com.notpr.emberlist.ui.screens.resolveTaskDetailParsedResult
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class TaskDetailParserSupportTest {
    private val zone = ZoneId.of("UTC")
    private val parser = QuickAddParser(zone)
    private val now = LocalDateTime.of(2026, 3, 31, 9, 0)

    @Test
    fun existingSpacedProjectIsAssignedAndRemovedFromTitle() {
        val result = resolveTaskDetailParsedResult(
            parser = parser,
            input = "pillows #to buy",
            projects = listOf(project(id = "project-spaced", name = "to buy")),
            sections = emptyList()
        )

        assertEquals("to buy", result.projectName)
        assertEquals("pillows", result.title)
    }

    @Test
    fun existingSpacedProjectAndSectionAreAssigned() {
        val projects = listOf(project(id = "project-spaced", name = "to buy"))
        val sections = listOf(section(id = "section-spaced", projectId = "project-spaced", name = "home decor"))

        val result = resolveTaskDetailParsedResult(
            parser = parser,
            input = "pillows #to buy/home decor",
            projects = projects,
            sections = sections
        )

        assertEquals("to buy", result.projectName)
        assertEquals("home decor", result.sectionName)
        assertEquals("pillows", result.title)
    }

    @Test
    fun missingSpacedProjectFallsBackToSingleTokenParsing() {
        val result = resolveTaskDetailParsedResult(
            parser = parser,
            input = "pillows #to buy",
            projects = listOf(project(id = "project-to", name = "to")),
            sections = emptyList()
        )

        assertEquals("to", result.projectName)
        assertEquals(null, result.sectionName)
    }

    @Test
    fun spacedSectionCanMatchUnderSingleTokenProject() {
        val projects = listOf(project(id = "project-shopping", name = "shopping"))
        val sections = listOf(section(id = "section-spaced", projectId = "project-shopping", name = "home decor"))

        val result = resolveTaskDetailParsedResult(
            parser = parser,
            input = "pillows #shopping/home decor",
            projects = projects,
            sections = sections
        )

        assertEquals("shopping", result.projectName)
        assertEquals("home decor", result.sectionName)
        assertEquals("pillows", result.title)
    }

    private fun project(id: String, name: String) = ProjectEntity(
        id = id,
        name = name,
        color = "#EE6A3C",
        favorite = false,
        order = 0,
        archived = false,
        viewPreference = ViewPreference.LIST,
        createdAt = 0L,
        updatedAt = 0L,
        deletedAt = null
    )

    private fun section(id: String, projectId: String, name: String) = SectionEntity(
        id = id,
        projectId = projectId,
        name = name,
        order = 0,
        createdAt = 0L,
        updatedAt = 0L,
        deletedAt = null
    )
}
