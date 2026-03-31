package com.notpr.emberlist.ui.screens

import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.SectionEntity
import com.notpr.emberlist.parsing.QuickAddParser
import com.notpr.emberlist.parsing.QuickAddResult

internal data class TaskDetailHashContext(
    val hashIndex: Int,
    val rawAfterHash: String,
    val hasSlash: Boolean,
    val projectQuery: String?,
    val sectionQuery: String?
)

private data class ExistingProjectSectionMatch(
    val projectName: String,
    val sectionName: String?,
    val sanitizedInput: String,
    val projectRange: IntRange,
    val sectionRange: IntRange?
)

private const val PROJECT_PLACEHOLDER = "__taskdetailproject__"
private const val SECTION_PLACEHOLDER = "__taskdetailsection__"

internal fun parseTaskDetailHashContext(text: String): TaskDetailHashContext? {
    val hashIndex = text.lastIndexOf('#')
    if (hashIndex == -1) return null
    val rawAfterHash = text.substring(hashIndex + 1)
    val slashIndex = rawAfterHash.indexOf('/')
    return if (slashIndex == -1) {
        TaskDetailHashContext(
            hashIndex = hashIndex,
            rawAfterHash = rawAfterHash,
            hasSlash = false,
            projectQuery = rawAfterHash.trim().ifBlank { null },
            sectionQuery = null
        )
    } else {
        TaskDetailHashContext(
            hashIndex = hashIndex,
            rawAfterHash = rawAfterHash,
            hasSlash = true,
            projectQuery = rawAfterHash.substring(0, slashIndex).trim().ifBlank { null },
            sectionQuery = rawAfterHash.substring(slashIndex + 1).trim().ifBlank { "" }
        )
    }
}

internal fun resolveTaskDetailParsedResult(
    parser: QuickAddParser,
    input: String,
    projects: List<ProjectEntity>,
    sections: List<SectionEntity>
): QuickAddResult {
    val spacedMatch = findExistingProjectSectionMatch(input, projects, sections) ?: return parser.parse(input)
    val reparsed = parser.parse(spacedMatch.sanitizedInput)
    return reparsed.copy(
        projectName = spacedMatch.projectName,
        sectionName = spacedMatch.sectionName ?: reparsed.sectionName
    )
}

private fun findExistingProjectSectionMatch(
    input: String,
    projects: List<ProjectEntity>,
    sections: List<SectionEntity>
): ExistingProjectSectionMatch? {
    val hashContext = parseTaskDetailHashContext(input) ?: return null
    val activeProjects = projects
        .filter { it.deletedAt == null && !it.archived }
        .sortedByDescending { it.name.length }
    val matchedProject = activeProjects.firstOrNull { project ->
        hashContext.rawAfterHash.startsWith(project.name, ignoreCase = true) &&
            isProjectBoundary(hashContext.rawAfterHash.getOrNull(project.name.length))
    } ?: return null

    val projectRemainder = hashContext.rawAfterHash.substring(matchedProject.name.length)
    val matchingSection = if (projectRemainder.startsWith("/")) {
        val sectionSource = projectRemainder.substring(1)
        sections
            .asSequence()
            .filter { it.deletedAt == null && it.projectId == matchedProject.id }
            .sortedByDescending { it.name.length }
            .firstOrNull { section ->
                sectionSource.startsWith(section.name, ignoreCase = true) &&
                    isSectionBoundary(sectionSource.getOrNull(section.name.length))
            }
    } else {
        null
    }

    val projectNeedsRewrite = matchedProject.name.hasWhitespace()
    val sectionNeedsRewrite = matchingSection?.name?.hasWhitespace() == true
    if (!projectNeedsRewrite && !sectionNeedsRewrite) {
        return null
    }

    val sanitizedAfterHash = buildString {
        append(PROJECT_PLACEHOLDER)
        if (matchingSection != null) {
            append("/")
            if (sectionNeedsRewrite) {
                append(SECTION_PLACEHOLDER)
                append(projectRemainder.substring(1 + matchingSection.name.length))
            } else {
                append(projectRemainder.substring(1))
            }
        } else {
            append(projectRemainder)
        }
    }

    return ExistingProjectSectionMatch(
        projectName = matchedProject.name,
        sectionName = matchingSection?.name,
        sanitizedInput = input.substring(0, hashContext.hashIndex + 1) + sanitizedAfterHash,
        projectRange = hashContext.hashIndex..(hashContext.hashIndex + matchedProject.name.length),
        sectionRange = matchingSection?.let {
            val start = hashContext.hashIndex + matchedProject.name.length + 2
            start..(start + it.name.length - 1)
        }
    )
}

internal fun existingSpacedProjectSectionHighlightRanges(
    text: String,
    projects: List<ProjectEntity>,
    sections: List<SectionEntity>
): List<IntRange> {
    val match = findExistingProjectSectionMatch(text, projects, sections) ?: return emptyList()
    return listOfNotNull(match.projectRange, match.sectionRange)
}

private fun isProjectBoundary(char: Char?): Boolean =
    char == null || char == '/' || char.isWhitespace()

private fun isSectionBoundary(char: Char?): Boolean =
    char == null || char.isWhitespace()

private fun String.hasWhitespace(): Boolean = any(Char::isWhitespace)
