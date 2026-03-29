package com.notpr.emberlist

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.model.ProjectEntity
import com.notpr.emberlist.data.model.SectionEntity
import kotlinx.coroutines.flow.first
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ProjectSectionDaoQueryTest {
    @Test
    fun observeActiveProjectsExcludesDeletedProjects() = kotlinx.coroutines.runBlocking {
        val db = buildDb()
        val dao = db.projectDao()
        val now = System.currentTimeMillis()
        dao.upsert(project("live", now))
        dao.upsert(project("deleted", now).copy(deletedAt = now))

        val result = dao.observeActiveProjects().first().map { it.id }
        assertEquals(listOf("live"), result)
        db.close()
    }

    @Test
    fun sectionQueriesExcludeDeletedSections() = kotlinx.coroutines.runBlocking {
        val db = buildDb()
        val projectDao = db.projectDao()
        val sectionDao = db.sectionDao()
        val now = System.currentTimeMillis()
        val project = project("p1", now)
        projectDao.upsert(project)
        sectionDao.upsert(section("live", project.id, now))
        sectionDao.upsert(section("deleted", project.id, now).copy(deletedAt = now))

        val scoped = sectionDao.observeSections(project.id).first().map { it.id }
        val all = sectionDao.observeAllSections().first().map { it.id }

        assertEquals(listOf("live"), scoped)
        assertEquals(listOf("live"), all)
        db.close()
    }

    private fun buildDb(): EmberlistDatabase {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        return Room.inMemoryDatabaseBuilder(context, EmberlistDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    private fun project(id: String, now: Long): ProjectEntity = ProjectEntity(
        id = id,
        name = id,
        color = "#EE6A3C",
        favorite = false,
        order = 0,
        archived = false,
        viewPreference = null,
        createdAt = now,
        updatedAt = now
    )

    private fun section(id: String, projectId: String, now: Long): SectionEntity = SectionEntity(
        id = id,
        projectId = projectId,
        name = id,
        order = 0,
        createdAt = now,
        updatedAt = now
    )
}
